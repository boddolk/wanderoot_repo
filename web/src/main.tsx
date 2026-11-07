import { ReactNode, StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { AuthProvider, isModerator, useAuth } from './auth';
import { EmptyState, Loading } from './components/common';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { EditorPage } from './pages/EditorPage';
import { ModerationPage } from './pages/ModerationPage';
import { MyRoutesPage } from './pages/MyRoutesPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { RoutePage } from './pages/RoutePage';
import { SearchPage } from './pages/SearchPage';

/** Доступ лише для авторизованих (і, за потреби, певної ролі); гостя перенаправляє на вхід із поверненням назад. */
function Protected({ children, when = true }: { children: ReactNode; when?: boolean }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!when) return <EmptyState icon="lock" title="Немає доступу" text="Ця сторінка доступна лише модераторам і адміністраторам." action={<Link to="/" className="btn btn-primary">На головну</Link>} />;
  return <>{children}</>;
}

/** Нова сторінка відкривається згори (крім зміни лише параметрів пошуку). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function App() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  // вхід і редактор мають власні панелі замість загальної шапки та нижніх вкладок
  const bare = pathname === '/login' || pathname === '/register' || pathname === '/routes/new' || /^\/routes\/[^/]+\/edit$/.test(pathname);
  return (
    <Layout bare={bare}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/routes/new" element={<Protected><EditorPage /></Protected>} />
        <Route path="/routes/:id" element={<RoutePage />} />
        <Route path="/routes/:id/edit" element={<Protected><EditorPage /></Protected>} />
        <Route path="/mine" element={<Protected><MyRoutesPage /></Protected>} />
        <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
        <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
        <Route path="/moderation" element={<Protected when={isModerator(user)}><ModerationPage /></Protected>} />
        <Route path="/admin" element={<Protected when={user?.role === 'ADMIN'}><AdminPage /></Protected>} />
        <Route path="*" element={<div className="container page-pad"><EmptyState icon="map" title="Сторінку не знайдено" text="Можливо, посилання застаріло." action={<Link to="/" className="btn btn-primary">До маршрутів</Link>} /></div>} />
      </Routes>
    </Layout>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
);
