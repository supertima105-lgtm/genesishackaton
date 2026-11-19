import { useEffect, useRef } from 'react';
import { reactionLabels } from '../lib/rules/react';
import type { StyleParams } from '../lib/types';
import type { Clock } from './memory/layout';

const BARS = [
  { key: 'bass', label: 'бас' },
  { key: 'level', label: 'громк.' },
  { key: 'high', label: 'верх' },
  { key: 'hit', label: 'удар' },
] as const;

/** «Что страница слышит сейчас»: живые уровни песни и то, во что они превращаются в этом режиме. */
export function LiveMeter({ clock, style, light }: { clock: Clock; style: StyleParams; light?: boolean }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const lv = clock.levels?.();
      BARS.forEach((b, i) => {
        const el = bars.current[i];
        if (el) el.style.transform = `scaleY(${Math.max(0.04, lv?.[b.key] ?? 0).toFixed(3)})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clock]);

  return (
    <div className="flex items-end gap-4">
      <div className="flex items-end gap-1.5" aria-hidden>
        {BARS.map((b, i) => (
          <div key={b.key} className="flex flex-col items-center gap-1">
            <span className={`relative block h-8 w-2 overflow-hidden ${light ? 'bg-white/10' : 'bg-ink/10'}`}>
              <span
                ref={(el) => {
                  bars.current[i] = el;
                }}
                className="absolute inset-0 origin-bottom"
                style={{ background: style.palette.accent, transform: 'scaleY(0.04)' }}
              />
            </span>
            <span className={`font-mono text-[9px] uppercase ${light ? 'opacity-60' : 'text-ink-soft'}`}>{b.label}</span>
          </div>
        ))}
      </div>
      <div className={`font-mono text-[10.5px] leading-snug tracking-wider uppercase ${light ? 'opacity-75' : 'text-ink-soft'}`}>
        <div className={light ? '' : 'text-ink'}>страница слышит песню</div>
        {reactionLabels(style).map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
    </div>
  );
}
