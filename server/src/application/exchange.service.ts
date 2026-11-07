import { ValidationError } from '../domain/shared/errors';
import { MAX_WAYPOINTS, Viewer } from '../domain/routes/route';
import { TransportMode } from '../domain/routes/travel-time';
import { CodecRegistry } from './exchange/codecs';
import { RouteDto, RouteService } from './route.service';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const GOOGLE_MODES: Record<TransportMode, string> = {
  [TransportMode.WALK]: 'walking',
  [TransportMode.HIKE]: 'walking',
  [TransportMode.BIKE]: 'bicycling',
  [TransportMode.CAR]: 'driving',
};

/** Рівномірно проріджує масив до заданої кількості елементів, зберігаючи перший і останній. */
export function sample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)]);
}

/** Фасад для імпорту, експорту маршрутів і формування посилань для навігаторів. */
export class ExchangeService {
  constructor(private readonly routeService: RouteService, private readonly codecs: CodecRegistry) {}

  importRoute(owner: Viewer, fileName: string, content: string, mode?: string): RouteDto {
    if (typeof content !== 'string' || content.length === 0) throw new ValidationError('Файл порожній');
    if (Buffer.byteLength(content, 'utf8') > MAX_IMPORT_BYTES) throw new ValidationError('Розмір файлу перевищує 5 МБ');
    const data = this.codecs.detect(fileName).decode(content);
    if (data.waypoints.length < 2) throw new ValidationError('Файл має містити щонайменше дві точки шляху');
    const baseName = (fileName ?? '').replace(/\.[^.]+$/, '');
    let title = (data.title || baseName || 'Імпортований маршрут').slice(0, 120);
    if (title.length < 3) title = `Маршрут ${title}`;
    return this.routeService.createFromData(owner, {
      title, description: data.description.slice(0, 5000), mode,
      waypoints: sample(data.waypoints, MAX_WAYPOINTS), pois: data.pois.slice(0, 200),
    });
  }

  exportRoute(viewer: Viewer | null, routeId: string, format: string): { fileName: string; mimeType: string; content: string } {
    const codec = this.codecs.get(format);
    const route = this.routeService.get(viewer, routeId);
    const safeName = route.title.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'route';
    return { fileName: `${safeName}.${codec.extensions[0].slice(1)}`, mimeType: codec.mimeType, content: codec.encode(route) };
  }

  /** Посилання Google Maps Directions (до 9 проміжних точок). */
  googleMapsLink(viewer: Viewer | null, routeId: string): string {
    const route = this.routeService.get(viewer, routeId);
    if (route.waypoints.length < 2) throw new ValidationError('Маршрут має містити щонайменше дві точки');
    const pts = sample(route.waypoints, 11);
    const fmt = (p: { lat: number; lon: number }) => `${p.lat},${p.lon}`;
    const params = new URLSearchParams({
      api: '1', origin: fmt(pts[0]), destination: fmt(pts[pts.length - 1]), travelmode: GOOGLE_MODES[route.mode],
    });
    if (pts.length > 2) params.set('waypoints', pts.slice(1, -1).map(fmt).join('|'));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }
}
