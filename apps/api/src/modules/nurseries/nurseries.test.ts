import { RecordingQueue } from '../../jobs/queue.js';
import request from 'supertest';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createApp } from '../../app.js';
import { createPool } from '../../db/client.js';
import { prepareTestDatabase } from '../../../test/db.js';
import { errorOf } from '../../../test/http.js';
import { DownRouting, mockProviders } from '../../../test/providers.js';
import { testConfig } from '../../../test/testConfig.js';
import type { NurseryProfile, NurserySummary } from './nurseries.service.js';

const pool = createPool(inject('databaseUrl'));
const config = testConfig(inject('databaseUrl'));
const logger = pino({ level: 'silent' });
const app = createApp({ config, pool, logger, providers: mockProviders(), queue: new RecordingQueue() });
const appWithoutRouting = createApp({ config, pool, logger, providers: { ...mockProviders(), routing: new DownRouting() }, queue: new RecordingQueue() });

beforeAll(() => prepareTestDatabase(pool));
afterAll(() => pool.end());

type ListBody = { data: NurserySummary[]; meta: { page: number; limit: number; total: number; distance_mode?: string } };
const list = async (query: string, target = app) => (await request(target).get(`/api/v1/nurseries${query}`).expect(200)).body as ListBody;
const names = (body: ListBody) => body.data.map(n => n.name);

const MUKONO_TOWN = { lat: 0.358, lng: 32.757 };

const boundaryId = async (name: string) => {
  // Names like "Central Division" repeat across districts: the pilot's are in Mukono
  const { rows } = await pool.query<{ id: string }>(
    `SELECT b.id FROM admin_boundaries b LEFT JOIN admin_boundaries d ON d.id = b.parent_id
     WHERE b.name = $1 AND (b.level = 'district' OR d.name = 'Mukono')`,
    [name]
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`No boundary ${name}`);
  return id;
};

describe('GET /nurseries', () => {
  it('lists active nurseries alphabetically with pagination meta, for visitors', async () => {
    const body = await list('?limit=5');
    expect(body.meta).toEqual({ page: 1, limit: 5, total: 15 });
    expect(names(body)).toEqual([...names(body)].sort((a, b) => a.localeCompare(b)));
    const page3 = await list('?limit=5&page=3');
    expect(page3.data).toHaveLength(5);
    const pastEnd = await list('?limit=5&page=9');
    expect(pastEnd).toMatchObject({ data: [], meta: { total: 15 } });
  });

  it('returns what the map card needs', async () => {
    const [first] = (await list('?limit=1')).data;
    expect(first).toMatchObject({
      district: { name: 'Mukono' },
      sub_county: { name: expect.any(String) as string },
      location: { lat: expect.any(Number) as number, lng: expect.any(Number) as number },
      has_active_campaign: expect.any(Boolean) as boolean,
      stock_updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as string,
    });
    expect(first?.total_stock).toBeGreaterThan(0);
  });

  it('filters by district and sub-county', async () => {
    expect((await list(`?district_id=${await boundaryId('Mukono')}`)).meta.total).toBe(15);
    const central = await list(`?sub_county_id=${await boundaryId('Central Division')}`);
    expect(names(central)).toEqual(['Mukono Town Nursery']);
    const goma = await list(`?sub_county_id=${await boundaryId('Goma Division')}`);
    expect(names(goma)).toEqual(['Namilyango Tree Growers', 'Seeta Fruit & Tree Seedlings']);
  });

  it('matches species by common, scientific or local name, case-insensitively', async () => {
    const expected = ['Katosi Lakeshore Seedlings', 'Kimenyedde Green Nursery', 'Namilyango Tree Growers'];
    expect(names(await list('?species=mvule'))).toEqual(expected);
    expect(names(await list('?species=MILICIA'))).toEqual(expected);
    expect(names(await list('?species=muvule'))).toEqual(expected);
  });

  it('treats search text literally', async () => {
    expect((await list('?q=%25')).meta.total).toBe(0);
    expect(names(await list('?q=women'))).toEqual(["Mpatta Women's Nursery"]);
    // The same box finds trees: nurseries stocking Mvule, by common or local name
    const byTree = names(await list('?q=mvule'));
    expect(byTree.length).toBeGreaterThan(0);
    expect(names(await list('?q=muvule'))).toEqual(byTree);
    expect(byTree).toEqual(names(await list('?species=mvule')));
  });

  it('filters by seedling category, so one nursery can appear under several', async () => {
    expect(names(await list('?category=coffee'))).toEqual(["Kasawo Farmers' Nursery", 'Kyampisi Agroforestry Group', 'Nabbaale Tree Hub']);
    expect(names(await list('?category=cocoa'))).toEqual(['Kyampisi Agroforestry Group', 'Nabbaale Tree Hub']);
    expect(names(await list('?category=medicinal'))).toContain('Nabbaale Tree Hub');
    await request(app).get('/api/v1/nurseries?category=fruit').expect(400);
  });

  it('filters by active campaign and combines filters', async () => {
    expect(names(await list('?has_campaign=true'))).toEqual(['Katosi Lakeshore Seedlings', 'Nakisunga Community Nursery']);
    expect((await list('?has_campaign=false')).meta.total).toBe(13);
    expect(names(await list('?has_campaign=true&species=grevillea'))).toEqual(['Nakisunga Community Nursery']);
  });

  it('ignores nurseries that are switched off', async () => {
    await pool.query(`UPDATE nurseries SET is_active = false WHERE name = 'Ntunda Hills Nursery'`);
    try {
      expect((await list('')).meta.total).toBe(14);
    } finally {
      await pool.query(`UPDATE nurseries SET is_active = true WHERE name = 'Ntunda Hills Nursery'`);
    }
  });

  it('returns GeoJSON for the map, with the gift-pin flag and stock timestamp (FR-17)', async () => {
    const res = await request(app).get('/api/v1/nurseries?format=geojson').expect(200);
    const collection = (res.body as { data: { type: string; features: { geometry: { type: string; coordinates: number[] }; properties: Record<string, unknown> }[] } }).data;
    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features).toHaveLength(15);
    const katosi = collection.features.find(f => f.properties.name === 'Katosi Lakeshore Seedlings');
    expect(katosi?.geometry).toEqual({ type: 'Point', coordinates: [32.8, 0.205] });
    expect(katosi?.properties).toMatchObject({ has_active_campaign: true });
    expect(katosi?.properties).toHaveProperty('stock_updated_at');
    expect(katosi?.properties).not.toHaveProperty('location');
  });

  it('adds straight-line distance when the buyer location is known', async () => {
    const body = await list(`?lat=${String(MUKONO_TOWN.lat)}&lng=${String(MUKONO_TOWN.lng)}&limit=100`);
    expect(body.data.every(n => typeof n.straight_km === 'number')).toBe(true);
    expect(body.meta.distance_mode).toBe('straight_line');
  });

  it('validates query parameters', async () => {
    const bad = await request(app).get('/api/v1/nurseries?limit=500&district_id=nope&lat=1').expect(400);
    const paths = (errorOf(bad).details as { path: string }[]).map(d => d.path).sort();
    expect(paths).toEqual(['district_id', 'lat', 'limit']);
    await request(app).get('/api/v1/nurseries?sort=nearest').expect(400);
  });
});

describe('GET /nurseries?sort=nearest', () => {
  const nearestQuery = `?sort=nearest&lat=${String(MUKONO_TOWN.lat)}&lng=${String(MUKONO_TOWN.lng)}`;

  it('ranks by road distance and returns both distances', async () => {
    const body = await list(nearestQuery);
    expect(body.meta.distance_mode).toBe('road');
    expect(body.data[0]?.name).toBe('Mukono Town Nursery');
    const road = body.data.map(n => n.road_km ?? Infinity);
    expect(road).toEqual([...road].sort((a, b) => a - b));
    // Mock road distance = spherical distance × 1.3; straight_km is PostGIS's ellipsoidal distance (≈0.5% apart)
    for (const n of body.data.filter(x => (x.straight_km ?? 0) > 0)) {
      const ratio = (n.road_km ?? 0) / (n.straight_km ?? 1);
      expect(ratio).toBeGreaterThan(1.28);
      expect(ratio).toBeLessThan(1.32);
    }
  });

  it('considers at most 20 candidates and respects limit', async () => {
    const body = await list(`${nearestQuery}&limit=3`);
    expect(body.data).toHaveLength(3);
    expect(body.meta.total).toBeLessThanOrEqual(20);
  });

  it('applies filters before ranking', async () => {
    const body = await list(`${nearestQuery}&species=hass`);
    expect(names(body).sort()).toEqual(['Kimenyedde Green Nursery', 'Mukono Town Nursery', 'Nabbaale Tree Hub', 'Seeta Fruit & Tree Seedlings']);
  });

  it('falls back to straight-line order when routing is down', async () => {
    const body = await list(nearestQuery, appWithoutRouting);
    expect(body.meta.distance_mode).toBe('straight_line');
    expect(body.data.every(n => n.road_km === undefined)).toBe(true);
    const straight = body.data.map(n => n.straight_km ?? 0);
    expect(straight).toEqual([...straight].sort((a, b) => a - b));
  });
});

describe('GET /nurseries/:id', () => {
  const katosiId = async () => {
    const [n] = (await list('?q=katosi')).data;
    if (!n) throw new Error('Katosi missing');
    return n.id;
  };

  it('returns the full profile with an inventory linked to the tree library (FR-10, FR-21)', async () => {
    const res = await request(app).get(`/api/v1/nurseries/${await katosiId()}`).expect(200);
    const profile = (res.body as { data: NurseryProfile }).data;
    expect(profile).toMatchObject({ name: 'Katosi Lakeshore Seedlings', type: 'private', certification_status: 'unverified', seed_source: expect.any(String) as string });
    expect(profile.inventory.map(i => i.species.slug)).toEqual(['bottlebrush', 'musizi', 'mutuba', 'mvule', 'nsambya']);
    expect(profile.inventory[0]).toMatchObject({ quantity_available: 400, unit_price: 3000, species: { common_name: 'Bottlebrush', category: 'ornamental' } });
    expect(profile.stock_categories).toEqual(['indigenous', 'ornamental']);
    expect(profile.active_campaigns.map(c => c.title)).toEqual(['Lake Victoria shoreline restoration']);
    expect(profile).not.toHaveProperty('distance_km');
  });

  it('includes road distance from the buyer, falling back to straight line', async () => {
    const id = await katosiId();
    const road = (await request(app).get(`/api/v1/nurseries/${id}?lat=0.358&lng=32.757`).expect(200)).body as { data: NurseryProfile };
    expect(road.data).toMatchObject({ distance_mode: 'road' });
    const straight = (await request(appWithoutRouting).get(`/api/v1/nurseries/${id}?lat=0.358&lng=32.757`).expect(200)).body as { data: NurseryProfile };
    expect(straight.data.distance_mode).toBe('straight_line');
    const ratio = (road.data.distance_km ?? 0) / (straight.data.distance_km ?? 1);
    expect(ratio).toBeGreaterThan(1.28);
    expect(ratio).toBeLessThan(1.32);
  });

  it('404s for unknown or inactive nurseries and 400s for malformed ids', async () => {
    await request(app).get('/api/v1/nurseries/00000000-0000-4000-8000-000000000000').expect(404);
    await request(app).get('/api/v1/nurseries/not-a-uuid').expect(400);
  });
});

describe('GET /nurseries/:id/route', () => {
  it('returns route geometry and steps (FR-11)', async () => {
    const [n] = (await list('?q=katosi')).data;
    const res = await request(app).get(`/api/v1/nurseries/${n?.id ?? ''}/route?lat=0.358&lng=32.757`).expect(200);
    expect(res.body).toMatchObject({
      data: {
        nursery: { name: 'Katosi Lakeshore Seedlings', location: { lat: 0.205, lng: 32.8 } },
        geometry: { type: 'LineString', coordinates: [[32.757, 0.358], [32.8, 0.205]] },
        steps: [{ instruction: 'Head towards the nursery' }, { instruction: 'Arrive at the nursery' }],
      },
    });
  });

  it('needs the buyer location, and reports routing outages as 503', async () => {
    const [n] = (await list('?q=katosi')).data;
    await request(app).get(`/api/v1/nurseries/${n?.id ?? ''}/route`).expect(400);
    const res = await request(appWithoutRouting).get(`/api/v1/nurseries/${n?.id ?? ''}/route?lat=0.358&lng=32.757`).expect(503);
    expect(errorOf(res).code).toBe('provider_unavailable');
  });
});
