import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode, type RefObject } from 'react';
import { MODES } from '../lib/rules/modes';
import { thumbCached, thumbUrl, warmThumbs } from '../lib/thumb';
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

/**
 * Копия страницы в полосе листа или у корешка: видна узкой полоской [x0, x1] (доли ширины страницы)
 * и не кликается. Таких копий при перелистывании около двадцати, поэтому в них строятся только
 * столбцы календаря, попадающие в полоску, и без всплывающих фото дня. null — настоящая страница.
 */
const View = createContext<readonly [number, number] | null>(null);
const viewOf = (side: Side, s: number, w: number) => (side === 'right' ? ([s, s + w] as const) : ([1 - s - w, 1 - s] as const));
/** Сетка месяца на правой странице: left 11%, right 6% — столбец c занимает эту долю ширины. */
const colSpan = (c: number) => [0.11 + (c * 0.83) / 7, 0.11 + ((c + 1) * 0.83) / 7] as const;

/** Уменьшенная копия фото с общим кэшем — марки лёгкие, и при перелистывании фото не мигают. */
const THUMB = 420;
function useFileUrl(ref?: FileRef) {
  const [url, setUrl] = useState(() => thumbCached(ref, THUMB));
  useEffect(() => {
    if (!ref) return setUrl(undefined);
    const hit = thumbCached(ref, THUMB);
    if (hit) return setUrl(hit);
    let alive = true;
    thumbUrl(ref, THUMB)
      .then((u) => alive && setUrl(u))
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
interface Anim {
  to: string;
  dir: 1 | -1;
  mode: 'auto' | 'drag';
}
type Render = (p: number) => void;
type Side = 'left' | 'right';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

// ── форма бумаги ──────────────────────────────────────────────────
// Страница — цепочка полос от корешка наружу (ширины — доли страницы). У корешка бумага круто
// уходит в переплёт, дальше выгибается и лежит почти ровно. Лист при перелистывании собран так же,
// только «ровная» часть порезана на 8 полос, чтобы гнуться.
const GUTTER_W = [0.02, 0.025, 0.03, 0.035];
const GUTTER_A = [40, 24, 12, 5];
const PAGE_A = 2.5;
const MAIN_W = 1 - GUTTER_W.reduce((a, b) => a + b, 0);
const STATIC_W = [...GUTTER_W, MAIN_W];
const STATIC_A = [...GUTTER_A, PAGE_A];
const LEAF_W = [...GUTTER_W, ...Array<number>(8).fill(MAIN_W / 8)];
const LEAF_R = [...GUTTER_A, ...Array<number>(8).fill(PAGE_A)];
/** Толщина блока страниц у самого корешка, px; к краю он толще — на высоту изгиба. */
const SPINE = 9;
const FLIP_MS = 1250;

const RAD = Math.PI / 180;
const starts = (ws: number[]) => ws.map((_, i) => ws.slice(0, i).reduce((a, b) => a + b, 0));
const STATIC_S = starts(STATIC_W);
const LEAF_S = starts(LEAF_W);
const LEAF_C = LEAF_S.map((s, i) => s + LEAF_W[i] / 2);
const LIFT0 = LEAF_W.reduce((a, w, i) => a + w * Math.sin(LEAF_R[i] * RAD), 0);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/**
 * Куда сдвинуть копию страницы внутри грани полосы, чтобы она показала свой кусок (s — начало
 * полосы от корешка). Грани заходят на соседнюю полосу на 1px (против швов) — где это сдвигает
 * начало грани, компенсируем: у цепочки влево — лицо, у цепочки вправо — оборот.
 */
const pageLeft = (side: Side, s: number, w: number, nudge: boolean) =>
  `calc(var(--pw) * ${side === 'right' ? -s : -(1 - s - w)}${nudge ? ' + 1px' : ''})`;
/** Свет: чем круче наклон бумаги, тем она темнее. Градиент по полосе — между углами соседей. */
const shadeOf = (a: number) => (1 - Math.abs(Math.cos(a * RAD))) ** 1.3 * 0.42;
const shadeGrad = (A: number[], i: number, deg: number) => {
  const dIn = shadeOf(i === 0 ? A[0] : (A[i] + A[i - 1]) / 2).toFixed(3);
  const dOut = shadeOf(i === A.length - 1 ? A[i] : (A[i] + A[i + 1]) / 2).toFixed(3);
  return `linear-gradient(${deg}deg, rgba(28,16,3,${dIn}), rgba(28,16,3,${dOut}))`;
};
/** Профиль нижнего края страницы от корешка: точки [x, z] в px. */
const profileOf = (pw: number) => {
  let x = 0;
  let z = 0;
  const pts: [number, number][] = [[0, 0]];
  STATIC_W.forEach((w, k) => {
    x += w * pw * Math.cos(STATIC_A[k] * RAD);
    z += w * pw * Math.sin(STATIC_A[k] * RAD);
    pts.push([x, z]);
  });
  return pts;
};

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
  const [want, setWant] = useState(target);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [enter, setEnter] = useState<1 | -1>(1);
  const [pw, setPw] = useState(0);

  const bookRef = useRef<HTMLDivElement>(null);
  const castL = useRef<HTMLDivElement>(null);
  const castR = useRef<HTMLDivElement>(null);
  const leafRender = useRef<Render | null>(null);
  const pRef = useRef(0);
  const raf = useRef(0);

  // куда листать — следует за адресом
  useEffect(() => setWant(target), [target]);

  // пока смотрим разворот, в свободное время готовим марки соседних месяцев — лист не ждёт фото
  useEffect(() => {
    if (!days) return;
    const near = new Set([step(shown, -1), step(shown, 1)]);
    const refs = days.filter((d) => near.has(d.date.slice(0, 7))).map((d) => d.cover ?? d.photos[0]);
    return warmThumbs(refs.filter((r): r is FileRef => Boolean(r)), THUMB);
  }, [shown, days]);

  /** Плавно ведёт лист от p=from к p=to; на каждом кадре лист перерисовывается без React. */
  const tween = useCallback((from: number, to: number, ms: number, ease: (t: number) => number, done: () => void) => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      pRef.current = from + (to - from) * ease(t);
      leafRender.current?.(pRef.current);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else done();
    };
    raf.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // адрес сменился → перелистываем к нему (быстрые нажатия догоняются следующим листом)
  useEffect(() => {
    if (anim || want === shown) return;
    const dir = ord(want) > ord(shown) ? 1 : -1;
    if (!wide || calm || !days || !pw) {
      setEnter(dir);
      setShown(want);
      return;
    }
    pRef.current = 0;
    setAnim({ to: want, dir, mode: 'auto' });
  }, [want, shown, anim, wide, calm, days, pw]);

  useEffect(() => {
    if (anim?.mode !== 'auto') return;
    const to = anim.to;
    tween(pRef.current, 1, FLIP_MS, easeInOut, () => {
      setShown(to);
      setAnim(null);
    });
  }, [anim, tween]);

  // ширина страницы в px → --pw: по ней режутся полосы и строится обрез блока
  const hasDays = Boolean(days);
  useLayoutEffect(() => {
    const el = bookRef.current;
    if (!el) return;
    const set = () => {
      const w = el.offsetWidth / 2;
      el.style.setProperty('--pw', `${w}px`);
      setPw(w);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wide, hasDays]);

  const go = (d: number) => {
    location.hash = `#/calendar/${step(target, d)}`;
  };

  /** Тянем страницу за уголок: лист идёт за курсором; отпустили — долистывается или ложится обратно. */
  const grab = (dir: 1 | -1) => (e: React.PointerEvent) => {
    if (anim || e.button !== 0 || !bookRef.current) return;
    e.preventDefault();
    const to = step(shown, dir);
    if (calm) {
      location.hash = `#/calendar/${to}`;
      return;
    }
    const width = bookRef.current.getBoundingClientRect().width;
    const sx = e.clientX;
    let moved = false;
    pRef.current = 0;
    setAnim({ to, dir, mode: 'drag' });
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - sx) > 5) moved = true;
      pRef.current = clamp01(((sx - ev.clientX) * dir) / (width * 0.8));
      leafRender.current?.(pRef.current);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const p = pRef.current;
      if (!moved || p > 0.22)
        tween(p, 1, moved ? 450 + (1 - p) * 800 : FLIP_MS, moved ? easeOut : easeInOut, () => {
          setWant(to);
          setShown(to);
          setAnim(null);
          location.hash = `#/calendar/${to}`;
        });
      else tween(p, 0, 300 + p * 700, easeOut, () => setAnim(null));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
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
      if (!s || anim) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
    },
  };

  const profile = useMemo(() => profileOf(pw), [pw]);

  if (error) return <p className="label text-rust">Ошибка хранилища: {error}</p>;
  if (!days) return <p className="py-20 text-center font-hand text-3xl text-ink-soft">Открываю дневник…</p>;

  const ctx: Ctx = { byDate, today };
  const left = (k: string) => (isYear(k) ? <TitlePage year={Number(k)} {...ctx} /> : <MonthLeft k={k} {...ctx} />);
  const right = (k: string) => (isYear(k) ? <TocPage year={Number(k)} {...ctx} /> : <MonthRight k={k} {...ctx} />);
  const label = (k: string) => (isYear(k) ? `Оглавление ${k}` : `${monthName(Number(k.slice(0, 4)), Number(k.slice(5)))}${k.slice(0, 4) !== target.slice(0, 4) ? ` ${k.slice(0, 4)}` : ''}`);

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

  // во время листания под листом уже лежит страница, к которой листаем
  const staticLeft = anim?.dir === -1 ? left(anim.to) : left(shown);
  const staticRight = anim?.dir === 1 ? right(anim.to) : right(shown);

  // обрез блока страниц снизу: верх повторяет профиль бумаги, низ лежит на обложке
  const [xEnd, zTop] = profile[profile.length - 1];
  const edgeH = zTop + SPINE;
  const edgeClip = (side: Side) =>
    `polygon(${[...profile.map(([x, z]) => [side === 'right' ? x : xEnd - x, zTop - z]), side === 'right' ? [xEnd, edgeH] : [0, edgeH], side === 'right' ? [0, edgeH] : [xEnd, edgeH]]
      .map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`)
      .join(', ')})`;
  const edgeStyle = (side: Side): CSSProperties => ({
    left: side === 'right' ? '50%' : `${pw - xEnd}px`,
    width: `${xEnd}px`,
    height: `${edgeH}px`,
    transform: `translateZ(${zTop.toFixed(1)}px) rotateX(-90deg)`,
    clipPath: edgeClip(side),
  });

  return (
    <section {...swipe}>
      <TopBar target={target} today={today} hint="листай стрелками ← → или потяни страницу за уголок" />
      <div className="mt-8 mb-24 grid grid-cols-[72px_1fr_72px] items-center gap-4 xl:gap-8">
        <NavButton dir={-1} label={label(step(target, -1))} onClick={() => go(-1)} />
        <div className="book-stage mx-auto w-full" style={{ maxWidth: 'min(1120px, calc((100vh - 250px) * 1.56))' }}>
          <div className="book3d" ref={bookRef} style={vars({ '--spine': `${SPINE}px` })}>
            <div className="book-shadow" />
            <div className="board" />
            <div className="board-edge" />
            {pw > 0 && (
              <>
                <div className="block-edge block-edge-l" style={edgeStyle('left')} />
                <div className="block-edge block-edge-r" style={edgeStyle('right')} />
              </>
            )}

            <StaticHalf side="left" castRef={castL} onCorner={anim ? undefined : grab(-1)} onCornerKey={() => go(-1)} cornerLabel={`Назад: ${label(step(shown, -1))}`}>
              {staticLeft}
            </StaticHalf>
            <StaticHalf side="right" castRef={castR} onCorner={anim ? undefined : grab(1)} onCornerKey={() => go(1)} cornerLabel={`Вперёд: ${label(step(shown, 1))}`}>
              {staticRight}
            </StaticHalf>

            {anim && (
              <Leaf
                dir={anim.dir}
                front={anim.dir === 1 ? <Page side="right">{right(shown)}</Page> : <Page side="left">{left(shown)}</Page>}
                back={anim.dir === 1 ? <Page side="left">{left(anim.to)}</Page> : <Page side="right">{right(anim.to)}</Page>}
                renderRef={leafRender}
                pRef={pRef}
                origin={anim.dir === 1 ? castR : castL}
                land={anim.dir === 1 ? castL : castR}
              />
            )}
          </div>
        </div>
        <NavButton dir={1} label={label(step(target, 1))} onClick={() => go(1)} />
      </div>
    </section>
  );
}

/**
 * Неподвижная половина разворота: та же цепочка полос, что у листа, — бумага у корешка
 * уходит в переплёт. Живая (кликабельная) только широкая полоса; узкие у корешка — копии.
 */
function StaticHalf({
  side,
  castRef,
  children,
  onCorner,
  onCornerKey,
  cornerLabel,
}: {
  side: Side;
  castRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  onCorner?: (e: React.PointerEvent) => void;
  onCornerKey: () => void;
  cornerLabel: string;
}) {
  const sign = side === 'right' ? -1 : 1;
  const deg = side === 'right' ? 90 : 270;
  const last = STATIC_W.length - 1;
  const build = (k: number): ReactNode => {
    const w = STATIC_W[k];
    const main = k === last;
    return (
      <div className="strip" style={{ width: `calc(var(--pw) * ${w})`, transform: `rotateY(${sign * (k === 0 ? STATIC_A[0] : STATIC_A[k] - STATIC_A[k - 1])}deg)` }}>
        <div className="strip-face">
          <div className="strip-page" style={{ left: pageLeft(side, STATIC_S[k], w, side === 'left') }} inert={!main} aria-hidden={main ? undefined : true}>
            {main ? (
              <Page side={side} onCorner={onCorner} onCornerKey={onCornerKey} cornerLabel={cornerLabel}>
                {children}
              </Page>
            ) : (
              <View.Provider value={viewOf(side, STATIC_S[k], w)}>
                <Page side={side}>{children}</Page>
              </View.Provider>
            )}
          </div>
          <div className="strip-shade" style={{ background: shadeGrad(STATIC_A, k, deg) }} />
        </div>
        {main ? <div className="cast" ref={castRef} /> : build(k + 1)}
      </div>
    );
  };
  return <div className={`half ${side === 'right' ? 'half-r chain-r' : 'half-l chain-l'}`}>{build(0)}</div>;
}

/**
 * Перелистываемый лист. Вложенные полосы: каждая повёрнута относительно предыдущей, поэтому лист
 * гнётся. Пока страницу поднимают, свободный край ведёт; перевалив через корешок — отстаёт и
 * мягко ложится последним. В начале и в конце лист в точности повторяет форму неподвижной
 * страницы, поэтому подмена на неё незаметна.
 */
function Leaf({
  dir,
  front,
  back,
  renderRef,
  pRef,
  origin,
  land,
}: {
  dir: 1 | -1;
  front: ReactNode;
  back: ReactNode;
  renderRef: MutableRefObject<Render | null>;
  pRef: MutableRefObject<number>;
  origin: RefObject<HTMLDivElement | null>;
  land: RefObject<HTMLDivElement | null>;
}) {
  const strips = useRef<(HTMLDivElement | null)[]>([]);
  const shades = useRef<(HTMLDivElement | null)[]>([]);
  const n = LEAF_W.length;
  // лист вправо (dir=1) — цепочка от корешка вправо: лицо — правая страница, оборот — левая
  const frontSide: Side = dir === 1 ? 'right' : 'left';
  const backSide: Side = dir === 1 ? 'left' : 'right';

  useLayoutEffect(() => {
    const sign = dir === 1 ? -1 : 1;
    const render: Render = (p) => {
      const bend = 0.22 * Math.sin(2 * Math.PI * p) + 0.12 * Math.sin(Math.PI * p);
      const A = LEAF_R.map((r, i) => r + (180 - 2 * r) * clamp01(p + LEAF_C[i] ** 1.6 * bend));
      let reach = 0;
      let lift = 0;
      for (let i = 0; i < n; i++) {
        const s = strips.current[i];
        if (s) s.style.transform = `rotateY(${(sign * (i === 0 ? A[0] : A[i] - A[i - 1])).toFixed(3)}deg)`;
        const fr = shades.current[2 * i];
        const bk = shades.current[2 * i + 1];
        if (fr) fr.style.background = shadeGrad(A, i, dir === 1 ? 90 : 270);
        if (bk) bk.style.background = shadeGrad(A, i, dir === 1 ? 270 : 90);
        reach += LEAF_W[i] * Math.cos(A[i] * RAD);
        lift += LEAF_W[i] * Math.sin(A[i] * RAD);
      }
      // тень листа: на исходной странице, пока он над ней, и на принимающей, пока он ложится;
      // когда лист лёг, тень гаснет до нуля — без вспышки при подмене
      const soft = clamp01((lift - LIFT0) * 4);
      const o = origin.current;
      const l = land.current;
      if (o) {
        o.style.width = `${clamp01(Math.max(0, reach) + 0.3 * (lift - LIFT0)) * 100}%`;
        o.style.opacity = (0.55 * (1 - p) * soft).toFixed(3);
      }
      if (l) {
        l.style.width = `${clamp01(Math.max(0, -reach) + 0.3 * (lift - LIFT0)) * 100}%`;
        l.style.opacity = (0.6 * p * soft).toFixed(3);
      }
    };
    renderRef.current = render;
    render(pRef.current);
    return () => {
      renderRef.current = null;
      for (const c of [origin.current, land.current]) {
        if (!c) continue;
        c.style.width = '0';
        c.style.opacity = '0';
      }
    };
  }, [dir, n, renderRef, pRef, origin, land]);

  const strip = (k: number): ReactNode => (
    <div
      className="strip"
      style={{ width: `calc(var(--pw) * ${LEAF_W[k]})` }}
      ref={(el) => {
        strips.current[k] = el;
      }}
    >
      <div className="strip-face">
        <div className="strip-page" style={{ left: pageLeft(frontSide, LEAF_S[k], LEAF_W[k], dir === -1) }} inert>
          <View.Provider value={viewOf(frontSide, LEAF_S[k], LEAF_W[k])}>{front}</View.Provider>
        </div>
        <div
          className="strip-shade"
          ref={(el) => {
            shades.current[2 * k] = el;
          }}
        />
      </div>
      <div className="strip-face strip-under">
        <div className="strip-page" style={{ left: pageLeft(backSide, LEAF_S[k], LEAF_W[k], dir === 1) }} inert>
          <View.Provider value={viewOf(backSide, LEAF_S[k], LEAF_W[k])}>{back}</View.Provider>
        </div>
        <div
          className="strip-shade"
          ref={(el) => {
            shades.current[2 * k + 1] = el;
          }}
        />
      </div>
      {k + 1 < n && strip(k + 1)}
    </div>
  );

  return (
    <div className={`leaf ${dir === 1 ? 'chain-r' : 'chain-l'}`} aria-hidden>
      {strip(0)}
    </div>
  );
}

/** Страница. Загнутый уголок — её часть: переворачивается вместе с листом и не пропадает. */
function Page({
  side,
  children,
  onCorner,
  onCornerKey,
  cornerLabel,
}: {
  side: 'left' | 'right' | 'single';
  children: ReactNode;
  onCorner?: (e: React.PointerEvent) => void;
  onCornerKey?: () => void;
  cornerLabel?: string;
}) {
  const live = Boolean(onCorner);
  return (
    <div className={`page page-${side}`}>
      {children}
      {side !== 'single' && (
        <span
          className={`dog-ear dog-ear-${side === 'left' ? 'l' : 'r'}`}
          role={live ? 'button' : undefined}
          tabIndex={live ? 0 : -1}
          aria-label={live ? cornerLabel : undefined}
          aria-hidden={live ? undefined : true}
          title={live ? cornerLabel : undefined}
          onPointerDown={onCorner}
          onKeyDown={
            live && onCornerKey
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onCornerKey();
                  }
                }
              : undefined
          }
        />
      )}
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
  <span className={`absolute bottom-[3.4%] font-mono text-ink-soft ${side === 'left' ? 'left-[13%]' : 'right-[13%]'}`} style={{ fontSize: 'max(9px, 1.8cqw)' }}>
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
        <p className="absolute top-[69%] right-[14%] rotate-2 font-hand text-ink-soft" style={{ fontSize: '3.8cqw' }}>
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
  const view = useContext(View);
  const [x0, y, w, r] = slot;
  const x = 4 + (x0 - 4) * 0.9; // справа — изгиб у корешка, коллаж держится от него подальше
  // в копии-полоске не строим фото, которое в неё не попадает (с запасом на наклон и ленту)
  if (view && ((x + w * 0.65) / 100 < view[0] || (x - w * 0.65) / 100 > view[1])) return null;
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
    <a href={`#/day/${day.id}`} className="kraft" style={vars({ left: '49%', top: '71%', width: '36cqw', padding: '2.4cqw 2.4cqw 2.2cqw', '--r': '3deg' })} title="Открыть этот день">
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
      <div className="absolute top-[6.4%] right-[6%] left-[11%] grid grid-cols-7 font-hand font-bold" style={{ fontSize: '4.3cqw' }}>
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={`text-center ${i > 4 ? 'text-rust' : 'text-ink'}`}>
            {w}
          </span>
        ))}
      </div>
      <div className="absolute top-[13%] right-[6%] bottom-[12%] left-[11%]">
        <HandGrid rows={rows} seed={k} />
        <div className="relative grid h-full grid-cols-7" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {cells.map((date, i) =>
            date ? <Cell key={date} date={date} list={byDate.get(date)} today={today} col={i % 7} top={i < 7} /> : <span key={`e${i}`} />,
          )}
        </div>
      </div>
      <p className="absolute bottom-[3.6%] left-[13%] -rotate-1 font-hand text-ink-soft" style={{ fontSize: '3.7cqw' }}>
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
  const view = useContext(View);
  const lite = view !== null;
  if (view) {
    const [c0, c1] = colSpan(col);
    if (c1 < view[0] - 0.03 || c0 > view[1] + 0.03) return <span />; // столбец не попадает в полоску
  }
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
      {/* марка занимает всё место под числом — дата остаётся открытой */}
      <span className="stamp-zone">
        {list.length > 1 && <MiniStamp day={list[1]} r={r - 7} behind />}
        <MiniStamp day={day} r={r} />
      </span>
      {!lite && <Peek day={day} down={top} more={list.length - 1} />}
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
      <ol className="absolute top-[17%] right-[7%] bottom-[10%] left-[12%] flex flex-col justify-between">
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
