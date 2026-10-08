import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  applicationStatuses,
  boundaryLevels,
  certificationStatuses,
  deliveryTypes,
  funderTypes,
  growthPaces,
  newsCategories,
  nurseryTypes,
  orderStatuses,
  otpPurposes,
  paymentKinds,
  paymentMethods,
  paymentProviders,
  paymentStatuses,
  roles,
  serviceRequestStatuses,
  feedbackKinds,
  feedbackStatuses,
  serviceTypes,
  shadowRunStatuses,
  speciesCategories,
  vehicles,
  type EligibilityRule,
  type ShadowRunParams,
} from '@nurserylink/shared';

// ── Column helpers ─────────────────────────────────────────

type GeometryType = 'Point' | 'Polygon' | 'MultiPolygon';

/**
 * PostGIS geometry column, always SRID 4326. Values are written with SQL expressions
 * (e.g. ST_SetSRID(ST_MakePoint(lng, lat), 4326)) and read back through spatial SQL,
 * so the TypeScript side only ever sees the raw EWKB hex string.
 */
const geometry = (name: string, type: GeometryType) =>
  customType<{ data: string; driverData: string }>({
    dataType: () => `geometry(${type}, 4326)`,
  })(name);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
// Kept current by the touch_updated_at trigger (migration 0002), so raw-SQL updates are covered too
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

const E164_UG = `'^\\+2567[0-9]{8}$'`;

// ── Enums (literals come from @nurserylink/shared) ─────────

export const roleEnum = pgEnum('role', roles);
export const boundaryLevelEnum = pgEnum('boundary_level', boundaryLevels);
export const nurseryTypeEnum = pgEnum('nursery_type', nurseryTypes);
export const certificationStatusEnum = pgEnum('certification_status', certificationStatuses);
export const speciesCategoryEnum = pgEnum('species_category', speciesCategories);
export const growthPaceEnum = pgEnum('growth_pace', growthPaces);
export const deliveryTypeEnum = pgEnum('delivery_type', deliveryTypes);
export const orderStatusEnum = pgEnum('order_status', orderStatuses);
export const paymentMethodEnum = pgEnum('payment_method', paymentMethods);
export const paymentProviderEnum = pgEnum('payment_provider', paymentProviders);
export const paymentKindEnum = pgEnum('payment_kind', paymentKinds);
export const paymentStatusEnum = pgEnum('payment_status', paymentStatuses);
export const funderTypeEnum = pgEnum('funder_type', funderTypes);
export const applicationStatusEnum = pgEnum('application_status', applicationStatuses);
export const newsCategoryEnum = pgEnum('news_category', newsCategories);
export const vehicleEnum = pgEnum('vehicle', vehicles);
export const otpPurposeEnum = pgEnum('otp_purpose', otpPurposes);
export const shadowRunStatusEnum = pgEnum('shadow_run_status', shadowRunStatuses);
export const serviceTypeEnum = pgEnum('service_type', serviceTypes);
export const serviceRequestStatusEnum = pgEnum('service_request_status', serviceRequestStatuses);
export const feedbackKindEnum = pgEnum('feedback_kind', feedbackKinds);
export const feedbackStatusEnum = pgEnum('feedback_status', feedbackStatuses);

// ── Accounts ───────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull().unique(),
    email: text('email').unique(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull().default('buyer'),
    phoneVerified: boolean('phone_verified').notNull().default(false),
    createdAt: createdAt(),
  },
  t => [
    check('users_phone_e164', sql`${t.phone} ~ ${sql.raw(E164_UG)}`),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ]
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  t => [index('refresh_tokens_user_idx').on(t.userId)]
);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    purpose: otpPurposeEnum('purpose').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: smallint('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  t => [
    check('otp_codes_phone_e164', sql`${t.phone} ~ ${sql.raw(E164_UG)}`),
    check('otp_codes_attempts_range', sql`${t.attempts} BETWEEN 0 AND 5`),
    index('otp_codes_lookup_idx').on(t.phone, t.purpose, t.createdAt.desc()),
  ]
);

// ── Geography ──────────────────────────────────────────────

export const adminBoundaries = pgTable(
  'admin_boundaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Official place code (UBOS P-code, e.g. UG1131 for Mukono); null only for boundaries drawn by hand */
    code: text('code').unique(),
    level: boundaryLevelEnum('level').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => adminBoundaries.id, { onDelete: 'restrict' }),
    geom: geometry('geom', 'MultiPolygon').notNull(),
  },
  t => [
    unique('admin_boundaries_level_parent_name_key').on(t.level, t.parentId, t.name).nullsNotDistinct(),
    check('admin_boundaries_parent_level', sql`(${t.level} = 'district') = (${t.parentId} IS NULL)`),
    index('admin_boundaries_geom_gix').using('gist', t.geom),
    index('admin_boundaries_level_parent_idx').on(t.level, t.parentId),
  ]
);

// ── Nurseries and stock ────────────────────────────────────

export const nurseries = pgTable(
  'nurseries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: nurseryTypeEnum('type').notNull(),
    districtId: uuid('district_id').notNull().references(() => adminBoundaries.id, { onDelete: 'restrict' }),
    subCountyId: uuid('sub_county_id').notNull().references(() => adminBoundaries.id, { onDelete: 'restrict' }),
    location: geometry('location', 'Point').notNull(),
    operatorName: text('operator_name').notNull(),
    contactPhone: text('contact_phone').notNull(),
    payoutPhone: text('payout_phone').notNull(),
    annualCapacity: integer('annual_capacity').notNull(),
    seedSource: text('seed_source'),
    certificationStatus: certificationStatusEnum('certification_status').notNull().default('unverified'),
    isActive: boolean('is_active').notNull().default(true),
    /** Invented sample data (db:demo-nurseries): shown with a "sample" label, never texted, no live orders */
    isDemo: boolean('is_demo').notNull().default(false),
    /** Where an imported nursery came from, e.g. "NUR-UG-0001" (demo sheet) or "SPGS-2018-C08" (certified list) */
    externalRef: text('external_ref').unique(),
    /** For admins: what to check before switching an imported nursery on */
    listingNote: text('listing_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    check('nurseries_contact_phone_e164', sql`${t.contactPhone} ~ ${sql.raw(E164_UG)}`),
    check('nurseries_payout_phone_e164', sql`${t.payoutPhone} ~ ${sql.raw(E164_UG)}`),
    check('nurseries_annual_capacity_nonneg', sql`${t.annualCapacity} >= 0`),
    index('nurseries_location_gix').using('gist', t.location),
    index('nurseries_district_idx').on(t.districtId),
    index('nurseries_sub_county_idx').on(t.subCountyId),
    index('nurseries_name_trgm_idx').using('gin', t.name.op('gin_trgm_ops')),
  ]
);

export const species = pgTable(
  'species',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scientificName: text('scientific_name').notNull(),
    commonName: text('common_name').notNull(),
    category: speciesCategoryEnum('category').notNull(),
    growthPace: growthPaceEnum('growth_pace').notNull(),
    /** Milestones such as [{ "years": 1, "height_m": 1.5 }, …] */
    heightTimeline: jsonb('height_timeline').$type<{ years: number; height_m: number }[]>().notNull().default([]),
    canopyNotes: text('canopy_notes'),
    rootNotes: text('root_notes'),
    ecologicalZones: text('ecological_zones').array().notNull().default(sql`'{}'::text[]`),
    /** National Forestry Authority price for its smallest pot (NFA price list, January 2024): a guide for buyers */
    referencePriceUgx: integer('reference_price_ugx'),
    referencePotInches: integer('reference_pot_inches'),
    slug: text('slug').notNull().unique(),
  },
  t => [
    check('species_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    index('species_category_idx').on(t.category),
    index('species_common_name_trgm_idx').using('gin', t.commonName.op('gin_trgm_ops')),
    index('species_scientific_name_trgm_idx').using('gin', t.scientificName.op('gin_trgm_ops')),
  ]
);

export const speciesLocalNames = pgTable(
  'species_local_names',
  {
    speciesId: uuid('species_id').notNull().references(() => species.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    name: text('name').notNull(),
  },
  t => [
    primaryKey({ columns: [t.speciesId, t.language] }),
    index('species_local_names_name_trgm_idx').using('gin', t.name.op('gin_trgm_ops')),
  ]
);

export const speciesMedia = pgTable(
  'species_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    speciesId: uuid('species_id').notNull().references(() => species.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  t => [index('species_media_species_idx').on(t.speciesId, t.sortOrder)]
);

export const inventory = pgTable(
  'inventory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nurseryId: uuid('nursery_id').notNull().references(() => nurseries.id, { onDelete: 'restrict' }),
    speciesId: uuid('species_id').notNull().references(() => species.id, { onDelete: 'restrict' }),
    quantityAvailable: integer('quantity_available').notNull(),
    unitPrice: integer('unit_price').notNull(),
    updatedAt: updatedAt(),
  },
  t => [
    unique('inventory_nursery_species_key').on(t.nurseryId, t.speciesId),
    check('inventory_quantity_nonneg', sql`${t.quantityAvailable} >= 0`),
    check('inventory_unit_price_positive', sql`${t.unitPrice} > 0`),
    index('inventory_species_idx').on(t.speciesId),
  ]
);

export const deliveryRates = pgTable(
  'delivery_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicle: vehicleEnum('vehicle').notNull(),
    maxItems: integer('max_items').notNull(),
    baseFee: integer('base_fee').notNull(),
    perKm: integer('per_km').notNull(),
    maxKm: integer('max_km').notNull(),
    active: boolean('active').notNull().default(true),
  },
  t => [
    check('delivery_rates_max_items_positive', sql`${t.maxItems} > 0`),
    check('delivery_rates_fees_nonneg', sql`${t.baseFee} >= 0 AND ${t.perKm} >= 0`),
    check('delivery_rates_max_km_positive', sql`${t.maxKm} > 0`),
  ]
);

// ── Orders and payments ────────────────────────────────────

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Six-character reference used in SMS, e.g. "K7Q2MX" */
    shortCode: text('short_code').notNull().unique(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    nurseryId: uuid('nursery_id').notNull().references(() => nurseries.id, { onDelete: 'restrict' }),
    deliveryType: deliveryTypeEnum('delivery_type').notNull(),
    deliveryPoint: geometry('delivery_point', 'Point'),
    deliveryAddress: text('delivery_address'),
    distanceKm: numeric('distance_km', { precision: 8, scale: 2, mode: 'number' }),
    deliveryFee: integer('delivery_fee').notNull(),
    itemsTotal: integer('items_total').notNull(),
    grandTotal: integer('grand_total').notNull(),
    status: orderStatusEnum('status').notNull().default('pending_payment'),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    check('orders_short_code_format', sql`${t.shortCode} ~ '^[A-Z0-9]{6}$'`),
    check('orders_totals_add_up', sql`${t.grandTotal} = ${t.itemsTotal} + ${t.deliveryFee}`),
    check('orders_amounts_valid', sql`${t.itemsTotal} > 0 AND ${t.deliveryFee} >= 0`),
    check('orders_distance_nonneg', sql`${t.distanceKm} IS NULL OR ${t.distanceKm} >= 0`),
    // FR-25: a delivery order needs a point and an address; a pickup order has no delivery fee
    check(
      'orders_delivery_details',
      sql`(${t.deliveryType} = 'self_pickup' AND ${t.deliveryFee} = 0)
       OR (${t.deliveryType} = 'order_and_deliver' AND ${t.deliveryPoint} IS NOT NULL AND ${t.deliveryAddress} IS NOT NULL)`
    ),
    index('orders_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('orders_nursery_idx').on(t.nurseryId),
    index('orders_status_idx').on(t.status),
    index('orders_delivery_point_gix').using('gist', t.deliveryPoint),
  ]
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    inventoryId: uuid('inventory_id').notNull().references(() => inventory.id, { onDelete: 'restrict' }),
    speciesId: uuid('species_id').notNull().references(() => species.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    unitPriceSnapshot: integer('unit_price_snapshot').notNull(),
    lineTotal: integer('line_total').notNull(),
  },
  t => [
    unique('order_items_order_inventory_key').on(t.orderId, t.inventoryId),
    check('order_items_quantity_positive', sql`${t.quantity} > 0`),
    check('order_items_price_positive', sql`${t.unitPriceSnapshot} > 0`),
    check('order_items_line_total', sql`${t.lineTotal} = ${t.quantity} * ${t.unitPriceSnapshot}`),
  ]
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
    kind: paymentKindEnum('kind').notNull(),
    provider: paymentProviderEnum('provider').notNull(),
    providerRef: text('provider_ref'),
    idempotencyKey: uuid('idempotency_key').notNull().unique().defaultRandom(),
    /** The number charged (collection) or paid (disbursement/refund), E.164 */
    msisdn: text('msisdn').notNull(),
    amount: integer('amount').notNull(),
    status: paymentStatusEnum('status').notNull().default('pending'),
    rawCallback: jsonb('raw_callback'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    check('payments_amount_positive', sql`${t.amount} > 0`),
    check('payments_msisdn_e164', sql`${t.msisdn} ~ ${sql.raw(E164_UG)}`),
    index('payments_order_idx').on(t.orderId),
    index('payments_pending_idx').on(t.createdAt).where(sql`${t.status} = 'pending'`),
    uniqueIndex('payments_provider_ref_key').on(t.provider, t.providerRef).where(sql`${t.providerRef} IS NOT NULL`),
    // At most one successful collection per order; payouts and refunds are handled by the state machine
    uniqueIndex('payments_one_successful_collection').on(t.orderId).where(sql`${t.kind} = 'collection' AND ${t.status} = 'successful'`),
  ]
);

// ── Free seedling campaigns ────────────────────────────────

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Pickup point for the free seedlings */
    nurseryId: uuid('nursery_id').notNull().references(() => nurseries.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    funderName: text('funder_name').notNull(),
    funderType: funderTypeEnum('funder_type').notNull(),
    purpose: text('purpose').notNull(),
    subCountyId: uuid('sub_county_id').notNull().references(() => adminBoundaries.id, { onDelete: 'restrict' }),
    allocatedStock: integer('allocated_stock').notNull(),
    remainingStock: integer('remaining_stock').notNull(),
    eligibilityRules: jsonb('eligibility_rules').$type<EligibilityRule[]>().notNull().default([]),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  t => [
    check('campaigns_allocated_positive', sql`${t.allocatedStock} > 0`),
    check('campaigns_remaining_range', sql`${t.remainingStock} >= 0 AND ${t.remainingStock} <= ${t.allocatedStock}`),
    check('campaigns_dates_ordered', sql`${t.endsAt} > ${t.startsAt}`),
    index('campaigns_sub_county_idx').on(t.subCountyId),
    index('campaigns_nursery_idx').on(t.nurseryId),
  ]
);

export const campaignItems = pgTable(
  'campaign_items',
  {
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    speciesId: uuid('species_id').notNull().references(() => species.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
  },
  t => [
    primaryKey({ columns: [t.campaignId, t.speciesId] }),
    check('campaign_items_quantity_positive', sql`${t.quantity} > 0`),
  ]
);

export const campaignApplications = pgTable(
  'campaign_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    answers: jsonb('answers').$type<Record<string, boolean | number | string>>().notNull(),
    quantityRequested: integer('quantity_requested').notNull(),
    status: applicationStatusEnum('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  t => [
    unique('campaign_applications_campaign_user_key').on(t.campaignId, t.userId),
    check('campaign_applications_quantity_positive', sql`${t.quantityRequested} > 0`),
    index('campaign_applications_campaign_status_idx').on(t.campaignId, t.status),
  ]
);

// ── Service requests ───────────────────────────────────────

/** A buyer asks for planting help (/services); the team phones them and records the outcome. */
export const serviceRequests = pgTable(
  'service_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    service: serviceTypeEnum('service').notNull(),
    location: text('location').notNull(),
    landAcres: numeric('land_acres', { precision: 9, scale: 2 }),
    notes: text('notes'),
    status: serviceRequestStatusEnum('status').notNull().default('new'),
    adminNote: text('admin_note'),
    handledBy: uuid('handled_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    check('service_requests_land_acres_positive', sql`${t.landAcres} IS NULL OR ${t.landAcres} > 0`),
    index('service_requests_status_created_idx').on(t.status, t.createdAt),
    index('service_requests_user_idx').on(t.userId),
  ]
);

// ── News ───────────────────────────────────────────────────

export const newsPosts = pgTable(
  'news_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    category: newsCategoryEnum('category').notNull(),
    body: text('body').notNull(),
    coverUrl: text('cover_url'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    isPublished: boolean('is_published').notNull().default(false),
  },
  t => [
    check('news_posts_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('news_posts_published_has_date', sql`NOT ${t.isPublished} OR ${t.publishedAt} IS NOT NULL`),
    index('news_posts_feed_idx').on(t.category, t.publishedAt.desc()).where(sql`${t.isPublished}`),
  ]
);

// ── Nursery Shadow analysis ────────────────────────────────

export const forestLossCells = pgTable(
  'forest_loss_cells',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    geom: geometry('geom', 'Polygon').notNull(),
    lossPct: numeric('loss_pct', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    lossYearFrom: smallint('loss_year_from').notNull(),
    lossYearTo: smallint('loss_year_to').notNull(),
  },
  t => [
    check('forest_loss_cells_pct_range', sql`${t.lossPct} BETWEEN 0 AND 100`),
    check('forest_loss_cells_years_ordered', sql`${t.lossYearTo} >= ${t.lossYearFrom}`),
    index('forest_loss_cells_geom_gix').using('gist', t.geom),
  ]
);

export const shadowRuns = pgTable(
  'shadow_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: shadowRunStatusEnum('status').notNull().default('queued'),
    params: jsonb('params').$type<ShadowRunParams>().notNull(),
    startedBy: uuid('started_by').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error'),
    createdAt: createdAt(),
  },
  t => [index('shadow_runs_created_idx').on(t.createdAt.desc())]
);

export const shadowZones = pgTable(
  'shadow_zones',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    runId: uuid('run_id').notNull().references(() => shadowRuns.id, { onDelete: 'cascade' }),
    geom: geometry('geom', 'MultiPolygon').notNull(),
    lossPct: numeric('loss_pct', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    areaKm2: numeric('area_km2', { precision: 10, scale: 3, mode: 'number' }).notNull(),
    districtId: uuid('district_id').references(() => adminBoundaries.id, { onDelete: 'set null' }),
  },
  t => [
    index('shadow_zones_geom_gix').using('gist', t.geom),
    index('shadow_zones_run_idx').on(t.runId),
  ]
);

export const serviceZones = pgTable(
  'service_zones',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    runId: uuid('run_id').notNull().references(() => shadowRuns.id, { onDelete: 'cascade' }),
    nurseryId: uuid('nursery_id').notNull().references(() => nurseries.id, { onDelete: 'cascade' }),
    km: smallint('km').notNull(),
    geom: geometry('geom', 'MultiPolygon').notNull(),
  },
  t => [
    check('service_zones_km_values', sql`${t.km} IN (5, 10, 20)`),
    unique('service_zones_run_nursery_km_key').on(t.runId, t.nurseryId, t.km),
    index('service_zones_geom_gix').using('gist', t.geom),
  ]
);

// ── Audit ──────────────────────────────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: createdAt(),
  },
  t => [
    index('audit_log_entity_idx').on(t.entity, t.entityId),
    index('audit_log_created_idx').on(t.createdAt.desc()),
    index('audit_log_action_idx').on(t.action),
  ]
);

// ── Feedback ───────────────────────────────────────────────

/** Comments from anyone using the site (/feedback); visitors may leave a name and contact to reply to. */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: feedbackKindEnum('kind').notNull(),
    message: text('message').notNull(),
    name: text('name'),
    contact: text('contact'),
    page: text('page'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    status: feedbackStatusEnum('status').notNull().default('new'),
    adminNote: text('admin_note'),
    handledBy: uuid('handled_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [
    check('feedback_message_length', sql`char_length(${t.message}) BETWEEN 10 AND 2000`),
    index('feedback_status_created_idx').on(t.status, t.createdAt),
  ]
);
