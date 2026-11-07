// Клієнт REST API: додає токен доступу та перетворює помилки сервера на повідомлення українською.

export type Mode = 'WALK' | 'HIKE' | 'BIKE' | 'CAR';
export type Role = 'USER' | 'MODERATOR' | 'ADMIN';

export interface User { id: string; login: string; email: string; displayName: string; role: Role; status: string; bio: string; city: string; createdAt: string }
export interface UserActivity {
  routesTotal: number; routesPublished: number; routesDraft: number; routesHidden: number; publishedKm: number;
  ratingsReceived: number; ratingAvgReceived: number; commentsWritten: number; ratingsGiven: number;
}
export interface ProfileChanges { displayName?: string; email?: string; bio?: string; city?: string; currentPassword?: string }
export const ROLE_LABEL: Record<Role, string> = { USER: 'Мандрівник', MODERATOR: 'Модератор', ADMIN: 'Адміністратор' };
export interface Point { lat: number; lon: number }
export interface Poi { id: string; name: string; description: string; category: string; location: Point; sharing: string }
export interface Route {
  id: string; ownerId: string; title: string; description: string; mode: Mode; visibility: string; tags: string[];
  status: string; hiddenReason: string | null; waypoints: Point[]; pois: Poi[]; lengthKm: number; durationMin: number;
  ratingAvg: number; ratingCount: number; createdAt: string; updatedAt: string;
}
export interface RouteSummary { id: string; title: string; mode: Mode; lengthKm: number; durationMin: number; ratingAvg: number; ratingCount: number; tags: string[]; start: Point | null }
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface CommentView { id: string; authorId: string; authorName: string; text: string; status: string; createdAt: string }
export interface Complaint { id: string; reporterId: string; targetType: string; targetId: string; reason: string; description: string; status: string; createdAt: string }
export interface Notification { id: string; type: string; message: string; link: string | null; read: boolean; createdAt: string }

export const MODE_LABEL: Record<Mode, string> = { WALK: 'Пішки', HIKE: 'Похід', BIKE: 'Велосипед', CAR: 'Автомобіль' };
export const CATEGORY_LABEL: Record<string, string> = {
  HISTORY: 'Історична пам\'ятка', NATURE: 'Природа', INFRASTRUCTURE: 'Інфраструктура', PET_FRIENDLY: 'Для тварин', OTHER: 'Інше',
};

const TOKEN_KEY = 'wanderoot.token';
export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* недоступне сховище */ } },
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.message ?? `Помилка ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

const qs = (params: Record<string, unknown>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();

export const api = {
  register: (data: { login: string; email: string; password: string; displayName?: string }) => request<{ token: string; user: User }>('POST', '/auth/register', data),
  login: (login: string, password: string) => request<{ token: string; user: User }>('POST', '/auth/login', { login, password }),
  me: () => request<User>('GET', '/auth/me'),

  profile: () => request<{ user: User; activity: UserActivity }>('GET', '/profile'),
  updateProfile: (data: ProfileChanges) => request<User>('PUT', '/profile', data),
  changePassword: (currentPassword: string, newPassword: string) => request<{ token: string; user: User }>('POST', '/profile/password', { currentPassword, newPassword }),

  search: (params: Record<string, unknown>) => request<Page<RouteSummary>>('GET', `/routes?${qs(params)}`),
  mine: () => request<RouteSummary[]>('GET', '/routes/mine'),
  route: (id: string) => request<Route>('GET', `/routes/${id}`),
  createRoute: (data: Partial<Route> & { waypoints?: Point[] }) => request<Route>('POST', '/routes', data),
  updateRoute: (id: string, data: Partial<Route> & { waypoints?: Point[] }) => request<Route>('PUT', `/routes/${id}`, data),
  deleteRoute: (id: string) => request<void>('DELETE', `/routes/${id}`),
  publish: (id: string) => request<Route>('POST', `/routes/${id}/publish`),
  unpublish: (id: string) => request<Route>('POST', `/routes/${id}/unpublish`),
  addPoi: (id: string, data: { name: string; description?: string; category: string; lat: number; lon: number }) => request<Route>('POST', `/routes/${id}/pois`, data),
  removePoi: (id: string, poiId: string) => request<Route>('DELETE', `/routes/${id}/pois/${poiId}`),
  suggestPoi: (id: string, poiId: string) => request<Route>('POST', `/routes/${id}/pois/${poiId}/suggest`),
  importFile: (fileName: string, content: string, mode?: Mode) => request<Route>('POST', '/routes/import', { fileName, content, mode }),
  exportUrl: (id: string, format: string) => `/api/routes/${id}/export?format=${format}`,
  navigationLink: (id: string) => request<{ url: string }>('GET', `/routes/${id}/navigation-link`),

  comments: (id: string) => request<CommentView[]>('GET', `/routes/${id}/comments`),
  addComment: (id: string, text: string) => request<CommentView>('POST', `/routes/${id}/comments`, { text }),
  myRating: (id: string) => request<{ value: number | null }>('GET', `/routes/${id}/rating`),
  rate: (id: string, value: number) => request<{ ratingAvg: number; ratingCount: number; myRating: number }>('POST', `/routes/${id}/rating`, { value }),

  complain: (data: { targetType: string; targetId: string; reason: string; description?: string }) => request<Complaint>('POST', '/complaints', data),
  complaints: (status = 'OPEN') => request<Complaint[]>('GET', `/moderation/complaints?status=${status}`),
  resolve: (id: string, decision: string, note?: string) => request<Complaint>('POST', `/moderation/complaints/${id}/resolve`, { decision, note }),
  restoreRoute: (id: string) => request<Route>('POST', `/moderation/routes/${id}/restore`),
  pendingPois: () => request<{ routeId: string; routeTitle: string; poi: Poi }[]>('GET', '/moderation/pois'),
  reviewPoi: (routeId: string, poiId: string, approve: boolean) => request<Poi>('POST', `/moderation/pois/${routeId}/${poiId}/${approve ? 'approve' : 'reject'}`),

  notifications: () => request<Notification[]>('GET', '/notifications'),
  readNotification: (id: string) => request<Notification>('POST', `/notifications/${id}/read`),

  users: () => request<User[]>('GET', '/admin/users'),
  setRole: (id: string, role: Role) => request<User>('POST', `/admin/users/${id}/role`, { role }),
  setBlocked: (id: string, blocked: boolean) => request<User>('POST', `/admin/users/${id}/${blocked ? 'block' : 'unblock'}`),
};

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} год ${m} хв` : `${m} хв`;
}
