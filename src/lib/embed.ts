import type { EmbedInfo } from './types';

/** Превращает ссылку на музыкальный сервис в официальный встраиваемый плеер. */
export function parseMusicLink(raw: string): EmbedInfo | undefined {
  const url = raw.trim();
  if (!url) return undefined;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const host = u.hostname.replace(/^www\./, '');

  if (host.endsWith('spotify.com')) {
    const m = u.pathname.match(/(track|album|playlist)\/([A-Za-z0-9]+)/);
    if (m) return { provider: 'spotify', url, embedUrl: `https://open.spotify.com/embed/${m[1]}/${m[2]}` };
  }
  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v');
    if (id) return { provider: 'youtube', url, embedUrl: `https://www.youtube.com/embed/${id}` };
  }
  if (host.startsWith('music.yandex.')) {
    const m = u.pathname.match(/album\/(\d+)\/track\/(\d+)/);
    if (m) return { provider: 'yandex', url, embedUrl: `https://music.yandex.ru/iframe/track/${m[2]}/${m[1]}` };
  }
  if (host.endsWith('soundcloud.com')) {
    return { provider: 'soundcloud', url, embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&visual=false` };
  }
  return { provider: 'other', url };
}
