import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import { MODES } from '../../lib/rules/modes';
import type { DayRecord } from '../../lib/types';
import { FRAMES, TITLE_TOP, type Clock } from './layout';
import { PhotoLayer } from './PhotoLayer';
import { Shapes } from './Shapes';
import { WeatherLayer } from './WeatherLayer';
import { weatherShort } from '../../lib/weather';

interface Props {
  day: DayRecord;
  number: number;
  photoUrls: string[];
  coverUrl?: string;
  /** live — WebGL и анимация; иначе статичная обложка (для архива). */
  live?: boolean;
  clock?: Clock;
  playKey?: number;
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
 * обработка, графический слой, шрифт подписи, ритм.
 */
export function MemoryCard({ day, number, photoUrls, coverUrl, live, clock, playKey = 0, onCover, coverKey }: Props) {
  const { style } = day;
  const { paper, ink, accent } = style.palette;
  const f = FRAMES[style.layout.frame];
  const date = formatDate(day.date);
  const mode = MODES[style.mode];
  const animate = live && playKey > 0;
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
        {live && clock ? (
          <PhotoLayer urls={photoUrls} style={style} clock={clock} seed={style.shapes.seed} beatOffset={day.signals.music.beatOffset} onCover={onCover} coverKey={coverKey} />
        ) : stillSrc ? (
          <img src={stillSrc} alt="" className="h-full w-full object-cover" style={{ filter: coverUrl ? undefined : cssApprox(day) }} draggable={false} />
        ) : null}
        <WeatherLayer weather={style.weather} animate={Boolean(live)} />
      </div>

      <Shapes style={style} clock={live ? clock : undefined} beatOffset={day.signals.music.beatOffset} number={number} />

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
        <motion.h2
          key={`t-${playKey}`}
          style={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 500, fontSize: '6.3cqw', lineHeight: 1.02, letterSpacing: '-0.01em' }}
          initial={animate ? 'hidden' : false}
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.14 } } }}
        >
          {day.title.split(' ').map((w, i) => (
            <motion.span
              key={i}
              className="inline-block"
              style={{ marginRight: '0.24em' }}
              variants={{ hidden: { opacity: 0, y: 10, filter: 'blur(8px)' }, show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9 } } }}
            >
              {w}
            </motion.span>
          ))}
        </motion.h2>
        <Caption key={`c-${playKey}`} text={day.signals.text.caption} type={style.type.caption} animate={animate} accent={accent} beat={60 / style.motion.bpm} />
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

      {/* бумага — постоянная фактура дневника */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ mixBlendMode: style.palette.dark ? 'screen' : 'multiply', opacity: style.palette.dark ? 0.06 : 0.12 }}>
        <filter id={`paper-${day.id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#paper-${day.id})`} />
      </svg>
    </div>
  );
}

function Caption({ text, type, animate, accent, beat }: { text: string; type: DayRecord['style']['type']['caption']; animate?: boolean; accent: string; beat: number }) {
  const base: CSSProperties = { ...CAPTION_FONT[type], marginTop: '1.6cqw' };
  if (!animate) return <p style={base}>{text}</p>;

  if (type === 'hand')
    return (
      <motion.p style={base} initial={{ clipPath: 'inset(0 100% 0 0)' }} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ duration: 2.6, delay: 0.9, ease: 'easeOut' }}>
        {text}
      </motion.p>
    );
  if (type === 'serif')
    return (
      <motion.p style={base} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 3.2, delay: 1.2 }}>
        {text}
      </motion.p>
    );
  if (type === 'grotesk')
    return (
      <p style={base}>
        {text.split(' ').map((w, i) => (
          <motion.span
            key={i}
            className="inline-block"
            style={{ marginRight: '0.4em', color: i % 4 === 2 ? accent : undefined }}
            initial={{ opacity: 0, scale: 1.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 + i * beat, duration: 0.12 }}
          >
            {w}
          </motion.span>
        ))}
      </p>
    );
  return (
    <p style={base}>
      {[...text].map((ch, i) => (
        <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 + i * 0.045, duration: 0.01 }}>
          {ch}
        </motion.span>
      ))}
    </p>
  );
}

/** Грубое CSS-приближение шейдера — только если обложки ещё нет. */
function cssApprox(day: DayRecord) {
  const s = day.style.shader;
  const parts = [`saturate(${s.saturation * (1 - s.duotone * 0.6)})`, `contrast(${s.contrast})`];
  if (s.temperature > 0) parts.push(`sepia(${s.temperature * 0.35})`);
  if (s.painterly > 0.3) parts.push('blur(0.6px)');
  return parts.join(' ');
}
