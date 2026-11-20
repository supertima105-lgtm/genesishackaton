import { Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LiveMeter } from '../components/LiveMeter';
import { formatDate, MemoryCard } from '../components/memory/MemoryCard';
import { AXES } from '../components/WhyPanel';
import { usePlayer } from '../lib/player';
import { TRANSITION_RU } from '../lib/rules/engine';
import { CAPTION_RU, dayDistance, FRAME_RU, mostContrasting, SHAPES_RU, treatment } from '../lib/rules/labels';
import { MODES } from '../lib/rules/modes';
import type { DayRecord } from '../lib/types';
import { numberDays, useDays, useFileUrls } from '../lib/useDays';
import { weatherShort } from '../lib/weather';

const SAME = [
  'формат 4:5 и поля',
  'шапка: дата, день недели, номер страницы',
  'название — Cormorant Garamond на высоте 72%',
  'подвал: песня, темп, почерк дня',
  'фактура бумаги',
  'один и тот же шейдер',
];

export function ComparePage({ a, b }: { a?: string; b?: string }) {
  const { days, error } = useDays();
  const numbers = useMemo(() => numberDays(days ?? []), [days]);
  const [active, setActive] = useState<0 | 1 | null>(null);

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
    ['почерк', (d) => `${MODES[d.style.mode].name} + ${MODES[d.style.secondary].name} ${Math.round(d.style.blend * 100)}%`],
    ['окно фото', (d) => FRAME_RU[d.style.layout.frame]],
    ['обработка', (d) => treatment(d.style.shader)],
    ['графика', (d) => SHAPES_RU[d.style.shapes.kind]],
    ['подпись', (d) => CAPTION_RU[d.style.type.caption]],
    [
      'ритм',
      (d) => `${Math.round(d.style.motion.bpm)} BPM · кадр каждые ${d.style.motion.beatsPerShot} долей · ${TRANSITION_RU[d.style.motion.transition]}`,
    ],
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
    <section>
      <h1 className="font-hand text-5xl leading-none font-bold text-blue">Один дневник — два настроения</h1>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {([A, B] as const).map((d, side) => (
          <Side
            key={`${side}-${d.id}`}
            letter={side ? 'Б' : 'А'}
            day={d}
            number={numbers.get(d.id) ?? 0}
            days={days}
            exclude={side === 0 ? B.id : A.id}
            onSelect={(id) => select(side as 0 | 1, id)}
            active={active === side}
            onPlay={() => setActive(side as 0 | 1)}
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

function Side({
  day,
  number,
  days,
  exclude,
  onSelect,
  active,
  onPlay,
  letter,
}: {
  letter: string;
  day: DayRecord;
  number: number;
  days: DayRecord[];
  exclude: string;
  onSelect: (id: string) => void;
  active: boolean;
  onPlay: () => void;
}) {
  const photoUrls = useFileUrls(day.photos);
  const excerptUrl = useFileUrls(day.songFile ? [day.songFile] : undefined)?.[0];
  const player = usePlayer(day, excerptUrl);
  const { pause, playing } = player;

  // играет только одна сторона — иначе две песни спорят
  useEffect(() => {
    if (!active && playing) pause();
  }, [active, playing, pause]);

  const sorted = useMemo(() => [...days].sort((x, y) => y.date.localeCompare(x.date)), [days]);

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[10px] text-white" style={{ background: day.style.palette.accent }}>
          {letter}
        </span>
        <select value={day.id} onChange={(e) => onSelect(e.target.value)} className="field font-serif text-xl" aria-label="Выбрать день">
          {sorted
            .filter((d) => d.id !== exclude)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {formatDate(d.date).short} · {d.title}
              </option>
            ))}
        </select>
      </div>
      {photoUrls && photoUrls.length > 0 ? (
        <MemoryCard day={day} number={number} photoUrls={photoUrls} live clock={player.clock} playKey={player.playKey} />
      ) : (
        <div className="aspect-[4/5] w-full animate-pulse" style={{ background: day.style.palette.paper }} />
      )}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <button
          type="button"
          className="btn btn-solid"
          onClick={() => {
            if (!playing) onPlay();
            player.toggle();
          }}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Пауза' : 'Прожить'}
        </button>
        <LiveMeter clock={player.clock} style={day.style} />
      </div>
    </div>
  );
}
