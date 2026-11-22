import { Check, FolderPlus, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { colorOf, folders, type DiaryFolder } from '../lib/shelf';
import type { DayRecord } from '../lib/types';
import { plural } from '../lib/useDays';
import { freshCover } from './memory/layout';
import { DAY_MIME, useThumb } from './Pinboard';

/** Последние дни папки — они и выглядывают из неё. */
export const daysIn = (f: DiaryFolder, byId: Map<string, DayRecord>) =>
  f.dayIds
    .map((id) => byId.get(id))
    .filter((d): d is DayRecord => Boolean(d))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

const hasDay = (e: DragEvent) => e.dataTransfer.types.includes(DAY_MIME);

/** Снимок, торчащий из папки. */
function FolderPrint({ day, i, n }: { day: DayRecord; i: number; n: number }) {
  const src = useThumb(freshCover(day) ?? day.photos[0], 320);
  const p = day.style.palette;
  // веером: один — по центру, два — врозь, три — левый, правый и средний повыше
  const spots = n === 1 ? [[29, -3]] : n === 2 ? [[14, -7], [44, 6]] : [[8, -9], [50, 8], [29, -1]];
  const [x, r] = spots[i];
  return (
    <span className="dfolder-print" style={{ left: `${x}%`, '--r': `${r}deg`, '--lift': `${i === 2 ? -9 : 0}%`, '--i': i } as CSSProperties}>
      <span className="block h-full w-full overflow-hidden" style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.shades[1] ?? p.paper})` }}>
        {src && <img src={src} alt="" draggable={false} />}
      </span>
    </span>
  );
}

/** Картонная папка с язычком: из-за переднего клапана выглядывают снимки, на клапане — бумажная наклейка с названием. */
export function FolderBody({ folder, days, children, big }: { folder: Pick<DiaryFolder, 'name' | 'color'>; days: DayRecord[]; children?: ReactNode; big?: boolean }) {
  const shown = days.slice(0, 3);
  return (
    <span className={`dfolder-body ${big ? 'dfolder-big' : ''}`} style={{ '--fc': colorOf(folder.color) } as CSSProperties}>
      <span className="dfolder-back" />
      {shown.map((d, i) => (
        <FolderPrint key={d.id} day={d} i={i} n={shown.length} />
      ))}
      <span className="dfolder-front">
        {children ?? (
          <>
            <span className="dfolder-label">{folder.name}</span>
            <span className="dfolder-count">
              {days.length ? `${days.length} ${plural(days.length, 'воспоминание', 'воспоминания', 'воспоминаний')}` : 'пока пусто'}
            </span>
          </>
        )}
      </span>
    </span>
  );
}

/** Папка на полке: открывается по щелчку, принимает перетащенные дни. */
export function FolderTile({ folder, byId, compact }: { folder: DiaryFolder; byId: Map<string, DayRecord>; compact?: boolean }) {
  const days = useMemo(() => daysIn(folder, byId), [folder, byId]);
  const [over, setOver] = useState(false);
  const [took, setTook] = useState(0);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const id = e.dataTransfer.getData(DAY_MIME);
    if (!id) return;
    void folders.add(folder.id, [id]);
    setTook((t) => t + 1);
  };
  return (
    <a
      href={`#/folder/${folder.id}`}
      className={`dfolder ${over ? 'is-over' : ''} ${compact ? 'dfolder-compact' : ''}`}
      title={folder.name}
      onDragOver={(e) => {
        if (!hasDay(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <span key={took} className={took ? 'dfolder-took block' : 'block'}>
        <FolderBody folder={folder} days={days} />
      </span>
    </a>
  );
}

/** Пустая папка, нарисованная карандашом: щелчок — и можно сразу написать название. */
export function NewFolderTile({ onCreated }: { onCreated?: (f: DiaryFolder) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [over, setOver] = useState(false);
  const create = async (dayIds: string[] = []) => {
    const f = await folders.create(name || 'Новая папка', dayIds);
    setEditing(false);
    setName('');
    onCreated?.(f);
  };
  return (
    <div
      className={`dfolder dfolder-new ${over ? 'is-over' : ''}`}
      onDragOver={(e) => {
        if (!hasDay(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData(DAY_MIME);
        if (id) void create([id]);
      }}
    >
      {/* контур папки карандашом, чуть кривой */}
      <svg className="dfolder-outline" viewBox="0 0 120 100" preserveAspectRatio="none" aria-hidden>
        <path
          d="M2.6 10.2 L2.9 3.1 Q3.1 1.5 4.7 1.5 L40.6 1.9 L46.2 9.6 L116.6 9.9 Q118.5 10.1 118.3 12 L117.7 97.2 Q117.5 98.8 115.8 98.7 L4.4 98.3 Q2.6 98.2 2.7 96.5 Z M3.1 34.6 Q60 33.6 117.9 35.1"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.55}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {editing ? (
        <form
          className="dfolder-sketch"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => (name.trim() ? void create() : setEditing(false))}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            placeholder="название"
            maxLength={60}
            className="dfolder-input"
            aria-label="Название новой папки"
          />
        </form>
      ) : (
        <button type="button" className="dfolder-sketch" onClick={() => setEditing(true)}>
          <Plus size={22} strokeWidth={1.6} />
          <span className="font-hand text-[22px] leading-none">новая папка</span>
        </button>
      )}
    </div>
  );
}

/** Полка с папками над архивом. */
export function FolderShelf({ list, byId }: { list: DiaryFolder[]; byId: Map<string, DayRecord> }) {
  return (
    <section className="mb-12">
      <h2 className="mb-5 font-hand text-3xl font-bold text-ink-soft">папки</h2>
      <div className="folder-shelf">
        {list.map((f) => (
          <FolderTile key={f.id} folder={f} byId={byId} />
        ))}
        <NewFolderTile />
      </div>
    </section>
  );
}

/** Пока день тащат, снизу выезжают папки — бросить можно в любую, даже если полка уже за экраном. */
export function DropDock({ active, list, byId }: { active: boolean; list: DiaryFolder[]; byId: Map<string, DayRecord> }) {
  return (
    <div className={`drop-dock ${active ? 'is-on' : ''}`} aria-hidden={!active}>
      {list.map((f) => (
        <FolderTile key={f.id} folder={f} byId={byId} compact />
      ))}
      <div className="dfolder-compact">
        <NewFolderTile />
      </div>
    </div>
  );
}

/** Ярлычок «в папку» на уголке карточки: список папок с галочками и новая папка прямо отсюда. */
export function AddToFolder({ day, list }: { day: DayRecord; list: DiaryFolder[] }) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const inAny = list.some((f) => f.dayIds.includes(day.id));

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
    <div ref={box} className={`folder-tag-wrap ${open ? 'is-open' : ''} ${inAny ? 'is-filed' : ''}`}>
      <button
        type="button"
        className="folder-tag"
        aria-label="Положить в папку"
        aria-expanded={open}
        title="в папку"
        onClick={() => {
          setOpen((o) => !o);
          setNaming(false);
        }}
      >
        <FolderPlus size={15} strokeWidth={1.8} />
      </button>
      {open && (
        <div className="folder-menu">
          {list.map((f) => {
            const on = f.dayIds.includes(day.id);
            return (
              <button key={f.id} type="button" className="folder-menu-row" onClick={() => void folders.toggle(f.id, day.id)}>
                <span className="folder-menu-dot" style={{ background: colorOf(f.color) }} />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {on && <Check size={16} className="shrink-0 text-blue" strokeWidth={2.4} />}
              </button>
            );
          })}
          {naming ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await folders.create(name || 'Новая папка', [day.id]);
                setName('');
                setNaming(false);
              }}
            >
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="название папки" maxLength={60} className="field py-1 font-hand text-[21px]" />
            </form>
          ) : (
            <button type="button" className="folder-menu-row text-ink-soft" onClick={() => setNaming(true)}>
              <Plus size={15} className="shrink-0" /> новая папка
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Убрать день из папки — сам день остаётся в архиве. */
export function TakeOut({ folder, day }: { folder: DiaryFolder; day: DayRecord }) {
  return (
    <button type="button" className="take-out" aria-label={`Убрать «${day.title}» из папки`} title="убрать из папки" onClick={() => void folders.take(folder.id, day.id)}>
      <X size={14} strokeWidth={2.2} />
    </button>
  );
}

/** Разложить воспоминания по папке: все дни дневника миниатюрами, отмеченные — внутри. */
export function DayChooser({ days, folder, onClose }: { days: DayRecord[]; folder: DiaryFolder; onClose: () => void }) {
  const [picked, setPicked] = useState(() => new Set(folder.dayIds));
  const [q, setQ] = useState('');
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? days.filter((d) => [d.title, d.text, d.date].join(' ').toLowerCase().includes(s)) : days;
  }, [days, q]);
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(40,28,12,.35)] p-3 sm:p-8" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet flex max-h-full w-full max-w-4xl flex-col p-5 sm:p-8" role="dialog" aria-label={`Воспоминания в папке «${folder.name}»`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-hand text-4xl leading-none font-bold text-blue">что положить в «{folder.name}»</div>
            <div className="label mt-1">
              отмечено {picked.size} из {days.length}
            </div>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="поиск" className="field w-48 text-sm" />
        </div>
        <div className="mt-5 -mx-1 grid flex-1 grid-cols-3 gap-3 overflow-y-auto px-1 pt-2 pb-4 sm:grid-cols-5 lg:grid-cols-6">
          {shown.map((d) => (
            <ChooserItem key={d.id} day={d} on={picked.has(d.id)} onToggle={() => toggle(d.id)} />
          ))}
          {shown.length === 0 && <p className="label col-span-full">ничего не нашлось</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-dashed border-line pt-4">
          <button type="button" className="btn" onClick={onClose}>
            отмена
          </button>
          <button
            type="button"
            className="btn btn-solid"
            onClick={async () => {
              await folders.setDays(folder.id, [...picked]);
              onClose();
            }}
          >
            положить в папку
          </button>
        </div>
      </div>
    </div>
  );
}

function ChooserItem({ day, on, onToggle }: { day: DayRecord; on: boolean; onToggle: () => void }) {
  const src = useThumb(freshCover(day) ?? day.photos[0], 320);
  const p = day.style.palette;
  const date = new Date(`${day.date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' }).replace('.', '');
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} className={`chooser-item ${on ? 'is-on' : ''}`}>
      <span className="block aspect-square overflow-hidden" style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.shades[1] ?? p.paper})` }}>
        {src && <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />}
      </span>
      <span className="mt-1 block truncate text-left font-hand text-[17px] leading-tight">{day.title}</span>
      <span className="block text-left font-mono text-[10px] text-ink-soft uppercase">{date}</span>
      {on && (
        <span className="chooser-check">
          <Check size={16} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
