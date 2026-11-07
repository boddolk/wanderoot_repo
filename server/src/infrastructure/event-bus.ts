import { DomainEvent, DomainEventType, EventOf } from '../domain/shared/events';
import { EventBus } from '../application/ports';

type Handler = (event: DomainEvent) => void;

/**
 * Синхронна шина подій у пам'яті (патерн «Спостерігач»).
 * Помилка в одному підписнику не перериває роботу інших і не скасовує основну операцію.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<DomainEventType, Handler[]>();

  constructor(private readonly onError: (e: unknown, event: DomainEvent) => void = (e) => console.error('[event-bus]', e)) {}

  publish(event: DomainEvent): void {
    for (const handler of this.handlers.get(event.type) ?? []) {
      try {
        handler(event);
      } catch (e) {
        this.onError(e, event);
      }
    }
  }

  subscribe<T extends DomainEventType>(type: T, handler: (event: EventOf<T>) => void): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as Handler);
    this.handlers.set(type, list);
    return () => this.handlers.set(type, (this.handlers.get(type) ?? []).filter((h) => h !== handler));
  }
}
