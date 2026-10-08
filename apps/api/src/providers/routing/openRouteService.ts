import { z } from 'zod';
import { ProviderUnavailableError } from '../../lib/errors.js';
import { haversineKm, roundKm, type LatLng } from '../../lib/geo.js';
import type { IsochroneSamples, RouteResult, RouteStep, RoutingProvider } from './routing.js';

// OpenRouteService API v2 (car profile, OpenStreetMap roads): https://openrouteservice.org/dev/#/api-docs
// The free plan allows about 2,000 routes, 500 distance tables and 500 isochrones a day, 20–40 a
// minute. Distance tables are cached, so the same buyer browsing nurseries costs one call.

const PROFILE = 'driving-car';

const stepSchema = z.object({
  distance: z.number(),
  duration: z.number(),
  type: z.number(),
  instruction: z.string(),
  name: z.string().optional(),
});
const directionsSchema = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({ type: z.literal('LineString'), coordinates: z.array(z.tuple([z.number(), z.number()])) }),
        properties: z.object({
          // Empty when origin and destination are the same point
          summary: z.object({ distance: z.number().optional(), duration: z.number().optional() }),
          segments: z.array(z.object({ steps: z.array(stepSchema) })).default([]),
        }),
      })
    )
    .min(1),
});
const matrixSchema = z.object({ distances: z.array(z.array(z.number().nullable())).min(1) });
const isochroneSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({ value: z.number() }),
      geometry: z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))) }),
    })
  ),
});
const errorSchema = z.object({ error: z.union([z.string(), z.object({ code: z.number().optional(), message: z.string().optional() })]) });

/** ORS step types 10 (goal) and 11 (depart); unnamed roads are "-". */
const GOAL = 10;
const roadName = (name: string | undefined) => (name && name !== '-' ? name : null);

const lngLat = (p: LatLng): [number, number] => [p.lng, p.lat];

/** Distance tables are cached by rounded points (about 10 m), for 6 hours, at most 2,000 entries. */
const CACHE_TTL_MS = 6 * 60 * 60_000;
const CACHE_MAX = 2000;
const cacheKey = (from: LatLng, to: LatLng[]) => [from, ...to].map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';');

/** The free plan allows 20 isochrones a minute; Shadow runs ask for one per nursery. */
const ISOCHRONE_GAP_MS = 3100;

type Fetch = typeof fetch;
type Sleep = (ms: number) => Promise<void>;

export class OpenRouteServiceRouting implements RoutingProvider {
  readonly name = 'openrouteservice' as const;
  private readonly tableCache = new Map<string, { at: number; km: (number | null)[] }>();
  private nextIsochroneAt = 0;

  constructor(
    private readonly options: { apiKey: string; baseUrl?: string; timeoutMs?: number },
    private readonly fetchImpl: Fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly sleep: Sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  ) {}

  private async post(path: string, body: unknown): Promise<unknown> {
    const base = (this.options.baseUrl ?? 'https://api.openrouteservice.org').replace(/\/$/, '');
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: { Authorization: this.options.apiKey, 'Content-Type': 'application/json', Accept: 'application/json, application/geo+json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 8000),
      });
    } catch (err) {
      throw new ProviderUnavailableError('Routing service unreachable', { cause: String(err) });
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      // Never pass the key or the raw body on; the status and ORS's error code are enough to debug
      const parsed = errorSchema.safeParse(json);
      const code = parsed.success && typeof parsed.data.error === 'object' ? parsed.data.error.code : undefined;
      const message =
        res.status === 429 ? 'Routing service is busy (daily or per-minute limit reached)'
        : res.status === 404 ? 'No road route found to this nursery'
        : 'Routing service error';
      throw new ProviderUnavailableError(message, { status: res.status, ...(code !== undefined ? { code } : {}) });
    }
    return json;
  }

  async route(from: LatLng, to: LatLng): Promise<RouteResult> {
    const parsed = directionsSchema.safeParse(
      await this.post(`/v2/directions/${PROFILE}/geojson`, { coordinates: [lngLat(from), lngLat(to)], instructions: true, units: 'm', language: 'en' })
    );
    const feature = parsed.success ? parsed.data.features[0] : undefined;
    if (!feature) throw new ProviderUnavailableError('No road route found to this nursery');
    const steps: RouteStep[] = feature.properties.segments.flatMap(s => s.steps).map(step => ({
      instruction: step.type === GOAL ? 'Arrive at the nursery' : step.instruction,
      road: roadName(step.name),
      distance_m: Math.round(step.distance),
      duration_s: Math.round(step.duration),
    }));
    return {
      distanceKm: roundKm((feature.properties.summary.distance ?? 0) / 1000),
      durationMin: Math.round((feature.properties.summary.duration ?? 0) / 60),
      geometry: { type: 'LineString', coordinates: feature.geometry.coordinates },
      steps,
    };
  }

  async table(from: LatLng, to: LatLng[]): Promise<(number | null)[]> {
    if (to.length === 0) return [];
    const key = cacheKey(from, to);
    const hit = this.tableCache.get(key);
    if (hit && this.now() - hit.at < CACHE_TTL_MS) return hit.km;

    const parsed = matrixSchema.safeParse(
      await this.post(`/v2/matrix/${PROFILE}`, {
        locations: [lngLat(from), ...to.map(lngLat)],
        sources: [0],
        destinations: to.map((_, i) => i + 1),
        metrics: ['distance'],
        units: 'm',
      })
    );
    const row = parsed.success ? parsed.data.distances[0] : undefined;
    if (!row || row.length !== to.length) throw new ProviderUnavailableError('Routing service could not compute distances');
    const km = row.map(metres => (metres === null ? null : roundKm(metres / 1000)));

    if (this.tableCache.size >= CACHE_MAX) {
      const oldest = this.tableCache.keys().next().value;
      if (oldest !== undefined) this.tableCache.delete(oldest);
    }
    this.tableCache.set(key, { at: this.now(), km });
    return km;
  }

  /**
   * ORS draws the service areas itself (polygons by road distance); their outline points are
   * returned as the samples, from which the caller draws the same shape with a concave hull.
   * Calls are spaced to stay within the free plan's per-minute limit.
   */
  async isochrone(origin: LatLng, kms: number[]): Promise<IsochroneSamples[]> {
    const wait = this.nextIsochroneAt - this.now();
    if (wait > 0) await this.sleep(wait);
    this.nextIsochroneAt = this.now() + ISOCHRONE_GAP_MS;

    const parsed = isochroneSchema.safeParse(
      await this.post(`/v2/isochrones/${PROFILE}`, { locations: [lngLat(origin)], range: kms.map(km => km * 1000), range_type: 'distance', units: 'm' })
    );
    if (!parsed.success) throw new ProviderUnavailableError('Routing service could not compute service areas');
    return kms.map(km => {
      const area = parsed.data.features.find(f => Math.abs(f.properties.value - km * 1000) < 1);
      const ring = area?.geometry.coordinates[0] ?? [];
      // Never further than the distance itself in a straight line, whatever the polygon smoothing did
      const points = ring.map(([lng, lat]) => ({ lat, lng })).filter(p => haversineKm(origin, p) <= km);
      return { km, points: [origin, ...points] };
    });
  }
}
