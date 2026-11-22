import { Columns2, Download, Folder, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, MemoryCard } from '../components/memory/MemoryCard';
import { SongPlayer } from '../components/SongPlayer';
import { StepList } from '../components/StepList';
import { WhyPanel } from '../components/WhyPanel';
import { freshCover, sheetRatio } from '../components/memory/layout';
import { Fastener, handOf, useEmotion } from '../components/memory/Material';
import { useDayAspect } from '../lib/aspect';
import { downloadBlob, exportFolderZip, folderName } from '../lib/folder';
import { rebuildDay, restyle, retuneDay, saveCover, systemAxes, type Step } from '../lib/pipeline';
import { lookupSong } from '../lib/songMeta';
import { folders } from '../lib/shelf';
import { onDayChange, store } from '../lib/storage';
import { computeFeel, quickFeel } from '../lib/analysis/feel';
import type { Axes, DayFeel, DayRecord, FeelAxes } from '../lib/types';

const overrideKey = (o: Partial<Axes>) =>
  JSON.stringify(
    Object.keys(o)
      .sort()
      .map((k) => [k, Math.round((o[k as keyof Axes] as number) * 100)]),
  );
import { localToday, numberDays, plural, useFileUrls } from '../lib/useDays';

export function DayPage({ id }: { id: string }) {
  const [day, setDay] = useState<DayRecord | null | undefined>(undefined);
  const [nav, setNav] = useState<{ number: number; prev?: DayRecord; next?: DayRecord }>({ number: 0 });
  useEffect(() => {
    store.get(id).then(setDay).catch(() => setDay(null));
    store
      .list()
      .then((l) => {
        const asc = [...l].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
        const i = asc.findIndex((d) => d.id === id);
        setNav({ number: numberDays(l).get(id) ?? 0, prev: asc[i - 1], next: asc[i + 1] });
      })
      .catch(() => {});
  }, [id]);
  // обложка и формат фото дописываются в фоне — подхватываем, не перезагружая страницу
  useEffect(
    () =>
      onDayChange(
        (d) => d.id === id && setDay((cur) => (cur ? { ...cur, cover: d.cover, coverLayout: d.coverLayout, photoAspect: d.photoAspect, style: d.style, reasons: d.reasons, axes: d.axes } : cur)),
      ),
    [id],
  );

  if (day === undefined) return <p className="label">Открываю папку дня…</p>;
  if (day === null)
    return (
      <p className="label">
        Такого дня нет в дневнике. <a href="#/" className="underline">В архив</a>
      </p>
    );
  return <DayView key={day.id} day={day} onChange={setDay} {...nav} />;
}

interface ViewProps {
  day: DayRecord;
  onChange: (d: DayRecord) => void;
  number: number;
  prev?: DayRecord;
  next?: DayRecord;
}

function DayView({ day, onChange, number, prev, next }: ViewProps) {
  const photoUrls = useFileUrls(day.photos);
  const excerptUrl = useFileUrls(day.songFile ? [day.songFile] : undefined)?.[0];

  const [busy, setBusy] = useState<null | 'zip' | 'rebuild' | 'tune'>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(day.title);
  const [coverKey, setCoverKey] = useState(0);
  const report = (s: Step) => setSteps((p) => (p.some((x) => x.id === s.id) ? p.map((x) => (x.id === s.id ? s : x)) : [...p, s]));

  // ── «не так ощущалось»: ручные оси — кадр, почерк и материал страницы перестраиваются сразу ────
  const [override, setOverride] = useState<Partial<Axes>>(day.axesOverride ?? {});
  const base = useMemo(() => systemAxes(day), [day]);
  const dirty = overrideKey(override) !== overrideKey(day.axesOverride ?? {});
  const view = useMemo(() => (dirty ? restyle(day, override) : day), [day, override, dirty]);
  const onAxis = (k: keyof Axes, v: number) =>
    setOverride((o) => {
      const n = { ...o, [k]: v };
      if (Math.abs(base[k] - v) < 0.015) delete n[k]; // вернули на место системы — это не поправка
      return n;
    });

  // ── обложка ──────────────────────────────────────────────────
  const hasCover = Boolean(freshCover(day));
  const coverSaved = useRef(hasCover);
  useEffect(() => {
    coverSaved.current = hasCover;
  }, [hasCover]);
  const onCover = useCallback(
    async (blob: Blob) => {
      if (coverSaved.current) return;
      coverSaved.current = true;
      await saveCover(day, blob);
    },
    [day],
  );
  const aspect = useDayAspect(day);
  const ratio = sheetRatio(view.style.layout.frame, aspect);
  const emotion = useEmotion(view);

  // ── «Глубже в день»: второй слой ощущений, считается по кнопке, кадр не трогает ──
  const [feel, setFeel] = useState<DayFeel | undefined>(day.feel);
  const [feelBusy, setFeelBusy] = useState(false);
  const feelTimer = useRef<number | undefined>(undefined);
  const storeFeel = async (f: DayFeel | undefined) => {
    const latest = (await store.get(day.id)) ?? day;
    const next = { ...latest, feel: f };
    await store.save(next);
    onChange(next);
  };
  const computeFeelNow = async () => {
    setFeelBusy(true);
    try {
      const latest = (await store.get(day.id)) ?? day;
      setFeel(quickFeel(latest)); // сразу — по словам и измерениям; ответ Gemini подвинет ползунки
      const f = await computeFeel(latest);
      setFeel(f);
      await storeFeel(f);
    } finally {
      setFeelBusy(false);
    }
  };
  const onFeelAxis = (k: keyof FeelAxes, v: number) => {
    if (!feel) return;
    const f = { ...feel, axes: { ...feel.axes, [k]: Math.abs(feel.system[k] - v) < 0.015 ? feel.system[k] : v } };
    setFeel(f);
    window.clearTimeout(feelTimer.current);
    feelTimer.current = window.setTimeout(() => void storeFeel(f), 500);
  };
  const resetFeel = () => {
    if (!feel) return;
    const f = { ...feel, axes: feel.system };
    setFeel(f);
    void storeFeel(f);
  };
  useEffect(() => () => window.clearTimeout(feelTimer.current), []);

  // ── старые записи: исполнитель и название — один раз по ссылке ──
  useEffect(() => {
    const url = day.song.link?.url;
    if (!url || day.song.checked) return;
    let alive = true;
    void lookupSong(url).then(async (m) => {
      if (!m) return; // сервис не ответил — попробуем при следующем открытии
      const latest = (await store.get(day.id)) ?? day;
      const song = { ...latest.song, checked: true, artist: m.artist || latest.song.artist, title: m.title || latest.song.title };
      const changed = song.artist !== latest.song.artist || song.title !== latest.song.title;
      const next = { ...latest, song, ...(changed ? { cover: undefined } : {}) };
      await store.save(next);
      if (!alive) return;
      if (changed) {
        coverSaved.current = false;
        setCoverKey((k) => k + 1);
      }
      onChange(next);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.id]);

  // ── действия с папкой ───────────────────────────────────────
  const download = async () => {
    setBusy('zip');
    try {
      const latest = (await store.get(day.id)) ?? day;
      downloadBlob(await exportFolderZip(latest, store), `${day.folder}.zip`);
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!confirm(`Удалить папку «${day.folder}» без возможности восстановления?`)) return;
    await store.remove(day);
    await folders.forgetDay(day.id);
    location.hash = '#/';
  };
  const saveTitle = async () => {
    const title = titleDraft.trim().replace(/\s+/g, ' ');
    setEditing(false);
    if (!title || title === day.title) return;
    const latest = (await store.get(day.id)) ?? day;
    const next = { ...latest, title, folder: folderName(day.date, title), titleEdited: true };
    await store.save(next);
    onChange(next);
  };
  const retune = async (o: Partial<Axes>) => {
    setBusy('tune');
    setSteps([]);
    try {
      const latest = (await store.get(day.id)) ?? day;
      const next = await retuneDay(latest, o, report);
      setOverride(next.axesOverride ?? {});
      coverSaved.current = false; // кадр в новом почерке — обложка для архива переснимается
      setCoverKey((k) => k + 1);
      onChange(next);
    } catch (e) {
      alert(`Не удалось сохранить: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };
  const rebuild = async () => {
    setBusy('rebuild');
    setSteps([]);
    try {
      const latest = (await store.get(day.id)) ?? day;
      const next = await rebuildDay(latest, report);
      setTitleDraft(next.title);
      coverSaved.current = false;
      setCoverKey((k) => k + 1);
      onChange(next);
    } catch (e) {
      alert(`Не удалось пересобрать: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };
  const date = formatDate(day.date);
  const files = [
    'запись.txt',
    `фото × ${day.photos.length}`,
    day.songFile ? 'песня-фрагмент.wav' : 'песня.txt (ссылка)',
    day.video ? `воспоминание.${day.video.mime.includes('mp4') ? 'mp4' : 'webm'}` : null,
    'обложка.jpg',
    'почему-так.txt',
    'стиль.json',
  ].filter(Boolean);
  const stampDate = new Date(day.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="min-w-0">
        <div className="pt-3 lg:sticky lg:top-6">
          {/* карточка дня — полароид на скотче */}
          {/* лист в формате фото: высокий снимок — уже, чтобы страница помещалась в экран */}
          <div className="polaroid mx-auto -rotate-[1.2deg]" style={{ maxWidth: `min(${ratio > 1 ? 600 : 480}px, calc((100vh - 130px) * ${ratio.toFixed(3)}))` }}>
            <Fastener e={emotion} accent={view.style.palette.accent} seed={view.style.shapes.seed} scale={1.35} />
            {photoUrls && photoUrls.length > 0 ? (
              // пока кружки двигают, лист показывает черновик ощущения; обложку снимаем только с сохранённого
              <MemoryCard day={view} number={number} photoUrls={photoUrls} live onCover={hasCover || dirty ? undefined : onCover} coverKey={coverKey} />
            ) : (
              <div className="w-full" style={{ aspectRatio: ratio, background: view.style.palette.paper }} />
            )}
            <div className="pointer-events-none absolute inset-x-3 bottom-2 truncate text-center leading-tight text-blue" style={{ ...handOf(emotion), fontSize: emotion.id === 'wonder' ? 30 : 24 }}>
              {day.signals.text.moodWords.join(' · ')}
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <a href={`#/compare/${day.id}`} className="btn" title="Сравнить с другим днём">
              <Columns2 size={14} /> Сравнить с другим днём
            </a>
          </div>
        </div>
      </div>

      <div className="spine lined min-w-0 pt-1 pb-4 pl-8 sm:pl-10 lg:pl-14">
        <a href={`#/calendar/${day.date.slice(0, 7)}`} className="stamp absolute top-0 right-0 z-[1] scale-[.82] hover:bg-blue/5 sm:scale-100" title="Открыть месяц в календаре">
          <span>
            {stampDate}
            <b>{day.date.slice(0, 4)}</b>
            {date.weekday}
          </span>
        </a>
        <div className="pr-28 font-hand text-2xl text-ink-soft">
          страница № {number} · {agoText(day.date)}
        </div>
        {editing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
            className="w-full border-b-2 border-dashed border-blue bg-transparent pr-28 font-hand text-5xl leading-tight font-bold text-blue outline-none"
          />
        ) : (
          <h1 className="group pr-28 font-hand text-5xl leading-[0.95] font-bold text-blue sm:text-6xl">
            {day.title}
            <button type="button" onClick={() => setEditing(true)} className="ml-2 align-middle text-ink-soft opacity-0 transition group-hover:opacity-100 focus:opacity-100" aria-label="Переименовать папку">
              <Pencil size={18} />
            </button>
          </h1>
        )}

        <p className="mt-6 max-w-2xl text-[19px] leading-[32px] whitespace-pre-line">{day.text}</p>
        {day.signals.text.caption && <div className="note mt-6 max-w-full">{day.signals.text.caption}</div>}

        <div className="mt-10 max-w-md">
          <SongPlayer day={day} excerptUrl={excerptUrl} />
        </div>

        <div className="mt-12">
          <WhyPanel
            day={view}
            tuning={{
              base,
              onAxis,
              dirty,
              overridden: Boolean(day.axesOverride && Object.keys(day.axesOverride).length),
              saving: busy === 'tune',
              onSave: () => retune(override),
              onReset: () => retune({}),
              onRevert: () => setOverride(day.axesOverride ?? {}),
            }}
            feel={{ value: feel, busy: feelBusy, onCompute: () => void computeFeelNow(), onAxis: onFeelAxis, onReset: resetFeel }}
          />
        </div>

        <div className="mt-12 space-y-8">
            <div>
              <div className="font-hand text-3xl font-bold">папка дня</div>
              <div className="mt-1 flex items-center gap-2 font-mono text-sm" title={files.join('\n')}>
                <Folder size={16} className="shrink-0 text-blue" /> {day.folder} <span className="text-ink-soft">· {files.length} файлов</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={download} disabled={Boolean(busy)}>
                  <Download size={14} /> {busy === 'zip' ? 'Собираю…' : 'Папка .zip'}
                </button>
                <button type="button" className="btn" onClick={rebuild} disabled={Boolean(busy)} title="Заново проанализировать день по текущим правилам">
                  <RefreshCw size={14} className={busy === 'rebuild' ? 'animate-spin' : ''} /> Пересобрать
                </button>
                <button type="button" className="btn" onClick={remove} aria-label="Удалить день" disabled={Boolean(busy)}>
                  <Trash2 size={14} />
                </button>
              </div>
              {steps.length > 0 && (
                <div className="mt-4">
                  <StepList steps={steps} />
                </div>
              )}
            </div>
            {(prev || next) && (
              <div className="flex justify-between gap-4 border-t-2 border-dashed border-line pt-4 font-hand text-2xl">
                {prev ? (
                  <a href={`#/day/${prev.id}`} className="text-blue hover:underline">
                    ← {prev.title}
                  </a>
                ) : (
                  <span />
                )}
                {next && (
                  <a href={`#/day/${next.id}`} className="text-right text-blue hover:underline">
                    {next.title} →
                  </a>
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

/** «Это было …» — сколько времени прошло с того дня. */
function agoText(iso: string): string {
  const days = Math.round((Date.parse(localToday() + 'T12:00:00') - Date.parse(iso + 'T12:00:00')) / 864e5);
  if (days <= 0) return 'это сегодня';
  if (days === 1) return 'это было вчера';
  if (days < 7) return `это было ${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
  if (days < 30) {
    const w = Math.round(days / 7);
    return w === 1 ? 'это было неделю назад' : `это было ${w} ${plural(w, 'неделю', 'недели', 'недель')} назад`;
  }
  if (days < 365) {
    const m = Math.round(days / 30.4);
    return m === 1 ? 'это было месяц назад' : `это было ${m} ${plural(m, 'месяц', 'месяца', 'месяцев')} назад`;
  }
  const y = Math.floor(days / 365);
  return y === 1 ? 'это было год назад' : `это было ${y} ${plural(y, 'год', 'года', 'лет')} назад`;
}

