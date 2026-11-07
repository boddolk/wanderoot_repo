import { ConflictError, ValidationError } from '../shared/errors';

export type StatusName = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';

/** Мінімальний інтерфейс маршруту, потрібний станам (уникаємо циклічної залежності). */
export interface StatefulRoute {
  readonly title: string;
  readonly waypointCount: number;
  changeStatus(next: RouteStatus): void;
}

/**
 * Патерн «Стан»: кожен стан маршруту сам визначає, які переходи з нього допустимі.
 * Недопустимий перехід спричиняє ConflictError.
 */
export abstract class RouteStatus {
  abstract readonly name: StatusName;
  /** Чи потрапляє маршрут у публічний пошук. */
  abstract readonly isListed: boolean;

  publish(_route: StatefulRoute): void { this.deny('опублікувати'); }
  unpublish(_route: StatefulRoute): void { this.deny('зняти з публікації'); }
  hide(_route: StatefulRoute): void { this.deny('приховати'); }
  restore(_route: StatefulRoute): void { this.deny('відновити'); }

  protected deny(action: string): never {
    throw new ConflictError(`Неможливо ${action} маршрут у стані ${this.name}`);
  }

  static of(name: StatusName): RouteStatus {
    switch (name) {
      case 'DRAFT': return DRAFT;
      case 'PUBLISHED': return PUBLISHED;
      case 'HIDDEN': return HIDDEN;
      default: throw new ValidationError(`Невідомий стан маршруту: ${name}`);
    }
  }
}

export class DraftStatus extends RouteStatus {
  readonly name = 'DRAFT' as const;
  readonly isListed = false;

  publish(route: StatefulRoute): void {
    if (!route.title.trim())
      throw new ValidationError('Для публікації маршрут повинен мати назву');
    if (route.waypointCount < 2)
      throw new ValidationError('Для публікації маршрут повинен ' +
        'містити щонайменше дві точки');
    route.changeStatus(PUBLISHED);
  }
}

export class PublishedStatus extends RouteStatus {
  readonly name = 'PUBLISHED' as const;
  readonly isListed = true;

  unpublish(route: StatefulRoute): void { route.changeStatus(DRAFT); }
  hide(route: StatefulRoute): void { route.changeStatus(HIDDEN); }
}

export class HiddenStatus extends RouteStatus {
  readonly name = 'HIDDEN' as const;
  readonly isListed = false;

  restore(route: StatefulRoute): void { route.changeStatus(PUBLISHED); }
}

// Стани не мають власних даних, тому використовуються як спільні екземпляри.
const DRAFT = new DraftStatus();
const PUBLISHED = new PublishedStatus();
const HIDDEN = new HiddenStatus();
