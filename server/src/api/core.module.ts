import { Global, Module } from '@nestjs/common';
import { createCore } from '../infrastructure/container';

/** Токен впровадження залежностей для ядра системи (сервісів бізнес-логіки). */
export const CORE = Symbol('WANDEROOT_CORE');

/**
 * Глобальний модуль, що надає ядро системи контролерам.
 * Шлях до БД і секрет токенів беруться зі змінних середовища.
 */
@Global()
@Module({
  providers: [{
    provide: CORE,
    useFactory: () => {
      const core = createCore({
        dbPath: process.env.DB_PATH ?? 'wanderoot.db',
        jwtSecret: process.env.JWT_SECRET ?? 'development-secret-change-me',
      });
      if (process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD) {
        core.services.auth.ensureAdmin(process.env.ADMIN_LOGIN, process.env.ADMIN_EMAIL ?? `${process.env.ADMIN_LOGIN}@wanderoot.local`, process.env.ADMIN_PASSWORD);
      }
      return core;
    },
  }],
  exports: [CORE],
})
export class CoreModule {}
