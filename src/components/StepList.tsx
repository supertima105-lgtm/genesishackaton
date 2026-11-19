import { Check, Circle, LoaderCircle, Minus } from 'lucide-react';
import type { Step } from '../lib/pipeline';

/** Живой журнал того, что делает система: прозрачность для пользователя и для жюри. */
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((s) => (
        <li key={s.id} className="flex gap-3">
          <span className="mt-0.5 shrink-0">
            {s.status === 'run' ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : s.status === 'done' ? (
              <Check size={16} />
            ) : s.status === 'skip' ? (
              <Minus size={16} className="text-ink-soft" />
            ) : (
              <Circle size={16} className="text-rust" />
            )}
          </span>
          <div className="min-w-0">
            <div className="text-sm">{s.label}</div>
            {s.detail && <div className="label mt-1 normal-case tracking-normal">{s.detail}</div>}
            {s.swatches && (
              <div className="mt-2 flex gap-1">
                {s.swatches.map((c, i) => (
                  <span key={i} className="h-4 w-6 border border-ink/10" style={{ background: c }} title={c} />
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
