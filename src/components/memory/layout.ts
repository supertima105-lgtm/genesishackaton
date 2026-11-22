import type { StyleParams } from '../../lib/types';

/** Постоянная сетка страницы дневника: 4:5, координаты в % от карточки. */
export const FRAMES: Record<StyleParams['layout']['frame'], { x: number; y: number; w: number; h: number; rotate?: number }> = {
  window: { x: 7, y: 9.5, w: 86, h: 58 },
  offset: { x: 6, y: 9.5, w: 64, h: 60 },
  band: { x: 0, y: 12, w: 100, h: 52 },
  small: { x: 31, y: 18, w: 38, h: 36 },
  tilted: { x: 10, y: 11, w: 80, h: 56, rotate: -2.2 },
};

/** Где начинается блок с названием — одинаково для всех дней. */
export const TITLE_TOP = 72;
