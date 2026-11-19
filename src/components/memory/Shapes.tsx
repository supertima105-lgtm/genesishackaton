import { useEffect, useId, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { mulberry32 } from '../../lib/color';
import type { StyleParams } from '../../lib/types';
import { beatPulse, FRAMES, type Clock } from './layout';

interface Props {
  style: StyleParams;
  clock?: Clock;
  beatOffset: number;
  number: number;
}

const W = 1000;
const H = 1250;

/**
 * Графический слой поверх страницы: геометрия Кандинского, вырезки Матисса, мазки,
 * засветки плёнки или энсо. Форма генерируется из seed дня, цвет — из палитры фото,
 * движение — из долей песни (CSS-переменные --p и --t обновляются каждый кадр).
 */
export function Shapes({ style, clock, beatOffset, number }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/:/g, '');

  useEffect(() => {
    if (!clock) return;
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const t = clock.time();
        const p = clock.playing() ? beatPulse(t, style.motion.bpm, beatOffset) * style.motion.pulse : 0;
        const lv = clock.levels?.();
        el.style.setProperty('--p', p.toFixed(3));
        el.style.setProperty('--t', t.toFixed(2));
        // живой бас качает формы, громкость разгорается в засветках
        el.style.setProperty('--b', ((lv?.bass ?? 0) * 0.55 * (0.4 + style.motion.pulse)).toFixed(3));
        el.style.setProperty('--l', (lv?.level ?? 0).toFixed(3));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clock, style.motion.bpm, style.motion.pulse, beatOffset]);

  const content = useMemo(() => render(style, uid, number), [style, uid, number]);

  return (
    <svg
      ref={ref}
      data-shapes=""
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ mixBlendMode: style.palette.dark ? 'screen' : 'multiply', overflow: 'visible' }}
    >
      <defs>
        <filter id={`rough-${uid}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed={style.shapes.seed % 100} />
          <feDisplacementMap in="SourceGraphic" scale="9" />
        </filter>
        <filter id={`brush-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.06" numOctaves="2" seed={style.shapes.seed % 97} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="18" result="d" />
          <feGaussianBlur in="d" stdDeviation="2.2" />
        </filter>
        <radialGradient id={`leak-${uid}`}>
          <stop offset="0" stopColor="#ff7a2e" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#ff3d2a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff3d2a" stopOpacity="0" />
        </radialGradient>
      </defs>
      {content}
    </svg>
  );
}

const pulse = (amp: number): CSSProperties => ({
  transform: `scale(calc(1 + (var(--p, 0) + var(--b, 0)) * ${amp}))`,
  transformBox: 'fill-box',
  transformOrigin: 'center',
});
const spin = (speed: number): CSSProperties => ({
  transform: `rotate(calc(var(--t, 0) * ${speed}deg))`,
  transformBox: 'fill-box',
  transformOrigin: 'center',
});
const bob = (amp: number): CSSProperties => ({
  transform: `translateY(calc((var(--p, 0) + var(--b, 0)) * ${-amp}px))`,
});

function frameBox(style: StyleParams) {
  const f = FRAMES[style.layout.frame];
  return { x: (f.x / 100) * W, y: (f.y / 100) * H, w: (f.w / 100) * W, h: (f.h / 100) * H };
}

function render(style: StyleParams, uid: string, number: number): ReactNode {
  const r = mulberry32(style.shapes.seed);
  const { accent, ink, shades, paper } = style.palette;
  const sh = (i: number) => shades[i % Math.max(1, shades.length)] ?? accent;
  const fb = frameBox(style);
  const between = (a: number, b: number) => a + r() * (b - a);

  switch (style.shapes.kind) {
    // ── Кандинский: круг, линии, треугольник, шахматка ────────────
    case 'geometry': {
      const cx = between(780, 900);
      const cy = between(fb.y + 60, fb.y + fb.h * 0.55);
      const R = between(95, 150);
      const lines = Array.from({ length: 4 }, (_, i) => {
        // линии не заходят в зону названия (72% листа) — текст остаётся постоянным и читаемым
        const y1 = between(90, 820);
        const y2 = Math.min(860, Math.max(90, y1 + between(-500, 500)));
        return <line key={i} x1={-20} y1={y1} x2={1020} y2={y2} stroke={i === 0 ? accent : ink} strokeWidth={between(2, 9)} />;
      });
      const dots = Array.from({ length: 3 }, (_, i) => (
        <g key={i} style={pulse(0.35)}>
          <circle cx={between(fb.x + fb.w, 960)} cy={between(fb.y + fb.h * 0.6, fb.y + fb.h + 40)} r={between(10, 34)} fill={i === 0 ? ink : sh(i + 1)} />
        </g>
      ));
      const tx = between(fb.x + fb.w - 40, 900);
      const ty = between(fb.y + fb.h - 120, fb.y + fb.h + 20);
      const ts = between(90, 140);
      return (
        <g>
          {lines}
          <g style={pulse(0.08)}>
            <circle cx={cx} cy={cy} r={R} fill={accent} opacity={0.92} />
          </g>
          <circle cx={cx} cy={cy} r={R + 28} fill="none" stroke={ink} strokeWidth={4} />
          <circle cx={cx - R * 0.35} cy={cy + R * 0.2} r={R * 0.28} fill={ink} opacity={0.9} />
          <polygon points={`${tx},${ty} ${tx + ts},${ty + ts * 0.25} ${tx + ts * 0.3},${ty + ts}`} fill={sh(1)} opacity={0.88} />
          <path d={`M ${cx - R - 60} ${cy + R + 70} a 70 70 0 0 1 140 0`} fill="none" stroke={accent} strokeWidth={10} />
          {dots}
          <g transform={`translate(${between(890, 920)}, ${fb.y + 10})`}>
            {Array.from({ length: 9 }, (_, i) =>
              (i + Math.floor(i / 3)) % 2 === 0 ? <rect key={i} x={(i % 3) * 20} y={Math.floor(i / 3) * 20} width={20} height={20} fill={ink} /> : null,
            )}
          </g>
        </g>
      );
    }

    // ── Матисс: вырезанные цветные формы ──────────────────────────
    case 'cutouts': {
      const anchors: [number, number][] = [
        [fb.x - 10, fb.y + 50],
        [fb.x + fb.w + 5, fb.y + fb.h * 0.3],
        [fb.x + fb.w * 0.18, fb.y + fb.h + 10],
        [fb.x + fb.w - 50, fb.y - 15],
        [fb.x + fb.w * 0.95, fb.y + fb.h + 30],
        [fb.x + 30, fb.y + fb.h * 0.62],
      ];
      const cols = [accent, sh(2), sh(0), ink, sh(3), accent];
      return (
        <g>
          {anchors.slice(0, style.shapes.count).map(([x, y], i) => (
            <g key={i} style={bob(i % 2 ? 16 : -12)}>
              <path d={blob(x, y, between(48, 92), r, i % 3 === 1)} fill={cols[i]} opacity={0.94} transform={`rotate(${between(-30, 30)} ${x} ${y})`} />
            </g>
          ))}
        </g>
      );
    }

    // ── Моне: мазки, перетекающие за край фото ────────────────────
    case 'strokes': {
      const edges: [number, number][] = [
        [fb.x + fb.w * 0.1, fb.y + fb.h + 10],
        [fb.x + fb.w * 0.75, fb.y + fb.h + 18],
        [fb.x - 5, fb.y + fb.h * 0.7],
        [fb.x + fb.w + 5, fb.y + fb.h * 0.25],
        [fb.x + fb.w * 0.45, fb.y - 8],
        [fb.x + fb.w + 2, fb.y + fb.h * 0.85],
      ];
      return (
        <g filter={`url(#brush-${uid})`}>
          {edges.slice(0, style.shapes.count).map(([x, y], i) => (
            <g key={i} style={pulse(0.04)}>
              <ellipse
                cx={x}
                cy={y}
                rx={between(90, 170)}
                ry={between(12, 24)}
                fill={i % 2 ? accent : sh(i)}
                opacity={between(0.28, 0.5)}
                transform={`rotate(${between(-25, 25)} ${x} ${y})`}
              />
            </g>
          ))}
        </g>
      );
    }

    // ── Плёнка: перфорация, засветка, номер кадра ─────────────────
    case 'leaks': {
      const stripH = 46;
      const holes = (y: number) =>
        Array.from({ length: 16 }, (_, i) => <rect key={i} x={20 + i * 64} y={y + 11} width={26} height={24} rx={4} fill={paper} />);
      const top = fb.y - stripH;
      const bottom = fb.y + fb.h;
      const leakX = r() > 0.5 ? fb.x + fb.w - 60 : fb.x + 60;
      return (
        <g>
          <rect x={0} y={top} width={W} height={stripH} fill="#16130f" />
          <rect x={0} y={bottom} width={W} height={stripH} fill="#16130f" />
          {holes(top)}
          {holes(bottom)}
          <text x={40} y={bottom + stripH - 4} fontFamily="JetBrains Mono" fontSize={15} fill="#e2893b" letterSpacing={3}>
            {`◂ ${number}A   ATMOSFERA 400   ▸ ${number + 1}`}
          </text>
          <g style={{ mixBlendMode: 'screen', opacity: 'calc(0.4 + var(--p, 0) * 0.5 + var(--l, 0) * 0.5)' } as CSSProperties}>
            <ellipse cx={leakX} cy={fb.y + fb.h * between(0.2, 0.7)} rx={260} ry={340} fill={`url(#leak-${uid})`} />
          </g>
        </g>
      );
    }

    // ── Ма: энсо и красная печать ─────────────────────────────────
    case 'enso': {
      const cx = fb.x + fb.w / 2;
      const cy = fb.y + fb.h / 2;
      const R = Math.max(fb.w, fb.h) * 0.78;
      const a0 = between(0, Math.PI * 2);
      const a1 = a0 + Math.PI * 1.82;
      const arc = (rad: number) =>
        `M ${cx + Math.cos(a0) * rad} ${cy + Math.sin(a0) * rad} A ${rad} ${rad} 0 1 1 ${cx + Math.cos(a1) * rad} ${cy + Math.sin(a1) * rad}`;
      return (
        <g>
          <g style={spin(0.4)} filter={`url(#rough-${uid})`}>
            <path d={arc(R)} fill="none" stroke={ink} strokeWidth={15} strokeLinecap="round" opacity={0.85} />
            <path d={arc(R + 9)} fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" opacity={0.4} />
          </g>
          <g transform="translate(872 892)">
            <rect width={62} height={62} rx={5} fill="#b5352a" opacity={0.9} />
            <text x={31} y={42} textAnchor="middle" fontFamily="Cormorant Garamond" fontWeight={600} fontSize={30} fill={paper}>
              {number}
            </text>
          </g>
        </g>
      );
    }
  }
}

/** Гладкая неровная форма (Catmull-Rom → Безье). spiky — «звезда» Матисса. */
function blob(cx: number, cy: number, R: number, rnd: () => number, spiky: boolean): string {
  const n = spiky ? 12 : 8;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rad = spiky ? R * (i % 2 ? 0.45 + rnd() * 0.15 : 0.95 + rnd() * 0.2) : R * (0.62 + rnd() * 0.42);
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  });
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
  }
  return d + ' Z';
}
