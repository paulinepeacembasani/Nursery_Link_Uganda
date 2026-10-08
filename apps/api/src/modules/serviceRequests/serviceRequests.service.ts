import type { z } from 'zod';
import { SERVICE_REQUEST_TRANSITIONS, type AdminServiceRequestDto, type PaginationMeta, type ServiceRequestDtoShape, type serviceRequestCreateSchema, type serviceRequestUpdateSchema, type ServiceRequestStatus, type ServiceType } from '@nurserylink/shared';
import type { Database } from '../../db/client.js';
import { writeAudit } from '../../lib/audit.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { paginationMeta, toOffset, type Pagination } from '../../lib/pagination.js';
import * as repo from './serviceRequests.repo.js';

type CreateInput = z.output<typeof serviceRequestCreateSchema>;
type UpdateInput = z.output<typeof serviceRequestUpdateSchema>;

const toDto = (r: repo.ServiceRequestRow): ServiceRequestDtoShape => ({
  id: r.id,
  service: r.service,
  location: r.location,
  land_acres: r.land_acres,
  notes: r.notes,
  status: r.status,
  admin_note: r.admin_note,
  created_at: new Date(r.created_at).toISOString(),
  updated_at: new Date(r.updated_at).toISOString(),
});

/** The admin view adds who asked (they are phoned back) and who handled it. */
const toAdminDto = (r: repo.ServiceRequestRow): AdminServiceRequestDto => ({
  ...toDto(r),
  requester: { id: r.user_id, full_name: r.requester_name, phone: r.requester_phone },
  handled_by: r.handled_by,
});

/**
 * Requests for tree-planting services (/services). Buyers ask; the team phones them back and
 * moves the request through contacted → scheduled → done (or cancelled).
 */
export class ServiceRequestsService {
  constructor(private readonly deps: { db: Database }) {}

  async create(userId: string, input: CreateInput): Promise<ServiceRequestDtoShape> {
    const { db } = this.deps;
    const id = await repo.insertRequest(db, {
      userId,
      service: input.service,
      location: input.location,
      landAcres: input.land_acres ?? null,
      notes: input.notes ? input.notes : null,
    });
    const row = await repo.findRequest(db, id);
    if (!row) throw new NotFoundError('Service request not found');
    return toDto(row);
  }

  async listMine(userId: string, page: Pagination): Promise<{ items: ServiceRequestDtoShape[]; meta: PaginationMeta }> {
    const rows = await repo.listForUser(this.deps.db, userId, page.limit, toOffset(page));
    return { items: rows.map(toDto), meta: paginationMeta(page, rows[0]?.total ?? 0) };
  }

  async listAll(filter: { status?: ServiceRequestStatus | undefined; service?: ServiceType | undefined }, page: Pagination) {
    const rows = await repo.listAll(this.deps.db, filter, page.limit, toOffset(page));
    return { items: rows.map(toAdminDto), meta: paginationMeta(page, rows[0]?.total ?? 0) };
  }

  /** Moves a request on (locked, audited in the same transaction). */
  async update(actorId: string, id: string, input: UpdateInput): Promise<AdminServiceRequestDto> {
    const updated = await this.deps.db.transaction(async tx => {
      const before = await repo.findRequest(tx, id, true);
      if (!before) throw new NotFoundError('Service request not found');
      if (!SERVICE_REQUEST_TRANSITIONS[before.status].includes(input.status)) {
        throw new ConflictError(`A request that is ${before.status} cannot be marked ${input.status}`, { from: before.status, to: input.status });
      }
      await repo.updateStatus(tx, id, input.status, input.note ? input.note : null, actorId);
      const after = await repo.findRequest(tx, id);
      if (!after) throw new Error('Service request vanished');
      await writeAudit(tx, {
        actorId,
        action: `service_request.${input.status}`,
        entity: 'service_request',
        entityId: id,
        before: toAdminDto(before),
        after: toAdminDto(after),
      });
      return after;
    });
    return toAdminDto(updated);
  }
}
