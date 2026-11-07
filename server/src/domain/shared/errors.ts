/**
 * Доменні помилки. Шар представлення перетворює їх на HTTP-коди
 * (див. api/domain-exception.filter.ts), тому бізнес-логіка не залежить від HTTP.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Некоректні вхідні дані (HTTP 422). */
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
}

/** Сутність не знайдено або вона недоступна користувачу (HTTP 404). */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
}

/** Недостатньо повноважень (HTTP 403). */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
}

/** Помилка автентифікації (HTTP 401). */
export class AuthError extends DomainError {
  readonly code = 'UNAUTHORIZED';
}

/** Конфлікт стану: дублікат, недопустимий перехід тощо (HTTP 409). */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
}

/** Допоміжна перевірка інваріанта. */
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}
