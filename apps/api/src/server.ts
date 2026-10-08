import { ConfigError, parseConfig, type Config } from './config.js';
import { createApp } from './app.js';
import { createPool } from './db/client.js';
import { createLogger } from './lib/logger.js';
import PgBoss from 'pg-boss';
import { createProviders } from './providers/index.js';
import { PgBossQueue } from './jobs/queue.js';
import { startWorkers } from './jobs/worker.js';
import { buildServices } from './services.js';

const loadConfigOrExit = (): Config => {
  try {
    return parseConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
};

const config = loadConfigOrExit();

const logger = createLogger(config);
const pool = createPool(config.DATABASE_URL);
pool.on('error', err => {
  logger.error({ err }, 'Idle database client error');
});

// Background jobs live in Postgres (pg-boss, schema "pgboss"), so there is no Redis to run
const boss = new PgBoss({ connectionString: config.DATABASE_URL, schema: 'pgboss' });
boss.on('error', err => {
  logger.error({ err }, 'Job queue error');
});
await boss.start();

const deps = { config, pool, logger, providers: createProviders(config, logger), queue: new PgBossQueue(boss) };
const services = buildServices(deps);
await startWorkers(boss, services, logger);

if (config.NODE_ENV === 'production') {
  const mocks = [
    config.PAYMENT_PROVIDER_MODE === 'mock' && 'payments (no money moves; orders time out unpaid)',
    config.SMS_PROVIDER === 'mock' && 'SMS (verification codes and nursery orders are only logged)',
    config.EMAIL_PROVIDER === 'mock' && 'email',
    config.ROUTING_PROVIDER === 'mock' && 'routing (straight-line estimates; set ROUTING_PROVIDER=openrouteservice or osrm)',
  ].filter(Boolean);
  if (mocks.length) logger.warn({ mocks }, 'Running in production with mock providers');
  if (config.TRUST_PROXY === 0) logger.warn('TRUST_PROXY is 0: behind a load balancer, set it to the number of proxies or every client shares one rate limit');
}

const server = createApp(deps, services).listen(config.PORT, () => {
  logger.info({ port: config.PORT, providers: [config.PAYMENT_PROVIDER_MODE, config.SMS_PROVIDER, config.ROUTING_PROVIDER, config.EMAIL_PROVIDER] }, 'Nursery Link API listening');
});
// Slow or stalled clients cannot hold connections open indefinitely
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
// Longer than typical load-balancer idle timeouts (60 s), so the proxy closes idle connections first
server.keepAliveTimeout = 65_000;

// e.g. EADDRINUSE: fail loudly instead of appearing to start
server.on('error', err => {
  logger.fatal({ err }, 'HTTP server failed');
  process.exit(1);
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutting down');
  server.close(err => {
    if (err) logger.error({ err }, 'Error closing HTTP server');
    boss
      .stop({ graceful: true, timeout: 10_000 })
      .then(() => pool.end())
      .then(
      () => process.exit(err ? 1 : 0),
      (poolErr: unknown) => {
        logger.error({ err: poolErr }, 'Error closing database pool');
        process.exit(1);
      }
    );
  });
};
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
