import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  adminOrderStatusSchema,
  analyticsQuerySchema,
  adminOrdersQuerySchema,
  adminRefundSchema,
  applicationReviewSchema,
  applicationsQuerySchema,
  serviceRequestsQuerySchema,
  feedbackQuerySchema,
  feedbackUpdateSchema,
  serviceRequestUpdateSchema,
  shadowLayerSchema,
  shadowRunCreateSchema,
  campaignCreateSchema,
  paymentStatusSchema,
  campaignUpdateSchema,
  certificationStatusSchema,
  deliveryRateCreateSchema,
  deliveryRateUpdateSchema,
  inventoryCreateSchema,
  inventoryUpdateSchema,
  newsCategorySchema,
  newsCreateSchema,
  newsUpdateSchema,
  nurseryCreateSchema,
  nurseryUpdateSchema,
  speciesCategorySchema,
  speciesCreateSchema,
  speciesUpdateSchema,
} from '@nurserylink/shared';
import type { Database } from '../../db/client.js';
import { paginationMeta, paginationQuerySchema, toOffset } from '../../lib/pagination.js';
import { PayloadTooLargeError, UnauthorizedError, ValidationError } from '../../lib/errors.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { listAudit } from '../audit/audit.repo.js';
import { CampaignsAdminService } from '../campaigns/campaigns.admin.service.js';
import { toCampaign } from '../campaigns/campaigns.dto.js';
import { analytics } from './analytics.repo.js';
import { dashboard, SMS_WINDOW_DAYS, STALE_STOCK_DAYS, STUCK_ESCROW_HOURS } from './dashboard.repo.js';
import { toIsoDates } from '../../lib/isoDates.js';
import { DeliveryRatesService } from '../deliveryRates/deliveryRates.service.js';
import { ExportsService } from '../exports/exports.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { NewsAdminService } from '../news/news.admin.service.js';
import { NurseriesAdminService } from '../nurseries/nurseries.admin.service.js';
import { SpeciesAdminService } from '../species/species.admin.service.js';
import type { SpeciesService } from '../species/species.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import type { ApplicationsService } from '../campaigns/applications.service.js';
import type { ServiceRequestsService } from '../serviceRequests/serviceRequests.service.js';
import type { FeedbackService } from '../feedback/feedback.service.js';
import type { ShadowService } from '../shadow/shadow.service.js';
import { MAX_UPLOAD_BYTES, type MediaService } from '../media/media.service.js';
import multer from 'multer';
import type { Limit } from '../../middleware/rateLimit.js';
import { userOrIpKey } from '../../middleware/security.js';

export const idParams = z.object({ id: z.uuid() });
const booleanParam = z.enum(['true', 'false']).transform(v => v === 'true');

/** Typed access to what `validate` parsed; the schemas passed to `validate` guarantee the shape. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- deliberate typed view of res.locals
const parsed = <T>(res: Response) => res.locals.validated as T;

/** requireRole('admin') runs before every handler here, so req.user is always set. */
const actorId = (req: Request): string => {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
};

export const nurseriesQuery = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  district_id: z.uuid().optional(),
  sub_county_id: z.uuid().optional(),
  is_active: booleanParam.optional(),
  certification_status: certificationStatusSchema.optional(),
  /** Only invented sample nurseries (true) or only real ones (false) */
  is_demo: booleanParam.optional(),
  /** Imported nurseries waiting to be checked and switched on */
  to_verify: booleanParam.optional(),
});
export const speciesQuery = paginationQuerySchema.extend({ category: speciesCategorySchema.optional(), q: z.string().trim().min(1).max(100).optional() });
export const newsQuery = paginationQuerySchema.extend({ category: newsCategorySchema.optional(), is_published: booleanParam.optional() });
export const auditQuery = paginationQuerySchema.extend({
  entity: z.string().max(50).optional(),
  entity_id: z.string().max(100).optional(),
  actor_id: z.uuid().optional(),
  action: z.string().max(80).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export const importQuery = z.object({ commit: booleanParam.default(false) });

export const ordersQuery = adminOrdersQuerySchema.extend(paginationQuerySchema.shape);
export const payoutsQuery = paginationQuerySchema.extend({ status: paymentStatusSchema.optional() });
export const applicationsQuery = applicationsQuerySchema.extend(paginationQuerySchema.shape);
export const serviceRequestsQuery = serviceRequestsQuerySchema.extend(paginationQuerySchema.shape);
export const feedbackQuery = feedbackQuerySchema.extend(paginationQuerySchema.shape);
export const layerQuery = z.object({ layer: shadowLayerSchema.default('shadows') });
export const runIdParams = z.object({ runId: z.uuid() });

/**
 * Every /api/v1/admin/* route is mounted on this router, so the admin check applies to all of them,
 * including paths that do not exist (visitors get 401, buyers 403, admins 404).
 */

export const adminRoutes = (deps: { db: Database; species: SpeciesService; orders: OrdersService; applications: ApplicationsService; serviceRequests: ServiceRequestsService; feedback: FeedbackService; shadow: ShadowService; media: MediaService; limit: Limit }): Router => {
  const { db } = deps;
  const nurseries = new NurseriesAdminService({ db });
  const inventory = new InventoryService({ db });
  const speciesAdmin = new SpeciesAdminService({ db });
  const news = new NewsAdminService({ db });
  const campaigns = new CampaignsAdminService({ db });
  const rates = new DeliveryRatesService({ db });
  const exportsService = new ExportsService({ db });

  const router = Router();
  router.use(requireRole('admin'));
  // A run computes service areas for every nursery; this stops accidental floods of runs
  const shadowLimit = deps.limit({ windowMinutes: 60, limit: 20, key: userOrIpKey });

  // ── Insights ─────────────────────────────────────────────
  router.get('/analytics', validate({ query: analyticsQuerySchema }), async (_req, res) => {
    const { query } = parsed<{ query: z.output<typeof analyticsQuerySchema> }>(res);
    res.json({ data: toIsoDates(await analytics(db, query.range)) });
  });

  // ── Needs attention ──────────────────────────────────────
  router.get('/dashboard', async (_req, res) => {
    res.json({
      data: {
        ...toIsoDates(await dashboard(db)),
        thresholds: { stuck_escrow_hours: STUCK_ESCROW_HOURS, stale_stock_days: STALE_STOCK_DAYS, sms_window_days: SMS_WINDOW_DAYS },
      },
    });
  });

  // ── Nurseries ────────────────────────────────────────────
  router.get('/nurseries', validate({ query: nurseriesQuery }), async (_req, res) => {
    const { query: q } = parsed<{ query: z.output<typeof nurseriesQuery> }>(res);
    const { items, meta } = await nurseries.list(
      { q: q.q, districtId: q.district_id, subCountyId: q.sub_county_id, isActive: q.is_active, certificationStatus: q.certification_status, isDemo: q.is_demo, toVerify: q.to_verify },
      { page: q.page, limit: q.limit }
    );
    res.json({ data: items, meta });
  });
  router.get('/nurseries/:id', validate({ params: idParams }), async (_req, res) => {
    res.json({ data: await nurseries.get(parsed<{ params: { id: string } }>(res).params.id) });
  });
  router.post('/nurseries', validate({ body: nurseryCreateSchema }), async (req, res) => {
    res.status(201).json({ data: await nurseries.create(actorId(req), parsed<{ body: z.output<typeof nurseryCreateSchema> }>(res).body) });
  });
  router.patch('/nurseries/:id', validate({ params: idParams, body: nurseryUpdateSchema }), async (req, res) => {
    const { params, body } = parsed<{ params: { id: string }; body: z.output<typeof nurseryUpdateSchema> }>(res);
    res.json({ data: await nurseries.update(actorId(req), params.id, body) });
  });
  router.delete('/nurseries/:id', validate({ params: idParams }), async (req, res) => {
    await nurseries.remove(actorId(req), parsed<{ params: { id: string } }>(res).params.id);
    res.status(204).end();
  });

  // ── Inventory ────────────────────────────────────────────
  router.get('/nurseries/:id/inventory', validate({ params: idParams }), async (_req, res) => {
    const { params } = parsed<{ params: { id: string } }>(res);
    await nurseries.get(params.id); // 404 for unknown nurseries
    res.json({ data: await inventory.listForNursery(params.id) });
  });
  router.post('/inventory', validate({ body: inventoryCreateSchema }), async (req, res) => {
    res.status(201).json({ data: await inventory.create(actorId(req), parsed<{ body: z.output<typeof inventoryCreateSchema> }>(res).body) });
  });
  router.post(
    '/inventory/import',
    express.text({ type: ['text/csv', 'application/csv', 'text/plain'], limit: '2mb' }),
    validate({ query: importQuery }),
    async (req, res) => {
      if (typeof req.body !== 'string' || req.body.trim() === '') {
        throw new ValidationError('Send the CSV file as the request body with Content-Type: text/csv');
      }
      const { query } = parsed<{ query: z.output<typeof importQuery> }>(res);
      res.json({ data: await inventory.importCsv(actorId(req), req.body, query.commit) });
    }
  );
  router.patch('/inventory/:id', validate({ params: idParams, body: inventoryUpdateSchema }), async (req, res) => {
    const { params, body } = parsed<{ params: { id: string }; body: z.output<typeof inventoryUpdateSchema> }>(res);
    res.json({ data: await inventory.update(actorId(req), params.id, body) });
  });
  router.delete('/inventory/:id', validate({ params: idParams }), async (req, res) => {
    await inventory.remove(actorId(req), parsed<{ params: { id: string } }>(res).params.id);
    res.status(204).end();
  });

  // ── Species ──────────────────────────────────────────────
  router.get('/species', validate({ query: speciesQuery }), async (_req, res) => {
    const { query: q } = parsed<{ query: z.output<typeof speciesQuery> }>(res);
    const { items, meta } = await deps.species.list({ category: q.category, q: q.q }, { page: q.page, limit: q.limit });
    res.json({ data: items, meta });
  });
  router.get('/species/:id', validate({ params: idParams }), async (_req, res) => {
    res.json({ data: await speciesAdmin.get(parsed<{ params: { id: string } }>(res).params.id) });
  });
  router.post('/species', validate({ body: speciesCreateSchema }), async (req, res) => {
    res.status(201).json({ data: await speciesAdmin.create(actorId(req), parsed<{ body: z.output<typeof speciesCreateSchema> }>(res).body) });
  });
  router.patch('/species/:id', validate({ params: idParams, body: speciesUpdateSchema }), async (req, res) => {
    const { params, body } = parsed<{ params: { id: string }; body: z.output<typeof speciesUpdateSchema> }>(res);
    res.json({ data: await speciesAdmin.update(actorId(req), params.id, body) });
  });
  router.delete('/species/:id', validate({ params: idParams }), async (req, res) => {
    await speciesAdmin.remove(actorId(req), parsed<{ params: { id: string } }>(res).params.id);
    res.status(204).end();
  });

  // ── News ─────────────────────────────────────────────────
  router.get('/news', validate({ query: newsQuery }), async (_req, res) => {
    const { query: q } = parsed<{ query: z.output<typeof newsQuery> }>(res);
    const { items, meta } = await news.list({ category: q.category, isPublished: q.is_published }, { page: q.page, limit: q.limit });
    res.json({ data: items, meta });
  });
  router.get('/news/:id', validate({ params: idParams }), async (_req, res) => {
    res.json({ data: await news.get(parsed<{ params: { id: string } }>(res).params.id) });
  });
  router.post('/news', validate({ body: newsCreateSchema }), async (req, res) => {
    res.status(201).json({ data: await news.create(actorId(req), parsed<{ body: z.output<typeof newsCreateSchema> }>(res).body) });
  });
  router.patch('/news/:id', validate({ params: idParams, body: newsUpdateSchema }), async (req, res) => {
    const { params, body } = parsed<{ params: { id: string }; body: z.output<typeof newsUpdateSchema> }>(res);
    res.json({ data: await news.update(actorId(req), params.id, body) });
  });
  router.delete('/news/:id', validate({ params: idParams }), async (req, res) => {
    await news.remove(actorId(req), parsed<{ params: { id: string } }>(res).params.id);
    res.status(204).end();
  });

  // ── Campaigns ────────────────────────────────────────────
  router.get('/campaigns', validate({ query: paginationQuerySchema }), async (_req, res) => {
    const { query } = parsed<{ query: z.output<typeof paginationQuerySchema> }>(res);
    const { items, meta } = await campaigns.list(query);
    res.json({ data: items.map(toCampaign), meta });
  });
  router.get('/campaigns/:id', validate({ params: idParams }), async (_req, res) => {
    res.json({ data: toCampaign(await campaigns.get(parsed<{ params: { id: string } }>(res).params.id)) });
  });
  router.post('/campaigns', validate({ body: campaignCreateSchema }), async (req, res) => {
    res.status(201).json({ data: toCampaign(await campaigns.create(actorId(req), parsed<{ body: z.output<typeof campaignCreateSchema> }>(res).body)) });
  });
  router.patch('/campaigns/:id', validate({ params: idParams, body: campaignUpdateSchema }), async (req, res) => {
    const { params, body } = parsed<{ params: { id: string }; body: z.output<typeof campaignUpdateSchema> }>(res);
    res.json({ data: toCampaign(await campaigns.update(actorId(req), params.id, body)) });
  });
  router.delete('/campaigns/:id', validate({ params: idParams }), async (req, res) => {
    await campaigns.remove(actorId(req), parsed<{ params: { id: string } }>(res).params.id);
    res.status(204).end();
  });

  // ── Campaign applications ────────────────────────────────
  router.get('/campaigns/:id/applications', validate({ params: idParams, query: applicationsQuery }), async (_req, res) => {
    const { params, query: q } = parsed<{ params: { id: string }; query: z.output<typeof applicationsQuery> }>(res);
    const { items, meta } = await deps.applications.listForCampaign(params.id, q.status, { page: q.page, limit: q.limit });
    res.json({ data: items, meta });
  });
  router.put('/applications/:id', validate({ params: idParams, body: applicationReviewSchema }), async (req, res) => {
    const { params, body } = parsed<{ params: { id: string }; body: z.output<typeof applicationReviewSchema> }>(res);
    res.json({ data: await deps.applications.review(actorId(req), params.id, body) });
  });

  // ── Service requests ─────────────────────────────────────
  router.get('/service-requests', validate({ query: serviceRequestsQuery }), async (_req, res) => {
    const { query: q } = parsed<{ query: z.output<typeof serviceRequestsQuery> }>(res);
    const { items, meta } = await deps.serviceRequests.listAll({ status: q.status, service: q.service }, { page: q.page, limit: q.limit });
    res.json({ data: items, meta });
  });
  router.put('/service-requests/:id', validate({ params: idParams, body: serviceRequestUpdateSchema }), async (req, res) => {
    const { params, body } = parsed<{ params: { id: string }; body: z.output<typeof serviceRequestUpdateSchema> }>(res);
    res.json({ data: await deps.serviceRequests.update(actorId(req), params.id, body) });
  });

  // ── Feedback ─────────────────────────────────────────────
  router.get('/feedback', validate({ query: feedbackQuery }), async (_req, res) => {
    const { query: q } = parsed<{ query: z.output<typeof feedbackQuery> }>(res);
    const { items, meta } = await deps.feedback.list({ status: q.status, kind: q.kind }, { page: q.page, limit: q.limit });
    res.json({ data: items, meta });
  });
  router.put('/feedback/:id', validate({ params: idParams, body: feedbackUpdateSchema }), async (req, res) => {
    const { params, body } = parsed<{ params: { id: string }; body: z.output<typeof feedbackUpdateSchema> }>(res);
    res.json({ data: await deps.feedback.update(actorId(req), params.id, body) });
  });

  // ── Nursery Shadow ───────────────────────────────────────
  router.post('/shadow/runs', shadowLimit, validate({ body: shadowRunCreateSchema }), async (req, res) => {
    const { run, outcome, warnings } = await deps.shadow.start(actorId(req), parsed<{ body: z.output<typeof shadowRunCreateSchema> }>(res).body);
    res.status(outcome === 'new' ? 202 : 200).json({ data: run, meta: { outcome, ...(warnings.length ? { warnings } : {}) } });
  });
  router.get('/shadow/runs', validate({ query: paginationQuerySchema }), async (_req, res) => {
    const { items, meta } = await deps.shadow.list(parsed<{ query: z.output<typeof paginationQuerySchema> }>(res).query);
    res.json({ data: items, meta });
  });
  router.get('/shadow/runs/:id', validate({ params: idParams }), async (_req, res) => {
    res.json({ data: await deps.shadow.get(parsed<{ params: { id: string } }>(res).params.id) });
  });
  router.get('/shadow/runs/:id/geojson', validate({ params: idParams, query: layerQuery }), async (_req, res) => {
    const { params, query } = parsed<{ params: { id: string }; query: z.output<typeof layerQuery> }>(res);
    res.json({ data: await deps.shadow.layer(params.id, query.layer) });
  });

  // ── Media (species photos, news covers) ──────────────────
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }).single('file');
  router.post('/media', (req, res, next) => {
    upload(req, res, err => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') { next(new PayloadTooLargeError('The photo is larger than 5 MB')); return; }
      if (err) { next(err); return; }
      if (!req.file) { next(new ValidationError('Attach a photo in the "file" field', { path: 'file' })); return; }
      deps.media.upload(actorId(req), req.file).then(m => { res.status(201).json({ data: m }); }, next);
    });
  });

  // ── Delivery rates ───────────────────────────────────────
  router.get('/delivery-rates', async (_req, res) => {
    res.json({ data: await rates.list() });
  });
  router.post('/delivery-rates', validate({ body: deliveryRateCreateSchema }), async (req, res) => {
    res.status(201).json({ data: await rates.create(actorId(req), parsed<{ body: z.output<typeof deliveryRateCreateSchema> }>(res).body) });
  });
  router.patch('/delivery-rates/:id', validate({ params: idParams, body: deliveryRateUpdateSchema }), async (req, res) => {
    const { params, body } = parsed<{ params: { id: string }; body: z.output<typeof deliveryRateUpdateSchema> }>(res);
    res.json({ data: await rates.update(actorId(req), params.id, body) });
  });
  router.delete('/delivery-rates/:id', validate({ params: idParams }), async (req, res) => {
    await rates.remove(actorId(req), parsed<{ params: { id: string } }>(res).params.id);
    res.status(204).end();
  });

  // ── Orders and payouts ───────────────────────────────────
  router.get('/orders', validate({ query: ordersQuery }), async (_req, res) => {
    const { query: q } = parsed<{ query: z.output<typeof ordersQuery> }>(res);
    const { items, meta } = await deps.orders.adminList({ status: q.status, nurseryId: q.nursery_id, buyerId: q.buyer_id, q: q.q }, { page: q.page, limit: q.limit });
    res.json({ data: items, meta });
  });
  router.get('/orders/:id', validate({ params: idParams }), async (_req, res) => {
    res.json({ data: await deps.orders.adminGet(parsed<{ params: { id: string } }>(res).params.id) });
  });
  router.put('/orders/:id/status', validate({ params: idParams, body: adminOrderStatusSchema }), async (req, res) => {
    const { params, body } = parsed<{ params: { id: string }; body: z.output<typeof adminOrderStatusSchema> }>(res);
    res.json({ data: await deps.orders.adminSetStatus(actorId(req), params.id, body.status, body.reason) });
  });
  router.post('/orders/:id/refund', validate({ params: idParams, body: adminRefundSchema }), async (req, res) => {
    const { params, body } = parsed<{ params: { id: string }; body: z.output<typeof adminRefundSchema> }>(res);
    res.json({ data: await deps.orders.adminSetStatus(actorId(req), params.id, 'refunded', body.reason) });
  });
  router.get('/payouts', validate({ query: payoutsQuery }), async (_req, res) => {
    const { query: q } = parsed<{ query: z.output<typeof payoutsQuery> }>(res);
    const { items, meta } = await deps.orders.adminListPayouts(q.status, { page: q.page, limit: q.limit });
    res.json({ data: items, meta });
  });
  router.post('/payouts/:id/retry', validate({ params: idParams }), async (req, res) => {
    res.json({ data: await deps.orders.adminRetryPayout(actorId(req), parsed<{ params: { id: string } }>(res).params.id) });
  });

  // ── Audit log ────────────────────────────────────────────
  router.get('/audit-log', validate({ query: auditQuery }), async (_req, res) => {
    const { query: q } = parsed<{ query: z.output<typeof auditQuery> }>(res);
    const rows = await listAudit(
      db,
      {
        entity: q.entity,
        entityId: q.entity_id,
        actorId: q.actor_id,
        action: q.action,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
      },
      q.limit,
      toOffset(q)
    );
    res.json({
      data: rows.map(({ total: _total, created_at, ...r }) => ({ ...r, created_at: new Date(created_at).toISOString() })),
      meta: paginationMeta(q, rows[0]?.total ?? 0),
    });
  });

  // ── Exports (NFR-8.2) ────────────────────────────────────
  const stamp = () => new Date().toISOString().slice(0, 10);
  router.get('/export/nurseries.csv', async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nurseries-${stamp()}.csv"`);
    // UTF-8 BOM so Excel shows names such as "Kasangalabi" and "–" correctly
    res.send(`\uFEFF${await exportsService.nurseriesCsv()}`);
  });
  router.get('/export/nurseries.geojson', async (_req, res) => {
    res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nurseries-${stamp()}.geojson"`);
    res.send(JSON.stringify(await exportsService.nurseriesGeoJson()));
  });
  router.get('/export/shadow/:runId.geojson', validate({ params: runIdParams }), async (_req, res) => {
    const { runId } = parsed<{ params: z.output<typeof runIdParams> }>(res).params;
    const shadows = await deps.shadow.layer(runId, 'shadows');
    res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nursery-shadow-${runId.slice(0, 8)}.geojson"`);
    res.send(JSON.stringify(shadows));
  });

  return router;
};
