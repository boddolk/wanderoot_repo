/**
 * Наповнення БД демонстраційними даними. Запуск: npm run seed
 * Облікові записи: admin / Admin12345, moder / Moder12345, olena / Olena12345, petro / Petro12345
 */
import { createCore } from '../src/infrastructure/container';
import { Role } from '../src/domain/users/role';

const core = createCore({ dbPath: process.env.DB_PATH ?? 'wanderoot.db' });
const { auth, routes, feedback, moderation } = core.services;

function user(login: string, password: string, displayName: string, role?: Role) {
  const existing = core.repos.users.findByLogin(login);
  if (existing) return existing;
  auth.register({ login, email: `${login}@wanderoot.local`, password, displayName });
  const u = core.repos.users.findByLogin(login)!;
  if (role) { u.changeRole(role); core.repos.users.save(u); }
  return u;
}

if (core.repos.users.findByLogin('olena')) {
  console.log('Демонстраційні дані вже існують');
  process.exit(0);
}

const admin = user('admin', 'Admin12345', 'Адміністратор', Role.ADMIN);
const moder = user('moder', 'Moder12345', 'Модератор', Role.MODERATOR);
const olena = user('olena', 'Olena12345', 'Олена');
const petro = user('petro', 'Petro12345', 'Петро');
core.services.profile.update(olena, { city: 'Тернопіль', bio: 'Люблю неспішні прогулянки містом і велопоїздки вихідного дня.' });
core.services.profile.update(petro, { city: 'Заліщики', bio: 'Походи Дністровським каньйоном, замки та водоспади Поділля.' });

const demo = [
  { owner: olena, title: 'Набережна Тернопільського ставу', mode: 'WALK', tags: ['місто', 'озеро'], description: 'Спокійна прогулянка вздовж ставу від Замкового парку до Старого парку.',
    waypoints: [[49.5536, 25.5937], [49.5512, 25.5905], [49.5478, 25.5868], [49.5441, 25.5850], [49.5410, 25.5843]],
    pois: [{ name: 'Тернопільський замок', category: 'HISTORY', lat: 49.5537, lon: 25.5940, description: 'Замок XVI ст.' },
      { name: 'Питний фонтанчик', category: 'INFRASTRUCTURE', lat: 49.5478, lon: 25.5868, description: '' }] },
  { owner: olena, title: 'Велопрогулянка до Агропарку', mode: 'BIKE', tags: ['вело', 'місто'], description: 'Маршрут велодоріжками мікрорайону Східний.',
    waypoints: [[49.5555, 25.6050], [49.5600, 25.6200], [49.5650, 25.6350], [49.5690, 25.6480]], pois: [] },
  { owner: petro, title: 'Дністровський каньйон: Червоногородський замок', mode: 'HIKE', tags: ['каньйон', 'замок', 'водоспад'], description: 'Похід до руїн замку та Джуринського водоспаду.',
    waypoints: [[48.7520, 25.5790], [48.7480, 25.5850], [48.7440, 25.5920], [48.7420, 25.6000]],
    pois: [{ name: 'Джуринський водоспад', category: 'NATURE', lat: 48.7435, lon: 25.5935, description: 'Один з найбільших рівнинних водоспадів України' },
      { name: 'Червоногородський замок', category: 'HISTORY', lat: 48.7425, lon: 25.5990, description: '' }] },
  { owner: petro, title: 'Збаразький замок і парк', mode: 'WALK', tags: ['замок', 'парк'], description: 'Коротка прогулянка Збаражем.',
    waypoints: [[49.6640, 25.7770], [49.6625, 25.7800], [49.6610, 25.7835]],
    pois: [{ name: 'Місце для вигулу собак', category: 'PET_FRIENDLY', lat: 49.6620, lon: 25.7810, description: 'Огороджений майданчик' }] },
  { owner: olena, title: 'Автомобільний маршрут Тернопіль – Почаїв', mode: 'CAR', tags: ['авто', 'лавра'], description: 'Поїздка вихідного дня до Почаївської лаври.',
    waypoints: [[49.5535, 25.5948], [49.7000, 25.5600], [49.8800, 25.5000], [50.0050, 25.5080]], pois: [] },
];

for (const d of demo) {
  const r = routes.create(d.owner, { title: d.title, description: d.description, mode: d.mode, tags: d.tags,
    waypoints: d.waypoints.map(([lat, lon]) => ({ lat, lon })) });
  d.pois.forEach((p) => routes.addPoi(d.owner, r.id, p));
  routes.publish(d.owner, r.id);
}
const all = routes.search({ pageSize: 50 }).items;
for (const r of all) {
  const other = r.ownerId === olena.id ? petro : olena;
  feedback.rate(other, r.id, r.title.includes('каньйон') ? 5 : 4);
  feedback.rate(moder, r.id, 5);
}
const canyon = all.find((r) => r.title.includes('каньйон'))!;
feedback.addComment(olena, canyon.id, 'Неймовірні краєвиди, водоспад варто побачити навесні!');
const draft = routes.create(petro, { title: 'Чернетка: Кременецькі гори', mode: 'HIKE', waypoints: [{ lat: 50.1030, lon: 25.7280 }, { lat: 50.1000, lon: 25.7350 }] });
const withPoi = routes.addPoi(petro, draft.id, { name: 'Джерело на горі Бона', category: 'NATURE', lat: 50.1015, lon: 25.7310 });
routes.suggestPoi(petro, draft.id, withPoi.pois[0].id);
moderation.fileComplaint(petro, { targetType: 'ROUTE', targetId: all[0].id, reason: 'WRONG_DATA', description: 'Частина стежки закрита на ремонт' });

console.log(`Готово: ${all.length} опублікованих маршрутів; користувачі ${[admin, moder, olena, petro].map((u) => u.login).join(', ')}`);
core.database.close();
