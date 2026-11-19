import virtualExamples from 'virtual:examples';
import { store } from './storage';
import type { DayRecord, FileRef } from './types';

const inlined = virtualExamples as { manifest: ExamplesManifest; files: Record<string, string> } | null;

/**
 * Примеры дней: чтобы жюри по ссылке (или открыв index.html) сразу увидело живой дневник,
 * а не пустой архив. Хранятся в public/examples (manifest.json + files/…),
 * в автономной сборке — прямо внутри index.html.
 */
export interface ExamplesManifest {
  version: 1;
  exportedAt: string;
  days: DayRecord[];
  files: FileRef[];
}

const FLAG = 'atmosfera.examples.v1';

function b64ToBlob(b64: string, mime: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function source(): Promise<{ manifest: ExamplesManifest; blob: (f: FileRef) => Promise<Blob> } | null> {
  if (inlined) {
    const { manifest, files } = inlined;
    return { manifest, blob: async (f) => b64ToBlob(files[f.path], f.mime) };
  }
  try {
    const base = `${import.meta.env.BASE_URL}examples/`;
    const r = await fetch(`${base}manifest.json`, { cache: 'no-cache' });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    const manifest = (await r.json()) as ExamplesManifest;
    return {
      manifest,
      blob: async (f) => {
        const res = await fetch(`${base}files/${f.path}`);
        if (!res.ok) throw new Error(`нет файла примера ${f.path}`);
        const b = await res.blob();
        return b.type ? b : new Blob([b], { type: f.mime });
      },
    };
  } catch {
    return null;
  }
}

/** Кладёт примеры в архив (дни с теми же id просто перезапишутся). Возвращает число дней. */
export async function importExamples(): Promise<number> {
  const src = await source();
  if (!src?.manifest.days.length) return 0;
  for (const f of src.manifest.files) await store.putFile(f.path, await src.blob(f));
  for (const d of src.manifest.days) await store.save(d);
  try {
    localStorage.setItem(FLAG, src.manifest.exportedAt);
  } catch {
    /* приватный режим — не страшно */
  }
  return src.manifest.days.length;
}

/** При первом открытии пустого дневника подкладывает примеры. Никогда не трогает непустой архив. */
export async function ensureExamples() {
  try {
    if (localStorage.getItem(FLAG)) return;
  } catch {
    /* продолжаем без флага */
  }
  try {
    if ((await store.list()).length) {
      localStorage.setItem(FLAG, 'own-days');
      return;
    }
    await importExamples();
  } catch {
    /* без примеров дневник просто пустой */
  }
}

/** Только в dev: сохранить текущий архив как примеры (public/examples) для сборок и деплоя. */
export async function exportExamples(): Promise<{ days: number; mb: number }> {
  const days = await store.list();
  const post = async (url: string, body?: BodyInit, type?: string) => {
    const r = await fetch(url, { method: 'POST', body, headers: type ? { 'content-type': type } : undefined });
    if (!r.ok) throw new Error(`${url}: ${await r.text()}`);
  };
  await post('/__examples/reset');
  const files: FileRef[] = [];
  let bytes = 0;
  for (const d of days) {
    const refs = [...d.photos, d.songFile, d.voice, d.cover].filter(Boolean) as FileRef[];
    for (const ref of refs) {
      const b = await store.fileBlob(ref);
      bytes += b.size;
      await post(`/__examples/file?path=${encodeURIComponent(ref.path)}`, b);
      files.push({ path: ref.path, mime: ref.mime || b.type });
    }
  }
  const manifest: ExamplesManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    days: days.map((d) => ({ ...d, video: undefined })), // видео тяжёлое — его можно записать заново
    files,
  };
  await post('/__examples/manifest', JSON.stringify(manifest), 'application/json');
  return { days: days.length, mb: Math.round((bytes / 1048576) * 10) / 10 };
}
