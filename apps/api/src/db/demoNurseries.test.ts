import pg from 'pg';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { RecordingQueue } from '../jobs/queue.js';
import { createApp } from '../app.js';
import { createPool } from './client.js';
import { loadDemoNurseries, readDemoNurseries, removeDemoNurseries } from './demoNurseries.js';
import { SPECIES } from './seed/species.js';
import { bearer, newBuyer } from '../../test/auth.js';
import { prepareTestDatabase } from '../../test/db.js';
import { mockProviders } from '../../test/providers.js';
import { testConfig } from '../../test/testConfig.js';

// 1,500 nurseries would upset tests that count the shared database's nurseries, so this file gets
// a database of its own in the same container
const DB = `nl_demo_${String(process.pid)}`;
const shared = new URL(inject('databaseUrl'));
const ownUrl = Object.assign(new URL(shared.href), { pathname: `/${DB}` }).href;
let admin: pg.Client;
let pool: pg.Pool;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  admin = new pg.Client({ connectionString: shared.href });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  pool = createPool(ownUrl);
  await prepareTestDatabase(pool);
  app = createApp({ config: testConfig(ownUrl), pool, logger: pino({ level: 'silent' }), providers: mockProviders(), queue: new RecordingQueue() });
}, 120_000);

afterAll(async () => {
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.end();
});

describe('demo nursery data file', () => {
  const nurseries = readDemoNurseries();

  it('has no contact details, and only trees the library knows', () => {
    const text = JSON.stringify(nurseries);
    expect(text).not.toMatch(/\+256|@|gmail|WWF|ECOTRUST|Ministry/);
    const slugs = new Set(SPECIES.map(s => s.slug));
    expect(nurseries.flatMap(n => n.stock.map(([slug]) => slug)).filter(s => !slugs.has(s))).toEqual([]);
    expect(nurseries.every(n => n.stock.every(([, qty, price]) => qty > 0 && price > 0))).toBe(true);
  });

  it('adds coffee and cocoa only in districts that grow them', () => {
    const where = (slug: string) => new Set(nurseries.filter(n => n.stock.some(([s]) => s === slug)).map(n => n.district));
    expect(where('arabica-coffee')).toContain('Kapchorwa');
    expect(where('arabica-coffee')).not.toContain('Gulu');
    expect(where('cocoa')).toContain('Bundibugyo');
    expect(where('robusta-coffee')).toContain('Mukono');
  });
});

describe('loadDemoNurseries', () => {
  it('places every sample nursery inside the district it names, with its stock', async () => {
    const summary = await loadDemoNurseries(pool);
    expect(summary).toMatchObject({ nurseries: 1500, skipped_outside_boundaries: 0 });

    const { rows: [check] } = await pool.query<{ total: number; wrong_district: number; stock: number }>(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE d.name <> split_part(n.name, ' Environmental Hub', 1))::int AS wrong_district,
             (SELECT count(*)::int FROM inventory i JOIN nurseries x ON x.id = i.nursery_id WHERE x.is_demo) AS stock
      FROM nurseries n JOIN admin_boundaries d ON d.id = n.district_id WHERE n.is_demo`);
    expect(check).toEqual({ total: 1500, wrong_district: 0, stock: 5631 });
  });

  it('shows them to visitors as sample nurseries without a phone number', async () => {
    const { rows: [one] } = await pool.query<{ id: string }>(`SELECT id FROM nurseries WHERE external_ref = 'NUR-UG-0001'`);
    const res = await request(app).get(`/api/v1/nurseries/${one?.id ?? ''}`).expect(200);
    expect((res.body as { data: Record<string, unknown> }).data).toMatchObject({ name: 'Mukono Environmental Hub Nursery 1', is_demo: true, contact_phone: null });

    const seeded = (await request(app).get('/api/v1/nurseries?q=Katosi').expect(200)).body as { data: { is_demo: boolean; contact_phone: string | null }[] };
    expect(seeded.data[0]).toMatchObject({ is_demo: false, contact_phone: expect.stringMatching(/^\+256/) as unknown });
  });

  it('refreshes the same rows when run again, and can remove them all', async () => {
    await loadDemoNurseries(pool);
    const count = async () => (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM nurseries WHERE is_demo')).rows[0]?.n;
    expect(await count()).toBe(1500);
    await removeDemoNurseries(pool);
    expect(await count()).toBe(0);
    const { rows } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'demo.load' AND entity = 'nurseries'`);
    expect(rows[0]?.n).toBe(3);
  });
});

describe('orders from sample nurseries', () => {
  const LIVE = {
    PAYMENT_PROVIDER_MODE: 'live',
    MTN_COLLECTION_SUBSCRIPTION_KEY: 'c', MTN_COLLECTION_API_USER: 'u', MTN_COLLECTION_API_KEY: 'k',
    MTN_DISBURSEMENT_SUBSCRIPTION_KEY: 'd', MTN_DISBURSEMENT_API_USER: 'u', MTN_DISBURSEMENT_API_KEY: 'k',
  };
  const appWith = (overrides: Record<string, string>, queue = new RecordingQueue()) => {
    const providers = mockProviders();
    return { app: createApp({ config: testConfig(ownUrl, overrides), pool, logger: pino({ level: 'silent' }), providers, queue }), providers, queue };
  };
  const demoLine = async () => {
    await loadDemoNurseries(pool);
    const { rows: [line] } = await pool.query<{ inventory_id: string; nursery_id: string }>(`
      SELECT i.id AS inventory_id, i.nursery_id FROM inventory i JOIN nurseries n ON n.id = i.nursery_id
      WHERE n.external_ref = 'NUR-UG-0001' ORDER BY i.id LIMIT 1`);
    if (!line) throw new Error('No demo stock');
    return line;
  };
  const quote = (a: ReturnType<typeof createApp>, headers: Record<string, string>, line: { inventory_id: string; nursery_id: string }) =>
    request(a).post('/api/v1/orders/quote').set(headers)
      .send({ nursery_id: line.nursery_id, items: [{ inventory_id: line.inventory_id, quantity: 10 }], delivery_type: 'self_pickup' });

  it('refuses them while payments are live', async () => {
    const line = await demoLine();
    const live = appWith(LIVE);
    const buyer = bearer((await newBuyer(live.app, live.providers.sms)).token);
    const res = await quote(live.app, buyer, line).expect(409);
    expect((res.body as { error: { message: string } }).error.message).toMatch(/sample nursery/);
  });

  it('takes trial orders, but never texts the sample nursery', async () => {
    const line = await demoLine();
    const trial = appWith({ PAYMENTS: 'off' });
    const buyer = await newBuyer(trial.app, trial.providers.sms);
    const q = (await quote(trial.app, bearer(buyer.token), line).expect(200)).body as { data: { quote_token: string } };
    await request(trial.app).post('/api/v1/orders').set(bearer(buyer.token)).send({ quote_token: q.data.quote_token }).expect(201);
    const texted = trial.queue.jobs.filter(j => j.name === 'sms-send').map(j => (j.data as { to: string }).to);
    expect(texted).toEqual([buyer.phone]);
  });
});
