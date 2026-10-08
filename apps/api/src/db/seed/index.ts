import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import type pg from 'pg';
import { and, eq, sql } from 'drizzle-orm';
import { toE164UgandaMobile } from '@nurserylink/shared';
import { parseConfig, type Config } from '../../config.js';
import { hashPassword } from '../../lib/password.js';
import { createDb, createPool, type Tx } from '../client.js';
import {
  adminBoundaries,
  campaignItems,
  campaigns,
  deliveryRates,
  inventory,
  newsPosts,
  nurseries,
  species,
  speciesLocalNames,
  speciesMedia,
  users,
} from '../schema.js';
import { NFA_PRICES, SPECIES } from './species.js';
import { NURSERIES, PREVIOUS_SEED_LOCATIONS, STOCK_ADDITIONS } from './nurseries.js';
import { CAMPAIGNS, DELIVERY_RATES, NEWS_POSTS } from './content.js';

export interface SeedOptions {
  admin: { fullName: string; phone: string; email?: string | undefined; password: string };
}


const point = ([lng, lat]: [number, number]) => sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;

export const seedOptionsFromConfig = (config: Config): SeedOptions => {
  const { ADMIN_FULL_NAME, ADMIN_PHONE, ADMIN_EMAIL, ADMIN_PASSWORD } = config;
  if (!ADMIN_FULL_NAME || !ADMIN_PHONE || !ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_FULL_NAME, ADMIN_PHONE and ADMIN_PASSWORD in .env to seed the first administrator');
  }
  return { admin: { fullName: ADMIN_FULL_NAME, phone: ADMIN_PHONE, email: ADMIN_EMAIL, password: ADMIN_PASSWORD } };
};

/** The pilot district; seeded campaigns and the forest-loss sample are here. */
const PILOT_DISTRICT = 'Mukono';

/**
 * Names of the hand-drawn Mukono pilot boundaries (before October 2026) that UBOS spells differently.
 * Renaming them first lets existing rows take their official codes, so ids and references survive.
 */
const RENAMED_SUB_COUNTIES: Record<string, string> = {
  'Mukono Central Division': 'Central Division',
  'Seeta-Namuganga': 'Seeta Namuganga',
  Koome: 'Koome Island',
};

interface BoundaryFeature {
  properties: { code: string; name: string; level: 'district' | 'sub_county'; parent_code: string | null };
  geometry: unknown;
}

/** Official districts and sub-counties (UBOS via OCHA HDX, CC BY-IGO; see scripts/boundaries/build.sh). */
const loadBoundaryFile = (): BoundaryFeature[] => {
  const file = new URL('./data/uga-boundaries.geojson.gz', import.meta.url);
  const parsed = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as { features: BoundaryFeature[] };
  return parsed.features;
};

/**
 * Upserts every district and sub-county by its official code. Rows from the old hand-drawn pilot are
 * matched by name first (so nurseries, campaigns and shadow zones keep pointing at the same ids),
 * and leftovers nothing refers to are removed. Returns the pilot district's id.
 */
const seedBoundaries = async (tx: Tx) => {
  const features = loadBoundaryFile();
  const rows = (level: 'district' | 'sub_county') =>
    JSON.stringify(features.filter(f => f.properties.level === level).map(f => ({ ...f.properties, geometry: f.geometry })));

  // 1. Adopt hand-drawn rows: official spelling, then the official code of the same-named boundary
  for (const [from, to] of Object.entries(RENAMED_SUB_COUNTIES)) {
    await tx.execute(sql`
      UPDATE admin_boundaries b SET name = ${to}
      FROM admin_boundaries d
      WHERE b.code IS NULL AND b.level = 'sub_county' AND b.name = ${from} AND d.id = b.parent_id AND d.name = ${PILOT_DISTRICT}`);
  }
  await tx.execute(sql`
    UPDATE admin_boundaries b SET code = f.code
    FROM json_to_recordset(${rows('district')}::json) AS f(code text, name text)
    WHERE b.code IS NULL AND b.level = 'district' AND b.name = f.name`);
  await tx.execute(sql`
    UPDATE admin_boundaries b SET code = f.code
    FROM json_to_recordset(${rows('sub_county')}::json) AS f(code text, name text, parent_code text), admin_boundaries d
    WHERE b.code IS NULL AND b.level = 'sub_county' AND b.name = f.name AND d.id = b.parent_id AND d.code = f.parent_code`);

  // 2. Upsert everything by code; geometry is only rewritten when it changed
  const geom = sql`ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(f.geometry), 4326)), 3))`;
  await tx.execute(sql`
    INSERT INTO admin_boundaries (code, name, level, parent_id, geom)
    SELECT f.code, f.name, 'district', NULL, ${geom}
    FROM json_to_recordset(${rows('district')}::json) AS f(code text, name text, geometry text)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, geom = EXCLUDED.geom
      WHERE admin_boundaries.name IS DISTINCT FROM EXCLUDED.name OR NOT ST_Equals(admin_boundaries.geom, EXCLUDED.geom)`);
  await tx.execute(sql`
    INSERT INTO admin_boundaries (code, name, level, parent_id, geom)
    SELECT f.code, f.name, 'sub_county', d.id, ${geom}
    FROM json_to_recordset(${rows('sub_county')}::json) AS f(code text, name text, parent_code text, geometry text)
    JOIN admin_boundaries d ON d.code = f.parent_code
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, geom = EXCLUDED.geom
      WHERE admin_boundaries.name IS DISTINCT FROM EXCLUDED.name OR admin_boundaries.parent_id IS DISTINCT FROM EXCLUDED.parent_id
         OR NOT ST_Equals(admin_boundaries.geom, EXCLUDED.geom)`);

  // 3. Sample nurseries still where the hand-drawn map put them move into the sub-county they're named after
  for (const [name, [lng, lat]] of Object.entries(PREVIOUS_SEED_LOCATIONS)) {
    const target = NURSERIES.find(n => n.name === name);
    if (!target) continue;
    await tx.execute(sql`
      UPDATE nurseries SET location = ${point(target.location)}
      WHERE name = ${name} AND ST_Equals(location, ${point([lng, lat])})`);
  }
  // Every nursery's district and sub-county follow from where it is, as for admin edits
  await tx.execute(sql`
    UPDATE nurseries n SET sub_county_id = sc.id, district_id = sc.parent_id
    FROM admin_boundaries sc
    WHERE sc.level = 'sub_county' AND sc.code IS NOT NULL AND ST_Contains(sc.geom, n.location)
      AND (n.sub_county_id IS DISTINCT FROM sc.id OR n.district_id IS DISTINCT FROM sc.parent_id)`);

  // 4. Hand-drawn leftovers that nothing refers to any more
  await tx.execute(sql`
    DELETE FROM admin_boundaries b
    WHERE b.code IS NULL AND b.level = 'sub_county'
      AND NOT EXISTS (SELECT 1 FROM nurseries n WHERE n.sub_county_id = b.id)
      AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.sub_county_id = b.id)`);

  const [district] = await tx
    .select({ id: adminBoundaries.id })
    .from(adminBoundaries)
    .where(and(eq(adminBoundaries.level, 'district'), eq(adminBoundaries.name, PILOT_DISTRICT)));
  if (!district) throw new Error(`The boundary file has no district called ${PILOT_DISTRICT}`);
  return district.id;
};

const seedSpecies = async (tx: Tx) => {
  const ids = new Map<string, string>();
  for (const s of SPECIES) {
    const values = {
      slug: s.slug,
      scientificName: s.scientificName,
      commonName: s.commonName,
      category: s.category,
      growthPace: s.growthPace,
      heightTimeline: s.heightTimeline,
      canopyNotes: s.canopyNotes,
      rootNotes: s.rootNotes,
      ecologicalZones: s.ecologicalZones,
      referencePriceUgx: NFA_PRICES[s.slug]?.[0] ?? null,
      referencePotInches: NFA_PRICES[s.slug]?.[1] ?? null,
    };
    const [row] = await tx
      .insert(species)
      .values(values)
      .onConflictDoUpdate({ target: species.slug, set: values })
      .returning({ id: species.id });
    if (!row) throw new Error(`Species upsert returned no row: ${s.slug}`);
    ids.set(s.slug, row.id);

    // Local names and media are owned by the seed for seeded species: replace them wholesale
    await tx.delete(speciesLocalNames).where(eq(speciesLocalNames.speciesId, row.id));
    if (s.localNames.length) {
      await tx.insert(speciesLocalNames).values(s.localNames.map(l => ({ speciesId: row.id, ...l })));
    }
    await tx.delete(speciesMedia).where(eq(speciesMedia.speciesId, row.id));
    if (s.media.length) {
      await tx.insert(speciesMedia).values(s.media.map((m, i) => ({ speciesId: row.id, url: m.url, caption: m.caption, sortOrder: i })));
    }
  }
  return ids;
};

/** Nurseries are created once and never overwritten, so admin edits survive re-seeding. */
const seedNurseries = async (tx: Tx, speciesIds: Map<string, string>) => {
  const ids = new Map<string, string>();
  for (const n of NURSERIES) {
    const [existing] = await tx.select({ id: nurseries.id }).from(nurseries).where(eq(nurseries.name, n.name));
    let id = existing?.id;

    if (!id) {
      // The containing sub-county polygon decides both FKs, so location and boundaries always agree
      const found = await tx.execute<{ id: string; parent_id: string }>(sql`
        SELECT id, parent_id FROM admin_boundaries
        WHERE level = 'sub_county' AND ST_Contains(geom, ${point(n.location)})
        LIMIT 1`);
      const subCounty = found.rows[0];
      if (!subCounty) throw new Error(`Nursery "${n.name}" at ${n.location.join(', ')} is outside every sub-county`);

      const [created] = await tx
        .insert(nurseries)
        .values({
          name: n.name,
          type: n.type,
          districtId: subCounty.parent_id,
          subCountyId: subCounty.id,
          location: point(n.location),
          operatorName: n.operatorName,
          contactPhone: n.contactPhone,
          payoutPhone: n.payoutPhone,
          annualCapacity: n.annualCapacity,
          seedSource: n.seedSource,
          certificationStatus: n.certificationStatus,
        })
        .returning({ id: nurseries.id });
      if (!created) throw new Error(`Nursery insert returned no row: ${n.name}`);
      id = created.id;

      for (const [slug, quantityAvailable, unitPrice] of n.inventory) {
        const speciesId = speciesIds.get(slug);
        if (!speciesId) throw new Error(`Unknown species "${slug}" in inventory of ${n.name}`);
        await tx.insert(inventory).values({ nurseryId: id, speciesId, quantityAvailable, unitPrice }).onConflictDoNothing();
      }
    }
    ids.set(n.name, id);
  }
  return ids;
};

/** Each batch of STOCK_ADDITIONS once per database; nurseries that no longer exist are skipped. */
const seedStockAdditions = async (tx: Tx, speciesIds: Map<string, string>, nurseryIds: Map<string, string>) => {
  for (const batch of STOCK_ADDITIONS) {
    const done = await tx.execute(sql`SELECT 1 FROM audit_log WHERE action = 'seed.stock_added' AND after->>'key' = ${batch.key} LIMIT 1`);
    if (done.rows.length > 0) continue;
    let added = 0;
    for (const [name, slug, quantityAvailable, unitPrice] of batch.lines) {
      const speciesId = speciesIds.get(slug);
      if (!speciesId) throw new Error(`Unknown species "${slug}" in stock additions for ${name}`);
      const nurseryId = nurseryIds.get(name);
      if (!nurseryId) continue;
      const inserted = await tx.insert(inventory).values({ nurseryId, speciesId, quantityAvailable, unitPrice }).onConflictDoNothing().returning({ id: inventory.id });
      added += inserted.length;
    }
    await tx.execute(sql`INSERT INTO audit_log (actor_id, action, entity, entity_id, after)
                         VALUES (NULL, 'seed.stock_added', 'inventory', NULL, ${JSON.stringify({ key: batch.key, lines: added })}::jsonb)`);
  }
};

const seedContent = async (tx: Tx, districtId: string, speciesIds: Map<string, string>, nurseryIds: Map<string, string>) => {
  for (const rate of DELIVERY_RATES) {
    const [existing] = await tx.select({ id: deliveryRates.id }).from(deliveryRates).where(eq(deliveryRates.vehicle, rate.vehicle));
    if (!existing) await tx.insert(deliveryRates).values(rate);
  }

  for (const post of NEWS_POSTS) {
    await tx
      .insert(newsPosts)
      .values({ ...post, publishedAt: new Date(post.publishedAt), isPublished: true })
      .onConflictDoNothing({ target: newsPosts.slug });
  }

  for (const c of CAMPAIGNS) {
    const [existing] = await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.title, c.title));
    if (existing) continue;

    const nurseryId = nurseryIds.get(c.nurseryName);
    const [subCounty] = await tx
      .select({ id: adminBoundaries.id })
      .from(adminBoundaries)
      .where(and(eq(adminBoundaries.level, 'sub_county'), eq(adminBoundaries.parentId, districtId), eq(adminBoundaries.name, c.subCountyName)));
    if (!nurseryId || !subCounty) throw new Error(`Campaign "${c.title}" refers to an unknown nursery or sub-county`);

    const itemsTotal = c.items.reduce((sum, [, qty]) => sum + qty, 0);
    if (itemsTotal !== c.allocatedStock) throw new Error(`Campaign "${c.title}" items (${itemsTotal}) do not add up to allocated stock`);

    const [created] = await tx
      .insert(campaigns)
      .values({
        nurseryId,
        title: c.title,
        funderName: c.funderName,
        funderType: c.funderType,
        purpose: c.purpose,
        subCountyId: subCounty.id,
        allocatedStock: c.allocatedStock,
        remainingStock: c.remainingStock,
        eligibilityRules: c.eligibilityRules,
        startsAt: new Date(c.startsAt),
        endsAt: new Date(c.endsAt),
      })
      .returning({ id: campaigns.id });
    if (!created) throw new Error(`Campaign insert returned no row: ${c.title}`);

    await tx.insert(campaignItems).values(
      c.items.map(([slug, quantity]) => {
        const speciesId = speciesIds.get(slug);
        if (!speciesId) throw new Error(`Unknown species "${slug}" in campaign ${c.title}`);
        return { campaignId: created.id, speciesId, quantity };
      })
    );
  }
};

interface CertifiedNursery2018 {
  ref: string;
  cluster: string;
  name: string;
  district_2018: string;
  town: string;
  contact: string;
  phone: string;
  stars: number;
  location: [number, number] | null;
  located_by: string | null;
}

/** People listed under their own name are individuals' nurseries; the rest are businesses. */
const INDIVIDUAL_NURSERIES = new Set(['Waiswa David', 'Tom Orech Omara']);

/**
 * The 2018 list of certified Eucalyptus clonal nurseries (SPGS III), imported switched OFF with a
 * note for admins: they are real businesses with 2018 contacts, so nothing is published until an
 * admin has phoned to confirm (Data Protection and Privacy Act 2019). Created once by reference;
 * admin edits and activations are never overwritten.
 */
const seedCertified2018 = async (tx: Tx) => {
  const file = new URL('./data/certified-nurseries-2018.json', import.meta.url);
  const { nurseries: list } = JSON.parse(readFileSync(file, 'utf8')) as { nurseries: CertifiedNursery2018[] };
  // A business listed at several sites gets the town in its name, so the sites can be told apart
  const sites = new Map<string, number>();
  for (const n of list) sites.set(n.name, (sites.get(n.name) ?? 0) + 1);

  for (const n of list) {
    const phone = toE164UgandaMobile(n.phone);
    if (!phone) throw new Error(`${n.ref}: not a Ugandan mobile number: ${n.phone}`);
    const name = (sites.get(n.name) ?? 0) > 1 ? `${n.name} (${n.town.split(/[-,]/)[0]?.trim() ?? n.town})` : n.name;
    const where = n.location
      ? `found on OpenStreetMap at ${n.town} (check on the map)`
      : `not found on OpenStreetMap: placed inside ${n.district_2018} district, so set the real location`;
    const note =
      `Imported from the 2018 list of certified Eucalyptus clonal nurseries (SPGS III, ${n.cluster} cluster, ${String(n.stars)}★; ` +
      `listed in ${n.district_2018} at ${n.town}). Before switching it on, phone ${n.contact} to confirm it still operates, ` +
      `its current certification, stock and prices, and that they agree to be listed. Location ${where}.`;
    // The town's point, or a point inside the listed district when the town wasn't found
    const pt = n.location
      ? point(n.location)
      : sql`(SELECT ST_PointOnSurface(geom) FROM admin_boundaries WHERE level = 'district' AND name = ${n.district_2018})`;
    await tx.execute(sql`
      WITH p AS (SELECT ${pt} AS pt),
      sc AS (SELECT b.id, b.parent_id FROM admin_boundaries b, p WHERE b.level = 'sub_county' AND ST_Contains(b.geom, p.pt) LIMIT 1)
      INSERT INTO nurseries (external_ref, name, type, operator_name, contact_phone, payout_phone, annual_capacity, seed_source,
                             certification_status, is_active, listing_note, location, district_id, sub_county_id)
      SELECT ${n.ref}, ${name}, ${INDIVIDUAL_NURSERIES.has(n.name) ? 'private' : 'commercial'}, ${n.contact}, ${phone}, ${phone}, 0,
             'Eucalyptus hybrid clones (certified clonal nursery, SPGS 2018)', 'pending', false, ${note}, p.pt, sc.parent_id, sc.id
      FROM p, sc
      ON CONFLICT (external_ref) DO NOTHING`);
  }
};

/** Creates the first administrator. An existing account keeps its password; only name and role are refreshed. */
const seedAdmin = async (tx: Tx, admin: SeedOptions['admin']) => {
  const phone = toE164UgandaMobile(admin.phone);
  if (!phone) throw new Error(`ADMIN_PHONE is not a valid Ugandan mobile number: ${admin.phone}`);
  await tx
    .insert(users)
    .values({
      fullName: admin.fullName,
      phone,
      email: admin.email?.toLowerCase() ?? null,
      passwordHash: await hashPassword(admin.password),
      role: 'admin',
      phoneVerified: true,
    })
    .onConflictDoUpdate({ target: users.phone, set: { fullName: admin.fullName, role: 'admin' } });
};

/** Seeds reference and sample data. Idempotent: safe to run on every deploy. */
export const seed = async (pool: pg.Pool, options: SeedOptions) => {
  const db = createDb(pool);
  await db.transaction(async tx => {
    const districtId = await seedBoundaries(tx);
    const speciesIds = await seedSpecies(tx);
    const nurseryIds = await seedNurseries(tx, speciesIds);
    await seedStockAdditions(tx, speciesIds, nurseryIds);
    await seedContent(tx, districtId, speciesIds, nurseryIds);
    await seedCertified2018(tx);
    await seedAdmin(tx, options.admin);
  });

  const counts = await pool.query<Record<string, number>>(`
    SELECT
      (SELECT count(*)::int FROM admin_boundaries WHERE level = 'district') AS districts,
      (SELECT count(*)::int FROM admin_boundaries WHERE level = 'sub_county') AS sub_counties,
      (SELECT count(*)::int FROM species) AS species,
      (SELECT count(*)::int FROM nurseries) AS nurseries,
      (SELECT count(*)::int FROM inventory) AS inventory_rows,
      (SELECT count(*)::int FROM delivery_rates) AS delivery_rates,
      (SELECT count(*)::int FROM news_posts) AS news_posts,
      (SELECT count(*)::int FROM campaigns) AS campaigns,
      (SELECT count(*)::int FROM users WHERE role = 'admin') AS admins`);
  return counts.rows[0];
};

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const config = parseConfig(process.env);
  const pool = createPool(config.DATABASE_URL);
  try {
    console.log('Seeded:', await seed(pool, seedOptionsFromConfig(config)));
  } finally {
    await pool.end();
  }
}
