import type { Axes, ModeId, ShaderParams, StyleParams } from '../types';

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
  shader: ShaderParams;
  motion: Pick<StyleParams['motion'], 'transition' | 'transitionShare' | 'zoom' | 'drift' | 'pulse'>;
  frame: StyleParams['layout']['frame'];
  caption: StyleParams['type']['caption'];
  shapes: StyleParams['shapes']['kind'];
  shapeCount: number;
}

export const MODES: Record<ModeId, ModeDef> = {
  impression: {
    id: 'impression',
    name: 'Импрессионизм',
    reference: 'Клод Моне, Огюст Ренуар — «Впечатление. Восход солнца», «Стога»',
    technique: 'Фото растворяется в мазках (фильтр Кувахары), мягкое свечение светов, рваный край кадра, рукописная подпись',
    when: 'Спокойный тёплый день, природа или вода, мягкий свет',
    why: 'Импрессионисты писали не предмет, а свет и ощущение от момента. Размытые мазки убирают детали, которые память всё равно теряет, и оставляют атмосферу.',
    prototype: { tension: 0.18, valence: 0.45, temperature: 0.72, nostalgia: 0.4, social: 0.35, nature: 0.95 },
    shader: { painterly: 0.85, grain: 0.12, vignette: 0.22, posterize: 0, duotone: 0, halftone: 0, saturation: 1.08, contrast: 0.92, temperature: 0, halation: 0.35, aberration: 0, fade: 0.12 },
    motion: { transition: 'dissolve', transitionShare: 0.45, zoom: 0.07, drift: 0.03, pulse: 0.12 },
    frame: 'window',
    caption: 'hand',
    shapes: 'strokes',
    shapeCount: 6,
  },
  kandinsky: {
    id: 'kandinsky',
    name: 'Композиция',
    reference: 'Василий Кандинский — «Композиция VIII», «Точка и линия на плоскости»; конструктивизм',
    technique: 'Постеризация и дуотон, хроматическая аберрация, геометрия из кругов и линий поверх сетки, контрастный гротеск',
    when: 'Напряжённый, быстрый, «собранный» день: дедлайн, ночь, город, электронная музыка',
    why: 'Кандинский связывал острые углы и линии с напряжением, а круг — с концентрацией. Резкие формы и жёсткий контраст передают день, в котором нет пауз.',
    prototype: { tension: 0.85, valence: -0.05, temperature: 0.22, nostalgia: 0.1, social: 0.3, nature: 0.1 },
    shader: { painterly: 0, grain: 0.08, vignette: 0.12, posterize: 0.55, duotone: 0.35, halftone: 0, saturation: 0.85, contrast: 1.35, temperature: 0, halation: 0, aberration: 0.25, fade: 0 },
    motion: { transition: 'cut', transitionShare: 0, zoom: 0.02, drift: 0, pulse: 0.6 },
    frame: 'offset',
    caption: 'grotesk',
    shapes: 'geometry',
    shapeCount: 9,
  },
  film: {
    id: 'film',
    name: 'Плёнка',
    reference: 'Любительская плёночная фотография 70–90-х, Уильям Эглстон, Нан Голдин',
    technique: 'Крупное зерно, ореол вокруг светов (халация), засветки, выцветшие тени, шрифт пишущей машинки',
    when: 'Ностальгия, люди рядом, лето, песня из прошлых десятилетий',
    why: 'Плёнка — визуальный код «воспоминания»: зерно и засветки мы считываем как «это было давно и это было по-настоящему».',
    prototype: { tension: 0.38, valence: 0.4, temperature: 0.65, nostalgia: 0.9, social: 0.7, nature: 0.45 },
    shader: { painterly: 0.08, grain: 0.55, vignette: 0.42, posterize: 0, duotone: 0, halftone: 0, saturation: 0.95, contrast: 1.05, temperature: 0, halation: 0.55, aberration: 0.12, fade: 0.28 },
    motion: { transition: 'dissolve', transitionShare: 0.2, zoom: 0.04, drift: 0.02, pulse: 0.25 },
    frame: 'band',
    caption: 'mono',
    shapes: 'leaks',
    shapeCount: 3,
  },
  ma: {
    id: 'ma',
    name: 'Ма · пустота',
    reference: 'Японская минималистичная графика, суми-э, Кэндзо Такада, принцип «ма» (間)',
    technique: 'Маленькое окно фото, много воздуха, тушевой дуотон, край кадра впитывается в бумагу, знак энсо',
    when: 'Тихий день наедине с собой, грусть или задумчивость, медленная музыка',
    why: '«Ма» — это значимая пауза. Пустота вокруг маленького кадра даёт тишине место на странице: день ощущается как долгий выдох.',
    prototype: { tension: 0.15, valence: -0.3, temperature: 0.32, nostalgia: 0.5, social: 0.05, nature: 0.5 },
    shader: { painterly: 0.22, grain: 0.18, vignette: 0.05, posterize: 0, duotone: 0.5, halftone: 0, saturation: 0.55, contrast: 0.9, temperature: 0, halation: 0.1, aberration: 0, fade: 0.3 },
    motion: { transition: 'ink', transitionShare: 0.5, zoom: 0.03, drift: 0.012, pulse: 0.05 },
    frame: 'small',
    caption: 'serif',
    shapes: 'enso',
    shapeCount: 1,
  },
  collage: {
    id: 'collage',
    name: 'Коллаж',
    reference: 'Анри Матисс — вырезки «Джаз»; поп-арт, растровая печать',
    technique: 'Растр и яркие вырезанные формы, наклонённый кадр, клетчатая бумага',
    when: 'Шумный радостный день: праздник, друзья, танцы, быстрая мажорная музыка',
    why: 'Поздний Матисс резал цвет ножницами, чтобы получить чистую радость. Неровные вырезки и растр звучат как смех и толпа — много всего сразу.',
    prototype: { tension: 0.7, valence: 0.85, temperature: 0.62, nostalgia: 0.2, social: 0.9, nature: 0.3 },
    shader: { painterly: 0, grain: 0.15, vignette: 0, posterize: 0.3, duotone: 0.15, halftone: 0.55, saturation: 1.35, contrast: 1.15, temperature: 0, halation: 0, aberration: 0.1, fade: 0 },
    motion: { transition: 'wipe', transitionShare: 0.16, zoom: 0.05, drift: 0.02, pulse: 0.7 },
    frame: 'tilted',
    caption: 'hand',
    shapes: 'cutouts',
    shapeCount: 6,
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
