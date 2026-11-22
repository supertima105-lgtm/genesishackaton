import { BookOpen, Clapperboard, Columns2, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AddToFolder, DropDock, FolderShelf } from '../components/Folders';
import { freshCover } from '../components/memory/layout';
import { formatDate, MemoryCard } from '../components/memory/MemoryCard';
import { Pinboard, PinnedCard } from '../components/Pinboard';
import { exportExamples, hasExamples, importExamples } from '../lib/examples';
import { useFolders } from '../lib/shelf';
import { store } from '../lib/storage';
import { accountsOn } from '../lib/supabase';
import type { DayRecord } from '../lib/types';
import { numberDays, plural, useDays, useFileUrls } from '../lib/useDays';

export function Archive() {
  const { days, error } = useDays();
  const folderList = useFolders() ?? [];
  const [q, setQ] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const numbers = useMemo(() => numberDays(days ?? []), [days]);
  const byId = useMemo(() => new Map((days ?? []).map((d) => [d.id, d])), [days]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!days) return [];
    if (!s) return days;
    return days.filter((d) => [d.title, d.text, d.song.artist, d.song.title, ...d.signals.text.moodWords].join(' ').toLowerCase().includes(s));
  }, [days, q]);

  const groups = useMemo(() => {
    const m = new Map<string, DayRecord[]>();
    for (const d of filtered) {
      const k = new Date(d.date + 'T12:00:00').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return [...m.entries()];
  }, [filtered]);

  if (error) return <p className="label text-rust">Ошибка хранилища: {error}</p>;
  if (!days) return <p className="label">Открываю дневник…</p>;

  if (days.length === 0)
    return (
      <section className="mx-auto max-w-xl py-16 text-center">
        <p className="font-hand text-5xl leading-tight font-bold text-blue">Дневник пока пуст</p>
        <p className="mt-4 text-ink-soft">
          Начните с любимого дня: текст, фото и та самая песня.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="#/new" className="btn btn-solid">
            Записать первый день
          </a>
          <ExamplesButton />
        </div>
        <p className="label mt-6">
          хранилище: {store.kind === 'supabase' ? 'ваш аккаунт' : 'этот браузер (IndexedDB)'}
          {accountsOn && store.kind === 'local' && (
            <>
              {' · '}
              <a href="#/settings" className="underline">
                войти, чтобы хранить в облаке
              </a>
            </>
          )}
        </p>
      </section>
    );

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-hand text-5xl leading-none font-bold text-blue">Былые дни</h1>
          <p className="label mt-1">
            {days.length} {plural(days.length, 'страница', 'страницы', 'страниц')} · хранилище: {store.kind === 'supabase' ? 'ваш аккаунт' : 'этот браузер'}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          {days.length > 1 && (
            <a href="#/show" className="btn">
              <Clapperboard size={14} /> Показ
            </a>
          )}
          {days.length > 1 && (
            <a href="#/compare" className="btn">
              <Columns2 size={14} /> Сравнить
            </a>
          )}
          <label className="flex w-full max-w-xs flex-1 items-center gap-2 border-b border-line focus-within:border-ink sm:w-64">
            <Search size={14} className="text-ink-soft" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="поиск: «какао», «офис», «Синатра»" className="w-full bg-transparent py-2 text-sm outline-none" />
          </label>
        </div>
      </div>

      {!q && <OnThisDay days={days} numbers={numbers} />}
      {!q && <FolderShelf list={folderList} byId={byId} />}

      {groups.map(([month, list]) => (
        <div key={month} className="mb-12">
          <h2 className="mb-6 font-hand text-3xl font-bold text-ink-soft">{month}</h2>
          <Pinboard>
            {list.map((d, i) => (
              <PinnedCard key={d.id} day={d} number={numbers.get(d.id) ?? 0} index={i} onDrag={setDragging} extra={<AddToFolder day={d} list={folderList} />} />
            ))}
          </Pinboard>
        </div>
      ))}
      {filtered.length === 0 && <p className="label">Ничего не нашлось.</p>}
      {import.meta.env.DEV && <DevExport />}
      <DropDock active={Boolean(dragging)} list={folderList} byId={byId} />
    </section>
  );
}

/** Пустой дневник: можно посмотреть на примеры дней — если они есть в этой сборке. */
function ExamplesButton() {
  const [state, setState] = useState<'idle' | 'busy' | 'none'>('idle');
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    void hasExamples().then(setAvailable);
  }, []);
  if (!available) return null;
  if (state === 'none') return <span className="label self-center">примеров нет в этой сборке</span>;
  return (
    <button
      type="button"
      className="btn"
      disabled={state === 'busy'}
      onClick={async () => {
        setState('busy');
        const n = await importExamples();
        if (n) location.reload();
        else setState('none');
      }}
    >
      {state === 'busy' ? 'Открываю…' : 'Посмотреть примеры дней'}
    </button>
  );
}

/** Только в dev: текущий архив → public/examples (их подхватят деплой и автономный index.html). */
function DevExport() {
  const [msg, setMsg] = useState('');
  return (
    <div className="mt-16 flex flex-wrap items-center gap-3 border-t border-dashed border-line pt-4">
      <span className="label">dev</span>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          setMsg('сохраняю…');
          try {
            const r = await exportExamples();
            setMsg(`сохранено ${r.days} дн., ${r.mb} МБ → public/examples. Пересоберите index.html: npm run build:standalone`);
          } catch (e) {
            setMsg(`ошибка: ${(e as Error).message}`);
          }
        }}
      >
        Сохранить архив как примеры
      </button>
      <span className="text-sm text-ink-soft">{msg}</span>
    </div>
  );
}

const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const doy = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return (Date.UTC(2001, m - 1, d) - Date.UTC(2001, 0, 1)) / 864e5; // день года без учёта високосности
};

/** «Год назад в этот день»: тот же день прошлых лет, а если такого нет — ближайший в пределах трёх дней. */
function OnThisDay({ days, numbers }: { days: DayRecord[]; numbers: Map<string, number> }) {
  const today = localToday();
  const year = Number(today.slice(0, 4));
  const past = days.filter((d) => Number(d.date.slice(0, 4)) < year);
  const exact = past.filter((d) => d.date.slice(5) === today.slice(5));
  const near = exact.length
    ? exact
    : past.filter((d) => {
        const diff = Math.abs(doy(d.date) - doy(today));
        return Math.min(diff, 365 - diff) <= 3;
      });
  const day = [...near].sort((a, b) => b.date.localeCompare(a.date))[0];
  const latest = [...days].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
  const fresh = day && freshCover(day);
  const cover = useFileUrls(fresh ? [fresh] : undefined);
  const first = useFileUrls(day ? day.photos.slice(0, 1) : undefined);
  if (!day) return null;

  const ago = year - Number(day.date.slice(0, 4));
  const agoText = ago === 1 ? 'Год назад' : `${ago} ${plural(ago, 'год', 'года', 'лет')} назад`;
  return (
    <section className="relative mb-12 grid -rotate-[0.4deg] items-center gap-6 bg-note/60 p-5 shadow-[0_10px_20px_-10px_rgba(0,0,0,.25)] sm:grid-cols-[150px_1fr] sm:p-6">
      <span className="tape -top-3 left-1/2 -translate-x-1/2 rotate-2" />
      <a href={`#/day/${day.id}`} className="polaroid block w-36 -rotate-3 pb-5 sm:w-auto">
        <MemoryCard day={day} number={numbers.get(day.id) ?? 0} photoUrls={first ?? []} coverUrl={cover?.[0]} />
      </a>
      <div className="min-w-0">
        <div className="label">
          {agoText}
          {exact.length ? ' в этот день' : ', примерно в эти дни'} · {formatDate(day.date).long}
        </div>
        <h2 className="mt-2 font-hand text-4xl leading-none font-bold text-blue">{day.title}</h2>
        <p className="mt-2 text-lg text-ink-soft italic">{day.signals.text.caption}</p>
        <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-ink-soft">{day.text}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`#/day/${day.id}`} className="btn btn-solid">
            <BookOpen size={14} /> Открыть день
          </a>
          {latest && latest.id !== day.id && (
            <a href={`#/compare/${day.id}/${latest.id}`} className="btn">
              <Columns2 size={14} /> Тогда и сейчас
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
