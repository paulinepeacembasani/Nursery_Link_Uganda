import { Router } from 'express';
import type pg from 'pg';
import type { Config } from '../../config.js';
import type { PaymentProviders } from '../../providers/index.js';
import { API_VERSION as VERSION } from '../../lib/version.js';

export const healthRoutes = (pool: pg.Pool, config: Config, payments: PaymentProviders): Router => {
  const router = Router();

  router.get('/health', async (req, res) => {
    const providers = {
      payment: config.PAYMENT_PROVIDER_MODE,
      sms: config.SMS_PROVIDER,
      routing: config.ROUTING_PROVIDER,
      email: config.EMAIL_PROVIDER,
    };
    const payment_methods = { mtn_momo: payments.isAvailable('mtn_momo'), airtel_money: payments.isAvailable('airtel_money') };
    const features = { phone_verification: config.PHONE_VERIFICATION === 'required', payments: config.PAYMENTS === 'on' };
    const site = { demo_notice: config.DEMO_NOTICE === 'on', survey_url: config.SURVEY_URL ?? null };
    try {
      await pool.query('SELECT 1');
      res.json({ data: { status: 'ok', db: 'ok', version: VERSION, commit: config.RENDER_GIT_COMMIT ?? null, providers, payment_methods, features, site } });
    } catch (err) {
      req.log.error({ err }, 'Health check: database unreachable');
      res.status(503).json({ data: { status: 'degraded', db: 'down', version: VERSION, commit: config.RENDER_GIT_COMMIT ?? null, providers, payment_methods, features, site } });
    }
  });

  return router;
};
