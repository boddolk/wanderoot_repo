import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, RouteStatus, RouteSummary } from '../api';
import { EmptyState, Loading, RatingInline, RouteThumb, StatusPill } from '../components/common';
import { Icon } from '../components/Icon';
import { errorText, useToast } from '../components/Toast';
import { duration, km, MODES, plural } from '../ui';

const FILTERS: [RouteStatus | 'ALL', string][] = [['ALL', 'Усі'], ['PUBLISHED', 'Опубліковані'], ['DRAFT', 'Чернетки'], ['HIDDEN', 'Приховані']];
const EMPTY_TEXT: Record<string, string> = {
  PUBLISHED: 'Опубліковані маршрути з\'являються в пошуку для всіх мандрівників.',
  DRAFT: 'Чернетки бачите лише ви — тут з\'являтимуться незавершені маршрути.',
  HIDDEN: 'Маршрути, приховані модератором, з\'являться тут разом із причиною.',
};

/** Особистий список маршрутів: вкладки за статусом, картки з мініатюрою треку і діями. */
export function MyRoutesPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('status') ?? 'ALL') as RouteStatus | 'ALL';
  const [routes, setRoutes] = useState<RouteSummary[] | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);

  const load = () => api.mine().then(setRoutes).catch((e) => { toast.error(e.message); setRoutes([]); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const publish = async (r: RouteSummary) => {
    setPublishing(r.id);
    try { await api.publish(r.id); toast.success(`«${r.title}» опубліковано`); await load(); } catch (e) { toast.error(errorText(e)); } finally { setPublishing(null); }
  };

  const count = (s: RouteStatus | 'ALL') => (routes ?? []).filter((r) => s === 'ALL' || r.status === s).length;
  const visible = (routes ?? []).filter((r) => filter === 'ALL' || r.status === filter);

  return (
    <div className="container page-pad my-routes">
      <div className="page-head">
        <div><h1 className="h1">Мої маршрути</h1><p className="muted">Чернетки бачите лише ви. Опубліковані маршрути з'являються в пошуку.</p></div>
        <div className="row-wrap">
          <Link to="/routes/new" className="btn btn-secondary"><Icon name="upload" size={18} />Імпортувати файл</Link>
          <Link to="/routes/new" className="btn btn-primary"><Icon name="plus" size={18} stroke={2.2} />Новий маршрут</Link>
        </div>
      </div>

      <div className="chips scroll" role="tablist" aria-label="Фільтр за статусом">
        {FILTERS.map(([s, label]) => (
          <button key={s} type="button" role="tab" aria-selected={filter === s} className={`chip chip-count${filter === s ? ' dark' : ''}`}
            onClick={() => setParams(s === 'ALL' ? {} : { status: s })}>{label}<span className="count">{count(s)}</span></button>
        ))}
      </div>

      {!routes ? <Loading /> : (
        <div className="route-grid">
          {visible.map((r) => (
            <article key={r.id} className={`route-tile${r.status === 'DRAFT' ? ' draft' : ''}`}>
              <Link to={`/routes/${r.id}`} className="route-tile-media" tabIndex={-1} aria-hidden="true">
                <RouteThumb points={r.preview} mode={r.mode} width={400} height={170} dashed={r.status === 'DRAFT'} />
                <span className="tile-badges"><StatusPill status={r.status} onImage />
                  {!!r.pendingPois && <span className="pending-badge">{r.pendingPois} {plural(r.pendingPois, ['точка', 'точки', 'точок'])} на розгляді</span>}</span>
              </Link>
              <div className="route-tile-body">
                <h3><Link to={`/routes/${r.id}`}>{r.title}</Link></h3>
                <span className="muted">{MODES[r.mode].label} · {km(r.lengthKm)} · ≈ {duration(r.durationMin)} · {r.ratingCount ? <RatingInline avg={r.ratingAvg} count={r.ratingCount} /> : 'ще без оцінок'}</span>
                <div className="tile-actions">
                  {r.status === 'DRAFT' ? <>
                    <Link to={`/routes/${r.id}/edit`} className="btn btn-soft">Продовжити</Link>
                    <button type="button" className="btn btn-primary" disabled={publishing === r.id || r.preview.length < 2} onClick={() => publish(r)}>Опублікувати</button>
                  </> : <>
                    <Link to={`/routes/${r.id}/edit`} className="btn btn-soft">Редагувати</Link>
                    <Link to={`/routes/${r.id}`} className="btn btn-secondary">Переглянути</Link>
                  </>}
                </div>
              </div>
            </article>
          ))}
          {filter === 'ALL' && (
            <Link to="/routes/new" className="route-tile new-tile">
              <span className="icon-tile big"><Icon name="plus" size={26} stroke={2.2} /></span>
              <b>Новий маршрут</b>
              <span className="muted">Прокладіть точки на карті або імпортуйте трек із навігатора</span>
            </Link>
          )}
          {filter !== 'ALL' && visible.length === 0 && <EmptyState icon="route" title="Тут поки порожньо" text={EMPTY_TEXT[filter]} />}
        </div>
      )}
    </div>
  );
}
