import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from './config.js';
import { baseTestEnv } from '../test/testConfig.js';

const env = baseTestEnv('postgres://user:pass@localhost:5432/db');

describe('parseConfig', () => {
  it('accepts a complete environment and applies defaults', () => {
    const config = parseConfig(env);
    expect(config.PORT).toBe(4000);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:5173', 'http://localhost:5174']);
    expect(config.PAYMENT_PROVIDER_MODE).toBe('mock');
    expect(config.ROUTING_PROVIDER).toBe('mock');
  });

  it('lists every problem in one readable error', () => {
    const { JWT_ACCESS_SECRET: _omit, ...rest } = env;
    try {
      parseConfig({ ...rest, DATABASE_URL: 'not-a-url' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const { issues } = err as ConfigError;
      expect(issues.some(i => i.startsWith('JWT_ACCESS_SECRET'))).toBe(true);
      expect(issues.some(i => i.startsWith('DATABASE_URL'))).toBe(true);
    }
  });

  it('rejects short secrets', () => {
    expect(() => parseConfig({ ...env, QUOTE_TOKEN_SECRET: 'short' })).toThrow(/at least 32 characters/);
  });

  it('requires provider credentials only when a real provider is selected', () => {
    expect(() => parseConfig({ ...env, PAYMENT_PROVIDER_MODE: 'live' })).toThrow(/MTN_COLLECTION_API_KEY: required when PAYMENT_PROVIDER_MODE=live/);
    expect(() => parseConfig({ ...env, SMS_PROVIDER: 'africastalking' })).toThrow(/AT_API_KEY/);
    expect(() => parseConfig({ ...env, EMAIL_PROVIDER: 'smtp' })).toThrow(/SMTP_HOST/);
    expect(() => parseConfig({ ...env, ROUTING_PROVIDER: 'openrouteservice' })).toThrow(/ORS_API_KEY: required when ROUTING_PROVIDER=openrouteservice/);
    expect(parseConfig({ ...env, ROUTING_PROVIDER: 'openrouteservice', ORS_API_KEY: 'key' }).ROUTING_PROVIDER).toBe('openrouteservice');
    expect(() => parseConfig({ ...env, SMS_PROVIDER: 'africastalking', AT_USERNAME: 'sandbox', AT_API_KEY: 'key' })).toThrow(/SMS_INBOUND_TOKEN/);
    expect(parseConfig({ ...env, SMS_PROVIDER: 'africastalking', AT_USERNAME: 'sandbox', AT_API_KEY: 'key', SMS_INBOUND_TOKEN: 'x'.repeat(24) }).SMS_PROVIDER).toBe('africastalking');
  });

  it('treats blank variables (KEY= in .env) as unset', () => {
    const config = parseConfig({ ...env, MTN_COLLECTION_API_KEY: '', AT_API_KEY: '  ', SMTP_PORT: '' });
    expect(config.MTN_COLLECTION_API_KEY).toBeUndefined();
    expect(config.SMTP_PORT).toBe(587);
    expect(() => parseConfig({ ...env, JWT_ACCESS_SECRET: '' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a CORS list containing something that is not a URL', () => {
    expect(() => parseConfig({ ...env, CORS_ORIGINS: 'http://localhost:5173,nope' })).toThrow(/CORS_ORIGINS/);
  });
});
