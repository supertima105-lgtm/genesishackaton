import type { Axes, ModeId, MusicSignals, ShaderParams, StyleParams, TextSignals, WeatherSignals } from '../types';

/**
 * Художественные режимы дневника. Каждый режим — это не шаблон, а набор параметров
 * одного и того же шейдера и одной и той же вёрстки. Поэтому все дни остаются
 * страницами одного дневника, а меняется только «почерк».
 */
export interface ModeDef {
  id: ModeId;
  name: string;
  reference: string;
  technique: string;
  when: string;
  why: string;
  /** Прототип настроения в пространстве осей — к какому дню режим «подходит лучше всего». */
  prototype: Omit<Axes, 'pace'>;
  /**
   * Чем ещё день притягивает режим, кроме осей: ночь — к ноктюрну, зима и море — к цианотипии,
   * бабушкин альбом — к сепии. Число добавляется к логарифму оценки (0 — без влияния).
   */
  affinity?: (c: ModeContext) => number;
  shader: Required<ShaderParams>;
  motion: Pick<StyleParams['motion'], 'transition' | 'transitionShare' | 'zoom' | 'drift' | 'pulse'>;
  frame: StyleParams['layout']['frame'];
  caption: StyleParams['type']['caption'];
  shapes: StyleParams['shapes']['kind'];
  shapeCount: number;
  /** рваный край кадра: фото впитывается в бумагу */
  edge: number;
}

export interface ModeContext {
  t: TextSignals;
  m: MusicSignals;
  w?: WeatherSignals;
  axes: Axes;
}

const calm = { transition: 'dissolve', transitionShare: 0.4, zoom: 0.04, drift: 0.02, pulse: 0.1 } as const;
const sharp = { transition: 'cut', transitionShare: 0, zoom: 0.02, drift: 0, pulse: 0.5 } as const;

/** Слова записи, по которым видно семейную память: альбом, бабушка, детство. */
const FAMILY = /бабуш|дедуш|\bдед|прадед|родител|мам|пап|семь|детств|альбом|старые фото|фотограф|памят|вспомина|предк|похорон|годовщин/i;
const words = (t: TextSignals) => [...t.images, ...t.moodWords, t.title, t.caption].join(' ');

export const MODES: Record<ModeId, ModeDef> = {
  impression: {
    id: 'impression',
    name: 'Импрессионизм',
    reference: 'Клод Моне, Огюст Ренуар — «Впечатление. Восход солнца», «Стога»',
    technique: 'Фото растворяется в мазках (фильтр Кувахары), мягкое свечение светов, рваный край кадра, рукописная подпись',
    when: 'Спокойный тёплый день, природа или вода, мягкий свет',
    why: 'Импрессионисты писали не предмет, а свет и ощущение от момента. Размытые мазки убирают детали, которые память всё равно теряет, и оставляют атмосферу.',
    prototype: { tension: 0.18, valence: 0.45, temperature: 0.72, nostalgia: 0.4, social: 0.35, nature: 0.95 },
    shader: { painterly: 0.85, grain: 0.12, vignette: 0.22, posterize: 0, duotone: 0, halftone: 0, saturation: 1.08, contrast: 0.92, temperature: 0, halation: 0.35, aberration: 0, fade: 0.12, ripple: 0 },
    motion: calm,
    frame: 'window',
    caption: 'hand',
    shapes: 'strokes',
    shapeCount: 6,
    edge: 1,
  },
  watercolor: {
    id: 'watercolor',
    name: 'Акварель',
    reference: 'Акварели Карла Ларссона «Дом», Поль Сезанн; ботанические этюды',
    technique: 'Краска растекается и бледнеет к краям, мягкие пятна вместо деталей, сквозь цвет просвечивает бумага',
    when: 'Нежный, лёгкий день: любовь, весна, тихая радость, утро',
    why: 'Акварель нельзя переписать — она про хрупкий момент. Прозрачный цвет и белая бумага между пятнами — это лёгкость, которую не хочется потерять.',
    prototype: { tension: 0.12, valence: 0.62, temperature: 0.62, nostalgia: 0.3, social: 0.45, nature: 0.55 },
    shader: { painterly: 0.5, grain: 0.06, vignette: 0, posterize: 0, duotone: 0, halftone: 0, saturation: 1.0, contrast: 0.78, temperature: 0, halation: 0.2, aberration: 0, fade: 0.4, ripple: 0 },
    motion: calm,
    frame: 'window',
    caption: 'hand',
    shapes: 'none',
    shapeCount: 0,
    edge: 1.4,
  },
  impasto: {
    id: 'impasto',
    name: 'Импасто',
    reference: 'Винсент Ван Гог — «Звёздная ночь», «Пшеничное поле с кипарисами»',
    technique: 'Густые мазки, насыщенный цвет, тёплое свечение — кадр будто написан мастихином',
    when: 'Восторг и сила: яркий день на природе, поездка, первый раз, чувство «я живу»',
    why: 'Ван Гог писал не спокойствие, а интенсивность — каждый мазок дрожит. Так запоминаются дни, когда всего слишком много, и это прекрасно.',
    prototype: { tension: 0.62, valence: 0.75, temperature: 0.7, nostalgia: 0.2, social: 0.4, nature: 0.8 },
    shader: { painterly: 1, grain: 0.05, vignette: 0.15, posterize: 0.1, duotone: 0, halftone: 0, saturation: 1.45, contrast: 1.12, temperature: 0, halation: 0.25, aberration: 0, fade: 0, ripple: 0.1 },
    motion: calm,
    frame: 'window',
    caption: 'hand',
    shapes: 'strokes',
    shapeCount: 5,
    edge: 0.5,
  },
  turner: {
    id: 'turner',
    name: 'Стихия',
    reference: 'Уильям Тёрнер — «Дождь, пар и скорость», «Снежная буря»',
    technique: 'Свет растворяет предметы, кадр в дымке и сиянии, края тонут в тумане',
    when: 'Дорога, море, ветер, гроза — день, когда несёт и хочется свободы',
    why: 'Тёрнер писал не пейзаж, а движение воздуха и света. Растворённые формы — это чувство, когда стихия больше тебя и от этого легко.',
    prototype: { tension: 0.5, valence: 0.25, temperature: 0.42, nostalgia: 0.25, social: 0.25, nature: 0.9 },
    affinity: ({ t, w }) =>
      (t.setting === 'road' || t.setting === 'water' ? 0.5 : 0) + (w && (w.kind === 'rain' || w.kind === 'storm' || w.kind === 'fog') ? 0.4 : 0),
    shader: { painterly: 0.6, grain: 0.1, vignette: 0.2, posterize: 0, duotone: 0, halftone: 0, saturation: 0.85, contrast: 0.82, temperature: 0, halation: 0.6, aberration: 0, fade: 0.32, ripple: 0 },
    motion: calm,
    frame: 'window',
    caption: 'serif',
    shapes: 'none',
    shapeCount: 0,
    edge: 1,
  },
  film: {
    id: 'film',
    name: 'Плёнка',
    reference: 'Любительская плёночная фотография 70–90-х, Уильям Эглстон, Нан Голдин',
    technique: 'Крупное зерно, ореол вокруг светов (халация), засветки, выцветшие тени, шрифт пишущей машинки',
    when: 'Ностальгия, люди рядом, лето, песня из прошлых десятилетий',
    why: 'Плёнка — визуальный код «воспоминания»: зерно и засветки мы считываем как «это было давно и это было по-настоящему».',
    prototype: { tension: 0.38, valence: 0.4, temperature: 0.65, nostalgia: 0.9, social: 0.7, nature: 0.45 },
    shader: { painterly: 0.08, grain: 0.55, vignette: 0.42, posterize: 0, duotone: 0, halftone: 0, saturation: 0.95, contrast: 1.05, temperature: 0, halation: 0.55, aberration: 0.12, fade: 0.28, ripple: 0 },
    motion: calm,
    frame: 'band',
    caption: 'mono',
    shapes: 'leaks',
    shapeCount: 3,
    edge: 0,
  },
  sepia: {
    id: 'sepia',
    name: 'Старый альбом',
    reference: 'Семейные фотографии начала XX века, дагерротипия, альбомы с паспарту',
    technique: 'Сепия, мягкая виньетка, выцветшие тени, крупное зерно, маленькая карточка посреди листа',
    when: 'Память о прошлом: семья, бабушки и дедушки, детство, потеря, благодарность',
    why: 'Сепия — цвет времени. Маленькая коричневая карточка говорит «это было давно и это важно» раньше, чем успеваешь прочитать подпись.',
    prototype: { tension: 0.2, valence: 0.05, temperature: 0.6, nostalgia: 1, social: 0.55, nature: 0.3 },
    affinity: ({ t, m }) => (FAMILY.test(words(t)) ? 0.7 : 0) + (m.era && m.era < 1985 ? 0.4 : 0),
    shader: { painterly: 0.1, grain: 0.55, vignette: 0.55, posterize: 0, duotone: 0.85, halftone: 0, saturation: 0.5, contrast: 1, temperature: 0, halation: 0.2, aberration: 0, fade: 0.35, ripple: 0 },
    motion: calm,
    frame: 'small',
    caption: 'serif',
    shapes: 'none',
    shapeCount: 0,
    edge: 0.3,
  },
  ma: {
    id: 'ma',
    name: 'Ма · пустота',
    reference: 'Японская минималистичная графика, суми-э, Кэндзо Такада, принцип «ма» (間)',
    technique: 'Маленькое окно фото, много воздуха, тушевой дуотон, край кадра впитывается в бумагу',
    when: 'Тихий день наедине с собой, грусть или задумчивость, медленная музыка',
    why: '«Ма» — это значимая пауза. Пустота вокруг маленького кадра даёт тишине место на странице: день ощущается как долгий выдох.',
    prototype: { tension: 0.15, valence: -0.3, temperature: 0.32, nostalgia: 0.5, social: 0.05, nature: 0.5 },
    shader: { painterly: 0.22, grain: 0.18, vignette: 0.05, posterize: 0, duotone: 0.5, halftone: 0, saturation: 0.55, contrast: 0.9, temperature: 0, halation: 0.1, aberration: 0, fade: 0.3, ripple: 0 },
    motion: calm,
    frame: 'small',
    caption: 'serif',
    shapes: 'none',
    shapeCount: 0,
    edge: 0.8,
  },
  cyanotype: {
    id: 'cyanotype',
    name: 'Цианотипия',
    reference: 'Анна Аткинс — первые цианотипии водорослей (1843); синька',
    technique: 'Снимок отпечатан берлинской лазурью: только синий и белый, мягкое зерно, неровный край отпечатка',
    when: 'Холодный ясный день: зима, море, снег, ясная голова, спокойная грусть',
    why: 'Цианотипия печатается солнцем и водой. Синий отпечаток — это холод и чистота: воздух прозрачный, мысли тоже.',
    prototype: { tension: 0.25, valence: 0.05, temperature: 0.12, nostalgia: 0.35, social: 0.2, nature: 0.7 },
    affinity: ({ t, w }) => (t.season === 'winter' ? 0.5 : 0) + (t.setting === 'water' ? 0.35 : 0) + (w && (w.kind === 'snow' || w.kind === 'fog') ? 0.5 : 0),
    shader: { painterly: 0.08, grain: 0.22, vignette: 0.12, posterize: 0.08, duotone: 0.95, halftone: 0, saturation: 0.6, contrast: 1.12, temperature: 0, halation: 0, aberration: 0, fade: 0.08, ripple: 0 },
    motion: calm,
    frame: 'offset',
    caption: 'mono',
    shapes: 'none',
    shapeCount: 0,
    edge: 0.6,
  },
  nocturne: {
    id: 'nocturne',
    name: 'Ноктюрн',
    reference: 'Джеймс Уистлер — «Ноктюрны»; ночные улицы Константина Коровина',
    technique: 'Тёмная бумага и светлые чернила, ореолы вокруг огней, глубокая синяя тень',
    when: 'Ночь: прогулка по огням, разговор до утра, тихий город, бессонница',
    why: 'Уистлер писал ночь как музыку — без деталей, одними огнями и синевой. Ночью мир сужается до светящихся точек, и страница темнеет вместе с ним.',
    prototype: { tension: 0.4, valence: 0.05, temperature: 0.3, nostalgia: 0.45, social: 0.35, nature: 0.25 },
    // тревожная бессонная ночь — это уже экспрессия, а не тихий ноктюрн
    affinity: ({ t, axes }) =>
      (t.timeOfDay === 'night' ? 1.4 - 2.5 * Math.max(0, axes.tension - 0.55) : t.timeOfDay === 'evening' ? 0.3 : -0.8) + (t.light === 'neon' || t.light === 'low' ? 0.3 : 0),
    shader: { painterly: 0.12, grain: 0.3, vignette: 0.55, posterize: 0, duotone: 0.3, halftone: 0, saturation: 0.85, contrast: 1.15, temperature: 0, halation: 0.75, aberration: 0.04, fade: 0.05, ripple: 0 },
    motion: calm,
    frame: 'band',
    caption: 'serif',
    shapes: 'none',
    shapeCount: 0,
    edge: 0,
  },
  hopper: {
    id: 'hopper',
    name: 'Хоппер',
    reference: 'Эдвард Хоппер — «Полуночники», «Утро в городе»',
    technique: 'Плоский цвет, резкий свет и длинные тени, широкий кадр как в кино, тишина вокруг',
    when: 'Одиночество в городе: офис, кафе, вокзал, вечер у окна, день «сам по себе»',
    why: 'Хоппер писал людей, которые рядом с другими и всё равно одни. Плоский цвет и пустота кадра — это тишина посреди города.',
    prototype: { tension: 0.45, valence: -0.2, temperature: 0.5, nostalgia: 0.3, social: 0.1, nature: 0.05 },
    affinity: ({ t }) => (t.setting === 'city' || t.setting === 'indoor' ? 0.3 : 0),
    shader: { painterly: 0.18, grain: 0.12, vignette: 0.3, posterize: 0.35, duotone: 0.08, halftone: 0, saturation: 0.95, contrast: 1.2, temperature: 0, halation: 0.12, aberration: 0, fade: 0.1, ripple: 0 },
    motion: sharp,
    frame: 'band',
    caption: 'serif',
    shapes: 'none',
    shapeCount: 0,
    edge: 0,
  },
  kandinsky: {
    id: 'kandinsky',
    name: 'Экспрессия',
    reference: 'Эдвард Мунк — «Крик»; немецкий экспрессионизм, Эгон Шиле',
    technique: 'Сгущённый контраст, цвет на пределе, кадр плывёт волнами, резкий гротеск',
    when: 'Тревожный, напряжённый день: дедлайн, ссора, страх, бессонная ночь',
    why: 'Экспрессионисты искажали форму и цвет, чтобы показать не то, что видно, а то, что внутри. Кадр плывёт и горит — так ощущается день, в котором нет опоры.',
    prototype: { tension: 0.88, valence: -0.35, temperature: 0.35, nostalgia: 0.1, social: 0.35, nature: 0.12 },
    shader: { painterly: 0.3, grain: 0.14, vignette: 0.38, posterize: 0.25, duotone: 0.25, halftone: 0, saturation: 1.25, contrast: 1.38, temperature: 0, halation: 0, aberration: 0.2, fade: 0, ripple: 0.45 },
    motion: sharp,
    frame: 'offset',
    caption: 'grotesk',
    shapes: 'none',
    shapeCount: 0,
    edge: 0,
  },
  collage: {
    id: 'collage',
    name: 'Поп-арт',
    reference: 'Энди Уорхол, Рой Лихтенштейн — растровая печать, плакатный цвет',
    technique: 'Крупный растр, плакатный цвет, наклонённый кадр',
    when: 'Шумный радостный день: праздник, друзья, танцы, быстрая мажорная музыка',
    why: 'Поп-арт превращает обычный момент в яркий плакат. Растр и громкий цвет звучат как смех и толпа — много всего сразу.',
    prototype: { tension: 0.7, valence: 0.85, temperature: 0.62, nostalgia: 0.2, social: 0.9, nature: 0.3 },
    shader: { painterly: 0, grain: 0.15, vignette: 0, posterize: 0.3, duotone: 0.15, halftone: 0.55, saturation: 1.35, contrast: 1.15, temperature: 0, halation: 0, aberration: 0.1, fade: 0, ripple: 0 },
    motion: sharp,
    frame: 'tilted',
    caption: 'hand',
    shapes: 'none',
    shapeCount: 0,
    edge: 0,
  },
};

export const MODE_LIST = Object.values(MODES);

/** Веса осей при выборе режима: напряжение решает больше всего. */
export const AXIS_WEIGHTS: Omit<Axes, 'pace'> = {
  tension: 1.5,
  valence: 0.9,
  temperature: 0.8,
  nostalgia: 0.9,
  social: 0.7,
  nature: 0.6,
};
