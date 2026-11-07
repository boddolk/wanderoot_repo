import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Notification } from '../api';
import { EmptyState, Loading } from '../components/common';
import { Icon, IconName } from '../components/Icon';
import { errorText, useToast } from '../components/Toast';
import { relativeTime } from '../ui';

const TYPES: Record<string, { label: string; icon: IconName; tone: string }> = {
  COMMENT: { label: 'Коментар', icon: 'comment', tone: 'green' },
  RATING: { label: 'Оцінка', icon: 'route', tone: 'amber' },
  MODERATION: { label: 'Модерація', icon: 'shield', tone: 'clay' },
  COMPLAINT: { label: 'Скарга', icon: 'flag', tone: 'clay' },
  POI: { label: 'Точка інтересу', icon: 'check', tone: 'green' },
  ROLE: { label: 'Роль', icon: 'user', tone: 'blue' },
  SECURITY: { label: 'Безпека', icon: 'shield', tone: 'blue' },
};
const typeOf = (t: string) => TYPES[t] ?? { label: 'Сповіщення', icon: 'bell' as IconName, tone: 'green' };

function Item({ n, onRead }: { n: Notification; onRead: (id: string) => void }) {
  const t = typeOf(n.type);
  return (
    <li className={`notice${n.read ? '' : ' unread'}`}>
      <span className={`icon-tile tone-${t.tone}`}>{n.type === 'RATING' ? <span aria-hidden="true" className="star-glyph">★</span> : <Icon name={t.icon} />}</span>
      <div className="notice-body">
        <p>{n.message}</p>
        <span className="muted small">{t.label} · {relativeTime(n.createdAt)}</span>
        {(n.link || !n.read) && (
          <div className="notice-actions">
            {n.link && <Link to={n.link} onClick={() => !n.read && onRead(n.id)}>{n.link.startsWith('/routes/') ? 'Відкрити маршрут' : 'Відкрити'}</Link>}
            {!n.read && <button type="button" className="link-btn muted-link" onClick={() => onRead(n.id)}>Позначити прочитаним</button>}
          </div>
        )}
      </div>
      {!n.read && <span className="unread-dot" aria-label="Непрочитане" />}
    </li>
  );
}

/** Сповіщення, згруповані на нові й прочитані, з іконкою за типом події. */
export function NotificationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.notifications().then(setItems).catch((e) => { toast.error(e.message); setItems([]); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const read = (id: string) => {
    setItems((all) => all?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? null);
    api.readNotification(id).catch((e) => { toast.error(errorText(e)); load(); });
  };
  const readAll = async () => {
    setBusy(true);
    try { await Promise.all((items ?? []).filter((n) => !n.read).map((n) => api.readNotification(n.id))); await load(); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };

  if (!items) return <Loading />;
  const unread = items.filter((n) => !n.read);
  const earlier = items.filter((n) => n.read);

  return (
    <div className="container narrow page-pad notifications">
      <div className="page-head">
        <h1 className="h1">Сповіщення</h1>
        <div className="segmented small" role="tablist" aria-label="Фільтр сповіщень">
          <button type="button" role="tab" aria-selected={!onlyUnread} onClick={() => setOnlyUnread(false)}>Усі</button>
          <button type="button" role="tab" aria-selected={onlyUnread} onClick={() => setOnlyUnread(true)}>Непрочитані · {unread.length}</button>
        </div>
      </div>

      {items.length === 0 && <EmptyState icon="bell" title="Сповіщень поки немає" text="Тут з'являтимуться коментарі й оцінки ваших маршрутів, рішення модераторів та повідомлення безпеки." />}

      {unread.length > 0 && (
        <section>
          <div className="group-head"><h2>Нові</h2><button type="button" className="link-btn" disabled={busy} onClick={readAll}>Позначити всі прочитаними</button></div>
          <ul className="notice-list">{unread.map((n) => <Item key={n.id} n={n} onRead={read} />)}</ul>
        </section>
      )}
      {onlyUnread && unread.length === 0 && items.length > 0 && <EmptyState icon="check" title="Усе прочитано" />}
      {!onlyUnread && earlier.length > 0 && (
        <section>
          <div className="group-head"><h2>Раніше</h2></div>
          <ul className="notice-list">{earlier.map((n) => <Item key={n.id} n={n} onRead={read} />)}</ul>
        </section>
      )}
      {!onlyUnread && items.length > 0 && <p className="list-end"><Icon name="check" size={18} />Це всі сповіщення</p>}
    </div>
  );
}
