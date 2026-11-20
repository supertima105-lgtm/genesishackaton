import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { AXES } from '../components/WhyPanel';
import { MODES } from '../lib/rules/modes';
import type { Axes, DayRecord, ModeId } from '../lib/types';
import { localToday, plural, useDays, useFileUrls } from '../lib/useDays';

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const pad = (n: number) => String(n).padStart(2, '0');
const ym = (y: number, m: number) => `${y}-${pad(m)}`; // m: 1..12
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
const firstWeekday = (y: number, m: number) => (new Date(y, m - 1, 1).getDay() + 6) % 7; // понедельник = 0
const monthName = (y: number, m: number) => {
  const s = new Date(y, m - 1, 15).toLocaleDateString('ru-RU', { month: 'long' });
  return s[0].toUpperCase() + s.slice(1);
};
const shift = (y: number, m: number, d: number) => {
  const t = new Date(y, m - 1 + d, 1);
  return ym(t.getFullYear(), t.getMonth() + 1);
};

/**
 * Календарь дневника. Месяц: каждая записанная дата — плитка с обложкой страницы,
 * пустая прошедшая дата — приглашение записать этот день. Год: 12 месяцев, клетки в цвете дней.
 * Сбоку — настроение месяца, собранное из осей всех его дней.
 */
export function CalendarPage({ period }: { period?: string }) {
  const { days, error } = useDays();
  const today = localToday();
  const yearOnly = Boolean(period && /^\d{4}$/.test(period));
  const [y, m] = (period && /^\d{4}-\d{2}$/.test(period) ? period : yearOnly ? `${period}-01` : today.slice(0, 7)).split('-').map(Number);

  const byDate = useMemo(() => {
    const map = new Map<string, DayRecord[]>();
    for (const d of days ?? []) map.set(d.date, [...(map.get(d.date) ?? []), d].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    return map;
  }, [days]);

  // ← → листают месяцы (или годы)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      location.hash = yearOnly ? `#/calendar/${y + d}` : `#/calendar/${shift(y, m, d)}`;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [y, m, yearOnly]);

  if (error) return <p className="label text-rust">Ошибка хранилища: {error}</p>;
  if (!days) return <p className="label">Открываю дневник…</p>;

  return yearOnly ? <YearView year={y} byDate={byDate} today={today} /> : <MonthView y={y} m={m} byDate={byDate} today={today} />;
}

// ── месяц ──────────────────────────────────────────────────────────

function MonthView({ y, m, byDate, today }: { y: number; m: number; byDate: Map<string, DayRecord[]>; today: string }) {
  const key = ym(y, m);
  const monthDays = useMemo(
    () => [...byDate.entries()].filter(([d]) => d.startsWith(key)).flatMap(([, l]) => l).sort((a, b) => a.date.localeCompare(b.date)),
    [byDate, key],
  );
  const lead = firstWeekday(y, m);
  const n = daysIn(y, m);
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${key}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);

  return (
    <section>
      <Header
        title={
          <>
            {monthName(y, m)}{' '}
            <a href={`#/calendar/${y}`} className="text-ink-soft hover:text-ink hover:underline">
              {y}
            </a>
          </>
        }
        prev={`#/calendar/${shift(y, m, -1)}`}
        next={`#/calendar/${shift(y, m, 1)}`}
        todayHref={key === today.slice(0, 7) ? undefined : `#/calendar/${today.slice(0, 7)}`}
        yearHref={`#/calendar/${y}`}
      />

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`pb-1 font-mono text-[10px] tracking-[0.14em] uppercase ${i > 4 ? 'text-rust' : 'text-ink-soft'}`}>
                {w}
              </div>
            ))}
            {cells.map((date, i) => (date ? <DayCell key={date} date={date} list={byDate.get(date)} today={today} /> : <div key={`e${i}`} />))}
          </div>
          <p className="label mt-4 normal-case tracking-normal">← → — месяцы</p>
        </div>
        <MonthMood y={y} m={m} days={monthDays} />
      </div>
    </section>
  );
}

function DayCell({ date, list, today }: { date: string; list?: DayRecord[]; today: string }) {
  const day = list?.[0];
  const cover = useFileUrls(day?.cover ? [day.cover] : undefined);
  const first = useFileUrls(day && !day.cover ? day.photos.slice(0, 1) : undefined);
  const num = Number(date.slice(8));
  const isToday = date === today;
  const future = date > today;
  const ring = isToday ? 'ring-2 ring-rust ring-offset-2 ring-offset-paper' : '';

  if (!day) {
    if (future)
      return (
        <div className="relative aspect-square border border-line/50">
          <span className="absolute top-1 left-1.5 font-mono text-[11px] text-ink-soft/40">{num}</span>
        </div>
      );
    return (
      <a
        href={`#/new?date=${date}`}
        className={`group relative grid aspect-square place-items-center border border-line transition-colors hover:border-ink hover:bg-paper-2 ${ring}`}
        aria-label={`Записать день ${date}`}
        title="Записать этот день"
      >
        <span className="absolute top-1 left-1.5 font-mono text-[11px] text-ink-soft">{num}</span>
        <Plus size={16} className="text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      </a>
    );
  }

  const src = cover?.[0] ?? first?.[0];
  const { palette } = day.style;
  return (
    <a
      href={`#/day/${day.id}`}
      className={`group relative block aspect-square overflow-hidden transition-transform hover:z-10 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-10px_rgba(0,0,0,.45)] ${ring}`}
      style={{ background: palette.paper }}
      title={`${day.title} · ${MODES[day.style.mode].name}`}
    >
      {src && <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '50% 32%' }} draggable={false} />}
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
      <span className="absolute top-1 left-1 px-1 font-mono text-[11px] leading-tight" style={{ background: palette.paper, color: palette.ink }}>
        {num}
      </span>
      {list && list.length > 1 && (
        <span className="absolute top-1 right-1 px-1 font-mono text-[10px] leading-tight text-white" style={{ background: palette.accent }}>
          +{list.length - 1}
        </span>
      )}
      <span className="absolute inset-x-1.5 bottom-1.5 hidden truncate font-serif text-sm leading-tight text-white md:block">{day.title}</span>
      <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: palette.accent }} />
    </a>
  );
}

// ── настроение месяца ─────────────────────────────────────────────

function average(days: DayRecord[]): Axes {
  const a: Axes = { tension: 0, valence: 0, temperature: 0, nostalgia: 0, social: 0, nature: 0, pace: 0 };
  for (const d of days) for (const k of Object.keys(a) as (keyof Axes)[]) a[k] += d.axes[k] / days.length;
  return a;
}

/** Две самые выраженные черты месяца → «Ноябрь вышел тёплым и спокойным». */
function moodPhrase(name: string, a: Axes) {
  const traits: [number, string][] = [
    [Math.abs(a.temperature - 0.5), a.temperature >= 0.5 ? 'тёплым' : 'прохладным'],
    [Math.abs(a.tension - 0.45), a.tension >= 0.45 ? 'напряжённым' : 'спокойным'],
    [Math.abs(a.valence) * 0.6, a.valence >= 0 ? 'светлым' : 'грустным'],
    [a.nostalgia - 0.45, 'ностальгическим'],
    [Math.abs(a.social - 0.5) * 0.8, a.social >= 0.5 ? 'шумным' : 'уединённым'],
    [Math.abs(a.pace - 0.5) * 0.8, a.pace >= 0.5 ? 'быстрым' : 'медленным'],
  ];
  const top = traits
    .sort((x, y) => y[0] - x[0])
    .slice(0, 2)
    .map(([, w]) => w);
  return `${name} вышел ${top.join(' и ')}`;
}

function MonthMood({ y, m, days }: { y: number; m: number; days: DayRecord[] }) {
  if (!days.length)
    return (
      <aside>
        <div className="label">настроение месяца</div>
        <p className="mt-3 text-ink-soft">В этом месяце записей нет.</p>
      </aside>
    );

  const avg = average(days);
  const counts = new Map<ModeId, number>();
  days.forEach((d) => counts.set(d.style.mode, (counts.get(d.style.mode) ?? 0) + 1));
  const topMode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const gradient = days.length === 1 ? days[0].style.palette.accent : `linear-gradient(90deg, ${days.map((d) => d.style.palette.accent).join(', ')})`;

  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <div className="label">настроение месяца</div>
      <div className="mt-3 h-3" style={{ background: gradient }} />
      <p className="mt-4 font-serif text-2xl leading-tight">{moodPhrase(monthName(y, m), avg)}</p>
      <p className="mt-2 text-sm text-ink-soft">
        {days.length} {plural(days.length, 'запись', 'записи', 'записей')} · чаще всего — {MODES[topMode].name}
      </p>

      <div className="mt-5 space-y-2.5">
        {AXES.map(({ key, left, right, signed }) => {
          const at = (v: number) => (signed ? (v + 1) / 2 : v) * 100;
          return (
            <div key={key} className="grid grid-cols-[70px_1fr_70px] items-center gap-2 text-[11px]">
              <span className="text-right text-ink-soft">{left}</span>
              <div className="relative h-px bg-line">
                {days.map((d) => (
                  <span
                    key={d.id}
                    className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50"
                    style={{ left: `${at(d.axes[key])}%`, background: d.style.palette.accent }}
                  />
                ))}
                <span className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-ink" style={{ left: `${at(avg[key])}%` }} />
              </div>
              <span className="text-ink-soft">{right}</span>
            </div>
          );
        })}
        <p className="label pt-1 normal-case tracking-normal">точки — дни, черта — среднее за месяц</p>
      </div>

      <div className="mt-6">
        <div className="label">песни месяца</div>
        <ul className="mt-2 space-y-1.5 text-sm">
          {days.map((d) => (
            <li key={d.id} className="flex gap-2">
              <span className="w-6 shrink-0 font-mono text-xs text-ink-soft">{Number(d.date.slice(8))}</span>
              <a href={`#/day/${d.id}`} className="min-w-0 truncate hover:underline">
                ♪ {d.song.artist} — {d.song.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

// ── год ────────────────────────────────────────────────────────────

function YearView({ year, byDate, today }: { year: number; byDate: Map<string, DayRecord[]>; today: string }) {
  const yearDays = [...byDate.entries()].filter(([d]) => d.startsWith(String(year))).flatMap(([, l]) => l);
  const counts = new Map<ModeId, number>();
  yearDays.forEach((d) => counts.set(d.style.mode, (counts.get(d.style.mode) ?? 0) + 1));
  const modes = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const thisYear = Number(today.slice(0, 4));

  return (
    <section>
      <Header
        title={<>{year}</>}
        prev={`#/calendar/${year - 1}`}
        next={`#/calendar/${year + 1}`}
        todayHref={year === thisYear ? undefined : `#/calendar/${thisYear}`}
        monthHref={`#/calendar/${year === thisYear ? today.slice(0, 7) : `${year}-01`}`}
      />
      <p className="mt-3 text-sm text-ink-soft">
        {yearDays.length} {plural(yearDays.length, 'запись', 'записи', 'записей')}
        {modes.length > 0 && <> · {modes.map(([id, c]) => `${MODES[id].name} × ${c}`).join(' · ')}</>}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => {
          const key = ym(year, mm);
          const lead = firstWeekday(year, mm);
          const n = daysIn(year, mm);
          const filled = [...byDate.keys()].filter((d) => d.startsWith(key)).length;
          return (
            <div key={mm}>
              <a href={`#/calendar/${key}`} className="flex items-baseline justify-between gap-2 hover:underline">
                <span className="font-serif text-xl">{monthName(year, mm)}</span>
                {filled > 0 && <span className="font-mono text-[10px] text-ink-soft">{filled}</span>}
              </a>
              <div className="mt-2 grid grid-cols-7 gap-[2px]">
                {Array.from({ length: lead }, (_, k) => (
                  <span key={`e${k}`} />
                ))}
                {Array.from({ length: n }, (_, k) => {
                  const date = `${key}-${pad(k + 1)}`;
                  const d = byDate.get(date)?.[0];
                  const cls = `block aspect-square rounded-[2px] ${date === today ? 'ring-1 ring-rust ring-offset-1 ring-offset-paper' : ''}`;
                  if (!d) return <span key={date} className={`${cls} ${date > today ? 'bg-line/20' : 'bg-line/45'}`} />;
                  const p = d.style.palette;
                  return (
                    <a
                      key={date}
                      href={`#/day/${d.id}`}
                      className={`${cls} transition-transform hover:scale-150`}
                      style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.shades[1] ?? p.accent})` }}
                      title={`${Number(date.slice(8))} · ${d.title} · ${MODES[d.style.mode].name}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── шапка календаря ───────────────────────────────────────────────

function Header({
  title,
  prev,
  next,
  todayHref,
  yearHref,
  monthHref,
}: {
  title: ReactNode;
  prev: string;
  next: string;
  todayHref?: string;
  yearHref?: string;
  monthHref?: string;
}) {
  const tab = (href: string | undefined, label: string) =>
    href ? (
      <a href={href} className="px-3 py-2 font-mono text-xs tracking-wider uppercase hover:bg-paper-2">
        {label}
      </a>
    ) : (
      <span className="bg-ink px-3 py-2 font-mono text-xs tracking-wider text-paper uppercase" aria-current="page">
        {label}
      </span>
    );
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        <a href={prev} className="btn px-2.5" aria-label="Назад">
          <ChevronLeft size={14} />
        </a>
        <h1 className="min-w-[9ch] text-center font-serif text-3xl sm:text-4xl">{title}</h1>
        <a href={next} className="btn px-2.5" aria-label="Вперёд">
          <ChevronRight size={14} />
        </a>
      </div>
      <div className="flex items-center gap-2">
        {todayHref && (
          <a href={todayHref} className="btn">
            Сегодня
          </a>
        )}
        <div className="flex border border-ink">
          {tab(monthHref, 'Месяц')}
          {tab(yearHref, 'Год')}
        </div>
      </div>
    </div>
  );
}
