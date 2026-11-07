import { useEffect, useMemo, useState } from 'react';
import { api, Role, User } from '../api';
import { useAuth } from '../auth';
import { Avatar, EmptyState, Loading } from '../components/common';
import { ConfirmDialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { errorText, useToast } from '../components/Toast';
import { plural, ROLE_LABEL } from '../ui';

const ROLES: Role[] = ['USER', 'MODERATOR', 'ADMIN'];

/** Керування користувачами: пошук, фільтр за роллю, зміна ролі, блокування з підтвердженням. На телефоні рядки стають картками. */
export function AdminPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<User[] | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [confirm, setConfirm] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.users().then(setUsers).catch((e) => { toast.error(e.message); setUsers([]); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((u) => (!roleFilter || u.role === roleFilter)
      && (!q || [u.login, u.displayName, u.email].some((v) => v.toLowerCase().includes(q))));
  }, [users, query, roleFilter]);

  const act = async (action: Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await action; toast.success(ok); await load(); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); setConfirm(null); }
  };
  const count = (r: Role) => (users ?? []).filter((u) => u.role === r).length;

  return (
    <div className="container page-pad admin">
      <div className="page-head">
        <div>
          <h1 className="h1">Користувачі</h1>
          {users && <p className="muted">{users.length} {plural(users.length, ['обліковий запис', 'облікові записи', 'облікових записів'])} · {count('ADMIN')} адм. · {count('MODERATOR')} мод.</p>}
        </div>
        <div className="row-wrap admin-filters">
          <label className="input-affix with-lead search-box">
            <Icon name="search" size={18} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Логін, ім'я або email" aria-label="Пошук користувачів" />
          </label>
          <select aria-label="Роль" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | '')}>
            <option value="">Усі ролі</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
      </div>

      {!users ? <Loading /> : visible.length === 0 ? <EmptyState icon="users" title="Нікого не знайдено" /> : (
        <div className="table-card card">
          <table className="user-table">
            <thead><tr><th>Користувач</th><th>Email</th><th>Роль</th><th>Статус</th><th className="right">Дії</th></tr></thead>
            <tbody>
              {visible.map((u) => {
                const self = u.id === me?.id;
                const blocked = u.status !== 'ACTIVE';
                return (
                  <tr key={u.id} className={blocked ? 'is-blocked' : ''}>
                    <td data-label="Користувач">
                      <div className="user-cell"><Avatar name={u.displayName} seed={u.id} size={38} />
                        <span><b>{u.displayName}</b><span className="muted small">@{u.login}{self ? ' · це ви' : u.city ? ` · ${u.city}` : ''}</span></span></div>
                    </td>
                    <td data-label="Email" className="muted">{u.email}</td>
                    <td data-label="Роль">
                      {self ? <span className={`role-badge role-${u.role.toLowerCase()}`}>{ROLE_LABEL[u.role]}</span> : (
                        <select aria-label={`Роль користувача ${u.login}`} value={u.role} disabled={busy}
                          onChange={(e) => act(api.setRole(u.id, e.target.value as Role), `Роль ${u.displayName} змінено`)}>
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                      )}
                    </td>
                    <td data-label="Статус"><span className={`state ${blocked ? 'off' : 'on'}`}><span className="dot" />{blocked ? 'Заблокований' : 'Активний'}</span></td>
                    <td data-label="Дії" className="right">
                      {self || u.role === 'ADMIN' ? <span className="muted">—</span>
                        : blocked ? <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => act(api.setBlocked(u.id, false), `${u.displayName} розблоковано`)}>Розблокувати</button>
                          : <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => setConfirm(u)}>Заблокувати</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog open={!!confirm} title={`Заблокувати ${confirm?.displayName ?? ''}?`} danger busy={busy} confirmLabel="Заблокувати"
        text="Користувач не зможе увійти, поточні сесії буде завершено. Маршрути залишаться на сайті."
        onConfirm={() => confirm && act(api.setBlocked(confirm.id, true), `${confirm.displayName} заблоковано`)} onClose={() => setConfirm(null)} />
    </div>
  );
}
