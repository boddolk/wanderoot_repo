import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, CATEGORY_LABEL, Complaint, Notification, Poi, Role, RouteSummary, User } from '../api';
import { useAuth } from '../auth';
import { RouteCard } from './SearchPage';

export function LoginPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ login: '', email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'login') await login(f.login, f.password); else await register(f);
      navigate('/');
    } catch (err) { setError((err as Error).message); }
  };
  return (
    <form className="card form narrow" onSubmit={submit}>
      <h1>{mode === 'login' ? 'Вхід' : 'Реєстрація'}</h1>
      {error && <p className="error">{error}</p>}
      <label>Логін<input required value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} autoComplete="username" /></label>
      {mode === 'register' && <>
        <label>Email<input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Ім'я (необов'язково)<input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></label>
      </>}
      <label>Пароль<input required type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
      {mode === 'register' && <p className="hint">Не менше 8 символів, літера і цифра</p>}
      <button type="submit">{mode === 'login' ? 'Увійти' : 'Зареєструватися'}</button>
      <p className="muted">{mode === 'login' ? <>Немає облікового запису? <Link to="/register">Зареєструватися</Link></> : <>Уже зареєстровані? <Link to="/login">Увійти</Link></>}</p>
    </form>
  );
}

export function MyRoutesPage() {
  const [routes, setRoutes] = useState<RouteSummary[] | null>(null);
  useEffect(() => { api.mine().then(setRoutes).catch(() => setRoutes([])); }, []);
  return (
    <div>
      <div className="route-head"><h1>Мої маршрути</h1><Link className="button" to="/routes/new">+ Новий маршрут</Link></div>
      {routes?.length === 0 && <p className="muted">У вас ще немає маршрутів.</p>}
      <div className="grid">{routes?.map((r) => <RouteCard key={r.id} r={r} />)}</div>
    </div>
  );
}

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const load = () => api.notifications().then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  return (
    <div className="narrow-wide">
      <h1>Сповіщення</h1>
      {items.length === 0 && <p className="muted">Сповіщень немає.</p>}
      {items.map((n) => (
        <div key={n.id} className={`card notification ${n.read ? 'read' : ''}`}>
          <span>{n.message}</span>
          <span className="muted">{new Date(n.createdAt).toLocaleString('uk-UA')}</span>
          {n.link && <Link to={n.link}>відкрити</Link>}
          {!n.read && <button className="link" onClick={() => api.readNotification(n.id).then(load)}>прочитано</button>}
        </div>
      ))}
    </div>
  );
}

const DECISIONS = [['HIDE_CONTENT', 'Приховати контент'], ['BLOCK_USER', 'Заблокувати автора'], ['REJECT', 'Відхилити скаргу']] as const;

export function ModerationPage() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [pois, setPois] = useState<{ routeId: string; routeTitle: string; poi: Poi }[]>([]);
  const [error, setError] = useState('');
  const load = () => {
    api.complaints().then(setComplaints).catch((e) => setError(e.message));
    api.pendingPois().then(setPois).catch(() => setPois([]));
  };
  useEffect(load, []);
  const act = (p: Promise<unknown>) => p.then(load).catch((e) => setError(e.message));
  return (
    <div>
      <h1>Модерація</h1>
      {error && <p className="error">{error}</p>}
      <h2>Відкриті скарги ({complaints.length})</h2>
      <table className="table">
        <thead><tr><th>Дата</th><th>Об'єкт</th><th>Причина</th><th>Опис</th><th>Рішення</th></tr></thead>
        <tbody>{complaints.map((c) => (
          <tr key={c.id}>
            <td>{new Date(c.createdAt).toLocaleDateString('uk-UA')}</td>
            <td>{c.targetType === 'ROUTE' ? <Link to={`/routes/${c.targetId}`}>маршрут</Link> : c.targetType === 'COMMENT' ? 'коментар' : 'користувач'}</td>
            <td>{c.reason}</td><td>{c.description}</td>
            <td>{DECISIONS.filter(([d]) => (d !== 'BLOCK_USER' || user?.role === 'ADMIN') && (d !== 'HIDE_CONTENT' || c.targetType !== 'USER')).map(([d, label]) => (
              <button key={d} className={d === 'REJECT' ? 'secondary' : ''} onClick={() => act(api.resolve(c.id, d, d === 'HIDE_CONTENT' ? window.prompt('Причина приховування', 'Порушення правил спільноти') ?? '' : ''))}>{label}</button>
            ))}</td>
          </tr>))}</tbody>
      </table>
      <h2>Запропоновані точки інтересу ({pois.length})</h2>
      <table className="table">
        <thead><tr><th>Точка</th><th>Категорія</th><th>Маршрут</th><th>Рішення</th></tr></thead>
        <tbody>{pois.map((p) => (
          <tr key={p.poi.id}>
            <td><b>{p.poi.name}</b> {p.poi.description}</td><td>{CATEGORY_LABEL[p.poi.category]}</td>
            <td><Link to={`/routes/${p.routeId}`}>{p.routeTitle}</Link></td>
            <td><button onClick={() => act(api.reviewPoi(p.routeId, p.poi.id, true))}>Затвердити</button>
              <button className="secondary" onClick={() => act(api.reviewPoi(p.routeId, p.poi.id, false))}>Відхилити</button></td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const load = () => api.users().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const act = (p: Promise<unknown>) => p.then(load).catch((e) => setError(e.message));
  return (
    <div>
      <h1>Користувачі</h1>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead><tr><th>Логін</th><th>Ім'я</th><th>Email</th><th>Роль</th><th>Статус</th><th></th></tr></thead>
        <tbody>{users.map((u) => (
          <tr key={u.id}>
            <td>{u.login}</td><td>{u.displayName}</td><td>{u.email}</td>
            <td><select value={u.role} onChange={(e) => act(api.setRole(u.id, e.target.value as Role))}>
              <option value="USER">Користувач</option><option value="MODERATOR">Модератор</option><option value="ADMIN">Адміністратор</option></select></td>
            <td>{u.status === 'ACTIVE' ? 'активний' : 'заблокований'}</td>
            <td><button className="secondary" onClick={() => act(api.setBlocked(u.id, u.status === 'ACTIVE'))}>{u.status === 'ACTIVE' ? 'Заблокувати' : 'Розблокувати'}</button></td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}
