import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatDuration, MODE_LABEL, Mode, Page, Point, RouteSummary } from '../api';
import { RouteMap } from '../components/RouteMap';

export function RouteCard({ r }: { r: RouteSummary }) {
  return (
    <Link to={`/routes/${r.id}`} className="card route-card">
      <h3>{r.title}</h3>
      <div className="meta">
        <span className={`badge mode-${r.mode.toLowerCase()}`}>{MODE_LABEL[r.mode]}</span>
        <span>{r.lengthKm.toFixed(1)} км</span>
        <span>{formatDuration(r.durationMin)}</span>
        <span>★ {r.ratingAvg ? r.ratingAvg.toFixed(1) : '–'} ({r.ratingCount})</span>
      </div>
      {r.tags.length > 0 && <div className="tags">{r.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>}
    </Link>
  );
}

export function SearchPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ q: '', mode: '', tag: '', minRating: '', sort: 'newest' });
  const [near, setNear] = useState<Point | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<RouteSummary> | null>(null);
  const [error, setError] = useState('');

  const load = (p = page) => {
    setError('');
    api.search({ ...filters, page: p, pageSize: 12, ...(near ? { lat: near.lat, lon: near.lon, radiusKm } : {}) })
      .then(setData).catch((e) => setError(e.message));
  };
  useEffect(() => { load(page); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, near, radiusKm]);

  const submit = (e: FormEvent) => { e.preventDefault(); setPage(1); load(1); };
  const locate = () => navigator.geolocation?.getCurrentPosition(
    (pos) => setNear({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => setError('Не вдалося визначити місцезнаходження'),
  );

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="search-page">
      <form className="filters card" onSubmit={submit}>
        <input placeholder="Назва, опис або тег" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.mode} onChange={(e) => setFilters({ ...filters, mode: e.target.value })}>
          <option value="">Усі види пересування</option>
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
        </select>
        <input placeholder="Тег" value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })} />
        <select value={filters.minRating} onChange={(e) => setFilters({ ...filters, minRating: e.target.value })}>
          <option value="">Будь-який рейтинг</option>
          {[3, 4, 4.5].map((v) => <option key={v} value={v}>від {v} ★</option>)}
        </select>
        <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
          <option value="newest">Спочатку нові</option>
          <option value="rating">За рейтингом</option>
          <option value="length">Спочатку короткі</option>
        </select>
        <button type="submit">Шукати</button>
        <div className="near">
          {near ? (
            <>Поруч: <input type="number" min={1} max={500} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value) || 25)} /> км
              <button type="button" className="link" onClick={() => setNear(null)}>скинути</button></>
          ) : <button type="button" className="secondary" onClick={locate}>Біля мене</button>}
          <span className="hint">або клацніть на карті</span>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="split">
        <div className="list">
          <p className="muted">Знайдено маршрутів: {data?.total ?? 0}</p>
          {data?.items.map((r) => <RouteCard key={r.id} r={r} />)}
          {pages > 1 && (
            <div className="pager">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
              <span>{page} / {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
            </div>
          )}
        </div>
        <RouteMap
          waypoints={near ? [near] : []}
          markers={(data?.items ?? []).filter((r) => r.start).map((r) => ({ id: r.id, point: r.start!, label: r.title, onClick: () => navigate(`/routes/${r.id}`) }))}
          onMapClick={(p) => { setNear(p); setPage(1); }}
          height={560}
        />
      </div>
    </div>
  );
}
