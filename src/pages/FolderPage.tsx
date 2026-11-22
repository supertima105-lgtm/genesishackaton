import { Clapperboard, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DayChooser, FolderBody, TakeOut, daysIn } from '../components/Folders';
import { formatDate } from '../components/memory/MemoryCard';
import { Pinboard, PinnedCard } from '../components/Pinboard';
import { downloadBlob, exportCollectionZip } from '../lib/folder';
import { FOLDER_COLORS, folders, useFolders } from '../lib/shelf';
import { store } from '../lib/storage';
import { numberDays, plural, useDays } from '../lib/useDays';

/** Открытая папка: её воспоминания на стене и всё, что с папкой можно сделать. */
export function FolderPage({ id }: { id: string }) {
  const { days, error } = useDays();
  const list = useFolders();
  const folder = list?.find((f) => f.id === id);
  const byId = useMemo(() => new Map((days ?? []).map((d) => [d.id, d])), [days]);
  const numbers = useMemo(() => numberDays(days ?? []), [days]);
  const inside = useMemo(() => (folder ? daysIn(folder, byId) : []), [folder, byId]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [zipping, setZipping] = useState(false);

  if (error) return <p className="label text-rust">Ошибка хранилища: {error}</p>;
  if (!list || !days) return <p className="label">Открываю папку…</p>;
  if (!folder)
    return (
      <p className="label">
        Такой папки нет. <a href="#/" className="underline">В архив</a>
      </p>
    );

  const saveName = async () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== folder.name) await folders.rename(folder.id, draft);
  };
  const remove = async () => {
    if (!confirm(`Удалить папку «${folder.name}»? Воспоминания останутся в архиве.`)) return;
    await folders.remove(folder.id);
    location.hash = '#/';
  };
  const zip = async () => {
    setZipping(true);
    try {
      downloadBlob(await exportCollectionZip(folder.name, inside, store), `${folder.name}.zip`);
    } finally {
      setZipping(false);
    }
  };
  const first = inside[inside.length - 1];
  const last = inside[0];

  return (
    <section>
      <a href="#/" className="font-hand text-2xl text-ink-soft hover:text-ink">
        ← все воспоминания
      </a>

      <div className="mt-6 mb-12 grid items-center gap-8 sm:grid-cols-[minmax(0,250px)_1fr] sm:gap-12">
        <div className="mx-auto w-full max-w-[250px] -rotate-2">
          <FolderBody folder={folder} days={inside} big />
        </div>
        <div className="min-w-0">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveName();
                if (e.key === 'Escape') setEditing(false);
              }}
              maxLength={60}
              className="w-full border-b-2 border-dashed border-blue bg-transparent font-hand text-5xl leading-tight font-bold text-blue outline-none"
              aria-label="Название папки"
            />
          ) : (
            <h1 className="group font-hand text-5xl leading-[0.95] font-bold text-blue sm:text-6xl">
              {folder.name}
              <button
                type="button"
                onClick={() => {
                  setDraft(folder.name);
                  setEditing(true);
                }}
                className="ml-2 align-middle text-ink-soft opacity-40 transition group-hover:opacity-100 focus:opacity-100"
                aria-label="Переименовать папку"
              >
                <Pencil size={18} />
              </button>
            </h1>
          )}
          <p className="label mt-2">
            {inside.length
              ? `${inside.length} ${plural(inside.length, 'воспоминание', 'воспоминания', 'воспоминаний')} · ${
                  first.date === last.date ? formatDate(first.date).long : `${formatDate(first.date).long} — ${formatDate(last.date).long}`
                }`
              : 'пока пусто'}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Цвет папки">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={folder.color === c.id}
                title={c.label}
                aria-label={c.label}
                onClick={() => void folders.recolor(folder.id, c.id)}
                className={`folder-swatch ${folder.color === c.id ? 'is-on' : ''}`}
                style={{ background: c.c }}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" className="btn btn-solid" onClick={() => setChoosing(true)}>
              <Plus size={14} /> Разложить воспоминания
            </button>
            {inside.length > 1 && (
              <a href={`#/show/folder/${folder.id}`} className="btn">
                <Clapperboard size={14} /> Показ папки
              </a>
            )}
            {inside.length > 0 && (
              <button type="button" className="btn" onClick={zip} disabled={zipping}>
                <Download size={14} /> {zipping ? 'Собираю…' : 'Папка .zip'}
              </button>
            )}
            <button type="button" className="btn" onClick={remove} aria-label="Удалить папку" title="удалить папку">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {inside.length ? (
        <Pinboard>
          {inside.map((d, i) => (
            <PinnedCard key={d.id} day={d} number={numbers.get(d.id) ?? 0} index={i} extra={<TakeOut folder={folder} day={d} />} />
          ))}
        </Pinboard>
      ) : (
        <div className="mx-auto max-w-lg -rotate-1 border-2 border-dashed border-ink/20 px-6 py-12 text-center">
          <p className="font-hand text-4xl leading-tight text-ink-soft">В папке пока ничего нет</p>
          <button type="button" className="btn mt-5" onClick={() => setChoosing(true)}>
            <Plus size={14} /> Выбрать воспоминания
          </button>
        </div>
      )}

      {choosing && <DayChooser days={days} folder={folder} onClose={() => setChoosing(false)} />}
    </section>
  );
}
