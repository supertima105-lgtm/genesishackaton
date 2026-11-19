import { useEffect, useState } from 'react';
import { store } from './storage';
import type { DayRecord } from './types';

/** Номер дня в дневнике — порядковый по дате (как страницы в тетради). */
export function numberDays(days: DayRecord[]): Map<string, number> {
  const asc = [...days].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  return new Map(asc.map((d, i) => [d.id, i + 1]));
}

/** Сегодняшняя дата по местному времени, YYYY-MM-DD. */
export const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** 1 день, 2 дня, 5 дней. */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function useDays() {
  const [days, setDays] = useState<DayRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    store
      .list()
      .then(setDays)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);
  return { days, error };
}

/** Разрешает FileRef → URL; для архива — обложка или первое фото. */
export function useFileUrls(refs: { path: string; mime: string }[] | undefined) {
  const [urls, setUrls] = useState<string[] | null>(null);
  const key = refs?.map((r) => r.path).join('|') ?? '';
  useEffect(() => {
    let alive = true;
    if (!refs?.length) {
      setUrls([]);
      return;
    }
    Promise.all(refs.map((r) => store.fileUrl(r)))
      .then((u) => alive && setUrls(u))
      .catch(() => alive && setUrls([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
