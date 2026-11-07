/** Доменні події, які публікують сервіси (патерн «Спостерігач»). */
export type DomainEvent =
  | { type: 'CommentAdded'; routeId: string; routeTitle: string; routeOwnerId: string; authorId: string; commentId: string }
  | { type: 'RouteRated'; routeId: string; routeTitle: string; routeOwnerId: string; userId: string; value: number }
  | { type: 'ContentHidden'; targetType: 'ROUTE' | 'COMMENT'; targetId: string; authorId: string; reason: string }
  | { type: 'ComplaintResolved'; complaintId: string; reporterId: string; decision: string }
  | { type: 'UserRoleChanged'; userId: string; role: string }
  | { type: 'PasswordChanged'; userId: string }
  | { type: 'PoiApproved'; routeId: string; poiId: string; poiName: string; ownerId: string };

export type DomainEventType = DomainEvent['type'];
export type EventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;
