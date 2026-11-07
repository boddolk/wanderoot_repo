import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, CATEGORY_LABEL, formatDuration, MODE_LABEL, Mode, Point, Route } from '../api';
import { RouteMap } from '../components/RouteMap';

type Tool = 'waypoint' | 'poi';
const emptyForm = { title: '', description: '', mode: 'WALK' as Mode, visibility: 'PUBLIC', tags: '' };

/** Створення та редагування маршруту: клацання по карті додає точку шляху або точку інтересу. */
export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [route, setRoute] = useState<Route | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [waypoints, setWaypoints] = useState<Point[]>([]);
  const [tool, setTool] = useState<Tool>('waypoint');
  const [poiDraft, setPoiDraft] = useState<{ point: Point; name: string; category: string; description: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const apply = (r: Route) => {
    setRoute(r);
    setForm({ title: r.title, description: r.description, mode: r.mode, visibility: r.visibility, tags: r.tags.join(', ') });
    setWaypoints(r.waypoints);
  };
  useEffect(() => { if (id) api.route(id).then(apply).catch((e) => setError(e.message)); else { setRoute(null); setForm(emptyForm); setWaypoints([]); } }, [id]);

  const run = async (action: () => Promise<Route | void>, ok: string) => {
    try {
      const r = await action();
      if (r) apply(r);
      setMessage(ok); setError('');
    } catch (e) { setError((e as Error).message); setMessage(''); }
  };

  const payload = () => ({ ...form, mode: form.mode, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean), waypoints });
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (route) run(() => api.updateRoute(route.id, payload()), 'Зміни збережено');
    else run(async () => { const r = await api.createRoute(payload()); navigate(`/routes/${r.id}/edit`, { replace: true }); return r; }, 'Маршрут створено');
  };

  const onMapClick = (p: Point) => {
    if (tool === 'waypoint') setWaypoints([...waypoints, p]);
    else if (route) setPoiDraft({ point: p, name: '', category: 'HISTORY', description: '' });
    else setError('Збережіть маршрут, щоб додавати точки інтересу');
  };

  const addPoi = (e: FormEvent) => {
    e.preventDefault();
    if (!route || !poiDraft) return;
    run(() => api.addPoi(route.id, { name: poiDraft.name, category: poiDraft.category, description: poiDraft.description, lat: poiDraft.point.lat, lon: poiDraft.point.lon }), 'Точку інтересу додано')
      .then(() => setPoiDraft(null));
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Розмір файлу перевищує 5 МБ'); return; }
    run(async () => { const r = await api.importFile(file.name, await file.text(), form.mode); navigate(`/routes/${r.id}/edit`); return r; }, 'Маршрут імпортовано як чернетку');
  };

  return (
    <div className="editor">
      <div className="route-head">
        <h1>{route ? 'Редагування маршруту' : 'Новий маршрут'}</h1>
        {route && <Link to={`/routes/${route.id}`}>Переглянути сторінку маршруту →</Link>}
      </div>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      <div className="split">
        <form className="card form" onSubmit={save}>
          <label>Назва<input required minLength={3} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>Опис<textarea maxLength={5000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="row">
            <label>Вид пересування
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as Mode })}>
                {(Object.keys(MODE_LABEL) as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </select></label>
            <label>Видимість
              <select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
                <option value="PUBLIC">Публічний</option><option value="UNLISTED">За посиланням</option><option value="PRIVATE">Приватний</option>
              </select></label>
          </div>
          <label>Теги (через кому)<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label>
          <p className="muted">Точок шляху: {waypoints.length}{route && ` · ${route.lengthKm.toFixed(2)} км · ≈ ${formatDuration(route.durationMin)}`}</p>
          <div className="row">
            <button type="submit">{route ? 'Зберегти' : 'Створити'}</button>
            <button type="button" className="secondary" disabled={!waypoints.length} onClick={() => setWaypoints(waypoints.slice(0, -1))}>Скасувати точку</button>
            <button type="button" className="secondary" disabled={!waypoints.length} onClick={() => setWaypoints([])}>Очистити</button>
          </div>
          {route && (
            <div className="row">
              {route.status === 'DRAFT' && <button type="button" onClick={() => run(() => api.publish(route.id), 'Маршрут опубліковано')}>Опублікувати</button>}
              {route.status === 'PUBLISHED' && <button type="button" className="secondary" onClick={() => run(() => api.unpublish(route.id), 'Маршрут знято з публікації')}>Зняти з публікації</button>}
              <button type="button" className="danger" onClick={() => window.confirm('Видалити маршрут?') && run(async () => { await api.deleteRoute(route.id); navigate('/mine'); }, 'Видалено')}>Видалити</button>
            </div>
          )}
          {!route && (
            <label className="import">Або імпортуйте файл GPX, KML чи GeoJSON
              <input type="file" accept=".gpx,.kml,.geojson,.json" onChange={(e) => importFile(e.target.files?.[0])} /></label>
          )}
          {route && (
            <>
              <h3>Точки інтересу</h3>
              {route.pois.length === 0 && <p className="muted">Оберіть інструмент «Точка інтересу» і клацніть на карті.</p>}
              <ul className="poi-list">
                {route.pois.map((p) => (
                  <li key={p.id}>
                    <span className={`dot poi-${p.category.toLowerCase()}`} /> <b>{p.name}</b> – {CATEGORY_LABEL[p.category]}
                    {p.sharing === 'PRIVATE' && <button type="button" className="link" onClick={() => run(() => api.suggestPoi(route.id, p.id), 'Точку запропоновано спільноті')}>запропонувати спільноті</button>}
                    {p.sharing === 'PENDING' && <span className="muted"> (на розгляді)</span>}
                    {p.sharing === 'APPROVED' && <span className="muted"> (затверджено)</span>}
                    <button type="button" className="link" onClick={() => run(() => api.removePoi(route.id, p.id), 'Точку видалено')}>видалити</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </form>
        <div>
          <div className="toolbar">
            <button className={tool === 'waypoint' ? '' : 'secondary'} onClick={() => setTool('waypoint')}>Точка шляху</button>
            <button className={tool === 'poi' ? '' : 'secondary'} onClick={() => setTool('poi')} disabled={!route}>Точка інтересу</button>
          </div>
          <RouteMap waypoints={waypoints} pois={route?.pois ?? []} onMapClick={onMapClick} height={560} />
          {poiDraft && (
            <form className="card form poi-form" onSubmit={addPoi}>
              <h3>Нова точка інтересу</h3>
              <label>Назва<input required maxLength={100} value={poiDraft.name} onChange={(e) => setPoiDraft({ ...poiDraft, name: e.target.value })} /></label>
              <label>Категорія<select value={poiDraft.category} onChange={(e) => setPoiDraft({ ...poiDraft, category: e.target.value })}>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label>Опис<input maxLength={1000} value={poiDraft.description} onChange={(e) => setPoiDraft({ ...poiDraft, description: e.target.value })} /></label>
              <div className="row"><button type="submit">Додати</button><button type="button" className="secondary" onClick={() => setPoiDraft(null)}>Скасувати</button></div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
