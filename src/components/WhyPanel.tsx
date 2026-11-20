import { ChevronDown, LoaderCircle, RotateCcw, Save, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';
import { FEEL_AXES } from '../lib/analysis/feel';
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

/** «Почему этот день выглядит так» — режим, оси (их можно подвинуть) и свёрнутое объяснение. */
export function WhyPanel({ day, tuning, feel }: { day: DayRecord; tuning?: Tuning; feel?: FeelTuning }) {
  const mode = MODES[day.style.mode];
  const second = MODES[day.style.secondary];
  const { palette } = day.style;
  const accent = palette.accent;

  return (
    <div>
      <div className="label">почему так</div>

      <div className="mt-4 border-l-2 pl-4" style={{ borderColor: accent }}>
        <div className="font-serif text-2xl leading-tight">{mode.name}</div>
        <div className="label mt-1 normal-case tracking-normal">{mode.reference}</div>
      </div>

      {tuning && <p className="mt-6 text-sm text-ink-soft">Не так ощущалось? Подвиньте.</p>}
      <div className={`${tuning ? 'mt-3' : 'mt-6'} space-y-1.5`}>
        {AXES.map(({ key, left, right, signed }) => {
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
              accent={accent}
              onChange={(x) => tuning.onAxis(key, x)}
            />
          ) : (
            <div key={key} className="grid grid-cols-[96px_1fr_96px] items-center gap-2 text-xs">
              <span className="text-right text-ink-soft">{left}</span>
              <div className="relative h-px bg-line">
                <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${pos * 100}%`, background: accent }} />
              </div>
              <span className="text-ink-soft">{right}</span>
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

      {feel && <FeelBlock feel={feel} accent={accent} />}

      <div className="mt-6 flex items-center gap-1.5">
        {[palette.paper, palette.ink, palette.accent, ...palette.shades].map((c, i) => (
          <span key={i} className="h-6 flex-1 border border-ink/10" style={{ background: c }} title={c} />
        ))}
      </div>

      <details className="group mt-6">
        <summary className="label flex cursor-pointer list-none items-center gap-1 hover:text-ink">
          <ChevronDown size={12} className="transition group-open:rotate-180" /> как система решила
        </summary>
        <p className="mt-3 text-sm">{mode.why}</p>
        <p className="mt-1 text-sm text-ink-soft">
          Примесь: {second.name} · {Math.round(day.style.blend * 100)}%
        </p>
        <ul className="mt-4 space-y-3">
          {day.reasons.map((r, i) => (
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
  accent: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[96px_1fr_96px] items-center gap-2 text-xs">
      <span className={`text-right ${p.moved ? 'text-ink' : 'text-ink-soft'}`}>{p.left}</span>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink/50" style={{ left: `${p.basePos * 100}%` }} />
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
          style={{ '--thumb': p.accent, '--ring': p.moved ? 'var(--color-ink)' : 'transparent' } as CSSProperties}
        />
      </div>
      <span className={p.moved ? 'text-ink' : 'text-ink-soft'}>{p.right}</span>
    </div>
  );
}

function FeelBlock({ feel, accent }: { feel: FeelTuning; accent: string }) {
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
    <div className="mt-6 border-t border-line pt-4">
      <button type="button" className="btn" onClick={click} disabled={feel.busy} aria-expanded={Boolean(shown)}>
        {feel.busy ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {feel.busy ? 'Вслушиваюсь в день…' : shown ? 'Свернуть' : 'Глубже в день'}
      </button>

      {shown && (
        <div className="mt-4 space-y-1.5">
          {FEEL_AXES.map(({ key, left, right }, i) => (
            <motion.div key={key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.35 }}>
              <AxisRow
                left={left}
                right={right}
                value={value.axes[key]}
                min={0}
                basePos={value.system[key]}
                moved={Math.abs(value.axes[key] - value.system[key]) > 0.02}
                accent={accent}
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
