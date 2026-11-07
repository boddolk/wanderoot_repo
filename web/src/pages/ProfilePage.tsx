import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, RouteSummary, User, UserActivity } from '../api';
import { isModerator, useAuth } from '../auth';
import { Avatar, EmptyState, ratingsWord, RouteCard, StatTile } from '../components/common';
import { Icon } from '../components/Icon';
import { errorText, useToast } from '../components/Toast';
import { dateLong, km, plural, rating, ROLE_LABEL } from '../ui';

const BIO_MAX = 500;

/** Ті самі правила, що й на сервері; показуються під полем нового пароля. */
const PASSWORD_RULES: [string, (p: string) => boolean][] = [
  ['не менше 8 символів', (p) => p.length >= 8],
  ['містить літеру', (p) => /[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(p)],
  ['містить цифру', (p) => /\d/.test(p)],
];

function PersonalForm({ user, onSaved }: { user: User; onSaved: (u: User) => void }) {
  const toast = useToast();
  const initial = { displayName: user.displayName, email: user.email, city: user.city, bio: user.bio, currentPassword: '' };
  const [f, setF] = useState(initial);
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
      toast.success('Профіль оновлено');
    } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  };

  return (
    <form className="card card-pad form" onSubmit={submit}>
      <div className="section-head"><h2 className="h2">Особисті дані</h2><span className="muted">Ім'я, місто та опис бачать інші мандрівники</span></div>
      <div className="field-row">
        <label className="field">Логін
          <input value={user.login} disabled /><span className="hint">Використовується для входу, не змінюється</span></label>
        <label className="field">Ім'я, яке бачать інші
          <input maxLength={60} value={f.displayName} placeholder={user.login} autoComplete="nickname" onChange={(e) => setF({ ...f, displayName: e.target.value })} /></label>
      </div>
      <label className="field">Місто або регіон
        <input maxLength={60} value={f.city} placeholder="Наприклад, Тернопіль" autoComplete="address-level2" onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
      <label className="field">Про себе
        <textarea maxLength={BIO_MAX} value={f.bio} placeholder="Які маршрути ви любите, де вже побували…" onChange={(e) => setF({ ...f, bio: e.target.value })} />
        <span className="hint counter">{f.bio.length} / {BIO_MAX}</span></label>
      <label className="field">Email
        <input type="email" required value={f.email} autoComplete="email" inputMode="email" onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      {emailChanged && (
        <div className="confirm-box">
          <label className="field">Ви змінюєте email — підтвердьте поточним паролем
            <input type="password" required value={f.currentPassword} autoComplete="current-password" onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></label>
        </div>
      )}
      <div className="row-wrap">
        <button type="submit" className="btn btn-primary" disabled={!dirty || busy}>{busy ? 'Збереження…' : 'Зберегти зміни'}</button>
        <button type="button" className="btn btn-secondary" disabled={!dirty || busy} onClick={() => setF(initial)}>Скасувати</button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const { acceptSession } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const passed = PASSWORD_RULES.filter(([, test]) => test(f.next)).length;
  const mismatch = f.confirm.length > 0 && f.confirm !== f.next;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.next !== f.confirm) { toast.error('Новий пароль і підтвердження не збігаються'); return; }
    setBusy(true);
    try {
      acceptSession(await api.changePassword(f.current, f.next));
      setF({ current: '', next: '', confirm: '' });
      toast.success('Пароль змінено. На інших пристроях потрібно буде увійти знову');
    } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  };

  const type = show ? 'text' : 'password';
  return (
    <form className="card card-pad form" onSubmit={submit}>
      <div className="section-head with-icon">
        <span className="icon-tile"><Icon name="lock" /></span>
        <div><h2 className="h2">Пароль</h2><span className="muted">Після зміни всі інші сесії завершаться</span></div>
      </div>
      <label className="field">Поточний пароль
        <input type={type} required value={f.current} autoComplete="current-password" onChange={(e) => setF({ ...f, current: e.target.value })} /></label>
      <label className="field">Новий пароль
        <span className="input-affix">
          <input type={type} required value={f.next} autoComplete="new-password" onChange={(e) => setF({ ...f, next: e.target.value })} />
          <button type="button" className="icon-btn icon-btn-sm" aria-label={show ? 'Сховати паролі' : 'Показати паролі'} aria-pressed={show} onClick={() => setShow(!show)}>
            <Icon name={show ? 'eyeOff' : 'eye'} size={18} /></button>
        </span></label>
      <div className="strength" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className={i < passed ? 'on' : ''} />)}</div>
      <ul className="rules">
        {PASSWORD_RULES.map(([label, test]) => <li key={label} className={test(f.next) ? 'ok' : ''}>{test(f.next) ? '✓' : '○'} {label}</li>)}
      </ul>
      <label className="field">Повторіть новий пароль
        <input type={type} required value={f.confirm} autoComplete="new-password" aria-invalid={mismatch} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        {mismatch && <span className="field-error">Паролі не збігаються</span>}</label>
      <button type="submit" className="btn btn-primary" disabled={busy || !f.current || passed < 3 || f.next !== f.confirm}>{busy ? 'Зміна…' : 'Змінити пароль'}</button>
    </form>
  );
}

/** Сторінка власного профілю: обкладинка з аватаром, активність, огляд маршрутів і налаштування. */
export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settings' ? 'settings' : 'overview';
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [routes, setRoutes] = useState<RouteSummary[] | null>(null);

  useEffect(() => {
    api.profile().then((p) => { setUser(p.user); setActivity(p.activity); }).catch((e) => toast.error(e.message));
    api.mine().then(setRoutes).catch(() => setRoutes([]));
    // завантажуємо один раз при відкритті сторінки
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;
  const published = (routes ?? []).filter((r) => r.status === 'PUBLISHED');

  return (
    <div className="profile-page">
      <div className="cover" aria-hidden="true">
        <svg viewBox="0 0 1440 180" preserveAspectRatio="xMidYMid slice">
          {[160, 125, 90, 55].map((y) => <path key={y} d={`M-20 ${y}c200-50 360 0 540-50s340-90 560-40 260 40 380 0`} />)}
          <path d="M1000 200c30-60 110-90 180-70s120 0 160-50" />
        </svg>
      </div>
      <div className="container profile-wrap">
        <section className="profile-head">
          <Avatar name={user.displayName} seed={user.id} size={128} className="avatar-xl" />
          <div className="profile-info">
            <div className="row-wrap"><h1>{user.displayName}</h1><span className={`role-badge role-${user.role.toLowerCase()}`}>{ROLE_LABEL[user.role]}</span></div>
            <div className="meta">
              <span>@{user.login}</span>
              {user.city && <span className="with-icon"><Icon name="pin" size={15} />{user.city}</span>}
              <span>з нами з {dateLong(user.createdAt)}</span>
            </div>
            {user.bio ? <p className="bio">{user.bio}</p>
              : <p className="muted">Розкажіть про себе — це побачать інші мандрівники. <button type="button" className="link-btn" onClick={() => setParams({ tab: 'settings' })}>Додати опис</button></p>}
          </div>
          <div className="profile-actions">
            <Link to="/mine" className="btn btn-secondary">Мої маршрути</Link>
            <button type="button" className="btn btn-secondary" onClick={logout}><Icon name="logout" size={18} />Вийти</button>
          </div>
        </section>

        <section className="stats-grid" aria-label="Активність">
          <StatTile label="Маршрутів" value={activity?.routesTotal ?? '–'}
            hint={activity && `${activity.routesPublished} опубл. · ${activity.routesDraft} ${plural(activity.routesDraft, ['чернетка', 'чернетки', 'чернеток'])}`} />
          <StatTile label="Опубліковано" value={activity ? km(activity.publishedKm) : '–'} hint="сумарна довжина" />
          <StatTile label="Середня оцінка" value={activity?.ratingsReceived ? <><span className="star-ink">★</span> {rating(activity.ratingAvgReceived)}</> : '–'}
            hint={activity && ratingsWord(activity.ratingsReceived)} />
          <StatTile label="Коментарів" value={activity?.commentsWritten ?? '–'} hint="залишено іншим" />
          <StatTile label="Оцінок поставлено" value={activity?.ratingsGiven ?? '–'} hint="чужим маршрутам" />
        </section>

        <div className="underline-tabs" role="tablist" aria-label="Розділи профілю">
          <button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setParams({})}>Огляд</button>
          <button type="button" role="tab" aria-selected={tab === 'settings'} onClick={() => setParams({ tab: 'settings' })}>Налаштування</button>
        </div>

        {tab === 'overview' ? (
          <div className="profile-overview">
            <section>
              <div className="section-head row-between"><h2 className="h2">Опубліковані маршрути</h2>{published.length > 0 && <Link to="/mine">Усі мої маршрути →</Link>}</div>
              {routes && published.length === 0 && (
                <EmptyState icon="route" title="Ще немає опублікованих маршрутів" text="Опубліковані маршрути з'являються в пошуку і тут."
                  action={<Link to="/routes/new" className="btn btn-primary"><Icon name="plus" size={18} />Новий маршрут</Link>} />
              )}
              <div className="card-list">{published.slice(0, 4).map((r) => <RouteCard key={r.id} r={r} />)}</div>
            </section>
            {isModerator(user) && (
              <section className="service-links">
                <h2 className="h2">Службові розділи</h2>
                <Link to="/moderation" className="service-link"><span className="icon-tile"><Icon name="shield" /></span><span><b>Модерація</b><span className="muted small">Скарги й точки інтересу спільноти</span></span><Icon name="chevronRight" /></Link>
                {user.role === 'ADMIN' && <Link to="/admin" className="service-link"><span className="icon-tile"><Icon name="users" /></span><span><b>Користувачі</b><span className="muted small">Ролі та блокування</span></span><Icon name="chevronRight" /></Link>}
              </section>
            )}
          </div>
        ) : (
          <div className="settings-grid">
            <PersonalForm key={user.id} user={user} onSaved={setUser} />
            <div className="settings-side">
              <PasswordForm />
              <div className="card card-pad info-card">
                <span className="icon-tile blue"><Icon name="shieldCheck" /></span>
                <div><b>Захист облікового запису</b>
                  <p className="muted">Після 5 невдалих спроб введення пароля вхід блокується на 15 хвилин. Про зміну пароля ви отримаєте сповіщення.</p></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
