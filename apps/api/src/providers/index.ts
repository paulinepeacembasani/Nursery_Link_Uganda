import type { Logger } from 'pino';
import type { Config } from '../config.js';
import type { MobileMoneyMethod, PaymentProviderName } from '@nurserylink/shared';
import type { EmailProvider } from './email/email.js';
import { MockPayment } from './payment/mockPayment.js';
import { MtnMomo } from './payment/mtnMomo.js';
import type { PaymentProvider } from './payment/payment.js';
import { NotYetAvailablePayment } from './payment/unavailableProvider.js';
import { MockEmail } from './email/mockEmail.js';
import { SmtpEmail } from './email/smtpEmail.js';
import { AfricasTalkingSms } from './sms/africasTalking.js';
import type { GeocodingProvider } from './geocoding/geocoding.js';
import { MockGeocoding } from './geocoding/mockGeocoding.js';
import { NominatimGeocoding } from './geocoding/nominatim.js';
import { API_VERSION } from '../lib/version.js';
import { MockRouting } from './routing/mockRouting.js';
import { OsrmRouting } from './routing/osrm.js';
import { OpenRouteServiceRouting } from './routing/openRouteService.js';
import type { RoutingProvider } from './routing/routing.js';
import { MockSms } from './sms/mockSms.js';
import type { SmsProvider } from './sms/sms.js';

export interface Providers {
  sms: SmsProvider;
  email: EmailProvider;
  routing: RoutingProvider;
  geocoding: GeocodingProvider;
  payments: PaymentProviders;
}

/** Payment providers by name, plus which one serves each payment method in the current mode. */
export interface PaymentProviders {
  byName(name: PaymentProviderName): PaymentProvider;
  forMethod(method: MobileMoneyMethod): PaymentProvider;
  /** False for a method whose live provider is not built yet (Airtel Money) */
  isAvailable(method: MobileMoneyMethod): boolean;
}

export const paymentProviders = (
  mode: 'mock' | 'live',
  mock: PaymentProvider = new MockPayment(),
  live: Partial<Record<MobileMoneyMethod, PaymentProvider>> = {}
): PaymentProviders => {
  const liveByMethod: Record<MobileMoneyMethod, PaymentProvider> = {
    mtn_momo: live.mtn_momo ?? new NotYetAvailablePayment('mtn_momo'),
    airtel_money: live.airtel_money ?? new NotYetAvailablePayment('airtel_money'),
  };
  return {
    byName: name => (name === 'mock' ? mock : liveByMethod[name]),
    forMethod: method => (mode === 'mock' ? mock : liveByMethod[method]),
    isAvailable: method => mode === 'mock' || !(liveByMethod[method] instanceof NotYetAvailablePayment),
  };
};

const mtnFromConfig = (config: Config): MtnMomo =>
  new MtnMomo({
    baseUrl: config.MTN_BASE_URL,
    targetEnvironment: config.MTN_TARGET_ENVIRONMENT,
    currency: config.MTN_CURRENCY,
    collection: {
      subscriptionKey: required(config.MTN_COLLECTION_SUBSCRIPTION_KEY, 'MTN_COLLECTION_SUBSCRIPTION_KEY'),
      apiUser: required(config.MTN_COLLECTION_API_USER, 'MTN_COLLECTION_API_USER'),
      apiKey: required(config.MTN_COLLECTION_API_KEY, 'MTN_COLLECTION_API_KEY'),
    },
    disbursement: {
      subscriptionKey: required(config.MTN_DISBURSEMENT_SUBSCRIPTION_KEY, 'MTN_DISBURSEMENT_SUBSCRIPTION_KEY'),
      apiUser: required(config.MTN_DISBURSEMENT_API_USER, 'MTN_DISBURSEMENT_API_USER'),
      apiKey: required(config.MTN_DISBURSEMENT_API_KEY, 'MTN_DISBURSEMENT_API_KEY'),
    },
    callbackUrl: config.MTN_CALLBACK_URL,
  });

const required = (value: string | undefined, name: string): string => {
  // config.ts already guarantees these when a real provider is selected; this keeps the types honest
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

/** Chooses each provider implementation from configuration. */
export const createProviders = (config: Config, logger: Logger): Providers => ({
  sms:
    config.SMS_PROVIDER === 'africastalking'
      ? new AfricasTalkingSms(required(config.AT_USERNAME, 'AT_USERNAME'), required(config.AT_API_KEY, 'AT_API_KEY'), config.AT_SENDER_ID)
      : new MockSms(logger),
  email:
    config.EMAIL_PROVIDER === 'smtp'
      ? new SmtpEmail({
          host: required(config.SMTP_HOST, 'SMTP_HOST'),
          port: config.SMTP_PORT,
          user: required(config.SMTP_USER, 'SMTP_USER'),
          password: required(config.SMTP_PASSWORD, 'SMTP_PASSWORD'),
          from: config.EMAIL_FROM,
        })
      : new MockEmail(logger),
  routing:
    config.ROUTING_PROVIDER === 'osrm' ? new OsrmRouting(config.OSRM_URL)
    : config.ROUTING_PROVIDER === 'openrouteservice' ? new OpenRouteServiceRouting({ apiKey: required(config.ORS_API_KEY, 'ORS_API_KEY'), baseUrl: config.ORS_URL })
    : new MockRouting(),
  geocoding:
    config.GEOCODER_PROVIDER === 'nominatim'
      ? new NominatimGeocoding({
          baseUrl: config.NOMINATIM_URL,
          userAgent: `NurseryLinkUganda/${API_VERSION} (${required(config.GEOCODER_CONTACT, 'GEOCODER_CONTACT')})`,
        })
      : new MockGeocoding(),
  payments:
    config.PAYMENT_PROVIDER_MODE === 'live'
      ? paymentProviders('live', new MockPayment(), { mtn_momo: mtnFromConfig(config) })
      : paymentProviders('mock'),
});
