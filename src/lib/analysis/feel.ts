import { clamp } from '../color';
import type { DayFeel, DayRecord, FeelAxes } from '../types';

/** Второй слой ощущений дня — подписи концов шкалы. */
export const FEEL_AXES: { key: keyof FeelAxes; left: string; right: string }[] = [
  { key: 'love', left: 'равнодушие', right: 'любовь' },
  { key: 'freedom', left: 'скованность', right: 'свобода' },
  { key: 'wonder', left: 'обыденность', right: 'восторг' },
  { key: 'gratitude', left: 'досада', right: 'благодарность' },
  { key: 'hope', left: 'безнадёжность', right: 'надежда' },
  { key: 'play', left: 'всерьёз', right: 'игриво' },
  { key: 'vigor', left: 'усталость', right: 'бодрость' },
  { key: 'novelty', left: 'рутина', right: 'впервые' },
  { key: 'meaning', left: 'обычный', right: 'особенный' },
  { key: 'loudness', left: 'тишина', right: 'шум' },
  { key: 'light', left: 'темно', right: 'светло' },
];

/** Мгновенная оценка без сети — показывается сразу, пока Gemini думает. */
export const quickFeel = (day: DayRecord): DayFeel => {
  const f = feelHeuristic(day);
  return { system: f, axes: f, source: 'heuristic' };
};

/** Считает оси: Gemini по тексту, без него — эвристика по словам и уже измеренным сигналам дня. */
export async function computeFeel(day: DayRecord): Promise<DayFeel> {
  const local = feelHeuristic(day);
  const remote = await feelRemote(day);
  if (!remote) return { system: local, axes: local, source: 'heuristic' };
  // свет — наполовину по самим фото: его система видит, а не угадывает
  const system: FeelAxes = { ...remote, light: clamp(remote.light * 0.5 + local.light * 0.5) };
  return { system, axes: system, source: 'gemini' };
}

async function feelRemote(day: DayRecord): Promise<FeelAxes | null> {
  if (import.meta.env.MODE === 'standalone') return null;
  try {
    const r = await fetch('/api/feel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: day.text, song: { artist: day.song.artist, title: day.song.title } }),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as Record<string, number>;
    const out = {} as FeelAxes;
    for (const { key } of FEEL_AXES) {
      if (!Number.isFinite(d[key])) return null;
      out[key] = clamp(d[key]);
    }
    return out;
  } catch {
    return null;
  }
}

const LEX: Record<Exclude<keyof FeelAxes, 'light'>, { up: string[]; down?: string[] }> = {
  love: {
    up: ['любл', 'любов', 'влюб', 'нежн', 'обнима', 'поцел', 'сердц', 'родн', 'мил', 'скучаю по', 'близк', 'девушк', 'парн', 'мам', 'бабушк'],
    down: ['равнодуш', 'всё равно', 'безразлич', 'одино'],
  },
  freedom: {
    up: ['свобод', 'ветер', 'простор', 'море', 'гор', 'поездк', 'путешеств', 'выходн', 'отпуск', 'каникул', 'сбежал', 'наконец', 'дорог', 'гуля'],
    down: ['дедлайн', 'обязан', 'надо было', 'заставил', 'офис', 'экзамен', 'не мог'],
  },
  wonder: {
    up: ['впервые', 'удив', 'восторг', 'невероятн', 'чудо', 'волшеб', 'красив', 'звёзд', 'звезд', 'закат', 'вау', 'поразил', 'потрясающ', 'нереальн'],
  },
  gratitude: {
    up: ['спасибо', 'благодар', 'повезло', 'ценю', 'подарил', 'подарок', 'помог', 'рад, что', 'рада, что', 'счастлив'],
    down: ['обид', 'досад', 'бесит', 'злю', 'раздраж'],
  },
  hope: {
    up: ['надежд', 'мечта', 'план', 'скоро', 'будущ', 'верю', 'получится', 'начало', 'новый', 'жду', 'впереди'],
    down: ['безнадёж', 'безнадеж', 'бессмысл', 'ничего не получ', 'зачем'],
  },
  play: {
    up: ['смеял', 'смех', 'шутк', 'шутил', 'игра', 'гейм', 'дурачил', 'танц', 'весел', 'прикол', 'ржал', 'угар'],
  },
  vigor: {
    up: ['бодр', 'энерги', 'бега', 'спорт', 'танц', 'выспал', 'полон сил', 'полна сил'],
    down: ['устал', 'сонн', 'не спал', 'вымотал', 'без сил', 'лень', 'бессон'],
  },
  novelty: {
    up: ['впервые', 'первый раз', 'новый', 'новое', 'новую', 'незнаком', 'открыл для себя', 'никогда не', 'попробовал', 'попробовала'],
    down: ['как всегда', 'как обычно', 'опять', 'снова', 'рутин', 'каждый день'],
  },
  meaning: {
    up: ['день рожд', 'свадьб', 'выпускн', 'праздн', 'годовщ', 'особенн', 'запомн', 'навсегда', 'важн', 'никогда не забуд', 'лучший день'],
  },
  loudness: {
    up: ['шум', 'громк', 'толп', 'концерт', 'вечерин', 'музык', 'кричал', 'орал', 'танц', 'клуб'],
    down: ['тишин', 'тихо', 'шёпот', 'шепот', 'молча', 'спокойн'],
  },
};

const hits = (t: string, words: string[] = []) => words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);

/** Без сети: слова в тексте + то, что система уже измерила в фото, песне и записи. */
export function feelHeuristic(day: DayRecord): FeelAxes {
  const t = ' ' + day.text.toLowerCase() + ' ';
  const { text, photo, music } = day.signals;
  const { axes } = day;
  const word = (k: keyof typeof LEX) => (hits(t, LEX[k].up) - hits(t, LEX[k].down)) / 3;
  const daylight = text.timeOfDay === 'night' ? 0.15 : text.timeOfDay === 'evening' ? 0.4 : text.timeOfDay === 'morning' ? 0.7 : 0.8;
  return {
    love: clamp(0.3 + word('love') * 0.45 + text.warmth * 0.2 + axes.social * 0.1),
    freedom: clamp(0.45 + word('freedom') * 0.4 + axes.nature * 0.15 - axes.tension * 0.25),
    wonder: clamp(0.3 + word('wonder') * 0.45 + photo.saturation * 0.15 + Math.max(0, axes.valence) * 0.15),
    gratitude: clamp(0.4 + word('gratitude') * 0.45 + axes.valence * 0.2),
    hope: clamp(0.4 + word('hope') * 0.4 + axes.valence * 0.2),
    play: clamp(0.25 + word('play') * 0.45 + axes.pace * 0.15 + Math.max(0, axes.valence) * 0.15),
    vigor: clamp(0.25 + word('vigor') * 0.35 + music.energy * 0.25 + text.energy * 0.25),
    novelty: clamp(0.35 + word('novelty') * 0.5),
    meaning: clamp(0.3 + word('meaning') * 0.45 + Math.abs(axes.valence) * 0.15 + (day.photos.length / 8) * 0.1),
    loudness: clamp(0.2 + word('loudness') * 0.35 + music.energy * 0.2 + text.energy * 0.15 + axes.social * 0.15),
    light: clamp(photo.luma * 0.6 + daylight * 0.4),
  };
}
