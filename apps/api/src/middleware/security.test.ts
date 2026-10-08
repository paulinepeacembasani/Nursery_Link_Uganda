import request from 'supertest';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../db/client.js';
import { RecordingQueue } from '../jobs/queue.js';
import { bearer, newBuyer } from '../../test/auth.js';
import { prepareTestDatabase } from '../../test/db.js';
import { errorOf } from '../../test/http.js';
import { mockProviders } from '../../test/providers.js';
import { testConfig } from '../../test/testConfig.js';

const pool = createPool(inject('databaseUrl'));
const providers = mockProviders();
/** Real production limits (RATE_LIMIT_SCALE=1); each test that exhausts a limit builds its own app. */
const makeApp = (overrides: NodeJS.ProcessEnv = {}) =>
  createApp({
    config: testConfig(inject('databaseUrl'), { RATE_LIMIT_SCALE: '1', ...overrides }),
    pool,
    logger: pino({ level: 'silent' }),
    providers,
    queue: new RecordingQueue(),
  });
const app = makeApp();

beforeAll(() => prepareTestDatabase(pool));
afterAll(() => pool.end());

describe('security headers', () => {
  it('locks down API responses', async () => {
    const res = await request(app).get('/api/v1/news').expect(200);
    expect(res.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none';base-uri 'none';form-action 'none'");
    expect(res.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
    });
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });
});

describe('CORS', () => {
  it('answers only the configured web and admin origins', async () => {
    const allowed = await request(app).get('/api/v1/news').set('Origin', 'http://localhost:5174').expect(200);
    expect(allowed.headers).toMatchObject({ 'access-control-allow-origin': 'http://localhost:5174', 'access-control-allow-credentials': 'true' });
    const other = await request(app).get('/api/v1/news').set('Origin', 'https://evil.example').expect(200);
    expect(other.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('pre-flights with an explicit method and header list', async () => {
    const res = await request(app)
      .options('/api/v1/orders')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization')
      .expect(204);
    expect(res.headers['access-control-allow-methods']).toBe('GET,POST,PUT,PATCH,DELETE');
    expect(res.headers['access-control-allow-headers']).toBe('Content-Type,Authorization,X-Request-Id,X-Client');
    expect(res.headers['access-control-max-age']).toBe('600');
  });
});

describe('input limits', () => {
  it('rejects oversized and malformed bodies and URLs', async () => {
    const big = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send(`{"identifier":"${'x'.repeat(110_000)}"}`).expect(413);
    expect(errorOf(big).code).toBe('payload_too_large');
    const broken = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"identifier":').expect(400);
    expect(errorOf(broken).code).toBe('invalid_json');
    const longUrl = await request(app).get(`/api/v1/news?category=${'a'.repeat(2100)}`).expect(400);
    expect(errorOf(longUrl).message).toMatch(/longer than 2048/);
  });

  it('caps the inbound SMS form body at 10 kB', async () => {
    await request(app).post('/api/v1/webhooks/sms/inbound').type('form').send({ from: '+256700100101', text: 'x'.repeat(11_000) }).expect(413);
  });
});

describe('rate limits', () => {
  it('limits visitors per IP overall, and X-Forwarded-For cannot be used to dodge it', async () => {
    const limited = makeApp();
    for (let i = 0; i < 300; i++) await request(limited).get('/api/v1/news').expect(200);
    const blocked = await request(limited).get('/api/v1/news').expect(429);
    expect(errorOf(blocked).code).toBe('rate_limited');
    expect(blocked.headers).toHaveProperty('ratelimit');
    // TRUST_PROXY=0: a forged forwarding header is ignored
    await request(limited).get('/api/v1/news').set('X-Forwarded-For', '203.0.113.9').expect(429);
    // Health checks and provider callbacks are not caught by the visitor limit
    await request(limited).get('/api/v1/health').expect(200);
  });

  it('trusts X-Forwarded-For only from the configured number of proxies', async () => {
    const proxied = makeApp({ TRUST_PROXY: '1' });
    for (let i = 0; i < 300; i++) await request(proxied).get('/api/v1/news').set('X-Forwarded-For', '203.0.113.1').expect(200);
    await request(proxied).get('/api/v1/news').set('X-Forwarded-For', '203.0.113.1').expect(429);
    await request(proxied).get('/api/v1/news').set('X-Forwarded-For', '203.0.113.2').expect(200);
  });

  it('limits session restores per session, not per IP (many people share one mobile-network IP)', async () => {
    const limited = makeApp();
    const restore = (token: string) => request(limited).post('/api/v1/auth/refresh').set('Cookie', `nl_refresh=${token}`);
    for (let i = 0; i < 60; i++) await restore('session-a').expect(401);
    await restore('session-a').expect(429);
    // Someone else behind the same address still gets their own answer
    await restore('session-b').expect(401);
  });

  it('limits quotes per buyer account', async () => {
    const limited = makeApp();
    const buyer = bearer((await newBuyer(limited, providers.sms)).token);
    const body = { nursery_id: '00000000-0000-4000-8000-000000000000', items: [{ inventory_id: '00000000-0000-4000-8000-000000000000', quantity: 1 }], delivery_type: 'self_pickup' };
    for (let i = 0; i < 30; i++) await request(limited).post('/api/v1/orders/quote').set(buyer).send(body).expect(404);
    await request(limited).post('/api/v1/orders/quote').set(buyer).send(body).expect(429);
    // Another buyer behind the same address is unaffected
    const other = bearer((await newBuyer(limited, providers.sms)).token);
    await request(limited).post('/api/v1/orders/quote').set(other).send(body).expect(404);
  });
});
