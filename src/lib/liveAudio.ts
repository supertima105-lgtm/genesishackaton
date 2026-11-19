import { beatPulse } from '../components/memory/layout';

/**
 * Живой звук песни → числа для шейдера и графики, 60 раз в секунду.
 * Звук не перенаправляется: мы «подслушиваем» элемент через captureStream,
 * поэтому песня играет как обычно, даже если анализ недоступен.
 */
export interface Levels {
  level: number; // громкость 0..1
  bass: number; // низ (удары, бас) относительно среднего по песне
  high: number; // верх (тарелки, «воздух»)
  hit: number; // 1 в момент удара, быстро спадает
}

export const ZERO_LEVELS: Levels = { level: 0, bass: 0, high: 0, hit: 0 };

interface Tap {
  analyser: AnalyserNode;
  freq: Uint8Array<ArrayBuffer>;
  wave: Uint8Array<ArrayBuffer>;
  prev: Float32Array;
  avgBass: number;
  avgHigh: number;
  avgFlux: number;
  s: Levels;
  at: number;
}

let ctx: AudioContext | null = null;
const taps = new WeakMap<HTMLMediaElement, Tap | 'failed'>();

/** Вызывать из обработчика клика: браузер разрешает звук только после жеста. */
export function resumeAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* без Web Audio страница всё равно живёт в доли */
  }
}

function tap(media: HTMLMediaElement): Tap | null {
  const known = taps.get(media);
  if (known) return known === 'failed' ? null : known;
  const m = media as HTMLMediaElement & { captureStream?: () => MediaStream };
  if (!m.captureStream || media.paused || media.readyState < 2) return null; // попробуем на следующем кадре
  try {
    const stream = m.captureStream();
    if (!stream.getAudioTracks().length) return null;
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    src.connect(analyser); // в динамики не подключаем — звук идёт из самого элемента
    const t: Tap = {
      analyser,
      freq: new Uint8Array(analyser.frequencyBinCount),
      wave: new Uint8Array(analyser.fftSize),
      prev: new Float32Array(analyser.frequencyBinCount),
      avgBass: 0.4,
      avgHigh: 0.25,
      avgFlux: 0.02,
      s: { ...ZERO_LEVELS },
      at: 0,
    };
    taps.set(media, t);
    return t;
  } catch {
    taps.set(media, 'failed');
    return null;
  }
}

const band = (a: Uint8Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i];
  return s / (255 * Math.max(1, to - from));
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const follow = (cur: number, target: number, attack: number, release: number) =>
  cur + (target - cur) * (target > cur ? attack : release);

/** Уровни прямо сейчас; null — если этот элемент нельзя услышать (другой домен, нет captureStream). */
export function readLevels(media: HTMLMediaElement): Levels | null {
  const t = tap(media);
  if (!t) return null;
  const now = performance.now();
  if (now - t.at < 10) return t.s; // несколько слоёв читают в одном кадре
  const dt = t.at ? Math.min(0.1, (now - t.at) / 1000) : 1 / 60;
  t.at = now;

  const { analyser, freq, wave, prev } = t;
  analyser.getByteFrequencyData(freq);
  analyser.getByteTimeDomainData(wave);
  const hz = analyser.context.sampleRate / analyser.fftSize;
  const bin = (f: number) => Math.max(1, Math.min(freq.length - 1, Math.round(f / hz)));

  let sq = 0;
  for (let i = 0; i < wave.length; i++) {
    const v = (wave[i] - 128) / 128;
    sq += v * v;
  }
  const rms = Math.sqrt(sq / wave.length);
  const bass = band(freq, bin(35), bin(180));
  const high = band(freq, bin(2500), bin(9000));

  // удар = резкий рост спектра снизу и в середине (spectral flux)
  let flux = 0;
  const top = bin(2000);
  for (let i = 1; i < top; i++) {
    const v = freq[i] / 255;
    if (v > prev[i]) flux += v - prev[i];
    prev[i] = v;
  }
  flux /= top;

  // средние по песне медленно подстраиваются — так тихий джаз и громкий рок двигают страницу одинаково живо
  t.avgBass += (bass - t.avgBass) * dt * 0.5;
  t.avgHigh += (high - t.avgHigh) * dt * 0.5;
  t.avgFlux += (flux - t.avgFlux) * dt * 1.2;

  const s = t.s;
  s.level = follow(s.level, clamp01(rms * 2.6), 0.5, 0.08);
  s.bass = follow(s.bass, clamp01(0.35 + (bass - t.avgBass) * 4.5), 0.65, 0.12);
  s.high = follow(s.high, clamp01(0.3 + (high - t.avgHigh) * 6), 0.5, 0.1);
  const isHit = flux > t.avgFlux * 1.9 && flux > 0.012;
  s.hit = isHit ? 1 : s.hit * Math.exp(-dt * 9);
  return s;
}

/**
 * Если песня дана только ссылкой (iframe сервиса не «слышно»), уровни строятся из темпа и энергии,
 * которые оценил Gemini: страница всё равно дышит в доли.
 */
export function synthLevels(t: number, bpm: number, offset: number, energy: number): Levels {
  const p = beatPulse(t, bpm, offset);
  const bar = beatPulse(t, bpm / 4, offset);
  return {
    level: 0.35 + 0.4 * energy + 0.15 * p,
    bass: 0.25 + 0.6 * p * (0.5 + energy * 0.5),
    high: 0.3 + 0.2 * Math.sin(t * 2.1) * energy,
    hit: bar > 0.9 ? 1 : p * 0.3,
  };
}
