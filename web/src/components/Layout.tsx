import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { api } from '../api';
import { isModerator, useAuth } from '../auth';
import { Avatar } from './common';
import { Icon } from './Icon';

/** Логотип: знак гори на зеленій плашці + назва. */
export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link to="/" className={`logo${inverse ? ' inverse' : ''}`} aria-label="WandeRoot — на головну">
      <span className="logo-mark"><Icon name="logo" size={20} /></span>
      <span className="logo-text">Wande<span>Root</span></span>
    </Link>
  );
}

const Badge = ({ n }: { n: number }) => (n > 0 ? <span className="count-badge">{n > 99 ? '99+' : n}</span> : null);

/**
 * Каркас сторінок: верхня панель (на широких екранах – повна навігація)
 * і нижня панель вкладок на телефонах, де застосунком користуються найчастіше.
 */
export function Layout({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const { user } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [queue, setQueue] = useState(0);

  useEffect(() => {
    if (!user) { setUnread(0); setQueue(0); return; }
    api.notifications(true).then((n) => setUnread(n.length)).catch(() => undefined);
    if (isModerator(user)) {
      Promise.all([api.complaints(), api.pendingPois()]).then(([c, p]) => setQueue(c.length + p.length)).catch(() => undefined);
    }
  }, [user, location.pathname]);

  if (bare) return <>{children}</>;
  return (
    <div className="app">
      <a href="#main" className="skip-link">Перейти до вмісту</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Logo />
          <nav className="topnav" aria-label="Основна навігація">
            <NavLink to="/" end>Маршрути</NavLink>
            {user && <NavLink to="/mine">Мої маршрути</NavLink>}
            {isModerator(user) && <NavLink to="/moderation">Модерація <Badge n={queue} /></NavLink>}
            {user?.role === 'ADMIN' && <NavLink to="/admin">Користувачі</NavLink>}
          </nav>
          <div className="topbar-actions">
            {user ? <>
              <Link to="/routes/new" className="btn btn-primary desktop-only"><Icon name="plus" size={18} stroke={2.2} />Новий маршрут</Link>
              {isModerator(user) && (
                <NavLink to="/moderation" className="icon-btn mobile-only" aria-label={`Модерація${queue ? `, у черзі ${queue}` : ''}`}>
                  <Icon name="shield" /><Badge n={queue} />
                </NavLink>
              )}
              {user.role === 'ADMIN' && <NavLink to="/admin" className="icon-btn mobile-only" aria-label="Користувачі"><Icon name="users" /></NavLink>}
              <NavLink to="/notifications" className="icon-btn desktop-only" aria-label={`Сповіщення${unread ? `, нових ${unread}` : ''}`}>
                <Icon name="bell" />{unread > 0 && <span className="dot-badge" />}
              </NavLink>
              <NavLink to="/profile" className="profile-chip" aria-label="Мій профіль">
                <Avatar name={user.displayName} seed={user.id} size={36} /><span className="profile-name">{user.displayName}</span>
              </NavLink>
            </> : <>
              <Link to="/login" state={{ from: location }} className="btn btn-ghost">Вхід</Link>
              <Link to="/register" state={{ from: location }} className="btn btn-primary desktop-only">Реєстрація</Link>
            </>}
          </div>
        </div>
      </header>

      <main id="main" className="main">{children}</main>

      <nav className="tabbar" aria-label="Навігація">
        <NavLink to="/" end><Icon name="map" /><span>Маршрути</span></NavLink>
        {user ? <>
          <NavLink to="/mine"><Icon name="route" /><span>Мої</span></NavLink>
          <NavLink to="/routes/new" className="tab-create" aria-label="Новий маршрут"><span className="fab"><Icon name="plus" size={24} stroke={2.4} /></span></NavLink>
          <NavLink to="/notifications"><span className="tab-icon"><Icon name="bell" />{unread > 0 && <span className="dot-badge" />}</span><span>Сповіщення</span></NavLink>
          <NavLink to="/profile"><Icon name="user" /><span>Профіль</span></NavLink>
        </> : <>
          <NavLink to="/login" state={{ from: location }}><Icon name="user" /><span>Увійти</span></NavLink>
        </>}
      </nav>
    </div>
  );
}
