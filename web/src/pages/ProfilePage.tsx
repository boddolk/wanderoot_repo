import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ROLE_LABEL, User, UserActivity } from '../api';
import { initials, useAuth } from '../auth';

const BIO_MAX = 500;

/** Перевірки, які показуються під полем нового пароля (ті самі правила, що й на сервері). */
const PASSWORD_RULES: [string, (p: string) => boolean][] = [
  ['не менше 8 символів', (p) => p.length >= 8],
  ['містить літеру', (p) => /[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(p)],
  ['містить цифру', (p) => /\d/.test(p)],
];

function Stat({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

function PersonalForm({ user, onSaved }: { user: User; onSaved: (u: User) => void }) {
  const [f, setF] = useState({ displayName: user.displayName, email: user.email, city: user.city, bio: user.bio, currentPassword: '' });
  const [status, setStatus] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  const emailChanged = f.email.trim().toLowerCase() !== user.email;
  const dirty = emailChanged || f.displayName !== user.displayName || f.city !== user.city || f.bio !== user.bio;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await api.updateProfile({
        displayName: f.displayName, city: f.city, bio: f.bio,
        ...(emailChanged ? { email: f.email, currentPassword: f.currentPassword } : {}),
      });
      onSaved(u);
      setF({ displayName: u.displayName, email: u.email, city: u.city, bio: u.bio, currentPassword: '' });
      setStatus({ ok: 'Профіль оновлено' });
    } catch (err) { setStatus({ error: (err as Error).message }); } finally { setBusy(false); }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Особисті дані</h2>
      {status.ok && <p className="success">{status.ok}</p>}
      {status.error && <p className="error">{status.error}</p>}
      <label>Логін<input value={user.login} disabled /><span className="hint">Логін використовується для входу і не змінюється</span></label>
      <label>Ім'я, яке бачать інші<input maxLength={60} value={f.displayName} placeholder={user.login} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></label>
      <label>Місто або регіон<input maxLength={60} value={f.city} placeholder="Наприклад, Тернопіль" onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
      <label>Про себе
        <textarea maxLength={BIO_MAX} value={f.bio} placeholder="Які маршрути ви любите, де вже побували…" onChange={(e) => setF({ ...f, bio: e.target.value })} />
        <span className="hint counter">{f.bio.length} / {BIO_MAX}</span>
      </label>
      <label>Email<input type="email" required value={f.email} autoComplete="email" onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      {emailChanged && (
        <label>Поточний пароль для підтвердження зміни email
          <input type="password" required value={f.currentPassword} autoComplete="current-password" onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></label>
      )}
      <div className="row">
        <button type="submit" disabled={!dirty || busy}>{busy ? 'Збереження…' : 'Зберегти зміни'}</button>
        <button type="button" className="secondary" disabled={!dirty || busy}
          onClick={() => { setF({ displayName: user.displayName, email: user.email, city: user.city, bio: user.bio, currentPassword: '' }); setStatus({}); }}>Скасувати</button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const { acceptSession } = useAuth();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  const rulesOk = PASSWORD_RULES.every(([, test]) => test(f.next));
  const mismatch = f.confirm.length > 0 && f.confirm !== f.next;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.next !== f.confirm) { setStatus({ error: 'Новий пароль і підтвердження не збігаються' }); return; }
    setBusy(true);
    try {
      acceptSession(await api.changePassword(f.current, f.next));
      setF({ current: '', next: '', confirm: '' });
      setStatus({ ok: 'Пароль змінено. На інших пристроях потрібно буде увійти знову' });
    } catch (err) { setStatus({ error: (err as Error).message }); } finally { setBusy(false); }
  };

  const type = show ? 'text' : 'password';
  return (
    <form className="card form" onSubmit={submit}>
      <h2>Безпека</h2>
      <p className="muted">Після зміни пароля всі інші сесії буде завершено.</p>
      {status.ok && <p className="success">{status.ok}</p>}
      {status.error && <p className="error">{status.error}</p>}
      <label>Поточний пароль<input type={type} required value={f.current} autoComplete="current-password" onChange={(e) => setF({ ...f, current: e.target.value })} /></label>
      <label>Новий пароль<input type={type} required value={f.next} autoComplete="new-password" onChange={(e) => setF({ ...f, next: e.target.value })} /></label>
      <ul className="rules">
        {PASSWORD_RULES.map(([label, test]) => <li key={label} className={test(f.next) ? 'ok' : ''}>{test(f.next) ? '✓' : '•'} {label}</li>)}
      </ul>
      <label>Повторіть новий пароль<input type={type} required value={f.confirm} autoComplete="new-password" onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        {mismatch && <span className="error hint">Паролі не збігаються</span>}</label>
      <label className="checkbox"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Показати паролі</label>
      <button type="submit" disabled={busy || !f.current || !rulesOk || f.next !== f.confirm}>{busy ? 'Зміна…' : 'Змінити пароль'}</button>
    </form>
  );
}

/** Сторінка власного профілю: картка користувача, активність, особисті дані та зміна пароля. */
export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.profile().then((p) => { setUser(p.user); setActivity(p.activity); }).catch((e) => setError(e.message));
    // завантажуємо один раз при відкритті сторінки
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;
  const since = new Date(user.createdAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="profile-page">
      <section className="card profile-head">
        <div className="avatar large" aria-hidden>{initials(user.displayName)}</div>
        <div className="profile-info">
          <h1>{user.displayName}</h1>
          <div className="meta">
            <span>@{user.login}</span>
            <span className={`badge role-${user.role.toLowerCase()}`}>{ROLE_LABEL[user.role]}</span>
            {user.city && <span>📍 {user.city}</span>}
            <span>з нами з {since}</span>
          </div>
          {user.bio ? <p className="bio">{user.bio}</p> : <p className="muted">Розкажіть про себе – це побачать інші мандрівники.</p>}
        </div>
        <div className="actions">
          <Link className="button secondary" to="/mine">Мої маршрути</Link>
          <button className="secondary" onClick={logout}>Вийти</button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}
      {activity && (
        <section className="stats">
          <Stat value={activity.routesTotal} label="маршрутів" hint={`${activity.routesPublished} опубл. · ${activity.routesDraft} черн.`} />
          <Stat value={`${activity.publishedKm} км`} label="опубліковано" />
          <Stat value={activity.ratingsReceived ? `★ ${activity.ratingAvgReceived.toFixed(1)}` : '–'} label="середня оцінка" hint={`${activity.ratingsReceived} оцінок`} />
          <Stat value={activity.commentsWritten} label="коментарів" />
          <Stat value={activity.ratingsGiven} label="оцінок поставлено" />
        </section>
      )}

      <div className="columns">
        <PersonalForm key={user.id} user={user} onSaved={setUser} />
        <PasswordForm />
      </div>
    </div>
  );
}
