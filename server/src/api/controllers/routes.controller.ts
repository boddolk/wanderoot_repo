import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { User } from '../../domain/users/user';
import type { Core } from '../../infrastructure/container';
import { CurrentUser, Public } from '../auth.guard';
import { CORE } from '../core.module';

const num = (v?: string) => (v === undefined || v === '' ? undefined : Number(v));

/** REST-інтерфейс маршрутів: CRUD, публікація, точки інтересу, пошук, імпорт/експорт. */
@Controller('routes')
export class RoutesController {
  constructor(@Inject(CORE) private readonly core: Core) {}

  @Public()
  @Get()
  search(@Query() q: Record<string, string>) {
    const lat = num(q.lat), lon = num(q.lon);
    return this.core.services.routes.search({
      text: q.q, mode: (q.mode || undefined) as any, tag: q.tag, minRating: num(q.minRating), sort: q.sort as any,
      page: num(q.page), pageSize: num(q.pageSize),
      near: lat !== undefined && lon !== undefined ? { lat, lon, radiusKm: num(q.radiusKm) ?? 25 } : undefined,
    });
  }

  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.core.services.routes.listMine(user);
  }

  @Post('import')
  importFile(@CurrentUser() user: User, @Body() body: { fileName: string; content: string; mode?: string }) {
    return this.core.services.exchange.importRoute(user, body?.fileName, body?.content, body?.mode);
  }

  @Public()
  @Get(':id')
  get(@CurrentUser() user: User | null, @Param('id') id: string) {
    const route = this.core.services.routes.get(user, id);
    return { ...route, author: this.core.services.profile.publicCard(route.ownerId) };
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: any) {
    return this.core.services.routes.create(user, body ?? {});
  }

  @Put(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: any) {
    return this.core.services.routes.update(user, id, body ?? {});
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    this.core.services.routes.delete(user, id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@CurrentUser() user: User, @Param('id') id: string) {
    return this.core.services.routes.publish(user, id);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(@CurrentUser() user: User, @Param('id') id: string) {
    return this.core.services.routes.unpublish(user, id);
  }

  @Post(':id/pois')
  addPoi(@CurrentUser() user: User, @Param('id') id: string, @Body() body: any) {
    return this.core.services.routes.addPoi(user, id, body ?? {});
  }

  @Delete(':id/pois/:poiId')
  removePoi(@CurrentUser() user: User, @Param('id') id: string, @Param('poiId') poiId: string) {
    return this.core.services.routes.removePoi(user, id, poiId);
  }

  @Post(':id/pois/:poiId/suggest')
  @HttpCode(200)
  suggestPoi(@CurrentUser() user: User, @Param('id') id: string, @Param('poiId') poiId: string) {
    return this.core.services.routes.suggestPoi(user, id, poiId);
  }

  @Public()
  @Get(':id/export')
  export(@CurrentUser() user: User | null, @Param('id') id: string, @Query('format') format: string, @Res({ passthrough: true }) res: Response) {
    const file = this.core.services.exchange.exportRoute(user, id, format ?? 'gpx');
    res.setHeader('Content-Type', `${file.mimeType}; charset=utf-8`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    return file.content;
  }

  @Public()
  @Get(':id/navigation-link')
  navigationLink(@CurrentUser() user: User | null, @Param('id') id: string) {
    return { url: this.core.services.exchange.googleMapsLink(user, id) };
  }

  // ---- відгуки ----
  @Public()
  @Get(':id/comments')
  comments(@CurrentUser() user: User | null, @Param('id') id: string) {
    return this.core.services.feedback.listComments(user, id);
  }

  @Post(':id/comments')
  addComment(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { text: string }) {
    return this.core.services.feedback.addComment(user, id, body?.text ?? '');
  }

  @Public()
  @Get(':id/ratings')
  ratingSummary(@CurrentUser() user: User | null, @Param('id') id: string) {
    return this.core.services.feedback.ratingSummary(user, id);
  }

  @Get(':id/rating')
  myRating(@CurrentUser() user: User, @Param('id') id: string) {
    return { value: this.core.services.feedback.myRating(user, id) };
  }

  @Post(':id/rating')
  @HttpCode(200)
  rate(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { value: number }) {
    return this.core.services.feedback.rate(user, id, Number(body?.value));
  }
}
