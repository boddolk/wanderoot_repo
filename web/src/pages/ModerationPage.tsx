import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, Complaint, PendingPoi } from '../api';
import { useAuth } from '../auth';
import { EmptyState, Loading } from '../components/common';
import { Icon, MODE_ICON } from '../components/Icon';
import { errorText, useToast } from '../components/Toast';
import { category, DECISION_LABEL, km, MODES, REASONS, relativeTime } from '../ui';

type Tab = 'complaints' | 'pois' | 'resolved';
const TARGET_LABEL: Record<string, string> = { ROUTE: 'Маршрут', COMMENT: 'Коментар', USER: 'Користувач' };

function TargetPreview({ c }: { c: Complaint }) {
  const t = c.target;
  if (!t.exists) return <div className="target-card muted">Об'єкт скарги вже видалено</div>;
  if (c.targetType === 'ROUTE') {
    const m = t.mode ? MODES[t.mode] : MODES.WALK;
    return (
      <Link to={`/routes/${c.targetId}`} className="target-card">
        <span className="icon-tile" style={{ background: m.tint, color: m.ink }}><Icon name={MODE_ICON[t.mode ?? 'WALK']} /></span>
        <span><b>{t.title}</b><span className="muted small">Автор: {t.authorName} · {m.label}{t.lengthKm !== undefined && ` · ${km(t.lengthKm)}`}</span></span>
        <Icon name="chevronRight" />
      </Link>
    );
  }
  if (c.targetType === 'COMMENT') {
    return (
      <Link to={`/routes/${t.routeId}`} className="target-card">
        <span className="icon-tile"><Icon name="comment" /></span>
        <span><b>«{t.text}»</b><span className="muted small">Автор коментаря: {t.authorName}</span></span>
        <Icon name="chevronRight" />
      </Link>
    );
  }
  return <div className="target-card"><span className="icon-tile"><Icon name="user" /></span><span><b>{t.title}</b><span className="muted small">Обліковий запис</span></span></div>;
}

function ComplaintCard({ c, isAdmin, onDone }: { c: Complaint; isAdmin: boolean; onDone: () => void }) {
  const toast = useToast();
  const options = [
    c.targetType !== 'USER' && { value: 'HIDE_CONTENT', title: c.targetType === 'ROUTE' ? 'Приховати маршрут' : 'Приховати коментар', hint: 'Автор отримає сповіщення з причиною' },
    { value: 'REJECT', title: 'Відхилити скаргу', hint: 'Порушень не виявлено' },
    { value: 'BLOCK_USER', title: 'Заблокувати автора', hint: isAdmin ? 'Автор не зможе увійти' : 'Доступно лише адміністратору', disabled: !isAdmin },
  ].filter(Boolean) as { value: string; title: string; hint: string; disabled?: boolean }[];
  const [decision, setDecision] = useState(options[0].value);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await api.resolve(c.id, decision, note); toast.success(DECISION_LABEL[decision]); onDone(); } catch (err) { toast.error(errorText(err)); } finally { setBusy(false); }
  };

  return (
    <article className="complaint card">
      <div className="complaint-main">
        <div className="row-wrap">
          <span className="chip-soft clay">{REASONS[c.reason] ?? c.reason}</span>
          <span className="chip-soft">{TARGET_LABEL[c.targetType]}</span>
          <span className="muted small">{relativeTime(c.createdAt)} · від <b>{c.reporterName}</b></span>
        </div>
        <TargetPreview c={c} />
        {c.description && <blockquote>«{c.description}»</blockquote>}
      </div>
      <form className="complaint-decision" onSubmit={submit}>
        <b>Рішення</b>
        <div className="radio-list">
          {options.map((o) => (
            <label key={o.value} className={`radio-card${decision === o.value ? ' on' : ''}${o.disabled ? ' disabled' : ''}`}>
              <input type="radio" name={`decision-${c.id}`} value={o.value} checked={decision === o.value} disabled={o.disabled} onChange={() => setDecision(o.value)} />
              <span><b>{o.title}</b><span className="muted small">{o.hint}</span></span>
            </label>
          ))}
        </div>
        {decision === 'HIDE_CONTENT' && (
          <label className="field">Причина для автора
            <textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Порушення правил спільноти" /></label>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Застосовуємо…' : 'Застосувати рішення'}</button>
      </form>
    </article>
  );
}

/** Черги модерації: скарги з рішенням у формі (без системних вікон), точки інтересу спільноти, історія. */
export function ModerationPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'complaints') as Tab;
  const [open, setOpen] = useState<Complaint[] | null>(null);
  const [pois, setPois] = useState<PendingPoi[] | null>(null);
  const [resolved, setResolved] = useState<Complaint[] | null>(null);

  const load = () => {
    api.complaints('OPEN').then(setOpen).catch((e) => { toast.error(e.message); setOpen([]); });
    api.pendingPois().then(setPois).catch(() => setPois([]));
    Promise.all([api.complaints('RESOLVED'), api.complaints('REJECTED')])
      .then(([a, b]) => setResolved([...a, ...b].sort((x, y) => (y.resolvedAt ?? '').localeCompare(x.resolvedAt ?? ''))))
      .catch(() => setResolved([]));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const review = async (p: PendingPoi, approve: boolean) => {
    try { await api.reviewPoi(p.routeId, p.poi.id, approve); toast.success(approve ? 'Точку затверджено' : 'Точку відхилено'); load(); } catch (e) { toast.error(errorText(e)); }
  };
  const restore = async (routeId: string) => {
    try { await api.restoreRoute(routeId); toast.success('Маршрут відновлено'); load(); } catch (e) { toast.error(errorText(e)); }
  };

  const tabs: [Tab, ReactNode, number | undefined][] = [
    ['complaints', 'Скарги', open?.length],
    ['pois', <><span className="desktop-only">Точки інтересу</span><span className="mobile-only">Точки</span></>, pois?.length],
    ['resolved', 'Розглянуті', undefined],
  ];

  return (
    <div className="container page-pad moderation">
      <div className="page-head">
        <div><h1 className="h1">Модерація</h1><p className="muted">Черга скарг і точок інтересу, запропонованих спільноті</p></div>
        <div className="segmented" role="tablist" aria-label="Черги">
          {tabs.map(([t, label, n]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setParams(t === 'complaints' ? {} : { tab: t })}>
              {label}{!!n && <span className={`count ${t === 'complaints' ? 'clay' : 'amber'}`}>{n}</span>}</button>
          ))}
        </div>
      </div>

      {tab === 'complaints' && (!open ? <Loading /> : open.length === 0
        ? <EmptyState icon="shieldCheck" title="Відкритих скарг немає" text="Нові скарги з'являться тут." />
        : <div className="stack">{open.map((c) => <ComplaintCard key={c.id} c={c} isAdmin={user?.role === 'ADMIN'} onDone={load} />)}</div>)}

      {tab === 'pois' && (!pois ? <Loading /> : pois.length === 0
        ? <EmptyState icon="pin" title="Немає точок на розгляді" text="Автори пропонують точки інтересу спільноті з редактора маршруту." />
        : <div className="stack">{pois.map((p) => {
          const c = category(p.poi.category);
          return (
            <article key={p.poi.id} className="poi-review card">
              <svg className="poi-review-map" viewBox="0 0 160 110" aria-hidden="true">
                <rect width="160" height="110" fill="#E6EEE3" />
                <path d="M80 100c-50 0-70-25-70-45S30 10 80 10s70 25 70 45-20 45-70 45z" fill="none" stroke="#D3DED0" strokeWidth="2" />
                <path d="M80 80c-30 0-44-15-44-25s14-25 44-25 44 15 44 25-14 25-44 25z" fill="#DCE7D7" />
                <circle cx="80" cy="55" r="11" fill={c.color} stroke="#FFFFFF" strokeWidth="4" />
              </svg>
              <div className="poi-review-info">
                <div className="row-wrap"><b className="big">{p.poi.name}</b><span className="chip-cat" style={{ background: c.tint, color: c.ink }}>{c.label}</span></div>
                {p.poi.description && <p>{p.poi.description}</p>}
                <span className="muted small">Маршрут <Link to={`/routes/${p.routeId}`}>«{p.routeTitle}»</Link> · запропонував {p.ownerName}</span>
                <span className="muted small">{p.poi.location.lat.toFixed(4)}, {p.poi.location.lon.toFixed(4)}</span>
              </div>
              <div className="row-wrap poi-review-actions">
                <button type="button" className="btn btn-danger" onClick={() => review(p, false)}>Відхилити</button>
                <button type="button" className="btn btn-primary" onClick={() => review(p, true)}>Затвердити</button>
              </div>
            </article>
          );
        })}</div>)}

      {tab === 'resolved' && (!resolved ? <Loading /> : resolved.length === 0
        ? <EmptyState icon="list" title="Розглянутих скарг ще немає" />
        : <ul className="resolved-list card">{resolved.map((c) => (
          <li key={c.id}>
            <span className={`icon-tile ${c.status === 'REJECTED' ? '' : 'tone-clay'}`}><Icon name={c.status === 'REJECTED' ? 'check' : 'shield'} /></span>
            <div>
              <b>{DECISION_LABEL[c.decision ?? 'REJECT']}</b>
              <span className="muted small">{TARGET_LABEL[c.targetType]}{c.target.title ? ` «${c.target.title}»` : c.target.text ? ` «${c.target.text}»` : ''} · {REASONS[c.reason]} · {c.resolvedAt ? relativeTime(c.resolvedAt) : ''}</span>
            </div>
            {c.targetType === 'ROUTE' && c.target.status === 'HIDDEN' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => restore(c.targetId)}>Відновити</button>}
          </li>
        ))}</ul>)}
    </div>
  );
}
