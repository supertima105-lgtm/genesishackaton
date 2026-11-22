import { useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_ASPECT } from '../components/memory/layout';
import { patchDay, store } from './storage';
import type { DayRecord } from './types';

/**
 * Формат первого фото дня (ширина / высота). У новых дней записан при сохранении,
 * у старых измеряется один раз при первом показе и дописывается в запись.
 */
const measured = new Map<string, number>();
const pending = new Map<string, Promise<number | undefined>>();
let version = 0;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export const knownAspect = (day: DayRecord) => day.photoAspect ?? measured.get(day.id);

export function measureAspect(day: DayRecord): Promise<number | undefined> {
  const known = knownAspect(day);
  if (known) return Promise.resolve(known);
  const ref = day.photos[0];
  if (!ref) return Promise.resolve(undefined);
  let p = pending.get(day.id);
  if (!p) {
    p = (async () => {
      try {
        const bmp = await createImageBitmap(await store.fileBlob(ref));
        const a = bmp.width / bmp.height;
        bmp.close();
        measured.set(day.id, a);
        version++;
        subs.forEach((f) => f());
        void patchDay(day.id, { photoAspect: a });
        return a;
      } catch {
        return undefined; // фото не прочиталось — лист останется 4:5
      }
    })();
    pending.set(day.id, p);
  }
  return p;
}

/** Формат фото дня для раскладки; пока не измерен — 4:5. */
export function useDayAspect(day: DayRecord): number {
  useSyncExternalStore(subscribe, () => version);
  const known = knownAspect(day);
  useEffect(() => {
    if (!known) void measureAspect(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.id, known]);
  return known ?? DEFAULT_ASPECT;
}
