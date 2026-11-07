/**
 * Інтерфейси (порти), через які бізнес-логіка звертається до зовнішнього світу.
 * Реалізації знаходяться в шарі infrastructure (патерн «Репозиторій»).
 */
import { DomainEvent, DomainEventType, EventOf } from '../domain/shared/events';
import { Comment, Rating } from '../domain/feedback/feedback';
import { Complaint, ComplaintStatus } from '../domain/moderation/complaint';
import { Notification } from '../domain/notifications/notification';
import { PointOfInterest } from '../domain/routes/point-of-interest';
import { Route } from '../domain/routes/route';
import { TransportMode } from '../domain/routes/travel-time';
import { User } from '../domain/users/user';

export interface UserRepository {
  save(user: User): void;
  findById(id: string): User | null;
  findByLogin(login: string): User | null;
  existsByLoginOrEmail(login: string, email: string): boolean;
  /** Чи зайнята адреса іншим користувачем (exceptUserId – власник, якого не враховуємо). */
  existsByEmail(email: string, exceptUserId?: string): boolean;
  list(limit: number, offset: number): User[];
  /** Зведена активність користувача для сторінки профілю. */
  activity(userId: string): UserActivity;
}

export interface UserActivity {
  routesTotal: number;
  routesPublished: number;
  routesDraft: number;
  routesHidden: number;
  /** Сумарна довжина опублікованих маршрутів, км. */
  publishedKm: number;
  /** Скільки оцінок отримали маршрути користувача та їх середнє значення. */
  ratingsReceived: number;
  ratingAvgReceived: number;
  commentsWritten: number;
  ratingsGiven: number;
}

export interface RouteQuery {
  text?: string;
  mode?: TransportMode;
  tag?: string;
  minRating?: number;
  near?: { lat: number; lon: number; radiusKm: number };
  sort?: 'newest' | 'rating' | 'length';
  page?: number;
  pageSize?: number;
}

export interface RouteSummary {
  id: string;
  title: string;
  mode: TransportMode;
  ownerId: string;
  lengthKm: number;
  ratingAvg: number;
  ratingCount: number;
  tags: string[];
  start: { lat: number; lon: number } | null;
  createdAt: Date;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PendingPoi {
  routeId: string;
  routeTitle: string;
  ownerId: string;
  poi: PointOfInterest;
}

export interface RouteRepository {
  save(route: Route): void;
  findById(id: string): Route | null;
  delete(id: string): void;
  /** Пошук серед опублікованих публічних маршрутів. */
  search(query: RouteQuery): Page<RouteSummary>;
  listByOwner(ownerId: string): RouteSummary[];
  listPendingPois(): PendingPoi[];
}

export interface RatingRepository {
  upsert(rating: Rating): void;
  summary(routeId: string): { avg: number; count: number };
  findValue(routeId: string, userId: string): number | null;
}

export interface CommentRepository {
  save(comment: Comment): void;
  findById(id: string): Comment | null;
  listByRoute(routeId: string, includeHidden: boolean): Comment[];
}

export interface ComplaintRepository {
  save(complaint: Complaint): void;
  findById(id: string): Complaint | null;
  listByStatus(status: ComplaintStatus): Complaint[];
}

export interface NotificationRepository {
  save(notification: Notification): void;
  findById(id: string): Notification | null;
  listByUser(userId: string, unreadOnly: boolean): Notification[];
}

export interface PasswordHasher {
  hash(password: string): string;
  verify(password: string, hash: string): boolean;
}

export interface TokenPayload {
  sub: string;
  role: string;
  exp: number;
  /** Час видачі (секунди Unix). */
  iat?: number;
  /** Версія облікових даних користувача; після зміни пароля старі токени не збігаються з нею. */
  ver?: number;
}

export interface TokenService {
  sign(userId: string, role: string, version?: number): string;
  verify(token: string): TokenPayload;
}

/** Шина доменних подій (патерн «Спостерігач»). */
export interface EventBus {
  publish(event: DomainEvent): void;
  subscribe<T extends DomainEventType>(type: T, handler: (event: EventOf<T>) => void): () => void;
}

export interface Clock {
  now(): Date;
}

/** Виконання кількох операцій як однієї транзакції. */
export interface TransactionRunner {
  run<T>(work: () => T): T;
}
