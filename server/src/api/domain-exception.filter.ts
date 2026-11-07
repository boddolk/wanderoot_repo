import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { DomainError } from '../domain/shared/errors';

const STATUS: Record<string, number> = {
  VALIDATION_ERROR: 422,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  CONFLICT: 409,
};

/** Перетворює доменні помилки на HTTP-відповіді; внутрішні помилки не розкриваються клієнту. */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();
    if (error instanceof DomainError) {
      res.status(STATUS[error.code] ?? 400).json({ error: error.code, message: error.message });
      return;
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      res.status(status).json({ error: 'HTTP_ERROR', message: error.message });
      return;
    }
    const status = (error as { status?: unknown })?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      // помилки розбору тіла запиту (некоректний JSON, завеликий розмір)
      res.status(status).json({ error: 'BAD_REQUEST', message: status === 413 ? 'Завеликий розмір запиту' : 'Некоректний запит' });
      return;
    }
    this.logger.error(error instanceof Error ? error.stack : String(error));
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Внутрішня помилка сервера' });
  }
}
