import { ValidationError } from '../../domain/shared/errors';
import { child, childText, escapeXml, findAll, parseXml, XmlNode } from './xml';

/** Дані маршруту, отримані з файлу. */
export interface ImportedRoute {
  title: string;
  description: string;
  waypoints: { lat: number; lon: number }[];
  pois: { name: string; description: string; category?: string; lat: number; lon: number }[];
}

/** Дані маршруту для запису у файл. */
export interface ExportableRoute {
  title: string;
  description: string;
  waypoints: { lat: number; lon: number }[];
  pois: { name: string; description: string; category: string; location: { lat: number; lon: number } }[];
}

/** Патерн «Стратегія»: кожен формат файлу має власний алгоритм читання та запису. */
export interface RouteCodec {
  readonly format: string;
  readonly extensions: string[];
  readonly mimeType: string;
  decode(content: string): ImportedRoute;
  encode(route: ExportableRoute): string;
}

const num = (v: unknown) => (typeof v === 'string' ? parseFloat(v) : Number(v));
const point = (lat: unknown, lon: unknown) => {
  const p = { lat: num(lat), lon: num(lon) };
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) throw new ValidationError('Файл містить некоректні координати');
  return p;
};

function parseOrFail(content: string, format: string): XmlNode {
  try {
    return parseXml(content);
  } catch (e) {
    throw new ValidationError(`Некоректний файл ${format}: ${(e as Error).message}`);
  }
}

/** GPX 1.1: трек (trkpt) або маршрут (rtept) – точки шляху; wpt – точки інтересу. */
export class GpxCodec implements RouteCodec {
  readonly format = 'gpx';
  readonly extensions = ['.gpx'];
  readonly mimeType = 'application/gpx+xml';

  decode(content: string): ImportedRoute {
    const root = parseOrFail(content, 'GPX');
    if (root.name !== 'gpx') throw new ValidationError('Файл не є документом GPX');
    let pts = findAll(root, 'trkpt');
    if (pts.length === 0) pts = findAll(root, 'rtept');
    const meta = child(root, 'metadata');
    const trk = child(root, 'trk') ?? child(root, 'rte');
    return {
      title: (meta && childText(meta, 'name')) || (trk && childText(trk, 'name')) || '',
      description: (meta && childText(meta, 'desc')) || (trk && childText(trk, 'desc')) || '',
      waypoints: pts.map((p) => point(p.attrs.lat, p.attrs.lon)),
      pois: findAll(root, 'wpt').map((w) => ({ ...point(w.attrs.lat, w.attrs.lon), name: childText(w, 'name') || 'Точка', description: childText(w, 'desc'), category: childText(w, 'type') || undefined })),
    };
  }

  encode(r: ExportableRoute): string {
    const wpts = r.pois.map((p) => `  <wpt lat="${p.location.lat}" lon="${p.location.lon}">\n    <name>${escapeXml(p.name)}</name>\n    <desc>${escapeXml(p.description)}</desc>\n    <type>${p.category}</type>\n  </wpt>`);
    const trkpts = r.waypoints.map((p) => `      <trkpt lat="${p.lat}" lon="${p.lon}"/>`);
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="WandeRoot" xmlns="http://www.topografix.com/GPX/1/1">',
      `  <metadata>\n    <name>${escapeXml(r.title)}</name>\n    <desc>${escapeXml(r.description)}</desc>\n  </metadata>`,
      ...wpts,
      `  <trk>\n    <name>${escapeXml(r.title)}</name>\n    <trkseg>`, ...trkpts, '    </trkseg>\n  </trk>',
      '</gpx>', '',
    ].join('\n');
  }
}

/** KML 2.2: LineString – точки шляху, Point – точки інтересу. Координати у порядку «довгота,широта». */
export class KmlCodec implements RouteCodec {
  readonly format = 'kml';
  readonly extensions = ['.kml'];
  readonly mimeType = 'application/vnd.google-earth.kml+xml';

  decode(content: string): ImportedRoute {
    const root = parseOrFail(content, 'KML');
    if (root.name !== 'kml') throw new ValidationError('Файл не є документом KML');
    const doc = child(root, 'Document') ?? root;
    const waypoints: ImportedRoute['waypoints'] = [];
    const pois: ImportedRoute['pois'] = [];
    for (const pm of findAll(root, 'Placemark')) {
      const line = findAll(pm, 'LineString')[0];
      const pt = findAll(pm, 'Point')[0];
      if (line) waypoints.push(...parseCoords(childText(line, 'coordinates')));
      else if (pt) {
        const [c] = parseCoords(childText(pt, 'coordinates'));
        if (c) pois.push({ ...c, name: childText(pm, 'name') || 'Точка', description: childText(pm, 'description') });
      }
    }
    return { title: childText(doc, 'name'), description: childText(doc, 'description'), waypoints, pois };
  }

  encode(r: ExportableRoute): string {
    const coords = r.waypoints.map((p) => `${p.lon},${p.lat}`).join(' ');
    const points = r.pois.map((p) => `    <Placemark>\n      <name>${escapeXml(p.name)}</name>\n      <description>${escapeXml(p.description)}</description>\n      <Point><coordinates>${p.location.lon},${p.location.lat}</coordinates></Point>\n    </Placemark>`);
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<kml xmlns="http://www.opengis.net/kml/2.2">',
      '  <Document>',
      `    <name>${escapeXml(r.title)}</name>`,
      `    <description>${escapeXml(r.description)}</description>`,
      `    <Placemark>\n      <name>${escapeXml(r.title)}</name>\n      <LineString><coordinates>${coords}</coordinates></LineString>\n    </Placemark>`,
      ...points,
      '  </Document>',
      '</kml>', '',
    ].join('\n');
  }
}

function parseCoords(text: string): { lat: number; lon: number }[] {
  return text.split(/\s+/).filter(Boolean).map((t) => {
    const [lon, lat] = t.split(',');
    return point(lat, lon);
  });
}

/** GeoJSON (RFC 7946): FeatureCollection з LineString і Point. Координати [довгота, широта]. */
export class GeoJsonCodec implements RouteCodec {
  readonly format = 'geojson';
  readonly extensions = ['.geojson', '.json'];
  readonly mimeType = 'application/geo+json';

  decode(content: string): ImportedRoute {
    let data: any;
    try { data = JSON.parse(content); } catch { throw new ValidationError('Некоректний файл GeoJSON: помилка синтаксису JSON'); }
    const features: any[] = data?.type === 'FeatureCollection' ? data.features ?? [] : data?.type === 'Feature' ? [data] : [];
    if (!Array.isArray(features) || features.length === 0) throw new ValidationError('Файл GeoJSON не містить об\'єктів');
    const result: ImportedRoute = { title: String(data.name ?? data.properties?.name ?? ''), description: '', waypoints: [], pois: [] };
    for (const f of features) {
      const g = f?.geometry; const props = f?.properties ?? {};
      if (g?.type === 'LineString') {
        result.waypoints.push(...(g.coordinates as unknown[][]).map((c) => point(c[1], c[0])));
        result.title ||= String(props.name ?? '');
        result.description ||= String(props.description ?? '');
      } else if (g?.type === 'MultiLineString') {
        for (const line of g.coordinates as unknown[][][]) result.waypoints.push(...line.map((c) => point(c[1], c[0])));
      } else if (g?.type === 'Point') {
        result.pois.push({ ...point(g.coordinates[1], g.coordinates[0]), name: String(props.name ?? 'Точка'), description: String(props.description ?? ''), category: props.category });
      }
    }
    return result;
  }

  encode(r: ExportableRoute): string {
    return JSON.stringify({
      type: 'FeatureCollection',
      name: r.title,
      features: [
        { type: 'Feature', properties: { name: r.title, description: r.description }, geometry: { type: 'LineString', coordinates: r.waypoints.map((p) => [p.lon, p.lat]) } },
        ...r.pois.map((p) => ({ type: 'Feature', properties: { name: p.name, description: p.description, category: p.category }, geometry: { type: 'Point', coordinates: [p.location.lon, p.location.lat] } })),
      ],
    }, null, 2);
  }
}

/** Реєстр кодеків: повертає стратегію за назвою формату або розширенням файлу. */
export class CodecRegistry {
  private readonly codecs = new Map<string, RouteCodec>();

  constructor(codecs: RouteCodec[] = []) {
    codecs.forEach((c) => this.register(c));
  }

  register(codec: RouteCodec): this {
    this.codecs.set(codec.format, codec);
    return this;
  }

  get(format: string): RouteCodec {
    const codec = this.codecs.get((format ?? '').toLowerCase());
    if (!codec) throw new ValidationError(`Непідтримуваний формат: ${format}`);
    return codec;
  }

  detect(fileName: string): RouteCodec {
    const name = (fileName ?? '').toLowerCase();
    const codec = [...this.codecs.values()].find((c) => c.extensions.some((ext) => name.endsWith(ext)));
    if (!codec) throw new ValidationError('Підтримуються файли .gpx, .kml, .geojson');
    return codec;
  }

  formats(): string[] {
    return [...this.codecs.keys()];
  }

  static default(): CodecRegistry {
    return new CodecRegistry([new GpxCodec(), new KmlCodec(), new GeoJsonCodec()]);
  }
}
