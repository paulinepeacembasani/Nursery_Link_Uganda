import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import type pg from 'pg';
import { parseConfig } from '../config.js';
import { createPool } from './client.js';

/**
 * DEVELOPMENT AND DEMOS ONLY: 1,500 invented nurseries across 30 districts, from the generated
 * spreadsheets cleaned by scripts/demo-nurseries/convert.py (no real phone numbers or emails).
 * Refuses to run in production.
 *
 * - Each is marked `is_demo`: the site labels it "Sample nursery" and hides its phone, it is never
 *   texted, and it can't take orders while payments are live.
 * - Phones are placeholders (+256 7009 xxxxx), only because the columns require a number.
 * - District and sub-county follow from the point, like every other nursery.
 * - Upserts by reference (`external_ref`), so re-running refreshes the same rows; demo nurseries no
 *   longer in the file are deleted, or switched off when orders or campaigns refer to them.
 * - Writes a `demo.load` audit entry.
 */
interface DemoNursery {
  ref: string;
  name: string;
  type: 'community' | 'commercial' | 'private';
  operator: string;
  district: string;
  location: [number, number];
  annual_capacity: number;
  certification: 'certified' | 'pending' | 'unverified';
  years: number;
  stock: [string, number, number][];
}

const DATA = new URL('./demo/demo-nurseries.json.gz', import.meta.url);

export const readDemoNurseries = (): DemoNursery[] =>
  (JSON.parse(gunzipSync(readFileSync(DATA)).toString('utf8')) as { nurseries: DemoNursery[] }).nurseries.map(withCropStock);

/**
 * The spreadsheets had no coffee or cocoa, so sample nurseries in districts known for those crops
 * get some (invented, like the rest): about 2 in 5 of them, chosen by reference so it never changes.
 * [slug, districts, typical price in UGX]
 */
const CROPS: [string, string[], number][] = [
  ['robusta-coffee', ['Mukono', 'Luwero', 'Masaka', 'Mityana', 'Mpigi', 'Wakiso', 'Lwengo', 'Bushenyi', 'Jinja', 'Kamuli', 'Kyenjojo', 'Hoima'], 700],
  ['arabica-coffee', ['Kapchorwa', 'Mbale', 'Namisindwa', 'Kasese', 'Bundibugyo', 'Kabarole', 'Arua'], 500],
  ['cocoa', ['Bundibugyo', 'Mukono', 'Luwero', 'Hoima', 'Kasese', 'Kabarole', 'Jinja'], 1000],
];

/** A small deterministic hash (FNV-1a) of a string, for stable pseudo-random choices. */
const hash = (text: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};

export const withCropStock = (n: DemoNursery): DemoNursery => {
  const extra: [string, number, number][] = [];
  for (const [slug, districts, price] of CROPS) {
    const h = hash(`${n.ref}:${slug}`);
    if (!districts.includes(n.district) || h % 5 >= 2 || n.stock.some(([s]) => s === slug)) continue;
    extra.push([slug, 2000 + (h % 19) * 1000, price + ((h >> 8) % 5) * 50]);
  }
  return extra.length ? { ...n, stock: [...n.stock, ...extra] } : n;
};

/** +256 7009 xxxxx from the reference number: a placeholder, never dialled or texted. */
const placeholderPhone = (ref: string) => `+2567009${ref.replace(/\D/g, '').padStart(5, '0').slice(-5)}`;

export const loadDemoNurseries = async (pool: pg.Pool, nurseries = readDemoNurseries()) => {
  const rows = nurseries.map(n => ({
    ref: n.ref,
    name: n.name,
    type: n.type,
    operator: n.operator,
    lng: n.location[0],
    lat: n.location[1],
    capacity: n.annual_capacity,
    certification: n.certification,
    phone: placeholderPhone(n.ref),
    seed_source: `Sample data: ${String(n.years)} years in operation (invented)`,
  }));
  const stock = nurseries.flatMap(n => n.stock.map(([slug, quantity, price]) => ({ ref: n.ref, slug, quantity, price })));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upserted = await client.query<{ id: string }>(
      `WITH f AS (SELECT * FROM json_to_recordset($1::json) AS f(ref text, name text, type nursery_type, operator text, lng float8, lat float8,
                    capacity int, certification certification_status, phone text, seed_source text)),
       placed AS (
         SELECT f.*, ST_SetSRID(ST_MakePoint(f.lng, f.lat), 4326) AS pt, sc.id AS sub_county_id, sc.parent_id AS district_id
         FROM f
         JOIN LATERAL (SELECT id, parent_id FROM admin_boundaries
                       WHERE level = 'sub_county' AND ST_Contains(geom, ST_SetSRID(ST_MakePoint(f.lng, f.lat), 4326)) LIMIT 1) sc ON true
       )
       INSERT INTO nurseries (external_ref, is_demo, name, type, operator_name, location, district_id, sub_county_id,
                              contact_phone, payout_phone, annual_capacity, certification_status, seed_source, is_active)
       SELECT ref, true, name, type, operator, pt, district_id, sub_county_id, phone, phone, capacity, certification, seed_source, true FROM placed
       ON CONFLICT (external_ref) DO UPDATE SET
         is_demo = true, name = EXCLUDED.name, type = EXCLUDED.type, operator_name = EXCLUDED.operator_name, location = EXCLUDED.location,
         district_id = EXCLUDED.district_id, sub_county_id = EXCLUDED.sub_county_id, contact_phone = EXCLUDED.contact_phone,
         payout_phone = EXCLUDED.payout_phone, annual_capacity = EXCLUDED.annual_capacity,
         certification_status = EXCLUDED.certification_status, seed_source = EXCLUDED.seed_source
       RETURNING id`,
      [JSON.stringify(rows)]
    );

    await client.query(
      `INSERT INTO inventory (nursery_id, species_id, quantity_available, unit_price)
       SELECT n.id, s.id, f.quantity, f.price
       FROM json_to_recordset($1::json) AS f(ref text, slug text, quantity int, price int)
       JOIN nurseries n ON n.external_ref = f.ref AND n.is_demo
       JOIN species s ON s.slug = f.slug
       ON CONFLICT (nursery_id, species_id) DO UPDATE SET quantity_available = EXCLUDED.quantity_available, unit_price = EXCLUDED.unit_price`,
      [JSON.stringify(stock)]
    );

    // Demo nurseries dropped from the file: delete them, or switch them off when something refers to them
    const refs = rows.map(r => r.ref);
    const stale = `is_demo AND NOT (external_ref = ANY($1))`;
    const referenced = `EXISTS (SELECT 1 FROM orders o WHERE o.nursery_id = nurseries.id) OR EXISTS (SELECT 1 FROM campaigns c WHERE c.nursery_id = nurseries.id)`;
    await client.query(`UPDATE nurseries SET is_active = false WHERE ${stale} AND (${referenced})`, [refs]);
    await client.query(`DELETE FROM inventory WHERE nursery_id IN (SELECT id FROM nurseries WHERE ${stale} AND NOT (${referenced}))`, [refs]);
    const removed = await client.query(`DELETE FROM nurseries WHERE ${stale} AND NOT (${referenced})`, [refs]);

    const summary = { nurseries: upserted.rowCount ?? 0, skipped_outside_boundaries: rows.length - (upserted.rowCount ?? 0), stock_lines: stock.length, removed: removed.rowCount ?? 0 };
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id, after) VALUES (NULL, 'demo.load', 'nurseries', NULL, $1::jsonb)`,
      [JSON.stringify({ ...summary, source: 'scripts/demo-nurseries/convert.py (invented sample data)' })]
    );
    await client.query('COMMIT');
    return summary;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** Removes every demo nursery (and its stock); ones with orders or campaigns are switched off instead. */
export const removeDemoNurseries = async (pool: pg.Pool) => loadDemoNurseries(pool, []);

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const config = parseConfig(process.env);
  if (config.NODE_ENV === 'production') {
    console.error('Refusing to load demo nurseries into a production database');
    process.exit(1);
  }
  const pool = createPool(config.DATABASE_URL);
  try {
    const remove = process.argv.includes('--remove');
    console.log(remove ? 'Removed demo nurseries:' : 'Loaded demo nurseries:', await (remove ? removeDemoNurseries(pool) : loadDemoNurseries(pool)));
  } finally {
    await pool.end();
  }
}
