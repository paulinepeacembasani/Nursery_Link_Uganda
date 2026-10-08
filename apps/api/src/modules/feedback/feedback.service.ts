import type { z } from 'zod';
import type { AdminFeedbackDto, FeedbackKind, FeedbackReceiptDto, FeedbackStatus, PaginationMeta, feedbackCreateSchema, feedbackUpdateSchema } from '@nurserylink/shared';
import type { Database } from '../../db/client.js';
import { writeAudit } from '../../lib/audit.js';
import { NotFoundError } from '../../lib/errors.js';
import { paginationMeta, toOffset, type Pagination } from '../../lib/pagination.js';
import * as repo from './feedback.repo.js';

type CreateInput = z.output<typeof feedbackCreateSchema>;
type UpdateInput = z.output<typeof feedbackUpdateSchema>;

const toAdminDto = (r: repo.FeedbackRow): AdminFeedbackDto => ({
  id: r.id,
  kind: r.kind,
  message: r.message,
  name: r.name,
  contact: r.contact,
  page: r.page,
  user_id: r.user_id,
  status: r.status,
  admin_note: r.admin_note,
  handled_by: r.handled_by,
  created_at: new Date(r.created_at).toISOString(),
  updated_at: new Date(r.updated_at).toISOString(),
});

/**
 * Feedback from anyone using the site. The person gets a receipt only (feedback is never shown
 * back publicly); the team reads it in the admin console and marks it read or done.
 */
export class FeedbackService {
  constructor(private readonly deps: { db: Database }) {}

  async create(userId: string | null, input: CreateInput): Promise<FeedbackReceiptDto> {
    const row = await repo.insertFeedback(this.deps.db, {
      kind: input.kind,
      message: input.message,
      name: input.name ? input.name : null,
      contact: input.contact ? input.contact : null,
      page: input.page ?? null,
      userId,
    });
    return { id: row.id, created_at: new Date(row.created_at).toISOString() };
  }

  async list(filter: { status?: FeedbackStatus | undefined; kind?: FeedbackKind | undefined }, page: Pagination): Promise<{ items: AdminFeedbackDto[]; meta: PaginationMeta }> {
    const rows = await repo.listFeedback(this.deps.db, filter, page.limit, toOffset(page));
    return { items: rows.map(toAdminDto), meta: paginationMeta(page, rows[0]?.total ?? 0) };
  }

  /** Marks feedback new, read or done (locked, audited in the same transaction). Any status may follow any other. */
  async update(actorId: string, id: string, input: UpdateInput): Promise<AdminFeedbackDto> {
    const updated = await this.deps.db.transaction(async tx => {
      const before = await repo.findFeedback(tx, id, true);
      if (!before) throw new NotFoundError('Feedback not found');
      await repo.updateStatus(tx, id, input.status, input.note ? input.note : null, actorId);
      const after = await repo.findFeedback(tx, id);
      if (!after) throw new Error('Feedback vanished');
      await writeAudit(tx, { actorId, action: `feedback.${input.status}`, entity: 'feedback', entityId: id, before: toAdminDto(before), after: toAdminDto(after) });
      return after;
    });
    return toAdminDto(updated);
  }
}
