import { Body, Controller, Get, HttpCode, Inject, Post, Put } from '@nestjs/common';
import { User } from '../../domain/users/user';
import type { Core } from '../../infrastructure/container';
import { CurrentUser } from '../auth.guard';
import { CORE } from '../core.module';

/** Власний профіль користувача: перегляд з активністю, редагування даних, зміна пароля. */
@Controller('profile')
export class ProfileController {
  constructor(@Inject(CORE) private readonly core: Core) {}

  @Get()
  view(@CurrentUser() user: User) {
    return this.core.services.profile.view(user);
  }

  @Put()
  update(@CurrentUser() user: User, @Body() body: { displayName?: string; email?: string; bio?: string; city?: string; currentPassword?: string }) {
    return this.core.services.profile.update(user, body ?? {});
  }

  @Post('password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: User, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.core.services.profile.changePassword(user, body?.currentPassword, body?.newPassword);
  }
}
