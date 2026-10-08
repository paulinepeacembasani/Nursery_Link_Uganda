import { Router } from 'express';
import type { z } from 'zod';
import { serviceRequestCreateSchema } from '@nurserylink/shared';
import { UnauthorizedError } from '../../lib/errors.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { requireRole } from '../../middleware/requireRole.js';
import type { Limit } from '../../middleware/rateLimit.js';
import { userOrIpKey } from '../../middleware/security.js';
import { validate } from '../../middleware/validate.js';
import type { ServiceRequestsService } from './serviceRequests.service.js';

/** Buyers ask for a tree-planting service and see their own requests. */
export const serviceRequestsRoutes = (service: ServiceRequestsService, limit: Limit): Router => {
  const router = Router();
  const createLimit = limit({ windowMinutes: 60, limit: 10, key: userOrIpKey });

  router.get('/me', requireRole('buyer'), validate({ query: paginationQuerySchema }), async (req, res) => {
    const { query } = res.locals.validated as { query: z.output<typeof paginationQuerySchema> };
    if (!req.user) throw new UnauthorizedError();
    const { items, meta } = await service.listMine(req.user.id, query);
    res.json({ data: items, meta });
  });

  router.post('/', requireRole('buyer'), createLimit, validate({ body: serviceRequestCreateSchema }), async (req, res) => {
    const { body } = res.locals.validated as { body: z.output<typeof serviceRequestCreateSchema> };
    if (!req.user) throw new UnauthorizedError();
    res.status(201).json({ data: await service.create(req.user.id, body) });
  });

  return router;
};
