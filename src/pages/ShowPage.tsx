import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LiveMeter } from '../components/LiveMeter';
import { formatDate, MemoryCard } from '../components/memory/MemoryCard';
import { usePlayer } from '../lib/player';
import { TRANSITION_RU } from '../lib/rules/engine';
import { mostContrasting } from '../lib/rules/labels';
import { MODES } from '../lib/rules/modes';
import { speakInBrowser } from '../lib/tts';
import type { DayRecord } from '../lib/types';
import { numberDays, plural, useDays, useFileUrls } from '../lib/useDays';

const SLIDE_SECONDS = 13;
const MAX_SECONDS = 50;
const LIGHT = '#efe9df';

/**
 * Показ для жюри: самые непохожие дни дневника подряд, каждый со своей песней и голосом.
 * Одна кнопка — и готов материал для видео: видно, что система одна, а настроения разные.
 */
export function ShowPage() {
  const { days, error } = useDays();
  const numbers = useMemo(() => numberDays(days ?? []), [days]);
  const [order, setOrder] = useState<'contrast' | 'date'>('contrast');
  const [withVoice, setWithVoice] = useState(true);
  const [phase, setPhase] = useState<'intro' | 'play' | 'end'>('intro');
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const list = useMemo(() => {
    if (!days?.length) return [];
    if (order === 'date') return [...days].sort((a, b) => a.date.localeCompare(b.date));
    return mostContrasting(days, Math.min(5, days.length));
  }, [days, order]);

  const begin = () => {
    setI(0);
    setProgress(0);
    setPaused(false);
    setPhase('play');
  };
  const go = (d: number) => {
    const n = i + d;
    if (n < 0) return;
    setProgress(0);
    if (n >= list.length) setPhase('end');
    else setI(n);
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'play') setPhase('intro');
        else location.hash = '#/';
      }
      if (phase !== 'play') return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const current = phase === 'play' ? list[i] : undefined;
  const backdrop = `color-mix(in oklab, ${current?.style.palette.paper ?? '#efeae2'} 14%, #0c0b0a)`;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: backdrop, color: LIGHT, transition: 'background 1.2s' }}>
      {error && <p className="p-8 font-mono text-sm">Ошибка хранилища: {error}</p>}
      {!days && !error && <p className="p-8 font-mono text-sm opacity-60">Открываю дневник…</p>}

      {days && phase === 'intro' && (
        <div className="mx-auto flex h-full max-w-5xl flex-col justify-center px-6">
          <div className="font-mono text-[11px] tracking-[0.14em] uppercase opacity-60">показ · атмосфера</div>
          <h1 className="mt-3 font-serif text-5xl leading-tight">
            Один дневник — {list.length} {plural(list.length, 'настроение', 'настроения', 'настроений')}
          </h1>
          <p className="mt-4 max-w-2xl text-lg opacity-75">
            Дни идут подряд, каждый со своей песней. Справа видно, почему страница выглядит так и что она слышит в музыке прямо сейчас.
          </p>
          {list.length === 0 ? (
            <p className="mt-8 font-mono text-sm opacity-70">
              В дневнике пока нет дней. <a href="#/new" className="underline">Записать день</a>
            </p>
          ) : (
            <>
              <div className="mt-8 flex gap-3 overflow-x-auto pb-2">
                {list.map((d, k) => (
                  <Thumb key={d.id} day={d} number={numbers.get(d.id) ?? 0} index={k} />
                ))}
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-6 font-mono text-xs tracking-wider uppercase">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" checked={order === 'contrast'} onChange={() => setOrder('contrast')} className="accent-[#efe9df]" /> самые непохожие (до 5)
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" checked={order === 'date'} onChange={() => setOrder('date')} className="accent-[#efe9df]" /> все по порядку
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={withVoice} onChange={(e) => setWithVoice(e.target.checked)} className="accent-[#efe9df]" /> с голосом
                </label>
              </div>
              <div className="mt-8 flex items-center gap-4">
                <button type="button" className="btn border-[#efe9df] bg-[#efe9df] text-[#1f1c19] hover:!bg-transparent hover:!text-[#efe9df]" onClick={begin} autoFocus>
                  <Play size={14} /> Начать показ
                </button>
                <a href="#/" className="font-mono text-xs tracking-wider uppercase opacity-60 hover:opacity-100">
                  Esc · в архив
                </a>
              </div>
              <p className="mt-6 font-mono text-[11px] tracking-wider uppercase opacity-45">пробел — пауза · ← → — листать · Esc — выход</p>
            </>
          )}
        </div>
      )}

      {phase === 'play' && current && (
        <>
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Slide
                day={current}
                number={numbers.get(current.id) ?? 0}
                index={i}
                total={list.length}
                withVoice={withVoice}
                paused={paused}
                onProgress={setProgress}
                onDone={() => go(1)}
              />
            </motion.div>
          </AnimatePresence>

          <div className="absolute inset-x-0 bottom-0 flex items-center gap-4 px-6 pb-4">
            <div className="flex gap-1.5">
              <button type="button" className="btn border-white/30 px-2.5 text-current" onClick={() => go(-1)} disabled={i === 0} aria-label="Предыдущий день">
                <ChevronLeft size={14} />
              </button>
              <button type="button" className="btn border-white/30 px-2.5 text-current" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Продолжить' : 'Пауза'}>
                {paused ? <Play size={14} /> : <Pause size={14} />}
              </button>
              <button type="button" className="btn border-white/30 px-2.5 text-current" onClick={() => go(1)} aria-label="Следующий день">
                <ChevronRight size={14} />
              </button>
              <button type="button" className="btn border-white/30 px-2.5 text-current" onClick={() => setPhase('intro')} aria-label="Остановить показ">
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-1 gap-1">
              {list.map((d, k) => (
                <div key={d.id} className="h-0.5 flex-1 overflow-hidden bg-white/15">
                  <div className="h-full" style={{ background: d.style.palette.accent, width: `${k < i ? 100 : k === i ? progress * 100 : 0}%` }} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {phase === 'end' && (
        <motion.div className="mx-auto flex h-full max-w-6xl flex-col justify-center px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}>
          <h2 className="font-serif text-5xl leading-tight">
            Один дневник. {list.length} {plural(list.length, 'день', 'разных дня', 'разных дней')}.
          </h2>
          <p className="mt-3 max-w-2xl text-lg opacity-75">
            Формат, шапка, название и бумага не меняются. Почерк, палитра, ритм и голос рождаются из текста, фото и песни каждого дня.
          </p>
          <div className="mt-8 flex gap-3 overflow-x-auto pb-2">
            {list.map((d, k) => (
              <Thumb key={d.id} day={d} number={numbers.get(d.id) ?? 0} index={k} withMode />
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn border-[#efe9df] bg-[#efe9df] text-[#1f1c19] hover:!bg-transparent hover:!text-[#efe9df]" onClick={begin}>
              <Play size={14} /> Ещё раз
            </button>
            <a href="#/compare" className="btn border-white/40 text-current">
              Сравнить два дня
            </a>
            <a href="#/" className="btn border-white/40 text-current">
              В архив
            </a>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Thumb({ day, number, index, withMode }: { day: DayRecord; number: number; index: number; withMode?: boolean }) {
  const cover = useFileUrls(day.cover ? [day.cover] : undefined);
  const first = useFileUrls(day.photos.slice(0, 1));
  return (
    <div className="w-36 shrink-0 sm:w-44">
      <MemoryCard day={day} number={number} photoUrls={first ?? []} coverUrl={cover?.[0]} />
      <div className="mt-2 font-mono text-[10px] tracking-wider uppercase opacity-55">
        {index + 1} · {withMode ? MODES[day.style.mode].name : formatDate(day.date).short}
      </div>
      <div className="mt-0.5 truncate font-serif text-base leading-tight">{day.title}</div>
    </div>
  );
}

interface SlideProps {
  day: DayRecord;
  number: number;
  index: number;
  total: number;
  withVoice: boolean;
  paused: boolean;
  onProgress: (p: number) => void;
  onDone: () => void;
}

function Slide({ day, number, index, total, withVoice, paused, onProgress, onDone }: SlideProps) {
  const photoUrls = useFileUrls(day.photos);
  const excerptUrl = useFileUrls(day.songFile ? [day.songFile] : undefined)?.[0];
  const voiceUrl = useFileUrls(day.voice ? [day.voice] : undefined)?.[0];
  const player = usePlayer(day, excerptUrl);
  const ready = Boolean(photoUrls?.length) && (!day.songFile || Boolean(excerptUrl)) && (!withVoice || !day.voice || Boolean(voiceUrl));

  const cb = useRef({ onProgress, onDone, paused });
  cb.current = { onProgress, onDone, paused };
  const voice = useRef<{ audio?: HTMLAudioElement; stop?: () => void; on: boolean }>({ on: false });
  const started = useRef(false);

  // старт: музыка сразу, голос — когда страница уже проявилась
  useEffect(() => {
    if (!ready) return;
    const unduck = () => {
      voice.current.on = false;
      if (player.media.current) player.media.current.volume = 1;
    };
    const a = window.setTimeout(() => {
      started.current = true;
      player.restart();
    }, 300);
    const b = window.setTimeout(() => {
      if (!withVoice || cb.current.paused) return;
      voice.current.on = true;
      if (player.media.current) player.media.current.volume = 0.3;
      if (voiceUrl) {
        const v = new Audio(voiceUrl);
        voice.current.audio = v;
        v.onended = unduck;
        void v.play().catch(unduck);
      } else {
        voice.current.stop = speakInBrowser(day.text, day.style.voice, unduck);
      }
    }, 2600);

    let elapsed = 0;
    let last = performance.now();
    let finished = false;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1, (now - last) / 1000); // реальное время, а не число тиков
      last = now;
      if (cb.current.paused || finished) return;
      elapsed += dt;
      const v = voice.current;
      const vd = v.audio && Number.isFinite(v.audio.duration) ? v.audio.duration + 3.6 : 0;
      const total = Math.min(MAX_SECONDS, Math.max(SLIDE_SECONDS, vd));
      cb.current.onProgress(Math.min(1, elapsed / total));
      const m = player.media.current;
      const left = total - elapsed;
      if (m && !v.on && left < 1.2) m.volume = Math.max(0, left / 1.2); // музыка уходит перед следующим днём
      if ((elapsed >= total && !v.on) || elapsed >= MAX_SECONDS) {
        finished = true;
        cb.current.onDone();
      }
    }, 200);

    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
      window.clearInterval(timer);
      voice.current.audio?.pause();
      voice.current.stop?.();
      voice.current = { on: false };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!started.current) return;
    if (paused) {
      player.pause();
      voice.current.audio?.pause();
    } else {
      player.start();
      if (voice.current.on) void voice.current.audio?.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const mode = MODES[day.style.mode];
  const m = day.style.motion;

  return (
    <div className="flex h-full w-full items-center justify-center gap-12 px-6 pb-14">
      <div style={{ width: 'min(90vw, calc((100vh - 110px) * 0.8))' }}>
        {photoUrls && photoUrls.length > 0 ? (
          <MemoryCard day={day} number={number} photoUrls={photoUrls} live clock={player.clock} playKey={player.playKey} />
        ) : (
          <div className="aspect-[4/5] w-full" style={{ background: day.style.palette.paper }} />
        )}
      </div>
      <aside className="hidden w-80 shrink-0 xl:block">
        <div className="font-mono text-[11px] tracking-[0.14em] uppercase opacity-55">
          день {index + 1} из {total} · {formatDate(day.date).long}
        </div>
        <h2 className="mt-3 font-serif text-4xl leading-tight">{day.title}</h2>
        <p className="mt-3 font-serif text-xl italic opacity-75">{day.signals.text.caption}</p>
        <div className="mt-8 border-l-2 pl-4" style={{ borderColor: day.style.palette.accent }}>
          <div className="font-serif text-2xl">{mode.name}</div>
          <div className="mt-1 font-mono text-[10px] tracking-wider uppercase opacity-55">{mode.reference}</div>
          <p className="mt-2 text-sm leading-relaxed opacity-80">{mode.why}</p>
        </div>
        <p className="mt-6 font-mono text-[11px] leading-relaxed tracking-wider uppercase opacity-65">
          ♪ {day.song.artist} — {day.song.title}
          <br />
          {Math.round(m.bpm)} BPM → кадр каждые {m.beatsPerShot} долей · {TRANSITION_RU[m.transition]}
          <br />
          голос: {day.style.voice.label}
        </p>
        <div className="mt-6">
          <LiveMeter clock={player.clock} style={day.style} light />
        </div>
      </aside>
    </div>
  );
}
