import { useMemo, useState, type CSSProperties } from 'react';
import { MODES } from '../lib/rules/modes';
import type { DayRecord, ModeId } from '../lib/types';
import { localToday, plural, useFileUrls } from '../lib/useDays';
import { formatDate } from './memory/MemoryCard';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MODE_ORDER: ModeId[] = ['impression', 'kandinsky', 'film', 'ma', 'collage'];

const hash = (s: string) => {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return (h >>> 0) / 4294967296;
};

/** Светлая ли ткань — от этого зависит цвет стежка. */
function light(hex: string) {
  const m = hex.replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/** Ткань лоскута: цвет — из палитры дня, узор — почерк его страницы. */
function fabric(mode: ModeId, accent: string, shade: string, deep: string): string {
  const w = 'color-mix(in srgb, #fff 38%, transparent)';
  switch (mode) {
    case 'impression': // мелкий горошек, как мазки
      return `radial-gradient(circle, ${shade} 22%, transparent 26%) 0 0 / 6px 6px, radial-gradient(circle, color-mix(in srgb, ${deep} 45%, transparent) 18%, transparent 22%) 3px 3px / 6px 6px, ${accent}`;
    case 'kandinsky': // косая полоса
      return `repeating-linear-gradient(45deg, ${accent} 0 4px, ${shade} 4px 7px)`;
    case 'film': // тонкая полоска, как плёнка
      return `repeating-linear-gradient(0deg, ${accent} 0 4px, color-mix(in srgb, ${deep} 55%, ${accent}) 4px 5px)`;
    case 'ma': // гладкий хлопок
      return `linear-gradient(160deg, color-mix(in srgb, ${accent} 72%, #fff), ${accent})`;
    case 'collage': // клетка-виши
      return `linear-gradient(90deg, ${w} 50%, transparent 0) 0 0 / 7px 7px, linear-gradient(${w} 50%, transparent 0) 0 0 / 7px 7px, ${accent}`;
  }
}

function patchStyle(d: DayRecord): CSSProperties {
  const p = d.style.palette;
  return {
    background: fabric(d.style.mode, p.accent, p.shades[1] ?? p.paper, p.shades[2] ?? p.ink),
    '--r': `${((hash(d.id) * 2 - 1) * 2.2).toFixed(2)}deg`,
    '--st': light(p.accent) ? 'rgba(60,45,25,.5)' : 'rgba(255,255,255,.7)',
  } as CSSProperties;
}

/**
 * «Лоскутное одеяло»: год сшит из дней. Каждый записанный день — лоскут ткани в цвет его фото,
 * узор ткани — почерк страницы. Пустые лоскуты — ещё не записанные дни, их можно «дошить».
 */
export function Quilt({ days }: { days: DayRecord[] }) {
  const years = useMemo(() => [...new Set(days.map((d) => Number(d.date.slice(0, 4))))].sort((a, b) => b - a), [days]);
  const [year, setYear] = useState(years[0]);
  const [hover, setHover] = useState<DayRecord | null>(null);
  const today = localToday();

  const byDate = useMemo(() => {
    const m = new Map<string, DayRecord>();
    for (const d of [...days].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) if (d.date.startsWith(String(year))) m.set(d.date, d);
    return m;
  }, [days, year]);

  if (!years.length) return null;
  const count = byDate.size;

  return (
    <section className="mb-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="label">лоскутное одеяло года</h2>
        <div className="flex gap-2">
          {years.map((y) => (
            <button key={y} type="button" onClick={() => setYear(y)} className={`label px-1 ${y === year ? 'text-ink underline underline-offset-4' : 'hover:text-ink'}`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="quilt mt-3" onMouseLeave={() => setHover(null)}>
        <div className="grid items-center gap-[2px] sm:gap-[3px]" style={{ gridTemplateColumns: 'minmax(26px, 34px) repeat(31, minmax(0, 1fr))' }}>
          {MONTHS.map((name, m) => {
            const mm = String(m + 1).padStart(2, '0');
            const dim = new Date(year, m + 1, 0).getDate();
            return [
              <a key={`m${m}`} href={`#/calendar/${year}-${mm}`} className="font-mono text-[10px] tracking-wider text-ink-soft uppercase hover:text-ink hover:underline">
                {name}
              </a>,
              ...Array.from({ length: 31 }, (_, k) => {
                const date = `${year}-${mm}-${String(k + 1).padStart(2, '0')}`;
                if (k >= dim) return <span key={date} />;
                const d = byDate.get(date);
                const isToday = date === today;
                if (d)
                  return (
                    <a
                      key={date}
                      href={`#/day/${d.id}`}
                      className={`patch ${isToday ? 'patch-today' : ''}`}
                      style={patchStyle(d)}
                      onMouseEnter={() => setHover(d)}
                      onFocus={() => setHover(d)}
                      aria-label={`${formatDate(date).long} — ${d.title}`}
                    />
                  );
                if (date > today) return <span key={date} className="patch patch-future" />;
                return (
                  <a
                    key={date}
                    href={`#/new?date=${date}`}
                    className={`patch patch-empty ${isToday ? 'patch-today' : ''}`}
                    title={`${formatDate(date).long} — записать этот день`}
                    onMouseEnter={() => setHover(null)}
                  />
                );
              }),
            ];
          })}
        </div>
      </div>

      <div className="mt-3 flex min-h-12 flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {hover ? (
          <HoverNote day={hover} />
        ) : (
          <p className="text-sm text-ink-soft">
            Каждый лоскут — день: ткань в цвет его фото, узор — почерк страницы. {count} {plural(count, 'лоскут', 'лоскута', 'лоскутов')} в {year}.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {MODE_ORDER.map((m) => (
            <span key={m} className="flex items-center gap-1.5 font-mono text-[10px] text-ink-soft uppercase">
              <span className="patch patch-legend" style={{ background: fabric(m, '#9a8f80', '#d8cfc0', '#4a4138'), '--r': '0deg', '--st': 'rgba(255,255,255,.7)' } as CSSProperties} />
              {MODES[m].name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function HoverNote({ day }: { day: DayRecord }) {
  const src = useFileUrls(day.cover ? [day.cover] : day.photos.slice(0, 1))?.[0];
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="block h-11 w-11 shrink-0 -rotate-3 bg-white p-[3px] shadow-[0_2px_4px_rgba(0,0,0,.2)]">
        <span className="block h-full w-full" style={{ background: day.style.palette.accent }}>
          {src && <img src={src} alt="" className="h-full w-full object-cover" />}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-[11px] text-ink-soft uppercase">
          {formatDate(day.date).long} · {MODES[day.style.mode].name}
        </span>
        <span className="block truncate font-hand text-[24px] leading-none font-semibold">{day.title}</span>
      </span>
    </div>
  );
}
