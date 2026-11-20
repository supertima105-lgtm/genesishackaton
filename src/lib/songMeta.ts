/** Исполнитель и название песни — сами, по ссылке или по тегам аудиофайла. */

export interface SongMeta {
  artist: string;
  title: string;
}

const tidy = (m: SongMeta | null): SongMeta | null => {
  if (!m) return null;
  const r = { artist: (m.artist ?? '').trim(), title: (m.title ?? '').trim() };
  return r.artist || r.title ? r : null;
};

/** По ссылке на Spotify, YouTube, SoundCloud, Яндекс Музыку или Apple Music. */
export async function lookupSong(url: string): Promise<SongMeta | null> {
  if (!/^https?:\/\//.test(url.trim())) return null;
  if (import.meta.env.MODE !== 'standalone') {
    try {
      const r = await fetch(`/api/song?url=${encodeURIComponent(url.trim())}`);
      if (r.ok) return tidy((await r.json()) as SongMeta);
    } catch {
      /* сервера нет — пробуем напрямую */
    }
  }
  return tidy(await lookupDirect(url.trim()));
}

/** Без сервера: открытые oEmbed сервисов (Spotify отдаёт только название, SoundCloud — оба поля). */
async function lookupDirect(url: string): Promise<SongMeta | null> {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === 'open.spotify.com') {
      const d = (await (await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)).json()) as { title?: string };
      return { artist: '', title: d.title ?? '' };
    }
    if (host === 'soundcloud.com') {
      const d = (await (await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`)).json()) as { title?: string; author_name?: string };
      const t = d.title ?? '';
      const i = t.lastIndexOf(' by ');
      return i > 0 ? { title: t.slice(0, i), artist: t.slice(i + 4) } : { title: t, artist: d.author_name ?? '' };
    }
  } catch {
    /* сервис не ответил */
  }
  return null;
}

// ─── теги аудиофайла ─────────────────────────────────────────────────

/** Теги внутри файла (MP3 ID3v2/v1, FLAC, M4A), иначе — «Исполнитель - Название» из имени файла. */
export async function readAudioTags(file: File): Promise<SongMeta | null> {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const t = tidy(id3v2(buf) ?? flac(buf) ?? m4a(buf) ?? id3v1(buf));
    if (t?.title) return t;
  } catch {
    /* битые теги — не страшно */
  }
  const name = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const [a, ...rest] = name.split(/\s+[-–—]\s+/);
  return rest.length ? { artist: a, title: rest.join(' - ') } : { artist: '', title: name };
}

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

function id3v2(b: Uint8Array): SongMeta | null {
  if (ascii(b, 0, 3) !== 'ID3') return null;
  const ver = b[3];
  const syncsafe = (i: number) => (b[i] << 21) | (b[i + 1] << 14) | (b[i + 2] << 7) | b[i + 3];
  const end = Math.min(b.length, 10 + syncsafe(6));
  let p = 10;
  if (b[5] & 0x40) p += ver === 4 ? syncsafe(10) : (((b[10] << 24) | (b[11] << 16) | (b[12] << 8) | b[13]) >>> 0) + 4; // расширенный заголовок
  const out: SongMeta = { artist: '', title: '' };
  const head = ver === 2 ? 6 : 10;
  while (p + head < end && b[p]) {
    const id = ver === 2 ? ascii(b, p, 3) : ascii(b, p, 4);
    const size =
      ver === 2 ? (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5] : ver === 4 ? syncsafe(p + 4) : ((b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7]) >>> 0;
    if (size <= 0) break;
    const body = b.subarray(p + head, p + head + size);
    if (id === 'TIT2' || id === 'TT2') out.title = id3text(body);
    if (id === 'TPE1' || id === 'TP1') out.artist = id3text(body);
    if (out.title && out.artist) break;
    p += head + size;
  }
  return out.title || out.artist ? out : null;
}

function id3text(body: Uint8Array): string {
  const enc = body[0];
  const label = enc === 0 ? 'latin1' : enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : 'utf-8';
  return new TextDecoder(label).decode(body.subarray(1)).split('\0')[0].replace(/^﻿/, '').trim();
}

function id3v1(b: Uint8Array): SongMeta | null {
  const at = b.length - 128;
  if (at < 0 || ascii(b, at, 3) !== 'TAG') return null;
  const s = (o: number) => new TextDecoder('windows-1251').decode(b.subarray(at + o, at + o + 30)).split('\0')[0].trim();
  return { title: s(3), artist: s(33) };
}

function flac(b: Uint8Array): SongMeta | null {
  if (ascii(b, 0, 4) !== 'fLaC') return null;
  let p = 4;
  while (p + 4 < b.length) {
    const last = b[p] & 0x80;
    const type = b[p] & 0x7f;
    const len = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
    if (type === 4) return vorbisComments(b.subarray(p + 4, p + 4 + len));
    if (last) return null;
    p += 4 + len;
  }
  return null;
}

function vorbisComments(b: Uint8Array): SongMeta | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 4 + dv.getUint32(0, true);
  const n = dv.getUint32(p, true);
  p += 4;
  const out: SongMeta = { artist: '', title: '' };
  const dec = new TextDecoder();
  for (let i = 0; i < n && p + 4 <= b.length; i++) {
    const len = dv.getUint32(p, true);
    const [k, ...v] = dec.decode(b.subarray(p + 4, p + 4 + len)).split('=');
    if (/^title$/i.test(k)) out.title = v.join('=');
    if (/^artist$/i.test(k) && !out.artist) out.artist = v.join('=');
    p += 4 + len;
  }
  return out;
}

/** M4A/MP4: moov › udta › meta › ilst › ©nam / ©ART. */
function m4a(b: Uint8Array): SongMeta | null {
  if (ascii(b, 4, 4) !== 'ftyp') return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const find = (from: number, to: number, path: string[]): [number, number] | null => {
    let p = from;
    while (p + 8 <= to) {
      const size = dv.getUint32(p);
      if (size < 8) return null;
      const type = ascii(b, p + 4, 4);
      if (type === path[0]) {
        const start = p + 8 + (type === 'meta' ? 4 : 0);
        return path.length === 1 ? [start, p + size] : find(start, p + size, path.slice(1));
      }
      p += size;
    }
    return null;
  };
  const ilst = find(0, b.length, ['moov', 'udta', 'meta', 'ilst']);
  if (!ilst) return null;
  const val = (tag: string) => {
    const box = find(ilst[0], ilst[1], [tag, 'data']);
    return box ? new TextDecoder().decode(b.subarray(box[0] + 8, box[1])).trim() : '';
  };
  return { title: val('©nam'), artist: val('©ART') };
}
