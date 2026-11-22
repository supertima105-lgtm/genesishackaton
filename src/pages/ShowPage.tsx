import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { freshCover, sheetRatio } from '../components/memory/layout';
import { formatDate, MemoryCard } from '../components/memory/MemoryCard';
import { useDayAspect } from '../lib/aspect';
import { usePlayer } from '../lib/player';
import { useFolders } from '../lib/shelf';
import { mostContrasting } from '../lib/rules/labels';
import { MODES } from '../lib/rules/modes';
import { songArtist, strayAudio, useSongPreview } from '../lib/songCover';
import type { DayRecord } from '../lib/types';
import { numberDays, plural, useDays, useFileUrls } from '../lib/useDays';

const SLIDE_SECONDS = 13;

/** Стол под вечерней лампой — тот же стол, что и во всём дневнике, только свет приглушён. */
const DESK: CSSProperties = {
  // стол того же цвета, что и сайт: в тёмной теме он тёмный, а не бежевый островок
  backgroundColor: 'var(--color-desk)',
  backgroundImage: 'var(--desk-dots)',
  backgroundSize: '7px 7px, 11px 11px',
};
const LAMP = 'var(--show-lamp)';

/** Наклон отпечатка: каждый следующий день ложится на стопку чуть иначе. */
const ROT = [-2.2, 1.8, -1.2, 2.4, -1.8, 1.2];
const rot = (k: number) => ROT[((k % ROT.length) + ROT.length) % ROT.length];

type Side = 'contrast' | 'date';
const SIDES: { id: Side; side: string; label: string }[] = [
  { id: 'contrast', side: 'А', label: 'самые непохожие' },
  { id: 'date', side: 'Б', label: 'все по порядку' },
];

/**
 * «Пластинка воспоминаний» — показ для жюри. Дни идут как треки на пластинке: у каждого своя песня,
 * своя страница. Отпечатки ложатся стопкой на стол, проигрыватель крутит пластинку в цвет дня.
 * Видно, что дневник один, а настроения разные.
 */
export function ShowPage({ folderId }: { folderId?: string }) {
  const { days: all, error } = useDays();
  const folderList = useFolders();
  // показ папки — только её дни; номера страниц остаются сквозными по всему дневнику
  const only = folderId ? folderList?.find((f) => f.id === folderId)?.dayIds : undefined;
  const days = useMemo(() => (all && folderId ? (only ? all.filter((d) => only.includes(d.id)) : null) : all), [all, folderId, only]);
  const numbers = useMemo(() => numberDays(all ?? []), [all]);
  const [order, setOrder] = useState<Side>('contrast');
  const [phase, setPhase] = useState<'intro' | 'play' | 'end'>('intro');
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const list = useMemo(() => {
    if (!days?.length) return [];
    if (order === 'date') return [...days].sort((a, b) => a.date.localeCompare(b.date));
    return mostContrasting(days, Math.min(5, days.length));
  }, [days, order]);
  const side = SIDES.find((s) => s.id === order)!;

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'play') setPhase('intro');
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

  return (
    // стол показа — обычная страница дневника под шапкой, высотой с окно
    <div
      // пока пластинка стоит, высота ровно с окно; на обложке и в финале стол растёт вместе с содержимым — без своей прокрутки
      className={`relative ${phase === 'play' ? 'h-[max(640px,calc(100vh-170px))]' : 'min-h-[max(640px,calc(100vh-170px))]'} overflow-hidden rounded-[3px] text-ink shadow-[0_2px_0_rgba(0,0,0,.06),0_18px_40px_-24px_rgba(60,40,10,.6)]`}
      style={DESK}
    >
      {/* свет лампы; во время показа к нему примешивается цвет дня */}
      <div className="pointer-events-none absolute inset-0" style={{ background: LAMP }} />
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            className="pointer-events-none absolute inset-0"
            style={{ background: `radial-gradient(ellipse 55% 55% at 38% 45%, color-mix(in srgb, ${current.style.palette.accent} 26%, transparent), transparent 70%)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4 }}
          />
        )}
      </AnimatePresence>

      {error && <p className="relative p-8 font-mono text-sm">Ошибка хранилища: {error}</p>}
      {!days && !error && <p className="relative p-10 font-hand text-3xl text-ink-soft">Достаю пластинку…</p>}

      {days && phase === 'intro' && (
        <Intro list={list} order={order} setOrder={setOrder} onStart={begin} sideLabel={side.side} />
      )}

      {phase === 'play' && current && (
        <>
          <div className="absolute top-4 left-8 z-[60] -rotate-1 font-hand text-[22px] text-ink-soft">Пластинка воспоминаний · сторона {side.side}</div>

          <AnimatePresence>
            <Track
              key={current.id}
              day={current}
              number={numbers.get(current.id) ?? 0}
              index={i}
              total={list.length}
              pile={list.slice(Math.max(0, i - 3), i).reverse()}
              paused={paused}
              onProgress={setProgress}
              onDone={() => go(1)}
            />
          </AnimatePresence>

          <div className="absolute inset-x-0 bottom-5 z-[60] flex items-center justify-center gap-5 px-8">
            <div className="flex gap-2">
              <button type="button" className="btn px-2.5" onClick={() => go(-1)} disabled={i === 0} aria-label="Предыдущий день">
                <ChevronLeft size={16} />
              </button>
              <button type="button" className="btn px-2.5" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Продолжить' : 'Пауза'}>
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <button type="button" className="btn px-2.5" onClick={() => go(1)} aria-label="Следующий день">
                <ChevronRight size={16} />
              </button>
              <button type="button" className="btn px-2.5" onClick={() => setPhase('intro')} aria-label="Остановить показ">
                <X size={16} />
              </button>
            </div>
            {/* дорожки пластинки: прошедшие закрашены цветом своего дня */}
            <div className="flex w-[min(46vw,560px)] gap-1.5 rounded-sm bg-paper/80 px-2.5 py-2 shadow-[0_2px_0_rgba(0,0,0,.06),0_8px_16px_-10px_rgba(60,40,10,.5)]">
              {list.map((d, k) => (
                <div key={d.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/12" title={`${k + 1}. ${d.title}`}>
                  <div className="h-full rounded-full" style={{ background: d.style.palette.accent, width: `${k < i ? 100 : k === i ? progress * 100 : 0}%` }} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {phase === 'end' && (
        <End
          list={list}
          numbers={numbers}
          sideLabel={side.side}
          onAgain={begin}
          onFlip={() => {
            setOrder(order === 'contrast' ? 'date' : 'contrast');
            setPhase('intro');
          }}
        />
      )}
    </div>
  );
}

// ── до показа: конверт пластинки и список треков ─────────────────

function useCover(day?: DayRecord) {
  const cover = useFileUrls(day?.cover ? [day.cover] : undefined);
  const first = useFileUrls(day && !day.cover ? day.photos.slice(0, 1) : undefined);
  return cover?.[0] ?? first?.[0];
}

function Intro({ list, order, setOrder, onStart, sideLabel }: { list: DayRecord[]; order: Side; setOrder: (s: Side) => void; onStart: () => void; sideLabel: string }) {
  const [out, setOut] = useState(false);
  return (
    <div className="relative mx-auto grid min-h-[max(640px,calc(100vh-170px))] max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
      <Album list={list} out={out} sideLabel={sideLabel} />

      <div>
        <h1 className="mt-1 -rotate-1 font-hand text-[clamp(40px,4.4vw,62px)] leading-[.95] font-bold text-blue">Пластинка воспоминаний</h1>
        <p className="mt-3 max-w-md text-ink-soft">Каждый день звучит своей песней. Поставь пластинку — и дни сменят друг друга, как треки.</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {SIDES.map((s, k) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setOrder(s.id)}
              className={`rounded-sm px-3 pt-1 pb-1.5 font-hand text-[21px] leading-none shadow-[0_2px_0_rgba(0,0,0,.08)] transition-transform hover:-translate-y-0.5 ${k ? 'rotate-[1.2deg]' : '-rotate-[1.5deg]'} ${order === s.id ? 'bg-note' : 'bg-paper'}`}
              aria-pressed={order === s.id}
            >
              Сторона {s.side} · {s.label}
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <div className="sheet lined mt-6 p-6 pl-8 font-hand text-2xl">
            Пластинка пока пустая. <a href="#/new" className="text-blue underline">Записать первый день</a>
          </div>
        ) : (
          <>
            <div className="sheet lined mt-5 rotate-[.4deg] px-5 py-4 pl-9">
              <div className="flex items-baseline justify-between">
                <span className="font-hand text-[26px] leading-none font-bold">Сторона {sideLabel}</span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {list.length} {plural(list.length, 'трек', 'трека', 'треков')} · {Math.round((list.length * SLIDE_SECONDS) / 6) / 10} мин
                </span>
              </div>
              <ol className="mt-2 max-h-[26vh] space-y-1 overflow-y-auto pr-1">
                {list.map((d, k) => (
                  <TrackRow key={d.id} day={d} n={k + 1} />
                ))}
              </ol>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <button
                type="button"
                className="btn btn-solid px-5 text-[25px]"
                onClick={onStart}
                // пластинка выезжает и крутится только под курсором; фокус при входе (Enter — старт) её не трогает
                onMouseEnter={() => setOut(true)}
                onMouseLeave={() => setOut(false)}
                autoFocus
              >
                <Play size={17} fill="currentColor" /> Поставить пластинку
              </button>
              <span className="font-hand text-lg text-ink-soft">пробел — пауза · ← → — листать · Esc — выход</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TrackRow({ day, n }: { day: DayRecord; n: number }) {
  const src = useCover(day);
  return (
    <li className="flex items-center gap-3 py-0.5">
      <span className="w-5 shrink-0 text-right font-hand text-xl text-ink-soft">{n}.</span>
      <span className="block h-9 w-9 shrink-0 bg-white p-[3px] shadow-[0_2px_4px_rgba(0,0,0,.18)]" style={{ rotate: `${n % 2 ? -3 : 3}deg` }}>
        <span className="block h-full w-full" style={{ background: day.style.palette.accent }}>
          {src && <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-hand text-[22px] leading-none font-semibold">{day.title}</span>
        <span className="block truncate font-serif text-[13px] text-ink-soft italic">
          ♪ {songArtist(day.song) ? `${songArtist(day.song)} — ` : ''}
          {day.song.title}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[11px] text-ink-soft">{formatDate(day.date).short.slice(0, 5)}</span>
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: day.style.palette.accent }} title={MODES[day.style.mode].name} />
    </li>
  );
}

/** Конверт пластинки: коллаж из дней на обложке, пластинка выглядывает сбоку. */
function Album({ list, out, sideLabel }: { list: DayRecord[]; out: boolean; sideLabel: string }) {
  const accent = list[0]?.style.palette.accent ?? '#b5452c';
  const art = list.slice(0, 4);
  return (
    <div className="relative mx-auto aspect-square w-[min(100%,58vh,520px)]">
      <div className={`absolute top-[5%] left-[4%] aspect-square w-[88%] transition-transform duration-700 ease-out ${out ? 'translate-x-[40%]' : 'translate-x-[20%]'}`} aria-hidden>
        <div className={`vinyl h-full w-full ${out ? 'spinning' : ''}`} style={{ '--label': accent } as CSSProperties}>
          <span className="absolute top-[38%] left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-widest text-white/80 mix-blend-difference">33⅓</span>
        </div>
        <div className="vinyl-sheen" />
      </div>

      <div className="sleeve absolute inset-y-[2%] left-0 z-10 w-[92%] -rotate-2 overflow-hidden" style={{ containerType: 'inline-size' }}>
        <div className="absolute top-[5%] right-[6%] left-[6%] flex items-start justify-between font-mono text-[2.6cqw] tracking-[.18em] text-ink-soft uppercase">
          <span>Атмосфера · LP</span>
          <span>сторона {sideLabel}</span>
        </div>
        <div className="absolute top-[11%] left-[6%] -rotate-2 font-hand text-[11cqw] leading-[.88] font-bold text-ink">
          Пластинка
          <br />
          <span className="text-blue">воспоминаний</span>
        </div>
        {art.map((d, k) => (
          <CoverPrint key={d.id} day={d} k={k} n={art.length} />
        ))}
        {list.length === 0 && <div className="absolute inset-x-[14%] top-[45%] bottom-[16%] border-2 border-dashed border-ink/20" />}
        <div className="absolute right-[6%] bottom-[5%] left-[6%] flex items-end justify-between">
          <span className="font-hand text-[5.4cqw] leading-none text-ink-soft">
            один дневник · {list.length} {plural(list.length, 'настроение', 'настроения', 'настроений')}
          </span>
          <span className="font-mono text-[2.6cqw] text-ink-soft">33⅓</span>
        </div>
      </div>
    </div>
  );
}

const ART_SLOTS: [number, number, number][][] = [
  [],
  [[50, 62, -3]],
  [
    [33, 60, -5],
    [67, 63, 4],
  ],
  [
    [25, 60, -6],
    [52, 64, 3],
    [78, 59, -3],
  ],
  [
    [22, 58, -6],
    [44, 66, 4],
    [64, 57, -2],
    [82, 66, 5],
  ],
];
const TAPES = ['rgba(240,210,115,.85)', 'rgba(232,155,168,.8)', 'rgba(150,203,188,.85)', 'rgba(182,170,228,.8)'];

function CoverPrint({ day, k, n }: { day: DayRecord; k: number; n: number }) {
  const src = useCover(day);
  const [x, y, r] = ART_SLOTS[n][k];
  return (
    <div
      className="absolute w-[30cqw] bg-[#fffdf7] p-[1.6cqw] pb-[5cqw] shadow-[0_1.4cqw_2.4cqw_-1cqw_rgba(30,20,5,.5)]"
      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%,-50%) rotate(${r}deg)`, zIndex: k + 1 }}
    >
      <span className="absolute -top-[1.6cqw] left-1/2 h-[3.6cqw] w-[44%] -translate-x-1/2 rotate-[-4deg] mix-blend-multiply" style={{ background: TAPES[k % TAPES.length] }} />
      <span className="block aspect-[4/5] w-full" style={{ background: day.style.palette.accent }}>
        {src && <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />}
      </span>
      <span className="absolute inset-x-[1.6cqw] bottom-[1cqw] truncate font-hand text-[3.4cqw] leading-none font-semibold">{day.title}</span>
    </div>
  );
}

// ── показ: отпечаток дня на стопке и проигрыватель ────────────────

interface TrackProps {
  day: DayRecord;
  number: number;
  index: number;
  total: number;
  pile: DayRecord[];
  paused: boolean;
  onProgress: (p: number) => void;
  onDone: () => void;
}

// стол ниже шапки сайта: отпечаток меряем по высоте стола, а не всего окна
/** Ширина отпечатка: лист в формате фото должен целиком поместиться на столе по высоте. */
const printW = (ratio: number) => `min(${ratio > 1 ? 46 : 40}vw, ${ratio > 1 ? 760 : 660}px, calc((max(640px, 100vh - 170px) - 150px) * ${(ratio * 0.95).toFixed(3)}))`;

function Track({ day, number, index, total, pile, paused, onProgress, onDone }: TrackProps) {
  const photoUrls = useFileUrls(day.photos);
  const aspect = useDayAspect(day);
  // своя запись песни — играем её; песня ссылкой или названием — 30 секунд из каталога iTunes
  // (не ждём сеть: фрагмент вступит, как только найдётся)
  const songFile = day.songFile && !strayAudio(day.song) ? day.songFile : undefined;
  const excerptUrl = useFileUrls(songFile ? [songFile] : undefined)?.[0];
  const preview = useSongPreview(day, !songFile);
  const player = usePlayer(excerptUrl ?? preview);
  const ready = Boolean(photoUrls?.length) && (!songFile || Boolean(excerptUrl));
  const present = useIsPresent();
  const [started, setStarted] = useState(false);

  const cb = useRef({ onProgress, onDone, paused, present });
  cb.current = { onProgress, onDone, paused, present };

  // старт: музыка — когда отпечаток ложится на стол
  useEffect(() => {
    if (!ready) return;
    const a = window.setTimeout(() => {
      setStarted(true);
      player.restart();
    }, 450);

    let elapsed = 0;
    let last = performance.now();
    let finished = false;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1, (now - last) / 1000); // реальное время, а не число тиков
      last = now;
      if (cb.current.paused || finished || !cb.current.present) return;
      elapsed += dt;
      cb.current.onProgress(Math.min(1, elapsed / SLIDE_SECONDS));
      const m = player.media.current;
      const left = SLIDE_SECONDS - elapsed;
      if (m && left < 1.2) m.volume = Math.max(0, left / 1.2); // музыка уходит перед следующим днём
      if (elapsed >= SLIDE_SECONDS) {
        finished = true;
        cb.current.onDone();
      }
    }, 200);

    return () => {
      window.clearTimeout(a);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!started) return;
    if (paused) player.pause();
    else player.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // день уходит со стола — его песня замолкает сразу, не дожидаясь конца анимации
  useEffect(() => {
    if (!present) player.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]);

  const r = rot(index);
  const spinning = started && !paused && present;

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center gap-[4.5vw] px-8 pt-12 pb-20" style={{ zIndex: index + 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.32 }}>
      <div className="relative shrink-0" style={{ width: printW(sheetRatio(day.style.layout.frame, aspect)) }}>
        {pile.map((d, j) => (
          <PilePrint key={d.id} day={d} r={rot(index - 1 - j)} depth={j} />
        ))}
        <motion.div
          className="relative"
          style={{ zIndex: 5 }}
          initial={{ x: '38%', y: '-10%', rotate: r + 9, opacity: 0, scale: 1.04 }}
          animate={{ x: 0, y: 0, rotate: r, opacity: 1, scale: 1 }}
          transition={{ duration: 1.05, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <Print>
            {photoUrls && photoUrls.length > 0 ? (
              <MemoryCard day={day} number={number} photoUrls={photoUrls} live />
            ) : (
              <div className="aspect-[4/5] w-full" style={{ background: day.style.palette.paper }} />
            )}
          </Print>
        </motion.div>
      </div>

      <motion.aside
        className="hidden w-[min(320px,24vw)] shrink-0 xl:block"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.7 }}
      >
        <Turntable day={day} spinning={spinning} />
        <Note day={day} index={index} total={total} />
      </motion.aside>
    </motion.div>
  );
}

/** Белая рамка отпечатка со скотчем сверху. */
function Print({ children, tape = 0 }: { children: React.ReactNode; tape?: number }) {
  return (
    <div className="relative bg-[#fffdf7] p-[2.6%] shadow-[0_34px_60px_-26px_rgba(35,18,5,.75),0_3px_8px_rgba(35,18,5,.18)]">
      <span
        className="absolute -top-[2.2%] left-1/2 z-10 h-[5%] w-[30%] -translate-x-1/2 rotate-[-3deg] mix-blend-multiply"
        style={{ background: TAPES[tape % TAPES.length], clipPath: 'polygon(2% 0, 98% 6%, 100% 30%, 97% 55%, 100% 80%, 98% 100%, 1% 95%, 3% 70%, 0 45%, 2.5% 20%)' }}
      />
      {children}
    </div>
  );
}

/** Прошлые дни остаются на столе стопкой под новым отпечатком. */
function PilePrint({ day, r, depth }: { day: DayRecord; r: number; depth: number }) {
  const fresh = freshCover(day);
  const cover = useFileUrls(fresh ? [fresh] : undefined);
  const first = useFileUrls(day.photos.slice(0, 1));
  return (
    <div
      className="absolute inset-x-0 top-0"
      style={{ transform: `translate(${depth * 9}px, ${depth * 6}px) rotate(${r}deg)`, zIndex: 4 - depth, filter: depth ? `brightness(${1 - depth * 0.04})` : undefined }}
    >
      <Print tape={depth + 1}>
        <MemoryCard day={day} number={0} photoUrls={first ?? []} coverUrl={cover?.[0]} />
      </Print>
    </div>
  );
}

/** Проигрыватель: пластинка в цвет дня, тонарм опускается, пока играет песня. */
function Turntable({ day, spinning }: { day: DayRecord; spinning: boolean }) {
  const accent = day.style.palette.accent;
  return (
    <div
      className="relative mx-auto aspect-[1.18] w-[82%] rounded-[12px] shadow-[0_26px_44px_-20px_rgba(35,18,5,.8),inset_0_1px_0_rgba(255,220,170,.25)]"
      style={{ background: 'linear-gradient(135deg, #8a5733, #5a341b 55%, #43260f)' }}
    >
      <div className="absolute inset-[3.5%] rounded-[7px] shadow-[inset_0_2px_6px_rgba(0,0,0,.5)]" style={{ background: 'linear-gradient(160deg, #3d3631, #1e1a17)' }} />
      <div className="absolute top-[9%] left-[7%] aspect-square w-[66%] rounded-full bg-[#0f0e0d] shadow-[0_6px_14px_rgba(0,0,0,.6)]">
        <div className={`vinyl absolute inset-[3%] ${spinning ? 'spinning' : ''}`} style={{ '--label': accent } as CSSProperties}>
          <span className="absolute top-[41%] left-1/2 w-[24%] -translate-x-1/2 truncate text-center font-hand text-[13px] leading-none text-white/85 mix-blend-difference">
            {day.song.title}
          </span>
          <span className="absolute top-[54%] left-1/2 -translate-x-1/2 font-mono text-[8px] tracking-widest text-white/70 mix-blend-difference">33⅓</span>
        </div>
        <div className="vinyl-sheen absolute inset-[3%]" />
      </div>
      <svg viewBox="0 0 118 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <g style={{ transformOrigin: '100px 16px', transform: `rotate(${spinning ? 0 : -26}deg)`, transition: 'transform 1.1s cubic-bezier(.4,0,.2,1)' }}>
          <circle cx="106" cy="8" r="4" fill="#9c958a" />
          <path d="M100 16 L82 54 L74 61" fill="none" stroke="#ddd6ca" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M77 58.5 L70.5 64.5" stroke="#2b2622" strokeWidth="5" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="16" r="7" fill="#b9b2a6" />
        <circle cx="100" cy="16" r="3" fill="#5d574f" />
        <circle cx="103" cy="86" r="4.2" fill="#2a2420" stroke="#8d6a4d" strokeWidth="1" />
        <circle cx="91" cy="86" r="4.2" fill="#2a2420" stroke="#8d6a4d" strokeWidth="1" />
        <circle cx="111" cy="72" r="1.6" fill={spinning ? '#ff8a5c' : '#5d4a3b'} />
      </svg>
    </div>
  );
}

/** Записка под проигрывателем: что это был за день и как система его прочитала. */
function Note({ day, index, total }: { day: DayRecord; index: number; total: number }) {
  const mode = MODES[day.style.mode];
  const m = day.style.motion;
  return (
    <div className="sheet relative mt-4 rotate-[1deg] px-5 pt-4 pb-4">
      <div className="font-hand text-[19px] leading-none text-ink-soft">
        трек {index + 1} из {total} · {formatDate(day.date).long}
      </div>
      <h2 className="mt-1.5 font-hand text-[32px] leading-[.95] font-bold">{day.title}</h2>
      {day.signals.text.caption && <p className="mt-1.5 font-serif text-[15px] leading-snug text-ink-soft italic">{day.signals.text.caption}</p>}
      <div className="mt-4 flex items-center gap-4">
        <span
          className="inline-block shrink-0 -rotate-3 rounded-sm px-2.5 py-1 font-mono text-[11px] tracking-[.14em] whitespace-nowrap uppercase"
          style={{ color: day.style.palette.accent, border: `2.5px double ${day.style.palette.accent}` }}
          title={mode.why}
        >
          {mode.name}
        </span>
        <span className="min-w-0 truncate font-mono text-[10px] tracking-wider text-ink-soft uppercase">{mode.reference}</span>
      </div>
      <p className="mt-3 font-serif text-[15px] italic">
        ♪ {songArtist(day.song) ? `${songArtist(day.song)} — ` : ''}
        {day.song.title}
      </p>
      <p className="mt-1 font-mono text-[10.5px] tracking-wider text-ink-soft uppercase">
        {Math.round(m.bpm)} BPM · {day.signals.music.mode === 'major' ? 'мажор' : 'минор'}
      </p>
    </div>
  );
}

// ── финал: сторона закончилась ────────────────────────────────────

function End({ list, numbers, sideLabel, onAgain, onFlip }: { list: DayRecord[]; numbers: Map<string, number>; sideLabel: string; onAgain: () => void; onFlip: () => void }) {
  return (
    <motion.div className="relative mx-auto flex min-h-[max(640px,calc(100vh-170px))] max-w-6xl flex-col justify-center px-6 py-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}>
      <h2 className="-rotate-1 font-hand text-[clamp(44px,5.4vw,76px)] leading-none font-bold text-blue">Сторона {sideLabel} закончилась</h2>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">
        Один дневник — {list.length} {plural(list.length, 'день', 'разных дня', 'разных дней')}. Формат один, а почерк и палитра у каждого дня свои.
      </p>
      <div className="mt-10 flex gap-5 overflow-x-auto px-2 pt-4 pb-6">
        {list.map((d, k) => (
          <EndPrint key={d.id} day={d} number={numbers.get(d.id) ?? 0} k={k} />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-solid" onClick={onAgain}>
          <Play size={15} fill="currentColor" /> Поставить ещё раз
        </button>
        <button type="button" className="btn" onClick={onFlip}>
          Перевернуть пластинку
        </button>
        <a href="#/compare" className="btn">
          Сравнить два дня
        </a>
        <a href="#/" className="btn">
          В дневник
        </a>
      </div>
    </motion.div>
  );
}

function EndPrint({ day, number, k }: { day: DayRecord; number: number; k: number }) {
  const fresh = freshCover(day);
  const cover = useFileUrls(fresh ? [fresh] : undefined);
  const first = useFileUrls(day.photos.slice(0, 1));
  return (
    <motion.a
      href={`#/day/${day.id}`}
      className="block w-40 shrink-0 sm:w-48"
      style={{ rotate: rot(k) }}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, transition: { delay: 0.25 + k * 0.12, duration: 0.6 } }}
      whileHover={{ y: -6, rotate: 0, transition: { duration: 0.25 } }}
    >
      <Print tape={k}>
        <MemoryCard day={day} number={number} photoUrls={first ?? []} coverUrl={cover?.[0]} />
      </Print>
      <div className="mt-2.5 truncate px-1 font-hand text-[22px] leading-none font-semibold">{day.title}</div>
      <div className="mt-1 px-1 font-mono text-[10px] tracking-wider text-ink-soft uppercase">{MODES[day.style.mode].name}</div>
    </motion.a>
  );
}
