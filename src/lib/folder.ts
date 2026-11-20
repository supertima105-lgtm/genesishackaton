import JSZip from 'jszip';
import { MODES } from './rules/modes';
import type { Store } from './storage';
import type { DayRecord } from './types';

const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .split('')
    .map((c) => MAP[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/** Имя папки, видимое человеку: «2026-11-19 · Осенний парк и какао». */
export function folderName(date: string, title: string) {
  return `${date} · ${title.replace(/[\\/:*?"<>|]/g, '')}`;
}

/** Путь в хранилище (только ASCII). */
export function folderPath(date: string, title: string, id: string) {
  return `${date}_${slugify(title) || 'den'}_${id.slice(0, 6)}`;
}

/** Скачивает папку дня целиком: текст, фото, песня, обложка и объяснение стиля. */
export async function exportFolderZip(day: DayRecord, store: Store): Promise<Blob> {
  const zip = new JSZip();
  const dir = zip.folder(day.folder)!;
  dir.file('запись.txt', `${day.title}\n${day.date}\n\n${day.text}\n`);

  const photos = dir.folder('фото')!;
  await Promise.all(
    day.photos.map(async (ref, i) => photos.file(`${String(i + 1).padStart(2, '0')}.jpg`, await store.fileBlob(ref))),
  );
  if (day.songFile) dir.file('песня-фрагмент.wav', await store.fileBlob(day.songFile));
  dir.file(
    'песня.txt',
    `${day.song.artist} — ${day.song.title}\n${day.song.link?.url ?? ''}\n\nФрагмент ${Math.round(day.song.excerptDuration ?? 0)} с — целиком песня не хранится.\n`,
  );
  if (day.cover) dir.file('обложка.jpg', await store.fileBlob(day.cover));
  if (day.video) dir.file(`воспоминание.${day.video.mime.includes('mp4') ? 'mp4' : 'webm'}`, await store.fileBlob(day.video));

  const mode = MODES[day.style.mode];
  dir.file(
    'почему-так.txt',
    [
      `Режим: ${mode.name} — ${mode.reference}`,
      `Приём: ${mode.technique}`,
      `Почему: ${mode.why}`,
      '',
      ...day.reasons.map((r) => `[${r.source}] ${r.cause} → ${r.effect}`),
    ].join('\n'),
  );
  dir.file('стиль.json', JSON.stringify({ axes: day.axes, style: day.style, signals: day.signals }, null, 2));
  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
