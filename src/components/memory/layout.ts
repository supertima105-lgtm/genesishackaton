import type { DayRecord, StyleParams } from '../../lib/types';

type Frame = StyleParams['layout']['frame'];

/**
 * Раскладка страницы дневника. Лист больше не 4:5: окно фото повторяет формат снимка
 * (16:9, 4:5, квадрат…), а лист вырастает под ним — шапка, фото, название, подвал.
 * Все размеры — в % ширины листа (cqw).
 */
export const LAYOUT_V = 2;

/** Формат, пока настоящий ещё не измерен (и у дней без фото). */
export const DEFAULT_ASPECT = 0.8;

/** Пропорции, которые лист принимает целиком; панорамы и «сторис» шире этого чуть подрезаются. */
const MIN_A = 0.5;
const MAX_A = 2.4;
/** Самое высокое окно фото: вертикальный снимок сужается, а не вытягивает лист в ленту. */
const MAX_H = 120;

/** Посадка окна по горизонтали: отступ слева и ширина. «Ма» — больше бумаги вокруг, но фото всё равно главное. */
const FIT: Record<Frame, { x: number; w: number; rotate?: number }> = {
  window: { x: 7, w: 86 },
  band: { x: 0, w: 100 },
  offset: { x: 6, w: 80 },
  small: { x: 11, w: 78 },
  tilted: { x: 9, w: 82, rotate: -2.2 },
};

export const HEAD_TOP = 4.2;
export const RULE_TOP = 8.2;
export const TEXT_GAP = 6.5;
export const TEXT_MIN = 20;
/** подвал: отступ над строкой, строка, поле снизу */
export const FOOT_GAP = 3.4;
export const FOOT_BOTTOM = 3.6;
const FOOT = FOOT_GAP + 2.4 + FOOT_BOTTOM;

export interface FrameBox {
  x: number;
  top: number;
  w: number;
  h: number;
  rotate?: number;
}

export function frameOf(frame: Frame, aspect: number): FrameBox {
  const a = Math.min(MAX_A, Math.max(MIN_A, aspect || DEFAULT_ASPECT));
  const f = FIT[frame] ?? FIT.window;
  let { x, w } = f;
  let h = w / a;
  if (h > MAX_H) {
    h = MAX_H;
    const nw = h * a;
    x += (w - nw) / 2;
    w = nw;
  }
  return { x, w, h, top: frame === 'band' ? 12 : 11, rotate: f.rotate };
}

/** Ширина / высота листа (оценка: длинное название может добавить строчку). */
export function sheetRatio(frame: Frame, aspect: number) {
  const f = frameOf(frame, aspect);
  return 100 / (f.top + f.h + TEXT_GAP + TEXT_MIN + FOOT);
}

/** Обложка, снятая под текущую раскладку; старую (под лист 4:5) показывать нельзя — у неё другой кадр. */
export const freshCover = (d: DayRecord) => (d.coverLayout === LAYOUT_V ? d.cover : undefined);
