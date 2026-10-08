import { RecordingQueue } from '../../jobs/queue.js';
import request from 'supertest';
import { pino } from 'pino';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createApp } from '../../app.js';
import { createPool } from '../../db/client.js';
import { testConfig } from '../../../test/testConfig.js';
import { mockProviders } from '../../../test/providers.js';
import { paymentProviders } from '../../providers/index.js';
import { MockPayment } from '../../providers/payment/mockPayment.js';
import { dataOf, errorOf } from '../../../test/http.js';

const logger = pino({ level: 'silent' });

describe('GET /api/v1/health', () => {
  const pool = createPool(inject('databaseUrl'));
  afterAll(() => pool.end());

  it('reports ok when the database is reachable', async () => {
    const app = createApp({ config: testConfig(inject('databaseUrl')), pool, logger, providers: mockProviders(), queue: new RecordingQueue() });
    const res = await request(app).get('/api/v1/health').expect(200);
    expect(dataOf(res)).toMatchObject({
      status: 'ok',
      db: 'ok',
      providers: { payment: 'mock', sms: 'mock', routing: 'mock', email: 'mock' },
      payment_methods: { mtn_momo: true, airtel_money: true },
    });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('reports the deployed commit when the host provides it', async () => {
    const plain = createApp({ config: testConfig(inject('databaseUrl')), pool, logger, providers: mockProviders(), queue: new RecordingQueue() });
    expect(dataOf(await request(plain).get('/api/v1/health').expect(200))).toMatchObject({ commit: null });
    const deployed = createApp({ config: { ...testConfig(inject('databaseUrl')), RENDER_GIT_COMMIT: 'abc1234' }, pool, logger, providers: mockProviders(), queue: new RecordingQueue() });
    expect(dataOf(await request(deployed).get('/api/v1/health').expect(200))).toMatchObject({ commit: 'abc1234' });
  });

  it('tells the checkout that Airtel Money is unavailable in live mode', async () => {
    const live = { ...mockProviders(), payments: paymentProviders('live', new MockPayment(), { mtn_momo: new MockPayment() }) };
    const app = createApp({ config: testConfig(inject('databaseUrl')), pool, logger, providers: live, queue: new RecordingQueue() });
    expect(dataOf(await request(app).get('/api/v1/health').expect(200))).toMatchObject({ payment_methods: { mtn_momo: true, airtel_money: false } });
  });

  it('reports 503 when the database is down', async () => {
    // Nothing listens on port 1, so every query fails
    const deadPool = createPool('postgres://nobody:nothing@127.0.0.1:1/none');
    const app = createApp({ config: testConfig('postgres://nobody:nothing@127.0.0.1:1/none'), pool: deadPool, logger, providers: mockProviders(), queue: new RecordingQueue() });
    const res = await request(app).get('/api/v1/health').expect(503);
    expect(dataOf(res)).toMatchObject({ status: 'degraded', db: 'down' });
    await deadPool.end();
  });

  it('keeps unknown API paths inside the error envelope', async () => {
    const app = createApp({ config: testConfig(inject('databaseUrl')), pool, logger, providers: mockProviders(), queue: new RecordingQueue() });
    const res = await request(app).get('/api/v1/nothing-here').expect(404);
    expect(errorOf(res)).toEqual({ code: 'not_found', message: 'No such endpoint' });
  });

  it('sends security headers and honours the CORS allowlist', async () => {
    const app = createApp({ config: testConfig(inject('databaseUrl')), pool, logger, providers: mockProviders(), queue: new RecordingQueue() });
    const allowed = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5174');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5174');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    const blocked = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
