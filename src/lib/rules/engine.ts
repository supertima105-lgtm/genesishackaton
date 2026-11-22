import { adjust, clamp, hashString, hsl, lerp } from '../color';
import type {
  Axes,
  ModeId,
  MusicSignals,
  PhotoSignals,
  Reason,
  ShaderParams,
  StyleParams,
  TextSignals,
  WeatherSignals,
} from '../types';
import { AXIS_WEIGHTS, MODES, MODE_LIST } from './modes';

const TOD_WARMTH = { morning: 0.6, day: 0.5, evening: 0.8, night: 0.2 } as const;
const SETTING_NATURE = { nature: 1, water: 0.9, road: 0.5, city: 0.1, indoor: 0.15 } as const;
const TOD_RU = { morning: 'утро', day: 'день', evening: 'вечер', night: 'ночь' } as const;

function genreWarmth(genre?: string): number {
  if (!genre) return 0.5;
  const g = genre.toLowerCase();
  if (/(electro|techno|house|edm|synth|industrial|drum|dubstep|trance|электрон|техно)/.test(g)) return 0.2;
  if (/(jazz|soul|swing|folk|acoustic|bossa|blues|lounge|джаз|фолк|соул|акуст|шансон|романс)/.test(g)) return 0.82;
  if (/(metal|punk|hardcore|метал|панк)/.test(g)) return 0.35;
  return 0.5;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const f2 = (n: number) => n.toFixed(2);

export interface BuiltStyle {
  axes: Axes;
  style: StyleParams;
  reasons: Reason[];
}

/**
 * Главная функция системы: сигналы текста, фото и музыки → оси настроения → визуальные параметры.
 * Каждое решение записывается в reasons, чтобы страницу дня можно было объяснить.
 */
/** Оси настроения так, как их увидела система (без ручных поправок). */
export function systemAxesOf(t: TextSignals, p: PhotoSignals, m: MusicSignals): Axes {
  const eraOld = m.era ? clamp((2008 - m.era) / 45) : 0;
  const gWarm = genreWarmth(m.genre);
  return {
    tension: clamp(0.45 * t.tension + 0.15 * t.energy + 0.25 * m.energy + 0.15 * clamp(p.contrast * 3)),
    valence: clamp(
      0.6 * t.valence + 0.2 * (m.mode === 'major' ? 0.5 : -0.5) + 0.1 * (m.brightness * 2 - 1) + 0.1 * (p.luma * 2 - 1),
      -1,
      1,
    ),
    temperature: clamp(0.4 * t.warmth + 0.35 * p.warmth + 0.15 * TOD_WARMTH[t.timeOfDay] + 0.1 * gWarm),
    nostalgia: clamp(0.65 * t.nostalgia + 0.35 * eraOld),
    social: clamp(t.social),
    nature: SETTING_NATURE[t.setting],
    pace: clamp(0.6 * clamp((m.bpm - 60) / 110) + 0.4 * t.energy),
  };
}

export function buildStyle(
  t: TextSignals,
  p: PhotoSignals,
  m: MusicSignals,
  seedKey: string,
  w?: WeatherSignals,
  override?: Partial<Axes>,
): BuiltStyle {
  const reasons: Reason[] = [];

  // ── 1. Оси настроения ─────────────────────────────────────────────
  const sys: Axes = systemAxesOf(t, p, m);

  reasons.push({
    source: 'текст',
    cause: `${t.moodWords.slice(0, 3).join(', ') || 'настроение записи'}; ${TOD_RU[t.timeOfDay]}, ${t.images.slice(0, 3).join(', ')}`,
    effect: `напряжение ${f2(t.tension)}, тепло ${f2(t.warmth)}, люди рядом ${f2(t.social)}, ностальгия ${f2(t.nostalgia)}`,
  });
  reasons.push({
    source: 'фото',
    cause: `${p.count} фото, тёплых оттенков ${pct(p.warmth)}, светлота ${pct(p.luma)}, контраст ${f2(p.contrast)}`,
    effect: `основа палитры — цвета самих снимков; температура дня ${f2(sys.temperature)}`,
  });
  reasons.push({
    source: 'музыка',
    cause: `${Math.round(m.bpm)} BPM, ${m.key ?? (m.mode === 'major' ? 'мажор' : 'минор')}, энергия ${f2(m.energy)}${m.genre ? `, ${m.genre}` : ''}${m.era ? `, ${m.era}` : ''}${m.source === 'estimated' ? ' (оценка по описанию песни)' : ' (аудиоанализ)'}`,
    effect: `${m.mode === 'minor' ? 'минор приглушает цвет и сдвигает настроение вниз' : 'мажор поднимает насыщенность'}; энергия песни даёт ${pct(0.25)} веса оси напряжения`,
  });

  // Поправленные вручную оси — это ощущение самого человека: оно сильнее того, что увидела система.
  // От него строится всё дальше — почерк кадра, обработка фото, палитра (и материал страницы в emotion.ts).
  const axes: Axes = { ...sys };
  const changed = (Object.keys(override ?? {}) as (keyof Axes)[]).filter(
    (k) => typeof override?.[k] === 'number' && Math.abs((override[k] as number) - sys[k]) > 0.005,
  );
  if (changed.length) {
    reasons.push({
      source: 'вы',
      cause: `поправили ощущение: ${changed.map((k) => `${AXIS_RU[k]} ${f2(sys[k])} → ${f2(override![k] as number)}`).join(', ')}`,
      effect: 'почерк кадра, обработка фото и материал страницы перестроены под ваше ощущение',
    });
    for (const k of changed) axes[k] = clamp(override![k] as number, k === 'valence' ? -1 : 0, 1);
  }

  // ── 2. Выбор художественного режима ──────────────────────────────
  const scores = MODE_LIST.map((mode) => {
    let d = 0;
    for (const k of Object.keys(AXIS_WEIGHTS) as (keyof typeof AXIS_WEIGHTS)[]) {
      const scale = k === 'valence' ? 0.5 : 1;
      d += AXIS_WEIGHTS[k] * ((axes[k] - mode.prototype[k]) * scale) ** 2;
    }
    // ночь тянет к ноктюрну, зима и море — к цианотипии, семейный альбом — к сепии
    return { id: mode.id, score: Math.exp(-d / 0.35 + (mode.affinity?.({ t, m, w, axes }) ?? 0)) };
  }).sort((a, b) => b.score - a.score);

  const primary = MODES[scores[0].id];
  const secondary = MODES[scores[1].id];
  const blend = 0.5 * (scores[1].score / (scores[0].score + scores[1].score));

  reasons.push({
    source: 'система',
    cause: `ближе всего к прототипу «${primary.name}» (${primary.when.toLowerCase()})`,
    effect: `${primary.technique}; примесь «${secondary.name}» ${pct(blend)}`,
  });

  // ── 3. Шейдер: смешиваем два режима и модулируем осями ───────────
  const sh = {} as Required<ShaderParams>;
  for (const k of Object.keys(primary.shader) as (keyof ShaderParams)[]) {
    sh[k] = lerp(primary.shader[k], secondary.shader[k] ?? 0, blend);
  }
  sh.painterly *= 1 - 0.5 * axes.tension;
  sh.grain = clamp(sh.grain + 0.25 * axes.nostalgia);
  sh.fade = clamp(sh.fade + 0.15 * axes.nostalgia);
  sh.saturation *= 0.75 + 0.5 * ((axes.valence + 1) / 2);
  sh.contrast *= 1 + 0.25 * (axes.tension - 0.5);
  sh.temperature = clamp((axes.temperature - 0.5) * 1.4, -1, 1);
  if (t.timeOfDay === 'night') sh.vignette = clamp(sh.vignette + 0.15);
  if (t.light === 'golden') sh.halation = clamp(sh.halation + 0.2);

  // Погода — внешняя фактура дня. Она не перебивает «внутреннее» тепло из текста:
  // холодный день с какао остаётся тёплым, но по кадру идёт дождь или снег.
  let weather: StyleParams['weather'];
  if (w) {
    const wet = clamp(w.precipitation / 8);
    if (w.kind === 'rain' || w.kind === 'storm') {
      weather = { kind: w.kind, intensity: clamp(0.35 + wet * 0.65) };
      sh.fade = clamp(sh.fade + 0.06);
      sh.saturation *= 0.94;
      if (w.kind === 'storm') sh.contrast *= 1.08;
    } else if (w.kind === 'snow') {
      weather = { kind: 'snow', intensity: clamp(0.4 + wet * 0.6) };
      sh.temperature = clamp(sh.temperature - 0.12, -1, 1);
    } else if (w.kind === 'fog') {
      weather = { kind: 'fog', intensity: 0.6 };
      sh.fade = clamp(sh.fade + 0.18);
      sh.contrast *= 0.88;
    } else if (w.kind === 'clear' && w.sunshineHours >= 5) {
      weather = { kind: 'clear', intensity: clamp(w.sunshineHours / 12) };
      sh.halation = clamp(sh.halation + 0.15);
      sh.saturation *= 1.05;
    }
    if (w.tempMax <= 0) sh.temperature = clamp(sh.temperature - 0.08, -1, 1);
    reasons.push({
      source: 'погода',
      cause: `${w.label}, ${w.tempMin}…${w.tempMax}°, осадки ${w.precipitation.toFixed(1)} мм, солнце ${w.sunshineHours} ч`,
      effect:
        w.kind === 'rain' || w.kind === 'storm'
          ? 'по кадру идут капли, тени чуть выцветают'
          : w.kind === 'snow'
            ? 'по кадру идёт снег, тени холоднее — но акцент держит тепло из текста'
            : w.kind === 'fog'
              ? 'туман: выцветание и мягкий контраст'
              : w.kind === 'clear' && w.sunshineHours >= 5
                ? 'солнечный день: сильнее ореол вокруг светов'
                : 'облачно: без дополнительной фактуры',
    });
  }

  reasons.push({
    source: 'система',
    cause: `ностальгия ${f2(axes.nostalgia)}, валентность ${f2(axes.valence)}, напряжение ${f2(axes.tension)}`,
    effect: `зерно ${f2(sh.grain)}, насыщенность ×${f2(sh.saturation)}, контраст ×${f2(sh.contrast)}, сдвиг температуры ${sh.temperature >= 0 ? 'в тепло' : 'в холод'} ${f2(Math.abs(sh.temperature))}`,
  });

  // ── 4. Палитра из фото ───────────────────────────────────────────
  const palette = buildPalette(p, axes, t, primary.id);
  reasons.push({
    source: 'фото',
    cause: `самый насыщенный цвет снимков ${p.palette[0] ?? ''} → акцент ${palette.accent}`,
    effect: palette.dark
      ? 'ночь и напряжение: страница печатается «в негативе» — тёмная бумага, светлые чернила'
      : `бумага ${palette.paper} подкрашена самым светлым тоном фото, чернила — самым тёмным`,
  });

  // ── 5. Ритм из музыки ────────────────────────────────────────────
  let bpm = clamp(m.bpm || 96, 50, 190);
  if (bpm > 140 && axes.tension < 0.4) bpm /= 2; // быстрая песня в тихий день — живём в половинном темпе
  const drive = Math.max(axes.tension, axes.pace); // и напряжённый, и просто быстрый день режутся чаще
  let beatsPerShot = drive < 0.4 ? 8 : drive < 0.62 ? 4 : 2;
  let shotSeconds = (beatsPerShot * 60) / bpm;
  while (shotSeconds < 1.1) {
    beatsPerShot *= 2;
    shotSeconds = (beatsPerShot * 60) / bpm;
  }
  while (shotSeconds > 9 && beatsPerShot > 1) {
    beatsPerShot /= 2;
    shotSeconds = (beatsPerShot * 60) / bpm;
  }
  const mo = {
    transition: blend > 0.4 ? secondary.motion.transition : primary.motion.transition,
    transitionShare: lerp(primary.motion.transitionShare, secondary.motion.transitionShare, blend),
    zoom: lerp(primary.motion.zoom, secondary.motion.zoom, blend) * (1 - 0.3 * axes.tension),
    drift: lerp(primary.motion.drift, secondary.motion.drift, blend),
    pulse: lerp(primary.motion.pulse, secondary.motion.pulse, blend) * (0.4 + 0.6 * m.energy),
  };
  if (mo.transition === 'cut') mo.transitionShare = 0;

  const style: StyleParams = {
    mode: primary.id,
    secondary: secondary.id,
    blend,
    palette,
    shader: sh,
    motion: { bpm, beatsPerShot, shotSeconds, ...mo },
    layout: { frame: primary.frame },
    type: { caption: primary.caption },
    shapes: { kind: primary.shapes, count: primary.shapeCount, seed: hashString(seedKey) },
    weather,
  };
  return { axes, style, reasons };
}

export const TRANSITION_RU = { dissolve: 'наплыв', cut: 'склейка в долю', wipe: 'шторка', ink: 'тушь в воде' } as const;
export const AXIS_RU: Record<keyof Axes, string> = {
  tension: 'напряжение',
  valence: 'радость',
  temperature: 'тепло',
  nostalgia: 'ностальгия',
  social: 'люди',
  nature: 'природа',
  pace: 'темп',
};

/** Режимы-отпечатки печатаются своими красками, а не цветами фото: синька и сепия. */
const PRINT_PALETTES: Partial<Record<ModeId, StyleParams['palette']>> = {
  cyanotype: { paper: '#eef1ef', ink: '#10295a', accent: '#2f5f9e', shades: ['#1b4280', '#5c8bc0', '#a7c2dd', '#dbe6ef'], dark: false },
  sepia: { paper: '#efe3c8', ink: '#3a2414', accent: '#8c5a31', shades: ['#5c3a20', '#a6764a', '#cdac82', '#e5d1af'], dark: false },
};

function buildPalette(p: PhotoSignals, axes: Axes, t: TextSignals, mode: ModeId): StyleParams['palette'] {
  const print = PRINT_PALETTES[mode];
  if (print) return { ...print, shades: [...print.shades] };
  const cols = p.palette.length ? p.palette : ['#c9b9a6', '#6b5b4b', '#2b2622'];
  const withHsl = cols.map((c, i) => ({ c, w: p.weights[i] ?? 0.1, hsl: hsl(c) }));
  const lightest = [...withHsl].sort((a, b) => b.hsl[2] - a.hsl[2])[0];
  const darkest = [...withHsl].sort((a, b) => a.hsl[2] - b.hsl[2])[0];
  const vivid = [...withHsl].sort((a, b) => b.hsl[1] * Math.pow(b.w, 0.3) - a.hsl[1] * Math.pow(a.w, 0.3))[0];
  const temp = (axes.temperature - 0.5) * 1.6;
  const satMul = 0.7 + 0.6 * ((axes.valence + 1) / 2);
  // ноктюрн всегда печатается «в негативе»: тёмная бумага, светлые чернила
  const dark = mode === 'nocturne' || (t.timeOfDay === 'night' && axes.tension > 0.5) || (p.luma < 0.22 && axes.valence < 0);

  const paper = dark
    ? adjust(darkest.c, { temp: temp * 0.6, s: clamp(darkest.hsl[1] * 0.6, 0.12, 0.32), l: 0.11 })
    : adjust(lightest.c, { temp: temp * 0.5, s: clamp(lightest.hsl[1] * 0.35, 0.06, 0.24), l: 0.93 - 0.04 * axes.nostalgia });
  const ink = dark
    ? adjust(lightest.c, { temp: temp * 0.3, s: 0.12, l: 0.88 })
    : adjust(darkest.c, { temp: temp * 0.3, s: clamp(darkest.hsl[1], 0.1, 0.35), l: 0.14 });
  const accentSat = clamp(vivid.hsl[1] * satMul, 0.35, 0.88) * (mode === 'ma' ? 0.7 : 1);
  const accent = adjust(vivid.c, { temp, s: accentSat, l: dark ? 0.62 : clamp(vivid.hsl[2], 0.42, 0.56) });
  const shades = withHsl.map(({ c, hsl: [, s, l] }) =>
    adjust(c, { temp: temp * 0.8, s: clamp(s * satMul, 0.15, 0.85), l: clamp(l, 0.25, 0.75) }),
  );
  return { paper, ink, accent, shades, dark };
}

