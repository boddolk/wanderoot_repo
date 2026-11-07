import { Comment, Rating, TextValidator } from '../domain/feedback/feedback';
import { ConflictError, ForbiddenError } from '../domain/shared/errors';
import { Viewer } from '../domain/routes/route';
import { Role } from '../domain/users/role';
import { Clock, CommentRepository, EventBus, RatingRepository, RouteRepository, TransactionRunner, UserRepository } from './ports';
import { RouteService } from './route.service';

export interface CommentView {
  id: string;
  routeId: string;
  authorId: string;
  authorName: string;
  text: string;
  status: string;
  createdAt: Date;
}

/** Фасад для оцінок і коментарів. Після змін публікує доменні події для сповіщень. */
export class FeedbackService {
  constructor(
    private readonly routeService: RouteService,
    private readonly routes: RouteRepository,
    private readonly ratings: RatingRepository,
    private readonly comments: CommentRepository,
    private readonly users: UserRepository,
    private readonly validator: TextValidator,
    private readonly events: EventBus,
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  rate(actor: Viewer, routeId: string, value: number): { ratingAvg: number; ratingCount: number; myRating: number } {
    const route = this.routeService.findVisible(actor, routeId);
    if (route.status !== 'PUBLISHED') throw new ConflictError('Оцінювати можна лише опубліковані маршрути');
    if (route.ownerId === actor.id) throw new ForbiddenError('Не можна оцінювати власний маршрут');
    const rating = new Rating(routeId, actor.id, Number(value), this.clock.now());
    const summary = this.tx.run(() => {
      this.ratings.upsert(rating);
      const s = this.ratings.summary(routeId);
      route.applyRating(s.avg, s.count);
      this.routes.save(route);
      return s;
    });
    this.events.publish({ type: 'RouteRated', routeId, routeTitle: route.title, routeOwnerId: route.ownerId, userId: actor.id, value: rating.value });
    return { ratingAvg: route.ratingAvg, ratingCount: summary.count, myRating: rating.value };
  }

  myRating(actor: Viewer, routeId: string): number | null {
    return this.ratings.findValue(routeId, actor.id);
  }

  addComment(actor: Viewer, routeId: string, text: string): CommentView {
    const route = this.routeService.findVisible(actor, routeId);
    if (route.status !== 'PUBLISHED') throw new ConflictError('Коментувати можна лише опубліковані маршрути');
    this.validator.check(text);
    const comment = Comment.create(routeId, actor.id, text, this.clock.now());
    this.comments.save(comment);
    this.events.publish({ type: 'CommentAdded', routeId, routeTitle: route.title, routeOwnerId: route.ownerId, authorId: actor.id, commentId: comment.id });
    return this.view(comment);
  }

  listComments(viewer: Viewer | null, routeId: string): CommentView[] {
    this.routeService.findVisible(viewer, routeId);
    const includeHidden = !!viewer && viewer.role !== Role.USER;
    return this.comments.listByRoute(routeId, includeHidden).map((c) => this.view(c));
  }

  private view(c: Comment): CommentView {
    const author = this.users.findById(c.authorId);
    return { id: c.id, routeId: c.routeId, authorId: c.authorId, authorName: author?.displayName ?? 'невідомий', text: c.text, status: c.status, createdAt: c.createdAt };
  }
}
