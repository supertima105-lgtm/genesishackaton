import { FRAMES, TITLE_TOP } from '../components/memory/layout';
import { MODES } from './rules/modes';
import type { DayRecord } from './types';
import { weatherShort } from './weather';

/**
 * Запись воспоминания в видео 1080×1350 с музыкой.
 * Кадр собирается на 2D-canvas по той же сетке, что и страница: живой WebGL-слой фото,
 * графический слой (SVG → картинка), текст и фактура бумаги. Звук — фрагмент песни.
 */
export interface RecordOptions {
  card: HTMLElement;
  media: HTMLMediaElement | null;
  day: DayRecord;
  number: number;
  seconds: number;
  onProgress?: (p: number) => void;
}

const W = 1080;
const H = 1350;
const U = W / 100; // 1cqw

export function videoMime() {
  return (
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) =>
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
    ) ?? ''
  );
}

export async function recordMemory(o: RecordOptions): Promise<Blob> {
  const gl = o.card.querySelector('canvas');
  if (!gl) throw new Error('Страница ещё не отрисована');
  const svg = o.card.querySelector('svg[data-shapes]') as SVGSVGElement | null;

  await Promise.all(
    ['400 20px "JetBrains Mono"', '500 40px "Cormorant Garamond"', 'italic 400 40px "Cormorant Garamond"', '600 40px Caveat', '700 30px Unbounded'].map((f) =>
      document.fonts.load(f, 'Аа'),
    ),
  );
  const shapes = svg ? await svgToImage(svg) : null;
  const noise = makeNoise();

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const g = out.getContext('2d')!;
  const stream = out.captureStream(30);
  const media = o.media as (HTMLMediaElement & { captureStream?: () => MediaStream }) | null;
  media?.captureStream?.().getAudioTracks().forEach((t) => stream.addTrack(t));

  const mime = videoMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(250);

  const t0 = performance.now();
  try {
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        try {
          const t = (performance.now() - t0) / 1000;
          drawFrame(g, gl, shapes, noise, o.day, o.number, t);
          o.onProgress?.(Math.min(1, t / o.seconds));
          if (t >= o.seconds) return resolve();
          window.setTimeout(tick, 1000 / 30); // таймер, а не rAF: кадры собираются и в фоновой вкладке
        } catch (e) {
          reject(e);
        }
      };
      tick();
    });
  } finally {
    if (rec.state !== 'inactive') rec.stop();
  }
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  return new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] });
}

function drawFrame(
  g: CanvasRenderingContext2D,
  gl: HTMLCanvasElement,
  shapes: HTMLImageElement | null,
  noise: HTMLCanvasElement,
  day: DayRecord,
  number: number,
  t: number,
) {
  const { paper, ink, dark } = day.style.palette;
  const f = FRAMES[day.style.layout.frame];
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = paper;
  g.fillRect(0, 0, W, H);

  // окно фото — живой WebGL-кадр
  const fx = (f.x / 100) * W;
  const fy = (f.y / 100) * H;
  const fw = (f.w / 100) * W;
  const fh = (f.h / 100) * H;
  g.save();
  if (f.rotate) {
    g.translate(fx + fw / 2, fy + fh / 2);
    g.rotate((f.rotate * Math.PI) / 180);
    g.translate(-(fx + fw / 2), -(fy + fh / 2));
    g.shadowColor = 'rgba(0,0,0,.22)';
    g.shadowBlur = 3 * U;
    g.shadowOffsetY = 1.2 * U;
  }
  g.drawImage(gl, fx, fy, fw, fh);
  g.restore();

  if (shapes) {
    g.globalCompositeOperation = dark ? 'screen' : 'multiply';
    g.drawImage(shapes, 0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  }

  // шапка
  g.fillStyle = ink;
  g.strokeStyle = ink;
  const d = new Date(day.date + 'T12:00:00');
  const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const wd = d.toLocaleDateString('ru-RU', { weekday: 'long' });
  text(g, `${date} · ${wd}`.toUpperCase(), 7 * U, 0.034 * H + 2 * U, `400 ${2 * U}px "JetBrains Mono"`, 0.12 * 2 * U);
  text(g, `№ ${String(number).padStart(3, '0')}`, W - 7 * U, 0.034 * H + 2 * U, `400 ${2 * U}px "JetBrains Mono"`, 0.12 * 2 * U, 'right');
  g.globalAlpha = 0.25;
  g.fillRect(7 * U, 0.066 * H, W - 14 * U, 1.5);
  g.globalAlpha = 1;

  // название проявляется, подпись появляется следом
  const maxW = W - 7 * U - (day.style.shapes.kind === 'enso' ? 17 : 7) * U;
  const titleSize = 6.3 * U;
  g.globalAlpha = ease((t - 0.4) / 1.4);
  const titleFont = `500 ${titleSize}px "Cormorant Garamond"`;
  const lines = wrap(g, day.title, maxW, titleFont);
  let y = (TITLE_TOP / 100) * H + titleSize * 0.82;
  for (const l of lines) {
    text(g, l, 7 * U, y, titleFont, -0.01 * titleSize);
    y += titleSize * 1.02;
  }
  const cap = CAPTION[day.style.type.caption];
  const capFont = cap.font(U);
  const capLines = wrap(g, cap.upper ? day.signals.text.caption.toUpperCase() : day.signals.text.caption, maxW, capFont, cap.spacing * cap.size * U);
  y += 1.6 * U - titleSize * 1.02 + cap.size * U * cap.lh;
  const reveal = ease((t - 1.6) / 2.2);
  g.save();
  if (day.style.type.caption === 'hand') {
    g.beginPath();
    g.rect(0, 0, 7 * U + maxW * reveal, H);
    g.clip();
  } else g.globalAlpha = reveal;
  for (const l of capLines) {
    text(g, l, 7 * U, y, capFont, cap.spacing * cap.size * U);
    y += cap.size * U * cap.lh;
  }
  g.restore();
  g.globalAlpha = 1;

  // подвал
  const footFont = `400 ${1.75 * U}px "JetBrains Mono"`;
  const right = `${day.signals.weather ? weatherShort(day.signals.weather) + ' · ' : ''}${Math.round(day.style.motion.bpm)} BPM · ${MODES[day.style.mode].name}`.toUpperCase();
  g.globalAlpha = 0.7;
  text(g, right, W - 7 * U, H - 0.034 * H, footFont, 0.08 * 1.75 * U, 'right');
  g.globalAlpha = 1;
  g.font = footFont;
  const rightW = g.measureText(right).width + right.length * 0.08 * 1.75 * U;
  let left = `♪ ${day.song.artist} — ${day.song.title}`.toUpperCase();
  while (left.length > 4 && g.measureText(left).width + left.length * 0.14 * U > W - 14 * U - rightW - 4 * U) left = left.slice(0, -2) + '…';
  text(g, left, 7 * U, H - 0.034 * H, footFont, 0.08 * 1.75 * U);

  // бумага
  g.globalCompositeOperation = dark ? 'screen' : 'multiply';
  g.globalAlpha = dark ? 0.06 : 0.12;
  g.drawImage(noise, 0, 0, W, H);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

const CAPTION: Record<DayRecord['style']['type']['caption'], { size: number; lh: number; spacing: number; upper?: boolean; font: (u: number) => string }> = {
  hand: { size: 5.4, lh: 1.05, spacing: 0, font: (u) => `600 ${5.4 * u}px Caveat` },
  grotesk: { size: 2.7, lh: 1.35, spacing: 0.04, upper: true, font: (u) => `700 ${2.7 * u}px Unbounded` },
  serif: { size: 3.9, lh: 1.2, spacing: 0, font: (u) => `italic 400 ${3.9 * u}px "Cormorant Garamond"` },
  mono: { size: 2.35, lh: 1.5, spacing: 0.02, font: (u) => `400 ${2.35 * u}px "JetBrains Mono"` },
};

const ease = (x: number) => {
  const v = Math.min(1, Math.max(0, x));
  return v * v * (3 - 2 * v);
};

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, spacing = 0, align: CanvasTextAlign = 'left') {
  g.font = font;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
  g.fillText(s, x, y);
}

function wrap(g: CanvasRenderingContext2D, s: string, maxW: number, font: string, spacing = 0): string[] {
  g.font = font;
  (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (g.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function svgToImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(W));
  clone.setAttribute('height', String(H));
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function makeNoise(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W / 2;
  c.height = H / 2;
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
