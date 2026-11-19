import { clamp } from '../color';
import type { MusicSignals, Season, Setting, TextSignals, TimeOfDay } from '../types';

export interface AnalyzeRequest {
  text: string;
  date: string;
  photos: { mime: string; data: string }[];
  song: { artist: string; title: string; hasAudio: boolean };
}

export interface AnalyzeResponse {
  text: Omit<TextSignals, 'source'>;
  music: Pick<MusicSignals, 'bpm' | 'energy' | 'mode' | 'brightness' | 'genre' | 'era'>;
}

export async function analyzeRemote(req: AnalyzeRequest): Promise<AnalyzeResponse | null> {
  if (import.meta.env.MODE === 'standalone') return null; // офлайн-версия из одного index.html: сервера нет
  try {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!r.ok) return null;
    return (await r.json()) as AnalyzeResponse;
  } catch {
    return null;
  }
}

// ─── Эвристика: работает без ключа API ──────────────────────────────

const LEX = {
  pos: ['счаст', 'рад', 'весел', 'смея', 'смех', 'любл', 'люблю', 'кайф', 'прекрас', 'отлич', 'уют', 'улыб', 'обнима', 'восторг', 'здорово', 'праздн', 'спокойн', 'красив', 'тепло'],
  neg: ['груст', 'плох', 'устал', 'тоск', 'одино', 'плак', 'слез', 'слёз', 'больно', 'злю', 'злост', 'страх', 'тревог', 'обид', 'скучн', 'пусто', 'тяжел', 'тяжёл', 'разочар', 'не спал'],
  energy: ['бега', 'танц', 'быстр', 'спеш', 'концерт', 'вечерин', 'тусов', 'праздн', 'поход', 'спорт', 'шум', 'толп', 'поездк', 'прыга', 'громк', 'кричал'],
  tension: ['дедлайн', 'сдач', 'срочн', 'нерв', 'стресс', 'не успева', 'офис', 'работ', 'экзамен', 'ссор', 'тревог', 'паник', 'бессон', 'ночь без сна', 'энергетик'],
  warmth: ['какао', 'чай', 'плед', 'обнима', 'тепл', 'уют', 'камин', 'свеч', 'мам', 'бабушк', 'дома', 'вместе', 'разговар', 'пирог', 'солнц', 'друз', 'девушк', 'парн'],
  nostalgia: ['вспомн', 'детств', 'как раньше', 'давно', 'стар', 'альбом', 'школ', 'бабушк', 'дедушк', 'лет назад', 'помню', 'скучаю', 'выпускн'],
  social: ['мы ', 'друз', 'девушк', 'парн', 'мам', 'пап', 'семь', 'вместе', 'компан', 'гост', 'толп', 'люд', 'коллег', 'брат', 'сестр'],
};
const TOD: [TimeOfDay, string[]][] = [
  ['night', ['ночь', 'ночью', 'полноч', 'звёзд', 'звезд', 'луна', 'до утра']],
  ['evening', ['вечер', 'закат', 'сумерк', 'садил']],
  ['morning', ['утр', 'рассвет', 'завтрак']],
];
const SEASONS: [Season, string[]][] = [
  ['winter', ['снег', 'зим', 'мороз', 'новый год', 'ёлк', 'елк']],
  ['autumn', ['осен', 'листь', 'листоп', 'жёлт', 'желт', 'октябр', 'сентябр', 'ноябр']],
  ['summer', ['лет', 'жара', 'пляж', 'июл', 'август', 'купа']],
  ['spring', ['весн', 'цвету', 'капел', 'апрел']],
];
const SETTINGS: [Setting, string[]][] = [
  ['water', ['море', 'озер', 'пруд', 'рек', 'пляж', 'набережн']],
  ['nature', ['парк', 'лес', 'гор', 'поле', 'сад', 'природ', 'трав', 'луг']],
  ['road', ['дорог', 'трасс', 'поезд', 'машин', 'самолёт', 'аэропорт', 'путешеств']],
  ['indoor', ['дома', 'офис', 'комнат', 'квартир', 'кухн', 'кровать']],
  ['city', ['город', 'улиц', 'центр', 'метро', 'кафе', 'бар', 'ресторан', 'крыш']],
];
const NOUNS: [string, string][] = [
  ['какао', 'какао'], ['пруд', 'пруд'], ['парк', 'парк'], ['море', 'море'], ['офис', 'офис'], ['кафе', 'кафе'],
  ['дожд', 'дождь'], ['снег', 'снег'], ['листь', 'листья'], ['закат', 'закат'], ['концерт', 'концерт'],
  ['друз', 'друзья'], ['мам', 'мама'], ['чай', 'чай'], ['кофе', 'кофе'], ['звёзд', 'звёзды'], ['звезд', 'звёзды'],
  ['дорог', 'дорога'], ['поезд', 'поезд'], ['лес', 'лес'], ['крыш', 'крыша'], ['кухн', 'кухня'],
  ['дедлайн', 'дедлайн'], ['сдач', 'сдача проекта'], ['озер', 'озеро'], ['гор', 'горы'], ['пляж', 'пляж'],
  ['музык', 'музыка'], ['танц', 'танцы'], ['книг', 'книга'], ['кино', 'кино'], ['набережн', 'набережная'],
  ['пирог', 'пирог'], ['бабушк', 'бабушка'], [' дач', 'дача'], ['альбом', 'старый альбом'], ['семь', 'семья'],
  ['термос', 'термос'], ['скамейк', 'скамейка'], ['фонар', 'фонари'], ['день рожд', 'день рождения'],
];
const SEASON_ADJ: Record<Season, [string, string]> = {
  winter: ['зимним', 'зимней'],
  spring: ['весенним', 'весенней'],
  summer: ['летним', 'летней'],
  autumn: ['осенним', 'осенней'],
};
const TOD_WORD: Record<TimeOfDay, string> = { morning: 'утром', day: 'днём', evening: 'вечером', night: 'ночью' };

const count = (t: string, words: string[]) => words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
const first = <T,>(t: string, list: [T, string[]][], fallback: T): T => {
  let best = fallback;
  let bc = 0;
  for (const [k, ws] of list) {
    const c = count(t, ws);
    if (c > bc) {
      bc = c;
      best = k;
    }
  }
  return best;
};

function seasonFromDate(date: string): Season {
  const m = new Date(date).getMonth();
  return m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
}

export function analyzeTextHeuristic(raw: string, date: string): TextSignals {
  const t = ' ' + raw.toLowerCase().replace(/ё/g, 'е') + ' ';
  const tt = ' ' + raw.toLowerCase() + ' ';
  const pos = count(t, LEX.pos);
  const neg = count(t, LEX.neg);
  const valence = Math.tanh((pos - neg) / 2);
  const energy = clamp(count(t, LEX.energy) / 3);
  const tension = clamp(count(t, LEX.tension) / 3);
  const warmth = clamp(0.25 + count(tt, LEX.warmth) / 4);
  const nostalgia = clamp(count(t, LEX.nostalgia) / 3);
  const social = clamp(count(tt, LEX.social) / 3);
  const timeOfDay = first(tt, TOD, 'day');
  const season = first(tt, SEASONS, seasonFromDate(date));
  const setting = first(tt, SETTINGS, 'city');
  // образы в порядке появления в тексте: что человек назвал первым, то и в названии
  const images = [
    ...new Set(
      NOUNS.filter(([s]) => tt.includes(s))
        .sort((x, y) => tt.indexOf(x[0]) - tt.indexOf(y[0]))
        .map(([, n]) => n),
    ),
  ].slice(0, 5);

  const moodWords: string[] = [];
  if (tension > 0.4) moodWords.push('напряжённо');
  else if (energy < 0.35) moodWords.push('спокойно');
  if (warmth > 0.5) moodWords.push('тепло');
  if (valence > 0.3) moodWords.push('светло');
  if (valence < -0.2) moodWords.push('грустно');
  if (nostalgia > 0.3) moodWords.push('ностальгия');
  if (energy > 0.5) moodWords.push('шумно');

  const [a, b] = images;
  const when = timeOfDay === 'night' ? `${SEASON_ADJ[season][1]} ночью` : `${SEASON_ADJ[season][0]} ${TOD_WORD[timeOfDay]}`;
  const head = a ? (b ? `${a} и ${b}` : a) : 'Обычный день';
  const title = cap(`${head} ${when}`);

  const sentence = raw.split(/(?<=[.!?…])\s+/)[0] ?? raw;
  const caption = sentence.split(/\s+/).slice(0, 9).join(' ').replace(/[.,;:]$/, '');

  return {
    valence,
    energy,
    tension,
    warmth,
    nostalgia,
    social,
    timeOfDay,
    season,
    setting,
    images,
    moodWords,
    title,
    caption,
    source: 'heuristic',
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
