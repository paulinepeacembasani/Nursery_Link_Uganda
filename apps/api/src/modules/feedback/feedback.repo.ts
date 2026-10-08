import { sql, type SQL } from 'drizzle-orm';
import type { FeedbackKind, FeedbackStatus } from '@nurserylink/shared';
import type { DbOrTx } from '../../db/client.js';

export type FeedbackRow = {
  id: string;
  kind: FeedbackKind;
  message: string;
  name: string | null;
  contact: string | null;
  page: string | null;
  user_id: string | null;
  status: FeedbackStatus;
  admin_note: string | null;
  handled_by: string | null;
  created_at: Date;
  updated_at: Date;
  total: number;
};

export const insertFeedback = async (
  db: DbOrTx,
  f: { kind: FeedbackKind; message: string; name: string | null; contact: string | null; page: string | null; userId: string | null }
): Promise<{ id: string; created_at: Date }> => {
  const result = await db.execute<{ id: string; created_at: Date }>(sql`
    INSERT INTO feedback (kind, message, name, contact, page, user_id)
    VALUES (${f.kind}, ${f.message}, ${f.name}, ${f.contact}, ${f.page}, ${f.userId})
    RETURNING id, created_at`);
  const row = result.rows[0];
  if (!row) throw new Error('Feedback insert returned no row');
  return row;
};

/** Signed-in people are shown by their account's name and phone; visitors by what they typed. */
const selectFeedback = async (db: DbOrTx, where: SQL, limit: number, offset: number): Promise<FeedbackRow[]> =>
  (
    await db.execute<FeedbackRow>(sql`
      SELECT f.id, f.kind, f.message, COALESCE(u.full_name, f.name) AS name, COALESCE(u.phone, f.contact) AS contact,
             f.page, f.user_id, f.status, f.admin_note, f.handled_by, f.created_at, f.updated_at,
             count(*) OVER ()::int AS total
      FROM feedback f
      LEFT JOIN users u ON u.id = f.user_id
      WHERE ${where}
      ORDER BY f.created_at DESC, f.id
      LIMIT ${limit} OFFSET ${offset}`)
  ).rows;

/** With lock=true the row is locked first (a separate statement: FOR UPDATE can't sit beside count(*) OVER ()). */
export const findFeedback = async (db: DbOrTx, id: string, lock = false): Promise<FeedbackRow | undefined> => {
  if (lock) await db.execute(sql`SELECT 1 FROM feedback WHERE id = ${id} FOR UPDATE`);
  return (await selectFeedback(db, sql`f.id = ${id}`, 1, 0))[0];
};

export const listFeedback = (db: DbOrTx, filter: { status?: FeedbackStatus | undefined; kind?: FeedbackKind | undefined }, limit: number, offset: number) => {
  const conditions: SQL[] = [sql`true`];
  if (filter.status) conditions.push(sql`f.status = ${filter.status}`);
  if (filter.kind) conditions.push(sql`f.kind = ${filter.kind}`);
  return selectFeedback(db, sql.join(conditions, sql` AND `), limit, offset);
};

export const updateStatus = async (db: DbOrTx, id: string, status: FeedbackStatus, note: string | null, actorId: string): Promise<void> => {
  await db.execute(sql`
    UPDATE feedback
    SET status = ${status}, admin_note = COALESCE(${note}, admin_note), handled_by = ${actorId}
    WHERE id = ${id}`);
};
