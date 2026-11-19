import { LoaderCircle, RotateCcw, Save } from 'lucide-react';
import type { CSSProperties } from 'react';
import { MODES } from '../lib/rules/modes';
import type { Axes, DayRecord } from '../lib/types';

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

/** «Почему этот день выглядит так» — объяснимая логика системы и ручная подстройка осей. */
export function WhyPanel({ day, tuning }: { day: DayRecord; tuning?: Tuning }) {
  const mode = MODES[day.style.mode];
  const second = MODES[day.style.secondary];
  const { palette } = day.style;

  return (
    <div>
      <div className="label">почему день выглядит так</div>

      <div className="mt-4 border-l-2 pl-4" style={{ borderColor: palette.accent }}>
        <div className="font-serif text-2xl leading-tight">{mode.name}</div>
        <div className="label mt-1 normal-case tracking-normal">{mode.reference}</div>
        <p className="mt-2 text-sm">{mode.why}</p>
        <p className="mt-2 text-sm text-ink-soft">
          Примесь: {second.name} · {Math.round(day.style.blend * 100)}%
        </p>
      </div>

      {tuning && (
        <p className="mt-6 text-sm text-ink-soft">
          Не так ощущалось? Потяните ось — страница пересоберётся сразу. Чёрточка — где ось поставила система.
        </p>
      )}
      <div className={`${tuning ? 'mt-3' : 'mt-6'} space-y-1.5`}>
        {AXES.map(({ key, left, right, signed }) => {
          const v = day.axes[key];
          const pos = signed ? (v + 1) / 2 : v;
          const basePos = tuning ? (signed ? (tuning.base[key] + 1) / 2 : tuning.base[key]) : 0;
          const moved = tuning && Math.abs(tuning.base[key] - v) > 0.02;
          return (
            <div key={key} className="grid grid-cols-[84px_1fr_84px] items-center gap-2 text-xs">
              <span className="text-right text-ink-soft">{left}</span>
              {tuning ? (
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink/50" style={{ left: `${basePos * 100}%` }} />
                  <input
                    type="range"
                    min={signed ? -1 : 0}
                    max={1}
                    step={0.01}
                    value={v}
                    onChange={(e) => tuning.onAxis(key, Number(e.target.value))}
                    aria-label={`${left} — ${right}`}
                    className="axis-range"
                    style={{ '--thumb': palette.accent, '--ring': moved ? 'var(--color-ink)' : 'transparent' } as CSSProperties}
                  />
                </div>
              ) : (
                <div className="relative h-px bg-line">
                  <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${pos * 100}%`, background: palette.accent }} />
                </div>
              )}
              <span className={moved ? 'text-ink' : 'text-ink-soft'}>{right}</span>
            </div>
          );
        })}
      </div>
      {tuning && (tuning.dirty || tuning.overridden) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tuning.dirty && (
            <button type="button" className="btn btn-solid" onClick={tuning.onSave} disabled={tuning.saving}>
              {tuning.saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />} Сохранить, как ощущалось
            </button>
          )}
          {tuning.dirty && (
            <button type="button" className="btn" onClick={tuning.onRevert} disabled={tuning.saving}>
              Отменить
            </button>
          )}
          {tuning.overridden && !tuning.dirty && (
            <button type="button" className="btn" onClick={tuning.onReset} disabled={tuning.saving}>
              <RotateCcw size={14} /> Вернуть оси системы
            </button>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-1.5">
        {[palette.paper, palette.ink, palette.accent, ...palette.shades].map((c, i) => (
          <span key={i} className="h-6 flex-1 border border-ink/10" style={{ background: c }} title={c} />
        ))}
      </div>

      <ul className="mt-6 space-y-3">
        {day.reasons.map((r, i) => (
          <li key={i} className="text-sm leading-snug">
            <span className={`label mr-2 inline-block w-16 ${r.source === 'вы' ? 'text-rust' : ''}`}>{r.source}</span>
            <span>{r.cause}</span>
            <span className="text-ink-soft"> → {r.effect}</span>
          </li>
        ))}
      </ul>
      <p className="label mt-6 normal-case tracking-normal">
        Оценки настроения — художественная интерпретация записи, а не психологическая диагностика.
        {day.signals.text.source === 'heuristic' ? ' Текст разобран эвристикой (без Gemini).' : ''}
      </p>
    </div>
  );
}
