import request from 'supertest';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { AdminFeedbackDto, FeedbackReceiptDto } from '@nurserylink/shared';
import { createApp } from '../../app.js';
import { createPool } from '../../db/client.js';
import { RecordingQueue } from '../../jobs/queue.js';
import { adminToken, bearer, newBuyer } from '../../../test/auth.js';
import { prepareTestDatabase } from '../../../test/db.js';
import { mockProviders } from '../../../test/providers.js';
import { testConfig } from '../../../test/testConfig.js';

const pool = createPool(inject('databaseUrl'));
const providers = mockProviders();
const config = testConfig(inject('databaseUrl'));
const app = createApp({ config, pool, logger: pino({ level: 'silent' }), providers, queue: new RecordingQueue() });

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed view of a response body in tests
const data = <T>(res: request.Response) => (res.body as { data: T }).data;

let admin: Record<string, string>;
const ids: string[] = [];

const send = async (body: object, headers: Record<string, string> = {}) => {
  const res = await request(app).post('/api/v1/feedback').set(headers).send(body);
  if (res.status === 201) ids.push(data<FeedbackReceiptDto>(res).id);
  return res;
};

beforeAll(async () => {
  await prepareTestDatabase(pool);
  admin = bearer(await adminToken(app));
});

afterAll(async () => {
  await pool.query('DELETE FROM feedback WHERE id = ANY($1::uuid[])', [ids]);
  await pool.end();
});

describe('POST /feedback', () => {
  it('takes feedback from visitors, with an optional name and contact', async () => {
    const res = await send({ kind: 'suggestion', message: '  Please add coffee seedlings  ', name: 'Visitor', contact: '0772123456', page: '/nurseries' });
    expect(res.status).toBe(201);
    const receipt = data<FeedbackReceiptDto>(res);
    expect(Object.keys(receipt).sort()).toEqual(['created_at', 'id']);

    const list = data<AdminFeedbackDto[]>(await request(app).get('/api/v1/admin/feedback?kind=suggestion').set(admin).expect(200));
    expect(list.find(f => f.id === receipt.id)).toMatchObject({
      kind: 'suggestion', message: 'Please add coffee seedlings', name: 'Visitor', contact: '0772123456', page: '/nurseries', user_id: null, status: 'new',
    });
  });

  it('links signed-in people to their account and shows its name and phone', async () => {
    const b = await newBuyer(app, providers.sms);
    const res = await send({ kind: 'problem', message: 'The map was slow to load today' }, bearer(b.token));
    const id = data<FeedbackReceiptDto>(res).id;
    const list = data<AdminFeedbackDto[]>(await request(app).get('/api/v1/admin/feedback?status=new').set(admin).expect(200));
    expect(list.find(f => f.id === id)).toMatchObject({ user_id: b.userId, contact: b.phone });
  });

  it('rejects messages that are too short or too long, and bad pages', async () => {
    expect((await send({ kind: 'experience', message: 'ok' })).status).toBe(400);
    expect((await send({ kind: 'experience', message: 'x'.repeat(2001) })).status).toBe(400);
    expect((await send({ kind: 'praise', message: 'Lovely site, thank you' })).status).toBe(400);
    expect((await send({ kind: 'experience', message: 'Lovely site, thank you', page: 'https://evil.example' })).status).toBe(400);
  });
});

describe('admin feedback', () => {
  it('is admin only', async () => {
    await request(app).get('/api/v1/admin/feedback').expect(401);
  });

  it('marks feedback read and done with a note, audited', async () => {
    const id = data<FeedbackReceiptDto>(await send({ kind: 'experience', message: 'Ordered mango seedlings easily' })).id;
    const read = data<AdminFeedbackDto>(await request(app).put(`/api/v1/admin/feedback/${id}`).set(admin).send({ status: 'read' }).expect(200));
    expect(read.status).toBe('read');
    const done = data<AdminFeedbackDto>(await request(app).put(`/api/v1/admin/feedback/${id}`).set(admin).send({ status: 'done', note: 'Shared with the team' }).expect(200));
    expect(done).toMatchObject({ status: 'done', admin_note: 'Shared with the team', handled_by: expect.any(String) as string });

    const { rows } = await pool.query<{ action: string }>(`SELECT action FROM audit_log WHERE entity = 'feedback' AND entity_id = $1 ORDER BY created_at`, [id]);
    expect(rows.map(r => r.action)).toEqual(['feedback.read', 'feedback.done']);
    await request(app).put('/api/v1/admin/feedback/00000000-0000-4000-8000-000000000000').set(admin).send({ status: 'read' }).expect(404);
  });
});

describe('GET /health site settings', () => {
  it('reports the demo notice and survey link', async () => {
    const withSurvey = createApp({ config: { ...config, SURVEY_URL: 'https://docs.google.com/forms/d/e/abc/viewform', DEMO_NOTICE: 'off' }, pool, logger: pino({ level: 'silent' }), providers, queue: new RecordingQueue() });
    const site = (await request(withSurvey).get('/api/v1/health').expect(200)).body as { data: { site: unknown } };
    expect(site.data.site).toEqual({ demo_notice: false, survey_url: 'https://docs.google.com/forms/d/e/abc/viewform' });
    const plain = (await request(app).get('/api/v1/health').expect(200)).body as { data: { site: unknown } };
    expect(plain.data.site).toEqual({ demo_notice: true, survey_url: null });
  });
});
