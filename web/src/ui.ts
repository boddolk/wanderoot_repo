// Довідники та форматування для інтерфейсу (дизайн-система «Стежка»).
import type { Mode, Role, RouteStatus } from './api';

/** Колір виду пересування однаковий у чипі, лінії маршруту і маркері на карті. */
export const MODES: Record<Mode, { label: string; short: string; color: string; tint: string; ink: string }> = {
  WALK: { label: 'Пішки', short: 'Пішки', color: '#2E7D52', tint: '#E3F0E7', ink: '#1F5E3B' },
  HIKE: { label: 'Похід', short: 'Похід', color: '#8A5A2B', tint: '#F3E9DF', ink: '#6E4520' },
  BIKE: { label: 'Велосипед', short: 'Вело', color: '#2F6DB3', tint: '#E4EDF8', ink: '#24548A' },
  CAR: { label: 'Автомобіль', short: 'Авто', color: '#6B4FA3', tint: '#EEE8F7', ink: '#52398A' },
};
export const MODE_KEYS = Object.keys(MODES) as Mode[];

export const CATEGORIES: Record<string, { label: string; short: string; color: string; tint: string; ink: string }> = {
  HISTORY: { label: 'Історична пам\'ятка', short: 'Історія', color: '#8A5A2B', tint: '#F3E9DF', ink: '#6E4520' },
  NATURE: { label: 'Природа', short: 'Природа', color: '#3C8D40', tint: '#E6F1E3', ink: '#2B6A2F' },
  INFRASTRUCTURE: { label: 'Інфраструктура', short: 'Інфраструктура', color: '#2C6FB7', tint: '#E4EDF8', ink: '#24548A' },
  PET_FRIENDLY: { label: 'Для тварин', short: 'Для тварин', color: '#C47A12', tint: '#FBF1DF', ink: '#7A4B08' },
  OTHER: { label: 'Інше', short: 'Інше', color: '#6B766F', tint: '#EEF1EC', ink: '#3F4D45' },
};
export const category = (key: string) => CATEGORIES[key] ?? CATEGORIES.OTHER;

export const STATUS_LABEL: Record<RouteStatus, string> = { DRAFT: 'Чернетка', PUBLISHED: 'Опубліковано', HIDDEN: 'Приховано' };
export const ROLE_LABEL: Record<Role, string> = { USER: 'Мандрівник', MODERATOR: 'Модератор', ADMIN: 'Адміністратор' };
export const REASONS: Record<string, string> = { SPAM: 'Спам', OFFENSIVE: 'Образливий вміст', WRONG_DATA: 'Неправдиві дані', OTHER: 'Інше' };
export const DECISION_LABEL: Record<string, string> = { HIDE_CONTENT: 'Контент приховано', BLOCK_USER: 'Автора заблоковано', REJECT: 'Скаргу відхилено' };
export const VISIBILITY: Record<string, { label: string; hint: string }> = {
  PUBLIC: { label: 'Публічний', hint: 'Видно в пошуку після публікації' },
  UNLISTED: { label: 'За посиланням', hint: 'Не з\'являється в пошуку, відкривається за посиланням' },
  PRIVATE: { label: 'Приватний', hint: 'Бачите лише ви' },
};

const nf1 = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });

/** 1,9 км у списках; точніше (2 знаки) на сторінці маршруту. */
export const km = (v: number, precise = false) => `${(precise ? nf2 : nf1).format(v)} км`;
export const rating = (v: number) => (v ? nf1.format(v) : '–');

export function duration(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} год${m ? ` ${m} хв` : ''}` : `${m} хв`;
}

/** Відмінювання: plural(3, ['оцінка', 'оцінки', 'оцінок']). */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export const dateLong = (iso: string) => new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });

/** «щойно», «10 хв тому», «сьогодні, 09:14», «5 листопада, 03:03». */
export function relativeTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'щойно';
  if (diffMin < 60) return `${diffMin} хв тому`;
  const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `сьогодні, ${time}`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `учора, ${time}`;
  return `${d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}, ${time}`;
}

/** Довжина ламаної (формула гаверсинусів, як на сервері) – для живих показників у редакторі. */
export function lengthKm(points: { lat: number; lon: number }[]): number {
  const R = 6371.0088, rad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return total;
}

/** Ті самі швидкості й запас часу на зупинки, що й у стратегіях сервера (TravelTimeEstimator). */
const SPEED: Record<Mode, [number, number]> = { WALK: [4.5, 1], HIKE: [3.5, 1.1], BIKE: [15, 1], CAR: [50, 1.1] };
export const estimateMinutes = (mode: Mode, distanceKm: number) => Math.round((distanceKm / SPEED[mode][0]) * 60 * SPEED[mode][1]);

export const POI_SHARING: Record<string, { label: string; tone: 'muted' | 'warn' | 'ok' }> = {
  PRIVATE: { label: 'Лише на вашому маршруті', tone: 'muted' },
  PENDING: { label: 'На розгляді модератора', tone: 'warn' },
  APPROVED: { label: 'Затверджено для спільноти', tone: 'ok' },
};

/** Колір аватара залежить від імені, щоб різні люди відрізнялися. */
const AVATAR_COLORS = ['#1D5A42', '#2F6DB3', '#8A5A2B', '#6B4FA3', '#B4461F', '#2E7D52'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
