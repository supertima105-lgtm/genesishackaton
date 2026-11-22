import type { CSSProperties } from 'react';
import { MODES } from '../../lib/rules/modes';
import { songArtist } from '../../lib/songCover';
import { useDayAspect } from '../../lib/aspect';
import type { DayRecord } from '../../lib/types';
import { weatherShort } from '../../lib/weather';
import { FOOT_BOTTOM, FOOT_GAP, frameOf, HEAD_TOP, RULE_TOP, TEXT_GAP, TEXT_MIN } from './layout';
import { captionLook, Jitter, Marks, paperOf, PaperLayer, photoTilt, TitleMark, titleLook, useEmotion, WindowDetails } from './Material';
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
 * Страница дневника. Постоянные элементы: шапка с датой и номером, название под фото, подвал
 * с песней, бумага. Окно фото повторяет формат снимка и занимает почти весь лист — лист
 * вырастает под ним (горизонтальный кадр — низкий лист, вертикальный — высокий).
 * Переменные: посадка окна, обработка, графический слой — от почерка кадра; бумага, почерк
 * названия, крепление снимка и следы на листе — от настроения дня (Material.tsx). Страница неподвижна.
 */
export function MemoryCard({ day, number, photoUrls, coverUrl, live, onCover, coverKey }: Props) {
  const { style } = day;
  const { ink } = style.palette;
  const emo = useEmotion(day);
  const paper = paperOf(emo.id, style.palette);
  const aspect = useDayAspect(day);
  const f = frameOf(style.layout.frame, aspect);
  const date = formatDate(day.date);
  const mode = MODES[style.mode];
  const stillSrc = coverUrl ?? photoUrls[0];
  const title = titleLook(emo, style.palette);
  const tilt = (f.rotate ?? 0) + photoTilt(emo, style.shapes.seed);
  const lifted = style.layout.frame === 'tilted' || emo.id === 'tense';

  return (
    <div className="memory-card relative w-full overflow-hidden select-none" style={{ background: paper, color: ink, containerType: 'inline-size' } as CSSProperties}>
      <PaperLayer e={emo} style={style} frame={f} />
      <div className="relative" style={{ paddingTop: `${f.top}cqw`, paddingBottom: `${FOOT_BOTTOM}cqw` }}>
        {/* окно фото — в формате снимка */}
        <div
          className="relative overflow-hidden"
          style={{
            marginLeft: `${f.x}cqw`,
            width: `${f.w}cqw`,
            height: `${f.h}cqw`,
            transform: tilt ? `rotate(${tilt}deg)` : undefined,
            boxShadow: lifted ? '0 1.2cqw 3cqw rgba(0,0,0,.22)' : undefined,
            background: paper,
          }}
        >
          {live && photoUrls[0] ? (
            <PhotoLayer url={photoUrls[0]} style={style} seed={style.shapes.seed} onCover={onCover} coverKey={coverKey} />
          ) : stillSrc ? (
            <img src={stillSrc} alt="" className="h-full w-full object-cover" style={{ filter: coverUrl ? undefined : cssApprox(day) }} draggable={false} />
          ) : null}
          <WeatherLayer weather={style.weather} animate={false} />
          <WindowDetails e={emo} style={style} frame={f} paper={paper} />
        </div>

        <Shapes style={style} number={number} frame={f} />

        {/* шапка — постоянная */}
        <div
          className="absolute flex items-baseline justify-between"
          style={{ left: '7cqw', right: '7cqw', top: `${HEAD_TOP}cqw`, fontFamily: '"JetBrains Mono", monospace', fontSize: '2cqw', letterSpacing: '0.12em', textTransform: 'uppercase' }}
        >
          <span>
            {date.short} · {date.weekday}
          </span>
          <span>№ {String(number).padStart(3, '0')}</span>
        </div>
        <div className="absolute" style={{ left: '7cqw', right: '7cqw', top: `${RULE_TOP}cqw`, height: 1, background: ink, opacity: 0.25 }} />

        {/* название и подпись — сразу под фото */}
        <div className="relative" style={{ margin: `${TEXT_GAP}cqw 7cqw 0`, minHeight: `${TEXT_MIN}cqw` }}>
          <h2 className="relative" style={title.css}>
            {title.jitter ? <Jitter text={day.title} seed={style.shapes.seed} rot={title.jitter[0]} dy={title.jitter[1]} /> : day.title}
            <TitleMark e={emo} p={style.palette} seed={style.shapes.seed} />
          </h2>
          <p style={{ ...(captionLook(emo, style.palette) ?? CAPTION_FONT[style.type.caption]), marginTop: '1.6cqw' }}>{day.signals.text.caption}</p>
        </div>

        {/* подвал — постоянный */}
        <div
          className="relative flex items-baseline justify-between gap-4"
          style={{ margin: `${FOOT_GAP}cqw 7cqw 0`, fontFamily: '"JetBrains Mono", monospace', fontSize: '1.75cqw', letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          <span className="truncate">
            ♪ {songArtist(day.song) ? `${songArtist(day.song)} — ` : ''}
            {day.song.title}
          </span>
          <span className="shrink-0 opacity-70">
            {day.signals.weather ? `${weatherShort(day.signals.weather)} · ` : ''}
            {Math.round(style.motion.bpm)} bpm · {mode.name}
          </span>
        </div>
      </div>

      {/* одна общая текстура на все карточки: SVG-фильтр шума на каждой карточке тормозил архив */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: `url(${paperGrain()})`, backgroundSize: '160px', mixBlendMode: style.palette.dark ? 'screen' : 'multiply', opacity: style.palette.dark ? 0.06 : 0.12 }}
      />
      <Marks e={emo} style={style} frame={f} />
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
