import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { mulberry32 } from '../../lib/color';
import { emotionOf, type DayEmotion, type EmotionId } from '../../lib/rules/emotion';
import type { DayRecord, StyleParams } from '../../lib/types';
import { TEXT_GAP, type FrameBox } from './layout';

/**
 * Материал страницы по настроению дня. Кадр (шейдер) говорит, как день выглядел; материал — как он
 * ощущался в руках: на какой бумаге записан, каким почерком, чем приколот и что на листе осталось.
 * Всё рисуется поверх обложки вживую, поэтому старые дни получают материал без пересъёмки.
 */

type Palette = StyleParams['palette'];

export const useEmotion = (day: DayRecord) => useMemo(() => emotionOf(day), [day]);

const mix = (a: string, b: string, k: number) => `color-mix(in srgb, ${a} ${k}%, ${b})`;
const ballpoint = (dark: boolean) => (dark ? '#b3c2ff' : '#2a45a6');
const redPen = (dark: boolean) => (dark ? '#ff7a6b' : '#c8281d');
const vars = (o: Record<string, string | number>) => o as CSSProperties;

const svgUrl = (w: number, h: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;

/** Рельеф смятого листа: «турбулентный» шум даёт острые складки, свет сбоку — тени и блики на них. */
const relief = (gain: string, freq: number, scale: number, elev: number, seed: number) =>
  `<filter id='r' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>` +
  `<feTurbulence type='turbulence' baseFrequency='${freq}' numOctaves='5' seed='${seed}' stitchTiles='stitch'/>` +
  `<feDiffuseLighting surfaceScale='${scale}' lighting-color='#fff'><feDistantLight azimuth='225' elevation='${elev}'/></feDiffuseLighting>` +
  `<feComponentTransfer>${['R', 'G', 'B'].map((c) => `<feFunc${c} type='linear' ${gain}/>`).join('')}</feComponentTransfer>` +
  `</filter><rect width='100%' height='100%' filter='url(#r)'/>`;
const CRUMPLE_SHADE = svgUrl(620, 620, relief("slope='1.5'", 0.0065, 7, 42, 11));
const CRUMPLE_SHINE = svgUrl(620, 620, relief("slope='3.2' intercept='-2.05'", 0.0065, 7, 42, 11));

/** Зерно акварельной бумаги «торшон»: мелкие бугорки, освещённые сбоку. */
const TOOTH = svgUrl(
  260,
  260,
  `<filter id='t' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='0.05' numOctaves='3' seed='5' stitchTiles='stitch'/>` +
    `<feDiffuseLighting surfaceScale='1.9' lighting-color='#fff'><feDistantLight azimuth='225' elevation='58'/></feDiffuseLighting>` +
    `<feComponentTransfer><feFuncR type='linear' slope='1.17'/><feFuncG type='linear' slope='1.17'/><feFuncB type='linear' slope='1.17'/></feComponentTransfer></filter>` +
    `<rect width='100%' height='100%' filter='url(#t)'/>`,
);

/** Пятна времени (фоксинг) — рыжие крапинки старой бумаги. */
const FOXING = svgUrl(
  360,
  360,
  `<filter id='x' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.085' numOctaves='3' seed='17' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 0.55  0 0 0 0 0.35  0 0 0 0 0.13  18 0 0 0 -12.4'/><feGaussianBlur stdDeviation='0.5'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#x)'/>`,
);

// ── бумага ─────────────────────────────────────────────────────────────

const TINT: Record<EmotionId, [string, number] | null> = {
  joy: ['#ffffff', 40],
  love: ['#f7d5cf', 34],
  calm: null,
  sad: ['#d3dae1', 42],
  tense: ['#ddd6c8', 22],
  nostalgia: ['#e6cf98', 46],
  wonder: ['#f0e6d0', 28],
  routine: ['#fbfbf6', 60],
};

export function paperOf(id: EmotionId, p: Palette) {
  const t = TINT[id];
  return p.dark || !t ? p.paper : mix(t[0], p.paper, t[1]);
}

// ── почерк ─────────────────────────────────────────────────────────────

export interface TitleLook {
  css: CSSProperties;
  /** буквы скачут: [наклон, °; подскок, em] */
  jitter?: [number, number];
}

export function titleLook(e: DayEmotion, p: Palette): TitleLook {
  const base: CSSProperties = { fontWeight: 400, lineHeight: 1.06 };
  switch (e.id) {
    case 'joy':
      return { css: { ...base, fontFamily: 'Pangolin, cursive', fontSize: '6cqw', lineHeight: 1.15, color: mix(p.accent, p.ink, 82), transform: 'rotate(-1.2deg)' }, jitter: [6, 0.08] };
    case 'love':
      return { css: { ...base, fontFamily: '"Marck Script", cursive', fontSize: '7.2cqw', lineHeight: 1.08, color: mix(p.accent, p.ink, 45), transform: 'rotate(-1.6deg)' } };
    case 'sad':
      return { css: { ...base, fontFamily: '"Bad Script", cursive', fontSize: '5.8cqw', lineHeight: 1.2, color: mix(p.ink, '#55657c', 62), opacity: 0.8, transform: 'rotate(1.3deg)', transformOrigin: 'left center' } };
    case 'tense':
      return {
        css: { ...base, fontFamily: 'Underdog, cursive', fontSize: '5.6cqw', lineHeight: 1.2, letterSpacing: '0.01em', textShadow: `0.16cqw 0.06cqw 0 ${mix(p.ink, 'transparent', 38)}` },
        jitter: [4.5 + e.intensity * 3, 0.06 + e.intensity * 0.05],
      };
    case 'nostalgia':
      return { css: { ...base, fontFamily: '"Old Standard TT", serif', fontStyle: 'italic', fontSize: '5.9cqw', lineHeight: 1.1, color: p.dark ? mix(p.ink, '#e8c99a', 70) : mix(p.ink, '#5b3a1b', 45) } };
    case 'wonder':
      return { css: { ...base, fontFamily: '"Amatic SC", cursive', fontWeight: 700, fontSize: '8.8cqw', lineHeight: 0.98, letterSpacing: '0.03em', color: mix(p.accent, p.ink, 68), transform: 'rotate(-2deg)', transformOrigin: 'left center' } };
    case 'routine':
      return { css: { ...base, fontFamily: 'Caveat, cursive', fontWeight: 700, fontSize: '7.2cqw', lineHeight: 1, color: ballpoint(p.dark) } };
    case 'calm':
    default:
      return { css: { ...base, fontFamily: '"Cormorant Garamond", serif', fontWeight: 400, fontSize: '6.2cqw', lineHeight: 1.04, letterSpacing: '0.005em', opacity: 0.94 } };
  }
}

/** Подпись под названием; null — остаётся шрифт почерка кадра. */
export function captionLook(e: DayEmotion, p: Palette): CSSProperties | null {
  switch (e.id) {
    case 'joy':
      return { fontFamily: 'Caveat, cursive', fontSize: '4.9cqw', fontWeight: 600, lineHeight: 1.05 };
    case 'love':
      return { fontFamily: '"Cormorant Garamond", serif', fontStyle: 'italic', fontSize: '4cqw', lineHeight: 1.2 };
    case 'sad':
      return { fontFamily: '"Cormorant Garamond", serif', fontStyle: 'italic', fontSize: '3.7cqw', lineHeight: 1.25, opacity: 0.72 };
    case 'tense':
      return { fontFamily: '"JetBrains Mono", monospace', fontSize: '2.3cqw', lineHeight: 1.55, letterSpacing: '0.02em' };
    case 'nostalgia':
      return { fontFamily: '"Old Standard TT", serif', fontSize: '3.3cqw', lineHeight: 1.3, opacity: 0.85 };
    case 'wonder':
      return { fontFamily: 'Caveat, cursive', fontSize: '4.8cqw', fontWeight: 500, lineHeight: 1.05 };
    case 'routine':
      return { fontFamily: 'Caveat, cursive', fontSize: '5cqw', fontWeight: 500, lineHeight: 1.05, color: ballpoint(p.dark) };
    default:
      return null;
  }
}

/** Та же рука подписывает полароид на стене (поля полароида всегда белые). На телефоне — мельче. */
export function handOf(e: DayEmotion): CSSProperties {
  const size = (px: number) => `clamp(${Math.round(px * 0.72)}px, ${(px / 5.2).toFixed(2)}vw, ${px}px)`;
  switch (e.id) {
    case 'joy':
      return { fontFamily: 'Pangolin, cursive', fontSize: size(18) };
    case 'love':
      return { fontFamily: '"Marck Script", cursive', fontSize: size(21) };
    case 'sad':
      return { fontFamily: '"Bad Script", cursive', fontSize: size(18), color: '#56606e' };
    case 'tense':
      return { fontFamily: 'Underdog, cursive', fontSize: size(17) };
    case 'nostalgia':
      return { fontFamily: '"Old Standard TT", serif', fontStyle: 'italic', fontSize: size(18), color: '#4a3220' };
    case 'wonder':
      return { fontFamily: '"Amatic SC", cursive', fontWeight: 700, fontSize: size(26), lineHeight: 1 };
    case 'routine':
      return { fontFamily: 'Caveat, cursive', fontSize: size(23), color: '#2a45a6' };
    default:
      return { fontFamily: 'Caveat, cursive', fontSize: size(22) };
  }
}

/** Наклон снимка на листе: тревожный приколот как попало, восторг — на бегу. */
export function photoTilt(e: DayEmotion, seed: number) {
  if (e.id === 'tense') return (seed & 1 ? 1 : -1) * (0.9 + e.intensity * 0.8);
  if (e.id === 'wonder') return -0.8;
  return 0;
}

/** Буквы, которые пляшут: каждая со своим наклоном и подскоком. Слова не рвутся. */
export function Jitter({ text, seed, rot, dy }: { text: string; seed: number; rot: number; dy: number }) {
  const r = mulberry32(seed);
  return (
    <>
      {text.split(/(\s+)/).map((w, i) =>
        /^\s*$/.test(w) ? (
          ' '
        ) : (
          <span key={i} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
            {[...w].map((ch, j) => (
              <span key={j} style={{ display: 'inline-block', transform: `translateY(${((r() * 2 - 1) * dy).toFixed(3)}em) rotate(${((r() * 2 - 1) * rot).toFixed(1)}deg)` }}>
                {ch}
              </span>
            ))}
          </span>
        ),
      )}
    </>
  );
}

/** Злость: под названием — две резкие черты красной ручкой. */
export function TitleMark({ e, p, seed }: { e: DayEmotion; p: Palette; seed: number }) {
  if (!e.anger) return null;
  const r = mulberry32(seed ^ 0x51ed27);
  const zig = (y: number) => {
    let d = `M0 ${y}`;
    for (let x = 14; x <= 300; x += 14 + r() * 10) d += ` L${x.toFixed(0)} ${(y + (r() * 2 - 1) * 5).toFixed(1)}`;
    return d;
  };
  return (
    <svg aria-hidden viewBox="0 0 300 26" preserveAspectRatio="none" className="absolute left-0" style={{ bottom: '-1.6cqw', width: '64%', height: '2.4cqw', overflow: 'visible' }}>
      <path d={zig(8)} fill="none" stroke={redPen(p.dark)} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.85} />
      <path d={zig(18)} fill="none" stroke={redPen(p.dark)} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.75} />
    </svg>
  );
}

interface LayerProps {
  e: DayEmotion;
  style: StyleParams;
  frame: FrameBox;
}

/** Где начинается название (cqw от верха листа): шапка, фото и отступ. */
const textTop = (f: FrameBox) => f.top + f.h + TEXT_GAP;

// ── под содержимым: фактура бумаги, линовка, поля, рисунки ─────────────

export function PaperLayer({ e, style, frame: f }: LayerProps) {
  const p = style.palette;
  const r = mulberry32(style.shapes.seed ^ 0x9e3779b9);
  const layers: ReactNode[] = [];

  switch (e.id) {
    case 'routine': {
      const line = p.dark ? 'rgba(175,195,245,.13)' : 'rgba(64,104,170,.2)';
      layers.push(
        <div key="grid" className="absolute inset-0" style={{ backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`, backgroundSize: '3.6cqw 3.6cqw', backgroundPosition: '0 1.3cqw' }} />,
        <div key="margin" className="absolute top-0 bottom-0" style={{ left: '4.3cqw', width: 1.5, background: p.dark ? 'rgba(255,120,120,.35)' : 'rgba(214,58,58,.5)' }} />,
        <Doodles key="doodles" color={ballpoint(p.dark)} seed={style.shapes.seed} />,
      );
      break;
    }
    case 'love': {
      const x = 30 + r() * 40;
      const y = textTop(f) - 5 + r() * 3;
      // розоватая вода с краской: внутри почти прозрачно, к краю пигмент собирается каймой
      const wash = mix(p.accent, '#e7899c', 45);
      const blot = (k: number) =>
        `radial-gradient(closest-side, ${mix(wash, 'transparent', 6 * k)} 0 55%, ${mix(wash, 'transparent', 15 * k)} 84%, ${mix(wash, 'transparent', 6 * k)} 95%, transparent 100%)`;
      layers.push(
        <div key="tooth" className="absolute inset-0" style={{ backgroundImage: TOOTH, backgroundSize: '260px', mixBlendMode: 'multiply', opacity: p.dark ? 0.3 : 0.5 }} />,
        <div
          key="bloom"
          className="absolute"
          style={{ left: `${x}cqw`, top: `${y}cqw`, width: '36cqw', height: '19cqw', background: blot(1), borderRadius: '58% 42% 55% 45% / 46% 60% 40% 54%', transform: `rotate(${(r() * 40 - 20).toFixed(0)}deg)`, mixBlendMode: p.dark ? 'screen' : 'multiply' }}
        />,
        <div
          key="bloom2"
          className="absolute"
          style={{ left: `${x + 18 + r() * 8}cqw`, top: `${y + 7}cqw`, width: '13cqw', height: '9cqw', background: blot(0.8), borderRadius: '45% 55% 62% 38% / 55% 45% 55% 45%', mixBlendMode: p.dark ? 'screen' : 'multiply' }}
        />,
      );
      break;
    }
    case 'nostalgia':
      if (!p.dark) layers.push(<div key="age" className="absolute inset-0" style={{ boxShadow: 'inset 0 0 8cqw rgba(140,92,30,.3), inset 0 0 1.6cqw rgba(110,70,20,.28)' }} />);
      break;
    case 'wonder':
      layers.push(
        <div key="tooth" className="absolute inset-0" style={{ backgroundImage: TOOTH, backgroundSize: '200px', mixBlendMode: 'multiply', opacity: p.dark ? 0.25 : 0.38 }} />,
        // лист вырван из блокнота на пружине: ряд дырочек по верхнему краю
        <div
          key="holes"
          className="absolute inset-x-0"
          style={{
            top: '0.5cqw',
            height: '2.6cqw',
            background: 'radial-gradient(circle at 50% 50%, #fff 0 0.74cqw, rgba(0,0,0,.32) 0.8cqw, rgba(0,0,0,.08) 0.98cqw, transparent 1.12cqw) 1.1cqw 0 / 3.4cqw 2.6cqw repeat-x',
          }}
        />,
      );
      break;
    case 'joy':
      if (!p.dark) layers.push(<div key="gloss" className="absolute inset-0" style={{ background: 'linear-gradient(155deg, rgba(255,255,255,.55), transparent 32%, transparent 72%, rgba(255,255,255,.3))' }} />);
      break;
    case 'calm':
      layers.push(<PencilFrame key="pencil" f={f} color={p.ink} seed={style.shapes.seed} />);
      break;
  }
  if (!layers.length) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {layers}
    </div>
  );
}

/** Каракули на полях, которые рисуют от скуки: спираль, кубик, звёздочка. */
function Doodles({ color, seed }: { color: string; seed: number }) {
  const r = mulberry32(seed ^ 0x2545f491);
  let spiral = '';
  for (let a = 0; a < Math.PI * 7; a += 0.28) {
    const rr = 0.5 + a * 0.42;
    spiral += `${spiral ? 'L' : 'M'}${(10 + rr * Math.cos(a)).toFixed(2)} ${(10 + rr * Math.sin(a)).toFixed(2)}`;
  }
  const stroke = { fill: 'none', stroke: color, strokeWidth: 0.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <>
      <svg viewBox="0 0 20 20" className="absolute" style={{ right: `${3 + r() * 2}cqw`, bottom: `${10 + r() * 3}cqw`, width: '8cqw', opacity: 0.55, transform: `rotate(${(r() * 90).toFixed(0)}deg)` }}>
        <path d={spiral} {...stroke} />
      </svg>
      <svg viewBox="0 0 20 20" className="absolute" style={{ right: `${13 + r() * 4}cqw`, bottom: `${19 + r() * 4}cqw`, width: '5.5cqw', opacity: 0.5, transform: `rotate(${(r() * 16 - 8).toFixed(0)}deg)` }}>
        <path d="M3 8h9v9H3z M7 4h9v9h-4 M3 8l4-4 M12 8l4-4 M12 17l4-4" {...stroke} />
      </svg>
      <svg viewBox="0 0 20 20" className="absolute" style={{ right: `${2 + r() * 3}cqw`, bottom: `${23 + r() * 5}cqw`, width: '4cqw', opacity: 0.5 }}>
        <path d="M10 2l2.3 5.5 5.9.4-4.5 3.8 1.5 5.8L10 14.4l-5.2 3.1 1.5-5.8-4.5-3.8 5.9-.4z" {...stroke} />
      </svg>
    </>
  );
}

/** Тонкий контур карандашом вокруг снимка, линии заходят за углы — как у рамки, начерченной от руки. */
function PencilFrame({ f, color, seed }: { f: FrameBox; color: string; seed: number }) {
  const r = mulberry32(seed ^ 0x7f4a7c15);
  const o = 1.8;
  const [x0, y0, x1, y1] = [f.x - o, f.top - o, f.x + f.w + o, f.top + f.h + o].map((v) => v * 10);
  const ov = 14;
  const j = () => (r() * 2 - 1) * 2.5;
  const H = (f.top + f.h + 4) * 10;
  const lines = [
    [x0 - ov, y0 + j(), x1 + ov, y0 + j()],
    [x0 - ov, y1 + j(), x1 + ov, y1 + j()],
    [x0 + j(), y0 - ov, x0 + j(), y1 + ov],
    [x1 + j(), y0 - ov, x1 + j(), y1 + ov],
  ];
  return (
    <svg viewBox={`0 0 1000 ${H}`} className="absolute top-0 left-0" style={{ width: '100cqw', height: `${H / 10}cqw` }}>
      {lines.map(([a, b, c, d], i) => (
        <line key={i} x1={a} y1={b} x2={c} y2={d} stroke={color} strokeWidth={1.6} strokeLinecap="round" opacity={0.32} />
      ))}
    </svg>
  );
}

// ── внутри окна фото: фигурный край отпечатка, глянец ──────────────────

export function WindowDetails({ e, style, frame: f, paper }: LayerProps & { paper: string }) {
  const p = style.palette;
  if (e.id === 'joy')
    return <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(118deg, transparent 28%, rgba(255,255,255,.26) 40%, rgba(255,255,255,.05) 52%, transparent 60%)' }} />;
  if (e.id === 'sad') return <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: mix(p.paper, 'transparent', 14) }} />;
  if (e.id !== 'nostalgia') return null;

  // советский отпечаток: белое поле, край обрезан фигурными ножницами
  const W = f.w * 10;
  const H = f.h * 10;
  const inset = 9;
  const b = 34;
  const ry = 5;
  const half = (len: number) => len / Math.max(2, Math.round(len / 14)) / 2;
  const rx = half(W - 2 * inset);
  const rv = half(H - 2 * inset);
  const nx = Math.round((W - 2 * inset) / (2 * rx));
  const nv = Math.round((H - 2 * inset) / (2 * rv));
  let c = `M${inset} ${inset}`;
  for (let i = 0; i < nx; i++) c += `a${rx.toFixed(2)} ${ry} 0 0 1 ${(2 * rx).toFixed(2)} 0`;
  for (let i = 0; i < nv; i++) c += `a${ry} ${rv.toFixed(2)} 0 0 1 0 ${(2 * rv).toFixed(2)}`;
  for (let i = 0; i < nx; i++) c += `a${rx.toFixed(2)} ${ry} 0 0 1 ${(-2 * rx).toFixed(2)} 0`;
  for (let i = 0; i < nv; i++) c += `a${ry} ${rv.toFixed(2)} 0 0 1 0 ${(-2 * rv).toFixed(2)}`;
  c += 'Z';
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      <path d={`M0 0H${W}V${H}H0Z${c}`} fillRule="evenodd" style={{ fill: paper }} />
      <path d={`${c}M${b} ${b}H${W - b}V${H - b}H${b}Z`} fillRule="evenodd" fill="#f1e9d6" />
      <path d={`M${b} ${b}H${W - b}V${H - b}H${b}Z`} fill="none" stroke="rgba(60,40,20,.25)" strokeWidth={1.2} />
    </svg>
  );
}

// ── поверх всего: складки, капли, конфетти, скобы, брызги ──────────────

export function Marks({ e, style, frame: f }: LayerProps) {
  const p = style.palette;
  const seed = style.shapes.seed;
  const r = mulberry32(seed ^ 0x5bd1e995);
  const k = e.intensity;
  const out: ReactNode[] = [];

  switch (e.id) {
    case 'tense': {
      const pos = `${Math.round(r() * 600)}px ${Math.round(r() * 600)}px`;
      out.push(
        <div key="shade" className="absolute inset-0" style={{ backgroundImage: CRUMPLE_SHADE, backgroundSize: '620px', backgroundPosition: pos, mixBlendMode: 'multiply', opacity: 0.4 + 0.3 * k }} />,
        <div key="shine" className="absolute inset-0" style={{ backgroundImage: CRUMPLE_SHINE, backgroundSize: '620px', backgroundPosition: pos, mixBlendMode: 'screen', opacity: p.dark ? 0.3 : 0.55 }} />,
        <svg key="date" viewBox="0 0 200 60" preserveAspectRatio="none" className="absolute" style={{ left: '4.4cqw', top: '1.9cqw', width: '20cqw', height: '6.6cqw', overflow: 'visible' }}>
          <path d={loop(seed)} fill="none" stroke={redPen(p.dark)} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.88} />
        </svg>,
        <span key="staple" className="fx-staple absolute" style={{ left: `${f.x + 2.6}cqw`, top: `${f.top + 1.6}cqw`, width: '7cqw', height: '0.9cqw', rotate: `${-30 - r() * 12}deg` }} />,
      );
      if (k > 0.7) out.push(<span key="staple2" className="fx-staple absolute" style={{ left: `${f.x + f.w - 9}cqw`, top: `${f.top + f.h - 2.6}cqw`, width: '6.4cqw', height: '0.85cqw', rotate: `${-24 + r() * 10}deg` }} />);
      break;
    }

    case 'sad': {
      const n = 2 + Math.round(k * 1.4);
      const spots = [
        [8 + r() * 46, textTop(f) - 1.5 + r() * 4, 7.5 + r() * 2.5],
        [f.x + f.w * (0.2 + r() * 0.6), f.top + f.h * (0.45 + r() * 0.35), 5.5 + r() * 2],
        [42 + r() * 40, textTop(f) + 9 + r() * 6, 4.6 + r() * 1.6],
      ].slice(0, n);
      const rim = p.dark ? '200,215,235' : '60,70,88';
      out.push(
        ...spots.map(([x, y, s], i) => (
          <span
            key={`d${i}`}
            className="absolute"
            style={{
              left: `${x}cqw`,
              top: `${y}cqw`,
              width: `${s}cqw`,
              height: `${s * (0.86 + r() * 0.2)}cqw`,
              borderRadius: `${48 + r() * 8}% ${44 + r() * 10}% ${50 + r() * 8}% ${44 + r() * 10}% / ${46 + r() * 10}% ${50 + r() * 8}% ${44 + r() * 10}% ${50 + r() * 6}%`,
              // засохшая капля: внутри бумага чуть светлее и чернила расплылись, по краю — неровный ободок
              background: `radial-gradient(closest-side, rgba(255,255,255,.1) 0 45%, rgba(${rim},.06) 70%, rgba(${rim},.22) 90%, rgba(${rim},.07) 97%, transparent 100%)`,
              backdropFilter: 'blur(0.35cqw) saturate(0.8) brightness(1.03)',
              WebkitBackdropFilter: 'blur(0.35cqw) saturate(0.8) brightness(1.03)',
              WebkitMaskImage: 'radial-gradient(closest-side, #000 82%, transparent 100%)',
              maskImage: 'radial-gradient(closest-side, #000 82%, transparent 100%)',
            }}
          />
        )),
        // капля на названии стекла вниз и утащила за собой чернила
        <span
          key="run"
          className="absolute"
          style={{
            left: `${spots[0][0] + spots[0][2] * (0.38 + r() * 0.2)}cqw`,
            top: `${spots[0][1] + spots[0][2] * 0.7}cqw`,
            width: '0.9cqw',
            height: `${7 + k * 5}cqw`,
            borderRadius: '45% 45% 50% 50% / 20% 20% 80% 80%',
            background: `linear-gradient(${mix(p.ink, 'transparent', 40)}, ${mix(p.ink, 'transparent', 18)} 55%, transparent)`,
            filter: 'blur(0.2cqw)',
            transform: `rotate(${(r() * 6 - 3).toFixed(1)}deg)`,
          }}
        />,
        // засохший след воды: волнистый ободок, уходящий за край листа
        <span
          key="tide"
          className="absolute"
          style={{
            left: `${r() > 0.5 ? -9 : 76}cqw`,
            top: `${f.top + f.h * (0.55 + r() * 0.3)}cqw`,
            width: '32cqw',
            height: '27cqw',
            borderRadius: '52% 48% 45% 55% / 50% 56% 44% 50%',
            background: `radial-gradient(closest-side, ${p.dark ? 'rgba(220,205,180,.03)' : 'rgba(120,98,66,.03)'} 0 80%, ${p.dark ? 'rgba(220,205,180,.16)' : 'rgba(120,98,66,.2)'} 93%, transparent 100%)`,
            // ободок не замкнут: вода высыхала неровно
            WebkitMaskImage: `conic-gradient(from ${(r() * 360).toFixed(0)}deg, #000 0 52%, transparent 78%, #000 96%)`,
            maskImage: `conic-gradient(from ${(r() * 360).toFixed(0)}deg, #000 0 52%, transparent 78%, #000 96%)`,
            mixBlendMode: p.dark ? 'screen' : 'multiply',
            transform: `rotate(${(r() * 60).toFixed(0)}deg)`,
          }}
        />,
      );
      break;
    }

    case 'joy': {
      const colors = [p.accent, p.shades[0] ?? p.accent, '#f2c94c', '#ef7b96', '#5cbfe6', '#ffffff', p.shades[2] ?? '#9bd18b'];
      const n = 10 + Math.round(k * 8);
      for (let i = 0; i < n; i++) {
        // кружочки из дырокола: немного у шапки, часть на краю фото, больше всего — вокруг подписи
        const top = i < 3 ? 1.5 + r() * 7.5 : i < 6 ? f.top + f.h - 3 + r() * 5 : textTop(f) - 4 + r() * 26;
        const s = 1.5 + r() * 0.9;
        out.push(
          <span
            key={`c${i}`}
            className="absolute rounded-full"
            style={{ left: `${3 + r() * 92}cqw`, top: `${top}cqw`, width: `${s}cqw`, height: `${s}cqw`, background: colors[i % colors.length], boxShadow: '0 0.12cqw 0.22cqw rgba(0,0,0,.28), inset 0 -0.1cqw 0.1cqw rgba(0,0,0,.12)' }}
          />,
        );
      }
      break;
    }

    case 'love': {
      const tape = mix(p.accent, '#f2b8c3', 28);
      out.push(
        <span key="t1" className="fx-washi fx-stripes absolute" style={vars({ '--tc': tape, left: `${f.x - 4}cqw`, top: `${f.top - 0.6}cqw`, width: '15cqw', height: '4cqw', rotate: '-38deg' })} />,
        <span key="t2" className="fx-washi fx-stripes absolute" style={vars({ '--tc': tape, left: `${f.x + f.w - 11}cqw`, top: `${f.top - 0.6}cqw`, width: '15cqw', height: '4cqw', rotate: '40deg' })} />,
        <svg key="heart" viewBox="0 0 100 100" className="absolute" style={{ left: `${f.x + f.w - 9}cqw`, top: `${f.top + f.h - 5}cqw`, width: '8cqw', overflow: 'visible', transform: `rotate(${(r() * 24 - 6).toFixed(0)}deg)` }}>
          <path
            d="M50 84C26 66 8 48 15 29 21 13 42 12 50 30 57 12 79 10 86 27 94 47 74 66 50 84 47 82 44 79 42 76"
            fill="none"
            stroke={mix(p.accent, p.ink, 55)}
            strokeWidth={4.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.75}
          />
        </svg>,
      );
      break;
    }

    case 'nostalgia': {
      out.push(
        <div key="fox" className="absolute inset-0" style={{ backgroundImage: FOXING, backgroundSize: '360px', backgroundPosition: `${Math.round(r() * 360)}px ${Math.round(r() * 360)}px`, mixBlendMode: 'multiply', opacity: p.dark ? 0.2 : 0.45 }} />,
        // пара крупных пятен времени — светлый центр, рыжий край
        ...[0, 1].map((i) => (
          <span
            key={`age${i}`}
            className="absolute rounded-full"
            style={{
              left: `${i ? 62 + r() * 30 : r() * 30}cqw`,
              top: `${i ? textTop(f) + r() * 10 : 2 + r() * 6}cqw`,
              width: `${4 + r() * 4}cqw`,
              height: `${3.5 + r() * 3}cqw`,
              background: 'radial-gradient(closest-side, rgba(150,95,30,.1) 0 55%, rgba(140,85,25,.28) 85%, transparent 100%)',
              mixBlendMode: 'multiply',
              opacity: p.dark ? 0.4 : 1,
            }}
          />
        )),
      );
      if (f.x > 2 && !f.rotate) {
        const H = (f.top + f.h + 3) * 10;
        const [x0, y0, x1, y1] = [f.x * 10 - 6, f.top * 10 - 6, (f.x + f.w) * 10 + 6, (f.top + f.h) * 10 + 6];
        const L = 62;
        const tri = [
          [x0, y0, x0 + L, y0, x0, y0 + L],
          [x1, y0, x1 - L, y0, x1, y0 + L],
          [x0, y1, x0 + L, y1, x0, y1 - L],
          [x1, y1, x1 - L, y1, x1, y1 - L],
        ];
        out.push(
          <svg key="corners" viewBox={`0 0 1000 ${H}`} className="absolute top-0 left-0" style={{ width: '100cqw', height: `${H / 10}cqw`, filter: 'drop-shadow(0 0.15cqw 0.2cqw rgba(0,0,0,.35))' }}>
            {tri.map(([a, b, c, d, e2, g], i) => (
              <g key={i}>
                <path d={`M${a} ${b}L${c} ${d}L${e2} ${g}Z`} fill="#1f1a16" />
                <path d={`M${c} ${d}L${e2} ${g}`} stroke="rgba(255,255,255,.22)" strokeWidth={1.5} />
              </g>
            ))}
          </svg>,
        );
      }
      break;
    }

    case 'wonder': {
      const right = r() > 0.5;
      out.push(
        <span
          key="kraft"
          className="fx-kraft absolute"
          style={{ left: `${right ? f.x + f.w - 11 : f.x - 4}cqw`, top: `${f.top - 0.8}cqw`, width: '16cqw', height: '4.4cqw', rotate: `${right ? 41 : -41}deg` }}
        />,
        <Splatter key="splat" color={p.accent} second={p.shades[1] ?? p.accent} seed={seed} dark={p.dark} x={right ? f.x - 10 : f.x + f.w - 22} y={f.top + f.h - 17} />,
      );
      break;
    }
  }

  if (!out.length) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {out}
    </div>
  );
}

/** Красная ручка обводит дату — больше одного раза, с нажимом, не попадая в начало. */
function loop(seed: number) {
  const r = mulberry32(seed ^ 0x3c6ef372);
  const turns = 1.15 + r() * 0.25;
  const start = -0.6 + r() * 0.8;
  let d = '';
  for (let i = 0; i <= 64; i++) {
    const t = start + (i / 64) * turns * Math.PI * 2;
    const k = 1 + 0.05 * Math.sin(3 * t + r() * 0.4) + i * 0.0012;
    const x = 100 + 94 * k * Math.cos(t);
    const y = 30 + 25 * k * Math.sin(t) + (i / 64) * 3;
    d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/** Брызги краски с кисти: клякса, капли вокруг, вытянутый хвостик. */
function Splatter({ color, second, seed, dark, x, y }: { color: string; second: string; seed: number; dark: boolean; x: number; y: number }) {
  const r = mulberry32(seed ^ 0x6a09e667);
  let blob = '';
  const pts = 13;
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const rr = 9 + r() * 4;
    blob += `${blob ? 'L' : 'M'}${(50 + rr * Math.cos(a)).toFixed(1)} ${(50 + rr * Math.sin(a)).toFixed(1)}`;
  }
  const dir = r() * Math.PI * 2;
  const drops = Array.from({ length: 18 }, () => {
    const a = dir + (r() * 2 - 1) * 1.4;
    const d = 14 + r() * 34;
    return { cx: 50 + d * Math.cos(a), cy: 50 + d * Math.sin(a), rad: 0.8 + r() * 3.2 * (1 - d / 62) };
  });
  const tx = 50 + 24 * Math.cos(dir);
  const ty = 50 + 24 * Math.sin(dir);
  return (
    <svg viewBox="0 0 100 100" className="absolute" style={{ left: `${x}cqw`, top: `${y}cqw`, width: '30cqw', overflow: 'visible', mixBlendMode: dark ? 'screen' : 'multiply', opacity: 0.85 }}>
      <path d={blob + 'Z'} fill={color} />
      {drops.map((d, i) => (
        <circle key={i} cx={d.cx.toFixed(1)} cy={d.cy.toFixed(1)} r={d.rad.toFixed(2)} fill={i % 3 ? color : second} />
      ))}
      <ellipse cx={tx} cy={ty} rx={4.5} ry={1.2} fill={color} transform={`rotate(${((dir * 180) / Math.PI).toFixed(0)} ${tx.toFixed(1)} ${ty.toFixed(1)})`} />
    </svg>
  );
}

// ── чем день приколот к стене ──────────────────────────────────────────

export function Fastener({ e, accent, seed, scale = 1 }: { e: DayEmotion; accent: string; seed: number; scale?: number }) {
  const r = mulberry32(seed ^ 0x1b873593);
  const s = (o: Record<string, string | number>) => vars({ scale, ...o });
  switch (e.id) {
    case 'nostalgia':
      return <span className="fx fx-tack" style={s({})} />;
    case 'joy':
      return (
        <>
          <span className="fx fx-washi fx-dots" style={s({ '--tc': mix(accent, '#ffd23f', 55), left: -16, top: 10, rotate: '-38deg' })} />
          <span className="fx fx-washi fx-stripes" style={s({ '--tc': '#ff9fb5', right: -16, top: 10, rotate: '37deg' })} />
        </>
      );
    case 'love':
      return <span className="fx fx-washi fx-stripes" style={s({ '--tc': mix(accent, '#f2b8c3', 28), left: '50%', top: -12, translate: '-50% 0', rotate: `${(-5 + r() * 6).toFixed(1)}deg` })} />;
    case 'sad':
      return <span className="fx fx-clear" style={s({ left: `${(16 + r() * 44).toFixed(0)}%`, top: -11, rotate: `${(5 + r() * 7).toFixed(1)}deg` })} />;
    case 'tense':
      return (
        <>
          <span className="fx fx-staple" style={s({ left: '20%', top: 6, rotate: `${(-8 - r() * 9).toFixed(1)}deg` })} />
          <span className="fx fx-staple" style={s({ right: '22%', top: 8, rotate: `${(6 + r() * 11).toFixed(1)}deg` })} />
        </>
      );
    case 'wonder':
      return <span className="fx fx-kraft" style={s({ left: '50%', top: -13, translate: '-50% 0', rotate: `${(-8 + r() * 5).toFixed(1)}deg` })} />;
    case 'routine':
      return (
        <svg className="fx fx-clip" viewBox="0 0 24 64" style={s({ left: `${(12 + r() * 14).toFixed(0)}%`, top: -20, rotate: `${(4 + r() * 8).toFixed(1)}deg` })}>
          <path d="M8 24V9a5 5 0 0 1 10 0v38a7.5 7.5 0 0 1-15 0V15" fill="none" stroke="#7b838a" strokeWidth={2.6} strokeLinecap="round" />
          <path d="M8 24V9a5 5 0 0 1 10 0v38a7.5 7.5 0 0 1-15 0V15" fill="none" stroke="#eef1f3" strokeWidth={0.9} strokeLinecap="round" transform="translate(-0.5 -0.4)" />
        </svg>
      );
    case 'calm':
    default:
      return <span className="fx fx-pin" style={s({})} />;
  }
}
