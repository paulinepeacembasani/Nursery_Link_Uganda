import { Router } from 'express';
import type { z } from 'zod';
import { feedbackCreateSchema } from '@nurserylink/shared';
import type { Limit } from '../../middleware/rateLimit.js';
import { userOrIpKey } from '../../middleware/security.js';
import { validate } from '../../middleware/validate.js';
import type { FeedbackService } from './feedback.service.js';

/** Anyone can leave feedback, signed in or not (generous per-IP limit: many share one IP on mobile networks). */
export const feedbackRoutes = (service: FeedbackService, limit: Limit): Router => {
  const router = Router();
  const createLimit = limit({ windowMinutes: 60, limit: 20, key: userOrIpKey });

  router.post('/', createLimit, validate({ body: feedbackCreateSchema }), async (req, res) => {
    const { body } = res.locals.validated as { body: z.output<typeof feedbackCreateSchema> };
    res.status(201).json({ data: await service.create(req.user?.id ?? null, body) });
  });

  return router;
};
