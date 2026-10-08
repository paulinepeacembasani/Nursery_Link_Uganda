import { z } from 'zod';
import {
  analyticsRangeSchema,
  applicationStatusSchema,
  boundaryLevelSchema,
  certificationStatusSchema,
  deliveryTypeSchema,
  eligibilityRuleSchema,
  funderTypeSchema,
  growthPaceSchema,
  newsCategorySchema,
  nurseryTypeSchema,
  orderStatusSchema,
  paymentKindSchema,
  paymentMethodSchema,
  paymentProviderSchema,
  paymentStatusSchema,
  roleSchema,
  serviceRequestStatusSchema,
  feedbackKindSchema,
  feedbackStatusSchema,
  serviceTypeSchema,
  shadowRunStatusSchema,
  speciesCategorySchema,
  vehicleSchema,
} from '../enums.js';

/**
 * Response shapes of every API operation. They are strict (no unknown keys), so the generated
 * client types are exact, and the API's test suite validates every JSON response against them.
 * The API types its DTO mappers with these, so the two cannot drift apart.
 */

const s = z.strictObject;
const isoDate = z.string().describe('ISO 8601 date-time');
const ref = s({ id: z.uuid(), name: z.string() });
const latLng = s({ lat: z.number(), lng: z.number() });
const position = z.tuple([z.number(), z.number()]);

// ── Envelope meta ──────────────────────────────────────────

export const pageMetaSchema = s({ page: z.number().int(), limit: z.number().int(), total: z.number().int() });
export const distanceModeSchema = z.enum(['road', 'straight_line']);
/** Set when nothing matched the search exactly and the results are for the closest spelling instead */
const correctedQ = z.string().describe('The spelling the results are for, when the search text matched nothing as typed').optional();
export const nurseryListMetaSchema = s({ ...pageMetaSchema.shape, distance_mode: distanceModeSchema.optional(), corrected_q: correctedQ });
export const speciesListMetaSchema = s({ ...pageMetaSchema.shape, corrected_q: correctedQ });
export const messageSchema = s({ message: z.string() });

// ── Health and auth ────────────────────────────────────────

export const healthSchema = s({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'down']),
  version: z.string(),
  commit: z.string().nullable().describe('The deployed Git commit, when the host provides it'),
  providers: s({ payment: z.enum(['mock', 'live']), sms: z.string(), routing: z.string(), email: z.string() }),
  /** Which payment methods buyers can use right now (Airtel Money is not integrated in live mode yet) */
  payment_methods: s({ mtn_momo: z.boolean(), airtel_money: z.boolean() }),
  /** Trial switches: while off, there is no SMS code at sign-up and no payment step at checkout */
  features: s({ phone_verification: z.boolean(), payments: z.boolean() }),
  site: s({
    demo_notice: z.boolean().describe('Show the "sample data, still being built" notice on first visit'),
    survey_url: z.url().nullable().describe('The needs-assessment survey (e.g. a Google Form), or null when there is none'),
  }),
});

/** The marketplace at a glance (GET /stats), for the home page. */
export const publicStatsSchema = s({
  nurseries: z.number().int().describe('Active nurseries'),
  species_in_stock: z.number().int().describe('Kinds of trees in stock at active nurseries'),
  seedlings_in_stock: z.number(),
  sub_counties: z.number().int().describe('Sub-counties with an active nursery'),
  open_campaigns: z.number().int().describe('Free-seedling campaigns open now'),
});

export const publicUserSchema = s({
  id: z.uuid(),
  full_name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  role: roleSchema,
  phone_verified: z.boolean(),
  created_at: isoDate,
});

export const authTokensSchema = s({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().describe('Seconds until the access token expires'),
  user: publicUserSchema,
});

/**
 * After registering: either a code was texted (verification), or, while phone verification is
 * switched off, the account is confirmed and signed in at once (tokens; the refresh cookie is set).
 */
export const registeredSchema = s({
  user: publicUserSchema,
  verification: s({ sent_to: z.string(), expires_in_minutes: z.number().int() }).nullable(),
  tokens: authTokensSchema.nullable(),
});

// ── Nurseries ──────────────────────────────────────────────

const nurseryCore = {
  id: z.uuid(),
  name: z.string(),
  type: nurseryTypeSchema,
  certification_status: certificationStatusSchema,
  operator_name: z.string(),
  contact_phone: z.string().nullable().describe('Null for sample nurseries, which have no real number'),
  annual_capacity: z.number().int(),
  seed_source: z.string().nullable(),
  district: ref,
  sub_county: ref,
  is_demo: z.boolean().describe('Invented sample nursery (demo data): show it as such'),
  has_active_campaign: z.boolean().describe('Shows the gift pin (FR-17)'),
  total_stock: z.number().int(),
  species_count: z.number().int(),
  stock_updated_at: isoDate.nullable(),
  straight_km: z.number().optional().describe('Present when lat/lng were given'),
  road_km: z.number().nullable().optional().describe('Present with sort=nearest; null when unreachable by road'),
};

export const nurserySummarySchema = s({ ...nurseryCore, location: latLng });

export const nurseryFeatureCollectionSchema = s({
  type: z.literal('FeatureCollection'),
  features: z.array(
    s({
      type: z.literal('Feature'),
      id: z.uuid(),
      geometry: s({ type: z.literal('Point'), coordinates: position }),
      properties: s(nurseryCore),
    })
  ),
});
export const nurseryGeoJsonMetaSchema = s({ total: z.number().int(), distance_mode: distanceModeSchema.optional(), corrected_q: correctedQ });

const speciesRef = s({ id: z.uuid(), slug: z.string(), common_name: z.string(), scientific_name: z.string(), category: speciesCategorySchema });

export const inventoryItemSchema = s({
  inventory_id: z.uuid(),
  species: speciesRef,
  quantity_available: z.number().int(),
  unit_price: z.number().int().describe('UGX'),
  updated_at: isoDate,
});

export const nurseryProfileSchema = s({
  ...nurserySummarySchema.shape,
  inventory: z.array(inventoryItemSchema),
  stock_categories: z.array(speciesCategorySchema),
  active_campaigns: z.array(s({ id: z.uuid(), title: z.string(), remaining_stock: z.number().int(), allocated_stock: z.number().int(), ends_at: isoDate })),
  distance_km: z.number().optional(),
  distance_mode: distanceModeSchema.optional(),
});

export const routeSchema = s({
  nursery: s({ id: z.uuid(), name: z.string(), location: latLng }),
  distance_km: z.number(),
  duration_min: z.number().int(),
  geometry: s({ type: z.literal('LineString'), coordinates: z.array(position) }),
  steps: z.array(s({ instruction: z.string(), road: z.string().nullable(), distance_m: z.number().int(), duration_s: z.number().int() })),
});

// ── Species ────────────────────────────────────────────────

const localName = s({ language: z.string(), name: z.string() });

export const speciesListItemSchema = s({
  id: z.uuid(),
  slug: z.string(),
  common_name: z.string(),
  scientific_name: z.string(),
  category: speciesCategorySchema,
  growth_pace: growthPaceSchema,
  local_names: z.array(localName),
  thumbnail_url: z.string().nullable(),
  nursery_count: z.number().int(),
});

export const speciesProfileSchema = s({
  id: z.uuid(),
  slug: z.string(),
  common_name: z.string(),
  scientific_name: z.string(),
  category: speciesCategorySchema,
  growth_pace: growthPaceSchema,
  height_timeline: z.array(s({ years: z.number(), height_m: z.number() })),
  canopy_notes: z.string().nullable(),
  root_notes: z.string().nullable(),
  ecological_zones: z.array(z.string()),
  local_names: z.array(localName),
  media: z.array(s({ url: z.string(), caption: z.string().nullable() })),
  nursery_count: z.number().int(),
  min_price: z.number().int().nullable(),
  max_price: z.number().int().nullable(),
  reference_price: s({ ugx: z.number().int(), pot_inches: z.number().int() })
    .nullable()
    .describe('National Forestry Authority price for its smallest pot (price list of January 2024), as a guide'),
});

export const speciesNurserySchema = s({ ...nurserySummarySchema.shape, stock: inventoryItemSchema });
export const speciesNurseriesMetaSchema = s({
  ...nurseryListMetaSchema.shape,
  species: s({ id: z.uuid(), slug: z.string(), common_name: z.string() }),
});

// ── Search suggestions, places ─────────────────────────────

export const suggestionSchema = z.discriminatedUnion('kind', [
  s({
    kind: z.literal('species'),
    slug: z.string(),
    label: z.string().describe('Common name'),
    scientific_name: z.string(),
    matched: z.string().nullable().describe('The local or scientific name that matched, when it was not the common name'),
    nursery_count: z.number().int(),
  }),
  s({ kind: z.literal('nursery'), id: z.uuid(), label: z.string(), place: z.string().describe('Sub-county, district') }),
  s({
    kind: z.literal('place'),
    id: z.uuid(),
    label: z.string(),
    level: boundaryLevelSchema,
    parent_id: z.uuid().nullable(),
    parent_name: z.string().nullable(),
    lat: z.number(),
    lng: z.number(),
  }),
]);

export const placeSchema = s({
  source: z.enum(['boundary', 'osm']).describe('Our districts and sub-counties, or OpenStreetMap'),
  boundary_id: z.uuid().nullable(),
  name: z.string(),
  context: z.string().describe('Where it is, e.g. "Goma Division, Mukono"'),
  kind: z.string().describe('district, sub_county, village, school, road…'),
  lat: z.number(),
  lng: z.number(),
});
export const placesMetaSchema = s({ osm: z.enum(['ok', 'unavailable']).describe('Whether OpenStreetMap place search answered') });

// ── Boundaries, news ───────────────────────────────────────

export const boundarySchema = s({ id: z.uuid(), name: z.string(), level: boundaryLevelSchema, parent_id: z.uuid().nullable() });
export const boundaryFeatureSchema = s({
  type: z.literal('Feature'),
  id: z.uuid(),
  geometry: z.union([
    s({ type: z.literal('Polygon'), coordinates: z.array(z.array(position)) }),
    s({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(position))) }),
  ]),
  properties: boundarySchema,
});

export const newsListItemSchema = s({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  category: newsCategorySchema,
  cover_url: z.string().nullable(),
  excerpt: z.string(),
  published_at: isoDate,
});
export const newsPostSchema = s({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  category: newsCategorySchema,
  body: z.string().describe('Markdown'),
  cover_url: z.string().nullable(),
  published_at: isoDate,
});

// ── Campaigns and applications ─────────────────────────────

export const campaignSchema = s({
  id: z.uuid(),
  title: z.string(),
  funder_name: z.string(),
  funder_type: funderTypeSchema,
  purpose: z.string(),
  allocated_stock: z.number().int(),
  remaining_stock: z.number().int(),
  remaining_pct: z.number().int(),
  eligibility_rules: z.array(eligibilityRuleSchema.strict()),
  starts_at: isoDate,
  ends_at: isoDate,
  is_active: z.boolean(),
  is_open: z.boolean().describe('Accepting applications: switched on, within its dates, stock left'),
  species: z.array(s({ species_id: z.uuid(), slug: z.string(), common_name: z.string(), quantity: z.number().int() })),
  sub_county: ref,
  pickup_nursery: s({ id: z.uuid(), name: z.string(), location: latLng }),
});

const answers = z.record(z.string(), z.union([z.boolean(), z.number(), z.string()]));
const applicationCore = {
  id: z.uuid(),
  campaign: s({ id: z.uuid(), title: z.string(), pickup_nursery: z.string() }),
  answers,
  quantity_requested: z.number().int(),
  status: applicationStatusSchema,
  reviewed_at: isoDate.nullable(),
  created_at: isoDate,
};
export const applicationSchema = s(applicationCore);
export const adminApplicationSchema = s({
  ...applicationCore,
  applicant: s({ id: z.uuid(), full_name: z.string(), phone: z.string() }),
  reviewed_by: z.uuid().nullable(),
});

// ── Service requests ───────────────────────────────────────

const serviceRequestCore = {
  id: z.uuid(),
  service: serviceTypeSchema,
  location: z.string(),
  land_acres: z.number().nullable(),
  notes: z.string().nullable(),
  status: serviceRequestStatusSchema,
  admin_note: z.string().nullable().describe('Latest note from the team, e.g. the agreed date'),
  created_at: isoDate,
  updated_at: isoDate,
};
export const serviceRequestSchema = s(serviceRequestCore);
export const adminServiceRequestSchema = s({
  ...serviceRequestCore,
  requester: s({ id: z.uuid(), full_name: z.string(), phone: z.string() }),
  handled_by: z.uuid().nullable(),
});

// ── Feedback ───────────────────────────────────────────────

export const feedbackReceiptSchema = s({ id: z.uuid(), created_at: isoDate });
export const adminFeedbackSchema = s({
  id: z.uuid(),
  kind: feedbackKindSchema,
  message: z.string(),
  name: z.string().nullable().describe("The account's name when signed in, else what they typed"),
  contact: z.string().nullable().describe("The account's phone when signed in, else what they typed"),
  page: z.string().nullable(),
  user_id: z.uuid().nullable(),
  status: feedbackStatusSchema,
  admin_note: z.string().nullable(),
  handled_by: z.uuid().nullable(),
  created_at: isoDate,
  updated_at: isoDate,
});

// ── Orders ─────────────────────────────────────────────────

const orderItem = s({
  inventory_id: z.uuid(),
  species: s({ slug: z.string(), common_name: z.string() }),
  quantity: z.number().int(),
  unit_price: z.number().int(),
  line_total: z.number().int(),
});

export const quoteSchema = s({
  nursery: ref,
  items: z.array(orderItem),
  items_total: z.number().int(),
  delivery: s({
    type: deliveryTypeSchema,
    distance_km: z.number().nullable(),
    vehicle: vehicleSchema.nullable(),
    base_fee: z.number().int(),
    per_km: z.number().int(),
    fee: z.number().int(),
  }),
  grand_total: z.number().int(),
  quote_token: z.string().describe('Send back to POST /orders within 10 minutes'),
  expires_at: isoDate,
});

const orderCore = {
  id: z.uuid(),
  short_code: z.string(),
  status: orderStatusSchema,
  nursery: s({ id: z.uuid(), name: z.string(), contact_phone: z.string() }),
  delivery_type: deliveryTypeSchema,
  delivery_point: latLng.nullable(),
  delivery_address: z.string().nullable(),
  distance_km: z.number().nullable(),
  items: z.array(orderItem),
  items_total: z.number().int(),
  delivery_fee: z.number().int(),
  grand_total: z.number().int(),
  payment_method: paymentMethodSchema,
  payment: s({ status: paymentStatusSchema, msisdn: z.string() }).optional().describe('The buyer\'s collection payment, on the order detail'),
  created_at: isoDate,
  paid_at: isoDate.nullable(),
  dispatched_at: isoDate.nullable(),
  delivered_at: isoDate.nullable(),
  released_at: isoDate.nullable(),
};
export const orderSchema = s(orderCore);
export const adminOrderSchema = s({ ...orderCore, buyer: s({ id: z.uuid(), full_name: z.string(), phone: z.string() }) });
/** What the nursery sees from the order SMS link: the delivery pin, the items and who to call. */
export const orderMapSchema = s({
  short_code: z.string(),
  status: orderStatusSchema,
  nursery: s({ name: z.string(), location: latLng }),
  delivery_type: deliveryTypeSchema,
  delivery_point: latLng.nullable(),
  delivery_address: z.string().nullable(),
  items: z.array(s({ common_name: z.string(), quantity: z.number().int() })),
  buyer: s({ full_name: z.string(), phone: z.string() }),
  created_at: isoDate,
});

export const orderCreatedMetaSchema = s({ next_step: z.string() });

export const webhookResultSchema = s({ received: z.literal(true), result: z.string() });

// ── Admin ──────────────────────────────────────────────────

export const adminNurserySchema = s({
  id: z.uuid(),
  name: z.string(),
  type: nurseryTypeSchema,
  certification_status: certificationStatusSchema,
  operator_name: z.string(),
  contact_phone: z.string(),
  payout_phone: z.string(),
  annual_capacity: z.number().int(),
  seed_source: z.string().nullable(),
  is_active: z.boolean(),
  is_demo: z.boolean().describe('Invented sample nursery (db:demo-nurseries)'),
  external_ref: z.string().nullable().describe('Reference in the list it was imported from'),
  listing_note: z.string().nullable().describe('What to check before switching an imported nursery on'),
  district: ref,
  sub_county: ref,
  location: latLng,
  stock_updated_at: isoDate.nullable(),
  created_at: isoDate,
  updated_at: isoDate,
});

export const inventoryLineSchema = s({
  id: z.uuid(),
  nursery: ref,
  species: s({ id: z.uuid(), slug: z.string(), common_name: z.string() }),
  quantity_available: z.number().int(),
  unit_price: z.number().int(),
  updated_at: isoDate,
});

const stockPair = s({ quantity_available: z.number().int(), unit_price: z.number().int() });
export const importResultSchema = s({
  committed: z.boolean(),
  rows: z.number().int(),
  errors: z.array(s({ row: z.number().int(), column: z.string().optional(), message: z.string() })),
  summary: s({ create: z.number().int(), update: z.number().int(), unchanged: z.number().int() }),
  changes: z.array(
    s({
      row: z.number().int(),
      nursery: z.string(),
      species: z.string(),
      action: z.enum(['create', 'update', 'unchanged']),
      before: stockPair.nullable(),
      after: stockPair,
    })
  ),
});

export const adminNewsSchema = s({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  category: newsCategorySchema,
  body: z.string(),
  cover_url: z.string().nullable(),
  is_published: z.boolean(),
  published_at: isoDate.nullable(),
});

export const deliveryRateSchema = s({
  id: z.uuid(),
  vehicle: vehicleSchema,
  max_items: z.number().int(),
  base_fee: z.number().int(),
  per_km: z.number().int(),
  max_km: z.number().int(),
  active: z.boolean(),
});

export const payoutSchema = s({
  id: z.uuid(),
  order_id: z.uuid(),
  kind: paymentKindSchema,
  provider: paymentProviderSchema,
  provider_ref: z.string().nullable(),
  idempotency_key: z.uuid(),
  msisdn: z.string(),
  amount: z.number().int(),
  status: paymentStatusSchema,
  raw_callback: z.unknown().describe('What the provider last reported'),
  short_code: z.string(),
  order_status: orderStatusSchema,
  nursery_name: z.string(),
  attempts: z.number().int(),
  created_at: isoDate,
  updated_at: isoDate,
});
export const payoutRetrySchema = s({ id: z.uuid(), status: paymentStatusSchema });

export const auditEntrySchema = s({
  id: z.string().describe('Sequence number'),
  action: z.string(),
  entity: z.string(),
  entity_id: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  actor: s({ id: z.uuid(), full_name: z.string(), phone: z.string() }).nullable(),
  created_at: isoDate,
});

const dashOrder = s({ id: z.uuid(), short_code: z.string(), status: orderStatusSchema, grand_total: z.number().int(), nursery_name: z.string(), buyer_name: z.string(), paid_at: isoDate.nullable(), updated_at: isoDate });
const section = <T extends z.ZodType>(item: T) => s({ count: z.number().int(), items: z.array(item) });

/** What needs an admin's attention, each with a count and the top items (GET /admin/dashboard). */
export const dashboardSchema = s({
  orders_to_dispatch: section(dashOrder).describe('New orders: paid (or confirmed in trial mode), waiting for the nursery to dispatch'),
  disputed_orders: section(dashOrder),
  stuck_escrow: section(dashOrder),
  failed_payouts: section(s({ id: z.uuid(), order_id: z.uuid(), kind: paymentKindSchema, amount: z.number().int(), msisdn: z.string(), short_code: z.string(), attempts: z.number().int(), updated_at: isoDate })),
  stale_stock: section(s({ id: z.uuid(), name: z.string(), stock_updated_at: isoDate.nullable() })),
  pending_applications: section(s({ id: z.uuid(), campaign_id: z.uuid(), campaign_title: z.string(), applicant_name: z.string(), quantity_requested: z.number().int(), created_at: isoDate })),
  nurseries_to_verify: section(s({ id: z.uuid(), name: z.string(), district_name: z.string(), created_at: isoDate })).describe('Imported nurseries waiting for an admin to check them and switch them on'),
  unparsed_sms: section(s({ id: z.string(), sender: z.string().nullable(), text: z.string().nullable(), reason: z.string().nullable(), created_at: isoDate })),
  thresholds: s({ stuck_escrow_hours: z.number().int(), stale_stock_days: z.number().int(), sms_window_days: z.number().int() }),
});

const kpi = s({ value: z.number(), previous: z.number().describe('The same figure for the period just before') });

/** Admin insights for a period (GET /admin/analytics). Sales are paid orders that were not refunded. */
export const analyticsSchema = s({
  range: analyticsRangeSchema,
  bucket: z.enum(['day', 'week', 'month']),
  from: isoDate,
  to: isoDate,
  kpis: s({
    sales_ugx: kpi,
    orders: kpi,
    seedlings_sold: kpi,
    avg_order_ugx: kpi,
    new_buyers: kpi,
    free_seedlings: kpi.describe('Free seedlings approved through campaigns'),
  }),
  series: z.array(s({ date: z.string().describe('Start of the day, week or month (YYYY-MM-DD, Kampala)'), sales_ugx: z.number(), orders: z.number().int() })),
  order_status: z.array(s({ status: orderStatusSchema, count: z.number().int() })),
  delivery: z.array(s({ type: deliveryTypeSchema, count: z.number().int() })),
  payment_methods: z.array(s({ method: paymentMethodSchema, count: z.number().int(), sales_ugx: z.number() })),
  top_species: z.array(s({ species_id: z.uuid(), common_name: z.string(), seedlings: z.number().int(), sales_ugx: z.number() })),
  top_nurseries: z.array(s({ nursery_id: z.uuid(), name: z.string(), orders: z.number().int(), sales_ugx: z.number() })),
  stock_by_category: z.array(s({ category: speciesCategorySchema, seedlings: z.number().int(), lines: z.number().int() })),
  campaigns: z.array(s({ id: z.uuid(), title: z.string(), allocated: z.number().int(), remaining: z.number().int(), applications: z.number().int() })),
});

export const mediaUploadSchema = s({
  url: z.string().describe('The 960-px WebP; use in species media or news covers'),
  srcset: z.array(s({ url: z.string(), width: z.number().int() })),
  width: z.number().int(),
  height: z.number().int(),
});

export const shadowRunSchema = s({
  id: z.uuid(),
  status: shadowRunStatusSchema,
  params: s({ threshold_pct: z.number(), since_year: z.number().int() }),
  started_by: z.uuid().nullable(),
  created_at: isoDate,
  started_at: isoDate.nullable(),
  finished_at: isoDate.nullable(),
  error: z.string().nullable(),
  summary: s({ nurseries: z.number().int(), shadow_zones: z.number().int(), shadow_area_km2: z.number() }),
});
export const shadowRunStartMetaSchema = s({ outcome: z.enum(['new', 'in_progress', 'cached']), warnings: z.array(z.string()).optional() });

const multiPolygon = s({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(position))) });
export const shadowLayerCollectionSchema = s({
  type: z.literal('FeatureCollection'),
  features: z.array(
    s({
      type: z.literal('Feature'),
      geometry: multiPolygon,
      properties: z.union([
        s({ nursery_id: z.uuid(), nursery_name: z.string(), km: z.number().int() }),
        s({ id: z.number().int(), loss_pct: z.number(), area_km2: z.number(), district: z.string().nullable() }),
        s({ loss_pct: z.number().describe('Share of the cell lost since since_year (summed, capped at 100)'), in_shadow: z.boolean() }),
      ]),
    })
  ),
});

export type HealthDto = z.infer<typeof healthSchema>;
export type NurserySummaryDto = z.infer<typeof nurserySummarySchema>;
export type SuggestionDto = z.infer<typeof suggestionSchema>;
export type PlaceDto = z.infer<typeof placeSchema>;
export type NurseryProfileDto = z.infer<typeof nurseryProfileSchema>;
export type InventoryItemDto = z.infer<typeof inventoryItemSchema>;
export type RouteDto = z.infer<typeof routeSchema>;
export type SpeciesListItemDto = z.infer<typeof speciesListItemSchema>;
export type SpeciesProfileDto = z.infer<typeof speciesProfileSchema>;
export type CampaignDto = z.infer<typeof campaignSchema>;
export type ApplicationDtoShape = z.infer<typeof applicationSchema>;
export type AdminApplicationDto = z.infer<typeof adminApplicationSchema>;
export type ServiceRequestDtoShape = z.infer<typeof serviceRequestSchema>;
export type AdminServiceRequestDto = z.infer<typeof adminServiceRequestSchema>;
export type FeedbackReceiptDto = z.infer<typeof feedbackReceiptSchema>;
export type AdminFeedbackDto = z.infer<typeof adminFeedbackSchema>;
export type QuoteDto = z.infer<typeof quoteSchema>;
export type OrderDtoShape = z.infer<typeof orderSchema>;
export type OrderMapDto = z.infer<typeof orderMapSchema>;
export type AdminNurseryDto = z.infer<typeof adminNurserySchema>;
export type InventoryLineDto = z.infer<typeof inventoryLineSchema>;
export type ImportResultDto = z.infer<typeof importResultSchema>;
export type AdminNewsDto = z.infer<typeof adminNewsSchema>;
export type DeliveryRateDto = z.infer<typeof deliveryRateSchema>;
export type PayoutDto = z.infer<typeof payoutSchema>;
export type AuditEntryDto = z.infer<typeof auditEntrySchema>;
export type ShadowRunDto = z.infer<typeof shadowRunSchema>;

/** Response schemas published as named OpenAPI components (and so as named client types). */
export const namedResponseSchemas = {
  Health: healthSchema,
  PublicUser: publicUserSchema,
  AuthTokens: authTokensSchema,
  NurserySummary: nurserySummarySchema,
  NurseryFeatureCollection: nurseryFeatureCollectionSchema,
  InventoryItem: inventoryItemSchema,
  NurseryProfile: nurseryProfileSchema,
  Route: routeSchema,
  SpeciesListItem: speciesListItemSchema,
  SpeciesProfile: speciesProfileSchema,
  SpeciesNursery: speciesNurserySchema,
  Boundary: boundarySchema,
  Suggestion: suggestionSchema,
  Place: placeSchema,
  BoundaryFeature: boundaryFeatureSchema,
  NewsListItem: newsListItemSchema,
  NewsPost: newsPostSchema,
  Campaign: campaignSchema,
  Application: applicationSchema,
  AdminApplication: adminApplicationSchema,
  ServiceRequest: serviceRequestSchema,
  AdminServiceRequest: adminServiceRequestSchema,
  FeedbackReceipt: feedbackReceiptSchema,
  AdminFeedback: adminFeedbackSchema,
  Quote: quoteSchema,
  Order: orderSchema,
  OrderMap: orderMapSchema,
  AdminOrder: adminOrderSchema,
  AdminNursery: adminNurserySchema,
  InventoryLine: inventoryLineSchema,
  ImportResult: importResultSchema,
  AdminNews: adminNewsSchema,
  DeliveryRate: deliveryRateSchema,
  Payout: payoutSchema,
  AuditEntry: auditEntrySchema,
  ShadowRun: shadowRunSchema,
  Dashboard: dashboardSchema,
  Analytics: analyticsSchema,
  PublicStats: publicStatsSchema,
  MediaUpload: mediaUploadSchema,
  ShadowLayerCollection: shadowLayerCollectionSchema,
  PageMeta: pageMetaSchema,
} as const;
