import { z } from 'zod';
import { serviceRequestStatusSchema, serviceTypeSchema, type ServiceRequestStatus } from '../enums.js';

/** A buyer asks for a service. Name and phone come from their account. */
export const serviceRequestCreateSchema = z.object({
  service: serviceTypeSchema,
  location: z.string().trim().min(3, 'Say where the land is (village, sub-county or district)').max(200),
  land_acres: z.number().min(0.1, 'At least 0.1 acres').max(10_000).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type ServiceRequestCreate = z.input<typeof serviceRequestCreateSchema>;

/** Where each status can go next. "done" and "cancelled" are final. */
export const SERVICE_REQUEST_TRANSITIONS: Record<ServiceRequestStatus, readonly ServiceRequestStatus[]> = {
  new: ['contacted', 'scheduled', 'done', 'cancelled'],
  contacted: ['scheduled', 'done', 'cancelled'],
  scheduled: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

/** Admin moves a request on, with an optional note (e.g. the date agreed by phone). */
export const serviceRequestUpdateSchema = z.object({
  status: serviceRequestStatusSchema.exclude(['new']),
  note: z.string().trim().max(500).optional(),
});

export const serviceRequestsQuerySchema = z.object({
  status: serviceRequestStatusSchema.optional(),
  service: serviceTypeSchema.optional(),
});
