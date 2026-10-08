import { describe, expect, it } from 'vitest';
import { ProviderUnavailableError } from '../../lib/errors.js';
import { haversineKm, type LatLng } from '../../lib/geo.js';
import { OpenRouteServiceRouting } from './openRouteService.js';

const from = { lat: 0.3533, lng: 32.7553 };
const to = { lat: 0.2, lng: 32.8 };

interface Call { url: string; init: RequestInit | undefined; body: Record<string, unknown> }

/** A fetch that returns canned responses in turn and records each request. */
const fakeFetch = (responses: { status: number; body: unknown }[], calls: Call[] = []) =>
  ((url: string, init?: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown> });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)] ?? { status: 500, body: null };
    return Promise.resolve(new Response(JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json' } }));
  }) as typeof fetch;

const ors = (responses: { status: number; body: unknown }[], calls?: Call[], now = () => 0) =>
  new OpenRouteServiceRouting({ apiKey: 'test-key', baseUrl: 'https://ors.test/' }, fakeFetch(responses, calls), now, () => Promise.resolve());

describe('OpenRouteServiceRouting.route', () => {
  it('parses distance, duration, geometry and steps, sending the key in the header', async () => {
    const calls: Call[] = [];
    const route = await ors([{ status: 200, body: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[32.7553, 0.3533], [32.78, 0.3], [32.8, 0.2]] },
        properties: {
          summary: { distance: 23456, duration: 2400 },
          segments: [{ steps: [
            { distance: 12000, duration: 1200, type: 11, instruction: 'Head south on Kampala–Jinja Road', name: 'Kampala–Jinja Road' },
            { distance: 11456, duration: 1200, type: 1, instruction: 'Turn right onto Katosi Road', name: 'Katosi Road' },
            { distance: 0, duration: 0, type: 10, instruction: 'Arrive at your destination, on the left', name: '-' },
          ] }],
        },
      }],
    } }], calls).route(from, to);

    expect(calls[0]?.url).toBe('https://ors.test/v2/directions/driving-car/geojson');
    expect(calls[0]?.init?.headers).toMatchObject({ Authorization: 'test-key' });
    expect(calls[0]?.body).toMatchObject({ coordinates: [[32.7553, 0.3533], [32.8, 0.2]] });
    expect(route).toMatchObject({ distanceKm: 23.46, durationMin: 40, geometry: { type: 'LineString' } });
    expect(route.steps.map(s => s.instruction)).toEqual(['Head south on Kampala–Jinja Road', 'Turn right onto Katosi Road', 'Arrive at the nursery']);
    expect(route.steps.map(s => s.road)).toEqual(['Kampala–Jinja Road', 'Katosi Road', null]);
  });

  it('reports no route, quota and network failures as ProviderUnavailableError, without the key', async () => {
    const noRoute = ors([{ status: 404, body: { error: { code: 2010, message: 'Could not find routable point' } } }]).route(from, to);
    await expect(noRoute).rejects.toMatchObject({ message: 'No road route found to this nursery', details: { status: 404, code: 2010 } });
    const busy = ors([{ status: 429, body: { error: 'Rate Limit Exceeded' } }]).route(from, to);
    await expect(busy).rejects.toBeInstanceOf(ProviderUnavailableError);
    const down = new OpenRouteServiceRouting({ apiKey: 'test-key' }, (() => Promise.reject(new Error('ECONNREFUSED'))));
    const err: unknown = await down.route(from, to).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderUnavailableError);
    expect(JSON.stringify(err)).not.toContain('test-key');
  });
});

describe('OpenRouteServiceRouting.table', () => {
  const nurseries = [to, { lat: 0.06, lng: 32.83 }, { lat: 0.5, lng: 32.9 }];

  it('returns kilometres per destination and null for unreachable ones', async () => {
    const calls: Call[] = [];
    const km = await ors([{ status: 200, body: { distances: [[5250, null, 12999]] } }], calls).table(from, nurseries);
    expect(km).toEqual([5.25, null, 13]);
    expect(calls[0]?.url).toBe('https://ors.test/v2/matrix/driving-car');
    expect(calls[0]?.body).toMatchObject({ sources: [0], destinations: [1, 2, 3], metrics: ['distance'] });
  });

  it('caches the same question for 6 hours', async () => {
    const calls: Call[] = [];
    let clock = 0;
    const provider = ors([{ status: 200, body: { distances: [[5250, 7000, 12999]] } }], calls, () => clock);
    await provider.table(from, nurseries);
    await provider.table(from, nurseries);
    expect(calls).toHaveLength(1);
    clock = 6 * 60 * 60_000 + 1;
    await provider.table(from, nurseries);
    expect(calls).toHaveLength(2);
  });

  it('rejects a malformed answer', async () => {
    await expect(ors([{ status: 200, body: { distances: [[1]] } }]).table(from, nurseries)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe('OpenRouteServiceRouting.isochrone', () => {
  it('returns the outline of each service area, within its straight-line reach', async () => {
    const ring = (km: number): [number, number][] => [0, 90, 180, 270, 0].map(deg => {
      const rad = (deg * Math.PI) / 180;
      return [from.lng + (km / 111) * 0.9 * Math.cos(rad), from.lat + (km / 111) * 0.9 * Math.sin(rad)];
    });
    const calls: Call[] = [];
    const areas = await ors([{ status: 200, body: { type: 'FeatureCollection', features: [5, 10].map(km => ({
      type: 'Feature', properties: { value: km * 1000 }, geometry: { type: 'Polygon', coordinates: [ring(km)] },
    })) } }], calls).isochrone(from, [5, 10]);

    expect(calls[0]?.body).toMatchObject({ range: [5000, 10000], range_type: 'distance' });
    expect(areas.map(a => a.km)).toEqual([5, 10]);
    for (const a of areas) {
      expect(a.points[0]).toEqual(from);
      expect(a.points.length).toBe(6);
      expect(a.points.every((p: LatLng) => haversineKm(from, p) <= a.km)).toBe(true);
    }
  });

  it('spaces calls to stay within the per-minute limit', async () => {
    const waits: number[] = [];
    let clock = 0;
    const provider = new OpenRouteServiceRouting(
      { apiKey: 'k' },
      fakeFetch([{ status: 200, body: { features: [] } }]),
      () => clock,
      ms => { waits.push(ms); clock += ms; return Promise.resolve(); }
    );
    await provider.isochrone(from, [5]);
    await provider.isochrone(from, [5]);
    expect(waits).toEqual([3100]);
  });
});
