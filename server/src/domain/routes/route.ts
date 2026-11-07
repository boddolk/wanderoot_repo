import { ensure, NotFoundError } from '../shared/errors';
import { GeoPoint, polylineLengthKm } from '../shared/geo-point';
import { newId } from '../shared/ids';
import { Role } from '../users/role';
import { PointOfInterest } from './point-of-interest';
import { RouteStatus, StatefulRoute, StatusName } from './route-status';
import { TransportMode, isTransportMode } from './travel-time';

export type Visibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
const VISIBILITIES: Visibility[] = ['PUBLIC', 'UNLISTED', 'PRIVATE'];

export const MAX_WAYPOINTS = 5000;
export const MAX_TAGS = 10;

/** Хто переглядає маршрут: анонімний гість або користувач з роллю. */
export interface Viewer {
  id: string;
  role: Role;
}

export interface RouteDetails {
  title: string;
  description?: string;
  mode?: string;
  visibility?: string;
  tags?: string[];
}

export interface RouteProps {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  mode: TransportMode;
  visibility: Visibility;
  tags: string[];
  waypoints: GeoPoint[];
  pois: PointOfInterest[];
  status: RouteStatus;
  hiddenReason: string | null;
  ratingAvg: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Маршрут – центральна сутність предметної області. Сам перевіряє правила своєї коректності. */
export class Route implements StatefulRoute {
  private constructor(private props: RouteProps) {}

  static create(ownerId: string, details: RouteDetails, now: Date): Route {
    const route = new Route({
      id: newId(), ownerId, title: '', description: '', mode: TransportMode.WALK, visibility: 'PUBLIC', tags: [],
      waypoints: [], pois: [], status: RouteStatus.of('DRAFT'), hiddenReason: null,
      ratingAvg: 0, ratingCount: 0, createdAt: now, updatedAt: now,
    });
    route.update(details, now);
    return route;
  }

  static restore(props: RouteProps): Route {
    return new Route({ ...props, waypoints: [...props.waypoints], pois: [...props.pois], tags: [...props.tags] });
  }

  // ---- читання ----
  get id() { return this.props.id; }
  get ownerId() { return this.props.ownerId; }
  get title() { return this.props.title; }
  get description() { return this.props.description; }
  get mode() { return this.props.mode; }
  get visibility() { return this.props.visibility; }
  get tags(): readonly string[] { return this.props.tags; }
  get waypoints(): readonly GeoPoint[] { return this.props.waypoints; }
  get waypointCount() { return this.props.waypoints.length; }
  get pois(): readonly PointOfInterest[] { return this.props.pois; }
  get status(): StatusName { return this.props.status.name; }
  get hiddenReason() { return this.props.hiddenReason; }
  get ratingAvg() { return this.props.ratingAvg; }
  get ratingCount() { return this.props.ratingCount; }
  get createdAt() { return this.props.createdAt; }
  get updatedAt() { return this.props.updatedAt; }
  get start(): GeoPoint | null { return this.props.waypoints[0] ?? null; }

  lengthKm(): number {
    return Math.round(polylineLengthKm(this.props.waypoints) * 100) / 100;
  }

  /** Чи потрапляє маршрут у публічний пошук. */
  isListed(): boolean {
    return this.props.status.isListed && this.props.visibility === 'PUBLIC';
  }

  isVisibleTo(viewer: Viewer | null): boolean {
    if (viewer && (viewer.id === this.props.ownerId || viewer.role !== Role.USER)) return true;
    return this.props.status.isListed && this.props.visibility !== 'PRIVATE';
  }

  // ---- зміна даних ----
  update(details: RouteDetails, now: Date): void {
    const title = (details.title ?? '').trim();
    ensure(title.length >= 3 && title.length <= 120, 'Назва маршруту має містити від 3 до 120 символів');
    const description = (details.description ?? '').trim();
    ensure(description.length <= 5000, 'Опис маршруту не може перевищувати 5000 символів');
    const mode = details.mode ?? this.props.mode;
    ensure(isTransportMode(mode), 'Невідомий вид пересування');
    const visibility = (details.visibility ?? this.props.visibility) as Visibility;
    ensure(VISIBILITIES.includes(visibility), 'Невідомий рівень видимості');
    const tags = Route.normalizeTags(details.tags ?? this.props.tags);
    Object.assign(this.props, { title, description, mode, visibility, tags, updatedAt: now });
  }

  setWaypoints(points: { lat: number; lon: number }[], now: Date): void {
    ensure(Array.isArray(points), 'Точки маршруту мають бути масивом');
    ensure(points.length <= MAX_WAYPOINTS, `Маршрут може містити не більше ${MAX_WAYPOINTS} точок`);
    const waypoints = points.map((p) => GeoPoint.from(p));
    if (this.props.status.name !== 'DRAFT') ensure(waypoints.length >= 2, 'Опублікований маршрут повинен містити щонайменше дві точки');
    this.props.waypoints = waypoints;
    this.props.updatedAt = now;
  }

  addPoi(poi: PointOfInterest, now: Date): void {
    ensure(this.props.pois.length < 200, 'Маршрут може містити не більше 200 точок інтересу');
    this.props.pois.push(poi);
    this.props.updatedAt = now;
  }

  removePoi(poiId: string, now: Date): void {
    const before = this.props.pois.length;
    this.props.pois = this.props.pois.filter((p) => p.id !== poiId);
    if (this.props.pois.length === before) throw new NotFoundError('Точку інтересу не знайдено');
    this.props.updatedAt = now;
  }

  findPoi(poiId: string): PointOfInterest {
    const poi = this.props.pois.find((p) => p.id === poiId);
    if (!poi) throw new NotFoundError('Точку інтересу не знайдено');
    return poi;
  }

  applyRating(avg: number, count: number): void {
    this.props.ratingAvg = Math.round(avg * 100) / 100;
    this.props.ratingCount = count;
  }

  // ---- життєвий цикл (делегування об'єкту стану) ----
  publish(now: Date): void { this.props.status.publish(this); this.props.updatedAt = now; }
  unpublish(now: Date): void { this.props.status.unpublish(this); this.props.updatedAt = now; }
  hide(reason: string, now: Date): void {
    this.props.status.hide(this);
    this.props.hiddenReason = (reason ?? '').trim() || 'Порушення правил спільноти';
    this.props.updatedAt = now;
  }
  restore(now: Date): void {
    this.props.status.restore(this);
    this.props.hiddenReason = null;
    this.props.updatedAt = now;
  }

  /** Викликається лише об'єктами стану. */
  changeStatus(next: RouteStatus): void {
    this.props.status = next;
  }

  private static normalizeTags(tags: unknown): string[] {
    ensure(Array.isArray(tags), 'Теги мають бути масивом');
    const clean = [...new Set((tags as unknown[]).map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
    ensure(clean.length <= MAX_TAGS, `Маршрут може мати не більше ${MAX_TAGS} тегів`);
    ensure(clean.every((t) => t.length <= 30), 'Тег не може бути довшим за 30 символів');
    return clean;
  }
}
