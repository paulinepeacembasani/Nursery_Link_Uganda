import { z } from 'zod';
import * as r from '@nurserylink/shared';
import {
  adminOrderStatusSchema,
  adminRefundSchema,
  applicationReviewSchema,
  campaignApplySchema,
  campaignCreateSchema,
  campaignUpdateSchema,
  createOrderSchema,
  deliveryRateCreateSchema,
  deliveryRateUpdateSchema,
  forgotPasswordSchema,
  inventoryCreateSchema,
  inventoryUpdateSchema,
  loginSchema,
  newsCreateSchema,
  newsUpdateSchema,
  nurseryCreateSchema,
  nurseryUpdateSchema,
  quoteRequestSchema,
  registerSchema,
  requestVerificationSchema,
  resetPasswordSchema,
  serviceRequestCreateSchema,
  serviceRequestUpdateSchema,
  feedbackCreateSchema,
  feedbackUpdateSchema,
  shadowRunCreateSchema,
  speciesCreateSchema,
  speciesUpdateSchema,
  verifyPhoneSchema,
} from '@nurserylink/shared';
import { optionalLatLngQuery, requiredLatLngQuery } from '../lib/geo.js';
import { paginationQuerySchema } from '../lib/pagination.js';
import * as admin from '../modules/admin/admin.routes.js';
import * as boundaries from '../modules/boundaries/boundaries.routes.js';
import * as campaigns from '../modules/campaigns/campaigns.routes.js';
import * as news from '../modules/news/news.routes.js';
import { listNurseriesQuery } from '../modules/nurseries/nurseries.routes.js';
import { providerParams } from '../modules/orders/webhooks.routes.js';
import { mapParams, mapQuery } from '../modules/orders/orders.routes.js';
import * as search from '../modules/search/search.routes.js';
import * as species from '../modules/species/species.routes.js';

/** Who may call an operation. */
export type Access = 'public' | 'signed_in' | 'buyer' | 'buyer_or_admin' | 'admin' | 'webhook';

export interface Operation {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** Express-style path under /api/v1, e.g. /nurseries/:id */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  access: Access;
  params?: z.ZodObject;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Non-JSON request bodies */
  bodyContent?: { type: 'text/csv' | 'application/x-www-form-urlencoded' | 'multipart/form-data'; description: string; schema?: Record<string, unknown> };
  /** The envelope's data (and meta) on success */
  response?: { data: z.ZodType; meta?: z.ZodType };
  /** A non-envelope JSON download (GeoJSON exports) */
  raw?: z.ZodType;
  /** Success status and what comes back */
  success: { status: 200 | 201 | 202 | 204; description: string; content?: 'json' | 'geojson' | 'csv' };
  /** Extra non-standard outcomes worth documenting */
  errors?: Partial<Record<400 | 401 | 403 | 404 | 409 | 503, string>>;
}

const id = z.object({ id: z.uuid() });

/** Every API operation. The OpenAPI test checks this list against the routes Express really serves. */
export const operations: Operation[] = [
  // ── Health ────────────────────────────────────────────────
  { method: 'get', path: '/stats', tag: 'Health', summary: 'The marketplace at a glance: nurseries, trees and seedlings in stock, open campaigns', response: { data: r.publicStatsSchema }, access: 'public',
    success: { status: 200, description: 'Counts' } },
  { method: 'get', path: '/health', tag: 'Health', summary: 'Service and database status', response: { data: r.healthSchema }, access: 'public',
    success: { status: 200, description: 'API and database are up; lists the provider selected for each service' },
    errors: { 503: 'The database is unreachable' } },

  // ── Auth ─────────────────────────────────────────────────
  { method: 'post', path: '/auth/register', tag: 'Auth', summary: 'Register a buyer; texts a 6-digit code', response: { data: r.registeredSchema }, access: 'public',
    body: registerSchema, success: { status: 201, description: 'Account created, unverified' },
    errors: { 409: 'A verified account already uses this phone number or email' } },
  { method: 'post', path: '/auth/verify/request', tag: 'Auth', summary: 'Send a new verification code', response: { data: r.messageSchema }, access: 'public',
    body: requestVerificationSchema, success: { status: 202, description: 'Sent if the number belongs to an unverified account (always 202)' } },
  { method: 'post', path: '/auth/verify', tag: 'Auth', summary: 'Confirm the phone number and sign in', response: { data: r.authTokensSchema }, access: 'public',
    body: verifyPhoneSchema, success: { status: 200, description: 'Access token; the refresh token is set as the httpOnly cookie nl_refresh' },
    errors: { 400: 'The code is wrong, expired or already used' } },
  { method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Sign in with phone or email and password', response: { data: r.authTokensSchema }, access: 'public',
    body: loginSchema, success: { status: 200, description: 'Access token; refresh cookie set' },
    errors: { 401: 'Phone number, email or password is not correct', 403: 'phone_not_verified: confirm the phone number first' } },
  { method: 'post', path: '/auth/refresh', tag: 'Auth', summary: 'Rotate the refresh cookie and get a new access token', response: { data: r.authTokensSchema }, access: 'public',
    description: 'Reads the nl_refresh cookie (nl_admin_refresh when sent with X-Client: admin, the admin console). Reusing an old refresh token signs the account out everywhere.',
    success: { status: 200, description: 'New access token; new refresh cookie' }, errors: { 401: 'No valid refresh cookie: sign in again' } },
  { method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Sign out this device', access: 'public',
    success: { status: 204, description: 'Refresh token revoked and cookie cleared' } },
  { method: 'post', path: '/auth/password/forgot', tag: 'Auth', summary: 'Start a password reset (SMS code or email link)', response: { data: r.messageSchema }, access: 'public',
    body: forgotPasswordSchema, success: { status: 202, description: 'Always 202, whether or not the account exists' } },
  { method: 'post', path: '/auth/password/reset', tag: 'Auth', summary: 'Set a new password with an SMS code or email token', response: { data: r.messageSchema }, access: 'public',
    body: resetPasswordSchema, success: { status: 200, description: 'Password changed; every session signed out' } },
  { method: 'get', path: '/auth/me', tag: 'Auth', summary: 'The signed-in account', response: { data: r.publicUserSchema }, access: 'signed_in',
    success: { status: 200, description: 'The account' } },

  // ── Public catalogue ─────────────────────────────────────
  { method: 'get', path: '/nurseries', tag: 'Nurseries', summary: 'Find nurseries (JSON or GeoJSON), optionally nearest-first by road', response: { data: z.union([z.array(r.nurserySummarySchema), r.nurseryFeatureCollectionSchema]), meta: z.union([r.nurseryListMetaSchema, r.nurseryGeoJsonMetaSchema]) }, access: 'public',
    description: '`q` matches a nursery name or any tree it stocks (common, scientific or local name). Use format=geojson for the map: one unpaginated collection.',
    query: listNurseriesQuery, success: { status: 200, description: 'Nurseries, or a FeatureCollection with format=geojson' } },
  { method: 'get', path: '/nurseries/:id', tag: 'Nurseries', summary: 'Nursery profile with stock; road distance when lat/lng are given', response: { data: r.nurseryProfileSchema }, access: 'public',
    params: id, query: optionalLatLngQuery, success: { status: 200, description: 'The nursery' } },
  { method: 'get', path: '/nurseries/:id/route', tag: 'Nurseries', summary: 'Driving route from a point to the nursery', response: { data: r.routeSchema }, access: 'public',
    params: id, query: requiredLatLngQuery, success: { status: 200, description: 'Route line, distance, duration and turn-by-turn steps' },
    errors: { 503: 'Routing is unavailable (routes never fall back to a straight line)' } },
  { method: 'get', path: '/species', tag: 'Species', summary: 'Digital Tree Library', response: { data: z.array(r.speciesListItemSchema), meta: r.speciesListMetaSchema }, access: 'public',
    query: species.listQuery, success: { status: 200, description: 'Species' } },
  { method: 'get', path: '/species/:slug', tag: 'Species', summary: 'One species', response: { data: r.speciesProfileSchema }, access: 'public',
    params: species.slugParams, success: { status: 200, description: 'The species, with local names, growth and media' } },
  { method: 'get', path: '/species/:slug/nurseries', tag: 'Species', summary: 'Nurseries stocking a species', response: { data: z.array(r.speciesNurserySchema), meta: r.speciesNurseriesMetaSchema }, access: 'public',
    params: species.slugParams, query: species.nurseriesQuery, success: { status: 200, description: 'Nurseries with stock and price' } },
  { method: 'get', path: '/search/suggest', tag: 'Search', summary: 'Suggestions as you type (typo-tolerant)', access: 'public',
    description: 'Trees (common, scientific and local names), nurseries, and districts and sub-counties whose names match the text, best first. Spelling mistakes are forgiven ("mvulle" suggests Mvule).',
    response: { data: z.array(r.suggestionSchema) }, query: search.suggestQuery, success: { status: 200, description: 'Suggestions, best first' } },
  { method: 'get', path: '/places', tag: 'Search', summary: 'Find a place by name', access: 'public',
    description: 'Our districts and sub-counties, then villages, landmarks and roads in Uganda from OpenStreetMap. If OpenStreetMap is unavailable, meta.osm is "unavailable" and only our own places are returned. Call it when the person asks to search, not on every keystroke.',
    response: { data: z.array(r.placeSchema), meta: r.placesMetaSchema }, query: search.placesQuery, success: { status: 200, description: 'Places, ours first' } },
  { method: 'get', path: '/boundaries', tag: 'Boundaries', summary: 'Districts and sub-counties', response: { data: z.array(r.boundarySchema) }, access: 'public',
    query: boundaries.listQuery, success: { status: 200, description: 'Boundaries (without geometry)' } },
  { method: 'get', path: '/boundaries/:id/geojson', tag: 'Boundaries', summary: 'A boundary outline', response: { data: r.boundaryFeatureSchema }, access: 'public',
    params: boundaries.idParams, success: { status: 200, description: 'GeoJSON Feature', content: 'json' } },
  { method: 'get', path: '/news', tag: 'News', summary: 'Published news', response: { data: z.array(r.newsListItemSchema), meta: r.pageMetaSchema }, access: 'public',
    query: news.listQuery, success: { status: 200, description: 'Posts' } },
  { method: 'get', path: '/news/:slug', tag: 'News', summary: 'One news post', response: { data: r.newsPostSchema }, access: 'public',
    params: news.slugParams, success: { status: 200, description: 'The post' } },

  // ── Campaigns ────────────────────────────────────────────
  { method: 'get', path: '/campaigns', tag: 'Campaigns', summary: 'Running free-seedling campaigns', response: { data: z.array(r.campaignSchema), meta: r.pageMetaSchema }, access: 'public',
    query: campaigns.listQuery, success: { status: 200, description: 'Campaigns with the stock meter' } },
  { method: 'get', path: '/campaigns/:id', tag: 'Campaigns', summary: 'One campaign (including ended ones)', response: { data: r.campaignSchema }, access: 'public',
    params: id, success: { status: 200, description: 'The campaign, with is_open' } },
  { method: 'post', path: '/campaigns/:id/apply', tag: 'Campaigns', summary: 'Apply for free seedlings', response: { data: r.applicationSchema }, access: 'buyer',
    params: id, body: campaignApplySchema, success: { status: 201, description: 'Application recorded (pending review)' },
    errors: { 400: 'Answers do not meet the eligibility rules', 409: 'Already applied, campaign closed, or too few seedlings left' } },
  { method: 'get', path: '/campaigns/applications/me', tag: 'Campaigns', summary: 'My applications', response: { data: z.array(r.applicationSchema), meta: r.pageMetaSchema }, access: 'buyer',
    query: paginationQuerySchema, success: { status: 200, description: 'Applications' } },

  // ── Service requests ─────────────────────────────────────
  { method: 'post', path: '/service-requests', tag: 'Services', summary: 'Ask for a tree-planting service', response: { data: r.serviceRequestSchema }, access: 'buyer',
    body: serviceRequestCreateSchema, success: { status: 201, description: 'Request recorded; the team phones the buyer back' } },
  { method: 'post', path: '/feedback', tag: 'Feedback', summary: 'Leave feedback (anyone; signed-in people are linked to their account)', response: { data: r.feedbackReceiptSchema }, access: 'public',
    body: feedbackCreateSchema, success: { status: 201, description: 'Feedback recorded' } },
  { method: 'get', path: '/service-requests/me', tag: 'Services', summary: 'My service requests', response: { data: z.array(r.serviceRequestSchema), meta: r.pageMetaSchema }, access: 'buyer',
    query: paginationQuerySchema, success: { status: 200, description: 'Requests, newest first' } },

  // ── Orders ───────────────────────────────────────────────
  { method: 'post', path: '/orders/quote', tag: 'Orders', summary: 'Price an order (items + delivery by road distance)', response: { data: r.quoteSchema }, access: 'buyer',
    body: quoteRequestSchema, success: { status: 200, description: 'Breakdown and a quote_token valid for 10 minutes' },
    errors: { 409: 'Not enough stock', 503: 'Routing is unavailable, so delivery cannot be priced' } },
  { method: 'post', path: '/orders', tag: 'Orders', summary: 'Place an order from a quote; sends the mobile-money prompt', response: { data: r.orderSchema, meta: r.orderCreatedMetaSchema }, access: 'buyer',
    body: createOrderSchema, success: { status: 201, description: 'Order pending payment' },
    errors: { 409: 'Prices or stock changed since the quote (re-quote), or the quote was already used', 503: 'The payment provider is unavailable; the order was cancelled' } },
  { method: 'get', path: '/orders/by-code/:code', tag: 'Orders', summary: "The nursery's order map (link in the order SMS)", response: { data: r.orderMapSchema }, access: 'public',
    description: 'Needs the key `k` from the SMS link. A wrong code or key both answer 404.',
    params: mapParams, query: mapQuery, success: { status: 200, description: 'Delivery pin, address, items and buyer contact' } },
  { method: 'get', path: '/orders/me', tag: 'Orders', summary: 'My orders', response: { data: z.array(r.orderSchema), meta: r.pageMetaSchema }, access: 'buyer_or_admin',
    query: paginationQuerySchema, success: { status: 200, description: 'Orders' } },
  { method: 'get', path: '/orders/:id', tag: 'Orders', summary: 'One order (owner or admin)', response: { data: r.orderSchema }, access: 'buyer_or_admin',
    params: id, success: { status: 200, description: 'The order' } },
  { method: 'put', path: '/orders/:id/confirm-delivery', tag: 'Orders', summary: 'Confirm the seedlings arrived; pays the nursery', response: { data: r.orderSchema }, access: 'buyer',
    params: id, success: { status: 200, description: 'Order delivered; released once the payout succeeds' },
    errors: { 409: 'The order has not been dispatched' } },

  // ── Webhooks ─────────────────────────────────────────────
  { method: 'post', path: '/webhooks/payments/:provider', tag: 'Webhooks', summary: 'Payment status callback', response: { data: r.webhookResultSchema }, access: 'webhook',
    description: 'Idempotent. The body only identifies the payment; the outcome is always read back from the provider.',
    params: providerParams, body: z.looseObject({}), success: { status: 200, description: 'Acknowledged (applied, duplicate, pending or unknown_payment)' } },
  { method: 'post', path: '/webhooks/sms/inbound', tag: 'Webhooks', summary: "Nursery SMS replies ('<code> 1' dispatched, '<code> 2' out of stock)", response: { data: r.webhookResultSchema }, access: 'webhook',
    description: 'Form-encoded, as Africa\'s Talking posts it. Requires ?token=SMS_INBOUND_TOKEN when configured. Always 200.',
    bodyContent: { type: 'application/x-www-form-urlencoded', description: 'Gateway fields (from, text, …)',
      schema: { type: 'object', properties: { from: { type: 'string' }, text: { type: 'string' } } } },
    success: { status: 200, description: 'Acknowledged, with what was done' } },

  // ── Admin: nurseries and stock ───────────────────────────
  { method: 'get', path: '/admin/nurseries', tag: 'Admin: nurseries and stock', summary: 'All nurseries (including inactive)', response: { data: z.array(r.adminNurserySchema), meta: r.pageMetaSchema }, access: 'admin',
    query: admin.nurseriesQuery, success: { status: 200, description: 'Nurseries' } },
  { method: 'get', path: '/admin/nurseries/:id', tag: 'Admin: nurseries and stock', summary: 'One nursery', response: { data: r.adminNurserySchema }, access: 'admin',
    params: id, success: { status: 200, description: 'The nursery, with payout number' } },
  { method: 'post', path: '/admin/nurseries', tag: 'Admin: nurseries and stock', summary: 'Create a nursery', response: { data: r.adminNurserySchema }, access: 'admin',
    body: nurseryCreateSchema, success: { status: 201, description: 'Created (sub-county and district come from the location)' } },
  { method: 'patch', path: '/admin/nurseries/:id', tag: 'Admin: nurseries and stock', summary: 'Update a nursery', response: { data: r.adminNurserySchema }, access: 'admin',
    params: id, body: nurseryUpdateSchema, success: { status: 200, description: 'Updated' } },
  { method: 'delete', path: '/admin/nurseries/:id', tag: 'Admin: nurseries and stock', summary: 'Delete a nursery with no stock, orders or campaigns', access: 'admin',
    params: id, success: { status: 204, description: 'Deleted' }, errors: { 409: 'Still referenced; deactivate instead' } },
  { method: 'get', path: '/admin/nurseries/:id/inventory', tag: 'Admin: nurseries and stock', summary: "A nursery's stock lines", response: { data: z.array(r.inventoryLineSchema) }, access: 'admin',
    params: id, success: { status: 200, description: 'Stock lines' } },
  { method: 'post', path: '/admin/inventory', tag: 'Admin: nurseries and stock', summary: 'Add a stock line', response: { data: r.inventoryLineSchema }, access: 'admin',
    body: inventoryCreateSchema, success: { status: 201, description: 'Created' } },
  { method: 'post', path: '/admin/inventory/import', tag: 'Admin: nurseries and stock', summary: 'Import stock from CSV (dry run unless commit=true)', response: { data: r.importResultSchema }, access: 'admin',
    query: admin.importQuery,
    bodyContent: { type: 'text/csv', description: 'Columns: nursery_id or nursery_name, species_slug, quantity, unit_price (up to 2 MB, 5,000 rows)' },
    success: { status: 200, description: 'Per-row changes (create / update / unchanged)' }, errors: { 400: 'Row errors; nothing applied' } },
  { method: 'patch', path: '/admin/inventory/:id', tag: 'Admin: nurseries and stock', summary: 'Update a stock line', response: { data: r.inventoryLineSchema }, access: 'admin',
    params: id, body: inventoryUpdateSchema, success: { status: 200, description: 'Updated' } },
  { method: 'delete', path: '/admin/inventory/:id', tag: 'Admin: nurseries and stock', summary: 'Delete a stock line never ordered', access: 'admin',
    params: id, success: { status: 204, description: 'Deleted' }, errors: { 409: 'Used in orders; set quantity to 0 instead' } },

  // ── Admin: species ───────────────────────────────────────
  { method: 'get', path: '/admin/species', tag: 'Admin: species', summary: 'All species', response: { data: z.array(r.speciesListItemSchema), meta: r.pageMetaSchema }, access: 'admin',
    query: admin.speciesQuery, success: { status: 200, description: 'Species' } },
  { method: 'get', path: '/admin/species/:id', tag: 'Admin: species', summary: 'One species', response: { data: r.speciesProfileSchema }, access: 'admin',
    params: id, success: { status: 200, description: 'The species' } },
  { method: 'post', path: '/admin/species', tag: 'Admin: species', summary: 'Create a species (with local names and media)', response: { data: r.speciesProfileSchema }, access: 'admin',
    body: speciesCreateSchema, success: { status: 201, description: 'Created' } },
  { method: 'patch', path: '/admin/species/:id', tag: 'Admin: species', summary: 'Update a species', response: { data: r.speciesProfileSchema }, access: 'admin',
    params: id, body: speciesUpdateSchema, success: { status: 200, description: 'Updated' } },
  { method: 'delete', path: '/admin/species/:id', tag: 'Admin: species', summary: 'Delete an unused species', access: 'admin',
    params: id, success: { status: 204, description: 'Deleted' }, errors: { 409: 'Used by stock, orders or campaigns' } },

  // ── Admin: news ──────────────────────────────────────────
  { method: 'get', path: '/admin/news', tag: 'Admin: news', summary: 'All posts, including drafts', response: { data: z.array(r.adminNewsSchema), meta: r.pageMetaSchema }, access: 'admin',
    query: admin.newsQuery, success: { status: 200, description: 'Posts' } },
  { method: 'get', path: '/admin/news/:id', tag: 'Admin: news', summary: 'One post', response: { data: r.adminNewsSchema }, access: 'admin',
    params: id, success: { status: 200, description: 'The post' } },
  { method: 'post', path: '/admin/news', tag: 'Admin: news', summary: 'Create a post', response: { data: r.adminNewsSchema }, access: 'admin',
    body: newsCreateSchema, success: { status: 201, description: 'Created' } },
  { method: 'patch', path: '/admin/news/:id', tag: 'Admin: news', summary: 'Update or publish a post', response: { data: r.adminNewsSchema }, access: 'admin',
    params: id, body: newsUpdateSchema, success: { status: 200, description: 'Updated' } },
  { method: 'delete', path: '/admin/news/:id', tag: 'Admin: news', summary: 'Delete a post', access: 'admin',
    params: id, success: { status: 204, description: 'Deleted' } },

  // ── Admin: campaigns ─────────────────────────────────────
  { method: 'get', path: '/admin/campaigns', tag: 'Admin: campaigns', summary: 'All campaigns', response: { data: z.array(r.campaignSchema), meta: r.pageMetaSchema }, access: 'admin',
    query: paginationQuerySchema, success: { status: 200, description: 'Campaigns' } },
  { method: 'get', path: '/admin/campaigns/:id', tag: 'Admin: campaigns', summary: 'One campaign', response: { data: r.campaignSchema }, access: 'admin',
    params: id, success: { status: 200, description: 'The campaign' } },
  { method: 'post', path: '/admin/campaigns', tag: 'Admin: campaigns', summary: 'Create a campaign', response: { data: r.campaignSchema }, access: 'admin',
    body: campaignCreateSchema, success: { status: 201, description: 'Created; allocation is the sum of its items' } },
  { method: 'patch', path: '/admin/campaigns/:id', tag: 'Admin: campaigns', summary: 'Update a campaign', response: { data: r.campaignSchema }, access: 'admin',
    params: id, body: campaignUpdateSchema, success: { status: 200, description: 'Updated' },
    errors: { 409: 'The change would push remaining stock below zero' } },
  { method: 'delete', path: '/admin/campaigns/:id', tag: 'Admin: campaigns', summary: 'Delete a campaign with no applications', access: 'admin',
    params: id, success: { status: 204, description: 'Deleted' }, errors: { 409: 'Has applications; switch it off instead' } },
  { method: 'get', path: '/admin/campaigns/:id/applications', tag: 'Admin: campaigns', summary: "A campaign's applications", response: { data: z.array(r.adminApplicationSchema), meta: r.pageMetaSchema }, access: 'admin',
    params: id, query: admin.applicationsQuery, success: { status: 200, description: 'Applications with applicant details' } },
  { method: 'put', path: '/admin/applications/:id', tag: 'Admin: campaigns', summary: 'Approve, reject, or mark collected', response: { data: r.adminApplicationSchema }, access: 'admin',
    description: 'Approval takes the seedlings from the campaign\'s remaining stock in the same transaction.',
    params: id, body: applicationReviewSchema, success: { status: 200, description: 'Reviewed; the applicant is sent an SMS' },
    errors: { 409: 'Not allowed from the current status, or not enough seedlings left' } },
  { method: 'get', path: '/admin/feedback', tag: 'Admin: feedback', summary: 'Feedback from people using the site', response: { data: z.array(r.adminFeedbackSchema), meta: r.pageMetaSchema }, access: 'admin',
    query: admin.feedbackQuery, success: { status: 200, description: 'Feedback, newest first' } },
  { method: 'put', path: '/admin/feedback/:id', tag: 'Admin: feedback', summary: 'Mark feedback new, read or done', response: { data: r.adminFeedbackSchema }, access: 'admin',
    params: id, body: feedbackUpdateSchema, success: { status: 200, description: 'Updated' } },
  { method: 'get', path: '/admin/service-requests', tag: 'Admin: service requests', summary: 'Service requests to phone back', response: { data: z.array(r.adminServiceRequestSchema), meta: r.pageMetaSchema }, access: 'admin',
    query: admin.serviceRequestsQuery, success: { status: 200, description: 'Requests with the requester\'s name and phone, newest first' } },
  { method: 'put', path: '/admin/service-requests/:id', tag: 'Admin: service requests', summary: 'Mark a request contacted, scheduled, done or cancelled', response: { data: r.adminServiceRequestSchema }, access: 'admin',
    params: id, body: serviceRequestUpdateSchema, success: { status: 200, description: 'Updated' }, errors: { 409: 'Not a valid next step from its current status' } },

  // ── Admin: media ─────────────────────────────────────────
  { method: 'post', path: '/admin/media', tag: 'Admin: species', summary: 'Upload a photo (stored as 480 and 960 px WebP)', response: { data: r.mediaUploadSchema }, access: 'admin',
    bodyContent: { type: 'multipart/form-data', description: 'A JPEG, PNG or WebP in the "file" field, up to 5 MB', schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } },
    success: { status: 201, description: 'Where the photo is served' } },

  // ── Admin: delivery rates ────────────────────────────────
  { method: 'get', path: '/admin/delivery-rates', tag: 'Admin: delivery rates', summary: 'Delivery rate table', response: { data: z.array(r.deliveryRateSchema) }, access: 'admin',
    success: { status: 200, description: 'Rates' } },
  { method: 'post', path: '/admin/delivery-rates', tag: 'Admin: delivery rates', summary: 'Add a rate', response: { data: r.deliveryRateSchema }, access: 'admin',
    body: deliveryRateCreateSchema, success: { status: 201, description: 'Created' } },
  { method: 'patch', path: '/admin/delivery-rates/:id', tag: 'Admin: delivery rates', summary: 'Update a rate', response: { data: r.deliveryRateSchema }, access: 'admin',
    params: id, body: deliveryRateUpdateSchema, success: { status: 200, description: 'Updated' } },
  { method: 'delete', path: '/admin/delivery-rates/:id', tag: 'Admin: delivery rates', summary: 'Delete a rate', access: 'admin',
    params: id, success: { status: 204, description: 'Deleted' } },

  // ── Admin: orders and payouts ────────────────────────────
  { method: 'get', path: '/admin/analytics', tag: 'Admin: orders and payouts', summary: 'Insights: sales over time, top trees and nurseries, payment and delivery mix, stock, campaigns', response: { data: r.analyticsSchema }, access: 'admin',
    description: 'Sales count paid orders that were not refunded; each headline figure comes with the previous period for comparison.',
    query: r.analyticsQuerySchema, success: { status: 200, description: 'Figures for the period' } },
  { method: 'get', path: '/admin/dashboard', tag: 'Admin: orders and payouts', summary: 'What needs attention: disputes, failed payouts, stuck orders, stale stock, applications, unread SMS', response: { data: r.dashboardSchema }, access: 'admin',
    success: { status: 200, description: 'A count and the top items for each list' } },
  { method: 'get', path: '/admin/orders/:id', tag: 'Admin: orders and payouts', summary: 'One order with buyer and payment', response: { data: r.adminOrderSchema }, access: 'admin',
    params: id, success: { status: 200, description: 'The order' } },
  { method: 'get', path: '/admin/orders', tag: 'Admin: orders and payouts', summary: 'Orders, filtered by status', response: { data: z.array(r.adminOrderSchema), meta: r.pageMetaSchema }, access: 'admin',
    query: admin.ordersQuery, success: { status: 200, description: 'Orders with buyer details' } },
  { method: 'put', path: '/admin/orders/:id/status', tag: 'Admin: orders and payouts', summary: 'Dispatch, refund or release an order (reason required)', response: { data: r.orderSchema }, access: 'admin',
    params: id, body: adminOrderStatusSchema, success: { status: 200, description: 'Updated; refunds and releases complete when the provider confirms' },
    errors: { 409: 'Not allowed by the order state machine' } },
  { method: 'post', path: '/admin/orders/:id/refund', tag: 'Admin: orders and payouts', summary: 'Refund the buyer (reason required)', response: { data: r.orderSchema }, access: 'admin',
    params: id, body: adminRefundSchema, success: { status: 200, description: 'Order disputed; refunded when the provider confirms' } },
  { method: 'get', path: '/admin/payouts', tag: 'Admin: orders and payouts', summary: 'Payouts and refunds, e.g. status=failed', response: { data: z.array(r.payoutSchema), meta: r.pageMetaSchema }, access: 'admin',
    query: admin.payoutsQuery, success: { status: 200, description: 'Payouts with attempt counts' } },
  { method: 'post', path: '/admin/payouts/:id/retry', tag: 'Admin: orders and payouts', summary: 'Retry a failed payout', response: { data: r.payoutRetrySchema }, access: 'admin',
    params: id, success: { status: 200, description: 'New attempt started' }, errors: { 409: 'Not failed, or a newer attempt exists' } },

  // ── Admin: Nursery Shadow ────────────────────────────────
  { method: 'post', path: '/admin/shadow/runs', tag: 'Admin: Nursery Shadow', summary: 'Start (or reuse) a Nursery Shadow run', response: { data: r.shadowRunSchema, meta: r.shadowRunStartMetaSchema }, access: 'admin',
    body: shadowRunCreateSchema,
    success: { status: 202, description: 'Queued (meta.outcome = new). 200 with outcome in_progress or cached when an identical run exists' } },
  { method: 'get', path: '/admin/shadow/runs', tag: 'Admin: Nursery Shadow', summary: 'Runs, newest first', response: { data: z.array(r.shadowRunSchema), meta: r.pageMetaSchema }, access: 'admin',
    query: paginationQuerySchema, success: { status: 200, description: 'Runs with summaries' } },
  { method: 'get', path: '/admin/shadow/runs/:id', tag: 'Admin: Nursery Shadow', summary: 'One run', response: { data: r.shadowRunSchema }, access: 'admin',
    params: id, success: { status: 200, description: 'Status, parameters and summary' } },
  { method: 'get', path: '/admin/shadow/runs/:id/geojson', tag: 'Admin: Nursery Shadow', summary: "A run's map layer: service zones or shadows", response: { data: r.shadowLayerCollectionSchema }, access: 'admin',
    params: id, query: admin.layerQuery, success: { status: 200, description: 'FeatureCollection in data' }, errors: { 409: 'The run has not succeeded' } },

  // ── Admin: audit and exports ─────────────────────────────
  { method: 'get', path: '/admin/audit-log', tag: 'Admin: audit and exports', summary: 'Audit log', response: { data: z.array(r.auditEntrySchema), meta: r.pageMetaSchema }, access: 'admin',
    query: admin.auditQuery, success: { status: 200, description: 'Entries, newest first' } },
  { method: 'get', path: '/admin/export/nurseries.csv', tag: 'Admin: audit and exports', summary: 'Nurseries and stock as CSV', access: 'admin',
    success: { status: 200, description: 'CSV download (UTF-8 with BOM)', content: 'csv' } },
  { method: 'get', path: '/admin/export/nurseries.geojson', tag: 'Admin: audit and exports', summary: 'Nurseries as GeoJSON', raw: r.nurseryFeatureCollectionSchema, access: 'admin',
    success: { status: 200, description: 'GeoJSON download', content: 'geojson' } },
  { method: 'get', path: '/admin/export/shadow/:runId.geojson', tag: 'Admin: audit and exports', summary: "A run's shadow zones as GeoJSON", raw: r.shadowLayerCollectionSchema, access: 'admin',
    params: admin.runIdParams, success: { status: 200, description: 'GeoJSON download', content: 'geojson' }, errors: { 409: 'The run has not succeeded' } },
];
