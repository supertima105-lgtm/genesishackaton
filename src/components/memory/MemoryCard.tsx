import type { CSSProperties } from 'react';
import { MODES } from '../../lib/rules/modes';
import type { DayRecord } from '../../lib/types';
import { weatherShort } from '../../lib/weather';
import { FRAMES, TITLE_TOP } from './layout';
import { PhotoLayer } from './PhotoLayer';
import { Shapes } from './Shapes';
import { WeatherLayer } from './WeatherLayer';

interface Props {
  day: DayRecord;
  number: number;
  photoUrls: string[];
  coverUrl?: string;
  /** live — фото рисуется шейдером в почерке дня (страница дня, показ, сравнение); иначе — готовая обложка. */
  live?: boolean;
  onCover?: (b: Blob) => void;
  coverKey?: number;
}

const CAPTION_FONT: Record<DayRecord['style']['type']['caption'], CSSProperties> = {
  hand: { fontFamily: 'Caveat, cursive', fontSize: '5.4cqw', fontWeight: 600, lineHeight: 1.05 },
  grotesk: { fontFamily: 'Unbounded, sans-serif', fontSize: '2.7cqw', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.35 },
  serif: { fontFamily: '"Cormorant Garamond", serif', fontStyle: 'italic', fontSize: '3.9cqw', fontWeight: 400, lineHeight: 1.2 },
  mono: { fontFamily: '"JetBrains Mono", monospace', fontSize: '2.35cqw', lineHeight: 1.5, letterSpacing: '0.02em' },
};

export function formatDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return {
    short: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    weekday: d.toLocaleDateString('ru-RU', { weekday: 'long' }),
    long: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

/**
 * Страница дневника. Постоянные элементы: формат 4:5, шапка с датой и номером,
 * блок названия на одной высоте, подвал с песней, бумага. Переменные: окно фото,
 * обработка, графический слой, шрифт подписи. Страница неподвижна.
 */
export function MemoryCard({ day, number, photoUrls, coverUrl, live, onCover, coverKey }: Props) {
  const { style } = day;
  const { paper, ink } = style.palette;
  const f = FRAMES[style.layout.frame];
  const date = formatDate(day.date);
  const mode = MODES[style.mode];
  const stillSrc = coverUrl ?? photoUrls[0];

  return (
    <div
      className="memory-card relative w-full overflow-hidden select-none"
      style={{ aspectRatio: '4 / 5', background: paper, color: ink, containerType: 'inline-size' } as CSSProperties}
    >
      {/* окно фото */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: `${f.x}%`,
          top: `${f.y}%`,
          width: `${f.w}%`,
          height: `${f.h}%`,
          transform: f.rotate ? `rotate(${f.rotate}deg)` : undefined,
          boxShadow: style.layout.frame === 'tilted' ? '0 1.2cqw 3cqw rgba(0,0,0,.22)' : undefined,
          background: paper,
        }}
      >
        {live && photoUrls[0] ? (
          <PhotoLayer url={photoUrls[0]} style={style} seed={style.shapes.seed} onCover={onCover} coverKey={coverKey} />
        ) : stillSrc ? (
          <img src={stillSrc} alt="" className="h-full w-full object-cover" style={{ filter: coverUrl ? undefined : cssApprox(day) }} draggable={false} />
        ) : null}
        <WeatherLayer weather={style.weather} animate={false} />
      </div>

      <Shapes style={style} number={number} />

      {/* шапка — постоянная */}
      <div
        className="absolute flex items-baseline justify-between"
        style={{ left: '7%', right: '7%', top: '3.4%', fontFamily: '"JetBrains Mono", monospace', fontSize: '2cqw', letterSpacing: '0.12em', textTransform: 'uppercase' }}
      >
        <span>
          {date.short} · {date.weekday}
        </span>
        <span>№ {String(number).padStart(3, '0')}</span>
      </div>
      <div className="absolute" style={{ left: '7%', right: '7%', top: '6.6%', height: 1, background: ink, opacity: 0.25 }} />

      {/* название и подпись — постоянная позиция */}
      <div className="absolute" style={{ left: '7%', right: style.shapes.kind === 'enso' ? '17%' : '7%', top: `${TITLE_TOP}%` }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 500, fontSize: '6.3cqw', lineHeight: 1.02, letterSpacing: '-0.01em' }}>{day.title}</h2>
        <p style={{ ...CAPTION_FONT[style.type.caption], marginTop: '1.6cqw' }}>{day.signals.text.caption}</p>
      </div>

      {/* подвал — постоянный */}
      <div
        className="absolute flex items-baseline justify-between gap-4"
        style={{ left: '7%', right: '7%', bottom: '3.4%', fontFamily: '"JetBrains Mono", monospace', fontSize: '1.75cqw', letterSpacing: '0.08em', textTransform: 'uppercase' }}
      >
        <span className="truncate">
          ♪ {day.song.artist} — {day.song.title}
        </span>
        <span className="shrink-0 opacity-70">
          {day.signals.weather ? `${weatherShort(day.signals.weather)} · ` : ''}
          {Math.round(style.motion.bpm)} bpm · {mode.name}
        </span>
      </div>

      {/* одна общая текстура на все карточки: SVG-фильтр шума на каждой карточке тормозил архив */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: `url(${paperGrain()})`, backgroundSize: '160px', mixBlendMode: style.palette.dark ? 'screen' : 'multiply', opacity: style.palette.dark ? 0.06 : 0.12 }}
      />
    </div>
  );
}

/** Серый шум бумаги, нарисованный один раз (мягкий: соседние точки чуть сглажены). */
let grain: string | undefined;
function paperGrain() {
  if (grain) return grain;
  const n = 160;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const img = g.createImageData(n, n);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 70 + Math.random() * 185;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.globalAlpha = 0.5;
  g.filter = 'blur(0.6px)';
  g.drawImage(c, 0, 0);
  grain = c.toDataURL('image/png');
  return grain;
}

/** Грубое CSS-приближение шейдера — только если обложки ещё нет. */
function cssApprox(day: DayRecord) {
  const s = day.style.shader;
  const parts = [`saturate(${s.saturation * (1 - s.duotone * 0.6)})`, `contrast(${s.contrast})`];
  if (s.temperature > 0) parts.push(`sepia(${s.temperature * 0.35})`);
  if (s.painterly > 0.3) parts.push('blur(0.6px)');
  return parts.join(' ');
}
