import type { ModeId, StyleParams } from '../types';

/**
 * Как каждый режим слышит песню прямо во время воспроизведения.
 * Числа — сила связи «признак звука → параметр шейдера/графики».
 */
export interface Reaction {
  brush: number; // бас → шире мазок Кувахары
  kick: number; // бас → кадр «вздрагивает» (наезд)
  grain: number; // верх → зерно
  glow: number; // громкость → ореол светов
  dots: number; // бас → растр крупнее
  shake: number; // удар → цвет расслаивается (аберрация)
}

export const REACT: Record<ModeId, Reaction> = {
  impression: { brush: 0.9, kick: 0.35, grain: 0.15, glow: 0.8, dots: 0, shake: 0.1 },
  kandinsky: { brush: 0, kick: 1, grain: 0.35, glow: 0.2, dots: 0, shake: 1 },
  film: { brush: 0, kick: 0.3, grain: 1, glow: 1, dots: 0, shake: 0.3 },
  ma: { brush: 0.5, kick: 0.12, grain: 0.2, glow: 0.35, dots: 0, shake: 0 },
  collage: { brush: 0, kick: 0.7, grain: 0.2, glow: 0.3, dots: 1, shake: 0.5 },
};

export function reactionFor(style: StyleParams): Reaction {
  const a = REACT[style.mode];
  const b = REACT[style.secondary];
  const k = style.blend;
  const r = {} as Reaction;
  for (const key of Object.keys(a) as (keyof Reaction)[]) r[key] = a[key] * (1 - k) + b[key] * k;
  return r;
}

const LABEL: Record<keyof Reaction, string> = {
  brush: 'бас → мазок шире',
  kick: 'бас → кадр вздрагивает',
  grain: 'верх → зерно',
  glow: 'громкость → ореол светов',
  dots: 'бас → растр крупнее',
  shake: 'удар → цвет расслаивается',
};

/** Три самые сильные связи — для подписи под индикатором. */
export function reactionLabels(style: StyleParams, n = 3): string[] {
  const r = reactionFor(style);
  return (Object.keys(r) as (keyof Reaction)[])
    .filter((k) => r[k] > 0.25)
    .sort((a, b) => r[b] - r[a])
    .slice(0, n)
    .map((k) => LABEL[k]);
}
