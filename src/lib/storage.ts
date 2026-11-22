import type { SupabaseClient } from '@supabase/supabase-js';
import { del, get, set } from 'idb-keyval';
import { loadSession, sb } from './supabase';
import type { DayRecord, FileRef } from './types';

/**
 * «Папка дня» — запись DayRecord + файлы по пути <slug>/...
 * Два бэкенда: Supabase (общий архив для демо) или IndexedDB в браузере (работает без настройки).
 */
export interface Store {
  kind: 'local' | 'supabase';
  list(): Promise<DayRecord[]>;
  get(id: string): Promise<DayRecord | null>;
  save(day: DayRecord): Promise<void>;
  remove(day: DayRecord): Promise<void>;
  putFile(path: string, blob: Blob): Promise<FileRef>;
  removeFile(ref: FileRef): Promise<void>;
  fileUrl(ref: FileRef): Promise<string>;
  fileBlob(ref: FileRef): Promise<Blob>;
}

const byDateDesc = (a: DayRecord, b: DayRecord) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

class LocalStore implements Store {
  kind = 'local' as const;
  private urls = new Map<string, string>();

  private async ids() {
    return (await get<string[]>('days:index')) ?? [];
  }
  async list() {
    const ids = await this.ids();
    const days = await Promise.all(ids.map((id) => get<DayRecord>(`day:${id}`)));
    return days.filter((d): d is DayRecord => Boolean(d)).sort(byDateDesc);
  }
  async get(id: string) {
    return (await get<DayRecord>(`day:${id}`)) ?? null;
  }
  async save(day: DayRecord) {
    await set(`day:${day.id}`, day);
    const ids = await this.ids();
    if (!ids.includes(day.id)) await set('days:index', [...ids, day.id]);
  }
  async remove(day: DayRecord) {
    const refs = filesOf(day);
    await Promise.all(refs.map((r) => del(`file:${r.path}`)));
    await del(`day:${day.id}`);
    await set('days:index', (await this.ids()).filter((i) => i !== day.id));
  }
  async putFile(path: string, blob: Blob) {
    await set(`file:${path}`, blob);
    const old = this.urls.get(path);
    if (old) URL.revokeObjectURL(old);
    this.urls.delete(path);
    return { path, mime: blob.type };
  }
  async removeFile(ref: FileRef) {
    await del(`file:${ref.path}`);
    const old = this.urls.get(ref.path);
    if (old) URL.revokeObjectURL(old);
    this.urls.delete(ref.path);
  }
  async fileBlob(ref: FileRef) {
    const b = await get<Blob>(`file:${ref.path}`);
    if (!b) throw new Error(`Файл не найден: ${ref.path}`);
    return b;
  }
  async fileUrl(ref: FileRef) {
    const cached = this.urls.get(ref.path);
    if (cached) return cached;
    const url = URL.createObjectURL(await this.fileBlob(ref));
    this.urls.set(ref.path, url);
    return url;
  }
}

export const filesOf = (day: DayRecord) => [...day.photos, day.songFile, day.voice, day.cover, day.video].filter(Boolean) as FileRef[];

/**
 * Дневник в аккаунте. FileRef.path остаётся тем же, что и в браузере (<slug>/...),
 * а в приватном bucket файл лежит под папкой владельца: <user_id>/<slug>/... — так работают RLS-политики
 * и перенос дней из браузера в аккаунт не переписывает записи.
 */
class SupabaseStore implements Store {
  kind = 'supabase' as const;
  private bucket = 'diary';
  private urls = new Map<string, { url: string; until: number }>();
  constructor(
    private sb: SupabaseClient,
    private uid: string,
  ) {}
  private key = (path: string) => `${this.uid}/${path}`;
  private files = () => this.sb.storage.from(this.bucket);

  async list() {
    const { data, error } = await this.sb.from('days').select('data').order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => r.data as DayRecord).sort(byDateDesc);
  }
  async get(id: string) {
    const { data, error } = await this.sb.from('days').select('data').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data?.data as DayRecord) ?? null;
  }
  async save(day: DayRecord) {
    const { error } = await this.sb
      .from('days')
      .upsert({ user_id: this.uid, id: day.id, folder: day.folder, date: day.date, data: day }, { onConflict: 'user_id,id' });
    if (error) throw error;
  }
  async remove(day: DayRecord) {
    const refs = filesOf(day);
    if (refs.length) await this.files().remove(refs.map((r) => this.key(r.path)));
    const { error } = await this.sb.from('days').delete().eq('id', day.id);
    if (error) throw error;
  }
  async putFile(path: string, blob: Blob) {
    const { error } = await this.files().upload(this.key(path), blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
    if (error) throw error;
    this.urls.delete(path);
    return { path, mime: blob.type };
  }
  async removeFile(ref: FileRef) {
    await this.files().remove([this.key(ref.path)]);
    this.urls.delete(ref.path);
  }
  async fileUrl(ref: FileRef) {
    const hit = this.urls.get(ref.path);
    if (hit && hit.until > Date.now()) return hit.url;
    const { data, error } = await this.files().createSignedUrl(this.key(ref.path), 60 * 60 * 6);
    if (error || !data) throw error ?? new Error(`Файл не найден: ${ref.path}`);
    this.urls.set(ref.path, { url: data.signedUrl, until: Date.now() + 1000 * 60 * 60 * 5 });
    return data.signedUrl;
  }
  async fileBlob(ref: FileRef) {
    const { data, error } = await this.files().download(this.key(ref.path));
    if (error || !data) throw error ?? new Error(`Файл не найден: ${ref.path}`);
    return data;
  }
}

/** Дневник этого браузера — нужен и без входа, и для переноса дней в аккаунт. */
export const localStore: Store = new LocalStore();
let current: Store = localStore;

/** Выбирает хранилище по сохранённому входу. Вызывается один раз до первого рендера. */
export async function initStore() {
  const s = await loadSession();
  current = sb && s ? new SupabaseStore(sb, s.user.id) : localStore;
  return current.kind;
}

/** Текущее хранилище: аккаунт, если человек вошёл, иначе этот браузер. */
export const store: Store = {
  get kind() {
    return current.kind;
  },
  list: () => current.list(),
  get: (id) => current.get(id),
  save: (day) => current.save(day),
  remove: (day) => current.remove(day),
  putFile: (path, blob) => current.putFile(path, blob),
  removeFile: (ref) => current.removeFile(ref),
  fileUrl: (ref) => current.fileUrl(ref),
  fileBlob: (ref) => current.fileBlob(ref),
};

/**
 * Фоновые дописывания дня (формат фото, новая обложка) — строго по очереди и поверх свежей записи,
 * чтобы два таких дописывания не затёрли друг друга. Возвращает запись до изменения.
 */
let chain: Promise<unknown> = Promise.resolve();
export function patchDay(id: string, patch: Partial<DayRecord>): Promise<DayRecord | null> {
  const run = chain.then(async () => {
    const latest = await store.get(id);
    if (!latest) return null;
    const next = { ...latest, ...patch };
    await store.save(next);
    window.dispatchEvent(new CustomEvent<DayRecord>('diary:day', { detail: next }));
    return latest;
  });
  chain = run.catch(() => {});
  return run;
}

/** Подписка на дописанные в фоне дни — открытые страницы подменяют у себя запись. */
export function onDayChange(f: (d: DayRecord) => void) {
  const h = (e: Event) => f((e as CustomEvent<DayRecord>).detail);
  window.addEventListener('diary:day', h);
  return () => window.removeEventListener('diary:day', h);
}
