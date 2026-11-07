import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { Mode, Point, Poi } from '../api';
import { category, MODES } from '../ui';
import { Icon } from './Icon';

const DEFAULT_CENTER: [number, number] = [49.5535, 25.5948]; // Тернопіль

const LAYERS = {
  map: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  relief: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://opentopomap.org">OpenTopoMap</a>', maxZoom: 17 },
};

const pinIcon = (color: string, big = false) => L.divIcon({
  className: '', html: `<span class="map-pin${big ? ' big' : ''}" style="--pin:${color}"></span>`,
  iconSize: big ? [40, 40] : [32, 32], iconAnchor: big ? [20, 40] : [16, 32], popupAnchor: [0, big ? -38 : -30],
});
const poiIcon = (cat: string) => L.divIcon({
  className: '', html: `<span class="map-poi" style="--poi:${category(cat).color}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10],
});
const endIcon = (color: string, finish: boolean) => L.divIcon({
  className: '', html: `<span class="map-end${finish ? ' finish' : ''}" style="--c:${color}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9],
});
const handleIcon = (color: string) => L.divIcon({
  className: '', html: `<span class="map-handle" style="--c:${color}"></span>`, iconSize: [26, 26], iconAnchor: [13, 13],
});

export interface MapMarker { id: string; point: Point; mode: Mode; title: string; subtitle?: string; onOpen?: () => void }

interface Props {
  waypoints?: Point[];
  mode?: Mode;
  pois?: Poi[];
  markers?: MapMarker[];
  activeMarkerId?: string | null;
  near?: { point: Point; radiusKm: number } | null;
  onMapClick?: (p: Point) => void;
  /** Редактор: точки шляху можна перетягувати. */
  onWaypointMove?: (index: number, p: Point) => void;
  onViewChange?: (center: Point) => void;
  layerToggle?: boolean;
  fullscreenToggle?: boolean;
  className?: string;
  children?: ReactNode;
  label?: string;
  fitKey?: string;
  /** Масштабування коліщатком (редактор); на звичайних сторінках коліщатко прокручує сторінку. */
  wheelZoom?: boolean;
}

/** Підлаштовує вигляд під дані: при першій їх появі або коли змінюється fitKey (наприклад, нові результати пошуку). */
function FitBounds({ points, fitKey }: { points: Point[]; fitKey?: string }) {
  const map = useMap();
  const key = fitKey ?? String(points.length > 0);
  const latest = useRef(points);
  latest.current = points;
  useEffect(() => {
    const fit = () => {
      const pts = latest.current;
      if (map.getSize().x === 0) return; // прихована карта: підлаштуємо, коли стане видимою
      if (pts.length >= 2) map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lon] as [number, number])), { padding: [48, 48], maxZoom: 15 });
      else if (pts.length === 1) map.setView([pts[0].lat, pts[0].lon], 13);
    };
    fit();
    map.on('wr:shown', fit);
    return () => { map.off('wr:shown', fit); };
  }, [key, map]);
  return null;
}

function Events({ onClick, onMove }: { onClick?: (p: Point) => void; onMove?: (p: Point) => void }) {
  useMapEvents({
    click: (e) => onClick?.({ lat: +e.latlng.lat.toFixed(6), lon: +e.latlng.lng.toFixed(6) }),
    // лише перетягування користувачем: fitBounds після нових результатів не має вмикати «Шукати в цій області»
    dragend: (e) => { const c = e.target.getCenter(); onMove?.({ lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5) }); },
  });
  return null;
}

/**
 * Leaflet не помічає зміни розміру контейнера (перемикач «Список/Карта» на телефоні, повний екран, поворот екрана),
 * тому стежимо за ним через ResizeObserver і перераховуємо розмір карти.
 */
function SizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let frame = 0;
    let wasHidden = el.clientWidth === 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        map.invalidateSize();
        const hidden = el.clientWidth === 0;
        if (wasHidden && !hidden) map.fire('wr:shown');
        wasHidden = hidden;
      });
    });
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [map]);
  return null;
}

/** Карта OpenStreetMap у стилі «Стежка»: лінія кольором виду пересування, піни, точки інтересу, шари і повний екран. */
export function RouteMap({ waypoints = [], mode = 'WALK', pois = [], markers = [], activeMarkerId, near, onMapClick, onWaypointMove,
  onViewChange, layerToggle, fullscreenToggle, className = '', children, label = 'Карта', fitKey, wheelZoom = false }: Props) {
  const [layer, setLayer] = useState<keyof typeof LAYERS>('map');
  const [full, setFull] = useState(false);
  const [map, setMap] = useState<L.Map | null>(null);
  const color = MODES[mode].color;
  const line = useMemo(() => waypoints.map((p) => [p.lat, p.lon] as [number, number]), [waypoints]);
  const fitPoints = useMemo(() => [...waypoints, ...markers.map((m) => m.point), ...(near ? [near.point] : [])], [waypoints, markers, near]);

  // у повноекранному режимі коліщатко масштабує карту, на сторінці – прокручує сторінку
  useEffect(() => {
    if (!map || wheelZoom) return;
    if (full) map.scrollWheelZoom.enable(); else map.scrollWheelZoom.disable();
  }, [map, full, wheelZoom]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  }, [full]);

  const tiles = LAYERS[layer];
  return (
    <section className={`map-wrap ${className}${full ? ' fullscreen' : ''}`} aria-label={label}>
      <MapContainer center={DEFAULT_CENTER} zoom={11} className="map" zoomControl={false} attributionControl ref={setMap} scrollWheelZoom={wheelZoom}>
        <TileLayer key={layer} attribution={tiles.attribution} url={tiles.url} maxZoom={'maxZoom' in tiles ? tiles.maxZoom : 19} />
        <FitBounds points={fitPoints} fitKey={fitKey} />
        <SizeWatcher />
        <Events onClick={onMapClick} onMove={onViewChange} />
        {near && <Circle center={[near.point.lat, near.point.lon]} radius={near.radiusKm * 1000}
          pathOptions={{ color: '#1D5A42', weight: 2, dashArray: '6 6', fillColor: '#1D5A42', fillOpacity: 0.06 }} />}
        {line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#FFFFFF', weight: 10, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />}
        {line.length > 1 && <Polyline positions={line} pathOptions={{ color, weight: 5, lineCap: 'round', lineJoin: 'round' }} />}
        {!onWaypointMove && line.length > 0 && <Marker position={line[0]} icon={endIcon(color, false)} interactive={false} />}
        {!onWaypointMove && line.length > 1 && <Marker position={line[line.length - 1]} icon={endIcon(color, true)} interactive={false} />}
        {onWaypointMove && line.map((p, i) => (
          <Marker key={`${i}-${line.length}`} position={p} draggable icon={handleIcon(color)} title={`Точка ${i + 1}`}
            eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); onWaypointMove(i, { lat: +ll.lat.toFixed(6), lon: +ll.lng.toFixed(6) }); } }} />
        ))}
        {pois.map((p) => (
          <Marker key={p.id} position={[p.location.lat, p.location.lon]} icon={poiIcon(p.category)}>
            <Popup><b>{p.name}</b><br />{category(p.category).label}{p.description && <><br />{p.description}</>}</Popup>
          </Marker>
        ))}
        {markers.map((m) => (
          <Marker key={m.id} position={[m.point.lat, m.point.lon]} icon={pinIcon(MODES[m.mode].color, m.id === activeMarkerId)}
            zIndexOffset={m.id === activeMarkerId ? 1000 : 0}>
            <Popup>
              <div className="map-popup">
                <b>{m.title}</b>
                {m.subtitle && <span>{m.subtitle}</span>}
                {m.onOpen && <button type="button" className="link-btn" onClick={m.onOpen}>Відкрити маршрут →</button>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <ZoomButtons map={map} />
      <div className="map-tools">
        {layerToggle && (
          <div className="segmented small" role="group" aria-label="Шар карти">
            <button type="button" aria-pressed={layer === 'map'} onClick={() => setLayer('map')}>Карта</button>
            <button type="button" aria-pressed={layer === 'relief'} onClick={() => setLayer('relief')}>Рельєф</button>
          </div>
        )}
        {fullscreenToggle && (
          <button type="button" className="map-btn" aria-label={full ? 'Вийти з повноекранного режиму' : 'На весь екран'} onClick={() => setFull(!full)}>
            <Icon name={full ? 'collapse' : 'expand'} size={18} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** Кнопки масштабу поза контейнером Leaflet, щоб натискання не потрапляли на карту як клік. */
function ZoomButtons({ map }: { map: L.Map | null }) {
  return (
    <div className="map-zoom">
      <button type="button" aria-label="Наблизити" onClick={() => map?.zoomIn()}><Icon name="plus" size={18} /></button>
      <button type="button" aria-label="Віддалити" onClick={() => map?.zoomOut()}><span aria-hidden="true">−</span></button>
    </div>
  );
}
