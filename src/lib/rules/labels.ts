import type { Axes, DayRecord, StyleParams } from '../types';

/** Человеческие названия параметров стиля — для сравнения дней и показа. */
export const FRAME_RU: Record<StyleParams['layout']['frame'], string> = {
  window: 'большое окно',
  offset: 'смещённое окно',
  band: 'плёночная лента во всю ширину',
  small: 'маленькое окно, много воздуха',
  tilted: 'наклонённый вырезанный кадр',
};
export const SHAPES_RU: Record<StyleParams['shapes']['kind'], string> = {
  strokes: 'мазки за краем фото',
  geometry: 'круги и линии Кандинского',
  leaks: 'перфорация и засветка',
  enso: 'энсо и красная печать',
  cutouts: 'вырезки Матисса',
};
export const CAPTION_RU: Record<StyleParams['type']['caption'], string> = {
  hand: 'рукописный (Caveat)',
  grotesk: 'гротеск капсом (Unbounded)',
  serif: 'курсивная антиква',
  mono: 'машинка',
};

export function treatment(s: StyleParams['shader']): string {
  const t: string[] = [];
  if (s.painterly > 0.2) t.push('мазки');
  if (s.grain > 0.25) t.push('зерно');
  if (s.posterize > 0.2) t.push('постеризация');
  if (s.duotone > 0.3) t.push('дуотон');
  if (s.halftone > 0.2) t.push('растр');
  if (s.halation > 0.25) t.push('ореол');
  if (s.fade > 0.2) t.push('выцветание');
  if (s.aberration > 0.3) t.push('аберрация');
  return t.join(', ') || 'почти без обработки';
}

/** Расстояние между днями в пространстве осей (+ бонус, если у них разный почерк). */
export function dayDistance(a: DayRecord, b: DayRecord) {
  let d = 0;
  for (const k of Object.keys(a.axes) as (keyof Axes)[]) {
    const s = k === 'valence' ? 0.5 : 1;
    d += ((a.axes[k] - b.axes[k]) * s) ** 2;
  }
  return Math.sqrt(d) + (a.style.mode !== b.style.mode ? 0.35 : 0);
}

/** Самые непохожие дни: жадно добираем тот, что дальше всех от уже выбранных. */
export function mostContrasting(days: DayRecord[], n: number): DayRecord[] {
  if (days.length <= n) return [...days];
  let best: [DayRecord, DayRecord] = [days[0], days[1]];
  let bestD = -1;
  for (let i = 0; i < days.length; i++)
    for (let j = i + 1; j < days.length; j++) {
      const d = dayDistance(days[i], days[j]);
      if (d > bestD) {
        bestD = d;
        best = [days[i], days[j]];
      }
    }
  const out = [...best];
  while (out.length < n) {
    let pick: DayRecord | null = null;
    let pickD = -1;
    for (const d of days) {
      if (out.includes(d)) continue;
      const m = Math.min(...out.map((o) => dayDistance(o, d)));
      if (m > pickD) {
        pickD = m;
        pick = d;
      }
    }
    if (!pick) break;
    out.push(pick);
  }
  return out;
}
