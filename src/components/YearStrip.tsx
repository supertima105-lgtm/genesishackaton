import { useEffect, useMemo, useRef, useState } from 'react';
import { MODES } from '../lib/rules/modes';
import type { DayRecord } from '../lib/types';
import { plural } from '../lib/useDays';
import { formatDate } from './memory/MemoryCard';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const H = 76;

const dayOfYear = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5;
};
const yearLength = (y: number) => (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 864e5;

/**
 * «Год в цветах»: каждый записанный день — размытый мазок его палитры на своём месте в году.
 * Соседние дни перетекают друг в друга, и настроение месяцев видно с одного взгляда.
 */
export function YearStrip({ days }: { days: DayRecord[] }) {
  const years = useMemo(() => [...new Set(days.map((d) => Number(d.date.slice(0, 4))))].sort((a, b) => b - a), [days]);
  const [year, setYear] = useState(years[0]);
  const [hover, setHover] = useState<DayRecord | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  const list = useMemo(() => days.filter((d) => d.date.startsWith(String(year))), [days, year]);
  const len = yearLength(year);
  const now = new Date();
  const todayX = now.getFullYear() === year ? dayOfYear(now.toISOString().slice(0, 10)) / len : null;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(width * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, H);
    const blot = Math.max(14, width / 34);
    // мягкие мазки: цвет дня растекается к соседям (два прохода — плотнее в середине)
    g.filter = `blur(${Math.round(blot * 0.6)}px)`;
    for (const d of [...list, ...list]) {
      const x = ((dayOfYear(d.date) + 0.5) / len) * width;
      const p = d.style.palette;
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, p.accent);
      grad.addColorStop(0.55, p.shades[1] ?? p.accent);
      grad.addColorStop(1, p.dark ? p.paper : p.shades[2] ?? p.ink);
      g.fillStyle = grad;
      g.globalAlpha = 0.7;
      g.fillRect(x - blot * 0.7, 6, blot * 1.4, H - 12);
    }
    // точные отметки дней
    g.filter = 'none';
    g.globalAlpha = 1;
    for (const d of list) {
      const x = ((dayOfYear(d.date) + 0.5) / len) * width;
      g.fillStyle = d.style.palette.accent;
      g.fillRect(x - 1, 4, 2, H - 8);
    }
  }, [list, width, len]);

  if (!years.length) return null;

  return (
    <section className="mb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="label">год в цветах</h2>
        <div className="flex gap-2">
          {years.map((y) => (
            <button key={y} type="button" onClick={() => setYear(y)} className={`label px-1 ${y === year ? 'text-ink underline underline-offset-4' : 'hover:text-ink'}`}>
              {y}
            </button>
          ))}
        </div>
      </div>
      <div ref={box} className="relative mt-3 border-y border-line" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {/* сетка месяцев */}
        {MONTHS.map((_, m) => (
          <span key={m} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${(dayOfYear(`${year}-${String(m + 1).padStart(2, '0')}-01`) / len) * 100}%` }} />
        ))}
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" style={{ mixBlendMode: 'multiply' }} />
        {todayX !== null && <span className="absolute inset-y-0 w-px bg-rust" style={{ left: `${todayX * 100}%` }} title="сегодня" />}
        {list.map((d) => (
          <a
            key={d.id}
            href={`#/day/${d.id}`}
            onMouseEnter={() => setHover(d)}
            onFocus={() => setHover(d)}
            className="absolute inset-y-0 -translate-x-1/2"
            style={{ left: `${((dayOfYear(d.date) + 0.5) / len) * 100}%`, width: 14 }}
            aria-label={`${formatDate(d.date).long} — ${d.title}`}
          />
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-12">
        {MONTHS.map((m, i) => (
          <a key={m} href={`#/calendar/${year}-${String(i + 1).padStart(2, '0')}`} className="font-mono text-[10px] tracking-wider text-ink-soft uppercase hover:text-ink hover:underline">
            {m}
          </a>
        ))}
      </div>
      <p className="mt-2 min-h-5 text-sm">
        {hover ? (
          <>
            <span className="font-mono text-xs text-ink-soft uppercase">{formatDate(hover.date).long}</span> · <span className="font-serif text-lg">{hover.title}</span>{' '}
            <span className="text-ink-soft">· {MODES[hover.style.mode].name}</span>
          </>
        ) : (
          <span className="text-ink-soft">
            Каждый мазок — день: цвет взят из его фото и настроения. {list.length} {plural(list.length, 'день', 'дня', 'дней')} в {year}.
          </span>
        )}
      </p>
    </section>
  );
}
