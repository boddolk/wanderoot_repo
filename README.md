# WandeRoot – інтерактивний путівник

Курсовий проєкт з дисципліни «Проєктний практикум».
Веб-система для створення, публікації та обміну маршрутами з точками інтересу, з оцінками, коментарями та модерацією контенту.

## Структура репозиторію

```
server/            серверна частина (REST API), TypeScript + NestJS + SQLite
  src/domain/          доменна модель: Route, User, Comment, Complaint, стратегії, стани
  src/application/     сервіси бізнес-логіки, порти (інтерфейси), кодеки GPX/KML/GeoJSON
  src/infrastructure/  репозиторії SQLite, хешування паролів, токени, шина подій
  src/api/             контролери NestJS, перевірка доступу, обробка помилок
  test/unit, test/integration, test/e2e, test/perf
  scripts/seed.ts      демонстраційні дані
web/               веб-клієнт, React + Vite + Leaflet (OpenStreetMap)
docs/models        вихідні файли UML-діаграм (Mermaid, Graphviz)
docs/img           згенеровані зображення діаграм
docker-compose.yml розгортання (nginx + Node.js)
```

## Вимоги

- Node.js **22.5 або новіший** (використовуються вбудовані модулі `node:sqlite` і `node:test`);
- npm 10+;
- для розгортання в контейнерах – Docker і Docker Compose.

## Запуск для розробки

```bash
# 1. Сервер (порт 3000)
cd server
npm install
npm run seed        # необов'язково: демонстраційні користувачі та маршрути
npm run dev

# 2. Клієнт (порт 5173), в іншому терміналі
cd web
npm install
npm run dev
```

Відкрити http://localhost:5173. Запити `/api` клієнт перенаправляє на сервер.

Демонстраційні облікові записи (після `npm run seed`):

| Логін | Пароль | Роль |
|---|---|---|
| admin | Admin12345 | адміністратор |
| moder | Moder12345 | модератор |
| olena | Olena12345 | користувач |
| petro | Petro12345 | користувач |

Змінні середовища сервера (необов'язкові): `PORT`, `DB_PATH` (файл БД, за замовчуванням `wanderoot.db`),
`JWT_SECRET`, `ADMIN_LOGIN`, `ADMIN_PASSWORD` (створення адміністратора під час запуску) – див. `server/.env.example`.

## Тестування

```bash
cd server
npm test            # модульні та інтеграційні тести (node:test)
npm run test:cov    # те саме зі звітом про покриття коду
npm run test:e2e    # наскрізні тести REST API (NestJS + supertest)
npm run bench       # вимірювання швидкодії пошуку (10 000 маршрутів) та імпорту файлу 5 МБ
npm run typecheck   # перевірка типів TypeScript
```

## Розгортання

```bash
docker compose up --build -d
```

Застосунок буде доступний на http://localhost:8080, дані зберігаються в томі `wanderoot-data`.
Перед розгортанням задайте власні `JWT_SECRET` та `ADMIN_PASSWORD` (файл `.env` поряд з `docker-compose.yml`).

## REST API (префікс `/api`)

| Метод і шлях | Призначення | Доступ |
|---|---|---|
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | реєстрація, вхід, поточний користувач | гість / користувач |
| `GET /profile`, `PUT /profile`, `POST /profile/password` | профіль з активністю, зміна імені/міста/опису/email (email – з паролем), зміна пароля (старі токени відкликаються) | користувач |
| `GET /routes?q=&mode=&tag=&minRating=&lat=&lon=&radiusKm=&sort=&page=` | пошук опублікованих маршрутів | гість |
| `GET /routes/:id`, `GET /routes/mine` | маршрут, власні маршрути | гість / користувач |
| `POST /routes`, `PUT /routes/:id`, `DELETE /routes/:id` | створення, редагування, видалення | автор |
| `POST /routes/:id/publish`, `POST /routes/:id/unpublish` | публікація | автор |
| `POST /routes/:id/pois`, `DELETE /routes/:id/pois/:poiId`, `POST /routes/:id/pois/:poiId/suggest` | точки інтересу | автор |
| `POST /routes/import`, `GET /routes/:id/export?format=gpx\|kml\|geojson`, `GET /routes/:id/navigation-link` | обмін маршрутами | користувач / гість |
| `GET /routes/:id/comments`, `POST /routes/:id/comments`, `POST /routes/:id/rating` | відгуки | гість / користувач |
| `POST /complaints` | скарга | користувач |
| `GET /moderation/complaints`, `POST /moderation/complaints/:id/resolve`, `POST /moderation/routes/:id/restore` | модерація | модератор |
| `GET /moderation/pois`, `POST /moderation/pois/:routeId/:poiId/approve\|reject` | точки інтересу спільноти | модератор |
| `GET /notifications`, `POST /notifications/:id/read` | сповіщення | користувач |
| `GET /admin/users`, `POST /admin/users/:id/role`, `POST /admin/users/:id/block\|unblock` | керування користувачами | адміністратор |

## Діаграми

Вихідні файли – у `docs/models` (інструкція з редагування – `docs/models/README.md`).
