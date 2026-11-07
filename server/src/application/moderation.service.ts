import { Complaint, DECISIONS, Decision } from '../domain/moderation/complaint';
import { NotFoundError, ValidationError } from '../domain/shared/errors';
import { Viewer } from '../domain/routes/route';
import { Permission, assertCan } from '../domain/users/role';
import { Clock, CommentRepository, ComplaintRepository, EventBus, RouteRepository, TransactionRunner, UserRepository } from './ports';
import { RouteService } from './route.service';

/** Фасад для скарг, модерації контенту та затвердження точок інтересу. */
export class ModerationService {
  constructor(
    private readonly complaints: ComplaintRepository,
    private readonly routes: RouteRepository,
    private readonly comments: CommentRepository,
    private readonly users: UserRepository,
    private readonly routeService: RouteService,
    private readonly events: EventBus,
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  fileComplaint(actor: Viewer, data: { targetType: string; targetId: string; reason: string; description?: string }) {
    const complaint = Complaint.file({ ...data, reporterId: actor.id }, this.clock.now());
    this.authorOf(complaint.targetType, complaint.targetId, actor); // перевіряє, що об'єкт існує і доступний
    this.complaints.save(complaint);
    return complaint.toJSON();
  }

  listComplaints(actor: Viewer, status: 'OPEN' | 'RESOLVED' | 'REJECTED' = 'OPEN') {
    assertCan(actor.role, Permission.MODERATE_CONTENT);
    return this.complaints.listByStatus(status).map((c) => c.toJSON());
  }

  resolve(actor: Viewer, complaintId: string, decision: string, note = '') {
    assertCan(actor.role, Permission.MODERATE_CONTENT);
    if (!DECISIONS.includes(decision as Decision)) throw new ValidationError('Невідоме рішення');
    if (decision === 'BLOCK_USER') assertCan(actor.role, Permission.MANAGE_USERS);
    const complaint = this.complaints.findById(complaintId);
    if (!complaint) throw new NotFoundError('Скаргу не знайдено');
    const now = this.clock.now();
    const reason = note.trim() || 'Порушення правил спільноти';
    const authorId = this.authorOf(complaint.targetType, complaint.targetId, actor);

    this.tx.run(() => {
      if (decision === 'HIDE_CONTENT') this.hideTarget(complaint.targetType, complaint.targetId, reason, now);
      if (decision === 'BLOCK_USER') {
        const user = this.users.findById(authorId);
        if (!user) throw new NotFoundError('Користувача не знайдено');
        user.block();
        this.users.save(user);
      }
      complaint.close(decision as Decision, actor.id, now);
      this.complaints.save(complaint);
    });

    if (decision === 'HIDE_CONTENT' && complaint.targetType !== 'USER') {
      this.events.publish({ type: 'ContentHidden', targetType: complaint.targetType, targetId: complaint.targetId, authorId, reason });
    }
    this.events.publish({ type: 'ComplaintResolved', complaintId: complaint.id, reporterId: complaint.reporterId, decision });
    return complaint.toJSON();
  }

  restoreRoute(actor: Viewer, routeId: string) {
    assertCan(actor.role, Permission.MODERATE_CONTENT);
    const route = this.routes.findById(routeId);
    if (!route) throw new NotFoundError('Маршрут не знайдено');
    route.restore(this.clock.now());
    this.routes.save(route);
    return this.routeService.toDto(route);
  }

  listPendingPois(actor: Viewer) {
    assertCan(actor.role, Permission.APPROVE_POI);
    return this.routes.listPendingPois().map((p) => ({ routeId: p.routeId, routeTitle: p.routeTitle, ownerId: p.ownerId, poi: p.poi.toJSON() }));
  }

  reviewPoi(actor: Viewer, routeId: string, poiId: string, approve: boolean) {
    assertCan(actor.role, Permission.APPROVE_POI);
    const route = this.routes.findById(routeId);
    if (!route) throw new NotFoundError('Маршрут не знайдено');
    const poi = route.findPoi(poiId);
    if (approve) poi.approve(); else poi.reject();
    this.routes.save(route);
    if (approve) this.events.publish({ type: 'PoiApproved', routeId, poiId, poiName: poi.name, ownerId: route.ownerId });
    return poi.toJSON();
  }

  private hideTarget(type: string, id: string, reason: string, now: Date): void {
    if (type === 'ROUTE') {
      const route = this.routes.findById(id);
      if (!route) throw new NotFoundError('Маршрут не знайдено');
      route.hide(reason, now);
      this.routes.save(route);
    } else if (type === 'COMMENT') {
      const comment = this.comments.findById(id);
      if (!comment) throw new NotFoundError('Коментар не знайдено');
      comment.hide();
      this.comments.save(comment);
    } else {
      throw new ValidationError('Для скарги на користувача доступні лише рішення BLOCK_USER або REJECT');
    }
  }

  /** Повертає автора контенту, на який подано скаргу. */
  private authorOf(type: string, id: string, actor: Viewer): string {
    if (type === 'ROUTE') return this.routeService.findVisible(actor, id).ownerId;
    if (type === 'COMMENT') {
      const comment = this.comments.findById(id);
      if (!comment) throw new NotFoundError('Коментар не знайдено');
      return comment.authorId;
    }
    const user = this.users.findById(id);
    if (!user) throw new NotFoundError('Користувача не знайдено');
    return user.id;
  }
}
