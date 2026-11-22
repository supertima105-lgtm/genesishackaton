import { useEffect, useState } from 'react';
import { LIBRARY, LIBRARY_ARTIST } from './library';
import type { DayRecord } from './types';

/**
 * Обложка песни дня для конверта пластинки.
 * Мелодии из библиотеки дневника — свои нарисованные обложки (работают без сети).
 * Обычные песни — обложка альбома из открытого поиска iTunes; не нашлась — рисуем по цветам дня.
 */

const svg = (body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${body}</svg>`)}`;
const bg = (a: string, b: string) => `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/>`;

function rnd(seed: number) {
  let s = seed % 2147483647 || 7;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const many = (n: number, seed: number, f: (r: () => number, i: number) => string) => {
  const r = rnd(seed);
  return Array.from({ length: n }, (_, i) => f(r, i)).join('');
};

const ART: Record<string, string> = {
  coffee: svg(
    bg('#e7b98c', '#a8693f') +
      `<circle cx="100" cy="125" r="46" fill="#f6ead8"/><circle cx="100" cy="125" r="34" fill="#5a3320"/><circle cx="92" cy="117" r="9" fill="#7a4a30"/>` +
      `<path d="M146 118a14 14 0 0 1 0 22" stroke="#f6ead8" stroke-width="7" fill="none"/>` +
      [70, 100, 130].map((x) => `<path d="M${x} 72c-10-12 10-18 0-32" stroke="#fff" stroke-opacity=".7" stroke-width="5" fill="none" stroke-linecap="round"/>`).join(''),
  ),
  rain: svg(
    bg('#9aa7b2', '#55626e') +
      many(70, 3, (r) => {
        const x = r() * 220 - 10;
        const y = r() * 200;
        return `<path d="M${x} ${y}l-6 18" stroke="#e8f0f6" stroke-opacity="${0.35 + r() * 0.5}" stroke-width="2" stroke-linecap="round"/>`;
      }) +
      `<path d="M30 150c40-12 100-12 140 0" stroke="#e8f0f6" stroke-opacity=".5" stroke-width="2" fill="none"/>`,
  ),
  night: svg(
    bg('#1b2350', '#0b0f22') +
      `<circle cx="150" cy="48" r="18" fill="#f6e7b0"/><circle cx="158" cy="42" r="16" fill="#1b2350"/>` +
      many(8, 5, (r, i) => {
        const h = 50 + r() * 70;
        return `<rect x="${i * 25}" y="${200 - h}" width="22" height="${h}" fill="#060914"/>` + many(6, i + 9, (q) => (q() > 0.5 ? `<rect x="${i * 25 + 4 + Math.round(q()) * 8}" y="${200 - h + 8 + q() * (h - 16)}" width="5" height="5" fill="#8fb7ff"/>` : ''));
      }),
  ),
  party: svg(
    bg('#ff6b7d', '#c81d4e') +
      many(55, 11, (r, i) => `<circle cx="${r() * 200}" cy="${r() * 200}" r="${3 + r() * 9}" fill="${['#ffe14d', '#4dd2ff', '#ffffff', '#7cff6b'][i % 4]}" opacity=".9"/>`) +
      `<path d="M100 40l8 22h23l-19 14 7 22-19-13-19 13 7-22-19-14h23z" fill="#ffe14d"/>`,
  ),
  road: svg(
    bg('#bfe1f2', '#9cc77f') +
      `<circle cx="100" cy="88" r="22" fill="#fff4c4"/><rect y="100" width="200" height="100" fill="#7fae5f"/>` +
      `<path d="M88 100h24l60 100H28z" fill="#5d5e66"/><path d="M100 104v14M100 128v22M100 162v34" stroke="#fff" stroke-width="4"/>`,
  ),
  quiet: svg(bg('#eef0ea', '#d5dad2') + `<line x1="20" y1="132" x2="180" y2="132" stroke="#8b958c" stroke-width="2"/><circle cx="132" cy="96" r="10" fill="#8b958c"/>`),
  evening: svg(
    bg('#ffb37a', '#ff7f6b') +
      `<circle cx="100" cy="120" r="48" fill="#ffe0a3"/><rect y="120" width="200" height="80" fill="#5b6fa8"/>` +
      many(7, 13, (r, i) => `<rect x="${30 + r() * 80}" y="${128 + i * 9}" width="${30 + r() * 40}" height="3" fill="#ffe0a3" opacity=".6"/>`),
  ),
  alarm: svg(
    bg('#5c1720', '#2a0a0f') +
      [70, 52, 34, 16].map((rr, i) => `<circle cx="100" cy="100" r="${rr}" fill="none" stroke="${i % 2 ? '#ff4d4d' : '#ffb0a0'}" stroke-width="5"/>`).join('') +
      `<path d="M100 100V60M100 100l26 14" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,
  ),
  nostalgia: svg(
    bg('#f1d6cd', '#c9a197') +
      `<g transform="rotate(-8 80 100)"><rect x="34" y="50" width="86" height="100" fill="#fbf6ee"/><rect x="42" y="58" width="70" height="66" fill="#d9a07f"/></g>` +
      `<g transform="rotate(7 130 100)"><rect x="90" y="62" width="86" height="100" fill="#fbf6ee"/><rect x="98" y="70" width="70" height="66" fill="#8fb0a3"/></g>`,
  ),
  snow: svg(
    bg('#d6e8f6', '#9cc0de') +
      many(60, 17, (r) => `<circle cx="${r() * 200}" cy="${r() * 200}" r="${1 + r() * 3.5}" fill="#fff"/>`) +
      `<g stroke="#fff" stroke-width="5" stroke-linecap="round">${[0, 60, 120].map((a) => `<line x1="100" y1="64" x2="100" y2="136" transform="rotate(${a} 100 100)"/>`).join('')}</g>`,
  ),
  freedom: svg(
    bg('#5fa8ff', '#2d6fd1') +
      many(12, 19, (_, i) => `<line x1="100" y1="200" x2="${-40 + i * 25}" y2="0" stroke="#fff" stroke-opacity=".12" stroke-width="6"/>`) +
      [
        [70, 80, 1],
        [110, 60, 1.3],
        [140, 95, 0.8],
      ]
        .map(([x, y, s]) => `<path d="M${x - 14 * s} ${y}q${7 * s}-${8 * s} ${14 * s} 0q${7 * s}-${8 * s} ${14 * s} 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>`)
        .join(''),
  ),
  storm: svg(bg('#4a3f66', '#1b1530') + many(40, 23, (r) => `<path d="M${r() * 220} ${r() * 200}l-4 16" stroke="#cbbfff" stroke-opacity=".4" stroke-width="2"/>`) + `<path d="M112 30L80 104h24l-16 66 44-86h-26z" fill="#f7f1ff"/>`),
};

/** Своя обложка для песни без найденного альбома: круги в цветах дня. */
function generated(day: DayRecord) {
  const { accent, ink, paper, shades } = day.style.palette;
  let h = 0;
  for (const ch of day.song.title + day.song.artist) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return svg(
    bg(shades[1] ?? accent, accent) +
      many(5, Math.abs(h) + 1, (r, i) => `<circle cx="${40 + r() * 120}" cy="${40 + r() * 120}" r="${20 + r() * 50}" fill="${[paper, ink, shades[2] ?? paper][i % 3]}" opacity="${0.25 + r() * 0.35}"/>`),
  );
}

/** Обложка мелодии библиотеки по её id (для списка мелодий на странице нового дня). */
export const libraryCover = (id: string): string | undefined => ART[id];

function libraryArt(day: DayRecord) {
  if (day.song.artist !== LIBRARY_ARTIST) return undefined;
  const track = LIBRARY.find((t) => t.name === day.song.title);
  return track ? ART[track.id] : undefined;
}

const MEMO = 'cover:';
const read = (k: string) => {
  try {
    return localStorage.getItem(MEMO + k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(MEMO + k, v);
  } catch {
    /* приватный режим — просто не запоминаем */
  }
};

async function itunes(artist: string, title: string): Promise<string> {
  const q = encodeURIComponent(`${artist} ${title}`.trim());
  const r = await fetch(`https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=5`);
  if (!r.ok) throw new Error(String(r.status));
  const { results } = (await r.json()) as { results: { artistName: string; trackName: string; artworkUrl100?: string }[] };
  const low = (s: string) => s.toLowerCase();
  const best = results.find((x) => artist && low(x.artistName).includes(low(artist).split(/[,&]/)[0].trim())) ?? results[0];
  return best?.artworkUrl100?.replace(/100x100bb/, '600x600bb') ?? '';
}

/** URL обложки; undefined — пока ищем (конверт остаётся бумажным, без мигания). */
export function useSongCover(day: DayRecord): string | undefined {
  const own = libraryArt(day);
  const key = `${day.song.artist}|${day.song.title}`;
  const [found, setFound] = useState<string | null>(() => (own ? null : read(key)));
  useEffect(() => {
    if (own || !day.song.title) return;
    const memo = read(key);
    if (memo !== null) return setFound(memo);
    let alive = true;
    itunes(day.song.artist, day.song.title)
      .then((url) => {
        write(key, url);
        if (alive) setFound(url);
      })
      .catch(() => alive && setFound('')); // нет сети — не запоминаем, попробуем в другой раз
    return () => {
      alive = false;
    };
  }, [own, key, day.song.artist, day.song.title]);
  if (own) return own;
  if (!day.song.title) return generated(day);
  if (found === null) return undefined;
  return found || generated(day);
}
