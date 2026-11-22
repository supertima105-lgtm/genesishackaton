import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { mulberry32 } from '../../lib/color';
import type { StyleParams } from '../../lib/types';
import type { FrameBox } from './layout';

interface Props {
  style: StyleParams;
  number: number;
  /** окно фото на листе (cqw) — слой лежит на его высоте и во всю ширину листа */
  frame: FrameBox;
}

/** 1 единица = 0,1 cqw: ширина листа — 1000. */
const W = 1000;

/**
 * Слой поверх страницы — только материальное: мазки краски, заходящие за край фото, и плёночная
 * лента с засветкой. Геометрии (круги, линии, вырезки, энсо, печать) больше нет: у старых дней
 * с такими видами графики слой просто пустой.
 */
export function Shapes({ style, number, frame }: Props) {
  const uid = useId().replace(/:/g, '');
  const fb = useMemo(() => ({ x: frame.x * 10, y: 0, w: frame.w * 10, h: frame.h * 10 }), [frame.x, frame.w, frame.h]);
  const content = useMemo(() => render(style, uid, number, fb), [style, uid, number, fb]);
  if (!content) return null;

  return (
    <svg
      data-shapes=""
      viewBox={`0 0 ${W} ${fb.h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute left-0 w-full"
      style={{ top: `${frame.top}cqw`, height: `${frame.h}cqw`, mixBlendMode: style.palette.dark ? 'screen' : 'multiply', overflow: 'visible' }}
    >
      <defs>
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

function render(style: StyleParams, uid: string, number: number, fb: { x: number; y: number; w: number; h: number }): ReactNode {
  const r = mulberry32(style.shapes.seed);
  const { accent, shades, paper } = style.palette;
  const sh = (i: number) => shades[i % Math.max(1, shades.length)] ?? accent;
  const between = (a: number, b: number) => a + r() * (b - a);

  switch (style.shapes.kind) {
    // ── мазки краски, перетекающие за край фото ───────────────────
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

    // ── плёнка: перфорация, засветка, номер кадра ─────────────────
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

    // геометрия Кандинского, вырезки Матисса, энсо с печатью — убраны
    default:
      return null;
  }
}
