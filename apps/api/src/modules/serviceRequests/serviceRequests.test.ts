import request from 'supertest';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { AdminServiceRequestDto, ServiceRequestDtoShape } from '@nurserylink/shared';
import { createApp } from '../../app.js';
import { createPool } from '../../db/client.js';
import { RecordingQueue } from '../../jobs/queue.js';
import { adminToken, bearer, newBuyer } from '../../../test/auth.js';
import { prepareTestDatabase } from '../../../test/db.js';
import { errorOf } from '../../../test/http.js';
import { mockProviders } from '../../../test/providers.js';
import { testConfig } from '../../../test/testConfig.js';

const pool = createPool(inject('databaseUrl'));
const providers = mockProviders();
const app = createApp({ config: testConfig(inject('databaseUrl')), pool, logger: pino({ level: 'silent' }), providers, queue: new RecordingQueue() });

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed view of a response body in tests
const data = <T>(res: request.Response) => (res.body as { data: T }).data;

let admin: Record<string, string>;
const userIds: string[] = [];

const buyer = async () => {
  const b = await newBuyer(app, providers.sms);
  userIds.push(b.userId);
  return { headers: bearer(b.token), phone: b.phone, id: b.userId };
};

const ask = (headers: Record<string, string>, body: object = { service: 'planting', location: 'Seeta, Mukono', land_acres: 2.5, notes: '  Near the school  ' }) =>
  request(app).post('/api/v1/service-requests').set(headers).send(body);

beforeAll(async () => {
  await prepareTestDatabase(pool);
  admin = bearer(await adminToken(app));
});

afterAll(async () => {
  await pool.query('DELETE FROM service_requests WHERE user_id = ANY($1::uuid[])', [userIds]);
  await pool.end();
});

describe('POST /service-requests', () => {
  it('records a request for the signed-in buyer, who sees it in their list', async () => {
    const b = await buyer();
    const created = data<ServiceRequestDtoShape>(await ask(b.headers).expect(201));
    expect(created).toMatchObject({ service: 'planting', location: 'Seeta, Mukono', land_acres: 2.5, notes: 'Near the school', status: 'new', admin_note: null });
    expect(created).not.toHaveProperty('requester');
    const mine = data<ServiceRequestDtoShape[]>(await request(app).get('/api/v1/service-requests/me').set(b.headers).expect(200));
    expect(mine.map(r => r.id)).toEqual([created.id]);
  });

  it('needs a buyer account and a valid body', async () => {
    await ask({}).expect(401);
    await ask(admin).expect(403);
    const b = await buyer();
    await ask(b.headers, { service: 'gardening', location: 'Seeta' }).expect(400);
    await ask(b.headers, { service: 'planting', location: 'x' }).expect(400);
    await ask(b.headers, { service: 'planting', location: 'Seeta', land_acres: 0 }).expect(400);
  });
});

describe('admin service requests', () => {
  it('lists requests with the requester and moves them on, with an audit entry', async () => {
    const b = await buyer();
    const created = data<ServiceRequestDtoShape>(await ask(b.headers, { service: 'watering', location: 'Goma, Mukono' }).expect(201));

    const list = data<AdminServiceRequestDto[]>(await request(app).get('/api/v1/admin/service-requests?status=new&service=watering').set(admin).expect(200));
    const row = list.find(r => r.id === created.id);
    expect(row?.requester).toMatchObject({ id: b.id, phone: b.phone });

    const contacted = data<AdminServiceRequestDto>(
      await request(app).put(`/api/v1/admin/service-requests/${created.id}`).set(admin).send({ status: 'contacted', note: 'Visit on Monday' }).expect(200)
    );
    expect(contacted).toMatchObject({ status: 'contacted', admin_note: 'Visit on Monday' });
    expect(contacted.handled_by).not.toBeNull();

    const audit = await pool.query<{ action: string }>("SELECT action FROM audit_log WHERE entity = 'service_request' AND entity_id = $1", [created.id]);
    expect(audit.rows.map(r => r.action)).toEqual(['service_request.contacted']);

    // The buyer sees the team's note
    const mine = data<ServiceRequestDtoShape[]>(await request(app).get('/api/v1/service-requests/me').set(b.headers).expect(200));
    expect(mine[0]).toMatchObject({ status: 'contacted', admin_note: 'Visit on Monday' });
  });

  it('refuses moves that are not allowed', async () => {
    const b = await buyer();
    const created = data<ServiceRequestDtoShape>(await ask(b.headers).expect(201));
    const put = (status: string) => request(app).put(`/api/v1/admin/service-requests/${created.id}`).set(admin).send({ status });
    await put('done').expect(200);
    expect(errorOf(await put('scheduled').expect(409)).message).toMatch(/done cannot be marked scheduled/);
    await put('new').expect(400);
    await request(app).put(`/api/v1/admin/service-requests/${created.id}`).set(b.headers).send({ status: 'done' }).expect(403);
  });
});
