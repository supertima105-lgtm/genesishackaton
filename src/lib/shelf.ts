import { get, set } from 'idb-keyval';
import { useEffect, useState } from 'react';
import { currentSession, sb } from './supabase';

/**
 * Папки архива — подборки воспоминаний с любым названием («Лето у бабушки», «С Машей»).
 * Папка хранит только ссылки на дни: одно воспоминание может лежать в нескольких папках,
 * а удаление папки не трогает сами дни. Живут в этом браузере (IndexedDB).
 */
export type FolderColor = 'kraft' | 'denim' | 'sage' | 'rose' | 'mustard';

export interface DiaryFolder {
  id: string;
  name: string;
  color: FolderColor;
  dayIds: string[];
  createdAt: string;
}

export const FOLDER_COLORS: { id: FolderColor; label: string; c: string }[] = [
  { id: 'kraft', label: 'крафт', c: '#d2ad74' },
  { id: 'denim', label: 'джинса', c: '#93abc4' },
  { id: 'sage', label: 'шалфей', c: '#aebb8f' },
  { id: 'rose', label: 'роза', c: '#dba7a0' },
  { id: 'mustard', label: 'горчица', c: '#dcb456' },
];
export const colorOf = (c: FolderColor) => FOLDER_COLORS.find((x) => x.id === c)?.c ?? FOLDER_COLORS[0].c;

const KEY = 'folders:v1';
let cache: DiaryFolder[] | null = null;
const subs = new Set<(l: DiaryFolder[]) => void>();

/** Папки этого браузера (без входа) — их же предлагаем перенести в аккаунт. */
export const localFolders = async () => (await get<DiaryFolder[]>(KEY)) ?? [];

/** Вошедший человек держит папки в аккаунте (таблица shelves), иначе — в IndexedDB. */
async function read(): Promise<DiaryFolder[]> {
  const s = currentSession();
  if (!sb || !s) return localFolders();
  const { data, error } = await sb.from('shelves').select('folders').maybeSingle();
  if (error) throw error;
  return (data?.folders as DiaryFolder[] | undefined) ?? [];
}
async function persist(next: DiaryFolder[]) {
  const s = currentSession();
  if (!sb || !s) return set(KEY, next);
  const { error } = await sb.from('shelves').upsert({ user_id: s.user.id, folders: next, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function load() {
  if (!cache) cache = await read().catch(() => []);
  return cache;
}
async function write(next: DiaryFolder[]) {
  cache = next;
  subs.forEach((f) => f(next));
  await persist(next);
}
async function edit(id: string, f: (x: DiaryFolder) => DiaryFolder) {
  const l = await load();
  await write(l.map((x) => (x.id === id ? f(x) : x)));
}

export const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 60);

export const folders = {
  list: load,
  async create(name: string, dayIds: string[] = []): Promise<DiaryFolder> {
    const l = await load();
    const f: DiaryFolder = {
      id: crypto.randomUUID(),
      name: cleanName(name) || 'Новая папка',
      color: FOLDER_COLORS[l.length % FOLDER_COLORS.length].id,
      dayIds: [...new Set(dayIds)],
      createdAt: new Date().toISOString(),
    };
    await write([...l, f]);
    return f;
  },
  rename: (id: string, name: string) => edit(id, (x) => ({ ...x, name: cleanName(name) || x.name })),
  recolor: (id: string, color: FolderColor) => edit(id, (x) => ({ ...x, color })),
  add: (id: string, dayIds: string[]) => edit(id, (x) => ({ ...x, dayIds: [...new Set([...x.dayIds, ...dayIds])] })),
  take: (id: string, dayId: string) => edit(id, (x) => ({ ...x, dayIds: x.dayIds.filter((d) => d !== dayId) })),
  setDays: (id: string, dayIds: string[]) => edit(id, (x) => ({ ...x, dayIds: [...new Set(dayIds)] })),
  async toggle(id: string, dayId: string) {
    const f = (await load()).find((x) => x.id === id);
    if (!f) return;
    await (f.dayIds.includes(dayId) ? folders.take(id, dayId) : folders.add(id, [dayId]));
  },
  async remove(id: string) {
    await write((await load()).filter((x) => x.id !== id));
  },
  /** Перенос из браузера в аккаунт: папки с тем же id сливаются, новые добавляются. */
  async adopt(list: DiaryFolder[]) {
    const l = await load();
    const byId = new Map(l.map((x) => [x.id, x]));
    for (const f of list) {
      const was = byId.get(f.id);
      byId.set(f.id, was ? { ...was, dayIds: [...new Set([...was.dayIds, ...f.dayIds])] } : f);
    }
    await write([...byId.values()]);
  },
  /** День удалён из дневника — убираем его из всех папок. */
  async forgetDay(dayId: string) {
    const l = await load();
    if (l.some((x) => x.dayIds.includes(dayId))) await write(l.map((x) => ({ ...x, dayIds: x.dayIds.filter((d) => d !== dayId) })));
  },
};

export function useFolders(): DiaryFolder[] | null {
  const [list, setList] = useState<DiaryFolder[] | null>(cache);
  useEffect(() => {
    subs.add(setList);
    void load().then(setList);
    return () => {
      subs.delete(setList);
    };
  }, []);
  return list;
}
