import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { del, get, set } from 'idb-keyval';
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
    const refs = [...day.photos, day.songFile, day.voice, day.cover, day.video].filter(Boolean) as FileRef[];
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

class SupabaseStore implements Store {
  kind = 'supabase' as const;
  private bucket = 'diary';
  constructor(private sb: SupabaseClient) {}

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
    const { error } = await this.sb.from('days').upsert({ id: day.id, folder: day.folder, date: day.date, data: day });
    if (error) throw error;
  }
  async remove(day: DayRecord) {
    const refs = [...day.photos, day.songFile, day.voice, day.cover, day.video].filter(Boolean) as FileRef[];
    if (refs.length) await this.sb.storage.from(this.bucket).remove(refs.map((r) => r.path));
    await this.sb.from('days').delete().eq('id', day.id);
  }
  async putFile(path: string, blob: Blob) {
    const { error } = await this.sb.storage
      .from(this.bucket)
      .upload(path, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
    if (error) throw error;
    return { path, mime: blob.type };
  }
  async fileUrl(ref: FileRef) {
    return this.sb.storage.from(this.bucket).getPublicUrl(ref.path).data.publicUrl;
  }
  async fileBlob(ref: FileRef) {
    const r = await fetch(await this.fileUrl(ref));
    if (!r.ok) throw new Error(`Файл не найден: ${ref.path}`);
    return r.blob();
  }
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const store: Store = url && anon ? new SupabaseStore(createClient(url, anon)) : new LocalStore();
