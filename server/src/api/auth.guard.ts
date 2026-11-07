import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthError } from '../domain/shared/errors';
import { User } from '../domain/users/user';
import type { Core } from '../infrastructure/container';
import { CORE } from './core.module';

const IS_PUBLIC = 'isPublic';

/** Позначає операцію, доступну без входу (гість). Токен, якщо він є, однаково перевіряється. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Поточний користувач (або null для гостя). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User | null =>
  ctx.switchToHttp().getRequest().user ?? null);

/**
 * Глобальна перевірка доступу: читає токен із заголовка Authorization: Bearer
 * і завантажує актуального користувача (роль і статус – з БД).
 * Перевірку конкретних дозволів (ролей) виконують сервіси бізнес-логіки.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(CORE) private readonly core: Core) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers?.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      if (isPublic) return true;
      throw new AuthError('Потрібно увійти в систему');
    }
    req.user = this.core.services.auth.authenticate(token);
    return true;
  }
}
