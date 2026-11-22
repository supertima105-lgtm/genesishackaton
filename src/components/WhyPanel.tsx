import { ChevronDown, LoaderCircle, Mail, RotateCcw, Save } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';
import { FEEL_AXES } from '../lib/analysis/feel';
import { emotionOf, EMOTIONS } from '../lib/rules/emotion';
import { MODES } from '../lib/rules/modes';
import type { Axes, DayFeel, DayRecord, FeelAxes } from '../lib/types';

export const AXES: { key: keyof Axes; left: string; right: string; signed?: boolean }[] = [
  { key: 'tension', left: 'покой', right: 'напряжение' },
  { key: 'valence', left: 'грусть', right: 'радость', signed: true },
  { key: 'temperature', left: 'холод', right: 'тепло' },
  { key: 'nostalgia', left: 'сейчас', right: 'ностальгия' },
  { key: 'social', left: 'один', right: 'много людей' },
  { key: 'nature', left: 'город', right: 'природа' },
  { key: 'pace', left: 'медленно', right: 'быстро' },
];

/** Цвета круглых наклеек на ползунках. */
const STICKERS = ['#d9792b', '#e05a5a', '#2f4f8f', '#6aa36f', '#e8b33e', '#9a6bd1', '#3fa7a0'];

export interface Tuning {
  base: Axes; // как решила система
  onAxis: (k: keyof Axes, v: number) => void;
  dirty: boolean;
  overridden: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  onRevert: () => void;
}

/** «Глубже в день»: второй слой ощущений, на кадр не влияет. */
export interface FeelTuning {
  value?: DayFeel;
  busy: boolean;
  onCompute: () => void;
  onAxis: (k: keyof FeelAxes, v: number) => void;
  onReset: () => void;
}

/** «Как ощущалось» — почерк страницы, оси (их можно подвинуть) и свёрнутое объяснение. */
export function WhyPanel({ day, tuning, feel }: { day: DayRecord; tuning?: Tuning; feel?: FeelTuning }) {
  const mode = MODES[day.style.mode];
  const second = MODES[day.style.secondary];
  const { palette } = day.style;
  const emo = emotionOf(day);
  const mood = EMOTIONS[emo.id];

  return (
    <div>
      <div className="font-hand text-4xl leading-none font-bold">как ощущалось</div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="note text-[22px]">почерк: {mode.name}</span>
        <span className="font-mono text-[11px] text-ink-soft">{mode.reference}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="note text-[22px]">настроение: {mood.name}</span>
        <span className="font-mono text-[11px] text-ink-soft">{mood.material}</span>
      </div>

      {tuning && <p className="mt-5 font-mono text-xs text-ink-soft">не так? передвинь кружок — страница сразу перестроится под твоё ощущение</p>}
      <div className={`${tuning ? 'mt-2' : 'mt-5'}`}>
        {AXES.map(({ key, left, right, signed }, i) => {
          const v = day.axes[key];
          const pos = signed ? (v + 1) / 2 : v;
          const basePos = tuning ? (signed ? (tuning.base[key] + 1) / 2 : tuning.base[key]) : 0;
          const moved = Boolean(tuning) && Math.abs((tuning?.base[key] ?? v) - v) > 0.02;
          return tuning ? (
            <AxisRow
              key={key}
              left={left}
              right={right}
              value={v}
              min={signed ? -1 : 0}
              basePos={basePos}
              moved={moved}
              color={STICKERS[i % STICKERS.length]}
              onChange={(x) => tuning.onAxis(key, x)}
            />
          ) : (
            <div key={key} className="grid h-8 grid-cols-[104px_1fr_104px] items-center gap-2 font-hand text-[21px]">
              <span className="text-right">{left}</span>
              <div className="relative h-0.5 bg-[repeating-linear-gradient(90deg,rgba(43,38,32,.45)_0_6px,transparent_6px_10px)]">
                <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${pos * 100}%`, background: STICKERS[i % STICKERS.length] }} />
              </div>
              <span>{right}</span>
            </div>
          );
        })}
      </div>
      {tuning && (tuning.dirty || tuning.overridden) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tuning.dirty && (
            <button type="button" className="btn btn-solid" onClick={tuning.onSave} disabled={tuning.saving}>
              {tuning.saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />} Сохранить
            </button>
          )}
          {tuning.dirty && (
            <button type="button" className="btn" onClick={tuning.onRevert} disabled={tuning.saving}>
              Отменить
            </button>
          )}
          {tuning.overridden && !tuning.dirty && (
            <button type="button" className="btn" onClick={tuning.onReset} disabled={tuning.saving}>
              <RotateCcw size={14} /> Сбросить
            </button>
          )}
        </div>
      )}

      {feel && <FeelBlock feel={feel} />}

      <div className="mt-8 flex flex-wrap gap-2">
        {[palette.paper, palette.ink, palette.accent, ...palette.shades].map((c, i) => (
          <span key={i} className="chip" title={c}>
            <i style={{ background: c }} />
            {c.toUpperCase()}
          </span>
        ))}
      </div>

      <details className="group mt-6">
        <summary className="flex cursor-pointer list-none items-center gap-1 font-hand text-2xl text-ink-soft hover:text-ink">
          <ChevronDown size={16} className="transition group-open:rotate-180" /> как система решила
        </summary>
        <p className="mt-3 text-sm">{mode.why}</p>
        <p className="mt-1 text-sm text-ink-soft">
          Примесь: {second.name} · {Math.round(day.style.blend * 100)}%
        </p>
        <p className="mt-3 text-sm">{mood.why}</p>
        <ul className="mt-4 space-y-3">
          <li className="text-sm leading-snug">
            <span className="label mr-2 inline-block w-16">текст</span>
            <span>{emo.cues.length ? `в записи: ${emo.cues.map((c) => `«${c}»`).join(', ')}` : 'явных слов настроения нет — решили сигналы текста, песни и почерк кадра'}</span>
            <span className="text-ink-soft">
              {' '}
              → {mood.name}: {mood.material}
            </span>
          </li>
          {day.reasons.filter((r) => !r.effect.startsWith('голос озвучки')).map((r, i) => (
            <li key={i} className="text-sm leading-snug">
              <span className={`label mr-2 inline-block w-16 ${r.source === 'вы' ? 'text-rust' : ''}`}>{r.source}</span>
              <span>{r.cause}</span>
              <span className="text-ink-soft"> → {r.effect}</span>
            </li>
          ))}
        </ul>
        <p className="label mt-4 normal-case tracking-normal">
          Художественная интерпретация, а не психологическая диагностика.
          {day.signals.text.source === 'heuristic' ? ' Текст разобран эвристикой (без Gemini).' : ''}
        </p>
      </details>
    </div>
  );
}

function AxisRow(p: {
  left: string;
  right: string;
  value: number;
  min: number;
  basePos: number;
  moved: boolean;
  color: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid h-8 grid-cols-[104px_1fr_104px] items-center gap-2 font-hand text-[21px] leading-none max-sm:grid-cols-[84px_1fr_84px] max-sm:text-[19px]">
      <span className={`text-right ${p.moved ? 'text-blue' : ''}`}>{p.left}</span>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded bg-ink/40" style={{ left: `${p.basePos * 100}%` }} />
        <input
          type="range"
          min={p.min}
          max={1}
          step={0.01}
          value={p.value}
          disabled={p.disabled}
          onChange={(e) => p.onChange(Number(e.target.value))}
          aria-label={`${p.left} — ${p.right}`}
          className="axis-range"
          style={{ '--thumb': p.color, '--ring': p.moved ? 'var(--color-blue)' : 'transparent' } as CSSProperties}
        />
      </div>
      <span className={p.moved ? 'text-blue' : ''}>{p.right}</span>
    </div>
  );
}

function FeelBlock({ feel }: { feel: FeelTuning }) {
  const [open, setOpen] = useState(false);
  const value = feel.value;
  const shown = open && value;
  const edited = value && FEEL_AXES.some(({ key }) => Math.abs(value.axes[key] - value.system[key]) > 0.02);

  const click = () => {
    if (!value) {
      feel.onCompute();
      setOpen(true);
    } else setOpen((o) => !o);
  };

  return (
    <div className="mt-7">
      {/* конверт: внутри — второй слой ощущений */}
      <button
        type="button"
        onClick={click}
        disabled={feel.busy}
        aria-expanded={Boolean(shown)}
        className="inline-flex items-center gap-3 bg-[#e8d6b4] px-5 pt-7 pb-3 font-hand text-[26px] leading-none shadow-[0_8px_14px_-6px_rgba(0,0,0,.25)] transition hover:-rotate-2 hover:scale-[1.03] disabled:cursor-progress"
        style={{ clipPath: 'polygon(0 0, 50% 26%, 100% 0, 100% 100%, 0 100%)' }}
      >
        {feel.busy ? <LoaderCircle size={18} className="animate-spin" /> : <Mail size={18} />}
        {feel.busy ? 'вслушиваюсь в день…' : shown ? 'свернуть' : 'глубже в день'}
      </button>

      {shown && (
        <div className="mt-4">
          {FEEL_AXES.map(({ key, left, right }, i) => (
            <motion.div key={key} initial={{ opacity: 0, y: 8, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: i * 0.06, duration: 0.35 }}>
              <AxisRow
                left={left}
                right={right}
                value={value.axes[key]}
                min={0}
                basePos={value.system[key]}
                moved={Math.abs(value.axes[key] - value.system[key]) > 0.02}
                color={STICKERS[(i + 3) % STICKERS.length]}
                disabled={feel.busy}
                onChange={(x) => feel.onAxis(key, x)}
              />
            </motion.div>
          ))}
          {edited && (
            <button type="button" className="btn mt-3" onClick={feel.onReset}>
              <RotateCcw size={14} /> Сбросить
            </button>
          )}
        </div>
      )}
    </div>
  );
}
