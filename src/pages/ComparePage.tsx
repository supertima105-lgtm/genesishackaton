import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { store } from '../lib/storage';
import { freshCover } from '../components/memory/layout';
import { formatDate, MemoryCard } from '../components/memory/MemoryCard';
import { AXES } from '../components/WhyPanel';
import { CAPTION_RU, dayDistance, FRAME_RU, mostContrasting, SHAPES_RU, treatment } from '../lib/rules/labels';
import { emotionOf, EMOTIONS } from '../lib/rules/emotion';
import { MODES } from '../lib/rules/modes';
import type { DayRecord } from '../lib/types';
import { numberDays, plural, useDays, useFileUrls } from '../lib/useDays';
import { weatherShort } from '../lib/weather';

const SAME = [
  'лист в формате своего фото, поля',
  'шапка: дата, день недели, номер страницы',
  'название сразу под фото',
  'подвал: песня, темп, почерк дня',
  'один и тот же шейдер',
];

export function ComparePage({ a, b }: { a?: string; b?: string }) {
  const { days, error } = useDays();
  const numbers = useMemo(() => numberDays(days ?? []), [days]);

  const pair = useMemo(() => {
    if (!days || days.length < 2) return null;
    let A = days.find((d) => d.id === a);
    let B = days.find((d) => d.id === b && d.id !== A?.id);
    if (!A && !B) [A, B] = mostContrasting(days, 2);
    else if (A && !B) B = [...days].filter((d) => d.id !== A!.id).sort((x, y) => dayDistance(A!, y) - dayDistance(A!, x))[0];
    else if (!A && B) A = [...days].filter((d) => d.id !== B!.id).sort((x, y) => dayDistance(B!, y) - dayDistance(B!, x))[0];
    return [A!, B!] as const;
  }, [days, a, b]);

  if (error) return <p className="label text-rust">Ошибка хранилища: {error}</p>;
  if (!days) return <p className="label">Открываю дневник…</p>;
  if (!pair)
    return (
      <p className="label">
        Для сравнения нужно хотя бы два дня. <a href="#/new" className="underline">Записать день</a>
      </p>
    );

  const [A, B] = pair;
  const select = (side: 0 | 1, id: string) => {
    const ids = side === 0 ? [id, B.id] : [A.id, id];
    location.hash = `#/compare/${ids[0]}/${ids[1]}`;
  };

  const rows: [string, (d: DayRecord) => ReactNode][] = [
    ['настроение', (d) => EMOTIONS[emotionOf(d).id].name],
    ['бумага', (d) => EMOTIONS[emotionOf(d).id].material],
    ['название', (d) => EMOTIONS[emotionOf(d).id].font],
    ['почерк', (d) => `${MODES[d.style.mode].name} + ${MODES[d.style.secondary].name} ${Math.round(d.style.blend * 100)}%`],
    ['окно фото', (d) => FRAME_RU[d.style.layout.frame]],
    ['обработка', (d) => treatment(d.style.shader)],
    ['графика', (d) => SHAPES_RU[d.style.shapes.kind]],
    ['подпись', (d) => EMOTIONS[emotionOf(d).id].caption ?? CAPTION_RU[d.style.type.caption]],
    ['песня', (d) => `${Math.round(d.style.motion.bpm)} BPM · ${d.signals.music.mode === 'major' ? 'мажор' : 'минор'}`],
    ['погода', (d) => (d.signals.weather ? weatherShort(d.signals.weather) : '—')],
    [
      'палитра',
      (d) => (
        <span className="flex gap-1">
          {[d.style.palette.paper, d.style.palette.accent, d.style.palette.ink, ...d.style.palette.shades.slice(0, 3)].map((c, i) => (
            <span key={i} className="h-5 w-7 border border-ink/10" style={{ background: c }} title={c} />
          ))}
        </span>
      ),
    ],
  ];

  return (
    // уезжающая в сторону карточка не должна давать горизонтальную прокрутку
    <section className="overflow-x-clip">
      <h1 className="font-hand text-5xl leading-none font-bold text-blue">Один дневник — два настроения</h1>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {([A, B] as const).map((d, side) => (
          <Side
            key={side}
            side={side as 0 | 1}
            letter={side ? 'Б' : 'А'}
            day={d}
            numbers={numbers}
            days={days}
            exclude={side === 0 ? B.id : A.id}
            onSelect={(id) => select(side as 0 | 1, id)}
          />
        ))}
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <h2 className="label">что меняется</h2>
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-left text-sm">
              <tbody>
                {rows.map(([label, f]) => (
                  <tr key={label} className="border-b border-line align-top">
                    <td className="w-28 py-2.5 pr-4 font-mono text-xs text-ink-soft uppercase">{label}</td>
                    <td className="py-2.5 pr-4">{f(A)}</td>
                    <td className="py-2.5">{f(B)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="label mt-10">оси настроения</h2>
          <div className="mt-3 space-y-3">
            {AXES.map(({ key, left, right, signed }) => {
              const pos = (d: DayRecord) => (signed ? (d.axes[key] + 1) / 2 : d.axes[key]) * 100;
              return (
                <div key={key} className="grid grid-cols-[84px_1fr_84px] items-center gap-3 text-xs">
                  <span className="text-right text-ink-soft">{left}</span>
                  <div className="relative h-px bg-line">
                    <span
                      className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-ink/40"
                      style={{ left: `${Math.min(pos(A), pos(B))}%`, width: `${Math.abs(pos(A) - pos(B))}%` }}
                    />
                    {[A, B].map((d, i) => (
                      <span
                        key={i}
                        className="absolute top-1/2 grid h-4 w-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-mono text-[8px] text-white"
                        style={{ left: `${pos(d)}%`, background: d.style.palette.accent }}
                      >
                        {i ? 'Б' : 'А'}
                      </span>
                    ))}
                  </div>
                  <span className="text-ink-soft">{right}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <h2 className="label">что одинаково у обоих</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {SAME.map((s) => (
              <li key={s} className="border-b border-line pb-2">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Что нужно карточке, чтобы лечь на стол сразу целиком: обложка (снимок шейдера) или фото дня. */
interface CardSrc {
  day: DayRecord;
  cover?: string;
  photos: string[];
}

/** Файлы дня готовы и картинка уже декодирована — только тогда новая карточка заменяет старую. */
function useCardSrc(day: DayRecord): CardSrc | null {
  const [src, setSrc] = useState<CardSrc | null>(null);
  useEffect(() => {
    let alive = true;
    const cover = freshCover(day);
    const refs = cover ? [cover] : day.photos;
    Promise.all(refs.map((r) => store.fileUrl(r)))
      .then(async (urls) => {
        const img = new Image();
        img.src = urls[0] ?? '';
        await img.decode().catch(() => {});
        if (alive) setSrc(cover ? { day, cover: urls[0], photos: [] } : { day, photos: urls });
      })
      .catch(() => alive && setSrc({ day, photos: [] }));
    return () => {
      alive = false;
    };
  }, [day]);
  return src;
}

function Side({
  day,
  side,
  numbers,
  days,
  exclude,
  onSelect,
  letter,
}: {
  letter: string;
  side: 0 | 1;
  day: DayRecord;
  numbers: Map<string, number>;
  days: DayRecord[];
  exclude: string;
  onSelect: (id: string) => void;
}) {
  const src = useCardSrc(day);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const thumb = useFileUrls(day.cover ? [day.cover] : day.photos.slice(0, 1))?.[0];

  // календарь закрывается по Esc и по щелчку мимо
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="min-w-0">
      <div ref={box} className="relative mb-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="group flex w-full items-center gap-3 border-b border-dashed border-line pb-3 text-left"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[10px] text-white" style={{ background: day.style.palette.accent }}>
            {letter}
          </span>
          <span className="block h-12 w-12 shrink-0 -rotate-3 bg-white p-[3px] shadow-[0_2px_4px_rgba(0,0,0,.2)]">
            <span className="block h-full w-full" style={{ background: day.style.palette.accent }}>
              {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[11px] text-ink-soft uppercase">{formatDate(day.date).long}</span>
            <span className="block truncate font-hand text-[26px] leading-none font-semibold">{day.title}</span>
          </span>
          <span className={`btn shrink-0 ${open ? 'bg-note' : ''}`}>
            <CalendarDays size={14} /> {open ? 'закрыть' : 'другой день'}
          </span>
        </button>
        {open && (
          <DayPicker
            days={days}
            value={day}
            exclude={exclude}
            otherLetter={letter === 'А' ? 'Б' : 'А'}
            onPick={(id) => {
              setOpen(false);
              onSelect(id);
            }}
          />
        )}
      </div>
      {/* выбрали другой день: прежняя карточка уезжает в сторону, новая ложится на её место */}
      <div className="relative">
        <AnimatePresence initial={false} mode="popLayout">
          {src ? (
            <motion.div
              key={src.day.id}
              className="shadow-[0_18px_34px_-18px_rgba(40,25,5,.55)]"
              initial={{ opacity: 0, y: -28, rotate: side ? 3 : -3, scale: 1.03 }}
              animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, x: side ? 90 : -90, y: 14, rotate: side ? 7 : -7, scale: 0.96 }}
              transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <MemoryCard day={src.day} number={numbers.get(src.day.id) ?? 0} photoUrls={src.photos} coverUrl={src.cover} live={!src.cover && src.photos.length > 0} />
            </motion.div>
          ) : (
            <div className="aspect-[4/5] w-full" style={{ background: day.style.palette.paper }} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── выбор дня: обычный календарь месяца, в клетках — фото дня ──────

const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const TILT = [-2, 1.5, -1, 2, -1.5, 1];

function DayPicker({ days, value, exclude, otherLetter, onPick }: { days: DayRecord[]; value: DayRecord; exclude: string; otherLetter: string; onPick: (id: string) => void }) {
  const byDate = useMemo(() => {
    const m = new Map<string, DayRecord[]>();
    for (const d of [...days].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) m.set(d.date, [...(m.get(d.date) ?? []), d]);
    return m;
  }, [days]);
  // листаем только месяцы, где есть записи — пустые страницы не нужны
  const months = useMemo(() => [...new Set(days.map((d) => d.date.slice(0, 7)))].sort(), [days]);
  const [month, setMonth] = useState(value.date.slice(0, 7));
  const at = months.indexOf(month);

  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const dim = new Date(y, m, 0).getDate();
  const title = new Date(y, m - 1, 15).toLocaleDateString('ru-RU', { month: 'long' });
  const inMonth = days.filter((d) => d.date.startsWith(month)).length;

  return (
    <div className="sheet absolute top-full right-0 left-0 z-40 mt-2 px-4 pt-4 pb-5 shadow-[0_26px_50px_-22px_rgba(40,25,5,.65)] sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn px-2" onClick={() => setMonth(months[at - 1])} disabled={at <= 0} aria-label="Предыдущий месяц">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <div className="-rotate-1 font-hand text-[32px] leading-none font-bold">
            <span className="capitalize">{title}</span> <span className="text-ink-soft">{y}</span>
          </div>
          <div className="mt-1 font-mono text-[10px] tracking-wider text-ink-soft uppercase">
            {inMonth} {plural(inMonth, 'день', 'дня', 'дней')} · узнайте свой день по фото
          </div>
        </div>
        <button type="button" className="btn px-2" onClick={() => setMonth(months[at + 1])} disabled={at < 0 || at >= months.length - 1} aria-label="Следующий месяц">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEK.map((w, k) => (
          <div key={w} className={`pb-1 text-center font-hand text-[18px] leading-none ${k > 4 ? 'text-rust' : 'text-ink-soft'}`}>
            {w}
          </div>
        ))}
        {Array.from({ length: lead }, (_, k) => (
          <span key={`l${k}`} />
        ))}
        {Array.from({ length: dim }, (_, k) => {
          const date = `${month}-${String(k + 1).padStart(2, '0')}`;
          const list = byDate.get(date);
          if (!list)
            return (
              <div key={date} className="aspect-square border border-dashed border-line/80 p-1 font-hand text-[15px] leading-none text-ink-soft/60">
                {k + 1}
              </div>
            );
          const pick = list.find((d) => d.id !== exclude) ?? list[0];
          return (
            <PickCell
              key={date}
              day={pick}
              n={k + 1}
              more={list.length - 1}
              tilt={TILT[k % TILT.length]}
              current={list.some((d) => d.id === value.id)}
              taken={list.every((d) => d.id === exclude) ? otherLetter : null}
              onPick={() => onPick(pick.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function PickCell({ day, n, more, tilt, current, taken, onPick }: { day: DayRecord; n: number; more: number; tilt: number; current: boolean; taken: string | null; onPick: () => void }) {
  const src = useFileUrls(day.cover ? [day.cover] : day.photos.slice(0, 1))?.[0];
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={Boolean(taken)}
      title={`${formatDate(day.date).long} — ${day.title}`}
      className={`group relative aspect-square bg-white p-[3px] shadow-[0_2px_5px_rgba(40,25,5,.28)] transition-transform hover:z-10 hover:scale-[1.12] hover:rotate-0 disabled:cursor-not-allowed ${current ? 'ring-2 ring-blue ring-offset-1 ring-offset-paper' : ''}`}
      style={{ rotate: current ? '0deg' : `${tilt}deg` }}
    >
      <span className="relative block h-full w-full overflow-hidden" style={{ background: day.style.palette.accent }}>
        {src && <img src={src} alt="" className={`h-full w-full object-cover ${taken ? 'opacity-40 grayscale' : ''}`} draggable={false} />}
        {/* название проявляется при наведении — вспомнить, что это был за день */}
        <span className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/75 to-transparent px-1 pt-3 pb-0.5 text-left font-hand text-[13px] leading-[1.05] text-white transition-transform group-hover:translate-y-0">
          {day.title}
        </span>
      </span>
      <span className="absolute top-0.5 left-0.5 bg-paper/90 px-1 font-hand text-[14px] leading-none font-semibold">{n}</span>
      {more > 0 && <span className="absolute top-0.5 right-0.5 bg-ink/75 px-1 font-mono text-[9px] leading-[14px] text-paper">+{more}</span>}
      {taken && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-ink/70 font-mono text-[10px] text-white">{taken}</span>
        </span>
      )}
    </button>
  );
}
