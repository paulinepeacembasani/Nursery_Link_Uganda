import { z } from 'zod';

const optional = z.string().trim().min(1).optional();
const secret = (name: string) => z.string().min(32, `${name} must be at least 32 characters (generate with: openssl rand -hex 32)`);

const commaList = z
  .string()
  .transform(value => value.split(',').map(item => item.trim()).filter(Boolean))
  .pipe(z.array(z.url()).min(1));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /**
     * Number of reverse proxies in front of the API (Express "trust proxy"). 0 = clients connect
     * directly, so X-Forwarded-For is ignored and cannot be spoofed to dodge rate limits.
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    /** Multiplies every in-memory rate limit. Keep 1 in production; tests raise it. */
    RATE_LIMIT_SCALE: z.coerce.number().positive().max(100_000).default(1),
    /** Check every JSON response against its documented schema (tests only; costs time per request) */
    VALIDATE_RESPONSES: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    /** Where uploaded photos are stored, and the URL path they are served at */
    MEDIA_DIR: z.string().default('data/media'),
    MEDIA_PUBLIC_PATH: z.string().regex(/^\/[a-z0-9/_-]*[a-z0-9]$/).default('/media'),
    /** The deployed Git commit (Render sets it); /health reports it so the pipeline can confirm a deploy */
    RENDER_GIT_COMMIT: optional,
    /** Serve the OpenAPI document and Swagger UI at /api/v1/docs */
    API_DOCS: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
    DATABASE_URL: z.url(),

    /** Allowed browser origins: the public web app and the admin console. */
    CORS_ORIGINS: commaList,
    /** Base URL of the public site, used in links sent by SMS and email. */
    PUBLIC_WEB_URL: z.url(),

    JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
    QUOTE_TOKEN_SECRET: secret('QUOTE_TOKEN_SECRET'),
    /** Keys the hashes of SMS codes so a leaked otp_codes table cannot be brute-forced offline */
    OTP_HMAC_SECRET: secret('OTP_HMAC_SECRET'),
    /** Set when web and admin run on subdomains that should share the refresh cookie, e.g. ".nurserylink.ug" */
    COOKIE_DOMAIN: optional,

    /**
     * Trial switches, for trying the whole system before SMS and payments are live:
     * - PHONE_VERIFICATION=off: accounts are confirmed on registration (no SMS code) and sign in at once.
     * - PAYMENTS=off: checkout has no payment step; orders are confirmed straight away as "trial"
     *   orders, and payouts go through the mock provider (no money moves). Needs PAYMENT_PROVIDER_MODE=mock.
     */
    PHONE_VERIFICATION: z.enum(['required', 'off']).default('required'),
    PAYMENTS: z.enum(['on', 'off']).default('on'),
    PAYMENT_PROVIDER_MODE: z.enum(['mock', 'live']).default('mock'),
    /** The first-visit notice that nursery data is sample data and the site is still being built */
    DEMO_NOTICE: z.enum(['on', 'off']).default('on'),
    /** The needs-assessment survey (e.g. a Google Form link); offered in the first-visit notice and on /survey */
    SURVEY_URL: z.url().optional(),
    MTN_BASE_URL: z.url().default('https://sandbox.momodeveloper.mtn.com'),
    MTN_TARGET_ENVIRONMENT: z.string().default('sandbox'),
    MTN_CURRENCY: z.string().length(3).default('EUR'),
    MTN_COLLECTION_SUBSCRIPTION_KEY: optional,
    MTN_COLLECTION_API_USER: optional,
    MTN_COLLECTION_API_KEY: optional,
    MTN_DISBURSEMENT_SUBSCRIPTION_KEY: optional,
    MTN_DISBURSEMENT_API_USER: optional,
    MTN_DISBURSEMENT_API_KEY: optional,
    /** Where MTN posts payment status callbacks, e.g. https://api.example.ug/api/v1/webhooks/payments/mtn_momo */
    MTN_CALLBACK_URL: z.url().optional(),
    AIRTEL_BASE_URL: z.url().default('https://openapiuat.airtel.africa'),
    AIRTEL_CLIENT_ID: optional,
    AIRTEL_CLIENT_SECRET: optional,

    SMS_PROVIDER: z.enum(['mock', 'africastalking']).default('mock'),
    AT_USERNAME: optional,
    AT_API_KEY: optional,
    AT_SENDER_ID: optional,
    /** Shared secret in the inbound-SMS callback URL (?token=…); the gateway cannot sign requests */
    SMS_INBOUND_TOKEN: z.string().min(24, 'SMS_INBOUND_TOKEN must be at least 24 characters').optional(),

    /**
     * Road distances and directions: mock (straight line × 1.3), a self-hosted OSRM, or the hosted
     * OpenRouteService API (free key from https://openrouteservice.org/dev/#/signup).
     */
    ROUTING_PROVIDER: z.enum(['mock', 'osrm', 'openrouteservice']).default('mock'),
    OSRM_URL: z.url().default('http://localhost:5000'),
    ORS_API_KEY: optional,
    ORS_URL: z.url().default('https://api.openrouteservice.org'),

    /** Place search by name (villages, landmarks): mock, or OpenStreetMap's Nominatim */
    GEOCODER_PROVIDER: z.enum(['mock', 'nominatim']).default('mock'),
    NOMINATIM_URL: z.url().default('https://nominatim.openstreetmap.org'),
    /** Contact (email or URL) sent in the User-Agent, as Nominatim's usage policy requires */
    GEOCODER_CONTACT: optional,

    EMAIL_PROVIDER: z.enum(['mock', 'smtp']).default('mock'),
    EMAIL_FROM: z.string().default('Nursery Link Uganda <no-reply@nurserylink.local>'),
    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: optional,
    SMTP_PASSWORD: optional,

    // Used only by the seed script to create the first administrator
    ADMIN_FULL_NAME: optional,
    ADMIN_PHONE: optional,
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(12, 'ADMIN_PASSWORD must be at least 12 characters').optional(),
  })
  .superRefine((env, ctx) => {
    const require = (keys: (keyof typeof env)[], reason: string) => {
      for (const key of keys) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `required when ${reason}` });
      }
    };
    if (env.PAYMENTS === 'off' && env.PAYMENT_PROVIDER_MODE !== 'mock') {
      ctx.addIssue({ code: 'custom', path: ['PAYMENTS'], message: 'PAYMENTS=off needs PAYMENT_PROVIDER_MODE=mock (trial orders must never touch real money)' });
    }
    if (env.PAYMENT_PROVIDER_MODE === 'live') {
      require(
        [
          'MTN_COLLECTION_SUBSCRIPTION_KEY', 'MTN_COLLECTION_API_USER', 'MTN_COLLECTION_API_KEY',
          'MTN_DISBURSEMENT_SUBSCRIPTION_KEY', 'MTN_DISBURSEMENT_API_USER', 'MTN_DISBURSEMENT_API_KEY',
        ],
        'PAYMENT_PROVIDER_MODE=live'
      );
      // Airtel Money is not built yet, so its credentials are not required
      if (env.MTN_TARGET_ENVIRONMENT !== 'sandbox' && env.MTN_CURRENCY !== 'UGX') {
        ctx.addIssue({ code: 'custom', path: ['MTN_CURRENCY'], message: 'must be UGX outside the MTN sandbox (the sandbox only accepts EUR)' });
      }
    }
    if (env.SMS_PROVIDER === 'africastalking') require(['AT_USERNAME', 'AT_API_KEY', 'SMS_INBOUND_TOKEN'], 'SMS_PROVIDER=africastalking');
    if (env.ROUTING_PROVIDER === 'openrouteservice') require(['ORS_API_KEY'], 'ROUTING_PROVIDER=openrouteservice');
    if (env.GEOCODER_PROVIDER === 'nominatim') require(['GEOCODER_CONTACT'], 'GEOCODER_PROVIDER=nominatim');
    if (env.EMAIL_PROVIDER === 'smtp') require(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'], 'EMAIL_PROVIDER=smtp');
  });

export type Config = z.infer<typeof schema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map(issue => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Parses and validates configuration from an environment object. Throws ConfigError listing every problem. */
export const parseConfig = (env: NodeJS.ProcessEnv): Config => {
  // `KEY=` in a .env file means "not set", not "set to an empty string"
  const withoutBlanks = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ''));
  const result = schema.safeParse(withoutBlanks);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map(issue => `${issue.path.join('.') || 'env'}: ${issue.message}`));
  }
  return result.data;
};
