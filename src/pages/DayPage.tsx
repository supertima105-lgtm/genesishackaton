import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Columns2,
  Download,
  Film,
  Folder,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LiveMeter } from '../components/LiveMeter';
import { formatDate, MemoryCard } from '../components/memory/MemoryCard';
import { SongPlayer } from '../components/SongPlayer';
import { StepList } from '../components/StepList';
import { WhyPanel } from '../components/WhyPanel';
import { downloadBlob, exportFolderZip, folderName } from '../lib/folder';
import { baseOf, rebuildDay, restyle, retuneDay, systemAxes, type Step } from '../lib/pipeline';
import { usePlayer } from '../lib/player';
import { lookupSong } from '../lib/songMeta';
import { store } from '../lib/storage';
import { speakInBrowser } from '../lib/tts';
import { computeFeel, quickFeel } from '../lib/analysis/feel';
import type { Axes, DayFeel, DayRecord, FeelAxes } from '../lib/types';

const overrideKey = (o: Partial<Axes>) =>
  JSON.stringify(
    Object.keys(o)
      .sort()
      .map((k) => [k, Math.round((o[k as keyof Axes] as number) * 100)]),
  );
import { localToday, numberDays, plural, useFileUrls } from '../lib/useDays';
import { recordMemory, videoMime } from '../lib/video';

export function DayPage({ id, kino }: { id: string; kino: boolean }) {
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

  if (day === undefined) return <p className="label">Открываю папку дня…</p>;
  if (day === null)
    return (
      <p className="label">
        Такого дня нет в дневнике. <a href="#/" className="underline">В архив</a>
      </p>
    );
  return <DayView key={day.id} day={day} onChange={setDay} kino={kino} {...nav} />;
}

interface ViewProps {
  day: DayRecord;
  onChange: (d: DayRecord) => void;
  number: number;
  prev?: DayRecord;
  next?: DayRecord;
  kino: boolean;
}

function DayView({ day, onChange, number, prev, next, kino }: ViewProps) {
  const photoUrls = useFileUrls(day.photos);
  const excerptUrl = useFileUrls(day.songFile ? [day.songFile] : undefined)?.[0];
  const voiceUrl = useFileUrls(day.voice ? [day.voice] : undefined)?.[0];
  const videoUrl = useFileUrls(day.video ? [day.video] : undefined)?.[0];

  const cardRef = useRef<HTMLDivElement>(null);
  // Часы страницы: время и живой звук — из фрагмента песни (его отдаёт плеер с волной), иначе собственный таймер.
  const { clock, playing, playKey, media: mediaRef, bindMedia: onMedia, pause, toggle, restart } = usePlayer(day);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [busy, setBusy] = useState<null | 'zip' | 'video' | 'rebuild' | 'tune'>(null);
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(day.title);
  const [coverKey, setCoverKey] = useState(0);
  const voiceAudio = useRef<HTMLAudioElement | null>(null);
  const stopSpeech = useRef<(() => void) | null>(null);
  const report = (s: Step) => setSteps((p) => (p.some((x) => x.id === s.id) ? p.map((x) => (x.id === s.id ? s : x)) : [...p, s]));

  // ── «не так ощущалось»: ручные оси с живым предпросмотром ────
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

  const stopVoice = useCallback(() => {
    voiceAudio.current?.pause();
    stopSpeech.current?.();
    if (mediaRef.current) mediaRef.current.volume = 1;
    setVoicePlaying(false);
  }, []);
  const startVoice = () => {
    if (mediaRef.current) mediaRef.current.volume = 0.3; // музыка приглушается под голос
    if (voiceUrl) {
      const a = new Audio(voiceUrl);
      voiceAudio.current = a;
      a.onended = stopVoice;
      void a.play().catch(stopVoice);
    } else {
      stopSpeech.current = speakInBrowser(day.text, day.style.voice, stopVoice);
    }
    setVoicePlaying(true);
  };
  const toggleVoice = () => (voicePlaying ? stopVoice() : startVoice());
  useEffect(() => () => stopVoice(), [stopVoice]);

  // ── кинорежим ────────────────────────────────────────────────
  const exitKino = useCallback(() => (location.hash = `#/day/${day.id}`), [day.id]);
  const go = useCallback((d?: DayRecord) => d && (location.hash = `#/day/${d.id}${kino ? '/kino' : ''}`), [kino]);
  useEffect(() => {
    if (!kino) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitKino();
      if (e.key === 'ArrowRight') go(next);
      if (e.key === 'ArrowLeft') go(prev);
      if (e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kino, next, prev, exitKino, go]);

  // в кино день начинает жить сам: музыка, затем голос
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!kino || autoStarted.current || !photoUrls?.length) return;
    if (day.songFile && !excerptUrl) return; // ждём фрагмент песни
    autoStarted.current = true;
    const a = window.setTimeout(restart, 700);
    const b = window.setTimeout(startVoice, 2600);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kino, photoUrls, excerptUrl, voiceUrl]);

  // ── обложка ──────────────────────────────────────────────────
  const coverSaved = useRef(Boolean(day.cover));
  useEffect(() => {
    coverSaved.current = Boolean(day.cover);
  }, [day.cover]);
  const onCover = useCallback(
    async (blob: Blob) => {
      if (coverSaved.current) return;
      coverSaved.current = true;
      const ref = await store.putFile(`${baseOf(day)}/cover.jpg`, blob);
      const latest = (await store.get(day.id)) ?? day;
      await store.save({ ...latest, cover: ref });
    },
    [day],
  );

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
    stopVoice();
    setBusy('tune');
    setSteps([]);
    try {
      const latest = (await store.get(day.id)) ?? day;
      const next = await retuneDay(latest, o, report);
      coverSaved.current = false;
      setCoverKey((k) => k + 1);
      setOverride(next.axesOverride ?? {});
      onChange(next);
    } catch (e) {
      alert(`Не удалось сохранить: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };
  const rebuild = async () => {
    stopVoice();
    pause();
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
  const makeVideo = async () => {
    if (!cardRef.current) return;
    stopVoice();
    setBusy('video');
    setProgress(0);
    try {
      const m = mediaRef.current;
      const seconds = Math.min(30, m && Number.isFinite(m.duration) && m.duration > 0 ? m.duration - 0.3 : 16);
      if (m) {
        m.loop = false;
        m.currentTime = 0;
      }
      restart();
      const blob = await recordMemory({ card: cardRef.current, media: m, day, number, seconds, onProgress: setProgress });
      pause();
      if (m) m.loop = true;
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const ref = await store.putFile(`${baseOf(day)}/memory.${ext}`, blob);
      const latest = (await store.get(day.id)) ?? day;
      const next = { ...latest, video: ref };
      await store.save(next);
      onChange(next);
      downloadBlob(blob, `${day.folder}.${ext}`);
    } catch (e) {
      alert(`Не удалось записать видео: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const date = formatDate(day.date);
  const files = [
    'запись.txt',
    `фото × ${day.photos.length}`,
    day.songFile ? 'песня-фрагмент.wav' : 'песня.txt (ссылка)',
    day.voice ? 'озвучка.wav' : null,
    day.video ? `воспоминание.${day.video.mime.includes('mp4') ? 'mp4' : 'webm'}` : null,
    'обложка.jpg',
    'почему-так.txt',
    'стиль.json',
  ].filter(Boolean);
  const backdrop = `color-mix(in oklab, ${day.style.palette.paper} 14%, #0c0b0a)`;
  const stampDate = new Date(day.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="min-w-0">
        <div
          className={kino ? 'fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 p-4' : 'pt-3 lg:sticky lg:top-6'}
          style={kino ? { background: backdrop, transition: 'background .6s' } : undefined}
        >
          {/* вне кино карточка дня — полароид на скотче; в кино рамки нет */}
          <div className={kino ? 'contents' : 'polaroid mx-auto max-w-[480px] -rotate-[1.2deg]'}>
          {!kino && (
            <>
              <span className="tape -top-3 left-10 -rotate-6" />
              <span className="tape tape-blue -top-2 right-8 rotate-[8deg]" />
            </>
          )}
          <div ref={cardRef} className="relative w-full" style={kino ? { width: 'min(92vw, calc((100vh - 120px) * 0.8))' } : undefined}>
            {photoUrls && photoUrls.length > 0 ? (
              <MemoryCard
                day={view}
                number={number}
                photoUrls={photoUrls}
                live
                clock={clock}
                playKey={playKey}
                onCover={day.cover || dirty ? undefined : onCover}
                coverKey={coverKey}
              />
            ) : (
              <div className="aspect-[4/5] w-full animate-pulse" style={{ background: day.style.palette.paper }} />
            )}
            {busy === 'video' && (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
                <div className="h-full bg-rust transition-[width]" style={{ width: `${progress * 100}%` }} />
              </div>
            )}
          </div>
          {!kino && (
            <div className="pointer-events-none absolute inset-x-3 bottom-2 truncate text-center font-hand text-[26px] leading-tight text-blue">
              {day.signals.text.moodWords.join(' · ')}
            </div>
          )}
          </div>

          {kino ? (
            <div className="flex items-center gap-2 text-paper">
              <button type="button" className="btn border-paper/40 bg-transparent text-paper shadow-none hover:bg-white/10" onClick={() => go(prev)} disabled={!prev} aria-label="Предыдущий день">
                <ChevronLeft size={14} />
              </button>
              <button type="button" className="btn border-paper/40 bg-transparent text-paper shadow-none hover:bg-white/10" onClick={toggle}>
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button type="button" className="btn border-paper/40 bg-transparent text-paper shadow-none hover:bg-white/10" onClick={toggleVoice} aria-label="Голос">
                {voicePlaying ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <button type="button" className="btn border-paper/40 bg-transparent text-paper shadow-none hover:bg-white/10" onClick={() => go(next)} disabled={!next} aria-label="Следующий день">
                <ChevronRight size={14} />
              </button>
              <button type="button" className="btn border-paper/40 bg-transparent text-paper shadow-none hover:bg-white/10" onClick={exitKino} aria-label="Выйти из кинорежима">
                <X size={14} />
              </button>
              <div className="ml-4 hidden sm:block">
                <LiveMeter clock={clock} style={view.style} light />
              </div>
            </div>
          ) : (
            <>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
              <button type="button" className="btn btn-solid" onClick={toggle} disabled={busy === 'video'}>
                {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Пауза' : 'Прожить день'}
              </button>
              <button type="button" className="btn" onClick={restart} aria-label="С начала" disabled={busy === 'video'}>
                <RotateCcw size={14} />
              </button>
              <a href={`#/day/${day.id}/kino`} className="btn">
                <Clapperboard size={14} /> Кино
              </a>
              <a href={`#/compare/${day.id}`} className="btn" title="Сравнить с другим днём">
                <Columns2 size={14} />
              </a>
            </div>
            <div className="mt-5 flex justify-center">
              <LiveMeter clock={clock} style={view.style} />
            </div>
            </>
          )}
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
        <span className="stain right-6 bottom-24 hidden sm:block" aria-hidden />
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

        <div className="mt-10 grid gap-8 xl:grid-cols-[1.45fr_1fr] xl:items-start">
          <SongPlayer day={day} excerptUrl={excerptUrl} onMedia={onMedia} playing={playing} />
          <VoiceNote playing={voicePlaying} onToggle={toggleVoice} label={day.style.voice.label} remark={day.style.voice.style} />
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
              {videoUrl && <video src={videoUrl} controls className="mt-3 w-40 border border-line" />}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={makeVideo}
                  disabled={Boolean(busy) || dirty || !photoUrls?.length || !videoMime()}
                  title={dirty ? 'Сначала сохраните поправленные оси' : undefined}
                >
                  <Film size={14} /> {busy === 'video' ? `Записываю… ${Math.round(progress * 100)}%` : day.video ? 'Перезаписать видео' : 'Видео'}
                </button>
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
              {busy === 'video' && <p className="label mt-2 normal-case tracking-normal">Не переключайте вкладку, пока идёт запись.</p>}
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

const WAVE = Array.from({ length: 30 }, (_, i) => Math.round(22 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)) * 72));

/** Голос записи — как голосовая заметка, приклеенная к странице. */
function VoiceNote({ playing, onToggle, label, remark }: { playing: boolean; onToggle: () => void; label: string; remark: string }) {
  return (
    <div className="relative mt-3 -rotate-[1.2deg] bg-white px-4 pt-3 pb-2 shadow-[0_8px_14px_-6px_rgba(0,0,0,.25)]">
      <span className="tape tape-pink -top-3 left-1/3 h-6 w-20 rotate-3" />
      <div className="label">голос записи</div>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? 'Остановить голос' : 'Послушать запись'}
          className="grid h-10 w-10 flex-none place-items-center rounded-full border-2 border-blue text-blue transition hover:bg-blue hover:text-white"
        >
          {playing ? <Pause size={16} /> : <Play size={16} className="translate-x-px" />}
        </button>
        <div className="flex h-8 flex-1 items-center gap-[2px]" aria-hidden>
          {WAVE.map((h, i) => (
            <i key={i} className={`flex-1 rounded-sm bg-blue/70 ${playing ? 'animate-pulse' : ''}`} style={{ height: `${h}%`, animationDelay: `${(i % 7) * 90}ms` }} />
          ))}
        </div>
      </div>
      <div className="mt-1 font-hand text-[22px] text-ink-soft" title={`«${remark}»`}>
        {label}
      </div>
    </div>
  );
}
