import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { User } from '../../domain/users/user';
import type { Core } from '../../infrastructure/container';
import { CurrentUser, Public } from '../auth.guard';
import { CORE } from '../core.module';

@Controller('auth')
export class AuthController {
  constructor(@Inject(CORE) private readonly core: Core) {}

  @Public()
  @Post('register')
  register(@Body() body: { login: string; email: string; password: string; displayName?: string }) {
    return this.core.services.auth.register(body ?? ({} as any));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: { login: string; password: string }) {
    return this.core.services.auth.login(body?.login, body?.password);
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return user.toPublic();
  }
}

@Controller('admin/users')
export class AdminController {
  constructor(@Inject(CORE) private readonly core: Core) {}

  @Get()
  list(@CurrentUser() user: User, @Query('page') page?: string) {
    return this.core.services.auth.listUsers(user, Number(page ?? 1));
  }

  @Post(':id/role')
  @HttpCode(200)
  changeRole(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { role: string }) {
    return this.core.services.auth.changeRole(user, id, body?.role);
  }

  @Post(':id/block')
  @HttpCode(200)
  block(@CurrentUser() user: User, @Param('id') id: string) {
    return this.core.services.auth.setBlocked(user, id, true);
  }

  @Post(':id/unblock')
  @HttpCode(200)
  unblock(@CurrentUser() user: User, @Param('id') id: string) {
    return this.core.services.auth.setBlocked(user, id, false);
  }
}
