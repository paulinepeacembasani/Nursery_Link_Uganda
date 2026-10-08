import { sql, type SQL } from 'drizzle-orm';
import type { ServiceRequestStatus, ServiceType } from '@nurserylink/shared';
import type { DbOrTx } from '../../db/client.js';

export type ServiceRequestRow = {
  id: string;
  user_id: string;
  requester_name: string;
  requester_phone: string;
  service: ServiceType;
  location: string;
  land_acres: number | null;
  notes: string | null;
  status: ServiceRequestStatus;
  admin_note: string | null;
  handled_by: string | null;
  created_at: Date;
  updated_at: Date;
  total: number;
};

export const insertRequest = async (
  db: DbOrTx,
  r: { userId: string; service: ServiceType; location: string; landAcres: number | null; notes: string | null }
): Promise<string> => {
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO service_requests (user_id, service, location, land_acres, notes)
    VALUES (${r.userId}, ${r.service}, ${r.location}, ${r.landAcres}, ${r.notes})
    RETURNING id`);
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Service request insert returned no row');
  return id;
};

const selectRequests = async (db: DbOrTx, where: SQL, limit: number, offset: number): Promise<ServiceRequestRow[]> =>
  (
    await db.execute<ServiceRequestRow>(sql`
      SELECT r.id, r.user_id, u.full_name AS requester_name, u.phone AS requester_phone,
             r.service, r.location, r.land_acres::float8 AS land_acres, r.notes, r.status, r.admin_note,
             r.handled_by, r.created_at, r.updated_at,
             count(*) OVER ()::int AS total
      FROM service_requests r
      JOIN users u ON u.id = r.user_id
      WHERE ${where}
      ORDER BY r.created_at DESC, r.id
      LIMIT ${limit} OFFSET ${offset}`)
  ).rows;

/** With lock=true the row is locked first (a separate statement: FOR UPDATE can't sit beside count(*) OVER ()). */
export const findRequest = async (db: DbOrTx, id: string, lock = false): Promise<ServiceRequestRow | undefined> => {
  if (lock) await db.execute(sql`SELECT 1 FROM service_requests WHERE id = ${id} FOR UPDATE`);
  return (await selectRequests(db, sql`r.id = ${id}`, 1, 0))[0];
};

export const listForUser = (db: DbOrTx, userId: string, limit: number, offset: number) =>
  selectRequests(db, sql`r.user_id = ${userId}`, limit, offset);

export const listAll = (db: DbOrTx, filter: { status?: ServiceRequestStatus | undefined; service?: ServiceType | undefined }, limit: number, offset: number) => {
  const conditions: SQL[] = [sql`true`];
  if (filter.status) conditions.push(sql`r.status = ${filter.status}`);
  if (filter.service) conditions.push(sql`r.service = ${filter.service}`);
  return selectRequests(db, sql.join(conditions, sql` AND `), limit, offset);
};

export const updateStatus = async (db: DbOrTx, id: string, status: ServiceRequestStatus, note: string | null, actorId: string): Promise<void> => {
  await db.execute(sql`
    UPDATE service_requests
    SET status = ${status}, admin_note = COALESCE(${note}, admin_note), handled_by = ${actorId}
    WHERE id = ${id}`);
};
