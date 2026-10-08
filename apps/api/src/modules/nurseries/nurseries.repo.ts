import { sql, type SQL } from 'drizzle-orm';
import type { CertificationStatus, NurseryType, SpeciesCategory } from '@nurserylink/shared';
import type { DbOrTx } from '../../db/client.js';
import type { LatLng } from '../../lib/geo.js';
import { containsPattern } from '../../lib/sqlText.js';

export interface NurseryFilters {
  districtId?: string | undefined;
  subCountyId?: string | undefined;
  /** Free text matched against species common, scientific and local names */
  species?: string | undefined;
  speciesId?: string | undefined;
  /** Stocks at least one tree of this category */
  category?: SpeciesCategory | undefined;
  q?: string | undefined;
  hasCampaign?: boolean | undefined;
}

export type NurseryRow = {
  id: string;
  name: string;
  type: NurseryType;
  certification_status: CertificationStatus;
  operator_name: string;
  contact_phone: string;
  annual_capacity: number;
  seed_source: string | null;
  is_demo: boolean;
  district_id: string;
  district_name: string;
  sub_county_id: string;
  sub_county_name: string;
  lat: number;
  lng: number;
  has_active_campaign: boolean;
  total_stock: number;
  species_count: number;
  stock_updated_at: Date | null;
  straight_km: number | null;
  total: number;
};

const pointSql = (p: LatLng) => sql`ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)`;

/** A campaign that is switched on, running today and not yet exhausted. */
export const activeCampaignSql = (nurseryId: SQL) => sql`EXISTS (
  SELECT 1 FROM campaigns c
  WHERE c.nursery_id = ${nurseryId} AND c.is_active AND now() BETWEEN c.starts_at AND c.ends_at AND c.remaining_stock > 0
)`;

/** The nursery has this tree in stock, matched by common, scientific or local name. */
const stocksSpeciesSql = (pattern: string) => sql`EXISTS (
  SELECT 1 FROM inventory i
  JOIN species s ON s.id = i.species_id
  WHERE i.nursery_id = n.id AND i.quantity_available > 0
    AND (s.common_name ILIKE ${pattern} OR s.scientific_name ILIKE ${pattern}
         OR EXISTS (SELECT 1 FROM species_local_names l WHERE l.species_id = s.id AND l.name ILIKE ${pattern}))
)`;

const whereSql = (f: NurseryFilters): SQL => {
  const conditions: SQL[] = [sql`n.is_active`];
  if (f.districtId) conditions.push(sql`n.district_id = ${f.districtId}`);
  if (f.subCountyId) conditions.push(sql`n.sub_county_id = ${f.subCountyId}`);
  // The one search box (FR-06): a nursery's name or a tree it stocks
  if (f.q) {
    const pattern = containsPattern(f.q);
    conditions.push(sql`(n.name ILIKE ${pattern} OR ${stocksSpeciesSql(pattern)})`);
  }
  if (f.hasCampaign !== undefined) {
    conditions.push(f.hasCampaign ? activeCampaignSql(sql`n.id`) : sql`NOT ${activeCampaignSql(sql`n.id`)}`);
  }
  if (f.speciesId) {
    conditions.push(sql`EXISTS (SELECT 1 FROM inventory i WHERE i.nursery_id = n.id AND i.species_id = ${f.speciesId} AND i.quantity_available > 0)`);
  }
  if (f.species) conditions.push(stocksSpeciesSql(containsPattern(f.species)));
  if (f.category) {
    conditions.push(sql`EXISTS (SELECT 1 FROM inventory i JOIN species s ON s.id = i.species_id
                                WHERE i.nursery_id = n.id AND i.quantity_available > 0 AND s.category = ${f.category})`);
  }
  return sql.join(conditions, sql` AND `);
};

export interface ListOptions {
  /** When set, each row gets straight_km from this point */
  point?: LatLng | undefined;
  /** 'name' = alphabetical (sample nurseries last); 'knn' = nearest first by straight line (uses the GiST index) */
  order: 'name' | 'knn';
  limit: number;
  offset: number;
}

/** One query shape for both the list and the single-nursery lookup. */
const selectNurseries = async (db: DbOrTx, where: SQL, options: ListOptions): Promise<NurseryRow[]> => {
  const { point } = options;
  const straightKm = point ? sql`ST_Distance(n.location::geography, ${pointSql(point)}::geography) / 1000` : sql`NULL::float8`;
  // Alphabetical, with invented sample nurseries after the real ones
  const orderBy = options.order === 'knn' && point ? sql`n.location <-> ${pointSql(point)}` : sql`n.is_demo, lower(n.name), n.id`;

  const result = await db.execute<NurseryRow>(sql`
    SELECT n.id, n.name, n.type, n.certification_status, n.operator_name, n.contact_phone, n.annual_capacity, n.seed_source, n.is_demo,
           d.id AS district_id, d.name AS district_name, sc.id AS sub_county_id, sc.name AS sub_county_name,
           ST_Y(n.location) AS lat, ST_X(n.location) AS lng,
           ${activeCampaignSql(sql`n.id`)} AS has_active_campaign,
           COALESCE(stock.total_stock, 0)::int AS total_stock,
           COALESCE(stock.species_count, 0)::int AS species_count,
           stock.stock_updated_at,
           ${straightKm} AS straight_km,
           count(*) OVER ()::int AS total
    FROM nurseries n
    JOIN admin_boundaries d ON d.id = n.district_id
    JOIN admin_boundaries sc ON sc.id = n.sub_county_id
    LEFT JOIN LATERAL (
      SELECT sum(i.quantity_available) AS total_stock,
             count(*) FILTER (WHERE i.quantity_available > 0) AS species_count,
             max(i.updated_at) AS stock_updated_at
      FROM inventory i WHERE i.nursery_id = n.id
    ) stock ON true
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ${options.limit} OFFSET ${options.offset}
  `);
  return result.rows;
};

export const listNurseries = (db: DbOrTx, filters: NurseryFilters, options: ListOptions): Promise<NurseryRow[]> =>
  selectNurseries(db, whereSql(filters), options);

/** An active nursery by id, or undefined. */
export const findNursery = async (db: DbOrTx, id: string, point?: LatLng): Promise<NurseryRow | undefined> =>
  (await selectNurseries(db, sql`n.id = ${id} AND n.is_active`, { point, order: 'name', limit: 1, offset: 0 }))[0];

export type InventoryRow = {
  inventory_id: string;
  species_id: string;
  slug: string;
  common_name: string;
  scientific_name: string;
  category: SpeciesCategory;
  quantity_available: number;
  unit_price: number;
  updated_at: Date;
};

export const listInventory = async (db: DbOrTx, nurseryIds: string[], speciesId?: string): Promise<(InventoryRow & { nursery_id: string })[]> => {
  if (nurseryIds.length === 0) return [];
  const result = await db.execute<InventoryRow & { nursery_id: string }>(sql`
    SELECT i.id AS inventory_id, i.nursery_id, s.id AS species_id, s.slug, s.common_name, s.scientific_name, s.category,
           i.quantity_available, i.unit_price, i.updated_at
    FROM inventory i JOIN species s ON s.id = i.species_id
    WHERE i.nursery_id IN (${sql.join(nurseryIds.map(id => sql`${id}::uuid`), sql`, `)})
      ${speciesId ? sql`AND i.species_id = ${speciesId}` : sql``}
    ORDER BY lower(s.common_name)`);
  return result.rows;
};

export type NurseryCampaignRow = {
  id: string;
  title: string;
  remaining_stock: number;
  allocated_stock: number;
  ends_at: Date;
};

export const listActiveCampaigns = async (db: DbOrTx, nurseryId: string): Promise<NurseryCampaignRow[]> => {
  const result = await db.execute<NurseryCampaignRow>(sql`
    SELECT c.id, c.title, c.remaining_stock, c.allocated_stock, c.ends_at FROM campaigns c
    WHERE c.nursery_id = ${nurseryId} AND c.is_active AND now() BETWEEN c.starts_at AND c.ends_at AND c.remaining_stock > 0
    ORDER BY c.ends_at`);
  return result.rows;
};
