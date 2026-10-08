import type pg from 'pg';
import type { Logger } from 'pino';
import type { Config } from './config.js';
import { createDb, type Database } from './db/client.js';
import type { JobQueue } from './jobs/queue.js';
import type { Providers } from './providers/index.js';
import type { SmsProvider } from './providers/sms/sms.js';
import { ApplicationsService } from './modules/campaigns/applications.service.js';
import { MediaService } from './modules/media/media.service.js';
import { ShadowService } from './modules/shadow/shadow.service.js';
import { ServiceRequestsService } from './modules/serviceRequests/serviceRequests.service.js';
import { FeedbackService } from './modules/feedback/feedback.service.js';
import { AuthService } from './modules/auth/auth.service.js';
import { NurseriesService } from './modules/nurseries/nurseries.service.js';
import { SearchService } from './modules/search/search.service.js';
import { SpeciesService } from './modules/species/species.service.js';
import { OrderNotifications } from './modules/orders/notifications.js';
import { OrdersService } from './modules/orders/orders.service.js';
import { PaymentsService } from './modules/orders/payments.service.js';

export interface AppDeps {
  config: Config;
  pool: pg.Pool;
  logger: Logger;
  providers: Providers;
  queue: JobQueue;
}

export interface Services {
  db: Database;
  sms: SmsProvider;
  auth: AuthService;
  nurseries: NurseriesService;
  species: SpeciesService;
  search: SearchService;
  payments: PaymentsService;
  orders: OrdersService;
  applications: ApplicationsService;
  serviceRequests: ServiceRequestsService;
  feedback: FeedbackService;
  shadow: ShadowService;
  media: MediaService;
}

/** Wires every service once, for the HTTP app and the background workers alike. */
export const buildServices = ({ config, pool, logger, providers, queue }: AppDeps): Services => {
  const db = createDb(pool);
  const notifications = new OrderNotifications({ queue, config });
  const payments = new PaymentsService({ db, providers: providers.payments, queue, notifications, logger });
  const search = new SearchService({ db, geocoding: providers.geocoding, logger });
  const nurseries = new NurseriesService({ db, routing: providers.routing, search, logger });
  return {
    db,
    sms: providers.sms,
    auth: new AuthService({ db, config, providers, logger }),
    nurseries,
    species: new SpeciesService({ db, nurseries, search }),
    search,
    payments,
    applications: new ApplicationsService({ db, queue }),
    serviceRequests: new ServiceRequestsService({ db }),
    feedback: new FeedbackService({ db }),
    shadow: new ShadowService({ db, routing: providers.routing, queue, logger }),
    media: new MediaService({ db, dir: config.MEDIA_DIR, publicPath: config.MEDIA_PUBLIC_PATH }),
    orders: new OrdersService({ db, config, routing: providers.routing, providers: providers.payments, payments, notifications, logger }),
  };
};
