import { z } from 'zod';
import { feedbackKindSchema, feedbackStatusSchema } from '../enums.js';

/**
 * Feedback from anyone, signed in or not. Name and contact are optional: they are only for the team
 * to reply, and signed-in people are known from their account.
 */
export const feedbackCreateSchema = z.object({
  kind: feedbackKindSchema,
  message: z.string().trim().min(10, 'Please write at least a few words (10 letters or more)').max(2000, 'Please keep it under 2,000 letters'),
  name: z.string().trim().max(100).optional(),
  contact: z.string().trim().max(120, 'Use a phone number or email address').optional(),
  /** The page the person was on when they opened the form, e.g. /nurseries */
  page: z.string().trim().max(200).regex(/^\/[^\s]*$/, 'A site path such as /nurseries').optional(),
});
export type FeedbackCreate = z.input<typeof feedbackCreateSchema>;

/** Admin marks feedback read or done, with an optional note for the team. */
export const feedbackUpdateSchema = z.object({
  status: feedbackStatusSchema,
  note: z.string().trim().max(500).optional(),
});

export const feedbackQuerySchema = z.object({
  status: feedbackStatusSchema.optional(),
  kind: feedbackKindSchema.optional(),
});
