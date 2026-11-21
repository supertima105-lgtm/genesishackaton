import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { MODES } from '../lib/rules/modes';
import { store } from '../lib/storage';
import type { Axes, DayRecord, FileRef, ModeId } from '../lib/types';
import { localToday, plural, useDays } from '../lib/useDays';

/**
 * Календарь — раскрытый дневник на столе. Каждый месяц — разворот: слева «лицо месяца»
 * (полароиды записанных дней, песня месяца, настроение от руки), справа — сетка, нарисованная
 * от руки, с билетиками дней. Страницы перелистываются по корешку. Год — оглавление тома.
 *
 * Книга линейна: … декабрь 2025 → оглавление 2026 → январь 2026 … декабрь 2026 → оглавление 2027.
 */

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const pad = (n: number) => String(n).padStart(2, '0');
const ym = (y: number, m: number) => `${y}-${pad(m)}`; // m: 1..12
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
const firstWeekday = (y: number, m: number) => (new Date(y, m - 1, 1).getDay() + 6) % 7; // понедельник = 0
const monthName = (y: number, m: number) => {
  const s = new Date(y, m - 1, 15).toLocaleDateString('ru-RU', { month: 'long' });
  return s[0].toUpperCase() + s.slice(1);
};

const isYear = (k: string) => /^\d{4}$/.test(k);
const ord = (k: string) => {
  const [y, m] = k.split('-').map(Number);
  return y * 13 + (m || 0);
};
const fromOrd = (i: number) => {
  const y = Math.floor(i / 13);
  const m = i % 13;
  return m ? ym(y, m) : String(y);
};
const step = (k: string, d: number) => fromOrd(ord(k) + d);
/** 0 — оглавление, 1..12 — месяц: сколько страниц тома уже перевёрнуто */
const leafIndex = (k: string) => (isYear(k) ? 0 : Number(k.slice(5)));

// ── детерминированный «случай»: наклоны и неровности одинаковы при каждой загрузке ──
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const jitter = (s: string, amp: number) => ((hashStr(s) / 4294967296) * 2 - 1) * amp;

function useMedia(q: string) {
  const [on, setOn] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const f = () => setOn(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return on;
}

/** URL файла с общим кэшем — чтобы при перелистывании фото не мигали. */
const urlCache = new Map<string, string>();
function useFileUrl(ref?: FileRef) {
  const [url, setUrl] = useState(() => (ref ? urlCache.get(ref.path) : undefined));
  useEffect(() => {
    if (!ref) return setUrl(undefined);
    const hit = urlCache.get(ref.path);
    if (hit) return setUrl(hit);
    let alive = true;
    store
      .fileUrl(ref)
      .then((u) => {
        urlCache.set(ref.path, u);
        if (alive) setUrl(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref?.path]);
  return url;
}

type ByDate = Map<string, DayRecord[]>;
interface Ctx {
  byDate: ByDate;
  today: string;
}
interface Flip {
  to: string;
  dir: 1 | -1;
  ms: number;
}

const vars = (v: Record<string, string | number>) => v as CSSProperties;

// ── страница ──────────────────────────────────────────────────────

export function CalendarPage({ period }: { period?: string }) {
  const { days, error } = useDays();
  const today = localToday();
  const target = fromOrd(ord(period ?? today.slice(0, 7)));
  const wide = useMedia('(min-width: 1024px)');
  const calm = useMedia('(prefers-reduced-motion: reduce)');

  const byDate = useMemo(() => {
    const map: ByDate = new Map();
    for (const d of days ?? []) map.set(d.date, [...(map.get(d.date) ?? []), d].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    return map;
  }, [days]);

  const [shown, setShown] = useState(target);
  const [flip, setFlip] = useState<Flip | null>(null);
  const [enter, setEnter] = useState<1 | -1>(1);

  // адрес сменился → перелистываем к нему (быстрые нажатия догоняются следующим листом)
  useEffect(() => {
    if (flip || target === shown) return;
    const dir = ord(target) > ord(shown) ? 1 : -1;
    if (!wide || calm || !days) {
      setEnter(dir);
      setShown(target);
      return;
    }
    setFlip({ to: target, dir, ms: Math.abs(ord(target) - ord(shown)) > 1 ? 1050 : 900 });
  }, [target, shown, flip, wide, calm, days]);

  useEffect(() => {
    if (!flip) return;
    const t = setTimeout(() => {
      setShown(flip.to);
      setFlip(null);
    }, flip.ms);
    return () => clearTimeout(t);
  }, [flip]);

  const go = (d: number) => {
    location.hash = `#/calendar/${step(target, d)}`;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') location.hash = `#/calendar/${step(target, -1)}`;
      if (e.key === 'ArrowRight') location.hash = `#/calendar/${step(target, 1)}`;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target]);

  const touch = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = touch.current;
      touch.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
    },
  };

  if (error) return <p className="label text-rust">Ошибка хранилища: {error}</p>;
  if (!days) return <p className="py-20 text-center font-hand text-3xl text-ink-soft">Открываю дневник…</p>;

  const ctx: Ctx = { byDate, today };
  const left = (k: string) => (isYear(k) ? <TitlePage year={Number(k)} {...ctx} /> : <MonthLeft k={k} {...ctx} />);
  const right = (k: string) => (isYear(k) ? <TocPage year={Number(k)} {...ctx} /> : <MonthRight k={k} {...ctx} />);
  const label = (k: string) => (isYear(k) ? `Оглавление ${k}` : `${monthName(Number(k.slice(0, 4)), Number(k.slice(5)))}${k.slice(0, 4) !== target.slice(0, 4) ? ` ${k.slice(0, 4)}` : ''}`);
  const idx = leafIndex(shown);

  if (!wide)
    return (
      <section {...swipe}>
        <TopBar target={target} today={today} hint="листай свайпом" />
        <div className="mt-4 flex items-center justify-between gap-3">
          <NavButton dir={-1} label={label(step(target, -1))} onClick={() => go(-1)} compact />
          <NavButton dir={1} label={label(step(target, 1))} onClick={() => go(1)} compact />
        </div>
        <div className="relative mx-auto mt-6 mb-10 max-w-xl">
          <div className="book-cover" style={{ inset: '-10px -10px -16px' }} />
          <div key={shown} className={`relative ${enter === 1 ? 'page-swap-next' : 'page-swap-prev'}`}>
            <Page side="single">{left(shown)}</Page>
            <div className="h-1" />
            <Page side="single">{right(shown)}</Page>
          </div>
        </div>
      </section>
    );

  const flipVars = flip ? vars({ '--flip': `${flip.ms}ms` }) : undefined;
  return (
    <section {...swipe}>
      <TopBar target={target} today={today} hint="листай стрелками ← → или потяни за уголок" />
      <div className="mt-7 mb-16 grid grid-cols-[72px_1fr_72px] items-center gap-4 xl:gap-8">
        <NavButton dir={-1} label={label(step(target, -1))} onClick={() => go(-1)} />
        <div className="book mx-auto w-full" style={{ maxWidth: 'min(1120px, calc((100vh - 230px) * 1.56))' }}>
          <div className="book-cover" />
          <Page side="left" depth={3 + idx}>
            {flip?.dir === -1 ? left(flip.to) : left(shown)}
          </Page>
          <Page side="right" depth={3 + 12 - idx}>
            {flip?.dir === 1 ? right(flip.to) : right(shown)}
          </Page>

          {flip && (
            <>
              <div className={`cast cast-lift ${flip.dir === 1 ? 'cast-r' : 'cast-l'}`} style={flipVars} />
              <div className={`cast cast-land ${flip.dir === 1 ? 'cast-l' : 'cast-r'}`} style={flipVars} />
              <div className={`leaf ${flip.dir === 1 ? 'leaf-fwd' : 'leaf-back'}`} style={flipVars}>
                <div className="leaf-face">
                  <Page side={flip.dir === 1 ? 'right' : 'left'}>{flip.dir === 1 ? right(shown) : left(shown)}</Page>
                  <div className="leaf-shade leaf-shade-up" />
                </div>
                <div className="leaf-face leaf-under">
                  <Page side={flip.dir === 1 ? 'left' : 'right'}>{flip.dir === 1 ? left(flip.to) : right(flip.to)}</Page>
                  <div className="leaf-shade leaf-shade-down" />
                </div>
              </div>
            </>
          )}

          {!flip && (
            <>
              <button type="button" className="dog-ear dog-ear-l" onClick={() => go(-1)} aria-label={`Назад: ${label(step(target, -1))}`} title={label(step(target, -1))} />
              <button type="button" className="dog-ear dog-ear-r" onClick={() => go(1)} aria-label={`Вперёд: ${label(step(target, 1))}`} title={label(step(target, 1))} />
            </>
          )}
          <span className="ribbon" aria-hidden>
            <i />
          </span>
        </div>
        <NavButton dir={1} label={label(step(target, 1))} onClick={() => go(1)} />
      </div>
    </section>
  );
}

/** Стопка страниц под листом — тоньше там, где листов осталось мало. */
function stackShadow(side: 'left' | 'right', n: number) {
  const s = side === 'left' ? -1 : 1;
  const out: string[] = [];
  for (let i = 1; i <= n; i++) out.push(`${s * i}px ${Math.ceil(i * 0.7)}px 0 ${i % 3 === 0 ? '#cdbb96' : i % 2 ? '#f2e7cf' : '#e3d4b5'}`);
  out.push(`${s * (n + 3)}px ${n + 2}px 12px -4px rgba(40,20,5,.35)`);
  return out.join(',');
}

function Page({ side, depth, children }: { side: 'left' | 'right' | 'single'; depth?: number; children: ReactNode }) {
  const shadow = depth && side !== 'single' ? stackShadow(side, depth) : side === 'single' ? '0 2px 0 #e3d4b5, 0 4px 0 #cdbb96, 0 10px 18px -8px rgba(40,20,5,.4)' : undefined;
  return (
    <div className={`page page-${side}`} style={{ boxShadow: shadow }}>
      {children}
    </div>
  );
}

// ── навигация ──────────────────────────────────────────────────────

function TopBar({ target, today, hint }: { target: string; today: string; hint: string }) {
  const cur = today.slice(0, 7);
  const year = target.slice(0, 4);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="-rotate-1 font-hand text-[22px] leading-none text-ink-soft">{hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        {target !== cur && (
          <a href={`#/calendar/${cur}`} className="btn">
            Сегодня
          </a>
        )}
        {!isYear(target) && (
          <a href={`#/calendar/${year}`} className="btn">
            Оглавление {year}
          </a>
        )}
      </div>
    </div>
  );
}

function NavButton({ dir, label, onClick, compact }: { dir: 1 | -1; label: string; onClick: () => void; compact?: boolean }) {
  const arrow = (
    <svg viewBox="0 0 24 24" className={`h-6 w-6 ${dir < 0 ? '-scale-x-100' : ''}`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 12.5 C 8 11.4, 14 12.8, 20 11.8 M14.5 6.2 C 16.4 8.2, 18.4 10.2, 20 11.8 C 18.2 13.6, 16.4 15.4, 14.8 17.6" />
    </svg>
  );
  if (compact)
    return (
      <button type="button" onClick={onClick} className={`btn ${dir > 0 ? 'flex-row-reverse' : ''}`}>
        {arrow}
        <span className="text-lg">{label}</span>
      </button>
    );
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-2 text-ink-soft transition-colors hover:text-ink" aria-label={label}>
      <span className="grid h-14 w-14 place-items-center rounded-full bg-paper shadow-[0_2px_0_rgba(0,0,0,.06),0_10px_18px_-8px_rgba(60,40,10,.45)] transition-transform group-hover:-translate-y-0.5 group-hover:rotate-[-4deg] group-hover:bg-note">
        {arrow}
      </span>
      <span className="text-center font-hand text-[19px] leading-[1.05]">{label}</span>
    </button>
  );
}

// ── рисунки от руки ────────────────────────────────────────────────

const DOODLES: Record<string, string> = {
  star: 'M12 2.6 L14.5 9.3 L21.5 9.7 L16.1 14.1 L17.9 21 L12 17.2 L6.1 21 L7.9 14.1 L2.5 9.7 L9.5 9.3 Z',
  heart: 'M12 20.2 C 5 15, 2.4 10.6, 4.6 7.2 C 6.6 4.2, 10.4 4.6, 12 8 C 13.6 4.6, 17.6 4.1, 19.5 7.3 C 21.6 10.8, 18.6 15.2, 12 20.2 Z',
  arrow: 'M3 20 C 5 12, 11 6.5, 20 5.2 M14.6 2.6 L20 5.2 L16 9.6',
  sun: 'M12 8 a4 4 0 1 0 0.01 0 M12 1.8 V4.4 M12 19.6 V22.2 M1.8 12 H4.4 M19.6 12 H22.2 M4.8 4.8 L6.6 6.6 M17.4 17.4 L19.2 19.2 M4.8 19.2 L6.6 17.4 M17.4 6.6 L19.2 4.8',
  swirl: 'M4 14 C 4 7, 13 5, 15 10 C 17 15, 9 17, 9 12 C 9 9, 14 8.5, 16.5 11 C 19 13.5, 19.5 17, 21 18.5',
  leaf: 'M5 19 C 5 10, 11 4, 20 4 C 20 13, 14 19, 5 19 Z M5 19 L14 10',
};

function Doodle({ kind, style, className = 'text-ink-soft/70' }: { kind: keyof typeof DOODLES; style: CSSProperties; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`pointer-events-none absolute ${className}`} style={style} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={DOODLES[kind]} />
    </svg>
  );
}

function PageTitle({ children }: { children: ReactNode }) {
  return (
    <>
      <h2 className="absolute inset-x-0 top-[4.2%] text-center font-hand leading-none font-bold text-ink" style={{ fontSize: '9.5cqw' }}>
        {children}
      </h2>
      <svg viewBox="0 0 120 10" className="pointer-events-none absolute top-[12.4%] left-[31%] w-[38%] text-blue/60" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
        <path d="M2 6 C 20 2.5, 38 8.5, 60 5 S 98 2.5, 118 6.5" />
      </svg>
    </>
  );
}

const PageNo = ({ side, n }: { side: 'left' | 'right'; n: number }) => (
  <span className={`absolute bottom-[3.4%] font-mono text-ink-soft ${side === 'left' ? 'left-[7%]' : 'right-[7%]'}`} style={{ fontSize: 'max(9px, 1.8cqw)' }}>
    — {n} —
  </span>
);

/** Маркерная обводка — как будто кружок нарисовали ручкой прямо в книге. */
const HandRing = () => (
  <svg className="hand-ring" viewBox="0 0 120 100" preserveAspectRatio="none" aria-hidden>
    <path pathLength={1} d="M30 17 C 56 5, 101 8, 111 38 C 119 67, 88 92, 55 91 C 21 90, 5 70, 10 46 C 13 27, 31 13, 64 9" />
  </svg>
);

// ── настроение месяца ─────────────────────────────────────────────

function average(days: DayRecord[]): Axes {
  const a: Axes = { tension: 0, valence: 0, temperature: 0, nostalgia: 0, social: 0, nature: 0, pace: 0 };
  for (const d of days) for (const k of Object.keys(a) as (keyof Axes)[]) a[k] += d.axes[k] / days.length;
  return a;
}

/** Две самые выраженные черты месяца → «Ноябрь вышел тёплым и спокойным». */
function moodPhrase(name: string, a: Axes) {
  const traits: [number, string][] = [
    [Math.abs(a.temperature - 0.5), a.temperature >= 0.5 ? 'тёплым' : 'прохладным'],
    [Math.abs(a.tension - 0.45), a.tension >= 0.45 ? 'напряжённым' : 'спокойным'],
    [Math.abs(a.valence) * 0.6, a.valence >= 0 ? 'светлым' : 'грустным'],
    [a.nostalgia - 0.45, 'ностальгическим'],
    [Math.abs(a.social - 0.5) * 0.8, a.social >= 0.5 ? 'шумным' : 'уединённым'],
    [Math.abs(a.pace - 0.5) * 0.8, a.pace >= 0.5 ? 'быстрым' : 'медленным'],
  ];
  const top = traits
    .sort((x, y) => y[0] - x[0])
    .slice(0, 2)
    .map(([, w]) => w);
  return `${name} вышел ${top.join(' и ')}`;
}

const topModeOf = (list: DayRecord[]): ModeId => {
  const counts = new Map<ModeId, number>();
  list.forEach((d) => counts.set(d.style.mode, (counts.get(d.style.mode) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
};
const accentStrip = (list: DayRecord[]) =>
  list.length === 1 ? list[0].style.palette.accent : `linear-gradient(90deg, ${list.map((d) => d.style.palette.accent).join(', ')})`;

const daysOf = (byDate: ByDate, prefix: string) =>
  [...byDate.entries()]
    .filter(([d]) => d.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, l]) => l);

// ── левая страница месяца: коллаж ─────────────────────────────────

/** Места для полароидов: [x %, y %, ширина cqw, наклон°] — на 1…6 карточек. */
const SLOTS: [number, number, number, number][][] = [
  [],
  [[50, 40, 46, -3]],
  [
    [31, 38, 38, -5],
    [69, 45, 38, 4],
  ],
  [
    [27, 31, 33, -6],
    [72, 31, 33, 4],
    [49, 55, 33, -2],
  ],
  [
    [27, 30, 31, -5],
    [72, 31, 31, 4],
    [30, 57, 31, 3],
    [70, 57, 31, -4],
  ],
  [
    [20, 30, 27, -6],
    [51, 28, 27, 3],
    [81, 31, 27, -3],
    [34, 56, 27, 4],
    [68, 57, 27, -3],
  ],
  [
    [19, 30, 27, -6],
    [50, 28, 27, 3],
    [81, 31, 27, -3],
    [20, 56, 27, 4],
    [51, 57, 27, -3],
    [81, 55, 27, 5],
  ],
];
const TAPES = ['rgba(240,210,115,.85)', 'rgba(232,155,168,.8)', 'rgba(150,203,188,.85)', 'rgba(182,170,228,.8)', 'rgba(170,206,135,.85)'];

/** Не больше max дней — равномерно по месяцу. */
function spreadPick<T>(list: T[], max: number) {
  if (list.length <= max) return list;
  return Array.from({ length: max }, (_, i) => list[Math.round((i * (list.length - 1)) / (max - 1))]);
}

function MonthLeft({ k, byDate, today }: Ctx & { k: string }) {
  const [y, m] = k.split('-').map(Number);
  const list = useMemo(() => daysOf(byDate, k), [byDate, k]);
  const picks = spreadPick(list, 6);
  const slots = SLOTS[picks.length];
  const song = list.find((d) => d.song?.title?.trim());

  return (
    <>
      <PageTitle>
        {monthName(y, m)} <span className="text-ink-soft">{y}</span>
      </PageTitle>
      <Doodle kind={m % 2 ? 'star' : 'sun'} style={{ left: '8%', top: '5.5%', width: '6cqw', rotate: '-12deg' }} />
      <Doodle kind={m % 3 ? 'heart' : 'leaf'} style={{ right: '8%', top: '6%', width: '5.4cqw', rotate: '10deg' }} className="text-rust/55" />

      {picks.map((d, i) => (
        <Polaroid key={d.id} day={d} slot={slots[i]} i={i} />
      ))}
      {list.length > picks.length && (
        <p className="absolute top-[69%] right-[8%] rotate-2 font-hand text-ink-soft" style={{ fontSize: '3.8cqw' }}>
          и ещё {list.length - picks.length} {plural(list.length - picks.length, 'день', 'дня', 'дней')} → в сетке
        </p>
      )}

      {list.length ? <MoodNote y={y} m={m} list={list} narrow={Boolean(song)} /> : <EmptyMonth k={k} today={today} />}
      {song && <SongCard day={song} />}
      <PageNo side="left" n={m * 2 + 1} />
    </>
  );
}

function Polaroid({ day, slot, i }: { day: DayRecord; slot: [number, number, number, number]; i: number }) {
  const src = useFileUrl(day.cover ?? day.photos[0]);
  const [x, y, w, r] = slot;
  const p = day.style.palette;
  const date = new Date(`${day.date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  return (
    <a
      href={`#/day/${day.id}`}
      className="bk-polaroid"
      title={`${day.title} · ${MODES[day.style.mode].name}`}
      style={vars({ left: `${x}%`, top: `${y}%`, '--w': String(w), '--r': `${(r + jitter(day.id, 1.6)).toFixed(2)}deg` })}
    >
      <span className="bk-tape" style={vars({ '--tc': TAPES[(i + hashStr(day.id)) % TAPES.length], '--tr': `${jitter(`${day.id}t`, 7).toFixed(1)}deg` })} />
      <span className="bk-photo block" style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.shades[1] ?? p.paper})` }}>
        {src && <img src={src} alt="" draggable={false} />}
      </span>
      <span className="bk-cap">
        <span className="min-w-0 truncate">{day.title}</span>
        <span className="shrink-0 font-mono font-normal text-ink-soft" style={{ fontSize: '.58em' }}>
          {date}
        </span>
      </span>
    </a>
  );
}

function MoodNote({ y, m, list, narrow }: { y: number; m: number; list: DayRecord[]; narrow: boolean }) {
  const mode = topModeOf(list);
  return (
    <div className="absolute top-[74%] left-[7%] -rotate-2" style={{ width: narrow ? '45%' : '80%' }}>
      <Doodle kind="arrow" style={{ left: narrow ? '58%' : '40%', top: '-5.5cqw', width: '7cqw', rotate: '-8deg' }} className="text-blue/50" />
      <p className="font-hand leading-[1.02] font-semibold text-blue" style={{ fontSize: '5.2cqw' }}>
        {moodPhrase(monthName(y, m), average(list))}
      </p>
      <p className="mt-[1.2cqw] font-mono tracking-[.1em] text-ink-soft uppercase" style={{ fontSize: 'max(9px, 1.7cqw)' }}>
        {list.length} {plural(list.length, 'запись', 'записи', 'записей')} · {MODES[mode].name}
      </p>
      <div
        className="mt-[1.6cqw] h-[2.3cqw] w-[78%] rotate-1 opacity-80"
        style={{ background: accentStrip(list), clipPath: 'polygon(1% 0, 99% 8%, 100% 50%, 98.5% 100%, 0 92%, 1.5% 50%)' }}
        title="цвета дней месяца"
      />
    </div>
  );
}

function SongCard({ day }: { day: DayRecord }) {
  return (
    <a href={`#/day/${day.id}`} className="kraft" style={vars({ left: '55%', top: '71%', width: '36cqw', padding: '2.4cqw 2.4cqw 2.2cqw', '--r': '3deg' })} title="Открыть этот день">
      <span className="bk-tape" style={vars({ '--w': '36', '--tc': 'rgba(236,226,200,.85)', '--tr': '-5deg', top: '-1.8cqw', width: '40%' })} />
      <span className="block text-center font-hand leading-none font-bold" style={{ fontSize: '4.9cqw' }}>
        Песня месяца
      </span>
      <Cassette />
      <span className="mt-[1.1cqw] line-clamp-2 block text-center font-serif leading-tight italic" style={{ fontSize: 'max(10px, 2.3cqw)' }}>
        {day.song.artist ? `${day.song.artist} — ` : ''}
        {day.song.title}
      </span>
    </a>
  );
}

const Cassette = () => (
  <svg viewBox="0 0 64 40" className="mx-auto mt-[1.3cqw] block w-[46%]" fill="none" stroke="#3a2817" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="1.5" y="1.5" width="61" height="37" rx="3.5" fill="#f4e7cc" />
    <rect x="8" y="6.5" width="48" height="16" rx="2" fill="#fffaf0" strokeWidth={1.2} />
    <path d="M15 38.2 L18.5 30 H45.5 L49 38.2" strokeWidth={1.2} />
    <path d="M25 14.5 H39" strokeWidth={1} />
    <g className="reel">
      <circle cx="21" cy="14.5" r="4.2" fill="#3a2817" stroke="none" />
      <path d="M21 11.6 V17.4 M18.4 13 L23.6 16 M18.4 16 L23.6 13" stroke="#f4e7cc" strokeWidth={0.9} />
    </g>
    <g className="reel">
      <circle cx="43" cy="14.5" r="4.2" fill="#3a2817" stroke="none" />
      <path d="M43 11.6 V17.4 M40.4 13 L45.6 16 M40.4 16 L45.6 13" stroke="#f4e7cc" strokeWidth={0.9} />
    </g>
    <circle cx="5.5" cy="5.5" r="1" fill="#3a2817" stroke="none" />
    <circle cx="58.5" cy="5.5" r="1" fill="#3a2817" stroke="none" />
  </svg>
);

function EmptyMonth({ k, today }: { k: string; today: string }) {
  const cur = today.slice(0, 7);
  const past = k <= cur;
  return (
    <>
      {(
        [
          [30, 35, 31, -5],
          [69, 39, 31, 4],
        ] as const
      ).map(([x, y, w, r], i) => (
        <div
          key={i}
          className="absolute border-2 border-dashed border-ink/20"
          style={{ left: `${x}%`, top: `${y}%`, width: `${w}cqw`, height: `${w * 1.16}cqw`, transform: `translate(-50%,-50%) rotate(${r}deg)` }}
        >
          <span className="absolute inset-x-[8%] top-[6%] bottom-[22%] border border-dashed border-ink/12" />
        </div>
      ))}
      <div className="absolute inset-x-[8%] top-[64%] text-center">
        <p className="font-hand text-ink-soft" style={{ fontSize: '5.4cqw' }}>
          {past ? 'Здесь пока ничего не вклеено' : 'Эти страницы ещё впереди'}
        </p>
        {past && (
          <a href={k === cur ? `#/new?date=${today}` : '#/new'} className="btn mt-[2.4cqw]">
            + записать день
          </a>
        )}
      </div>
    </>
  );
}

// ── правая страница месяца: сетка от руки ─────────────────────────

function MonthRight({ k, byDate, today }: Ctx & { k: string }) {
  const [y, m] = k.split('-').map(Number);
  const lead = firstWeekday(y, m);
  const n = daysIn(y, m);
  const rows = Math.ceil((lead + n) / 7);
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${k}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  const recorded = cells.filter((d) => d && byDate.has(d)).length;

  return (
    <>
      <div className="absolute top-[6.4%] right-[6%] left-[7%] grid grid-cols-7 font-hand font-bold" style={{ fontSize: '4.3cqw' }}>
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={`text-center ${i > 4 ? 'text-rust' : 'text-ink'}`}>
            {w}
          </span>
        ))}
      </div>
      <div className="absolute top-[13%] right-[6%] bottom-[12%] left-[7%]">
        <HandGrid rows={rows} seed={k} />
        <div className="relative grid h-full grid-cols-7" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {cells.map((date, i) =>
            date ? <Cell key={date} date={date} list={byDate.get(date)} today={today} col={i % 7} top={i < 7} /> : <span key={`e${i}`} />,
          )}
        </div>
      </div>
      <p className="absolute bottom-[3.6%] left-[8%] -rotate-1 font-hand text-ink-soft" style={{ fontSize: '3.7cqw' }}>
        {recorded ? `${recorded} ${plural(recorded, 'день', 'дня', 'дней')} в дневнике` : 'пока ни одного дня'}
      </p>
      <PageNo side="right" n={m * 2 + 2} />
    </>
  );
}

/** Сетка, нарисованная ручкой: линии чуть кривые и выходят за углы. */
function HandGrid({ rows, seed }: { rows: number; seed: string }) {
  const W = 700;
  const H = rows * 100;
  const paths = useMemo(() => {
    const rnd = rng(hashStr(seed));
    const line = (x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const [ux, uy] = [dx / len, dy / len];
      const [nx, ny] = [-uy, ux];
      const a = 1.5 + rnd() * 5;
      const b = 1.5 + rnd() * 5;
      const tilt = (rnd() - 0.5) * 3;
      const sx = x1 - ux * a + nx * tilt;
      const sy = y1 - uy * a + ny * tilt;
      const ex = x2 + ux * b - nx * tilt;
      const ey = y2 + uy * b - ny * tilt;
      let d = `M${sx.toFixed(1)} ${sy.toFixed(1)}`;
      const segs = 5;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const w = i === segs ? 0 : (rnd() - 0.5) * 2.2;
        d += ` L${(sx + (ex - sx) * t + nx * w).toFixed(1)} ${(sy + (ey - sy) * t + ny * w).toFixed(1)}`;
      }
      return d;
    };
    const out: { d: string; outer: boolean }[] = [];
    for (let r = 0; r <= rows; r++) {
      const outer = r === 0 || r === rows;
      out.push({ d: line(0, r * 100, W, r * 100), outer });
      if (outer) out.push({ d: line(0, r * 100, W, r * 100), outer });
    }
    for (let c = 0; c <= 7; c++) {
      const outer = c === 0 || c === 7;
      out.push({ d: line(c * 100, 0, c * 100, H), outer });
      if (outer) out.push({ d: line(c * 100, 0, c * 100, H), outer });
    }
    return out;
  }, [rows, seed, H]);

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke="#3b3128"
          strokeOpacity={p.outer ? 0.5 : 0.42}
          strokeWidth={p.outer ? 1.3 : 1.15}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function Cell({ date, list, today, col, top }: { date: string; list?: DayRecord[]; today: string; col: number; top: boolean }) {
  const num = Number(date.slice(8));
  const isToday = date === today;
  const future = date > today;
  const numEl = (
    <span
      className={`absolute top-[6%] left-[9%] font-hand leading-none font-semibold ${col > 4 ? 'text-rust' : 'text-ink'} ${future ? 'opacity-35' : ''}`}
      style={{ fontSize: '3.9cqw' }}
    >
      {num}
    </span>
  );
  const day = list?.[0];

  if (!day) {
    if (future)
      return (
        <div className="relative">
          {numEl}
          {isToday && <HandRing />}
        </div>
      );
    return (
      <a href={`#/new?date=${date}`} className="group relative" title="Записать этот день" aria-label={`Записать день ${date}`}>
        {numEl}
        {isToday && <HandRing />}
        <span
          className="absolute inset-0 grid place-items-center font-hand text-ink-soft opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{ fontSize: '6cqw' }}
        >
          +
        </span>
      </a>
    );
  }

  const r = jitter(day.id, 5);
  return (
    <a href={`#/day/${day.id}`} className="cell-day relative hover:z-30 focus-visible:z-30" title={`${day.title} · ${MODES[day.style.mode].name}`}>
      <span className="wash" style={vars({ '--c': day.style.palette.accent, '--r': `${jitter(`${day.id}w`, 40).toFixed(0)}deg` })} />
      {numEl}
      {isToday && <HandRing />}
      {list.length > 1 && <MiniStamp day={list[1]} r={r - 9} behind />}
      <MiniStamp day={day} r={r} />
      <Peek day={day} down={top} more={list.length - 1} />
    </a>
  );
}

/** Почтовая марка с фото дня; второй день той же даты — марка под ней. */
function MiniStamp({ day, r, behind }: { day: DayRecord; r: number; behind?: boolean }) {
  const src = useFileUrl(day.cover ?? day.photos[0]);
  const p = day.style.palette;
  return (
    <span className={`stamp-wrap ${behind ? 'stamp-behind' : ''}`} style={vars({ '--r': `${r.toFixed(1)}deg` })}>
      <span className="stamp-mini">
        <span style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.shades[1] ?? p.paper})` }}>{src && <img src={src} alt="" draggable={false} />}</span>
      </span>
      {!behind && (
        <svg className="postmark" viewBox="0 0 40 14" fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" aria-hidden>
          <path d="M1 3 C 6 0.5, 10 5.5, 15 3 S 24 0.5, 29 3 S 36 5, 39 3" />
          <path d="M1 7 C 6 4.5, 10 9.5, 15 7 S 24 4.5, 29 7 S 36 9, 39 7" />
          <path d="M1 11 C 6 8.5, 10 13.5, 15 11 S 24 8.5, 29 11 S 36 13, 39 11" />
        </svg>
      )}
    </span>
  );
}

function Peek({ day, down, more }: { day: DayRecord; down: boolean; more: number }) {
  const src = useFileUrl(day.cover ?? day.photos[0]);
  const p = day.style.palette;
  return (
    <span className={`peek ${down ? 'peek-down' : ''}`} aria-hidden>
      <span className="bk-photo block" style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.shades[1] ?? p.paper})` }}>
        {src && <img src={src} alt="" draggable={false} />}
      </span>
      <span className="absolute inset-x-0 bottom-[0.5cqw] truncate px-[1cqw] text-center font-hand font-semibold text-ink" style={{ fontSize: 'max(10px, 2.3cqw)' }}>
        {day.title}
        {more > 0 && ` +${more}`}
      </span>
    </span>
  );
}

// ── титул тома и оглавление ───────────────────────────────────────

function TitlePage({ year, byDate }: Ctx & { year: number }) {
  const list = useMemo(() => daysOf(byDate, String(year)), [byDate, year]);
  return (
    <>
      <p className="absolute inset-x-0 top-[9%] text-center font-mono tracking-[.3em] text-ink-soft uppercase" style={{ fontSize: 'max(9px, 1.8cqw)' }}>
        Атмосфера · дневник ощущений
      </p>
      <h2 className="absolute inset-x-0 top-[16%] -rotate-2 text-center font-hand leading-[.9] font-bold text-blue" style={{ fontSize: '17cqw' }}>
        Дневник
      </h2>
      <p className="absolute inset-x-0 top-[33%] text-center font-display leading-none text-ink" style={{ fontSize: '15cqw', letterSpacing: '.08em' }}>
        {year}
      </p>
      <div
        className="absolute top-[50.5%] right-[20%] left-[20%] h-[3.2cqw] -rotate-2 opacity-80"
        style={{ background: list.length ? accentStrip(list) : 'rgba(240,210,115,.8)', clipPath: 'polygon(1% 0, 99% 8%, 100% 50%, 98.5% 100%, 0 92%, 1.5% 50%)' }}
      />
      <div
        className="absolute top-[68%] left-1/2 grid aspect-square w-[30cqw] place-items-center rounded-full text-center font-mono text-blue/85 uppercase"
        style={{ transform: 'translate(-50%,-50%) rotate(10deg)', border: '0.8cqw double rgba(47,79,143,.7)', fontSize: 'max(8px, 1.6cqw)', letterSpacing: '.12em', lineHeight: 1.3 }}
      >
        <span>
          ex libris
          <b className="block font-display leading-none font-semibold tracking-normal normal-case" style={{ fontSize: '9cqw' }}>
            {list.length}
          </b>
          {plural(list.length, 'день', 'дня', 'дней')}
          {list.length > 0 && (
            <span className="mt-[.6cqw] block normal-case" style={{ fontSize: 'max(8px, 1.4cqw)', letterSpacing: '.04em' }}>
              {MODES[topModeOf(list)].name}
            </span>
          )}
        </span>
      </div>
      <Doodle kind="swirl" style={{ left: '10%', top: '44%', width: '8cqw', rotate: '-10deg' }} />
      <Doodle kind="star" style={{ right: '11%', top: '20%', width: '6cqw', rotate: '14deg' }} className="text-rust/55" />
      <div className="absolute right-[12%] bottom-[9.5%] left-[12%] flex items-end gap-[1.5cqw] font-hand text-ink-soft" style={{ fontSize: '3.9cqw' }}>
        <span className="shrink-0">Этот дневник принадлежит:</span>
        <span className="mb-[0.9cqw] flex-1 border-b-2 border-dotted border-ink/30" />
      </div>
      <PageNo side="left" n={1} />
    </>
  );
}

function TocPage({ year, byDate, today }: Ctx & { year: number }) {
  const cur = today.slice(0, 7);
  return (
    <>
      <PageTitle>Оглавление</PageTitle>
      <ol className="absolute top-[17%] right-[7%] bottom-[10%] left-[8%] flex flex-col justify-between">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => {
          const k = ym(year, mm);
          const n = daysIn(year, mm);
          const future = k > cur;
          const filled = [...byDate.keys()].filter((d) => d.startsWith(k)).length;
          return (
            <li key={mm}>
              <a href={`#/calendar/${k}`} className={`toc-row flex items-center gap-[2cqw] py-[.3cqw] ${future ? 'opacity-45' : ''}`}>
                <span className="relative w-[23cqw] shrink-0 font-hand leading-none font-semibold" style={{ fontSize: '4.6cqw' }}>
                  {monthName(year, mm)}
                  {k === cur && <HandRing />}
                </span>
                <span className="flex h-[3cqw] flex-1 items-center justify-between">
                  {Array.from({ length: n }, (_, d) => {
                    const day = byDate.get(`${k}-${pad(d + 1)}`)?.[0];
                    return day ? (
                      <span
                        key={d}
                        className="h-[2.9cqw] w-[.95cqw] rounded-full"
                        style={{ background: day.style.palette.accent, rotate: `${jitter(day.id, 14).toFixed(0)}deg` }}
                        title={`${d + 1} · ${day.title}`}
                      />
                    ) : (
                      <span key={d} className="h-[.5cqw] w-[.5cqw] rounded-full bg-ink/25" />
                    );
                  })}
                </span>
                <span className="w-[4cqw] shrink-0 text-right font-mono text-ink-soft" style={{ fontSize: 'max(9px, 1.8cqw)' }}>
                  {mm * 2 + 1}
                </span>
              </a>
              {filled > 0 && <span className="sr-only">{filled} записей</span>}
            </li>
          );
        })}
      </ol>
      <PageNo side="right" n={2} />
    </>
  );
}
