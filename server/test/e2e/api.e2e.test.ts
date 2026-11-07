/**
 * Наскрізні (e2e) тести REST API: піднімається повний застосунок NestJS з БД у пам'яті,
 * запити надсилаються через supertest. Запуск: npm run test:e2e
 */
import 'reflect-metadata';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../src/api/app.module';
import { CORE } from '../../src/api/core.module';
import { configure } from '../../src/main';
import { createCore } from '../../src/infrastructure/container';
import { GpxCodec } from '../../src/application/exchange/codecs';

let app: NestExpressApplication;
let http: any;
const core = createCore({ dbPath: ':memory:', jwtSecret: 'e2e-secret-0123456789', scryptCost: 1024 });
const tokens: Record<string, string> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
const line = [{ lat: 49.5535, lon: 25.5948 }, { lat: 49.556, lon: 25.6 }, { lat: 49.559, lon: 25.608 }];

before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CORE).useValue(core).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  await configure(app);
  await app.init();
  http = app.getHttpServer();
  core.services.auth.ensureAdmin('admin', 'admin@wanderoot.local', 'Admin12345');
  tokens.admin = (await request(http).post('/api/auth/login').send({ login: 'admin', password: 'Admin12345' })).body.token;
});

after(async () => { await app.close(); });

describe('REST API WandeRoot', () => {
  let routeId = '';

  it('POST /api/auth/register – реєстрація (201) і помилка валідації (422)', async () => {
    for (const login of ['olena', 'petro', 'moder']) {
      const res = await request(http).post('/api/auth/register').send({ login, email: `${login}@ex.ua`, password: 'Passw0rd' });
      assert.equal(res.status, 201);
      tokens[login] = res.body.token;
    }
    const bad = await request(http).post('/api/auth/register').send({ login: 'x', email: 'bad', password: '1' });
    assert.equal(bad.status, 422);
    assert.equal(bad.body.error, 'VALIDATION_ERROR');
    const dup = await request(http).post('/api/auth/register').send({ login: 'olena', email: 'o2@ex.ua', password: 'Passw0rd' });
    assert.equal(dup.status, 409);
  });

  it('POST /api/auth/login – невірний пароль (401), GET /api/auth/me без токена (401)', async () => {
    assert.equal((await request(http).post('/api/auth/login').send({ login: 'olena', password: 'wrong' })).status, 401);
    assert.equal((await request(http).get('/api/auth/me')).status, 401);
    const me = await request(http).get('/api/auth/me').set(auth('olena'));
    assert.equal(me.status, 200);
    assert.equal(me.body.login, 'olena');
    assert.equal(me.body.passwordHash, undefined);
  });

  it('створення, редагування і публікація маршруту', async () => {
    const created = await request(http).post('/api/routes').set(auth('olena'))
      .send({ title: 'Над Тернопільським ставом', mode: 'WALK', tags: ['Місто'], waypoints: line });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'DRAFT');
    routeId = created.body.id;
    assert.equal((await request(http).get(`/api/routes/${routeId}`)).status, 404, 'гість не бачить чернетку');
    assert.equal((await request(http).put(`/api/routes/${routeId}`).set(auth('petro')).send({ title: 'Чужий' })).status, 403);
    const poi = await request(http).post(`/api/routes/${routeId}/pois`).set(auth('olena')).send({ name: 'Замок', category: 'HISTORY', lat: 49.554, lon: 25.596 });
    assert.equal(poi.status, 201);
    const pub = await request(http).post(`/api/routes/${routeId}/publish`).set(auth('olena'));
    assert.equal(pub.status, 200);
    assert.equal(pub.body.status, 'PUBLISHED');
    assert.ok(pub.body.lengthKm > 0 && pub.body.durationMin > 0);
    assert.equal((await request(http).post(`/api/routes/${routeId}/publish`).set(auth('olena'))).status, 409);
  });

  it('GET /api/routes – пошук гостем', async () => {
    const res = await request(http).get('/api/routes').query({ q: 'ставом', lat: 49.55, lon: 25.59, radiusKm: 5 });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.items[0].id, routeId);
    assert.equal((await request(http).get('/api/routes').query({ mode: 'PLANE' })).status, 422);
  });

  it('оцінка і коментар створюють сповіщення власнику', async () => {
    const rate = await request(http).post(`/api/routes/${routeId}/rating`).set(auth('petro')).send({ value: 4 });
    assert.equal(rate.status, 200);
    assert.equal(rate.body.ratingAvg, 4);
    assert.equal((await request(http).post(`/api/routes/${routeId}/rating`).set(auth('olena')).send({ value: 5 })).status, 403);
    assert.equal((await request(http).post(`/api/routes/${routeId}/comments`).set(auth('petro')).send({ text: 'ідіот' })).status, 422);
    assert.equal((await request(http).post(`/api/routes/${routeId}/comments`).set(auth('petro')).send({ text: 'Гарно!' })).status, 201);
    const comments = await request(http).get(`/api/routes/${routeId}/comments`);
    assert.equal(comments.body.length, 1);
    const notes = await request(http).get('/api/notifications').set(auth('olena'));
    assert.equal(notes.body.length, 2);
    const summary = await request(http).get(`/api/routes/${routeId}/ratings`);
    assert.equal(summary.status, 200);
    assert.deepEqual(summary.body.histogram, [0, 0, 0, 1, 0]);
    const page = await request(http).get(`/api/routes/${routeId}`);
    assert.equal(page.body.author.displayName, 'olena');
    assert.equal(page.body.author.email, undefined, 'email автора не розкривається');
  });

  it('експорт GPX і імпорт файлу', async () => {
    const exp = await request(http).get(`/api/routes/${routeId}/export`).query({ format: 'gpx' });
    assert.equal(exp.status, 200);
    assert.match(exp.headers['content-type'], /gpx/);
    assert.match(exp.text, /<trkpt/);
    const gpx = new GpxCodec().encode({ title: 'Імпорт', description: '', waypoints: line, pois: [] });
    const imp = await request(http).post('/api/routes/import').set(auth('petro')).send({ fileName: 'track.gpx', content: gpx });
    assert.equal(imp.status, 201);
    assert.equal(imp.body.waypoints.length, 3);
    const link = await request(http).get(`/api/routes/${routeId}/navigation-link`);
    assert.match(link.body.url, /^https:\/\/www\.google\.com\/maps\/dir\//);
  });

  it('модерація: користувач без ролі отримує 403, модератор приховує маршрут', async () => {
    const users = await request(http).get('/api/admin/users').set(auth('admin'));
    const moderId = users.body.find((u: any) => u.login === 'moder').id;
    assert.equal((await request(http).post(`/api/admin/users/${moderId}/role`).set(auth('olena')).send({ role: 'MODERATOR' })).status, 403);
    assert.equal((await request(http).post(`/api/admin/users/${moderId}/role`).set(auth('admin')).send({ role: 'MODERATOR' })).status, 200);
    const complaint = await request(http).post('/api/complaints').set(auth('petro')).send({ targetType: 'ROUTE', targetId: routeId, reason: 'WRONG_DATA' });
    assert.equal(complaint.status, 201);
    assert.equal((await request(http).get('/api/moderation/complaints').set(auth('petro'))).status, 403);
    const resolved = await request(http).post(`/api/moderation/complaints/${complaint.body.id}/resolve`).set(auth('moder')).send({ decision: 'HIDE_CONTENT', note: 'Неточні дані' });
    assert.equal(resolved.status, 200);
    assert.equal((await request(http).get(`/api/routes/${routeId}`)).status, 404);
    assert.equal((await request(http).post(`/api/moderation/routes/${routeId}/restore`).set(auth('moder'))).status, 200);
    assert.equal((await request(http).get(`/api/routes/${routeId}`)).status, 200);
  });

  it('профіль: перегляд, редагування даних, зміна пароля з відкликанням старого токена', async () => {
    assert.equal((await request(http).get('/api/profile')).status, 401);
    const view = await request(http).get('/api/profile').set(auth('petro'));
    assert.equal(view.status, 200);
    assert.equal(view.body.user.login, 'petro');
    assert.equal(typeof view.body.activity.routesTotal, 'number');

    const upd = await request(http).put('/api/profile').set(auth('petro')).send({ displayName: 'Петро П.', city: 'Заліщики', bio: 'Походи' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.displayName, 'Петро П.');
    assert.equal(upd.body.passwordHash, undefined);
    assert.equal((await request(http).put('/api/profile').set(auth('petro')).send({ email: 'p2@ex.ua' })).status, 422);
    assert.equal((await request(http).put('/api/profile').set(auth('petro')).send({ email: 'olena@ex.ua', currentPassword: 'Passw0rd' })).status, 409);
    assert.equal((await request(http).put('/api/profile').set(auth('petro')).send({ email: 'p2@ex.ua', currentPassword: 'Passw0rd' })).body.email, 'p2@ex.ua');

    assert.equal((await request(http).post('/api/profile/password').set(auth('petro')).send({ currentPassword: 'bad', newPassword: 'NewPassw0rd' })).status, 422);
    const changed = await request(http).post('/api/profile/password').set(auth('petro')).send({ currentPassword: 'Passw0rd', newPassword: 'NewPassw0rd' });
    assert.equal(changed.status, 200);
    assert.equal((await request(http).get('/api/auth/me').set(auth('petro'))).status, 401, 'старий токен відкликано');
    tokens.petro = changed.body.token;
    assert.equal((await request(http).get('/api/auth/me').set(auth('petro'))).status, 200);
    assert.equal((await request(http).post('/api/auth/login').send({ login: 'petro', password: 'NewPassw0rd' })).status, 200);
  });

  it('некоректний токен і некоректний JSON обробляються без помилки 500', async () => {
    assert.equal((await request(http).get('/api/routes/mine').set({ Authorization: 'Bearer abc.def.ghi' })).status, 401);
    const bad = await request(http).post('/api/routes').set(auth('olena')).set('Content-Type', 'application/json').send('{bad');
    assert.equal(bad.status, 400);
  });
});
