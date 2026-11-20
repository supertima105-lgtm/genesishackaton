import { analyzeAudio, type AudioAnalysis } from './analysis/audio';
import { analyzePhotos, decodeImage, resizeToJpeg, toBase64Jpeg } from './analysis/photo';
import { analyzeRemote, analyzeTextHeuristic, type AnalyzeResponse } from './analysis/text';
import { clamp } from './color';
import { parseMusicLink } from './embed';
import { lookupSong } from './songMeta';
import { folderName, folderPath } from './folder';
import { buildStyle } from './rules/engine';
import { MODES } from './rules/modes';
import { store } from './storage';
import { synthesize } from './tts';
import type { Axes, DayRecord, FileRef, MusicSignals, PhotoSignals, TextSignals, WeatherSignals } from './types';
import { fetchWeather, getPosition, weatherShort } from './weather';

export interface NewDayInput {
  text: string;
  date: string;
  photos: File[];
  artist: string;
  title: string;
  link?: string;
  audio?: File;
  withWeather?: boolean;
}

export type StepStatus = 'run' | 'done' | 'skip' | 'error';
export interface Step {
  id: string;
  label: string;
  detail?: string;
  status: StepStatus;
  swatches?: string[];
}

type Report = (s: Step) => void;

/** Папка дня в хранилище: «2026-11-19_osenniy-park_ab12cd» — первый сегмент пути файлов. */
export const baseOf = (day: DayRecord) => day.photos[0]?.path.split('/')[0] ?? day.id;

// ── общие шаги ────────────────────────────────────────────────────

async function stepPhotos(sources: Blob[], report: Report): Promise<{ photo: PhotoSignals; small: { mime: string; data: string }[] }> {
  report({ id: 'photo', label: 'Смотрю на фото', status: 'run' });
  const bmps = await Promise.all(sources.map(decodeImage));
  const photo = analyzePhotos(bmps);
  const small = bmps.slice(0, 4).map((b) => ({ mime: 'image/jpeg', data: toBase64Jpeg(b) }));
  bmps.forEach((b) => b.close?.());
  report({
    id: 'photo',
    label: 'Смотрю на фото',
    status: 'done',
    detail: `${sources.length} фото · тёплых оттенков ${Math.round(photo.warmth * 100)}% · светлота ${Math.round(photo.luma * 100)}%`,
    swatches: photo.palette,
  });
  return { photo, small };
}

async function stepWeather(date: string, report: Report): Promise<WeatherSignals | undefined> {
  report({ id: 'weather', label: 'Узнаю погоду этого дня', status: 'run' });
  try {
    const { lat, lon } = await getPosition();
    const w = await fetchWeather(date, lat, lon);
    if (!w) throw new Error('нет данных за эту дату');
    report({ id: 'weather', label: 'Узнаю погоду этого дня', status: 'done', detail: `${weatherShort(w)} · Open-Meteo` });
    return w;
  } catch (e) {
    report({ id: 'weather', label: 'Погода', status: 'skip', detail: (e as Error).message });
    return undefined;
  }
}

async function stepText(
  text: string,
  date: string,
  small: { mime: string; data: string }[],
  song: { artist: string; title: string; hasAudio: boolean },
  report: Report,
) {
  report({ id: 'text', label: 'Читаю запись', status: 'run', detail: 'Gemini смотрит на текст, фото и песню…' });
  const remote = await analyzeRemote({ text, date, photos: small, song });
  const signals: TextSignals = remote ? sanitizeText(remote.text) : analyzeTextHeuristic(text, date);
  report({
    id: 'text',
    label: 'Читаю запись',
    status: 'done',
    detail: `${signals.moodWords.join(', ')} · «${signals.title}»${remote ? '' : ' · эвристика (Gemini недоступен)'}`,
  });
  return { remote, text: signals };
}

function reportStyle(style: DayRecord['style'], report: Report) {
  report({
    id: 'style',
    label: 'Подбираю почерк страницы',
    status: 'done',
    detail: `${MODES[style.mode].name} + ${MODES[style.secondary].name} · ${style.motion.beatsPerShot} долей на кадр`,
    swatches: [style.palette.paper, style.palette.accent, style.palette.ink, ...style.palette.shades.slice(0, 3)],
  });
}

async function stepVoice(day: DayRecord, report: Report) {
  report({ id: 'voice', label: `Озвучиваю: ${day.style.voice.label}`, status: 'run' });
  const voice = await synthesize(day.text, day.style.voice);
  if (voice) {
    day.voice = await store.putFile(`${baseOf(day)}/voice.wav`, voice);
    await store.save(day);
    report({ id: 'voice', label: `Озвучиваю: ${day.style.voice.label}`, status: 'done', detail: `голос ${day.style.voice.name}` });
  } else {
    report({ id: 'voice', label: `Озвучка: ${day.style.voice.label}`, status: 'skip', detail: 'будет голос браузера с тем же темпом' });
  }
}

// ── новый день ────────────────────────────────────────────────────

export async function createDay(input: NewDayInput, report: Report): Promise<DayRecord> {
  const { photo, small } = await stepPhotos(input.photos, report);

  let audio: AudioAnalysis | null = null;
  if (input.audio) {
    report({ id: 'music', label: 'Слушаю песню', status: 'run' });
    try {
      audio = await analyzeAudio(input.audio);
      report({
        id: 'music',
        label: 'Слушаю песню',
        status: 'done',
        detail: `${Math.round(audio.music.bpm)} BPM · ${audio.music.key} · энергия ${audio.music.energy.toFixed(2)} · фрагмент ${Math.round(audio.excerptDuration)} с`,
      });
    } catch (e) {
      report({ id: 'music', label: 'Слушаю песню', status: 'error', detail: `не удалось разобрать файл: ${(e as Error).message}` });
    }
  }

  const weather = input.withWeather ? await stepWeather(input.date, report) : undefined;
  const { remote, text } = await stepText(input.text, input.date, small, { artist: input.artist, title: input.title, hasAudio: Boolean(audio) }, report);

  const music: MusicSignals = audio
    ? { ...audio.music, genre: remote?.music.genre, era: remote?.music.era }
    : remote
      ? sanitizeMusic(remote.music)
      : { bpm: 96, beatOffset: 0, energy: 0.45, brightness: 0.5, mode: text.valence >= 0 ? 'major' : 'minor', source: 'estimated' };
  if (!audio) {
    report({
      id: 'music',
      label: 'Слушаю песню',
      status: remote ? 'done' : 'skip',
      detail: remote
        ? `по описанию песни: ~${Math.round(music.bpm)} BPM, ${music.mode === 'major' ? 'мажор' : 'минор'}, ${music.genre ?? ''} ${music.era ?? ''}`
        : 'файла нет, Gemini недоступен — средний темп',
    });
  }

  const id = crypto.randomUUID();
  const { axes, style, reasons } = buildStyle(text, photo, music, id, weather);
  reportStyle(style, report);

  const folder = folderName(input.date, text.title);
  const base = folderPath(input.date, text.title, id);
  report({ id: 'save', label: `Сохраняю в папку «${folder}»`, status: 'run' });
  const photos: FileRef[] = [];
  for (let i = 0; i < input.photos.length; i++) {
    const bmp = await decodeImage(input.photos[i]);
    photos.push(await store.putFile(`${base}/photo-${i + 1}.jpg`, await resizeToJpeg(bmp)));
    bmp.close?.();
  }
  const songFile = audio ? await store.putFile(`${base}/song-excerpt.wav`, audio.excerpt) : undefined;

  const day: DayRecord = {
    id,
    folder,
    title: text.title,
    date: input.date,
    createdAt: new Date().toISOString(),
    text: input.text,
    photos,
    song: {
      artist: input.artist,
      title: input.title,
      link: input.link ? parseMusicLink(input.link) : undefined,
      checked: Boolean(input.link),
      excerptStart: audio?.excerptStart,
      excerptDuration: audio?.excerptDuration,
    },
    songFile,
    signals: { text, photo, music, weather },
    axes,
    style,
    reasons,
    version: 1,
  };
  await store.save(day);
  report({ id: 'save', label: `Сохраняю в папку «${folder}»`, status: 'done' });

  await stepVoice(day, report);
  return day;
}

// ── пересборка существующего дня (новые правила / Gemini), файлы те же ──

export async function rebuildDay(old: DayRecord, report: Report): Promise<DayRecord> {
  const blobs = await Promise.all(old.photos.map((r) => store.fileBlob(r)));
  const { photo, small } = await stepPhotos(blobs, report);
  // имя песни — заново по ссылке (исправляет «не знаю — не знаю» у старых записей)
  const found = old.song.link?.url && !old.song.checked ? await lookupSong(old.song.link.url) : null;
  const song = found ? { ...old.song, artist: found.artist || old.song.artist, title: found.title || old.song.title, checked: true } : old.song;
  const { remote, text } = await stepText(old.text, old.date, small, { artist: song.artist, title: song.title, hasAudio: Boolean(old.songFile) }, report);
  if (old.titleEdited) text.title = old.title;

  const prev = old.signals.music;
  const music: MusicSignals =
    prev.source === 'audio'
      ? { ...prev, genre: remote?.music.genre ?? prev.genre, era: remote?.music.era ?? prev.era }
      : remote
        ? sanitizeMusic(remote.music)
        : prev;
  const weather = old.signals.weather;
  const { axes, style, reasons } = buildStyle(text, photo, music, old.id, weather, old.axesOverride);
  reportStyle(style, report);

  const day: DayRecord = {
    ...old,
    title: text.title,
    folder: folderName(old.date, text.title),
    song,
    signals: { text, photo, music, weather },
    axes,
    style,
    reasons,
    cover: undefined, // обложка переснимется при следующем открытии
    video: undefined,
  };
  await store.save(day);
  report({ id: 'save', label: `Папка «${day.folder}» обновлена`, status: 'done' });
  await stepVoice(day, report);
  return day;
}

// ── «не так ощущалось»: ручные оси, без сети ──────────────────────

/** Страница дня с другими осями — мгновенно, для живого предпросмотра. */
export function restyle(day: DayRecord, override: Partial<Axes>): DayRecord {
  const { text, photo, music, weather } = day.signals;
  const built = buildStyle(text, photo, music, day.id, weather, override);
  return { ...day, ...built, axesOverride: Object.keys(override).length ? override : undefined };
}

/** Системные оси дня — без ручных поправок (отметка «так решила система» у ползунков). */
export function systemAxes(day: DayRecord): Axes {
  const { text, photo, music, weather } = day.signals;
  return buildStyle(text, photo, music, day.id, weather).axes;
}

export async function retuneDay(old: DayRecord, override: Partial<Axes>, report: Report): Promise<DayRecord> {
  const day: DayRecord = { ...restyle(old, override), cover: undefined, video: undefined };
  await store.save(day);
  report({ id: 'style', label: 'Пересобираю страницу по вашим осям', status: 'done', detail: `${MODES[day.style.mode].name} + ${MODES[day.style.secondary].name}` });
  if (day.style.voice.name !== old.style.voice.name || !old.voice) await stepVoice(day, report);
  return day;
}

function sanitizeText(t: AnalyzeResponse['text']): TextSignals {
  const words = t.title.replace(/[«»"'.]/g, '').trim().split(/\s+/);
  return {
    ...t,
    valence: clamp(Number(t.valence) || 0, -1, 1),
    energy: clamp(Number(t.energy) || 0),
    tension: clamp(Number(t.tension) || 0),
    warmth: clamp(Number(t.warmth) || 0),
    nostalgia: clamp(Number(t.nostalgia) || 0),
    social: clamp(Number(t.social) || 0),
    title: words.slice(0, 7).join(' '),
    images: (t.images ?? []).slice(0, 5),
    moodWords: (t.moodWords ?? []).slice(0, 3),
    source: 'gemini',
  };
}

function sanitizeMusic(m: AnalyzeResponse['music']): MusicSignals {
  return {
    bpm: clamp(Number(m.bpm) || 100, 40, 200),
    beatOffset: 0,
    energy: clamp(Number(m.energy) || 0.5),
    brightness: clamp(Number(m.brightness) || 0.5),
    mode: m.mode === 'minor' ? 'minor' : 'major',
    genre: m.genre,
    era: m.era,
    source: 'estimated',
  };
}
