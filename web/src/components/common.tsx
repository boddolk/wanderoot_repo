// Дрібні спільні елементи інтерфейсу: аватар, чипи, мініатюра треку, картки маршрутів.
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Mode, RouteStatus, RouteSummary } from '../api';
import { initials } from '../auth';
import { avatarColor, duration, km, MODES, plural, rating, STATUS_LABEL } from '../ui';
import { Icon, IconName, Star } from './Icon';

export function Avatar({ name, seed, size = 40, className = '' }: { name: string; seed?: string; size?: number; className?: string }) {
  return (
    <span className={`avatar ${className}`} aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: avatarColor(seed ?? name) }}>
      {initials(name)}
    </span>
  );
}

export function ModeChip({ mode }: { mode: Mode }) {
  const m = MODES[mode];
  return <span className="chip-mode" style={{ background: m.tint, color: m.ink }}>{m.label}</span>;
}

export function StatusPill({ status, onImage = false }: { status: RouteStatus; onImage?: boolean }) {
  return <span className={`status-pill status-${status.toLowerCase()}${onImage ? ' on-image' : ''}`}><span className="dot" />{STATUS_LABEL[status]}</span>;
}

export function RatingInline({ avg, count }: { avg: number; count: number }) {
  return <span className="rating-inline"><Star size={15} /><b>{rating(avg)}</b><span className="muted">({count})</span></span>;
}

/**
 * Мініатюра треку: точки маршруту проєктуються у прямокутник (з поправкою на широту),
 * лінія – кольором виду пересування, старт – біле коло, фініш – заповнене.
 */
export function RouteThumb({ points, mode, width = 112, height = 96, className = '', dashed = false }:
  { points: [number, number][]; mode: Mode; width?: number; height?: number; className?: string; dashed?: boolean }) {
  const color = MODES[mode].color;
  const pad = 14;
  let path = '';
  let start: [number, number] | null = null;
  let end: [number, number] | null = null;
  if (points.length > 0) {
    const k = Math.cos((points[0][0] * Math.PI) / 180);
    const xs = points.map(([, lon]) => lon * k), ys = points.map(([lat]) => -lat);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const scale = Math.min((width - pad * 2) / span, (height - pad * 2) / span);
    const offX = (width - (maxX - minX) * scale) / 2, offY = (height - (maxY - minY) * scale) / 2;
    const proj = xs.map((x, i) => [offX + (x - minX) * scale, offY + (ys[i] - minY) * scale] as [number, number]);
    path = proj.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    start = proj[0];
    end = proj.length > 1 ? proj[proj.length - 1] : null;
  }
  return (
    <svg className={`route-thumb ${className}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <rect width={width} height={height} fill="#E6EEE3" />
      <path d={`M0 ${height * 0.3}c${width * 0.25} ${height * 0.08} ${width * 0.45}-${height * 0.08} ${width * 0.7} 0s${width * 0.2} ${height * 0.05} ${width * 0.3}-${height * 0.02}M0 ${height * 0.7}c${width * 0.3} ${height * 0.06} ${width * 0.5}-${height * 0.06} ${width * 0.75} 0s${width * 0.15} ${height * 0.04} ${width * 0.25}-${height * 0.02}`}
        stroke="#D3DED0" strokeWidth="1.5" fill="none" />
      {path && <path d={path} stroke="#FFFFFF" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {path && <path d={path} stroke={color} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? '8 6' : undefined} />}
      {start && <circle cx={start[0]} cy={start[1]} r="5" fill="#FFFFFF" stroke={color} strokeWidth="3" />}
      {end && <circle cx={end[0]} cy={end[1]} r="5" fill={color} />}
    </svg>
  );
}

/** Горизонтальна картка маршруту для результатів пошуку. */
export function RouteCard({ r, active = false, onHover }: { r: RouteSummary; active?: boolean; onHover?: (id: string | null) => void }) {
  return (
    <Link to={`/routes/${r.id}`} className={`route-card${active ? ' active' : ''}`}
      onMouseEnter={() => onHover?.(r.id)} onMouseLeave={() => onHover?.(null)}>
      <RouteThumb points={r.preview} mode={r.mode} />
      <div className="route-card-body">
        <h3>{r.title}</h3>
        <div className="meta">
          <ModeChip mode={r.mode} />
          <span>{km(r.lengthKm)}</span>
          <span>≈ {duration(r.durationMin)}</span>
          <RatingInline avg={r.ratingAvg} count={r.ratingCount} />
        </div>
        {r.tags.length > 0 && <div className="tags">{r.tags.map((t) => <span key={t}>#{t}</span>)}</div>}
      </div>
    </Link>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <b className="stat-value">{value}</b>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export const ratingsWord = (n: number) => `${n} ${plural(n, ['оцінка', 'оцінки', 'оцінок'])}`;

/** Заглушка під час завантаження (скелет), щоб сторінка не «стрибала». */
export function Loading({ label = 'Завантаження…' }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}
