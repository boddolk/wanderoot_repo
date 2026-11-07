import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, CATEGORY_LABEL, CommentView, formatDuration, MODE_LABEL, Route } from '../api';
import { isModerator, useAuth } from '../auth';
import { RouteMap } from '../components/RouteMap';

const REASONS: Record<string, string> = { SPAM: 'Спам', OFFENSIVE: 'Образливий вміст', WRONG_DATA: 'Неправдиві дані', OTHER: 'Інше' };

export function RoutePage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [route, setRoute] = useState<Route | null>(null);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api.route(id).then(setRoute).catch((e) => setError(e.message));
    api.comments(id).then(setComments).catch(() => setComments([]));
    if (user) api.myRating(id).then((r) => setMyRating(r.value)).catch(() => undefined);
  };
  useEffect(load, [id, user]);

  const run = (action: Promise<unknown>, ok: string) => action.then(() => { setMessage(ok); setError(''); load(); }).catch((e) => setError(e.message));
  const rate = (v: number) => run(api.rate(id, v), 'Дякуємо за оцінку!');
  const comment = (e: FormEvent) => { e.preventDefault(); run(api.addComment(id, text).then(() => setText('')), 'Коментар додано'); };
  const complain = (targetType: string, targetId: string) => {
    const reason = window.prompt(`Причина скарги (${Object.keys(REASONS).join(', ')}):`, 'WRONG_DATA');
    if (reason && REASONS[reason]) run(api.complain({ targetType, targetId, reason }), 'Скаргу надіслано модераторам');
  };
  const openNavigator = () => api.navigationLink(id).then((r) => window.open(r.url, '_blank')).catch((e) => setError(e.message));

  if (error && !route) return <p className="error">{error}</p>;
  if (!route) return <p>Завантаження…</p>;
  const isOwner = user?.id === route.ownerId;

  return (
    <div className="route-page">
      <div className="route-head">
        <div>
          <h1>{route.title}</h1>
          <div className="meta">
            <span className={`badge mode-${route.mode.toLowerCase()}`}>{MODE_LABEL[route.mode]}</span>
            <span>{route.lengthKm.toFixed(2)} км</span>
            <span>≈ {formatDuration(route.durationMin)}</span>
            <span>★ {route.ratingAvg ? route.ratingAvg.toFixed(1) : '–'} ({route.ratingCount})</span>
            {route.status !== 'PUBLISHED' && <span className="badge status">{route.status === 'DRAFT' ? 'Чернетка' : 'Приховано'}</span>}
          </div>
        </div>
        <div className="actions">
          {isOwner && <Link className="button" to={`/routes/${route.id}/edit`}>Редагувати</Link>}
          {isModerator(user) && route.status === 'HIDDEN' && <button onClick={() => run(api.restoreRoute(route.id), 'Маршрут відновлено')}>Відновити</button>}
        </div>
      </div>
      {route.hiddenReason && <p className="warning">Приховано модератором: {route.hiddenReason}</p>}
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <RouteMap waypoints={route.waypoints} pois={route.pois} />

      <div className="columns">
        <section className="card">
          <h2>Опис</h2>
          <p className="description">{route.description || 'Опис відсутній.'}</p>
          {route.tags.length > 0 && <div className="tags">{route.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>}
          <h3>Точки інтересу</h3>
          {route.pois.length === 0 ? <p className="muted">Немає</p> : (
            <ul className="poi-list">{route.pois.map((p) => <li key={p.id}><span className={`dot poi-${p.category.toLowerCase()}`} /> <b>{p.name}</b> – {CATEGORY_LABEL[p.category]}{p.description && `: ${p.description}`}</li>)}</ul>
          )}
          <h3>Експорт</h3>
          <div className="row">
            {['gpx', 'kml', 'geojson'].map((f) => <a key={f} className="button secondary" href={api.exportUrl(route.id, f)}>{f.toUpperCase()}</a>)}
            <button className="secondary" onClick={openNavigator}>Відкрити в Google Maps</button>
          </div>
        </section>

        <section className="card">
          <h2>Відгуки</h2>
          {user && !isOwner && route.status === 'PUBLISHED' && (
            <div className="stars">Ваша оцінка:{' '}
              {[1, 2, 3, 4, 5].map((v) => <button key={v} className={`star ${myRating && v <= myRating ? 'on' : ''}`} onClick={() => rate(v)}>★</button>)}
            </div>
          )}
          {comments.length === 0 && <p className="muted">Коментарів ще немає.</p>}
          {comments.map((c) => (
            <div key={c.id} className={`comment ${c.status === 'HIDDEN' ? 'hidden' : ''}`}>
              <div className="comment-head"><b>{c.authorName}</b> <span className="muted">{new Date(c.createdAt).toLocaleString('uk-UA')}</span>
                {user && user.id !== c.authorId && <button className="link" onClick={() => complain('COMMENT', c.id)}>поскаржитися</button>}</div>
              <p>{c.text}</p>
            </div>
          ))}
          {user && route.status === 'PUBLISHED' ? (
            <form onSubmit={comment} className="comment-form">
              <textarea value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Поділіться враженнями або порадою" />
              <button type="submit" disabled={!text.trim()}>Надіслати</button>
            </form>
          ) : !user && <p className="muted"><Link to="/login">Увійдіть</Link>, щоб оцінити маршрут і залишити коментар.</p>}
          {user && !isOwner && <button className="link" onClick={() => complain('ROUTE', route.id)}>Поскаржитися на маршрут</button>}
        </section>
      </div>
    </div>
  );
}
