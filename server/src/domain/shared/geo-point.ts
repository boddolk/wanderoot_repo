import { ensure } from './errors';

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Об'єкт-значення: географічна точка (широта, довгота) у градусах WGS84. */
export class GeoPoint {
  readonly lat: number;
  readonly lon: number;

  constructor(lat: number, lon: number) {
    ensure(Number.isFinite(lat) && lat >= -90 && lat <= 90, 'Широта має бути в межах від -90 до 90');
    ensure(Number.isFinite(lon) && lon >= -180 && lon <= 180, 'Довгота має бути в межах від -180 до 180');
    // зберігаємо 6 знаків після коми (~0,1 м) – достатньо для маршрутів
    this.lat = Math.round(lat * 1e6) / 1e6;
    this.lon = Math.round(lon * 1e6) / 1e6;
  }

  static from(p: { lat: number; lon: number }): GeoPoint {
    return new GeoPoint(Number(p.lat), Number(p.lon));
  }

  /** Відстань до іншої точки в кілометрах (формула гаверсинусів). */
  distanceTo(other: GeoPoint): number {
    const dLat = toRad(other.lat - this.lat);
    const dLon = toRad(other.lon - this.lon);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(this.lat)) * Math.cos(toRad(other.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  toJSON() {
    return { lat: this.lat, lon: this.lon };
  }
}

/** Сумарна довжина ламаної в кілометрах. */
export function polylineLengthKm(points: readonly GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i - 1].distanceTo(points[i]);
  return total;
}
