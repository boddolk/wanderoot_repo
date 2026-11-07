import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { User } from '../../domain/users/user';
import type { Core } from '../../infrastructure/container';
import { CurrentUser, Public } from '../auth.guard';
import { CORE } from '../core.module';

@Controller('complaints')
export class ComplaintsController {
  constructor(@Inject(CORE) private readonly core: Core) {}

  @Post()
  file(@CurrentUser() user: User, @Body() body: { targetType: string; targetId: string; reason: string; description?: string }) {
    return this.core.services.moderation.fileComplaint(user, body ?? ({} as any));
  }
}

@Controller('moderation')
export class ModerationController {
  constructor(@Inject(CORE) private readonly core: Core) {}

  @Get('complaints')
  list(@CurrentUser() user: User, @Query('status') status?: 'OPEN' | 'RESOLVED' | 'REJECTED') {
    return this.core.services.moderation.listComplaints(user, status ?? 'OPEN');
  }

  @Post('complaints/:id/resolve')
  @HttpCode(200)
  resolve(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { decision: string; note?: string }) {
    return this.core.services.moderation.resolve(user, id, body?.decision, body?.note);
  }

  @Post('routes/:id/restore')
  @HttpCode(200)
  restore(@CurrentUser() user: User, @Param('id') id: string) {
    return this.core.services.moderation.restoreRoute(user, id);
  }

  @Get('pois')
  pendingPois(@CurrentUser() user: User) {
    return this.core.services.moderation.listPendingPois(user);
  }

  @Post('pois/:routeId/:poiId/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: User, @Param('routeId') routeId: string, @Param('poiId') poiId: string) {
    return this.core.services.moderation.reviewPoi(user, routeId, poiId, true);
  }

  @Post('pois/:routeId/:poiId/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: User, @Param('routeId') routeId: string, @Param('poiId') poiId: string) {
    return this.core.services.moderation.reviewPoi(user, routeId, poiId, false);
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(CORE) private readonly core: Core) {}

  @Get()
  list(@CurrentUser() user: User, @Query('unread') unread?: string) {
    return this.core.services.notifications.list(user.id, unread === 'true');
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() user: User, @Param('id') id: string) {
    return this.core.services.notifications.markRead(user.id, id);
  }
}

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return { status: 'ok' };
  }
}
