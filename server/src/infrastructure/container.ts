/**
 * Корінь композиції: створює всі об'єкти системи та з'єднує їх через інтерфейси.
 * Використовується модулем NestJS, скриптом наповнення БД і тестами.
 */
import { AuthService } from '../application/auth.service';
import { CodecRegistry } from '../application/exchange/codecs';
import { ExchangeService } from '../application/exchange.service';
import { FeedbackService } from '../application/feedback.service';
import { ModerationService } from '../application/moderation.service';
import { NotificationService } from '../application/notification.service';
import { Clock } from '../application/ports';
import { ProfileService } from '../application/profile.service';
import { RouteService } from '../application/route.service';
import { TextValidator } from '../domain/feedback/feedback';
import { TravelTimeEstimator } from '../domain/routes/travel-time';
import { InMemoryEventBus } from './event-bus';
import { HmacTokenService, ScryptPasswordHasher } from './security';
import { SqliteDatabase } from './sqlite/database';
import {
  SqliteCommentRepository, SqliteComplaintRepository, SqliteNotificationRepository, SqliteRatingRepository,
  SqliteRouteRepository, SqliteUserRepository,
} from './sqlite/repositories';

export interface CoreOptions {
  dbPath?: string;
  jwtSecret?: string;
  clock?: Clock;
  /** Менша вартість scrypt пришвидшує тести; у робочому режимі – значення за замовчуванням. */
  scryptCost?: number;
}

export function createCore(options: CoreOptions = {}) {
  const clock = options.clock ?? { now: () => new Date() };
  const database = new SqliteDatabase(options.dbPath ?? ':memory:');
  const repos = {
    users: new SqliteUserRepository(database),
    routes: new SqliteRouteRepository(database),
    ratings: new SqliteRatingRepository(database),
    comments: new SqliteCommentRepository(database),
    complaints: new SqliteComplaintRepository(database),
    notifications: new SqliteNotificationRepository(database),
  };
  const events = new InMemoryEventBus();
  const tokens = new HmacTokenService(options.jwtSecret ?? 'development-secret-change-me', clock);
  const hasher = new ScryptPasswordHasher(options.scryptCost);

  const auth = new AuthService(repos.users, hasher, tokens, clock, events);
  const profile = new ProfileService(repos.users, hasher, tokens, clock, events);
  const routes = new RouteService(repos.routes, TravelTimeEstimator.default(), clock);
  const exchange = new ExchangeService(routes, CodecRegistry.default());
  const feedback = new FeedbackService(routes, repos.routes, repos.ratings, repos.comments, repos.users, TextValidator.default(), events, database, clock);
  const moderation = new ModerationService(repos.complaints, repos.routes, repos.comments, repos.users, routes, events, database, clock);
  const notifications = new NotificationService(repos.notifications, clock);
  notifications.attach(events);

  return { database, repos, events, clock, services: { auth, profile, routes, exchange, feedback, moderation, notifications } };
}

export type Core = ReturnType<typeof createCore>;
export type Services = Core['services'];
