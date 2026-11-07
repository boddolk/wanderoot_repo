/**
 * Реалізації портів-репозиторіїв на SQLite (шар доступу до даних).
 * Перетворюють рядки таблиць на доменні об'єкти і навпаки.
 */
import { Comment, Rating } from '../../domain/feedback/feedback';
import { Complaint, ComplaintStatus } from '../../domain/moderation/complaint';
import { Notification } from '../../domain/notifications/notification';
import { GeoPoint } from '../../domain/shared/geo-point';
import { PointOfInterest, PoiCategory, PoiSharing } from '../../domain/routes/point-of-interest';
import { Route, Visibility } from '../../domain/routes/route';
import { RouteStatus, StatusName } from '../../domain/routes/route-status';
import { TransportMode } from '../../domain/routes/travel-time';
import { Role } from '../../domain/users/role';
import { AccountStatus, User } from '../../domain/users/user';
import {
  CommentRepository, ComplaintRepository, NotificationRepository, Page, PendingPoi, RatingRepository,
  RouteQuery, RouteRepository, RouteSummary, UserActivity, UserRepository,
} from '../../application/ports';
import { SqliteDatabase } from './database';

type Row = Record<string, any>;
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const date = (s: string | null) => (s ? new Date(s) : null);

export class SqliteUserRepository implements UserRepository {
  constructor(private readonly s: SqliteDatabase) {}

  save(u: User): void {
    const p = u.toProps();
    this.s.db.prepare(`INSERT INTO users (id, login, email, display_name, password_hash, role, status, failed_logins, locked_until, created_at,
        bio, city, password_changed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name, password_hash=excluded.password_hash,
        role=excluded.role, status=excluded.status, failed_logins=excluded.failed_logins, locked_until=excluded.locked_until,
        bio=excluded.bio, city=excluded.city, password_changed_at=excluded.password_changed_at`)
      .run(p.id, p.login, p.email, p.displayName, p.passwordHash, p.role, p.status, p.failedLogins, iso(p.lockedUntil), iso(p.createdAt),
        p.bio, p.city, iso(p.passwordChangedAt));
  }

  existsByEmail(email: string, exceptUserId?: string): boolean {
    return !!this.s.db.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').get(email.toLowerCase(), exceptUserId ?? '');
  }

  activity(userId: string): UserActivity {
    const routes = this.s.db.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(status = 'PUBLISHED'), 0) AS published,
        COALESCE(SUM(status = 'DRAFT'), 0) AS drafts,
        COALESCE(SUM(status = 'HIDDEN'), 0) AS hidden,
        COALESCE(SUM(CASE WHEN status = 'PUBLISHED' THEN length_km ELSE 0 END), 0) AS km,
        COALESCE(SUM(rating_count), 0) AS ratings,
        COALESCE(SUM(rating_avg * rating_count), 0) AS rating_sum
      FROM routes WHERE owner_id = ?`).get(userId) as Row;
    const comments = (this.s.db.prepare(`SELECT COUNT(*) AS n FROM comments WHERE author_id = ? AND status = 'VISIBLE'`).get(userId) as Row).n;
    const given = (this.s.db.prepare('SELECT COUNT(*) AS n FROM ratings WHERE user_id = ?').get(userId) as Row).n;
    const ratingsReceived = Number(routes.ratings);
    return {
      routesTotal: Number(routes.total), routesPublished: Number(routes.published), routesDraft: Number(routes.drafts),
      routesHidden: Number(routes.hidden), publishedKm: Math.round(Number(routes.km) * 10) / 10,
      ratingsReceived, ratingAvgReceived: ratingsReceived ? Math.round((Number(routes.rating_sum) / ratingsReceived) * 10) / 10 : 0,
      commentsWritten: Number(comments), ratingsGiven: Number(given),
    };
  }

  findById(id: string): User | null {
    return this.map(this.s.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined);
  }

  findByLogin(login: string): User | null {
    return this.map(this.s.db.prepare('SELECT * FROM users WHERE login = ?').get(login) as Row | undefined);
  }

  existsByLoginOrEmail(login: string, email: string): boolean {
    return !!this.s.db.prepare('SELECT 1 FROM users WHERE login = ? OR email = ?').get(login, email.toLowerCase());
  }

  list(limit: number, offset: number): User[] {
    return (this.s.db.prepare('SELECT * FROM users ORDER BY created_at LIMIT ? OFFSET ?').all(limit, offset) as Row[]).map((r) => this.map(r)!);
  }

  private map(r: Row | undefined): User | null {
    if (!r) return null;
    return User.restore({
      id: r.id, login: r.login, email: r.email, displayName: r.display_name, passwordHash: r.password_hash,
      role: r.role as Role, status: r.status as AccountStatus, failedLogins: r.failed_logins,
      lockedUntil: date(r.locked_until), createdAt: new Date(r.created_at),
      bio: r.bio ?? '', city: r.city ?? '', passwordChangedAt: date(r.password_changed_at),
    });
  }
}

export class SqliteRouteRepository implements RouteRepository {
  constructor(private readonly s: SqliteDatabase) {}

  save(route: Route): void {
    const db = this.s.db;
    this.s.run(() => {
      const start = route.start;
      const searchText = [route.title, route.description, ...route.tags].join(' ').toLowerCase();
      db.prepare(`INSERT INTO routes (id, owner_id, title, description, mode, visibility, status, hidden_reason, waypoints, search_text,
          start_lat, start_lon, length_km, rating_avg, rating_count, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, mode=excluded.mode,
          visibility=excluded.visibility, status=excluded.status, hidden_reason=excluded.hidden_reason, waypoints=excluded.waypoints,
          search_text=excluded.search_text, start_lat=excluded.start_lat, start_lon=excluded.start_lon, length_km=excluded.length_km,
          rating_avg=excluded.rating_avg, rating_count=excluded.rating_count, updated_at=excluded.updated_at`)
        .run(route.id, route.ownerId, route.title, route.description, route.mode, route.visibility, route.status, route.hiddenReason,
          JSON.stringify(route.waypoints.map((p) => [p.lat, p.lon])), searchText, start?.lat ?? null, start?.lon ?? null,
          route.lengthKm(), route.ratingAvg, route.ratingCount, iso(route.createdAt), iso(route.updatedAt));
      db.prepare('DELETE FROM route_tags WHERE route_id = ?').run(route.id);
      const insTag = db.prepare('INSERT INTO route_tags (route_id, tag) VALUES (?, ?)');
      route.tags.forEach((t) => insTag.run(route.id, t));
      db.prepare('DELETE FROM pois WHERE route_id = ?').run(route.id);
      const insPoi = db.prepare('INSERT INTO pois (id, route_id, position, name, description, category, lat, lon, sharing) VALUES (?,?,?,?,?,?,?,?,?)');
      route.pois.forEach((p, i) => insPoi.run(p.id, route.id, i, p.name, p.description, p.category, p.location.lat, p.location.lon, p.sharing));
    });
  }

  findById(id: string): Route | null {
    const r = this.s.db.prepare('SELECT * FROM routes WHERE id = ?').get(id) as Row | undefined;
    if (!r) return null;
    const tags = (this.s.db.prepare('SELECT tag FROM route_tags WHERE route_id = ? ORDER BY tag').all(id) as Row[]).map((t) => t.tag);
    const pois = (this.s.db.prepare('SELECT * FROM pois WHERE route_id = ? ORDER BY position').all(id) as Row[]).map((p) =>
      PointOfInterest.restore({ id: p.id, name: p.name, description: p.description, category: p.category as PoiCategory,
        location: new GeoPoint(p.lat, p.lon), sharing: p.sharing as PoiSharing }));
    return Route.restore({
      id: r.id, ownerId: r.owner_id, title: r.title, description: r.description, mode: r.mode as TransportMode,
      visibility: r.visibility as Visibility, tags, pois,
      waypoints: (JSON.parse(r.waypoints) as [number, number][]).map(([lat, lon]) => new GeoPoint(lat, lon)),
      status: RouteStatus.of(r.status as StatusName), hiddenReason: r.hidden_reason,
      ratingAvg: r.rating_avg, ratingCount: r.rating_count, createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
    });
  }

  delete(id: string): void {
    this.s.db.prepare('DELETE FROM routes WHERE id = ?').run(id);
  }

  search(q: RouteQuery): Page<RouteSummary> {
    const where = ["r.status = 'PUBLISHED'", "r.visibility = 'PUBLIC'"];
    const args: (string | number)[] = [];
    if (q.text?.trim()) { where.push('r.search_text LIKE ?'); args.push(`%${q.text.trim().toLowerCase()}%`); }
    if (q.mode) { where.push('r.mode = ?'); args.push(q.mode); }
    if (q.tag?.trim()) { where.push('EXISTS (SELECT 1 FROM route_tags t WHERE t.route_id = r.id AND t.tag = ?)'); args.push(q.tag.trim().toLowerCase()); }
    if (q.minRating) { where.push('r.rating_avg >= ?'); args.push(q.minRating); }
    if (q.near) {
      // попередній відбір за обмежувальним прямокутником, точна відстань – нижче
      const dLat = q.near.radiusKm / 111.2;
      const dLon = q.near.radiusKm / (111.2 * Math.max(0.01, Math.cos((q.near.lat * Math.PI) / 180)));
      where.push('r.start_lat BETWEEN ? AND ?', 'r.start_lon BETWEEN ? AND ?');
      args.push(q.near.lat - dLat, q.near.lat + dLat, q.near.lon - dLon, q.near.lon + dLon);
    }
    const order = q.sort === 'rating' ? 'r.rating_avg DESC, r.rating_count DESC' : q.sort === 'length' ? 'r.length_km ASC' : 'r.created_at DESC';
    const page = q.page ?? 1;
    const size = q.pageSize ?? 20;
    const select = `SELECT r.id, r.title, r.mode, r.owner_id, r.length_km, r.rating_avg, r.rating_count, r.start_lat, r.start_lon, r.created_at,
        (SELECT group_concat(tag, ',') FROM route_tags t WHERE t.route_id = r.id) AS tags
      FROM routes r WHERE ${where.join(' AND ')} ORDER BY ${order}`;

    if (q.near) {
      const center = new GeoPoint(q.near.lat, q.near.lon);
      const all = (this.s.db.prepare(select).all(...args) as Row[]).filter((r) => center.distanceTo(new GeoPoint(r.start_lat, r.start_lon)) <= q.near!.radiusKm);
      return { items: all.slice((page - 1) * size, page * size).map(summary), total: all.length, page, pageSize: size };
    }
    const total = (this.s.db.prepare(`SELECT COUNT(*) AS n FROM routes r WHERE ${where.join(' AND ')}`).get(...args) as Row).n as number;
    const rows = this.s.db.prepare(`${select} LIMIT ? OFFSET ?`).all(...args, size, (page - 1) * size) as Row[];
    return { items: rows.map(summary), total, page, pageSize: size };
  }

  listByOwner(ownerId: string): RouteSummary[] {
    return (this.s.db.prepare(`SELECT r.*, (SELECT group_concat(tag, ',') FROM route_tags t WHERE t.route_id = r.id) AS tags
      FROM routes r WHERE r.owner_id = ? ORDER BY r.updated_at DESC`).all(ownerId) as Row[]).map(summary);
  }

  listPendingPois(): PendingPoi[] {
    return (this.s.db.prepare(`SELECT p.*, r.title AS route_title, r.owner_id FROM pois p JOIN routes r ON r.id = p.route_id
      WHERE p.sharing = 'PENDING' ORDER BY r.updated_at`).all() as Row[]).map((p) => ({
      routeId: p.route_id, routeTitle: p.route_title, ownerId: p.owner_id,
      poi: PointOfInterest.restore({ id: p.id, name: p.name, description: p.description, category: p.category,
        location: new GeoPoint(p.lat, p.lon), sharing: p.sharing }),
    }));
  }
}

function summary(r: Row): RouteSummary {
  return {
    id: r.id, title: r.title, mode: r.mode, ownerId: r.owner_id, lengthKm: r.length_km, ratingAvg: r.rating_avg,
    ratingCount: r.rating_count, tags: r.tags ? String(r.tags).split(',') : [],
    start: r.start_lat === null ? null : { lat: r.start_lat, lon: r.start_lon }, createdAt: new Date(r.created_at),
  };
}

export class SqliteRatingRepository implements RatingRepository {
  constructor(private readonly s: SqliteDatabase) {}

  upsert(r: Rating): void {
    this.s.db.prepare(`INSERT INTO ratings (route_id, user_id, value, created_at) VALUES (?,?,?,?)
      ON CONFLICT(route_id, user_id) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`)
      .run(r.routeId, r.userId, r.value, iso(r.createdAt));
  }

  summary(routeId: string): { avg: number; count: number } {
    const row = this.s.db.prepare('SELECT AVG(value) AS avg, COUNT(*) AS n FROM ratings WHERE route_id = ?').get(routeId) as Row;
    return { avg: row.avg ?? 0, count: row.n };
  }

  findValue(routeId: string, userId: string): number | null {
    const row = this.s.db.prepare('SELECT value FROM ratings WHERE route_id = ? AND user_id = ?').get(routeId, userId) as Row | undefined;
    return row ? row.value : null;
  }
}

export class SqliteCommentRepository implements CommentRepository {
  constructor(private readonly s: SqliteDatabase) {}

  save(c: Comment): void {
    this.s.db.prepare(`INSERT INTO comments (id, route_id, author_id, text, status, created_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET text = excluded.text, status = excluded.status`)
      .run(c.id, c.routeId, c.authorId, c.text, c.status, iso(c.createdAt));
  }

  findById(id: string): Comment | null {
    const r = this.s.db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as Row | undefined;
    return r ? this.map(r) : null;
  }

  listByRoute(routeId: string, includeHidden: boolean): Comment[] {
    const sql = `SELECT * FROM comments WHERE route_id = ? ${includeHidden ? '' : "AND status = 'VISIBLE'"} ORDER BY created_at`;
    return (this.s.db.prepare(sql).all(routeId) as Row[]).map((r) => this.map(r));
  }

  private map(r: Row): Comment {
    return Comment.restore({ id: r.id, routeId: r.route_id, authorId: r.author_id, text: r.text, status: r.status, createdAt: new Date(r.created_at) });
  }
}

export class SqliteComplaintRepository implements ComplaintRepository {
  constructor(private readonly s: SqliteDatabase) {}

  save(c: Complaint): void {
    const p = c.toJSON();
    this.s.db.prepare(`INSERT INTO complaints (id, reporter_id, target_type, target_id, reason, description, status, decision, resolved_by, created_at, resolved_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, decision = excluded.decision, resolved_by = excluded.resolved_by, resolved_at = excluded.resolved_at`)
      .run(p.id, p.reporterId, p.targetType, p.targetId, p.reason, p.description, p.status, p.decision, p.resolvedBy, iso(p.createdAt), iso(p.resolvedAt));
  }

  findById(id: string): Complaint | null {
    const r = this.s.db.prepare('SELECT * FROM complaints WHERE id = ?').get(id) as Row | undefined;
    return r ? this.map(r) : null;
  }

  listByStatus(status: ComplaintStatus): Complaint[] {
    return (this.s.db.prepare('SELECT * FROM complaints WHERE status = ? ORDER BY created_at').all(status) as Row[]).map((r) => this.map(r));
  }

  private map(r: Row): Complaint {
    return Complaint.restore({
      id: r.id, reporterId: r.reporter_id, targetType: r.target_type, targetId: r.target_id, reason: r.reason, description: r.description,
      status: r.status, decision: r.decision, resolvedBy: r.resolved_by, createdAt: new Date(r.created_at), resolvedAt: date(r.resolved_at),
    });
  }
}

export class SqliteNotificationRepository implements NotificationRepository {
  constructor(private readonly s: SqliteDatabase) {}

  save(n: Notification): void {
    const p = n.toJSON();
    this.s.db.prepare(`INSERT INTO notifications (id, user_id, type, message, link, is_read, created_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET is_read = excluded.is_read`)
      .run(p.id, p.userId, p.type, p.message, p.link, p.read ? 1 : 0, iso(p.createdAt));
  }

  findById(id: string): Notification | null {
    const r = this.s.db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Row | undefined;
    return r ? this.map(r) : null;
  }

  listByUser(userId: string, unreadOnly: boolean): Notification[] {
    const sql = `SELECT * FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''} ORDER BY created_at DESC LIMIT 100`;
    return (this.s.db.prepare(sql).all(userId) as Row[]).map((r) => this.map(r));
  }

  private map(r: Row): Notification {
    return Notification.restore({ id: r.id, userId: r.user_id, type: r.type, message: r.message, link: r.link, read: r.is_read === 1, createdAt: new Date(r.created_at) });
  }
}
