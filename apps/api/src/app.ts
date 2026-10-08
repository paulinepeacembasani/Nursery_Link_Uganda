import express, { type Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { limiter } from './middleware/rateLimit.js';
import { apiSecurityHeaders, limitUrlLength, noStore, userOrIpKey } from './middleware/security.js';
import { docsRoutes } from './openapi/docs.routes.js';
import { validateResponses } from './openapi/responseContract.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { statsRoutes } from './modules/stats/stats.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { nurseriesRoutes } from './modules/nurseries/nurseries.routes.js';
import { speciesRoutes } from './modules/species/species.routes.js';
import { searchRoutes } from './modules/search/search.routes.js';
import { boundariesRoutes } from './modules/boundaries/boundaries.routes.js';
import { newsRoutes } from './modules/news/news.routes.js';
import { campaignsRoutes } from './modules/campaigns/campaigns.routes.js';
import { ordersRoutes } from './modules/orders/orders.routes.js';
import { serviceRequestsRoutes } from './modules/serviceRequests/serviceRequests.routes.js';
import { feedbackRoutes } from './modules/feedback/feedback.routes.js';
import { devRoutes, webhookRoutes } from './modules/orders/webhooks.routes.js';
import { MockPayment } from './providers/payment/mockPayment.js';
import { MockSms } from './providers/sms/mockSms.js';
import { buildServices, type AppDeps, type Services } from './services.js';

export type { AppDeps } from './services.js';

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export const createApp = (deps: AppDeps, services: Services = buildServices(deps)): Express => {
  const { config, pool, logger, providers } = deps;
  const { db, auth, nurseries, species, search, orders, payments, applications, serviceRequests, feedback, shadow, media } = services;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(pinoHttp({
    logger,
    genReqId: (req, res) => {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
  }));
  // Uploaded photos: public, immutable (each upload gets a new name), embeddable by the web apps
  app.use(
    config.MEDIA_PUBLIC_PATH,
    express.static(config.MEDIA_DIR, {
      immutable: true,
      maxAge: '365d',
      index: false,
      setHeaders: res => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
    // A missing file is a plain 404, never routed on into the API
    notFoundHandler
  );
  // Gzip JSON for phones on slow, metered connections (the map's GeoJSON shrinks about 8×)
  app.use(compression({ threshold: 1024 }));
  app.use(limitUrlLength);
  app.use(apiSecurityHeaders());
  app.use(cors({
    // Only the configured web and admin origins; other origins get no CORS headers at all
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Client'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After', 'Content-Disposition'],
    maxAge: 600,
  }));
  app.use(noStore);
  if (config.VALIDATE_RESPONSES) app.use(validateResponses);
  // Body limits: 100 kB JSON here, 10 kB for SMS webhooks and 2 MB for CSV imports on their routes
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const limit = limiter(config.RATE_LIMIT_SCALE);
  const v1 = express.Router();
  v1.use(healthRoutes(pool, config, providers.payments));
  if (config.API_DOCS) v1.use('/docs', docsRoutes());
  // Provider callbacks have their own limit and need no sign-in
  v1.use('/webhooks', webhookRoutes({ db, config, payments, orders, sms: providers.sms, logger, limit }));
  v1.use(authenticate(config.JWT_ACCESS_SECRET));
  // Overall per-account (or per-IP for visitors) limit; generous because of carrier-grade NAT
  v1.use(limit({ windowMinutes: 1, limit: 300, key: userOrIpKey }));
  v1.use('/auth', authRoutes(auth, config));
  v1.use('/nurseries', nurseriesRoutes(nurseries, limit));
  v1.use('/species', speciesRoutes(species));
  v1.use('/boundaries', boundariesRoutes(db));
  v1.use(searchRoutes(search, limit));
  v1.use('/stats', statsRoutes(db));
  v1.use('/news', newsRoutes(db));
  v1.use('/campaigns', campaignsRoutes(db, applications, limit));
  v1.use('/orders', ordersRoutes(orders, limit));
  v1.use('/service-requests', serviceRequestsRoutes(serviceRequests, limit));
  v1.use('/feedback', feedbackRoutes(feedback, limit));
  v1.use('/admin', adminRoutes({ db, species, orders, applications, serviceRequests, feedback, shadow, media, limit }));

  // Development and E2E helpers for mock providers; never mounted in production
  if (config.NODE_ENV !== 'production') {
    const mockPay = providers.payments.byName('mock');
    const settle = config.PAYMENT_PROVIDER_MODE === 'mock' && mockPay instanceof MockPayment
      ? (ref: string, status: 'successful' | 'failed') => { mockPay.settle(ref, status); }
      : undefined;
    const sms = providers.sms;
    const outbox = sms instanceof MockSms ? (to: string) => sms.outbox.filter(m => m.to === to) : undefined;
    if (settle || outbox) v1.use('/dev', devRoutes({ db, payments, settle, outbox }));
  }
  v1.use(notFoundHandler);

  app.use('/api/v1', v1);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
