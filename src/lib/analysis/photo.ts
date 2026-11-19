import { rgbToHex, rgbToHsl } from '../color';
import type { PhotoSignals, RGB } from '../types';

export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

function drawScaled(bmp: ImageBitmap, maxSide: number): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/** Сжимает фото для хранения (≈1600 px по длинной стороне). */
export function resizeToJpeg(bmp: ImageBitmap, maxSide = 1600, quality = 0.86): Promise<Blob> {
  const c = drawScaled(bmp, maxSide);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', quality));
}

/** Маленькая копия для vision-модели (base64 без префикса). */
export function toBase64Jpeg(bmp: ImageBitmap, maxSide = 512): string {
  return drawScaled(bmp, maxSide).toDataURL('image/jpeg', 0.8).split(',')[1];
}

/**
 * Палитра и свет по всем фото дня: k-means по пикселям уменьшенных копий
 * + средняя светлота, насыщенность, «температура» и контраст.
 */
export function analyzePhotos(bmps: ImageBitmap[]): PhotoSignals {
  const px: RGB[] = [];
  let lumaSum = 0;
  let lumaSq = 0;
  let satSum = 0;
  let warmW = 0;
  let coolW = 0;

  for (const bmp of bmps) {
    const c = drawScaled(bmp, 64);
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < data.length; i += 4) {
      const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
      px.push(rgb);
      const [h, s, l] = rgbToHsl(rgb);
      const y = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      lumaSum += y;
      lumaSq += y * y;
      satSum += s;
      const w = s * (1 - Math.abs(l - 0.5) * 1.4); // серые и пересвеченные пиксели почти не голосуют
      if (w > 0.05) {
        if (h < 70 || h > 330) warmW += w;
        else if (h > 160 && h < 270) coolW += w;
      }
    }
  }

  const n = Math.max(1, px.length);
  const luma = lumaSum / n;
  const contrast = Math.sqrt(Math.max(0, lumaSq / n - luma * luma));
  const warmRaw = warmW + coolW > 0 ? warmW / (warmW + coolW) : 0.5;
  const confidence = Math.min(1, (warmW + coolW) / (n * 0.15));
  const { centers, weights } = kmeans(px, 6);
  const order = weights.map((_, i) => i).sort((a, b) => weights[b] - weights[a]);

  return {
    palette: order.map((i) => rgbToHex(centers[i])),
    weights: order.map((i) => weights[i]),
    luma,
    saturation: satSum / n,
    warmth: 0.5 + (warmRaw - 0.5) * confidence,
    contrast,
    count: bmps.length,
  };
}

function kmeans(px: RGB[], k: number, iters = 10) {
  if (px.length === 0) return { centers: [[200, 190, 180]] as RGB[], weights: [1] };
  // инициализация по квантилям яркости — детерминированно
  const sorted = [...px].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centers: RGB[] = Array.from({ length: k }, (_, i) => [...sorted[Math.floor(((i + 0.5) / k) * sorted.length)]] as RGB);
  const assign = new Int32Array(px.length);
  for (let it = 0; it < iters; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let p = 0; p < px.length; p++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const dr = px[p][0] - centers[c][0];
        const dg = px[p][1] - centers[c][1];
        const db = px[p][2] - centers[c][2];
        const d = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      assign[p] = best;
      sums[best][0] += px[p][0];
      sums[best][1] += px[p][1];
      sums[best][2] += px[p][2];
      sums[best][3]++;
    }
    centers = centers.map((c, i) => (sums[i][3] ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]] : c));
  }
  const counts = new Array(k).fill(0);
  for (let p = 0; p < px.length; p++) counts[assign[p]]++;
  return { centers, weights: counts.map((c) => c / px.length) };
}
