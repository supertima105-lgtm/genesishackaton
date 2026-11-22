import flipSrc from '../assets/page-flip.mp3';

/**
 * Шелест перелистываемой страницы. Один элемент на всё приложение: следующий лист начинает звук
 * заново, а не накладывает второй. Браузер может не дать играть без жеста пользователя — тогда
 * просто тихо.
 */
let flip: HTMLAudioElement | null = null;

export function playFlip() {
  try {
    flip ??= Object.assign(new Audio(flipSrc), { preload: 'auto', volume: 0.55 });
    flip.currentTime = 0;
    void flip.play().catch(() => {});
  } catch {
    /* без звука */
  }
}
