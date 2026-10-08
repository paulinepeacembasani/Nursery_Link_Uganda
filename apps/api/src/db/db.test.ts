import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { speciesCategories } from '@nurserylink/shared';
import { createPool } from './client.js';
import { seed } from './seed/index.js';
import { SPECIES } from './seed/species.js';
import { NURSERIES, STOCK_ADDITIONS } from './seed/nurseries.js';
import { NEWS_POSTS } from './seed/content.js';
import { inRollback, pgErrorCode, prepareTestDatabase, TEST_ADMIN } from '../../test/db.js';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

const pool = createPool(inject('databaseUrl'));
let firstSeed: Record<string, number> | undefined;

beforeAll(async () => {
  firstSeed = await prepareTestDatabase(pool);
});
afterAll(() => pool.end());

// Other test files write news posts in the same database concurrently, so the news total is checked
// as "at least the seeded posts" and the posts themselves are checked by slug
const withoutNews = ({ news_posts: _news, ...rest }: Record<string, number> = {}) => rest;

const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => {
  const { rows } = await pool.query<T>(sql, params);
  const [row] = rows;
  if (!row) throw new Error(`No row for: ${sql}`);
  return row;
};

describe('migrations and seed', () => {
  it('seeds the official boundaries and the Mukono pilot data', async () => {
    expect(firstSeed?.news_posts).toBeGreaterThanOrEqual(NEWS_POSTS.length);
    const seeded = await one<{ n: number }>('SELECT count(*)::int AS n FROM news_posts WHERE slug = ANY($1)', [NEWS_POSTS.map(p => p.slug)]);
    expect(seeded.n).toBe(NEWS_POSTS.length);
    expect(withoutNews(firstSeed)).toEqual({
      // UBOS 2020: 135 districts, 1,520 sub-counties (scripts/boundaries/build.sh)
      districts: 135,
      sub_counties: 1520,
      species: SPECIES.length,
      // The sample nurseries plus the 62 from the 2018 certified list (switched off until checked)
      nurseries: NURSERIES.length + 62,
      inventory_rows: NURSERIES.reduce((sum, n) => sum + n.inventory.length, 0) + STOCK_ADDITIONS.reduce((sum, b) => sum + b.lines.length, 0),
      delivery_rates: 2,
      campaigns: 2,
      admins: 1,
    });
  });

  it('is idempotent: seeding again changes nothing and keeps the admin password', async () => {
    const before = await one<{ password_hash: string }>(`SELECT password_hash FROM users WHERE role = 'admin'`);
    const again = await seed(pool, { admin: { ...TEST_ADMIN, password: 'a-different-password-456' } });
    expect(withoutNews(again)).toEqual(withoutNews(firstSeed));
    const after = await one<{ password_hash: string }>(`SELECT password_hash FROM users WHERE role = 'admin'`);
    expect(after.password_hash).toBe(before.password_hash);
  });

  it('covers every species category, and every nursery has stock', async () => {
    const { rows } = await pool.query<{ category: string }>('SELECT DISTINCT category FROM species');
    expect(rows.map(r => r.category).sort()).toEqual([...speciesCategories].sort());
    // Imported nurseries start without stock: an admin adds it when switching them on
    const empty = await one<{ n: number }>('SELECT count(*)::int AS n FROM nurseries WHERE external_ref IS NULL AND NOT EXISTS (SELECT 1 FROM inventory WHERE nursery_id = nurseries.id)');
    expect(empty.n).toBe(0);
  });

  it('stores the admin with a normalised phone, lower-case email and an argon2 hash', async () => {
    const admin = await one<{ phone: string; email: string; password_hash: string; phone_verified: boolean }>(
      `SELECT phone, email, password_hash, phone_verified FROM users WHERE role = 'admin'`
    );
    expect(admin).toMatchObject({ phone: '+256700000001', email: 'admin@example.org', phone_verified: true });
    expect(admin.password_hash).toMatch(/^\$argon2id\$/);
  });
});

describe('geometry', () => {
  it('uses SRID 4326 for every geometry column', async () => {
    const { rows } = await pool.query<{ table: string; column: string; srid: number }>(
      `SELECT f_table_name AS table, f_geometry_column AS column, srid FROM geometry_columns WHERE f_table_schema = 'public'`
    );
    expect(rows).toHaveLength(6);
    expect(rows.every(r => r.srid === 4326)).toBe(true);
  });

  it('has a GiST index on every geometry column', async () => {
    const { rows } = await pool.query<{ table: string; column: string; has_gist: boolean }>(`
      SELECT c.table_name AS table, c.column_name AS column,
        EXISTS (
          SELECT 1 FROM pg_index i
          JOIN pg_class t ON t.oid = i.indrelid
          JOIN pg_class ix ON ix.oid = i.indexrelid
          JOIN pg_am am ON am.oid = ix.relam
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
          WHERE t.relname = c.table_name AND a.attname = c.column_name AND am.amname = 'gist'
        ) AS has_gist
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.udt_name = 'geometry'`);
    expect(rows.map(r => `${r.table}.${r.column}`).sort()).toEqual([
      'admin_boundaries.geom', 'forest_loss_cells.geom', 'nurseries.location',
      'orders.delivery_point', 'service_zones.geom', 'shadow_zones.geom',
    ]);
    expect(rows.filter(r => !r.has_gist)).toEqual([]);
  });

  it('places every nursery inside its sub-county, and every sub-county inside the district', async () => {
    const misplaced = await one<{ n: number }>(`
      SELECT count(*)::int AS n FROM nurseries n
      JOIN admin_boundaries sc ON sc.id = n.sub_county_id
      WHERE NOT ST_Contains(sc.geom, n.location) OR sc.parent_id <> n.district_id`);
    expect(misplaced.n).toBe(0);

    // Repairing the simplified shapes (ST_MakeValid) leaves a few slivers of ~20 m²; anything bigger is a real error
    const outside = await one<{ n: number }>(`
      SELECT count(*)::int AS n FROM admin_boundaries sc
      JOIN admin_boundaries d ON d.id = sc.parent_id
      WHERE ST_Area(ST_Difference(sc.geom, d.geom)::geography) > 100`);
    expect(outside.n).toBe(0);

    const invalid = await one<{ n: number }>(`SELECT count(*)::int AS n FROM admin_boundaries WHERE NOT ST_IsValid(geom) OR ST_IsEmpty(geom)`);
    expect(invalid.n).toBe(0);
  });
});

describe('2018 certified nursery list', () => {
  it('imports all 62 switched off, each with a note and a location inside its sub-county', async () => {
    const row = await one<{ total: number; active: number; noted: number; demo: number }>(`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE is_active)::int AS active,
             count(*) FILTER (WHERE listing_note LIKE 'Imported from the 2018 list%')::int AS noted,
             count(*) FILTER (WHERE is_demo)::int AS demo
      FROM nurseries WHERE external_ref LIKE 'SPGS-2018-%'`);
    expect(row).toEqual({ total: 62, active: 0, noted: 62, demo: 0 });
  });
});

describe('constraints', () => {
  const anyInventory = () => one<{ id: string }>('SELECT id FROM inventory LIMIT 1');

  it('never lets stock go negative', async () => {
    const { id } = await anyInventory();
    await inRollback(pool, async db => {
      expect(await pgErrorCode(db.query('UPDATE inventory SET quantity_available = -1 WHERE id = $1', [id]))).toBe(CHECK_VIOLATION);
    });
  });

  it('keeps campaign remaining stock between 0 and the allocation', async () => {
    const campaign = await one<{ id: string }>('SELECT id FROM campaigns LIMIT 1');
    await inRollback(pool, async db => {
      await db.query('SAVEPOINT s');
      expect(await pgErrorCode(db.query('UPDATE campaigns SET remaining_stock = allocated_stock + 1 WHERE id = $1', [campaign.id]))).toBe(CHECK_VIOLATION);
      await db.query('ROLLBACK TO SAVEPOINT s');
      expect(await pgErrorCode(db.query('UPDATE campaigns SET remaining_stock = -1 WHERE id = $1', [campaign.id]))).toBe(CHECK_VIOLATION);
    });
  });

  it('only accepts E.164 Ugandan mobile numbers', async () => {
    await inRollback(pool, async db => {
      const code = await pgErrorCode(db.query(`INSERT INTO users (full_name, phone, password_hash) VALUES ('X', '0772123456', 'h')`));
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  it('allows one application per user per campaign', async () => {
    const campaign = await one<{ id: string }>('SELECT id FROM campaigns LIMIT 1');
    await inRollback(pool, async db => {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO users (full_name, phone, password_hash) VALUES ('Applicant', '+256772000111', 'h') RETURNING id`
      );
      const userId = rows[0]?.id;
      const insert = () => db.query(
        `INSERT INTO campaign_applications (campaign_id, user_id, answers, quantity_requested) VALUES ($1, $2, '{}', 10)`,
        [campaign.id, userId]
      );
      await insert();
      expect(await pgErrorCode(insert())).toBe(UNIQUE_VIOLATION);
    });
  });

  it('rejects orders whose totals do not add up, and delivery orders without a point and address (FR-25)', async () => {
    const nursery = await one<{ id: string }>('SELECT id FROM nurseries LIMIT 1');
    await inRollback(pool, async db => {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO users (full_name, phone, password_hash) VALUES ('Buyer', '+256772000222', 'h') RETURNING id`
      );
      const userId = rows[0]?.id;
      const order = (overrides: string) => db.query(
        `INSERT INTO orders (short_code, user_id, nursery_id, delivery_type, delivery_fee, items_total, grand_total, payment_method, delivery_point, delivery_address)
         SELECT 'ABC123', $1, $2, ${overrides}`,
        [userId, nursery.id]
      );
      await db.query('SAVEPOINT s');
      expect(await pgErrorCode(order(`'self_pickup', 0, 10000, 9000, 'mtn_momo', NULL, NULL`))).toBe(CHECK_VIOLATION);
      await db.query('ROLLBACK TO SAVEPOINT s');
      expect(await pgErrorCode(order(`'order_and_deliver', 5000, 10000, 15000, 'mtn_momo', NULL, 'Near the market'`))).toBe(CHECK_VIOLATION);
      await db.query('ROLLBACK TO SAVEPOINT s');
      expect(await pgErrorCode(order(`'self_pickup', 5000, 10000, 15000, 'mtn_momo', NULL, NULL`))).toBe(CHECK_VIOLATION);
      await db.query('ROLLBACK TO SAVEPOINT s');
      // A valid delivery order goes in
      expect(await pgErrorCode(order(`'order_and_deliver', 5000, 10000, 15000, 'mtn_momo', ST_SetSRID(ST_MakePoint(32.75, 0.35), 4326), 'Near the market'`))).toBeUndefined();
    });
  });

  it('keeps order line totals consistent with quantity and price', async () => {
    const { id } = await anyInventory();
    await inRollback(pool, async db => {
      const { rows: [user] } = await db.query<{ id: string }>(`INSERT INTO users (full_name, phone, password_hash) VALUES ('B', '+256772000333', 'h') RETURNING id`);
      const { rows: [order] } = await db.query<{ id: string }>(
        `INSERT INTO orders (short_code, user_id, nursery_id, delivery_type, delivery_fee, items_total, grand_total, payment_method)
         SELECT 'XYZ789', $1, nursery_id, 'self_pickup', 0, 1000, 1000, 'airtel_money' FROM inventory WHERE id = $2 RETURNING id`,
        [user?.id, id]
      );
      const code = await pgErrorCode(db.query(
        `INSERT INTO order_items (order_id, inventory_id, species_id, quantity, unit_price_snapshot, line_total)
         SELECT $1, id, species_id, 2, 500, 999 FROM inventory WHERE id = $2`,
        [order?.id, id]
      ));
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  it('keeps updated_at current on raw-SQL updates', async () => {
    const { id } = await anyInventory();
    await inRollback(pool, async db => {
      await db.query(`UPDATE inventory SET updated_at = now() - interval '1 day' WHERE id = $1`, [id]);
      // Without the trigger updated_at would still be a day old
      const { rows: [row] } = await db.query<{ fresh: boolean }>(
        `UPDATE inventory SET quantity_available = quantity_available WHERE id = $1 RETURNING updated_at > now() - interval '1 hour' AS fresh`,
        [id]
      );
      expect(row?.fresh).toBe(true);
    });
  });

  it('makes the audit log append-only', async () => {
    await inRollback(pool, async db => {
      const { rows: [row] } = await db.query<{ id: number }>(
        `INSERT INTO audit_log (action, entity, entity_id) VALUES ('test.write', 'test', '1') RETURNING id`
      );
      await db.query('SAVEPOINT s');
      expect(await pgErrorCode(db.query(`UPDATE audit_log SET action = 'changed' WHERE id = $1`, [row?.id]))).toBe('42501');
      await db.query('ROLLBACK TO SAVEPOINT s');
      expect(await pgErrorCode(db.query('DELETE FROM audit_log WHERE id = $1', [row?.id]))).toBe('42501');
    });
  });
});
