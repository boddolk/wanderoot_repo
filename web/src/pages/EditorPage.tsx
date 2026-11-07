import { DragEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, Mode, Point, Route } from '../api';
import { EmptyState, Loading, StatusPill } from '../components/common';
import { ConfirmDialog } from '../components/Dialog';
import { Icon, MODE_ICON } from '../components/Icon';
import { RouteMap } from '../components/RouteMap';
import { errorText, useToast } from '../components/Toast';
import { CATEGORIES, category, duration, estimateMinutes, km, lengthKm, MODE_KEYS, MODES, POI_SHARING, VISIBILITY } from '../ui';

type Tool = 'waypoint' | 'poi';
type Tab = 'main' | 'pois' | 'access';
interface Form { title: string; description: string; mode: Mode; visibility: string; tags: string[] }
const emptyForm: Form = { title: '', description: '', mode: 'WALK', visibility: 'PUBLIC', tags: [] };
const MAX_IMPORT = 5 * 1024 * 1024;

/** Створення та редагування маршруту: вкладки з даними ліворуч, карта з інструментами праворуч (на телефоні – згори). */
export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [route, setRoute] = useState<Route | null>(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<Form>(emptyForm);
  const [waypoints, setWaypoints] = useState<Point[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('main');
  const [tool, setTool] = useState<Tool>('waypoint');
  const [tagInput, setTagInput] = useState('');
  const [poiDraft, setPoiDraft] = useState<{ point: Point; name: string; category: string; description: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const apply = (r: Route) => {
    setRoute(r);
    setForm({ title: r.title, description: r.description, mode: r.mode, visibility: r.visibility, tags: [...r.tags] });
    setWaypoints(r.waypoints);
    setDirty(false);
  };

  useEffect(() => {
    setLoadError('');
    if (id) api.route(id).then(apply).catch((e) => setLoadError(e.message));
    else { setRoute(null); setForm(emptyForm); setWaypoints([]); setDirty(false); setTab('main'); }
  }, [id]);

  // попередження про незбережені зміни при закритті вкладки
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const live = useMemo(() => {
    const dist = lengthKm(waypoints);
    return { dist, min: estimateMinutes(form.mode, dist) };
  }, [waypoints, form.mode]);

  const change = (patch: Partial<Form>) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const changePoints = (pts: Point[]) => { setWaypoints(pts); setDirty(true); };

  const payload = () => ({ ...form, waypoints });

  /** Зберігає маршрут; повертає збережений маршрут або null у разі помилки. */
  const save = async (silent = false): Promise<Route | null> => {
    if (form.title.trim().length < 3) { setTab('main'); toast.error('Назва маршруту має містити щонайменше 3 символи'); return null; }
    setBusy(true);
    try {
      if (route) {
        const r = await api.updateRoute(route.id, payload());
        apply(r);
        if (!silent) toast.success('Зміни збережено');
        return r;
      }
      const r = await api.createRoute(payload());
      apply(r);
      toast.success('Маршрут створено як чернетку');
      navigate(`/routes/${r.id}/edit`, { replace: true });
      return r;
    } catch (e) { toast.error(errorText(e)); return null; } finally { setBusy(false); }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); save(); };

  const publish = async () => {
    const saved = dirty || !route ? await save(true) : route;
    if (!saved) return;
    setBusy(true);
    try { apply(await api.publish(saved.id)); toast.success('Маршрут опубліковано'); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  const unpublish = async () => {
    if (!route) return;
    setBusy(true);
    try { apply(await api.unpublish(route.id)); toast.success('Маршрут знято з публікації'); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!route) return;
    setBusy(true);
    try { await api.deleteRoute(route.id); setDirty(false); toast.success('Маршрут видалено'); navigate('/mine'); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); setConfirmDelete(false); }
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '').toLowerCase();
    if (t && !form.tags.includes(t) && form.tags.length < 10) change({ tags: [...form.tags, t] });
    setTagInput('');
  };
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
    else if (e.key === 'Backspace' && !tagInput && form.tags.length) change({ tags: form.tags.slice(0, -1) });
  };

  const onMapClick = (p: Point) => {
    if (tool === 'waypoint') changePoints([...waypoints, p]);
    else if (route) setPoiDraft({ point: p, name: '', category: 'NATURE', description: '' });
    else toast.error('Збережіть маршрут, щоб додавати точки інтересу');
  };
  const moveWaypoint = (i: number, p: Point) => changePoints(waypoints.map((w, j) => (j === i ? p : w)));

  const runPoi = async (action: () => Promise<Route>, ok: string) => {
    try {
      const r = await action();
      // зберігаємо незбережені зміни форми і точок шляху, оновлюючи лише точки інтересу
      setRoute(r);
      toast.success(ok);
    } catch (e) { toast.error(errorText(e)); }
  };
  const addPoi = async (e: FormEvent) => {
    e.preventDefault();
    if (!route || !poiDraft) return;
    await runPoi(() => api.addPoi(route.id, { name: poiDraft.name, category: poiDraft.category, description: poiDraft.description, lat: poiDraft.point.lat, lon: poiDraft.point.lon }), 'Точку інтересу додано');
    setPoiDraft(null);
    setTab('pois');
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMPORT) { toast.error('Розмір файлу перевищує 5 МБ'); return; }
    setBusy(true);
    try {
      const r = await api.importFile(file.name, await file.text(), form.mode);
      toast.success('Трек імпортовано як нову чернетку');
      navigate(`/routes/${r.id}/edit`);
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragOver(false); importFile(e.dataTransfer.files?.[0]); };

  if (loadError) return <div className="container page-pad"><EmptyState icon="map" title="Маршрут недоступний" text={loadError} action={<Link to="/mine" className="btn btn-primary">До моїх маршрутів</Link>} /></div>;
  if (id && !route) return <Loading label="Завантажуємо маршрут…" />;

  const status = route?.status;
  return (
    <div className="editor">
      <header className="editor-bar">
        <div className="editor-bar-inner">
          <Link to={route ? `/routes/${route.id}` : '/mine'} className="icon-btn" aria-label={route ? 'Назад до сторінки маршруту' : 'Назад до моїх маршрутів'}><Icon name="chevronLeft" /></Link>
          <div className="editor-title">
            <span className="muted small">{route ? 'Редагування маршруту' : 'Новий маршрут'} · {dirty ? 'є незбережені зміни' : route ? 'усі зміни збережено' : 'ще не збережено'}</span>
            <div className="row-wrap"><h1>{form.title.trim() || 'Без назви'}</h1>{status && <StatusPill status={status} />}</div>
          </div>
          <div className="editor-actions">
            {route && <Link to={`/routes/${route.id}`} className="btn btn-ghost desktop-only">Переглянути</Link>}
            <button type="submit" form="route-form" className={`btn ${!route || dirty ? 'btn-primary' : 'btn-secondary'}`} disabled={busy || (!!route && !dirty)}>{route ? 'Зберегти' : 'Створити'}</button>
            {status === 'PUBLISHED'
              ? <button type="button" className="btn btn-secondary" onClick={unpublish} disabled={busy}>Зняти<span className="desktop-only">&nbsp;з публікації</span></button>
              : status !== 'HIDDEN' && <button type="button" className="btn btn-primary" onClick={publish} disabled={busy || waypoints.length < 2}>Опублікувати</button>}
          </div>
        </div>
      </header>

      <div className="editor-layout container">
        <aside className="editor-panel">
          <div className="segmented tabs" role="tablist" aria-label="Розділи редактора">
            <button type="button" role="tab" aria-selected={tab === 'main'} onClick={() => setTab('main')}>Основне</button>
            <button type="button" role="tab" aria-selected={tab === 'pois'} onClick={() => setTab('pois')}>Точки{route?.pois.length ? ` · ${route.pois.length}` : ''}</button>
            <button type="button" role="tab" aria-selected={tab === 'access'} onClick={() => setTab('access')}>Доступ</button>
          </div>

          <form id="route-form" className="card card-pad form" onSubmit={submit} hidden={tab !== 'main'} noValidate>
            <label className="field">Назва
              <input required minLength={3} maxLength={120} value={form.title} onChange={(e) => change({ title: e.target.value })} placeholder="Наприклад, Набережна Тернопільського ставу" /></label>
            <label className="field">Опис
              <textarea maxLength={5000} value={form.description} onChange={(e) => change({ description: e.target.value })} placeholder="Що чекає на мандрівника, складність, найкращий сезон…" /></label>
            <fieldset className="field">
              <legend>Вид пересування</legend>
              <div className="mode-picker">
                {MODE_KEYS.map((m) => (
                  <label key={m} className={`mode-option${form.mode === m ? ' on' : ''}`} style={{ ['--mode' as string]: MODES[m].color, ['--mode-tint' as string]: MODES[m].tint, ['--mode-ink' as string]: MODES[m].ink }}>
                    <input type="radio" name="mode" value={m} checked={form.mode === m} onChange={() => change({ mode: m })} />
                    <Icon name={MODE_ICON[m]} size={22} /><span>{MODES[m].short}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="tag-input">Теги</label>
              <div className="tag-input" onClick={() => document.getElementById('tag-input')?.focus()}>
                {form.tags.map((t) => (
                  <span key={t} className="tag-chip">{t}
                    <button type="button" aria-label={`Видалити тег ${t}`} onClick={() => change({ tags: form.tags.filter((x) => x !== t) })}><Icon name="x" size={12} stroke={2.6} /></button></span>
                ))}
                <input id="tag-input" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={onTagKey} onBlur={addTag}
                  placeholder={form.tags.length ? '' : 'Додайте тег і натисніть Enter'} enterKeyHint="done" />
              </div>
            </div>

            {!route && (
              <label className={`dropzone${dragOver ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
                <Icon name="upload" size={26} />
                <b>Імпорт треку</b>
                <span>Виберіть або перетягніть файл GPX, KML чи GeoJSON (до 5 МБ) — буде створено нову чернетку</span>
                <input type="file" accept=".gpx,.kml,.geojson,.json" onChange={(e) => importFile(e.target.files?.[0])} />
              </label>
            )}
            {route && <button type="button" className="btn btn-danger align-start" onClick={() => setConfirmDelete(true)} disabled={busy}><Icon name="trash" size={18} />Видалити маршрут</button>}
          </form>

          {tab === 'pois' && (
            <div className="card card-pad">
              {!route ? <p className="muted">Збережіть маршрут, щоб додавати точки інтересу.</p> : <>
                <p className="muted">Оберіть на карті інструмент «Точка інтересу» і торкніться потрібного місця.</p>
                {route.pois.length === 0 ? <EmptyState icon="pin" title="Точок інтересу ще немає" /> : (
                  <ul className="poi-list">
                    {route.pois.map((p) => {
                      const c = category(p.category);
                      const share = POI_SHARING[p.sharing] ?? POI_SHARING.PRIVATE;
                      return (
                        <li key={p.id}>
                          <span className="poi-dot" style={{ background: c.color }} />
                          <div className="poi-info"><b>{p.name}</b><span className="muted small">{c.label} · <span className={`tone-${share.tone}`}>{share.label}</span></span></div>
                          <div className="poi-actions">
                            {p.sharing === 'PRIVATE' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => runPoi(() => api.suggestPoi(route.id, p.id), 'Точку запропоновано спільноті')}>Запропонувати</button>}
                            <button type="button" className="icon-btn icon-btn-sm" aria-label={`Видалити точку ${p.name}`} onClick={() => runPoi(() => api.removePoi(route.id, p.id), 'Точку видалено')}><Icon name="trash" size={16} /></button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>}
            </div>
          )}

          {tab === 'access' && (
            <div className="card card-pad form">
              <fieldset className="field">
                <legend>Хто бачить маршрут</legend>
                <div className="radio-list">
                  {Object.entries(VISIBILITY).map(([k, v]) => (
                    <label key={k} className={`radio-card${form.visibility === k ? ' on' : ''}`}>
                      <input type="radio" name="visibility" value={k} checked={form.visibility === k} onChange={() => change({ visibility: k })} />
                      <span><b>{v.label}</b><span className="muted small">{v.hint}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="banner banner-info"><Icon name="info" />
                <span>{status === 'PUBLISHED' ? 'Маршрут опубліковано. Зміни стануть видимими одразу після збереження.'
                  : status === 'HIDDEN' ? 'Маршрут приховано модератором. Відновити його може лише модератор.'
                    : 'Чернетку бачите лише ви. Для публікації потрібні назва і щонайменше дві точки шляху.'}</span></div>
              {dirty && <button type="button" className="btn btn-primary align-start" onClick={() => save()} disabled={busy}>Зберегти зміни</button>}
            </div>
          )}
        </aside>

        <div className="editor-map-col">
          <RouteMap className="editor-map" label="Карта редактора" waypoints={waypoints} mode={form.mode} pois={route?.pois ?? []}
            onMapClick={onMapClick} onWaypointMove={moveWaypoint} layerToggle wheelZoom
            fitKey={route?.id ?? 'new'} /* вигляд підлаштовується лише при завантаженні маршруту, а не на кожну нову точку */>
            <div className="map-toolbar" role="toolbar" aria-label="Інструменти карти">
              <button type="button" aria-label="Точка шляху" aria-pressed={tool === 'waypoint'} onClick={() => setTool('waypoint')}><Icon name="route" size={18} stroke={2.2} /><span>Точка шляху</span></button>
              <button type="button" aria-label="Точка інтересу" aria-pressed={tool === 'poi'} onClick={() => (route ? setTool('poi') : toast.error('Збережіть маршрут, щоб додавати точки інтересу'))}><Icon name="pin" size={18} /><span>Точка інтересу</span></button>
              <span className="toolbar-sep" aria-hidden="true" />
              <button type="button" className="icon-only" aria-label="Скасувати останню точку" disabled={!waypoints.length} onClick={() => changePoints(waypoints.slice(0, -1))}><Icon name="undo" size={18} /></button>
              <button type="button" className="icon-only danger" aria-label="Очистити всі точки" disabled={!waypoints.length} onClick={() => changePoints([])}><Icon name="trash" size={18} /></button>
            </div>
            <div className="map-stats" aria-live="polite">
              <span><b>{waypoints.length}</b> {waypoints.length === 1 ? 'точка' : waypoints.length >= 2 && waypoints.length <= 4 ? 'точки' : 'точок'}</span>
              <span className="sep">|</span><span><b>{km(live.dist).replace(' км', '')}</b> км</span>
              <span className="sep">|</span><span>≈ <b>{duration(live.min)}</b></span>
            </div>
            {poiDraft && (
              <form className="poi-sheet" onSubmit={addPoi}>
                <div className="poi-sheet-head"><b>Нова точка інтересу</b>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label="Закрити" onClick={() => setPoiDraft(null)}><Icon name="x" size={16} /></button></div>
                <input required maxLength={100} value={poiDraft.name} autoFocus aria-label="Назва точки" placeholder="Назва, наприклад «Джерело»"
                  onChange={(e) => setPoiDraft({ ...poiDraft, name: e.target.value })} />
                <div className="cat-picker" role="radiogroup" aria-label="Категорія">
                  {Object.entries(CATEGORIES).filter(([k]) => k !== 'OTHER').map(([k, c]) => (
                    <button key={k} type="button" role="radio" aria-checked={poiDraft.category === k}
                      style={poiDraft.category === k ? { background: c.tint, color: c.ink, borderColor: c.color } : undefined}
                      onClick={() => setPoiDraft({ ...poiDraft, category: k })}>{c.short}</button>
                  ))}
                </div>
                <input maxLength={1000} value={poiDraft.description} aria-label="Опис точки" placeholder="Короткий опис (необов'язково)"
                  onChange={(e) => setPoiDraft({ ...poiDraft, description: e.target.value })} />
                <button type="submit" className="btn btn-primary">Додати точку</button>
              </form>
            )}
            {!poiDraft && <p className="map-hint">{tool === 'waypoint' ? 'Торкніться карти, щоб додати точку. Перетягуйте точки, щоб змінити трасу.' : 'Торкніться карти там, де розташована точка інтересу.'}</p>}
          </RouteMap>
        </div>
      </div>

      <ConfirmDialog open={confirmDelete} title="Видалити маршрут?" danger busy={busy} confirmLabel="Видалити"
        text={<>Маршрут «{route?.title}» разом із точками інтересу, оцінками й коментарями буде видалено назавжди.</>}
        onConfirm={remove} onClose={() => setConfirmDelete(false)} />
    </div>
  );
}
