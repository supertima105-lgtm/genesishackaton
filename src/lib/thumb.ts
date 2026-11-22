import { store } from './storage';
import type { FileRef } from './types';

/**
 * Уменьшенные копии фото для марок, полароидов и карточек архива.
 * Полное фото (до 1600 px) на месте марки в 80 px только тратит память и время декодирования,
 * а когда таких марок месяц, начинает тормозить перелистывание. Копии живут в памяти до перезагрузки.
 */
const pending = new Map<string, Promise<string>>();
const ready = new Map<string, string>();

const keyOf = (ref: FileRef, side: number) => `${ref.path}@${side}`;

/** Уже готовая копия — чтобы при перелистывании не мигало пустое место. */
export const thumbCached = (ref: FileRef | undefined, side: number) => (ref ? ready.get(keyOf(ref, side)) : undefined);

export function thumbUrl(ref: FileRef, side: number): Promise<string> {
  const key = keyOf(ref, side);
  let p = pending.get(key);
  if (!p) {
    p = make(ref, side)
      .catch(() => store.fileUrl(ref))
      .then((url) => {
        ready.set(key, url);
        return url;
      });
    pending.set(key, p);
  }
  return p;
}

/**
 * Заранее, по одной в свободное время: делает копии и декодирует их, чтобы страница,
 * к которой листают, появилась сразу. Возвращает отмену.
 */
export function warmThumbs(refs: FileRef[], side: number): () => void {
  let stop = false;
  const idle = (f: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(() => f(), { timeout: 800 }) : setTimeout(f, 50));
  const next = (i: number) => {
    if (stop || i >= refs.length) return;
    idle(async () => {
      if (stop) return;
      try {
        const url = await thumbUrl(refs[i], side);
        const img = new Image();
        img.src = url;
        await img.decode();
      } catch {
        /* не вышло — страница загрузит сама */
      }
      next(i + 1);
    });
  };
  next(0);
  return () => {
    stop = true;
  };
}

async function make(ref: FileRef, side: number): Promise<string> {
  const blob = await store.fileBlob(ref);
  const probe = await createImageBitmap(blob);
  const k = Math.min(1, side / Math.max(probe.width, probe.height));
  const w = Math.max(1, Math.round(probe.width * k));
  const h = Math.max(1, Math.round(probe.height * k));
  probe.close();
  if (k >= 1) return URL.createObjectURL(blob);
  const bmp = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  const small = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.85));
  return URL.createObjectURL(small);
}
