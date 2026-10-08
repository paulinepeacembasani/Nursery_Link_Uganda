import { z } from 'zod';

// Domain enums shared by the API (Drizzle pgEnums are built from these) and the frontends.

export const roles = ['buyer', 'admin'] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;

export const boundaryLevels = ['district', 'sub_county'] as const;
export const boundaryLevelSchema = z.enum(boundaryLevels);
export type BoundaryLevel = z.infer<typeof boundaryLevelSchema>;

export const nurseryTypes = ['private', 'commercial', 'community'] as const;
export const nurseryTypeSchema = z.enum(nurseryTypes);
export type NurseryType = z.infer<typeof nurseryTypeSchema>;

export const certificationStatuses = ['certified', 'pending', 'unverified'] as const;
export const certificationStatusSchema = z.enum(certificationStatuses);
export type CertificationStatus = z.infer<typeof certificationStatusSchema>;

export const speciesCategories = ['indigenous', 'agroforestry', 'exotic', 'ornamental', 'medicinal', 'coffee', 'cocoa'] as const;
export const speciesCategorySchema = z.enum(speciesCategories);
export type SpeciesCategory = z.infer<typeof speciesCategorySchema>;

export const growthPaces = ['fast', 'moderate', 'slow'] as const;
export const growthPaceSchema = z.enum(growthPaces);
export type GrowthPace = z.infer<typeof growthPaceSchema>;

export const deliveryTypes = ['self_pickup', 'order_and_deliver'] as const;
export const deliveryTypeSchema = z.enum(deliveryTypes);
export type DeliveryType = z.infer<typeof deliveryTypeSchema>;

/** Order lifecycle. Legal transitions are enforced in apps/api/src/modules/orders/stateMachine.ts. */
export const orderStatuses = [
  'pending_payment',
  'escrow_held',
  'dispatched',
  'delivered',
  'released',
  'disputed',
  'refunded',
  'cancelled',
] as const;
export const orderStatusSchema = z.enum(orderStatuses);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * How an order was paid. "trial" marks orders placed while payments are switched off (PAYMENTS=off):
 * confirmed without taking money. Buyers can only choose the mobile money methods.
 */
export const paymentMethods = ['mtn_momo', 'airtel_money', 'trial'] as const;
export const paymentMethodSchema = z.enum(paymentMethods);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export const mobileMoneyMethods = ['mtn_momo', 'airtel_money'] as const;
export const mobileMoneyMethodSchema = z.enum(mobileMoneyMethods);
export type MobileMoneyMethod = z.infer<typeof mobileMoneyMethodSchema>;

export const paymentProviders = ['mock', 'mtn_momo', 'airtel_money'] as const;
export const paymentProviderSchema = z.enum(paymentProviders);
export type PaymentProviderName = z.infer<typeof paymentProviderSchema>;

export const paymentKinds = ['collection', 'disbursement', 'refund'] as const;
export const paymentKindSchema = z.enum(paymentKinds);
export type PaymentKind = z.infer<typeof paymentKindSchema>;

export const paymentStatuses = ['pending', 'successful', 'failed'] as const;
export const paymentStatusSchema = z.enum(paymentStatuses);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const funderTypes = ['government', 'ngo', 'foundation', 'corporate'] as const;
export const funderTypeSchema = z.enum(funderTypes);
export type FunderType = z.infer<typeof funderTypeSchema>;

export const applicationStatuses = ['pending', 'approved', 'rejected', 'collected'] as const;
export const applicationStatusSchema = z.enum(applicationStatuses);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const newsCategories = ['weather', 'market', 'policy', 'grant'] as const;
export const newsCategorySchema = z.enum(newsCategories);
export type NewsCategory = z.infer<typeof newsCategorySchema>;

export const vehicles = ['motorcycle', 'truck'] as const;
export const vehicleSchema = z.enum(vehicles);
export type Vehicle = z.infer<typeof vehicleSchema>;

export const otpPurposes = ['verify', 'reset'] as const;
export const otpPurposeSchema = z.enum(otpPurposes);
export type OtpPurpose = z.infer<typeof otpPurposeSchema>;

export const shadowRunStatuses = ['queued', 'running', 'succeeded', 'failed'] as const;
export const shadowRunStatusSchema = z.enum(shadowRunStatuses);
export type ShadowRunStatus = z.infer<typeof shadowRunStatusSchema>;

export const serviceZoneKms = [5, 10, 20] as const;

/** One question in a campaign's eligibility checklist (campaigns.eligibility_rules). */
export const eligibilityRuleSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  type: z.enum(['boolean', 'number', 'text']),
  required: z.boolean(),
});
export type EligibilityRule = z.infer<typeof eligibilityRuleSchema>;

/** Insights periods: 30 days (by day), 90 days (by week) or 12 months (by month). */
export const analyticsRanges = ['30d', '90d', '12m'] as const;
export const analyticsRangeSchema = z.enum(analyticsRanges);
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>;


/** Tree-planting services people can ask for on /services (delivery is ordered through checkout). */
export const serviceTypes = ['farm_plan', 'site_visit', 'planting', 'watering', 'orchard_care', 'survival_check', 'training'] as const;
export const serviceTypeSchema = z.enum(serviceTypes);
export type ServiceType = z.infer<typeof serviceTypeSchema>;

export const serviceRequestStatuses = ['new', 'contacted', 'scheduled', 'done', 'cancelled'] as const;
export const serviceRequestStatusSchema = z.enum(serviceRequestStatuses);
export type ServiceRequestStatus = z.infer<typeof serviceRequestStatusSchema>;

/** Feedback from anyone using the site (/feedback): how it went, an idea, or something that broke. */
export const feedbackKinds = ['experience', 'suggestion', 'problem'] as const;
export const feedbackKindSchema = z.enum(feedbackKinds);
export type FeedbackKind = z.infer<typeof feedbackKindSchema>;

export const feedbackStatuses = ['new', 'read', 'done'] as const;
export const feedbackStatusSchema = z.enum(feedbackStatuses);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;
