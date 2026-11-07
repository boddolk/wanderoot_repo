import { FormEvent, ReactNode, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Icon, IconName } from '../components/Icon';
import { Logo } from '../components/Layout';

const FEATURES: [IconName, string][] = [
  ['route', 'Прокладайте маршрути просто на карті'],
  ['upload', 'Імпорт і експорт GPX, KML та GeoJSON'],
  ['comment', 'Оцінки та відгуки спільноти мандрівників'],
];

function Field({ label, icon, children }: { label: string; icon: IconName; children: ReactNode }) {
  return (
    <label className="field">{label}
      <span className="input-affix with-lead"><Icon name={icon} size={18} />{children}</span>
    </label>
  );
}

/** Вхід і реєстрація: розділений екран; на телефоні зелена панель стискається до шапки. */
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, ready, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
  const target = from && !['/login', '/register'].includes(from.pathname) ? `${from.pathname}${from.search ?? ''}` : '/';
  const [f, setF] = useState({ login: '', email: '', password: '', displayName: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to={target} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') await login(f.login, f.password); else await register(f);
      navigate(target, { replace: true });
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-page">
      <section className="auth-aside">
        <svg className="topo" viewBox="0 0 720 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <path d="M360 520c-120 0-210-80-210-170s90-170 210-170 220 80 220 170-100 170-220 170z" />
          <path d="M360 580c-160 0-280-110-280-230s120-230 280-230 290 110 290 230-130 230-290 230z" />
          <path d="M360 640c-200 0-350-140-350-290S160 60 360 60s360 140 360 290-160 290-360 290z" />
          <path d="M360 460c-80 0-140-50-140-110s60-110 140-110 150 50 150 110-70 110-150 110z" />
          <path d="M-20 820c160-40 300 20 440-20s220-60 320-30" /><path d="M-20 870c160-40 300 20 440-20s220-60 320-30" />
        </svg>
        <Logo inverse />
        <div className="auth-pitch">
          <h1>Маршрути, якими хочеться ділитися</h1>
          <ul>{FEATURES.map(([icon, text]) => <li key={text}><span className="feature-icon"><Icon name={icon} size={18} /></span>{text}</li>)}</ul>
        </div>
      </section>

      <section className="auth-main">
        <form className="auth-form" onSubmit={submit}>
          <nav className="segmented tabs" aria-label="Вхід або реєстрація">
            <Link to="/login" state={location.state} aria-current={mode === 'login' ? 'page' : undefined} onClick={() => setError('')}>Вхід</Link>
            <Link to="/register" state={location.state} aria-current={mode === 'register' ? 'page' : undefined} onClick={() => setError('')}>Реєстрація</Link>
          </nav>
          <div className="auth-heading">
            <h2>{mode === 'login' ? 'З поверненням!' : 'Приєднуйтеся до мандрівників'}</h2>
            <p className="muted">{mode === 'login' ? 'Увійдіть, щоб створювати маршрути, оцінювати й коментувати.' : 'Створіть обліковий запис — це займе хвилину.'}</p>
          </div>
          {error && <div className="banner banner-error" role="alert"><Icon name="alert" size={18} />{error}</div>}

          <Field label="Логін" icon="user">
            <input required value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} autoComplete="username" autoCapitalize="none" spellCheck={false} />
          </Field>
          {mode === 'register' && <>
            <Field label="Email" icon="mail">
              <input required type="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
            </Field>
            <Field label="Ім'я (необов'язково)" icon="user">
              <input value={f.displayName} maxLength={60} onChange={(e) => setF({ ...f, displayName: e.target.value })} autoComplete="nickname" />
            </Field>
          </>}
          <Field label="Пароль" icon="lock">
            <input required type={show ? 'text' : 'password'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            <button type="button" className="icon-btn icon-btn-sm" aria-label={show ? 'Сховати пароль' : 'Показати пароль'} aria-pressed={show} onClick={() => setShow(!show)}>
              <Icon name={show ? 'eyeOff' : 'eye'} size={18} /></button>
          </Field>
          {mode === 'register' && <p className="hint">Не менше 8 символів, літера і цифра</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Зачекайте…' : mode === 'login' ? 'Увійти' : 'Зареєструватися'}</button>
          <p className="auth-switch muted">
            {mode === 'login'
              ? <>Ще немає облікового запису? <Link to="/register" state={location.state}>Зареєструватися</Link></>
              : <>Уже зареєстровані? <Link to="/login" state={location.state}>Увійти</Link></>}
          </p>
          {from && target !== '/' && <p className="auth-note muted">Після входу ви повернетеся на сторінку, з якої прийшли.</p>}
          <Link to="/" className="auth-back"><Icon name="chevronLeft" size={16} />До маршрутів</Link>
        </form>
      </section>
    </div>
  );
}
