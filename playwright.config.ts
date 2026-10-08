import { defineConfig } from '@playwright/test';
import { ADMIN_URL, API_URL, CI, E2E_DATABASE_URL, PORTS, TRIAL, WEB_URL } from './e2e/env';

// The apps are production builds: .env's NODE_ENV=development must not leak into `vite build`
// (React would ship its development build and the service worker would never register)
const app = { API_PROXY_TARGET: API_URL, NODE_ENV: 'production' };

/**
 * End-to-end tests and screenshots, against the real API (mock providers) and production builds of
 * both apps served by `vite preview`. Everything runs on its own ports and database (e2e/env.ts):
 * the API resets and seeds nurserylink_e2e before it starts. Uses the installed Google Chrome.
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: CI ? 1 : 0,
  reporter: CI ? [['line'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]] : 'line',
  use: { channel: 'chrome', baseURL: WEB_URL, actionTimeout: 15_000, navigationTimeout: 30_000, locale: 'en-UG', timezoneId: 'Africa/Kampala', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'pnpm --filter @nurserylink/api db:reset && pnpm --filter @nurserylink/api serve:source',
      url: `${API_URL}/api/v1/health`,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        PORT: String(PORTS.api),
        PUBLIC_WEB_URL: WEB_URL,
        CORS_ORIGINS: `${WEB_URL},${ADMIN_URL}`,
        NODE_ENV: 'development',
        PAYMENT_PROVIDER_MODE: 'mock',
        // The suite tests the full flows (SMS codes, mobile money prompts), whatever .env says;
        // E2E_TRIAL=1 switches both off for the trial journey (e2e/trial.journey.spec.ts)
        PHONE_VERIFICATION: TRIAL ? 'off' : 'required',
        PAYMENTS: TRIAL ? 'off' : 'on',
        // The first-visit notice would cover every page the suite opens; WelcomeNotice.test.tsx covers it
        DEMO_NOTICE: 'off',
        SMS_PROVIDER: 'mock',
        ROUTING_PROVIDER: 'mock',
        EMAIL_PROVIDER: 'mock',
        LOG_LEVEL: 'warn',
      },
      reuseExistingServer: !CI,
      timeout: 180_000,
    },
    {
      command: `pnpm --filter @nurserylink/web build && pnpm --filter @nurserylink/web preview --port ${String(PORTS.web)}`,
      url: WEB_URL,
      env: app,
      reuseExistingServer: !CI,
      timeout: 240_000,
    },
    {
      command: `pnpm --filter @nurserylink/admin build && pnpm --filter @nurserylink/admin preview --port ${String(PORTS.admin)}`,
      url: ADMIN_URL,
      env: { ...app, WEB_PROXY_TARGET: WEB_URL },
      reuseExistingServer: !CI,
      timeout: 240_000,
    },
  ],
});
