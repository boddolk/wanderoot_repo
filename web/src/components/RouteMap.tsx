import { useEffect } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { CATEGORY_LABEL, Point, Poi } from '../api';

const DEFAULT_CENTER: [number, number] = [49.5535, 25.5948]; // Тернопіль

const poiIcon = (category: string) => L.divIcon({
  className: `poi-icon poi-${category.toLowerCase()}`,
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function FitBounds({ points }: { points: Point[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])), { padding: [30, 30] });
    else if (points.length === 1) map.setView([points[0].lat, points[0].lon], 14);
    // підлаштовуємо вигляд лише при першому показі маршруту
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length > 0]);
  return null;
}

function ClickHandler({ onClick }: { onClick: (p: Point) => void }) {
  useMapEvents({ click: (e) => onClick({ lat: +e.latlng.lat.toFixed(6), lon: +e.latlng.lng.toFixed(6) }) });
  return null;
}

interface Props {
  waypoints: Point[];
  pois?: Poi[];
  markers?: { id: string; point: Point; label: string; onClick?: () => void }[];
  onMapClick?: (p: Point) => void;
  height?: number;
}

/** Карта OpenStreetMap з лінією маршруту, точками шляху і точками інтересу. */
export function RouteMap({ waypoints, pois = [], markers = [], onMapClick, height = 420 }: Props) {
  const line = waypoints.map((p) => [p.lat, p.lon] as [number, number]);
  return (
    <MapContainer center={DEFAULT_CENTER} zoom={12} style={{ height }} className="map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBounds points={[...waypoints, ...markers.map((m) => m.point)]} />
      {onMapClick && <ClickHandler onClick={onMapClick} />}
      {line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#2f6f4e', weight: 5 }} />}
      {line.length > 0 && <CircleMarker center={line[0]} radius={7} pathOptions={{ color: '#2f6f4e', fillColor: '#ffffff', fillOpacity: 1 }} />}
      {line.length > 1 && <CircleMarker center={line[line.length - 1]} radius={7} pathOptions={{ color: '#2f6f4e', fillColor: '#2f6f4e', fillOpacity: 1 }} />}
      {pois.map((p) => (
        <Marker key={p.id} position={[p.location.lat, p.location.lon]} icon={poiIcon(p.category)}>
          <Popup><b>{p.name}</b><br />{CATEGORY_LABEL[p.category] ?? p.category}{p.description && <><br />{p.description}</>}</Popup>
        </Marker>
      ))}
      {markers.map((m) => (
        <CircleMarker key={m.id} center={[m.point.lat, m.point.lon]} radius={8} pathOptions={{ color: '#b5482b' }} eventHandlers={{ click: () => m.onClick?.() }}>
          <Popup>{m.label}</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
