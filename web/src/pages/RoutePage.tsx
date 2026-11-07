import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, CommentView, RatingSummary, Route, tokenStore } from '../api';
import { isModerator, useAuth } from '../auth';
import { Avatar, EmptyState, Loading, ModeChip, ratingsWord, StatTile, StatusPill } from '../components/common';
import { Dialog } from '../components/Dialog';
import { CATEGORY_ICON, Icon, Star } from '../components/Icon';
import { RouteMap } from '../components/RouteMap';
import { errorText, useToast } from '../components/Toast';
import { category, duration, km, MODES, rating, REASONS, relativeTime } from '../ui';

type ComplaintTarget = { type: 'ROUTE' | 'COMMENT'; id: string; label: string };

export function RoutePage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [route, setRoute] = useState<Route | null>(null);
  const [notFound, setNotFound] = useState('');
  const [comments, setComments] = useState<CommentView[]>([]);
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [hoverStar, setHoverStar] = useState(0);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [complaint, setComplaint] = useState<ComplaintTarget | null>(null);

  const load = useCallback(() => {
    api.route(id).then((r) => { setRoute(r); setNotFound(''); }).catch((e) => setNotFound(e.message));
    api.comments(id).then(setComments).catch(() => setComments([]));
    api.ratingSummary(id).then(setSummary).catch(() => setSummary(null));
    if (user) api.myRating(id).then((r) => setMyRating(r.value)).catch(() => undefined);
  }, [id, user]);
  useEffect(load, [load]);

  if (notFound && !route) {
    return <div className="container page-pad"><EmptyState icon="map" title="Маршрут недоступний" text={notFound}
      action={<Link to="/" className="btn btn-primary">До пошуку маршрутів</Link>} /></div>;
  }
  if (!route) return <Loading label="Завантажуємо маршрут…" />;

  const isOwner = user?.id === route.ownerId;
  const canReview = !!user && !isOwner && route.status === 'PUBLISHED';
  const start = route.waypoints[0];
  const finish = route.waypoints.length > 1 ? route.waypoints[route.waypoints.length - 1] : null;

  const rate = async (v: number) => {
    try { await api.rate(id, v); setMyRating(v); toast.success('Дякуємо за оцінку!'); load(); } catch (e) { toast.error(errorText(e)); }
  };
  const comment = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    try { await api.addComment(id, text); setText(''); toast.success('Коментар додано'); load(); } catch (err) { toast.error(errorText(err)); } finally { setSending(false); }
  };
  const openNavigator = () => api.navigationLink(id).then((r) => window.open(r.url, '_blank', 'noopener')).catch((e) => toast.error(e.message));
  /** Експорт через fetch з токеном: так працює і для власних чернеток, які гостю недоступні. */
  const download = async (format: string) => {
    try {
      const token = tokenStore.get();
      const res = await fetch(api.exportUrl(route.id, format), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Не вдалося експортувати маршрут');
      const name = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('content-disposition') ?? '')?.[1];
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = name ? decodeURIComponent(name) : `route.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error(errorText(e)); }
  };
  const restore = () => api.restoreRoute(route.id).then(() => { toast.success('Маршрут відновлено'); load(); }).catch((e) => toast.error(e.message));

  const maxBar = Math.max(1, ...(summary?.histogram ?? [0]));

  return (
    <div className="route-page container page-pad">
      <nav className="breadcrumbs" aria-label="Навігаційний ланцюжок">
        <Link to="/">Маршрути</Link><span aria-hidden="true">/</span>
        <Link to={`/?mode=${route.mode}`}>{MODES[route.mode].label}</Link><span aria-hidden="true">/</span>
        <span aria-current="page">{route.title}</span>
      </nav>

      {route.hiddenReason && (
        <div className="banner banner-warning" role="note">
          <Icon name="alert" />
          <span>Маршрут приховано модератором: <b>{route.hiddenReason}</b></span>
          {isModerator(user) && route.status === 'HIDDEN' && <button type="button" className="btn btn-secondary btn-sm" onClick={restore}>Відновити</button>}
        </div>
      )}

      <div className="route-hero">
        <RouteMap className="route-hero-map" label={`Карта маршруту «${route.title}»`} waypoints={route.waypoints} mode={route.mode} pois={route.pois} layerToggle fullscreenToggle />
        <div className="route-hero-card">
          <div className="row-wrap">
            <ModeChip mode={route.mode} />
            <StatusPill status={route.status} />
          </div>
          <h1>{route.title}</h1>
          {route.author && (
            <span className="author"><Avatar name={route.author.displayName} seed={route.author.id} size={30} />
              <span>Автор: <b>{route.author.displayName}</b>{route.author.city && ` · ${route.author.city}`}</span></span>
          )}
          {isOwner && <Link to={`/routes/${route.id}/edit`} className="btn btn-secondary btn-sm"><Icon name="edit" size={16} />Редагувати</Link>}
        </div>
      </div>

      <section className="route-stats" aria-label="Показники маршруту">
        <StatTile label="Довжина" value={km(route.lengthKm, true)} />
        <StatTile label="Орієнтовний час" value={`≈ ${duration(route.durationMin)}`} />
        <StatTile label="Рейтинг" value={<><span className="star-ink">★</span> {rating(route.ratingAvg)}</>} hint={ratingsWord(route.ratingCount)} />
        <StatTile label="Точок інтересу" value={route.pois.length} />
        <div className="route-actions">
          <button type="button" className="btn btn-primary btn-block" onClick={openNavigator} disabled={route.waypoints.length < 2}>
            <Icon name="navigation" size={18} />Вирушити з Google Maps
          </button>
          <div className="btn-group" role="group" aria-label="Експорт маршруту">
            {['gpx', 'kml', 'geojson'].map((f) => <button key={f} type="button" onClick={() => download(f)}>{f === 'geojson' ? 'GeoJSON' : f.toUpperCase()}</button>)}
          </div>
        </div>
      </section>

      <div className="route-columns">
        <section className="card card-pad">
          <h2 className="h2">Про маршрут</h2>
          <p className="description">{route.description || 'Автор ще не додав опис.'}</p>
          {route.tags.length > 0 && (
            <div className="tag-list">{route.tags.map((t) => <Link key={t} to={`/?tag=${encodeURIComponent(t)}`} className="tag-link">#{t}</Link>)}</div>
          )}

          <h2 className="h2 mt">Що побачите дорогою</h2>
          <ol className="timeline">
            {start && (
              <li><span className="tl-node tl-end" style={{ borderColor: MODES[route.mode].color, color: MODES[route.mode].ink }}>А</span>
                <div><b>Старт</b><span className="muted">{start.lat.toFixed(4)}, {start.lon.toFixed(4)}</span></div></li>
            )}
            {route.pois.map((p) => {
              const c = category(p.category);
              return (
                <li key={p.id}><span className="tl-node" style={{ background: c.color }}><Icon name={CATEGORY_ICON[p.category] ?? 'pin'} size={16} stroke={2.2} /></span>
                  <div>
                    <div className="row-wrap"><b className="tl-title">{p.name}</b><span className="chip-cat" style={{ background: c.tint, color: c.ink }}>{c.label}</span></div>
                    {p.description && <p>{p.description}</p>}
                  </div></li>
              );
            })}
            {finish && (
              <li><span className="tl-node tl-finish" style={{ background: MODES[route.mode].color }}>Б</span>
                <div><b>Фініш</b><span className="muted">{finish.lat.toFixed(4)}, {finish.lon.toFixed(4)}</span></div></li>
            )}
          </ol>
          {route.pois.length === 0 && <p className="muted">Точок інтересу на цьому маршруті ще немає.</p>}
        </section>

        <section className="card card-pad reviews" aria-labelledby="reviews-title">
          <h2 className="h2" id="reviews-title">Відгуки</h2>
          <div className="rating-summary">
            <div className="rating-big">
              <b>{rating(route.ratingAvg)}</b>
              <span className="stars-row" aria-hidden="true">{[1, 2, 3, 4, 5].map((v) => <Star key={v} size={18} color={v <= Math.round(route.ratingAvg) ? '#E39B2D' : '#DDE3DC'} />)}</span>
              <span className="muted">{ratingsWord(route.ratingCount)}</span>
            </div>
            {summary && (
              <div className="histogram" aria-label="Розподіл оцінок">
                {[5, 4, 3, 2, 1].map((v) => (
                  <div key={v} className="hist-row"><span>{v}</span>
                    <span className="hist-bar"><span style={{ width: `${(summary.histogram[v - 1] / maxBar) * 100}%` }} /></span>
                    <span>{summary.histogram[v - 1]}</span></div>
                ))}
              </div>
            )}
          </div>

          {canReview && (
            <div className="your-rating">
              <span>Ваша оцінка</span>
              <div className="star-input" role="radiogroup" aria-label="Ваша оцінка" onMouseLeave={() => setHoverStar(0)}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={myRating === v} aria-label={`${v} з 5`}
                    className={(hoverStar || myRating || 0) >= v ? 'on' : ''} onMouseEnter={() => setHoverStar(v)} onClick={() => rate(v)}>★</button>
                ))}
              </div>
            </div>
          )}

          <div className="comments">
            {comments.length === 0 && <p className="muted">Коментарів ще немає — будьте першим.</p>}
            {comments.map((c) => (
              <article key={c.id} className={`comment${c.status === 'HIDDEN' ? ' is-hidden' : ''}`}>
                <Avatar name={c.authorName} seed={c.authorId} size={40} />
                <div className="comment-body">
                  <div className="comment-head">
                    <b>{c.authorName}</b><span className="muted">{relativeTime(c.createdAt)}</span>
                    {c.status === 'HIDDEN' && <span className="status-pill status-hidden"><span className="dot" />Приховано</span>}
                    {user && user.id !== c.authorId && (
                      <button type="button" className="icon-btn icon-btn-sm" aria-label="Поскаржитися на коментар"
                        onClick={() => setComplaint({ type: 'COMMENT', id: c.id, label: `коментар користувача ${c.authorName}` })}><Icon name="flag" size={16} /></button>
                    )}
                  </div>
                  <p>{c.text}</p>
                </div>
              </article>
            ))}
          </div>

          {user && route.status === 'PUBLISHED' ? (
            <form className="comment-form" onSubmit={comment}>
              <label htmlFor="comment-text">Поділіться враженнями</label>
              <textarea id="comment-text" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Як пройшов маршрут, на що звернути увагу…" />
              <div className="comment-form-foot">
                {!isOwner ? <button type="button" className="link-btn muted-link" onClick={() => setComplaint({ type: 'ROUTE', id: route.id, label: `маршрут «${route.title}»` })}>Поскаржитися на маршрут</button> : <span />}
                <button type="submit" className="btn btn-primary" disabled={!text.trim() || sending}>{sending ? 'Надсилаємо…' : 'Надіслати'}</button>
              </div>
            </form>
          ) : !user && (
            <div className="login-prompt"><Link to="/login" state={{ from: location }} className="btn btn-secondary">Увійти</Link><span className="muted">щоб оцінити маршрут і залишити коментар</span></div>
          )}
        </section>
      </div>

      <ComplaintDialog target={complaint} onClose={() => setComplaint(null)} onSent={() => { setComplaint(null); toast.success('Скаргу надіслано модераторам'); }} />
    </div>
  );
}

function ComplaintDialog({ target, onClose, onSent }: { target: ComplaintTarget | null; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('WRONG_DATA');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (target) { setReason(target.type === 'COMMENT' ? 'OFFENSIVE' : 'WRONG_DATA'); setDescription(''); } }, [target]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    try { await api.complain({ targetType: target.type, targetId: target.id, reason, description }); onSent(); } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!target} title="Скарга" onClose={onClose}>
      <form className="form" onSubmit={send}>
        <p className="dialog-text">Скарга на {target?.label}. Оберіть причину — модератори розглянуть скаргу й повідомлять про рішення.</p>
        <fieldset className="radio-list">
          <legend className="sr-only">Причина</legend>
          {Object.entries(REASONS).map(([k, v]) => (
            <label key={k} className={`radio-card${reason === k ? ' on' : ''}`}><input type="radio" name="reason" value={k} checked={reason === k} onChange={() => setReason(k)} />{v}</label>
          ))}
        </fieldset>
        <label className="field">Подробиці (необов'язково)
          <textarea value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} placeholder="Наприклад, частина стежки закрита" /></label>
        <div className="dialog-foot inline">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Надсилаємо…' : 'Надіслати скаргу'}</button>
        </div>
      </form>
    </Dialog>
  );
}
