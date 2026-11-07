import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { AuthProvider, initials, isModerator, useAuth } from './auth';
import { ProfilePage } from './pages/ProfilePage';
import { SearchPage } from './pages/SearchPage';
import { RoutePage } from './pages/RoutePage';
import { EditorPage } from './pages/EditorPage';
import { AdminPage, LoginPage, ModerationPage, MyRoutesPage, NotificationsPage } from './pages/OtherPages';
import { ReactNode } from 'react';

function Protected({ children, when = true }: { children: ReactNode; when?: boolean }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user && when ? <>{children}</> : <Navigate to="/login" replace />;
}

function Layout() {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="logo">Wande<span>Root</span></Link>
        <nav>
          <NavLink to="/" end>Маршрути</NavLink>
          {user && <NavLink to="/mine">Мої маршрути</NavLink>}
          {user && <NavLink to="/routes/new">Створити</NavLink>}
          {isModerator(user) && <NavLink to="/moderation">Модерація</NavLink>}
          {user?.role === 'ADMIN' && <NavLink to="/admin">Користувачі</NavLink>}
        </nav>
        <div className="user">
          {user ? <>
            <NavLink to="/notifications">Сповіщення</NavLink>
            <NavLink to="/profile" className="profile-link" title="Мій профіль">
              <span className="avatar" aria-hidden>{initials(user.displayName)}</span>{user.displayName}
            </NavLink>
            <button className="link" onClick={logout}>Вийти</button>
          </> : <><NavLink to="/login">Вхід</NavLink><NavLink to="/register">Реєстрація</NavLink></>}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/login" element={<LoginPage mode="login" />} />
          <Route path="/register" element={<LoginPage mode="register" />} />
          <Route path="/routes/new" element={<Protected><EditorPage /></Protected>} />
          <Route path="/routes/:id" element={<RoutePage />} />
          <Route path="/routes/:id/edit" element={<Protected><EditorPage /></Protected>} />
          <Route path="/mine" element={<Protected><MyRoutesPage /></Protected>} />
          <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
          <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
          <Route path="/moderation" element={<Protected when={isModerator(user)}><ModerationPage /></Protected>} />
          <Route path="/admin" element={<Protected when={user?.role === 'ADMIN'}><AdminPage /></Protected>} />
          <Route path="*" element={<p>Сторінку не знайдено</p>} />
        </Routes>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
