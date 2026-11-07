import { Notification } from '../domain/notifications/notification';
import { NotFoundError } from '../domain/shared/errors';
import { Clock, EventBus, NotificationRepository } from './ports';

const DECISION_TEXT: Record<string, string> = {
  HIDE_CONTENT: 'контент приховано',
  BLOCK_USER: 'автора заблоковано',
  REJECT: 'порушень не виявлено',
};

/**
 * Спостерігач доменних подій: перетворює події на сповіщення користувачам.
 * Сервіси, що публікують події, нічого не знають про цей клас.
 */
export class NotificationService {
  constructor(private readonly notifications: NotificationRepository, private readonly clock: Clock) {}

  attach(bus: EventBus): void {
    bus.subscribe('CommentAdded', (e) => {
      if (e.authorId !== e.routeOwnerId)
        this.notify(e.routeOwnerId, 'COMMENT',
          `Новий коментар до маршруту «${e.routeTitle}»`, `/routes/${e.routeId}`);
    });
    bus.subscribe('RouteRated', (e) => this.notify(e.routeOwnerId, 'RATING',
      `Маршрут «${e.routeTitle}» отримав оцінку ${e.value}`, `/routes/${e.routeId}`));
    bus.subscribe('UserRoleChanged', (e) => this.notify(e.userId, 'ROLE',
      `Вашу роль змінено на ${e.role}`, null));
    bus.subscribe('PasswordChanged', (e) => this.notify(e.userId, 'SECURITY',
      'Пароль облікового запису змінено. Якщо це були не ви, зверніться до адміністратора', '/profile'));
    bus.subscribe('ContentHidden', (e) => this.notify(e.authorId, 'MODERATION',
      `${e.targetType === 'ROUTE' ? 'Ваш маршрут' : 'Ваш коментар'} приховано модератором: ${e.reason}`, e.targetType === 'ROUTE' ? `/routes/${e.targetId}` : null));
    bus.subscribe('ComplaintResolved', (e) => this.notify(e.reporterId, 'COMPLAINT', `Вашу скаргу розглянуто: ${DECISION_TEXT[e.decision] ?? e.decision}`, null));
    bus.subscribe('PoiApproved', (e) => this.notify(e.ownerId, 'POI', `Точку «${e.poiName}» затверджено для спільноти`, `/routes/${e.routeId}`));
  }

  list(userId: string, unreadOnly = false) {
    return this.notifications.listByUser(userId, unreadOnly).map((n) => n.toJSON());
  }

  markRead(userId: string, id: string) {
    const n = this.notifications.findById(id);
    if (!n || n.userId !== userId) throw new NotFoundError('Сповіщення не знайдено');
    n.markRead();
    this.notifications.save(n);
    return n.toJSON();
  }

  private notify(userId: string, type: string, message: string, link: string | null): void {
    this.notifications.save(Notification.create(userId, type, message, link, this.clock.now()));
  }
}
