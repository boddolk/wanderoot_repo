import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeCore, registerUser, publishedRoute, TERNOPIL_LINE, TestCore } from '../support/helpers';
import { AuthError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../src/domain/shared/errors';
import { GpxCodec } from '../../src/application/exchange/codecs';

let core: TestCore;
beforeEach(() => { core = makeCore(); });

describe('AuthService + SQLite', () => {
  it('реєстрація, вхід і автентифікація за токеном', () => {
    const reg = core.services.auth.register({ login: 'olena', email: 'olena@ex.ua', password: 'Passw0rd' });
    assert.equal(reg.user.role, 'USER');
    const res = core.services.auth.login('olena', 'Passw0rd');
    assert.equal(core.services.auth.authenticate(res.token).login, 'olena');
  });

  it('дублікат логіна або email відхиляється', () => {
    core.services.auth.register({ login: 'olena', email: 'olena@ex.ua', password: 'Passw0rd' });
    assert.throws(() => core.services.auth.register({ login: 'OLENA', email: 'x@ex.ua', password: 'Passw0rd' }), ConflictError);
    assert.throws(() => core.services.auth.register({ login: 'other', email: 'OLENA@ex.ua', password: 'Passw0rd' }), ConflictError);
  });

  it('після 5 невдалих спроб вхід блокується на 15 хвилин', () => {
    core.services.auth.register({ login: 'ivan', email: 'ivan@ex.ua', password: 'Passw0rd' });
    for (let i = 0; i < 5; i++) assert.throws(() => core.services.auth.login('ivan', 'wrong'), AuthError);
    assert.throws(() => core.services.auth.login('ivan', 'Passw0rd'), ForbiddenError);
    core.clock.advance(16);
    assert.ok(core.services.auth.login('ivan', 'Passw0rd').token);
  });

  it('адміністратор змінює роль, користувач отримує сповіщення; заблокований не може увійти', () => {
    const admin = registerUser(core, 'admin', 'ADMIN');
    const u = registerUser(core, 'petro');
    const adminUser = core.repos.users.findById(admin.id)!;
    core.services.auth.changeRole(adminUser, u.id, 'MODERATOR');
    assert.equal(core.repos.users.findById(u.id)!.role, 'MODERATOR');
    assert.match(core.services.notifications.list(u.id)[0].message, /MODERATOR/);
    core.services.auth.setBlocked(adminUser, u.id, true);
    assert.throws(() => core.services.auth.login('petro', 'Passw0rd!'), ForbiddenError);
    assert.throws(() => core.services.auth.authenticate(u.token), ForbiddenError);
    const plain = core.repos.users.findById(u.id)!;
    assert.throws(() => core.services.auth.changeRole(plain, admin.id, 'USER'), ForbiddenError);
  });
});

describe('ProfileService + SQLite', () => {
  it('оновлює ім\'я, місто й опис; дані зберігаються в БД', () => {
    const u = registerUser(core, 'olena');
    const res = core.services.profile.update(u, { displayName: 'Олена К.', city: 'Тернопіль', bio: 'Люблю гори' });
    assert.equal(res.displayName, 'Олена К.');
    const stored = core.repos.users.findById(u.id)!;
    assert.deepEqual([stored.displayName, stored.city, stored.bio], ['Олена К.', 'Тернопіль', 'Люблю гори']);
  });

  it('зміна email вимагає поточного пароля і перевіряє унікальність', () => {
    const u = registerUser(core, 'olena');
    registerUser(core, 'petro');
    assert.throws(() => core.services.profile.update(u, { email: 'new@ex.ua' }), ValidationError);
    assert.throws(() => core.services.profile.update(u, { email: 'new@ex.ua', currentPassword: 'wrong' }), ValidationError);
    assert.throws(() => core.services.profile.update(u, { email: 'PETRO@example.com', currentPassword: 'Passw0rd!' }), ConflictError);
    core.services.profile.update(u, { email: 'New@Ex.ua', currentPassword: 'Passw0rd!' });
    assert.equal(core.repos.users.findById(u.id)!.email, 'new@ex.ua');
    // той самий email не вважається зміною і пароля не потребує
    assert.doesNotThrow(() => core.services.profile.update(u, { email: 'new@ex.ua', city: 'Львів' }));
  });

  it('зміна пароля: перевірка поточного, новий токен, старі токени відкликаються, сповіщення', () => {
    const u = registerUser(core, 'olena');
    assert.throws(() => core.services.profile.changePassword(u, 'wrong', 'NewPassw0rd'), ValidationError);
    assert.throws(() => core.services.profile.changePassword(u, 'Passw0rd!', 'short'), ValidationError);
    assert.throws(() => core.services.profile.changePassword(u, 'Passw0rd!', 'Passw0rd!'), ValidationError);
    core.clock.advance(1);
    const res = core.services.profile.changePassword(u, 'Passw0rd!', 'NewPassw0rd');
    assert.throws(() => core.services.auth.authenticate(u.token), AuthError);
    assert.equal(core.services.auth.authenticate(res.token).id, u.id);
    assert.throws(() => core.services.auth.login('olena', 'Passw0rd!'), AuthError);
    assert.ok(core.services.auth.login('olena', 'NewPassw0rd').token);
    assert.equal(core.services.notifications.list(u.id)[0].type, 'SECURITY');
  });

  it('підбір поточного пароля блокується так само, як вхід', () => {
    const u = registerUser(core, 'olena');
    for (let i = 0; i < 5; i++) assert.throws(() => core.services.profile.changePassword(u, 'wrong', 'NewPassw0rd'), ValidationError);
    assert.throws(() => core.services.profile.changePassword(u, 'Passw0rd!', 'NewPassw0rd'), ForbiddenError);
  });

  it('профіль містить зведену активність користувача', () => {
    const olena = registerUser(core, 'olena');
    const petro = registerUser(core, 'petro');
    const r = publishedRoute(core, olena);
    core.services.routes.create(olena, { title: 'Чернетка', waypoints: TERNOPIL_LINE });
    core.services.feedback.rate(petro, r.id, 4);
    core.services.feedback.addComment(petro, r.id, 'Гарний маршрут');
    const a = core.services.profile.view(olena).activity;
    assert.equal(a.routesTotal, 2);
    assert.equal(a.routesPublished, 1);
    assert.equal(a.routesDraft, 1);
    assert.equal(a.ratingsReceived, 1);
    assert.equal(a.ratingAvgReceived, 4);
    assert.ok(a.publishedKm > 0.5);
    const b = core.services.profile.view(petro).activity;
    assert.deepEqual([b.routesTotal, b.commentsWritten, b.ratingsGiven], [0, 1, 1]);
  });
});

describe('RouteService + SQLite', () => {
  it('створює, зберігає і відновлює маршрут з точками інтересу, тегами та тривалістю', () => {
    const u = registerUser(core, 'olena');
    const r = core.services.routes.create(u, { title: 'Над Ставом', mode: 'BIKE', tags: ['Озеро'], waypoints: TERNOPIL_LINE });
    core.services.routes.addPoi(u, r.id, { name: 'Замок', category: 'HISTORY', lat: 49.554, lon: 25.596 });
    const loaded = core.services.routes.get(u, r.id);
    assert.equal(loaded.waypoints.length, 3);
    assert.equal(loaded.pois[0].name, 'Замок');
    assert.deepEqual(loaded.tags, ['озеро']);
    assert.equal(loaded.status, 'DRAFT');
    assert.equal(loaded.durationMin, Math.round((loaded.lengthKm / 15) * 60));
  });

  it('чернетку не бачать інші; редагувати може лише автор', () => {
    const a = registerUser(core, 'author');
    const b = registerUser(core, 'stranger');
    const r = core.services.routes.create(a, { title: 'Мій маршрут', waypoints: TERNOPIL_LINE });
    assert.throws(() => core.services.routes.get(b, r.id), NotFoundError);
    assert.throws(() => core.services.routes.get(null, r.id), NotFoundError);
    assert.throws(() => core.services.routes.update(b, r.id, { title: 'Чужий' }), ForbiddenError);
    assert.throws(() => core.services.routes.delete(b, r.id), ForbiddenError);
    core.services.routes.publish(a, r.id);
    assert.equal(core.services.routes.get(null, r.id).status, 'PUBLISHED');
  });

  it('пошук за текстом (без урахування регістру кирилиці), видом, тегом, рейтингом і відстанню', () => {
    const u = registerUser(core, 'olena');
    publishedRoute(core, u, 'Прогулянка Тернополем');
    publishedRoute(core, u, 'Дністровський каньйон', { mode: 'HIKE', tags: ['каньйон'], waypoints: [{ lat: 48.75, lon: 25.6 }, { lat: 48.76, lon: 25.62 }] });
    core.services.routes.create(u, { title: 'Чернетка Тернопіль', waypoints: TERNOPIL_LINE }); // не публікується
    const s = core.services.routes;
    assert.equal(s.search({ text: 'тернопол' }).total, 1);
    assert.equal(s.search({ text: 'ДНІСТРОВ' }).total, 1);
    assert.equal(s.search({ mode: 'HIKE' as any }).total, 1);
    assert.equal(s.search({ tag: 'Каньйон' }).total, 1);
    assert.equal(s.search({ near: { lat: 49.55, lon: 25.59, radiusKm: 10 } }).items[0].title, 'Прогулянка Тернополем');
    assert.equal(s.search({ near: { lat: 49.55, lon: 25.59, radiusKm: 200 } }).total, 2);
    assert.equal(s.search({ minRating: 1 }).total, 0);
    assert.equal(s.search({ sort: 'length', pageSize: 1 }).items.length, 1);
    assert.throws(() => s.search({ mode: 'PLANE' as any }), ValidationError);
  });

  it('пагінація повертає загальну кількість', () => {
    const u = registerUser(core, 'olena');
    for (let i = 0; i < 7; i++) publishedRoute(core, u, `Маршрут номер ${i}`);
    const p = core.services.routes.search({ page: 2, pageSize: 3 });
    assert.equal(p.total, 7);
    assert.equal(p.items.length, 3);
    assert.equal(core.services.routes.listMine(u).length, 7);
  });

  it('видалення маршруту каскадно видаляє точки інтересу і теги', () => {
    const u = registerUser(core, 'olena');
    const r = core.services.routes.create(u, { title: 'Тимчасовий', tags: ['a'], waypoints: TERNOPIL_LINE });
    core.services.routes.addPoi(u, r.id, { name: 'P', lat: 49.55, lon: 25.6 });
    core.services.routes.delete(u, r.id);
    const db = core.database.db;
    assert.equal((db.prepare('SELECT COUNT(*) n FROM pois').get() as any).n, 0);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM route_tags').get() as any).n, 0);
  });
});

describe('Дані для інтерфейсу: мініатюри, статуси, автор, розподіл оцінок', () => {
  it('картки маршрутів містять статус і спрощену лінію треку; власні – кількість точок на розгляді', () => {
    const u = registerUser(core, 'olena');
    const long = Array.from({ length: 100 }, (_, i) => ({ lat: 49.5 + i * 0.001, lon: 25.5 + i * 0.001 }));
    const r = core.services.routes.create(u, { title: 'Довгий трек', waypoints: long });
    core.services.routes.publish(u, r.id);
    const draft = core.services.routes.create(u, { title: 'Чернетка', waypoints: TERNOPIL_LINE });
    const withPoi = core.services.routes.addPoi(u, draft.id, { name: 'Джерело', lat: 49.554, lon: 25.596 });
    core.services.routes.suggestPoi(u, draft.id, withPoi.pois[0].id);

    const found = core.services.routes.search({}).items[0];
    assert.equal(found.status, 'PUBLISHED');
    assert.equal(found.preview.length, 24);
    assert.deepEqual(found.preview[0], [49.5, 25.5]);
    assert.deepEqual(found.preview[23], [49.599, 25.599], 'остання точка зберігається');
    const mine = core.services.routes.listMine(u);
    const d = mine.find((m) => m.id === draft.id)!;
    assert.equal(d.status, 'DRAFT');
    assert.equal(d.preview.length, 3);
    assert.equal(d.pendingPois, 1);
    assert.equal(mine.find((m) => m.id === r.id)!.pendingPois, 0);
  });

  it('розподіл оцінок і публічна картка автора', () => {
    const owner = registerUser(core, 'owner');
    const r = publishedRoute(core, owner);
    ['aaa', 'bbb', 'ccc'].forEach((login, i) => core.services.feedback.rate(registerUser(core, login), r.id, [5, 5, 3][i]));
    const s = core.services.feedback.ratingSummary(null, r.id);
    assert.deepEqual(s.histogram, [0, 0, 1, 0, 2]);
    assert.equal(s.count, 3);
    assert.ok(Math.abs(s.avg - 13 / 3) < 0.01);
    core.services.profile.update(owner, { displayName: 'Власник', city: 'Тернопіль' });
    assert.deepEqual(core.services.profile.publicCard(owner.id), { id: owner.id, displayName: 'Власник', city: 'Тернопіль' });
    assert.equal(core.services.profile.publicCard('missing'), null);
  });

  it('скарги в черзі модерації містять автора скарги та опис об\'єкта', () => {
    const owner = registerUser(core, 'owner');
    const reporter = registerUser(core, 'reporter');
    const mod = registerUser(core, 'moder', 'MODERATOR');
    const r = publishedRoute(core, owner);
    const c = core.services.feedback.addComment(owner, r.id, 'Мій коментар');
    core.services.moderation.fileComplaint(reporter, { targetType: 'ROUTE', targetId: r.id, reason: 'WRONG_DATA' });
    core.services.moderation.fileComplaint(reporter, { targetType: 'COMMENT', targetId: c.id, reason: 'SPAM' });
    const list = core.services.moderation.listComplaints(mod);
    const route = list.find((x) => x.targetType === 'ROUTE')!;
    assert.equal(route.reporterName, 'reporter');
    assert.equal(route.target.title, r.title);
    assert.equal(route.target.authorName, 'owner');
    assert.equal(route.target.mode, 'WALK');
    const comment = list.find((x) => x.targetType === 'COMMENT')!;
    assert.equal(comment.target.text, 'Мій коментар');
    assert.equal(comment.target.routeId, r.id);
  });
});

describe('FeedbackService: оцінки, коментарі, сповіщення', () => {
  it('середній рейтинг перераховується, повторна оцінка замінює попередню', () => {
    const owner = registerUser(core, 'owner');
    const a = registerUser(core, 'a'.repeat(3));
    const b = registerUser(core, 'bbb');
    const r = publishedRoute(core, owner);
    core.services.feedback.rate(a, r.id, 5);
    let res = core.services.feedback.rate(b, r.id, 2);
    assert.equal(res.ratingAvg, 3.5);
    res = core.services.feedback.rate(b, r.id, 4);
    assert.equal(res.ratingAvg, 4.5);
    assert.equal(res.ratingCount, 2);
    assert.equal(core.services.routes.get(null, r.id).ratingAvg, 4.5);
    assert.equal(core.services.feedback.myRating(b, r.id), 4);
    assert.throws(() => core.services.feedback.rate(owner, r.id, 5), ForbiddenError);
    assert.throws(() => core.services.feedback.rate(a, r.id, 7), ValidationError);
    assert.equal(core.services.notifications.list(owner.id).filter((n) => n.type === 'RATING').length, 3);
  });

  it('коментар проходить перевірку, власник маршруту отримує сповіщення', () => {
    const owner = registerUser(core, 'owner');
    const u = registerUser(core, 'guest1');
    const r = publishedRoute(core, owner);
    assert.throws(() => core.services.feedback.addComment(u, r.id, 'ти ідіот'), ValidationError);
    assert.equal(core.services.feedback.listComments(null, r.id).length, 0);
    const c = core.services.feedback.addComment(u, r.id, 'Гарні краєвиди!');
    assert.equal(c.authorName, 'guest1');
    assert.equal(core.services.feedback.listComments(null, r.id).length, 1);
    const n = core.services.notifications.list(owner.id, true);
    assert.equal(n.length, 1);
    core.services.notifications.markRead(owner.id, n[0].id);
    assert.equal(core.services.notifications.list(owner.id, true).length, 0);
    assert.throws(() => core.services.notifications.markRead(u.id, n[0].id), NotFoundError);
    core.services.feedback.addComment(owner, r.id, 'Дякую!');
    assert.equal(core.services.notifications.list(owner.id).length, 1, 'власний коментар не створює сповіщення');
  });

  it('чернетку не можна оцінювати і коментувати', () => {
    const owner = registerUser(core, 'owner');
    const u = registerUser(core, 'user1');
    const r = core.services.routes.create(owner, { title: 'Чернетка', waypoints: TERNOPIL_LINE, visibility: 'UNLISTED' });
    assert.throws(() => core.services.feedback.addComment(owner, r.id, 'текст'), ConflictError);
    assert.throws(() => core.services.feedback.rate(u, r.id, 5), NotFoundError);
  });
});

describe('ModerationService: скарги та затвердження точок інтересу', () => {
  it('приховування маршруту за скаргою: маршрут зникає з пошуку, учасники отримують сповіщення', () => {
    const owner = registerUser(core, 'owner');
    const reporter = registerUser(core, 'reporter');
    const mod = registerUser(core, 'moder', 'MODERATOR');
    const r = publishedRoute(core, owner);
    const complaint = core.services.moderation.fileComplaint(reporter, { targetType: 'ROUTE', targetId: r.id, reason: 'WRONG_DATA' });
    assert.throws(() => core.services.moderation.listComplaints(reporter), ForbiddenError);
    assert.equal(core.services.moderation.listComplaints(mod).length, 1);
    core.services.moderation.resolve(mod, complaint.id, 'HIDE_CONTENT', 'Неіснуюча стежка');
    assert.equal(core.services.routes.search({}).total, 0);
    assert.throws(() => core.services.routes.get(reporter, r.id), NotFoundError);
    assert.equal(core.services.routes.get(owner, r.id).hiddenReason, 'Неіснуюча стежка');
    assert.match(core.services.notifications.list(owner.id)[0].message, /приховано/);
    assert.match(core.services.notifications.list(reporter.id)[0].message, /розглянуто/);
    assert.throws(() => core.services.moderation.resolve(mod, complaint.id, 'REJECT'), ConflictError);
    core.services.moderation.restoreRoute(mod, r.id);
    assert.equal(core.services.routes.search({}).total, 1);
  });

  it('блокування автора доступне лише адміністратору', () => {
    const owner = registerUser(core, 'owner');
    const reporter = registerUser(core, 'reporter');
    const mod = registerUser(core, 'moder', 'MODERATOR');
    const admin = registerUser(core, 'admin', 'ADMIN');
    const r = publishedRoute(core, owner);
    const c = core.services.feedback.addComment(owner, r.id, 'Реклама: купуйте тури');
    const complaint = core.services.moderation.fileComplaint(reporter, { targetType: 'COMMENT', targetId: c.id, reason: 'SPAM' });
    assert.throws(() => core.services.moderation.resolve(mod, complaint.id, 'BLOCK_USER'), ForbiddenError);
    core.services.moderation.resolve(admin, complaint.id, 'BLOCK_USER');
    assert.equal(core.repos.users.findById(owner.id)!.status, 'BLOCKED');
  });

  it('транзакція відкочується: невдале рішення не змінює стан скарги', () => {
    const admin = registerUser(core, 'admin', 'ADMIN');
    const other = registerUser(core, 'other', 'ADMIN');
    const reporter = registerUser(core, 'reporter');
    const complaint = core.services.moderation.fileComplaint(reporter, { targetType: 'USER', targetId: other.id, reason: 'OFFENSIVE' });
    assert.throws(() => core.services.moderation.resolve(admin, complaint.id, 'BLOCK_USER'), ValidationError); // адміністратора не блокують
    assert.throws(() => core.services.moderation.resolve(admin, complaint.id, 'HIDE_CONTENT'), ValidationError);
    assert.equal(core.repos.complaints.findById(complaint.id)!.status, 'OPEN');
  });

  it('скарга на неіснуючий об\'єкт відхиляється', () => {
    const u = registerUser(core, 'user1');
    assert.throws(() => core.services.moderation.fileComplaint(u, { targetType: 'ROUTE', targetId: 'missing', reason: 'SPAM' }), NotFoundError);
    assert.throws(() => core.services.moderation.fileComplaint(u, { targetType: 'COMMENT', targetId: 'missing', reason: 'SPAM' }), NotFoundError);
  });

  it('точка інтересу: пропозиція користувача та затвердження модератором', () => {
    const owner = registerUser(core, 'owner');
    const mod = registerUser(core, 'moder', 'MODERATOR');
    const r = core.services.routes.create(owner, { title: 'З точкою', waypoints: TERNOPIL_LINE });
    const withPoi = core.services.routes.addPoi(owner, r.id, { name: 'Джерело', category: 'NATURE', lat: 49.55, lon: 25.6 });
    const poiId = withPoi.pois[0].id;
    core.services.routes.suggestPoi(owner, r.id, poiId);
    assert.throws(() => core.services.routes.suggestPoi(owner, r.id, poiId), ConflictError);
    const pending = core.services.moderation.listPendingPois(mod);
    assert.equal(pending.length, 1);
    assert.equal(core.services.moderation.reviewPoi(mod, r.id, poiId, true).sharing, 'APPROVED');
    assert.equal(core.services.moderation.listPendingPois(mod).length, 0);
    assert.match(core.services.notifications.list(owner.id)[0].message, /Джерело/);
  });
});

describe('ExchangeService: імпорт, експорт, посилання', () => {
  const gpx = new GpxCodec().encode({
    title: 'Похід на Говерлу', description: 'Класичний маршрут',
    waypoints: [{ lat: 48.16, lon: 24.5 }, { lat: 48.162, lon: 24.505 }, { lat: 48.16, lon: 24.51 }],
    pois: [{ name: 'Вершина', description: '2061 м', category: 'NATURE', location: { lat: 48.16, lon: 24.5 } }],
  });

  it('імпорт GPX створює чернетку з точками інтересу', () => {
    const u = registerUser(core, 'olena');
    const r = core.services.exchange.importRoute(u, 'hoverla.gpx', gpx, 'HIKE');
    assert.equal(r.title, 'Похід на Говерлу');
    assert.equal(r.status, 'DRAFT');
    assert.equal(r.mode, 'HIKE');
    assert.equal(r.waypoints.length, 3);
    assert.equal(r.pois[0].name, 'Вершина');
  });

  it('експорт у KML та GeoJSON і повторний імпорт дають той самий маршрут', () => {
    const u = registerUser(core, 'olena');
    const r = core.services.exchange.importRoute(u, 'hoverla.gpx', gpx);
    for (const format of ['kml', 'geojson']) {
      const file = core.services.exchange.exportRoute(u, r.id, format);
      assert.ok(file.fileName.endsWith(format === 'kml' ? '.kml' : '.geojson'));
      const again = core.services.exchange.importRoute(u, file.fileName, file.content);
      assert.deepEqual(again.waypoints, r.waypoints);
    }
  });

  it('посилання Google Maps містить початок, кінець і вид пересування', () => {
    const owner = registerUser(core, 'owner');
    const r = publishedRoute(core, owner, 'Велопрогулянка', { mode: 'BIKE' });
    const url = new URL(core.services.exchange.googleMapsLink(null, r.id));
    assert.equal(url.searchParams.get('origin'), '49.5535,25.5948');
    assert.equal(url.searchParams.get('destination'), '49.559,25.608');
    assert.equal(url.searchParams.get('travelmode'), 'bicycling');
    assert.equal(url.searchParams.get('waypoints'), '49.556,25.6');
  });

  it('великі, порожні та непідтримувані файли відхиляються', () => {
    const u = registerUser(core, 'olena');
    assert.throws(() => core.services.exchange.importRoute(u, 'a.gpx', ''), ValidationError);
    assert.throws(() => core.services.exchange.importRoute(u, 'a.txt', 'text'), ValidationError);
    assert.throws(() => core.services.exchange.importRoute(u, 'a.gpx', 'x'.repeat(5 * 1024 * 1024 + 1)), /5 МБ/);
    const onePoint = '<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>';
    assert.throws(() => core.services.exchange.importRoute(u, 'a.gpx', onePoint), /дві точки/);
  });
});
