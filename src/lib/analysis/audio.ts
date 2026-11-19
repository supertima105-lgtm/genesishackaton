import Meyda from 'meyda';
import { guess } from 'web-audio-beat-detector';
import { clamp } from '../color';
import type { MusicSignals } from '../types';

const NOTE_RU = ['до', 'до-диез', 'ре', 'ми-бемоль', 'ми', 'фа', 'фа-диез', 'соль', 'ля-бемоль', 'ля', 'си-бемоль', 'си'];
// профили тональностей Крумхансла — Шмуклера
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export const EXCERPT_SECONDS = 40;

export interface AudioAnalysis {
  music: Omit<MusicSignals, 'genre' | 'era'>;
  excerpt: Blob; // фрагмент ≤ 40 с — целиком песню не храним
  excerptStart: number;
  excerptDuration: number;
}

/**
 * Слушает песню целиком в браузере: темп (BPM), энергия (RMS), «яркость» (спектральный центроид),
 * тональность и лад (хрома + профили Крумхансла). Затем вырезает самый энергичный фрагмент.
 */
export async function analyzeAudio(file: Blob): Promise<AudioAnalysis> {
  const ctx = new AudioContext();
  const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  await ctx.close();

  const sr = buffer.sampleRate;
  const mono = toMono(buffer);
  const size = 2048;
  const hop = 4096;
  Meyda.bufferSize = size;
  Meyda.sampleRate = sr;

  const limit = Math.min(mono.length, sr * 300);
  const rmsSeries: number[] = [];
  let rmsSum = 0;
  let centroidSum = 0;
  let frames = 0;
  const chroma = new Array(12).fill(0);
  for (let i = 0; i + size < limit; i += hop) {
    const frame = mono.subarray(i, i + size);
    const f = Meyda.extract(['rms', 'spectralCentroid', 'chroma'], frame) as {
      rms: number;
      spectralCentroid: number;
      chroma: number[];
    } | null;
    if (!f) continue;
    rmsSeries.push(f.rms);
    rmsSum += f.rms;
    if (f.rms > 0.01 && Number.isFinite(f.spectralCentroid)) {
      centroidSum += f.spectralCentroid;
      frames++;
      f.chroma.forEach((v, k) => (chroma[k] += Number.isFinite(v) ? v : 0));
    }
  }
  const rmsMean = rmsSum / Math.max(1, rmsSeries.length);
  const centroidHz = ((centroidSum / Math.max(1, frames)) * sr) / size;

  let bpm = 100;
  let offset = 0;
  try {
    const g = await guess(buffer);
    bpm = g.bpm;
    offset = g.offset;
  } catch {
    /* тишина или слишком короткий файл — оставляем 100 BPM */
  }

  const { mode, tonic } = detectKey(chroma);
  const loudness = clamp((rmsMean - 0.04) / 0.2);
  // Детектор ищет темп в диапазоне 90–180 и удваивает медленные песни.
  // Метрическая проверка: если сильные атаки приходятся только на каждую вторую долю — темп вдвое ниже.
  const half = checkHalfTime(mono, sr, bpm, offset);
  if (half) {
    bpm /= 2;
    offset = half.offset;
  }
  const energy = clamp(0.6 * loudness + 0.4 * clamp((bpm - 60) / 120));
  const brightness = clamp((centroidHz - 700) / 3000);

  // самый «громкий» участок длиной EXCERPT_SECONDS — обычно припев
  const dur = Math.min(EXCERPT_SECONDS, buffer.duration);
  const win = Math.max(1, Math.round((dur * sr) / hop));
  let best = 0;
  let bestSum = -1;
  let run = 0;
  for (let i = 0; i < rmsSeries.length; i++) {
    run += rmsSeries[i];
    if (i >= win) run -= rmsSeries[i - win];
    if (i >= win - 1 && run > bestSum) {
      bestSum = run;
      best = i - win + 1;
    }
  }
  const excerptStart = Math.min((best * hop) / sr, Math.max(0, buffer.duration - dur));
  const excerpt = await renderExcerpt(buffer, excerptStart, dur);
  const beatLen = 60 / bpm;
  const beatOffset = (((offset - excerptStart) % beatLen) + beatLen) % beatLen;

  return {
    music: {
      bpm,
      beatOffset,
      energy,
      brightness,
      mode,
      key: `${NOTE_RU[tonic]} ${mode === 'major' ? 'мажор' : 'минор'}`,
      source: 'audio',
    },
    excerpt,
    excerptStart,
    excerptDuration: dur,
  };
}

function checkHalfTime(mono: Float32Array, sr: number, bpm: number, offset: number): { offset: number } | null {
  if (bpm < 100) return null;
  const hop = 512;
  const env: number[] = [];
  for (let i = 0; i + hop < mono.length && env.length < (sr * 120) / hop; i += hop) {
    let s = 0;
    for (let j = 0; j < hop; j++) s += mono[i + j] * mono[i + j];
    env.push(Math.sqrt(s / hop));
  }
  const onset = env.map((v, i) => (i ? Math.max(0, v - env[i - 1]) : 0));
  const beat = 60 / bpm;
  const win = Math.round((0.04 * sr) / hop);
  const sums = [0, 0];
  const counts = [0, 0];
  for (let k = 0; ; k++) {
    const idx = Math.round(((offset + k * beat) * sr) / hop);
    if (idx >= onset.length) break;
    let m = 0;
    for (let j = Math.max(0, idx - win); j <= Math.min(onset.length - 1, idx + win); j++) m = Math.max(m, onset[j]);
    sums[k % 2] += m;
    counts[k % 2]++;
  }
  const even = sums[0] / Math.max(1, counts[0]);
  const odd = sums[1] / Math.max(1, counts[1]);
  if (odd < even * 0.45) return { offset };
  if (even < odd * 0.45) return { offset: offset + beat };
  return null;
}

function toMono(b: AudioBuffer): Float32Array {
  const out = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / b.numberOfChannels;
  }
  return out;
}

function detectKey(chroma: number[]): { mode: 'major' | 'minor'; tonic: number } {
  let best = { r: -Infinity, mode: 'major' as 'major' | 'minor', tonic: 0 };
  for (let t = 0; t < 12; t++) {
    for (const [mode, prof] of [
      ['major', MAJOR],
      ['minor', MINOR],
    ] as const) {
      const rot = chroma.map((_, i) => chroma[(i + t) % 12]);
      const r = pearson(rot, prof);
      if (r > best.r) best = { r, mode, tonic: t };
    }
  }
  return { mode: best.mode, tonic: best.tonic };
}

function pearson(a: number[], b: number[]) {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

async function renderExcerpt(buffer: AudioBuffer, start: number, dur: number): Promise<Blob> {
  const sr = 32000;
  const ch = Math.min(2, buffer.numberOfChannels);
  const off = new OfflineAudioContext(ch, Math.ceil(dur * sr), sr);
  const src = off.createBufferSource();
  src.buffer = buffer;
  const gain = off.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(1, 1.2);
  gain.gain.setValueAtTime(1, Math.max(1.2, dur - 2));
  gain.gain.linearRampToValueAtTime(0, dur);
  src.connect(gain).connect(off.destination);
  src.start(0, start, dur);
  return encodeWav(await off.startRendering());
}

export function encodeWav(b: AudioBuffer): Blob {
  const ch = b.numberOfChannels;
  const len = b.length * ch * 2;
  const view = new DataView(new ArrayBuffer(44 + len));
  writeWavHeader(view, len, b.sampleRate, ch);
  let o = 44;
  const chans = Array.from({ length: ch }, (_, c) => b.getChannelData(c));
  for (let i = 0; i < b.length; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

function writeWavHeader(view: DataView, dataLen: number, sr: number, ch: number) {
  const w = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  w(36, 'data');
  view.setUint32(40, dataLen, true);
}
