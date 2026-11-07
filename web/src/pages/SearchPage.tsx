import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, Mode, Page, Point, RouteSummary } from '../api';
import { EmptyState, RouteCard } from '../components/common';
import { Icon, Star } from '../components/Icon';
import { RouteMap } from '../components/RouteMap';
import { useToast } from '../components/Toast';
import { km, MODE_KEYS, MODES, plural, rating } from '../ui';

const PAGE_SIZE = 12;
const RADII = [5, 10, 25, 50, 100];

/** Головна: пошук маршрутів. Фільтри зберігаються в адресі сторінки, тож працюють «Назад» і посилання на теги. */
export function SearchPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const mode = (params.get('mode') ?? '') as Mode | '';
  const tag = params.get('tag') ?? '';
  const minRating = params.get('minRating') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const [text, setText] = useState(q);
  const [near, setNear] = useState<Point | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [data, setData] = useState<Page<RouteSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [hovered, setHovered] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<Point | null>(null);
  const [areaChanged, setAreaChanged] = useState(false);

  useEffect(() => setText(q), [q]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.search({ q, mode, tag, minRating, sort, page, pageSize: PAGE_SIZE, ...(near ? { lat: near.lat, lon: near.lon, radiusKm } : {}) })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) { toast.error(e.message); setData({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE }); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mode, tag, minRating, sort, page, near, radiusKm]);

  /** Змінює параметри пошуку; будь-яка зміна фільтра повертає на першу сторінку. */
  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  const submit = (e: FormEvent) => { e.preventDefault(); update({ q: text.trim() }); };
  const locate = () => {
    if (!navigator.geolocation) { toast.error('Браузер не підтримує визначення місцезнаходження'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setNear({ lat: +pos.coords.latitude.toFixed(5), lon: +pos.coords.longitude.toFixed(5) }); update({}); },
      () => toast.error('Не вдалося визначити місцезнаходження. Клацніть на карті, щоб вибрати точку'),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };
  const searchArea = () => { if (mapCenter) { setNear(mapCenter); setAreaChanged(false); update({}); } };
  const resetAll = () => { setNear(null); setText(''); setParams(new URLSearchParams()); };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const items = data?.items ?? [];
  const markers = useMemo(() => items.filter((r) => r.start).map((r) => ({
    id: r.id, point: r.start!, mode: r.mode, title: r.title,
    subtitle: `${MODES[r.mode].label} · ${km(r.lengthKm)} · ★ ${rating(r.ratingAvg)}`, onOpen: () => navigate(`/routes/${r.id}`),
  })), [items, navigate]);
  const hasFilters = !!(q || mode || tag || minRating || near);

  return (
    <div className="search-page">
      <section className="hero">
        <svg className="topo" viewBox="0 0 1440 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {[260, 220, 180, 140, 100].map((y) => <path key={y} d={`M-20 ${y}c180-60 320-10 480-70s300-120 520-60 330 70 480 10`} />)}
          <path d="M900 330c40-80 140-110 220-90s150 10 200-60" /><path d="M940 330c40-70 120-90 190-70s140 0 190-50" />
        </svg>
        <div className="hero-inner container">
          <span className="eyebrow">Інтерактивний путівник</span>
          <h1>Знайдіть свою стежку</h1>
          <p>Пішохідні, велосипедні та автомобільні маршрути з точками інтересу, оцінками й відгуками спільноти мандрівників.</p>
          <form className="hero-search" role="search" onSubmit={submit}>
            <label className="hero-field">
              <Icon name="search" />
              <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Назва, опис або тег — наприклад, «замок»" aria-label="Пошук маршрутів" enterKeyHint="search" />
            </label>
            <label className="hero-where">
              <Icon name="pin" size={18} />
              <select aria-label="Де шукати" value={near ? 'near' : 'any'} onChange={(e) => (e.target.value === 'near' ? locate() : setNear(null))}>
                <option value="any">Будь-де</option>
                <option value="near">Біля мене, {radiusKm} км</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary">Шукати</button>
          </form>
        </div>
      </section>

      <div className="filters container">
        <div className="chips" role="group" aria-label="Вид пересування">
          <button type="button" className={`chip${!mode ? ' on' : ''}`} aria-pressed={!mode} onClick={() => update({ mode: '' })}>Усі</button>
          {MODE_KEYS.map((m) => (
            <button key={m} type="button" className={`chip${mode === m ? ' on' : ''}`} aria-pressed={mode === m} onClick={() => update({ mode: mode === m ? '' : m })}>
              <span className="swatch" style={{ background: MODES[m].color }} />{MODES[m].label}
            </button>
          ))}
          <span className="chip-divider" aria-hidden="true" />
          <button type="button" className={`chip${minRating ? ' on' : ''}`} aria-pressed={!!minRating} onClick={() => update({ minRating: minRating ? '' : '4' })}>
            Рейтинг від 4 <Star size={14} color={minRating ? '#FFFFFF' : '#E39B2D'} />
          </button>
          {near ? (
            <span className="chip on chip-split">
              <Icon name="crosshair" size={16} />
              <select aria-label="Радіус пошуку" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
                {RADII.map((r) => <option key={r} value={r}>у радіусі {r} км</option>)}
              </select>
              <button type="button" aria-label="Скинути пошук поруч" onClick={() => setNear(null)}><Icon name="x" size={14} stroke={2.4} /></button>
            </span>
          ) : (
            <button type="button" className="chip" onClick={locate}><Icon name="crosshair" size={16} />Біля мене</button>
          )}
          {tag && (
            <button type="button" className="chip chip-tag" onClick={() => update({ tag: '' })} aria-label={`Прибрати фільтр за тегом ${tag}`}>
              #{tag}<Icon name="x" size={14} stroke={2.4} />
            </button>
          )}
        </div>
        <label className="sort">
          <span>Сортування</span>
          <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
            <option value="newest">Спочатку нові</option>
            <option value="rating">За рейтингом</option>
            <option value="length">Спочатку короткі</option>
          </select>
        </label>
      </div>

      <div className="view-switch container mobile-only">
        <div className="segmented" role="group" aria-label="Вигляд результатів">
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="list" size={18} />Список</button>
          <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}><Icon name="map" size={18} />Карта</button>
        </div>
      </div>

      <div className={`results container view-${view}`}>
        <section className="results-list" aria-busy={loading} aria-label="Результати пошуку">
          <p className="results-count" aria-live="polite">
            {loading && !data ? 'Шукаємо…' : <>Знайдено <b>{data?.total ?? 0} {plural(data?.total ?? 0, ['маршрут', 'маршрути', 'маршрутів'])}</b></>}
          </p>
          {loading && !data && [0, 1, 2].map((i) => <div key={i} className="route-card skeleton" aria-hidden="true" />)}
          {items.map((r) => <RouteCard key={r.id} r={r} active={hovered === r.id} onHover={setHovered} />)}
          {data && items.length === 0 && (
            <EmptyState icon="search" title="Нічого не знайдено" text="Спробуйте інші слова або приберіть частину фільтрів."
              action={hasFilters ? <button type="button" className="btn btn-secondary" onClick={resetAll}>Скинути фільтри</button> : undefined} />
          )}
          {pages > 1 && (
            <nav className="pager" aria-label="Сторінки">
              <button type="button" className="icon-btn" aria-label="Попередня сторінка" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}><Icon name="chevronLeft" /></button>
              <span>{page} / {pages}</span>
              <button type="button" className="icon-btn" aria-label="Наступна сторінка" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}><Icon name="chevronRight" /></button>
            </nav>
          )}
        </section>

        <RouteMap className="results-map" label="Карта маршрутів" markers={markers} activeMarkerId={hovered}
          near={near ? { point: near, radiusKm } : null} fitKey={items.map((r) => r.id).join(',') || 'empty'}
          onMapClick={(p) => { setNear(p); update({}); }}
          onViewChange={(c) => { setMapCenter(c); setAreaChanged(true); }}>
          {areaChanged && (
            <button type="button" className="map-float-btn" onClick={searchArea}><Icon name="search" size={16} />Шукати в цій області</button>
          )}
          <div className="map-legend" aria-label="Легенда">
            {MODE_KEYS.map((m) => <span key={m}><span className="swatch" style={{ background: MODES[m].color }} />{MODES[m].short}</span>)}
          </div>
        </RouteMap>
      </div>
    </div>
  );
}
