import { SPECIES } from '../../db/seed/species.js';
import { RecordingQueue } from '../../jobs/queue.js';
import request from 'supertest';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp } from '../../app.js';
import { createPool } from '../../db/client.js';
import { prepareTestDatabase } from '../../../test/db.js';
import { mockProviders } from '../../../test/providers.js';
import { testConfig } from '../../../test/testConfig.js';

const pool = createPool(inject('databaseUrl'));
const app = createApp({ config: testConfig(inject('databaseUrl')), pool, logger: pino({ level: 'silent' }), providers: mockProviders(), queue: new RecordingQueue() });

beforeAll(() => prepareTestDatabase(pool));
afterAll(() => pool.end());

type SpeciesItem = { slug: string; common_name: string; category: string; local_names: { language: string; name: string }[]; thumbnail_url: string | null; nursery_count: number };
const listSpecies = async (query: string) =>
  (await request(app).get(`/api/v1/species${query}`).expect(200)).body as { data: SpeciesItem[]; meta: { total: number } };

describe('GET /species (FR-18)', () => {
  it('lists alphabetically with local names, a thumbnail and how many nurseries stock it', async () => {
    const body = await listSpecies('?limit=100');
    expect(body.meta.total).toBe(SPECIES.length);
    const names = body.data.map(s => s.common_name);
    expect(names).toEqual([...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    expect(body.data.find(s => s.slug === 'mvule')).toMatchObject({
      local_names: [{ language: 'Luganda', name: 'Muvule' }],
      thumbnail_url: '/images/sp-mvule.jpg',
      nursery_count: 3,
    });
  });

  it('filters by category, first letter and search text (including local names)', async () => {
    expect((await listSpecies('?category=medicinal')).data.map(s => s.slug)).toEqual(['prunus-africana', 'moringa', 'neem']);
    expect((await listSpecies('?letter=j')).data.map(s => s.slug)).toEqual(['jacaranda', 'jackfruit']);
    expect((await listSpecies('?q=kalitunsi')).data.map(s => s.slug)).toEqual(['eucalyptus-grandis']);
    expect((await listSpecies('?q=Pinus')).data.map(s => s.slug)).toEqual(['caribbean-pine']);
    await request(app).get('/api/v1/species?letter=ab').expect(400);
    await request(app).get('/api/v1/species?category=trees').expect(400);
  });
});

describe('GET /species/:slug (FR-19)', () => {
  it('returns the full profile', async () => {
    const res = await request(app).get('/api/v1/species/mvule').expect(200);
    expect(res.body).toMatchObject({
      data: {
        scientific_name: 'Milicia excelsa',
        category: 'indigenous',
        growth_pace: 'slow',
        height_timeline: [{ years: 1, height_m: 1 }, { years: 5, height_m: 6 }, { years: 15, height_m: 18 }, { years: 40, height_m: 35 }],
        ecological_zones: expect.arrayContaining(['Lake Victoria Crescent']) as string[],
        media: [{ url: '/images/sp-mvule.jpg' }],
        min_price: 1800,
        max_price: 2000,
        reference_price: { ugx: 500, pot_inches: 3 },
      },
    });
    // Bottlebrush isn't on the NFA price list
    expect(((await request(app).get('/api/v1/species/bottlebrush').expect(200)).body as { data: { reference_price: unknown } }).data.reference_price).toBeNull();
  });

  it('404s for unknown slugs and 400s for malformed ones', async () => {
    await request(app).get('/api/v1/species/baobab').expect(404);
    await request(app).get('/api/v1/species/Not_A_Slug').expect(400);
  });
});

describe('GET /species/:slug/nurseries (FR-20)', () => {
  type Row = { name: string; stock: { quantity_available: number; unit_price: number; species: { slug: string } }; road_km?: number };

  it('lists nurseries stocking the species with their stock line', async () => {
    const res = await request(app).get('/api/v1/species/mvule/nurseries').expect(200);
    const body = res.body as { data: Row[]; meta: { species: { slug: string } } };
    expect(body.meta.species.slug).toBe('mvule');
    expect(body.data.map(n => [n.name, n.stock.unit_price])).toEqual([
      ['Katosi Lakeshore Seedlings', 2000],
      ['Kimenyedde Green Nursery', 2000],
      ['Namilyango Tree Growers', 1800],
    ]);
    // Other test files order from the same seeded stock in parallel, and stock only goes down,
    // so each figure lies between the current database value and the seed value.
    const seeded: Record<string, number> = {
      'Katosi Lakeshore Seedlings': 2500,
      'Kimenyedde Green Nursery': 1200,
      'Namilyango Tree Growers': 3500,
    };
    const { rows } = await pool.query<{ name: string; quantity_available: number }>(
      `SELECT n.name, i.quantity_available FROM inventory i JOIN nurseries n ON n.id = i.nursery_id
       JOIN species s ON s.id = i.species_id WHERE s.slug = 'mvule'`,
    );
    for (const n of body.data) {
      const now = rows.find(r => r.name === n.name)?.quantity_available;
      expect(now).toBeDefined();
      expect(n.stock.quantity_available).toBeGreaterThanOrEqual(now ?? Infinity);
      expect(n.stock.quantity_available).toBeLessThanOrEqual(seeded[n.name] ?? 0);
    }
  });

  it('ranks nearest-first by road distance when given the buyer location', async () => {
    const res = await request(app).get('/api/v1/species/mvule/nurseries?lat=0.358&lng=32.757').expect(200);
    const body = res.body as { data: Row[]; meta: { distance_mode: string } };
    expect(body.meta.distance_mode).toBe('road');
    expect(body.data[0]?.name).toBe('Namilyango Tree Growers');
  });

  it('leaves out nurseries whose stock has run out', async () => {
    await pool.query(`UPDATE inventory SET quantity_available = 0 WHERE nursery_id = (SELECT id FROM nurseries WHERE name = 'Kimenyedde Green Nursery') AND species_id = (SELECT id FROM species WHERE slug = 'mvule')`);
    try {
      const res = await request(app).get('/api/v1/species/mvule/nurseries').expect(200);
      expect((res.body as { data: Row[] }).data.map(n => n.name)).not.toContain('Kimenyedde Green Nursery');
    } finally {
      await pool.query(`UPDATE inventory SET quantity_available = 1200 WHERE nursery_id = (SELECT id FROM nurseries WHERE name = 'Kimenyedde Green Nursery') AND species_id = (SELECT id FROM species WHERE slug = 'mvule')`);
    }
  });
});
