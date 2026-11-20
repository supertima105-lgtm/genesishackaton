export type RGB = [number, number, number];

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type Setting = 'nature' | 'water' | 'city' | 'indoor' | 'road';
export type Light = 'soft' | 'golden' | 'hard' | 'overcast' | 'low' | 'neon';

/** Что система поняла из текста записи (Gemini или эвристика). Все шкалы 0..1, кроме valence (-1..1). */
export interface TextSignals {
  valence: number;
  energy: number;
  tension: number;
  warmth: number;
  nostalgia: number;
  social: number;
  timeOfDay: TimeOfDay;
  season: Season;
  setting: Setting;
  images: string[];
  moodWords: string[];
  title: string;
  caption: string;
  light?: Light;
  source: 'gemini' | 'heuristic';
}

/** Что система увидела на фото. */
export interface PhotoSignals {
  palette: string[]; // hex, по убыванию доли
  weights: number[];
  luma: number;
  saturation: number;
  warmth: number; // доля тёплых оттенков среди насыщенных пикселей
  contrast: number;
  count: number;
}

/** Что система услышала в песне. */
export interface MusicSignals {
  bpm: number;
  beatOffset: number; // сек от начала фрагмента до первой доли
  energy: number;
  brightness: number;
  mode: 'major' | 'minor';
  key?: string;
  genre?: string;
  era?: number;
  source: 'audio' | 'estimated';
}

/** Погода дня (по желанию и с согласия пользователя) — Open-Meteo по координатам. */
export interface WeatherSignals {
  kind: 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';
  label: string; // «дождь», «ясно»…
  tempMax: number;
  tempMin: number;
  precipitation: number; // мм
  sunshineHours: number;
  code: number; // WMO
}

export interface EmbedInfo {
  provider: 'spotify' | 'youtube' | 'yandex' | 'soundcloud' | 'other';
  url: string; // исходная ссылка
  embedUrl?: string;
}

export interface SongInfo {
  artist: string;
  title: string;
  link?: EmbedInfo;
  /** имя уже сверено со ссылкой (или введено вручную при наличии ссылки) — больше не трогаем */
  checked?: boolean;
  excerptStart?: number;
  excerptDuration?: number;
}

export type ModeId = 'impression' | 'kandinsky' | 'film' | 'ma' | 'collage';

/** Оси настроения дня — общий «язык», на котором текст, фото и музыка договариваются. */
export interface Axes {
  tension: number; // 0 покой … 1 напряжение
  valence: number; // -1 грусть … 1 радость
  temperature: number; // 0 холодно … 1 тепло
  nostalgia: number;
  social: number;
  nature: number;
  pace: number; // темп музыки и событий
}

/**
 * Второй слой ощущений — считается по кнопке «Глубже в день». На кадр не влияет: это то, что человек
 * чувствовал, а не то, как выглядит страница. Все шкалы 0..1.
 */
export interface FeelAxes {
  love: number; // равнодушие … любовь
  freedom: number; // скованность … свобода
  wonder: number; // обыденность … восторг
  gratitude: number; // досада … благодарность
  hope: number; // безнадёжность … надежда
  play: number; // серьёзно … игриво
  vigor: number; // усталость … бодрость
  novelty: number; // рутина … впервые
  meaning: number; // обычный … особенный
  loudness: number; // тишина … шум
  light: number; // темно … светло
}

export interface DayFeel {
  system: FeelAxes; // как решила система
  axes: FeelAxes; // с поправками человека
  source: 'gemini' | 'heuristic';
}

export interface ShaderParams {
  painterly: number; // радиус «мазка» (Kuwahara), 0..1
  grain: number;
  vignette: number;
  posterize: number;
  duotone: number;
  halftone: number;
  saturation: number; // множитель
  contrast: number; // множитель
  temperature: number; // -1 холод … 1 тепло
  halation: number;
  aberration: number;
  fade: number; // приподнятые тени, «выцветание»
}

export interface StyleParams {
  mode: ModeId;
  secondary: ModeId;
  blend: number; // доля вторичного режима 0..0.5
  palette: {
    paper: string;
    ink: string;
    accent: string;
    shades: string[];
    dark: boolean;
  };
  shader: ShaderParams;
  motion: {
    bpm: number;
    beatsPerShot: number;
    shotSeconds: number;
    transition: 'dissolve' | 'cut' | 'wipe' | 'ink';
    transitionShare: number; // доля кадра, занятая переходом
    zoom: number; // амплитуда наезда
    drift: number;
    pulse: number; // сила реакции на долю
  };
  layout: {
    frame: 'window' | 'offset' | 'band' | 'small' | 'tilted';
  };
  type: {
    caption: 'hand' | 'grotesk' | 'serif' | 'mono';
  };
  shapes: {
    kind: 'strokes' | 'geometry' | 'leaks' | 'enso' | 'cutouts';
    count: number;
    seed: number;
  };
  weather?: { kind: WeatherSignals['kind']; intensity: number };
}

export interface Reason {
  source: 'текст' | 'фото' | 'музыка' | 'погода' | 'вы' | 'система';
  cause: string;
  effect: string;
}

export interface FileRef {
  path: string;
  mime: string;
}

export interface DayRecord {
  id: string;
  folder: string; // «2026-11-19 · Осенний парк и какао»
  title: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  text: string;
  photos: FileRef[];
  song: SongInfo;
  songFile?: FileRef;
  /** Устарело: озвучка убрана. Поле остаётся, чтобы при удалении старого дня стёрся и его файл. */
  voice?: FileRef;
  cover?: FileRef;
  video?: FileRef;
  titleEdited?: boolean;
  /** «Не так ощущалось»: оси, которые человек поправил вручную. Пересборка их сохраняет. */
  axesOverride?: Partial<Axes>;
  /** «Глубже в день»: дополнительные оси, считаются по кнопке */
  feel?: DayFeel;
  signals: { text: TextSignals; photo: PhotoSignals; music: MusicSignals; weather?: WeatherSignals };
  axes: Axes;
  style: StyleParams;
  reasons: Reason[];
  version: 1;
}
