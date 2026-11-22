import { clamp } from '../color';
import type { Axes, DayRecord, ModeId } from '../types';
import { systemAxesOf } from './engine';

/**
 * Настроение страницы — какое чувство было главным в этот день. От него зависит материал листа:
 * бумага, почерк, чем приколот снимок и что на нём осталось (капли, скобы, конфетти, каракули).
 * Считается из того, что человек написал, плюс сигналы текста, песни и почерк кадра. Ползунки
 * «как ощущалось» сдвигают его: насколько человек поправил ось, настолько меняется вес чувств.
 */
export type EmotionId = 'joy' | 'love' | 'calm' | 'sad' | 'tense' | 'nostalgia' | 'wonder' | 'routine';

export interface DayEmotion {
  id: EmotionId;
  /** 0.35..1 — сколько деталей (капель, складок, конфетти) лежит на листе */
  intensity: number;
  /** слова из записи, по которым это видно — для объяснения */
  cues: string[];
  /** в записи есть злость: к тревоге добавляется красная черта */
  anger: boolean;
}

/** font — чем написано название, caption — подпись (null: остаётся шрифт почерка кадра). */
export const EMOTIONS: Record<EmotionId, { name: string; material: string; font: string; caption: string | null; why: string }> = {
  joy: {
    name: 'радость',
    material: 'глянцевый отпечаток, конфетти из дырокола, цветной скотч, буквы прыгают',
    font: 'Pangolin — круглый маркер, буквы подпрыгивают',
    caption: 'от руки (Caveat)',
    why: 'Радость шумная и яркая — страница как после праздника: блестит, а по ней рассыпаны кружочки из дырокола.',
  },
  love: {
    name: 'нежность',
    material: 'акварельная бумага цвета румянца, розовый скотч, капля краски, сердечко карандашом',
    font: 'Marck Script — плавная пропись цветом дня',
    caption: 'курсив (Cormorant Garamond)',
    why: 'Нежность хрупкая и тёплая: мягкая бумага, плавная пропись и цвет, который растёкся сам.',
  },
  calm: {
    name: 'покой',
    material: 'плотная матовая бумага, тонкая рамка карандашом, много воздуха, кнопка',
    font: 'Cormorant Garamond — ровная книжная антиква',
    caption: null,
    why: 'Покой — это пустота вокруг: ничего лишнего, ровные буквы и тихий карандашный контур.',
  },
  sad: {
    name: 'грусть',
    material: 'тонкая серая бумага, чернила поплыли от капель, буквы клонятся вниз, прозрачный скотч',
    font: 'Bad Script — тонкий почерк, бледные чернила, строка клонится вниз',
    caption: 'бледный курсив (Cormorant Garamond)',
    why: 'Грусть оставляет следы воды: капля размыла букву и потекла вниз, бумага сохнет волной, почерк становится тоньше.',
  },
  tense: {
    name: 'тревога',
    material: 'смятая бумага, скобы степлера, буквы скачут от нажима, дата обведена красной ручкой',
    font: 'Underdog — неровные буквы с двойным нажимом',
    caption: 'машинопись (JetBrains Mono)',
    why: 'Тревожный день сжимают в кулаке: лист мнётся, почерк дрожит, дата обведена, будто срок уже горит.',
  },
  nostalgia: {
    name: 'ностальгия',
    material: 'пожелтевшая бумага с пятнами времени, фигурный край снимка, уголки альбома, латунная кнопка',
    font: 'Old Standard TT — курсив старой книги, коричневые чернила',
    caption: 'старая антиква (Old Standard TT)',
    why: 'Так выглядят снимки из семейного альбома: фигурные ножницы, уголки, бумага, пожелтевшая от лет.',
  },
  wonder: {
    name: 'восторг',
    material: 'лист из путевого скетчбука: дырочки пружины, брызги краски, крафтовый скотч',
    font: 'Amatic SC — высокие узкие буквы, как на ветру',
    caption: 'от руки (Caveat)',
    why: 'Восторг записывают на бегу: лист вырван из дорожного блокнота, краска брызнула, буквы высокие, как ветер.',
  },
  routine: {
    name: 'будни',
    material: 'тетрадь в клетку, синяя шариковая ручка, каракули на полях, скрепка',
    font: 'Caveat синей шариковой ручкой',
    caption: 'шариковая ручка (Caveat)',
    why: 'Обычный день пишется в обычной тетради: клетка, поля, ручка и то, что рисуешь, когда скучно.',
  },
};

/** Слова записи → настроение. Основа слова, вес; слева — граница слова, «не …» перед ним гасит его. */
type Cue = [string, number?];
const CUES: Record<EmotionId, Cue[]> = {
  joy: [
    ['счаст'], ['рад(?:а|ы)?(?![а-я])'], ['радост'], ['радова'], ['весел'], ['смея'], ['смех'], ['смешн'], ['ржал'], ['угар'], ['кайф'],
    ['праздн'], ['ура(?![а-я])'], ['круто'], ['клас?сн'], ['офиген'], ['охуен'], ['ахуен'], ['заебис'], ['пиздат'], ['улыб'], ['танц'],
    ['вечерин'], ['тусов'], ['день рожд'], ['днюх'], ['подар'], ['побед'], ['выиграл'], ['прикол'], ['шутил'], ['супер'], ['лучший день'],
    ['повезло'], ['играли', 0.6], ['играл', 0.4], ['друз', 0.5], ['компани', 0.5],
  ],
  love: [
    ['любл'], ['любим'], ['любов'], ['нежн'], ['обним'], ['обнима'], ['поцел'], ['целовал'], ['свидан'], ['влюб'], ['родн', 0.6], ['забот'],
    ['вместе', 0.6], ['уют'], ['какао'], ['плед'], ['тепл', 0.5], ['мам', 0.6], ['девушк', 0.7], ['парн', 0.4], ['скучаю по', 0.7], ['милый'], ['милая'],
  ],
  calm: [
    ['спокойн'], ['тих'], ['тишин'], ['умиротвор'], ['медленн'], ['неспеш'], ['отдыха'], ['отдохн'], ['выспал'], ['чай', 0.6], ['книг', 0.7],
    ['читал', 0.7], ['гулял', 0.7], ['прогулк', 0.7], ['дышал'], ['расслаб'], ['хорошо', 0.4], ['лес', 0.4], ['парк', 0.4],
  ],
  sad: [
    ['груст'], ['грущ'], ['печал'], ['тоск'], ['одинок'], ['одиноч'], ['плак'], ['плач'], ['слез'], ['больно'], ['болит'], ['болел'], ['болею'],
    ['обид'], ['пусто(?![а-я])'], ['пустот'], ['тяжел'], ['разочар'], ['потерял'], ['потеря'], ['скучаю', 0.6], ['жаль'], ['никому'], ['никто', 0.6], ['расстал'],
    ['бросил'], ['похорон'], ['умер'], ['смерт'], ['хуево'], ['хуев'], ['херово'], ['хреново'], ['паршив'], ['депрес'], ['апат'], ['уныл'], ['безнад'],
    ['дожд', 0.3],
  ],
  tense: [
    ['дедлайн'], ['сдач'], ['срочн'], ['нерв'], ['стресс'], ['не успева'], ['не успел'], ['экзамен'], ['контрольн'], ['сесси'], ['ссор'], ['поругал'],
    ['скандал'], ['тревог'], ['тревожн'], ['паник'], ['бессон'], ['не спал'], ['напряж'], ['страх'], ['страшн'], ['боюсь'], ['боял'], ['ужас'],
    ['злю'], ['злит'], ['злост'], ['злой'], ['зол(?![а-я])'], ['бесит'], ['бесил'], ['раздраж'], ['ненавиж'], ['орал'], ['наорал'], ['конфликт'], ['заеба'],
    ['достал'], ['кошмар'], ['волну'], ['пережива'], ['аврал'], ['жесть', 0.6], ['пиздец', 0.6],
  ],
  nostalgia: [
    ['вспомн'], ['вспомина'], ['детств'], ['как раньше'], ['давно'], ['альбом'], ['школ', 0.6], ['лет назад'], ['помню'], ['выпускн'], ['старые фото'],
    ['дедушк'], ['бабушк'], ['дач', 0.6], ['родител', 0.6], ['когда-то'], ['ностальг'], ['пересматрива'], ['кассет'], ['винил'], ['пластинк'],
    ['однокласс'], ['однокурс'], ['старый друг'],
  ],
  wonder: [
    ['вау'], ['восторг'], ['впервые'], ['первый раз'], ['море'], ['моря'], ['горы'], ['в горах'], ['горн'], ['свобод'], ['путешеств'], ['полет'],
    ['летел'], ['самолет'], ['закат'], ['рассвет'], ['звезд'], ['океан'], ['невероятн'], ['мечт'], ['поездк'], ['поход'], ['вершин'], ['простор'],
    ['ветер', 0.6], ['красот'], ['потрясающ'], ['волшебн'], ['чудо'], ['водопад'], ['сияни'],
  ],
  routine: [
    ['ничего не дела'], ['нихуя'], ['нихера'], ['ничего особенного'], ['обычн'], ['как всегда'], ['как обычно'], ['скучн'], ['скука'], ['лень'],
    ['ленил'], ['рутин'], ['работ', 0.6], ['учеб'], ['урок', 0.6], ['пары', 0.6], ['домашк'], ['сидел', 0.5], ['валял'], ['залип'], ['сериал'],
    ['скролл'], ['тикток'], ['ютуб'], ['устал'], ['проспал'], ['норм(?![а-я])'], ['нормально'], ['так себе'], ['день как день'], ['офис', 0.6],
  ],
};

const ANGER = /(?<![а-я])(зл[оюиа]|бесит|бесил|раздраж|ненавиж|орал|наорал|ссор|поругал|скандал|заеба)/;

const LEFT = '(?<![а-я])';
const COMPILED = (Object.keys(CUES) as EmotionId[]).map((id) => ({
  id,
  cues: CUES[id].map(([stem, w = 1]) => ({ re: new RegExp(LEFT + stem + '[а-я]*', 'g'), w })),
}));

/** Почерк кадра тоже кое-что знает о настроении: сепия — память, экспрессия — тревога. */
const MODE_HINT: Partial<Record<ModeId, Partial<Record<EmotionId, number>>>> = {
  impression: { calm: 0.35 },
  watercolor: { love: 0.4 },
  impasto: { wonder: 0.4 },
  turner: { wonder: 0.3 },
  film: { nostalgia: 0.35 },
  sepia: { nostalgia: 0.45 },
  ma: { sad: 0.25, calm: 0.2 },
  cyanotype: { calm: 0.25, sad: 0.15 },
  nocturne: { calm: 0.15, sad: 0.1 },
  hopper: { routine: 0.3, sad: 0.15 },
  kandinsky: { tense: 0.45 },
  collage: { joy: 0.45 },
};

/** Чего какая ось добавляет каждому чувству. Сравниваются ощущение человека и решение системы. */
function axisPull(a: Axes): Record<EmotionId, number> {
  const pos = Math.max(0, a.valence);
  const neg = Math.max(0, -a.valence);
  return {
    joy: 1.3 * pos + 0.55 * a.social + 0.35 * a.pace,
    love: 1.1 * pos * a.temperature + 0.7 * a.temperature - 0.4 * a.tension,
    calm: 1.2 * (1 - a.tension) * (1 - a.pace),
    sad: 1.7 * neg + 0.45 * (1 - a.social) * (1 - a.temperature),
    tense: 1.6 * a.tension + 0.3 * a.pace,
    nostalgia: 1.7 * a.nostalgia,
    wonder: 1.2 * a.nature + 0.5 * pos * a.pace,
    routine: 0.7 * (1 - a.nature) * (1 - Math.abs(a.valence)) * (1 - a.nostalgia),
  };
}
const PULL = 2.6;

const cache = new Map<string, DayEmotion>();

export function emotionOf(day: DayRecord): DayEmotion {
  const t = day.signals?.text;
  const ov = day.axesOverride && Object.keys(day.axesOverride).length ? day.axesOverride : undefined;
  const key = `${day.id}|${day.style.mode}|${day.text}|${t?.source}|${t?.valence}|${t?.tension}|${ov ? JSON.stringify(ov) : ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // Gemini даёт осмысленные слова настроения и образы; эвристические — пересказ тех же чисел, их не считаем дважды
  const extra = t?.source === 'gemini' ? [...(t.moodWords ?? []), ...(t.images ?? [])].join(' ') : '';
  const text = ' ' + `${day.text ?? ''} ${extra}`.toLowerCase().replace(/ё/g, 'е') + ' ';

  const score = {} as Record<EmotionId, number>;
  const found = {} as Record<EmotionId, string[]>;
  for (const { id, cues } of COMPILED) {
    let s = 0;
    const words: string[] = [];
    for (const { re, w } of cues) {
      re.lastIndex = 0;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(text))) {
        // «не грустно», «ни разу не страшно» — не считаем
        if (/(?:^|\s)н[еи]\s+$/.test(text.slice(Math.max(0, mm.index - 4), mm.index)) && !mm[0].startsWith('не ')) continue;
        s += w;
        if (words.length < 4 && !words.includes(mm[0].trim())) words.push(mm[0].trim());
      }
    }
    score[id] = Math.min(3, s);
    found[id] = words;
  }

  const v = t?.valence ?? 0;
  const energy = t?.energy ?? 0;
  const tension = t?.tension ?? 0;
  const warmth = t?.warmth ?? 0.4;
  const m = day.signals?.music;
  const eraOld = m?.era ? clamp((2008 - m.era) / 45) : 0;
  const outdoors = t?.setting === 'nature' || t?.setting === 'water' || t?.setting === 'road';

  score.joy += 0.9 * Math.max(0, v) + 0.45 * energy + 0.25 * (t?.social ?? 0) + (m?.mode === 'major' ? 0.08 : 0);
  score.love += 0.6 * Math.max(0, v) * warmth + 0.2 * warmth - 0.4 * tension;
  score.calm += 0.35 * (1 - tension) * (1 - energy) + 0.15;
  score.sad += 1.1 * Math.max(0, -v) + (m?.mode === 'minor' ? 0.12 : 0);
  score.tense += 1.2 * tension + (t?.timeOfDay === 'night' && tension > 0.4 ? 0.15 : 0);
  score.nostalgia += 1.1 * (t?.nostalgia ?? 0) + 0.3 * eraOld;
  score.wonder += (outdoors ? 0.25 : 0) + 0.35 * Math.max(0, v) * energy;
  score.routine += 0.12;
  for (const [id, k] of Object.entries(MODE_HINT[day.style.mode] ?? {})) score[id as EmotionId] += k;

  // передвинутые кружки: разница между ощущением человека и решением системы
  if (ov && day.signals) {
    const sys = systemAxesOf(day.signals.text, day.signals.photo, day.signals.music);
    const felt: Axes = { ...sys };
    for (const k of Object.keys(ov) as (keyof Axes)[]) if (typeof ov[k] === 'number') felt[k] = ov[k] as number;
    const a = axisPull(felt);
    const b = axisPull(sys);
    for (const id of Object.keys(score) as EmotionId[]) score[id] = Math.max(0, score[id] + PULL * (a[id] - b[id]));
  }

  const ranked = (Object.keys(score) as EmotionId[]).sort((a, b) => score[b] - score[a]);
  const id = ranked[0];
  const res: DayEmotion = {
    id,
    intensity: clamp(0.3 + score[id] / 2.6 + (score[id] - score[ranked[1]]) * 0.15, 0.35, 1),
    cues: found[id],
    anger: id === 'tense' && ANGER.test(text),
  };
  cache.set(key, res);
  return res;
}
