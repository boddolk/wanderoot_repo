/**
 * Перевірка НФВ-01 (пошук ≤ 300 мс серед 10 000 маршрутів) та НФВ-02 (імпорт файлу 5 МБ ≤ 2 с).
 * Запуск: npm run bench
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createCore } from '../../src/infrastructure/container';
import { Route } from '../../src/domain/routes/route';
import { TransportMode } from '../../src/domain/routes/travel-time';
import { RouteQuery } from '../../src/application/ports';

const ROUTES = 10_000;
const RUNS = 200;
const dir = mkdtempSync(join(tmpdir(), 'wanderoot-bench-'));
const core = createCore({ dbPath: join(dir, 'bench.db'), scryptCost: 1024 });
const owner = core.services.auth.register({ login: 'bench', email: 'bench@ex.ua', password: 'Passw0rd' }).user;

// детермінований генератор псевдовипадкових чисел
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const modes = Object.values(TransportMode);
const words = ['замок', 'ліс', 'озеро', 'каньйон', 'водоспад', 'парк', 'гори', 'місто', 'річка', 'фортеця'];

let t0 = performance.now();
core.database.run(() => {
  for (let i = 0; i < ROUTES; i++) {
    const lat = 44.5 + rnd() * 7.5, lon = 22.5 + rnd() * 17.5; // територія України
    const w = words[i % words.length];
    const r = Route.create(owner.id, { title: `Маршрут ${i} ${w}`, description: `Опис ${w}`, mode: modes[i % 4], tags: [w] }, new Date());
    r.setWaypoints(Array.from({ length: 50 }, (_, k) => ({ lat: lat + k * 0.001, lon: lon + k * 0.001 })), new Date());
    r.publish(new Date());
    r.applyRating(1 + rnd() * 4, 1 + Math.floor(rnd() * 20));
    core.repos.routes.save(r);
  }
});
const seedMs = performance.now() - t0;

const queries: [string, RouteQuery][] = [
  ['без фільтрів, нові', {}],
  ['текст «озеро»', { text: 'озеро' }],
  ['вид + рейтинг ≥ 4', { mode: TransportMode.HIKE, minRating: 4, sort: 'rating' }],
  ['тег «замок»', { tag: 'замок' }],
  ['у радіусі 50 км від Тернополя', { near: { lat: 49.55, lon: 25.59, radiusKm: 50 } }],
];

const pct = (arr: number[], p: number) => arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.ceil((p / 100) * arr.length) - 1)];
const results = queries.map(([name, q]) => {
  const times: number[] = [];
  let total = 0;
  for (let i = 0; i < RUNS; i++) {
    const s = performance.now();
    total = core.services.routes.search({ ...q, page: 1 + (i % 3) }).total;
    times.push(performance.now() - s);
  }
  return { query: name, found: total, medianMs: +pct(times, 50).toFixed(2), p95Ms: +pct(times, 95).toFixed(2) };
});

// імпорт GPX розміром близько 5 МБ
const pts: string[] = [];
let size = 0;
for (let i = 0; size < 4.9 * 1024 * 1024; i++) {
  const line = `<trkpt lat="${(48 + i * 0.00001).toFixed(6)}" lon="${(24 + i * 0.00001).toFixed(6)}"><ele>${500 + (i % 100)}</ele></trkpt>\n`;
  pts.push(line); size += Buffer.byteLength(line);
}
const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><name>Великий трек</name><trkseg>\n${pts.join('')}</trkseg></trk></gpx>`;
const importTimes: number[] = [];
let imported = 0;
for (let i = 0; i < 5; i++) {
  t0 = performance.now();
  imported = core.services.exchange.importRoute(owner, 'big.gpx', gpx).waypoints.length;
  importTimes.push(performance.now() - t0);
}

console.log(JSON.stringify({
  node: process.version, routes: ROUTES, runsPerQuery: RUNS, seedSeconds: +(seedMs / 1000).toFixed(1), search: results,
  import: { fileMB: +(Buffer.byteLength(gpx) / 1024 / 1024).toFixed(2), sourcePoints: pts.length, storedPoints: imported,
    medianMs: +pct(importTimes, 50).toFixed(0), maxMs: +Math.max(...importTimes).toFixed(0) },
}, null, 2));
core.database.close();
rmSync(dir, { recursive: true, force: true });
