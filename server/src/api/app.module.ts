import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth.guard';
import { AdminController, AuthController } from './controllers/auth.controller';
import { ComplaintsController, HealthController, ModerationController, NotificationsController } from './controllers/moderation.controller';
import { ProfileController } from './controllers/profile.controller';
import { RoutesController } from './controllers/routes.controller';
import { CoreModule } from './core.module';
import { DomainExceptionFilter } from './domain-exception.filter';

/** Кореневий модуль застосунку: контролери шару представлення та глобальні guard і фільтр. */
@Module({
  imports: [CoreModule],
  controllers: [AuthController, ProfileController, AdminController, RoutesController, ComplaintsController, ModerationController, NotificationsController, HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
