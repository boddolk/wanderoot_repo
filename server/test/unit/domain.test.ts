import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GeoPoint, polylineLengthKm } from '../../src/domain/shared/geo-point';
import { ConflictError, ValidationError, ForbiddenError, NotFoundError } from '../../src/domain/shared/errors';
import {
  CyclingStrategy, DrivingStrategy, HikingStrategy, TransportMode, TravelTimeEstimator, TravelTimeStrategy, WalkingStrategy,
} from '../../src/domain/routes/travel-time';
import { Route } from '../../src/domain/routes/route';
import { PointOfInterest, PoiCategory } from '../../src/domain/routes/point-of-interest';
import { Permission, Role, assertCan, can } from '../../src/domain/users/role';
import { LOCK_MINUTES, MAX_FAILED_LOGINS, User } from '../../src/domain/users/user';
import { Comment, Rating, TextValidator } from '../../src/domain/feedback/feedback';
import { Complaint } from '../../src/domain/moderation/complaint';

const now = new Date('2026-11-01T10:00:00Z');
const owner = { id: 'owner-1', role: Role.USER };
const line = [{ lat: 49.5535, lon: 25.5948 }, { lat: 49.559, lon: 25.608 }];

describe('GeoPoint', () => {
  it('обчислює відстань Тернопіль – Львів ≈ 117 км', () => {
    const d = new GeoPoint(49.5535, 25.5948).distanceTo(new GeoPoint(49.8397, 24.0297));
    assert.ok(Math.abs(d - 117) < 2, `отримано ${d}`);
  });
  it('відстань від точки до самої себе дорівнює 0', () => {
    assert.equal(new GeoPoint(10, 20).distanceTo(new GeoPoint(10, 20)), 0);
  });
  it('відхиляє координати поза допустимим діапазоном', () => {
    assert.throws(() => new GeoPoint(91, 0), ValidationError);
    assert.throws(() => new GeoPoint(0, -181), ValidationError);
    assert.throws(() => new GeoPoint(Number.NaN, 0), ValidationError);
  });
  it('довжина ламаної дорівнює сумі довжин сегментів', () => {
    const a = new GeoPoint(0, 0), b = new GeoPoint(0, 1), c = new GeoPoint(1, 1);
    assert.ok(Math.abs(polylineLengthKm([a, b, c]) - (a.distanceTo(b) + b.distanceTo(c))) < 1e-9);
    assert.equal(polylineLengthKm([a]), 0);
  });
});

describe('Патерн «Стратегія»: розрахунок тривалості', () => {
  it('кожна стратегія використовує власну модель швидкості', () => {
    assert.equal(new WalkingStrategy().estimateMinutes(9), 120);   // 9 км / 4,5 км/год
    assert.equal(new HikingStrategy().estimateMinutes(7), 132);    // 2 год × 1,1
    assert.equal(new CyclingStrategy().estimateMinutes(30), 120);  // 30 км / 15 км/год
    assert.equal(new DrivingStrategy().estimateMinutes(100), 132); // 2 год × 1,1
  });
  it('контекст обирає стратегію за видом пересування', () => {
    const est = TravelTimeEstimator.default();
    assert.equal(est.estimateMinutes(TransportMode.BIKE, 15), 60);
    assert.equal(est.estimateMinutes(TransportMode.WALK, 0), 0);
  });
  it('нова стратегія додається без зміни наявного коду', () => {
    const boat: TravelTimeStrategy = { mode: 'BOAT' as TransportMode, estimateMinutes: (km) => Math.round(km * 10) };
    assert.equal(TravelTimeEstimator.default().register(boat).estimateMinutes('BOAT' as TransportMode, 3), 30);
  });
  it('відсутня стратегія або від\'ємна відстань спричиняє помилку', () => {
    assert.throws(() => new TravelTimeEstimator().estimateMinutes(TransportMode.CAR, 1), ValidationError);
    assert.throws(() => new WalkingStrategy().estimateMinutes(-1), ValidationError);
  });
});

describe('Route: дані та інваріанти', () => {
  it('перевіряє довжину назви, вид пересування, видимість і теги', () => {
    assert.throws(() => Route.create('u', { title: 'ab' }, now), ValidationError);
    assert.throws(() => Route.create('u', { title: 'x'.repeat(121) }, now), ValidationError);
    assert.throws(() => Route.create('u', { title: 'Маршрут', mode: 'PLANE' }, now), ValidationError);
    assert.throws(() => Route.create('u', { title: 'Маршрут', visibility: 'SECRET' }, now), ValidationError);
    assert.throws(() => Route.create('u', { title: 'Маршрут', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, now), ValidationError);
  });
  it('нормалізує теги: нижній регістр, без дублікатів і порожніх', () => {
    const r = Route.create('u', { title: 'Маршрут', tags: [' Ліс ', 'ліс', '', 'Озеро'] }, now);
    assert.deepEqual(r.tags, ['ліс', 'озеро']);
  });
  it('обчислює довжину маршруту', () => {
    const r = Route.create('u', { title: 'Маршрут' }, now);
    r.setWaypoints(line, now);
    assert.ok(r.lengthKm() > 1 && r.lengthKm() < 1.3);
  });
  it('додає, знаходить і видаляє точки інтересу', () => {
    const r = Route.create('u', { title: 'Маршрут' }, now);
    const poi = PointOfInterest.create({ name: 'Замок', category: 'HISTORY', lat: 49.55, lon: 25.59 });
    r.addPoi(poi, now);
    assert.equal(r.findPoi(poi.id).category, PoiCategory.HISTORY);
    r.removePoi(poi.id, now);
    assert.throws(() => r.findPoi(poi.id), NotFoundError);
    assert.throws(() => r.removePoi('missing', now), NotFoundError);
  });
  it('невідома категорія точки інтересу замінюється на OTHER', () => {
    assert.equal(PointOfInterest.create({ name: 'Місце', category: 'XYZ', lat: 0, lon: 0 }).category, PoiCategory.OTHER);
    assert.throws(() => PointOfInterest.create({ name: '', lat: 0, lon: 0 }), ValidationError);
  });
});

describe('Патерн «Стан»: життєвий цикл маршруту', () => {
  const fresh = () => { const r = Route.create(owner.id, { title: 'Маршрут' }, now); r.setWaypoints(line, now); return r; };

  it('чернетку без двох точок опублікувати неможливо', () => {
    const r = Route.create(owner.id, { title: 'Маршрут' }, now);
    assert.throws(() => r.publish(now), ValidationError);
    assert.equal(r.status, 'DRAFT');
  });
  it('повний цикл: чернетка → опубліковано → приховано → опубліковано → чернетка', () => {
    const r = fresh();
    r.publish(now); assert.equal(r.status, 'PUBLISHED');
    r.hide('спам', now); assert.equal(r.status, 'HIDDEN'); assert.equal(r.hiddenReason, 'спам');
    r.restore(now); assert.equal(r.status, 'PUBLISHED'); assert.equal(r.hiddenReason, null);
    r.unpublish(now); assert.equal(r.status, 'DRAFT');
  });
  it('недопустимі переходи спричиняють ConflictError', () => {
    const r = fresh();
    assert.throws(() => r.hide('x', now), ConflictError);
    assert.throws(() => r.restore(now), ConflictError);
    assert.throws(() => r.unpublish(now), ConflictError);
    r.publish(now);
    assert.throws(() => r.publish(now), ConflictError);
    r.hide('x', now);
    assert.throws(() => r.unpublish(now), ConflictError);
  });
  it('опублікований маршрут не може мати менше двох точок', () => {
    const r = fresh(); r.publish(now);
    assert.throws(() => r.setWaypoints([line[0]], now), ValidationError);
  });
  it('видимість залежить від стану, видимості та ролі', () => {
    const r = fresh();
    const guest = null, other = { id: 'x', role: Role.USER }, mod = { id: 'm', role: Role.MODERATOR };
    assert.equal(r.isVisibleTo(guest), false);
    assert.equal(r.isVisibleTo(owner), true);
    assert.equal(r.isVisibleTo(mod), true);
    r.publish(now);
    assert.equal(r.isVisibleTo(guest), true);
    assert.equal(r.isListed(), true);
    r.update({ title: 'Маршрут', visibility: 'UNLISTED' }, now);
    assert.equal(r.isVisibleTo(other), true);
    assert.equal(r.isListed(), false);
    r.update({ title: 'Маршрут', visibility: 'PRIVATE' }, now);
    assert.equal(r.isVisibleTo(other), false);
    r.update({ title: 'Маршрут', visibility: 'PUBLIC' }, now);
    r.hide('x', now);
    assert.equal(r.isVisibleTo(other), false);
    assert.equal(r.isVisibleTo(owner), true);
  });
});

describe('Ролі та користувачі', () => {
  it('ієрархія ролей: адміністратор має дозволи модератора', () => {
    assert.equal(can(Role.USER, Permission.MODERATE_CONTENT), false);
    assert.equal(can(Role.MODERATOR, Permission.MODERATE_CONTENT), true);
    assert.equal(can(Role.MODERATOR, Permission.MANAGE_USERS), false);
    assert.equal(can(Role.ADMIN, Permission.MODERATE_CONTENT), true);
    assert.equal(can(Role.ADMIN, Permission.CREATE_ROUTE), true);
    assert.throws(() => assertCan(Role.USER, Permission.APPROVE_POI), ForbiddenError);
  });
  const mk = () => User.register({ login: 'traveller', email: 'T@Example.com', passwordHash: 'h', now });
  it('реєстрація нормалізує email і перевіряє логін', () => {
    assert.equal(mk().email, 't@example.com');
    assert.throws(() => User.register({ login: 'ab', email: 'a@b.ua', passwordHash: 'h', now }), ValidationError);
    assert.throws(() => User.register({ login: 'abc', email: 'wrong', passwordHash: 'h', now }), ValidationError);
    assert.throws(() => User.validatePassword('short1'), ValidationError);
    assert.throws(() => User.validatePassword('onlyletters'), ValidationError);
    assert.doesNotThrow(() => User.validatePassword('Пароль123'));
  });
  it(`блокує вхід після ${MAX_FAILED_LOGINS} невдалих спроб на ${LOCK_MINUTES} хв`, () => {
    const u = mk();
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) u.registerFailedLogin(now);
    assert.equal(u.isLocked(now), false);
    u.registerFailedLogin(now);
    assert.equal(u.isLocked(now), true);
    assert.equal(u.isLocked(new Date(now.getTime() + (LOCK_MINUTES + 1) * 60_000)), false);
  });
  it('адміністратора заблокувати неможливо', () => {
    const u = mk(); u.changeRole(Role.ADMIN);
    assert.throws(() => u.block(), ValidationError);
    const v = mk(); v.block(); assert.equal(v.status, 'BLOCKED'); v.unblock(); assert.equal(v.status, 'ACTIVE');
  });
  it('профіль: оновлення нормалізує дані, порожнє ім\'я замінюється логіном, довгі поля відхиляються', () => {
    const u = mk();
    u.updateProfile({ displayName: '  Мандрівник ', city: ' Тернопіль ', bio: ' Привіт ', email: ' New@Mail.UA ' });
    assert.equal(u.displayName, 'Мандрівник');
    assert.equal(u.city, 'Тернопіль');
    assert.equal(u.bio, 'Привіт');
    assert.equal(u.email, 'new@mail.ua');
    u.updateProfile({ displayName: '' });
    assert.equal(u.displayName, 'traveller');
    u.updateProfile({ city: 'Львів' });
    assert.equal(u.bio, 'Привіт', 'поля, яких немає у змінах, не змінюються');
    assert.throws(() => u.updateProfile({ bio: 'x'.repeat(501) }), ValidationError);
    assert.throws(() => u.updateProfile({ email: 'wrong' }), ValidationError);
    assert.throws(() => u.updateProfile({ city: 42 as any }), ValidationError);
    assert.equal(u.city, 'Львів', 'невдале оновлення не змінює профіль частково');
  });
  it('після зміни пароля токени, видані раніше, відкликаються', () => {
    const u = mk();
    const before = u.credentialsVersion;
    assert.equal(u.isTokenRevoked(before), false);
    assert.equal(u.isTokenRevoked(undefined), false, 'токени без версії дійсні, доки пароль не змінювали');
    u.changePassword('new-hash', new Date(now.getTime() + 1));   // навіть у ту саму секунду
    assert.equal(u.passwordHash, 'new-hash');
    assert.equal(u.isTokenRevoked(before), true);
    assert.equal(u.isTokenRevoked(undefined), true);
    assert.equal(u.isTokenRevoked(u.credentialsVersion), false);
    assert.equal('passwordChangedAt' in u.toPublic(), false);
  });
  it('публічне подання не містить хешу пароля', () => {
    assert.equal('passwordHash' in mk().toPublic(), false);
  });
});

describe('Відгуки та скарги', () => {
  const v = TextValidator.default();
  it('перевірка тексту коментаря', () => {
    assert.doesNotThrow(() => v.check('Чудовий маршрут, рекомендую!'));
    assert.throws(() => v.check('   '), /порожнім/);
    assert.throws(() => v.check('a'.repeat(1001)), /1000/);
    assert.throws(() => v.check('Автор – ідіот'), /недопустимі/);
    assert.throws(() => v.check('http://a.ua http://b.ua http://c.ua'), /посилань/);
  });
  it('оцінка – ціле число від 1 до 5', () => {
    assert.throws(() => new Rating('r', 'u', 0, now), ValidationError);
    assert.throws(() => new Rating('r', 'u', 4.5, now), ValidationError);
    assert.equal(new Rating('r', 'u', 5, now).value, 5);
  });
  it('коментар можна приховати лише один раз', () => {
    const c = Comment.create('r', 'u', ' текст ', now);
    assert.equal(c.text, 'текст');
    c.hide();
    assert.throws(() => c.hide(), ConflictError);
  });
  it('скаргу перевіряють під час подання і закривають лише один раз', () => {
    assert.throws(() => Complaint.file({ reporterId: 'u', targetType: 'PHOTO', targetId: '1', reason: 'SPAM' }, now), ValidationError);
    assert.throws(() => Complaint.file({ reporterId: 'u', targetType: 'ROUTE', targetId: '1', reason: 'BAD' }, now), ValidationError);
    const c = Complaint.file({ reporterId: 'u', targetType: 'ROUTE', targetId: '1', reason: 'SPAM' }, now);
    c.close('REJECT', 'm', now);
    assert.equal(c.status, 'REJECTED');
    assert.throws(() => c.close('HIDE_CONTENT', 'm', now), ConflictError);
  });
});
