import { createCore } from '../../src/infrastructure/container';

/** Керований годинник для тестів. */
export class TestClock {
  constructor(public current = new Date('2026-11-01T10:00:00Z')) {}
  now() { return new Date(this.current); }
  advance(minutes: number) { this.current = new Date(this.current.getTime() + minutes * 60_000); }
}

/** Ядро системи з БД у пам'яті та зниженою вартістю scrypt для швидкості тестів. */
export function makeCore() {
  const clock = new TestClock();
  const core = createCore({ dbPath: ':memory:', jwtSecret: 'test-secret-0123456789', clock, scryptCost: 1024 });
  return { ...core, clock };
}

export type TestCore = ReturnType<typeof makeCore>;

export function registerUser(core: TestCore, login: string, role?: 'MODERATOR' | 'ADMIN') {
  const res = core.services.auth.register({ login, email: `${login}@example.com`, password: 'Passw0rd!' });
  const user = core.repos.users.findById(res.user.id)!;
  if (role) { user.changeRole(role as any); core.repos.users.save(user); }
  return { id: user.id, role: user.role, token: res.token };
}

/** Точки вздовж вулиці у Тернополі (~1,1 км). */
export const TERNOPIL_LINE = [
  { lat: 49.5535, lon: 25.5948 },
  { lat: 49.5560, lon: 25.6000 },
  { lat: 49.5590, lon: 25.6080 },
];

export function publishedRoute(core: TestCore, owner: { id: string; role: any }, title = 'Прогулянка Тернополем', extra: Record<string, unknown> = {}) {
  const r = core.services.routes.create(owner, { title, waypoints: TERNOPIL_LINE, tags: ['місто'], ...extra } as any);
  return core.services.routes.publish(owner, r.id);
}
