import { ForbiddenError, NotFoundError, ensure } from '../domain/shared/errors';
import { PointOfInterest } from '../domain/routes/point-of-interest';
import { Route, RouteDetails, Viewer } from '../domain/routes/route';
import { TransportMode, TravelTimeEstimator, isTransportMode } from '../domain/routes/travel-time';
import { Clock, Page, RouteQuery, RouteRepository, RouteSummary } from './ports';

export interface RouteDto {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  mode: TransportMode;
  visibility: string;
  tags: readonly string[];
  status: string;
  hiddenReason: string | null;
  waypoints: { lat: number; lon: number }[];
  pois: ReturnType<PointOfInterest['toJSON']>[];
  lengthKm: number;
  durationMin: number;
  ratingAvg: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RouteSummaryDto extends RouteSummary {
  durationMin: number;
}

/** Фасад для операцій з маршрутами: створення, редагування, публікація, пошук. */
export class RouteService {
  constructor(
    private readonly routes: RouteRepository,
    private readonly estimator: TravelTimeEstimator,
    private readonly clock: Clock,
  ) {}

  create(owner: Viewer, details: RouteDetails & { waypoints?: { lat: number; lon: number }[] }): RouteDto {
    const now = this.clock.now();
    const route = Route.create(owner.id, details, now);
    if (details.waypoints) route.setWaypoints(details.waypoints, now);
    this.routes.save(route);
    return this.toDto(route);
  }

  /** Створення маршруту з уже розібраних даних (імпорт файлу). */
  createFromData(owner: Viewer, data: { title: string; description?: string; mode?: string; waypoints: { lat: number; lon: number }[];
    pois: { name: string; description?: string; category?: string; lat: number; lon: number }[] }): RouteDto {
    const now = this.clock.now();
    const route = Route.create(owner.id, { title: data.title, description: data.description, mode: data.mode }, now);
    route.setWaypoints(data.waypoints, now);
    data.pois.forEach((p) => route.addPoi(PointOfInterest.create(p), now));
    this.routes.save(route);
    return this.toDto(route);
  }

  update(actor: Viewer, id: string, changes: RouteDetails & { waypoints?: { lat: number; lon: number }[] }): RouteDto {
    const route = this.mustOwn(actor, id);
    const now = this.clock.now();
    route.update({ ...this.detailsOf(route), ...changes }, now);
    if (changes.waypoints) route.setWaypoints(changes.waypoints, now);
    this.routes.save(route);
    return this.toDto(route);
  }

  addPoi(actor: Viewer, routeId: string, data: { name: string; description?: string; category?: string; lat: number; lon: number }): RouteDto {
    const route = this.mustOwn(actor, routeId);
    route.addPoi(PointOfInterest.create(data), this.clock.now());
    this.routes.save(route);
    return this.toDto(route);
  }

  removePoi(actor: Viewer, routeId: string, poiId: string): RouteDto {
    const route = this.mustOwn(actor, routeId);
    route.removePoi(poiId, this.clock.now());
    this.routes.save(route);
    return this.toDto(route);
  }

  suggestPoi(actor: Viewer, routeId: string, poiId: string): RouteDto {
    const route = this.mustOwn(actor, routeId);
    route.findPoi(poiId).suggestToCommunity();
    this.routes.save(route);
    return this.toDto(route);
  }

  publish(actor: Viewer, id: string): RouteDto {
    const route = this.mustOwn(actor, id);
    route.publish(this.clock.now());
    this.routes.save(route);
    return this.toDto(route);
  }

  unpublish(actor: Viewer, id: string): RouteDto {
    const route = this.mustOwn(actor, id);
    route.unpublish(this.clock.now());
    this.routes.save(route);
    return this.toDto(route);
  }

  delete(actor: Viewer, id: string): void {
    this.mustOwn(actor, id);
    this.routes.delete(id);
  }

  get(viewer: Viewer | null, id: string): RouteDto {
    return this.toDto(this.findVisible(viewer, id));
  }

  /** Повертає маршрут, якщо він доступний користувачу; інакше – NotFoundError (не розкриваємо існування). */
  findVisible(viewer: Viewer | null, id: string): Route {
    const route = this.routes.findById(id);
    if (!route || !route.isVisibleTo(viewer)) throw new NotFoundError('Маршрут не знайдено');
    return route;
  }

  search(query: RouteQuery): Page<RouteSummaryDto> {
    if (query.mode !== undefined) ensure(isTransportMode(query.mode), 'Невідомий вид пересування');
    const page = this.routes.search({
      ...query,
      page: Math.max(1, Math.floor(query.page ?? 1)),
      pageSize: Math.min(50, Math.max(1, Math.floor(query.pageSize ?? 20))),
    });
    return { ...page, items: page.items.map((s) => this.summaryDto(s)) };
  }

  listMine(owner: Viewer): RouteSummaryDto[] {
    return this.routes.listByOwner(owner.id).map((s) => this.summaryDto(s));
  }

  toDto(route: Route): RouteDto {
    const lengthKm = route.lengthKm();
    return {
      id: route.id, ownerId: route.ownerId, title: route.title, description: route.description, mode: route.mode,
      visibility: route.visibility, tags: route.tags, status: route.status, hiddenReason: route.hiddenReason,
      waypoints: route.waypoints.map((p) => p.toJSON()), pois: route.pois.map((p) => p.toJSON()),
      lengthKm, durationMin: this.estimator.estimateMinutes(route.mode, lengthKm),
      ratingAvg: route.ratingAvg, ratingCount: route.ratingCount, createdAt: route.createdAt, updatedAt: route.updatedAt,
    };
  }

  private summaryDto(s: RouteSummary): RouteSummaryDto {
    return { ...s, durationMin: this.estimator.estimateMinutes(s.mode, s.lengthKm) };
  }

  private detailsOf(route: Route): RouteDetails {
    return { title: route.title, description: route.description, mode: route.mode, visibility: route.visibility, tags: [...route.tags] };
  }

  private mustOwn(actor: Viewer, id: string): Route {
    const route = this.routes.findById(id);
    if (!route) throw new NotFoundError('Маршрут не знайдено');
    if (route.ownerId !== actor.id) throw new ForbiddenError('Змінювати маршрут може лише його автор');
    return route;
  }
}
