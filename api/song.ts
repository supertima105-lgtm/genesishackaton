/**
 * GET /api/song?url=… → { artist, title } по ссылке на песню.
 * Ходим только на известные музыкальные сервисы (никаких произвольных адресов).
 */

const UA = 'Mozilla/5.0 (compatible; atmosfera-diary/1.0)';

export async function GET(req: Request): Promise<Response> {
  const raw = new URL(req.url).searchParams.get('url') ?? '';
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return json({ error: 'не ссылка' }, 400);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return json({ error: 'не ссылка' }, 400);
  const host = u.hostname.replace(/^(www|m)\./, '');
  try {
    const meta =
      host === 'open.spotify.com'
        ? await spotify(u)
        : host === 'youtu.be' || host === 'youtube.com' || host === 'music.youtube.com'
          ? await youtube(u)
          : host === 'soundcloud.com'
            ? await soundcloud(u)
            : /^music\.yandex\.(ru|kz|by|com)$/.test(host)
              ? await yandex(u)
              : host === 'music.apple.com'
                ? await apple(u)
                : null;
    if (!meta || (!meta.title && !meta.artist)) return json({ error: 'не нашёл песню по ссылке' }, 404);
    return json(meta, 200, 'public, max-age=86400');
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 502);
  }
}

interface Meta {
  artist: string;
  title: string;
}

async function page(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ru,en;q=0.8' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`сервис ответил ${r.status}`);
  return r.text();
}

const metaTag = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`<meta[^>]+(?:property|name)="${name}"[^>]+content="([^"]*)"`, 'g'))].map((m) => decode(m[1]));

async function spotify(u: URL): Promise<Meta | null> {
  const m = u.pathname.match(/(track|album)\/([A-Za-z0-9]+)/);
  if (!m) return null;
  const html = await page(`https://open.spotify.com/${m[1]}/${m[2]}`);
  const title = metaTag(html, 'og:title')[0] ?? '';
  let artists = metaTag(html, 'music:musician_description');
  if (!artists.length) artists = [(metaTag(html, 'og:description')[0] ?? '').split(' · ')[0]];
  return { title, artist: artists.filter(Boolean).join(', ') };
}

async function youtube(u: URL): Promise<Meta | null> {
  const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u.href.replace('music.youtube.com', 'www.youtube.com'))}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const d = (await r.json()) as { title?: string; author_name?: string };
  return splitVideoTitle(d.title ?? '', d.author_name ?? '');
}

/** «Artist - Title (Official Video)» → { artist, title }; канал «Artist - Topic» / «ArtistVEVO» — тоже исполнитель. */
function splitVideoTitle(rawTitle: string, channel: string): Meta {
  const clean = rawTitle
    .replace(/\s*[([](official|music|lyric|lyrics|audio|video|visuali[sz]er|hd|hq|4k|remaster|clip|клип|премьера|mv)[^)\]]*[)\]]/gi, '')
    .replace(/\s*\|.*$/, '')
    .trim();
  const parts = clean.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: channel.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim(), title: clean };
}

async function soundcloud(u: URL): Promise<Meta | null> {
  const r = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(u.href)}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const d = (await r.json()) as { title?: string; author_name?: string };
  const t = d.title ?? '';
  const i = t.lastIndexOf(' by ');
  return i > 0 ? { title: t.slice(0, i), artist: t.slice(i + 4) } : { title: t, artist: d.author_name ?? '' };
}

async function yandex(u: URL): Promise<Meta | null> {
  const id = u.pathname.match(/track\/(\d+)/)?.[1];
  if (!id) return null;
  const r = await fetch(`https://api.music.yandex.net/tracks/${id}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const d = (await r.json()) as { result?: { title?: string; artists?: { name?: string }[] }[] };
  const t = d.result?.[0];
  if (!t) return null;
  return { title: t.title ?? '', artist: (t.artists ?? []).map((a) => a.name).filter(Boolean).join(', ') };
}

async function apple(u: URL): Promise<Meta | null> {
  const html = await page(u.href);
  // og:title: «Song by Artist on Apple Music» / «Песня — Исполнитель — Apple Music»
  const og = (metaTag(html, 'og:title')[0] ?? '').replace(/\s+(on|в)\s+Apple\s+Music$/i, '').replace(/\s+[-–—]\s+Apple\s+Music$/i, '');
  const by = og.lastIndexOf(' by ');
  if (by > 0) return { title: og.slice(0, by), artist: og.slice(by + 4) };
  const parts = og.split(/\s+[-–—]\s+/);
  return parts.length >= 2 ? { title: parts[0], artist: parts[1] } : { title: og, artist: '' };
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function json(data: unknown, status = 200, cache?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
  if (cache) headers['cache-control'] = cache;
  return new Response(JSON.stringify(data), { status, headers });
}
