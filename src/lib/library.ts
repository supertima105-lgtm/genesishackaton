import { encodeWav } from './analysis/audio';

/**
 * Готовая музыка дневника: 12 мелодий под разные настроения. Каждая собирается прямо в браузере
 * (OfflineAudioContext) — без интернета и чужих прав. Дальше это обычный аудиофайл: система
 * слушает его темп и энергию так же, как песню, которую человек загрузил сам.
 */

const SR = 22050;
const SECONDS = 32;

type Chord = number[]; // полутона от тоники
type Wave = OscillatorType;

interface Def {
  id: string;
  name: string;
  tags: string;
  color: string;
  bpm: number;
  /** задуманная энергия 0..1: под неё выставляется громкость сведения */
  energy: number;
  root: number; // MIDI тоники
  prog: Chord[];
  barsPerChord?: number;
  swing?: number;
  pad?: { type: Wave; gain: number; filter: number };
  drone?: number;
  arp?: { steps: 8 | 16; pattern: number[]; type: Wave; gain: number; decay: number; octave?: number };
  bass?: { pat: string; type: Wave; gain: number; filter: number };
  bells?: { p: number; gain: number };
  drums?: { kick?: string; snare?: string; hat?: string; open?: string; clap?: string; rim?: string; tom?: string; gain?: number };
  amb?: ('rain' | 'crackle' | 'rumble')[];
}

// ступени лада
const I = [0, 4, 7];
const iii = [4, 7, 11];
const IV = [5, 9, 12];
const V = [7, 11, 14];
const vi = [9, 12, 16];
const Imaj7 = [0, 4, 7, 11];
const ii7 = [2, 5, 9, 12];
const IVmaj7 = [5, 9, 12, 16];
const V7 = [7, 11, 14, 17];
const vi7 = [9, 12, 16, 19];
const i = [0, 3, 7];
const III = [3, 7, 10];
const iv = [5, 8, 12];
const v = [7, 10, 14];
const VI = [8, 12, 15];
const VII = [10, 14, 17];

const DEFS: Def[] = [
  {
    id: 'coffee',
    name: 'Утренний кофе',
    tags: 'лоу-фай · спокойно · тепло',
    color: '#c98a5b',
    bpm: 84,
    energy: 0.35,
    root: 57,
    prog: [Imaj7, vi7, ii7, V7],
    swing: 0.14,
    pad: { type: 'triangle', gain: 0.035, filter: 1600 },
    arp: { steps: 8, pattern: [0, 2, 1, 3, 2, 1, 3, 0], type: 'triangle', gain: 0.035, decay: 0.55 },
    bass: { pat: 'x.......x.......', type: 'sine', gain: 0.24, filter: 400 },
    drone: 0.05,
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x...x...x...x...', gain: 0.8 },
    amb: ['crackle'],
  },
  {
    id: 'rain',
    name: 'Дождь за окном',
    tags: 'грусть · тишина · дождь',
    color: '#7d8a96',
    bpm: 66,
    energy: 0.15,
    root: 57,
    prog: [i, VI, III, VII],
    barsPerChord: 2,
    pad: { type: 'sine', gain: 0.07, filter: 1100 },
    bass: { pat: 'x...............', type: 'sine', gain: 0.16, filter: 300 },
    bells: { p: 0.35, gain: 0.05 },
    drums: { kick: 'x...x...x...x...', gain: 0.6 },
    amb: ['rain'],
  },
  {
    id: 'night',
    name: 'Ночная смена',
    tags: 'техно · ночь · напряжение',
    color: '#3b4a7a',
    bpm: 128,
    energy: 0.8,
    root: 57,
    prog: [i, i, VI, VII],
    pad: { type: 'sawtooth', gain: 0.022, filter: 900 },
    arp: { steps: 16, pattern: [0, 1, 2, 1], type: 'square', gain: 0.022, decay: 0.12 },
    bass: { pat: '..x...x...x...x.', type: 'sawtooth', gain: 0.15, filter: 500 },
    drums: { kick: 'x...x...x...x...', open: '..x...x...x...x.', clap: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', gain: 0.9 },
  },
  {
    id: 'party',
    name: 'Праздник',
    tags: 'танцы · радость · громко',
    color: '#e8505b',
    bpm: 122,
    energy: 0.9,
    root: 60,
    prog: [I, V, vi, IV],
    drone: 0.04,
    pad: { type: 'sawtooth', gain: 0.026, filter: 2600 },
    arp: { steps: 8, pattern: [0, 1, 2, 3], type: 'triangle', gain: 0.05, decay: 0.2 },
    bass: { pat: 'x.o.x.o.x.o.x.o.', type: 'sawtooth', gain: 0.14, filter: 700 },
    drums: { kick: 'x...x...x...x...', clap: '....x.......x...', open: '..x...x...x...x.', hat: 'x.x.x.x.x.x.x.x.', gain: 0.9 },
  },
  {
    id: 'road',
    name: 'Дорога',
    tags: 'путь · движение · светло',
    color: '#6f9a5b',
    bpm: 104,
    energy: 0.6,
    root: 62,
    prog: [I, V, vi, IV],
    pad: { type: 'sine', gain: 0.03, filter: 1500 },
    arp: { steps: 16, pattern: [0, 1, 2, 1, 3, 1, 2, 1], type: 'triangle', gain: 0.042, decay: 0.25 },
    bass: { pat: 'x.....x.x.......', type: 'sine', gain: 0.22, filter: 400 },
    drone: 0.04,
    drums: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', gain: 0.75 },
  },
  {
    id: 'quiet',
    name: 'Тишина',
    tags: 'покой · одиночество · медленно',
    color: '#a7b4b2',
    bpm: 56,
    energy: 0.05,
    root: 55,
    prog: [i, VI],
    barsPerChord: 4,
    pad: { type: 'sine', gain: 0.09, filter: 900 },
    bells: { p: 0.2, gain: 0.05 },
    drums: { kick: 'x...x...x...x...', gain: 0.8 }, // тихий пульс, как сердце
  },
  {
    id: 'evening',
    name: 'Летний вечер',
    tags: 'тепло · лето · легко',
    color: '#f0a64b',
    bpm: 96,
    energy: 0.45,
    root: 60,
    prog: [Imaj7, IVmaj7, Imaj7, V7],
    swing: 0.08,
    arp: { steps: 8, pattern: [0, 2, 1, 3, 2, 1, 0, 2], type: 'triangle', gain: 0.045, decay: 0.35 },
    pad: { type: 'sine', gain: 0.03, filter: 1800 },
    bass: { pat: 'x..x..x.x..x..x.', type: 'sine', gain: 0.2, filter: 350 },
    drone: 0.04,
    drums: { kick: 'x...x...x...x...', rim: 'x..x..x...x..x..', hat: 'xxxxxxxxxxxxxxxx', gain: 0.55 },
  },
  {
    id: 'alarm',
    name: 'Тревога',
    tags: 'спешка · дедлайн · нервы',
    color: '#8b2f3a',
    bpm: 142,
    energy: 0.85,
    root: 57,
    prog: [
      [0, 3, 6],
      [1, 4, 8],
    ],
    barsPerChord: 2,
    pad: { type: 'sawtooth', gain: 0.03, filter: 700 },
    bass: { pat: 'xxxxxxxxxxxxxxxx', type: 'sawtooth', gain: 0.08, filter: 420 },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', gain: 0.85 },
  },
  {
    id: 'nostalgia',
    name: 'Ностальгия',
    tags: 'детство · память · светлая грусть',
    color: '#d9a7a0',
    bpm: 78,
    energy: 0.3,
    root: 60,
    prog: [vi, IV, I, V],
    arp: { steps: 8, pattern: [0, 1, 2, 1], type: 'sine', gain: 0.05, decay: 0.8, octave: 2 },
    pad: { type: 'triangle', gain: 0.045, filter: 1300 },
    drums: { kick: 'x.......x.......', rim: '....x.......x...', gain: 0.5 },
    amb: ['crackle'],
  },
  {
    id: 'snow',
    name: 'Первый снег',
    tags: 'зима · чисто · хрустально',
    color: '#9fc0dd',
    bpm: 70,
    energy: 0.2,
    root: 62,
    prog: [I, iii, vi, IV],
    pad: { type: 'sine', gain: 0.05, filter: 2000 },
    bells: { p: 0.5, gain: 0.045 },
    drone: 0.05,
    drums: { kick: 'x...x...x...x...', hat: 'x.x.x.x.x.x.x.x.', gain: 0.35 },
  },
  {
    id: 'freedom',
    name: 'Свобода',
    tags: 'подъём · гордость · вперёд',
    color: '#4f8fd6',
    bpm: 116,
    energy: 0.85,
    root: 62,
    prog: [I, V, vi, IV],
    pad: { type: 'sawtooth', gain: 0.03, filter: 3000 },
    arp: { steps: 8, pattern: [0, 1, 2, 1], type: 'triangle', gain: 0.04, decay: 0.3 },
    bass: { pat: 'x.x.x.x.x.x.x.x.', type: 'sawtooth', gain: 0.12, filter: 600 },
    drone: 0.04,
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', gain: 1 },
  },
  {
    id: 'storm',
    name: 'Гроза',
    tags: 'буря · страшно · красиво',
    color: '#4a3f66',
    bpm: 84,
    energy: 0.6,
    root: 55,
    prog: [i, VI, iv, v],
    barsPerChord: 2,
    pad: { type: 'sawtooth', gain: 0.04, filter: 600 },
    bass: { pat: 'x.......x.......', type: 'sine', gain: 0.22, filter: 200 },
    drums: { kick: 'x...x...x...x...', tom: '..........x..x.x', gain: 0.9 },
    amb: ['rumble', 'rain'],
  },
];

export interface LibraryTrack {
  id: string;
  name: string;
  tags: string;
  color: string;
  bpm: number;
}

export const LIBRARY: LibraryTrack[] = DEFS.map(({ id, name, tags, color, bpm }) => ({ id, name, tags, color, bpm }));
export const LIBRARY_ARTIST = 'Атмосфера';

// ── синтез ────────────────────────────────────────────────────────

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function rnd(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

class Synth {
  private noise: AudioBuffer;
  private ctx: OfflineAudioContext;
  private out: AudioNode;
  constructor(ctx: OfflineAudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.out = out;
    this.noise = ctx.createBuffer(1, SR * 2, SR);
    const d = this.noise.getChannelData(0);
    for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  }

  /** короткая нота с затуханием */
  note(t: number, f: number, type: Wave, gain: number, decay: number, filter?: number) {
    const { ctx } = this;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    let n: AudioNode = o;
    if (filter) {
      const bq = ctx.createBiquadFilter();
      bq.type = 'lowpass';
      bq.frequency.value = filter;
      o.connect(bq);
      n = bq;
    }
    n.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  /** протяжный аккорд: плавно входит и держится */
  pad(t: number, f: number, dur: number, type: Wave, gain: number, filter: number) {
    const { ctx } = this;
    const g = ctx.createGain();
    const att = Math.min(0.6, dur / 3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + att);
    g.gain.setValueAtTime(gain, t + dur - 0.25);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    const bq = ctx.createBiquadFilter();
    bq.type = 'lowpass';
    bq.frequency.value = filter;
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(bq);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    bq.connect(g).connect(this.out);
  }

  private burst(t: number, gain: number, decay: number, type: BiquadFilterType, freq: number, q = 1) {
    const { ctx } = this;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const bq = ctx.createBiquadFilter();
    bq.type = type;
    bq.frequency.value = freq;
    bq.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    s.connect(bq).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + decay + 0.02);
  }

  kick(t: number, gain: number) {
    const { ctx } = this;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.35);
  }
  snare(t: number, gain: number) {
    this.burst(t, gain * 0.9, 0.2, 'bandpass', 1800, 0.7);
    this.note(t, 180, 'triangle', gain * 0.7, 0.14);
  }
  clap(t: number, gain: number) {
    for (const k of [0, 0.012, 0.024]) this.burst(t + k, gain * 0.4, 0.12, 'bandpass', 1300, 1.2);
  }
  hat(t: number, gain: number, open = false) {
    this.burst(t, gain * (open ? 0.16 : 0.12), open ? 0.22 : 0.04, 'highpass', 7500);
  }
  rim(t: number, gain: number) {
    this.note(t, 1750, 'triangle', gain * 0.18, 0.03);
  }
  tom(t: number, gain: number) {
    const { ctx } = this;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.4);
    g.gain.setValueAtTime(gain * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.55);
  }

  /** фон на всю длину: дождь, треск пластинки, далёкий гром */
  ambience(kind: 'rain' | 'crackle' | 'rumble', r: () => number) {
    const { ctx } = this;
    if (kind === 'rain') {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 500;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      s.connect(hp).connect(lp).connect(g).connect(this.out);
      s.start(0);
      for (let t = 0; t < SECONDS; t += 0.05 + r() * 0.2) this.burst(t, 0.03 + r() * 0.04, 0.03, 'bandpass', 2500 + r() * 3000, 3);
    }
    if (kind === 'crackle') for (let t = 0; t < SECONDS; t += 0.08 + r() * 0.5) this.burst(t, 0.03 + r() * 0.05, 0.008, 'highpass', 3000);
    if (kind === 'rumble')
      for (let t = 1 + r() * 3; t < SECONDS; t += 6 + r() * 6) {
        const s = ctx.createBufferSource();
        s.buffer = this.noise;
        s.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 140;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.9, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
        s.connect(lp).connect(g).connect(this.out);
        s.start(t);
        s.stop(t + 3.6);
      }
  }
}

async function render(def: Def): Promise<Blob> {
  const ctx = new OfflineAudioContext(1, SR * SECONDS, SR);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.9, 0.08);
  master.gain.setValueAtTime(0.9, SECONDS - 1.6);
  master.gain.linearRampToValueAtTime(0, SECONDS);
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  const s = new Synth(ctx, master);
  const r = rnd(def.id.length * 7919 + def.bpm);

  const beat = 60 / def.bpm;
  const bar = beat * 4;
  const step16 = bar / 16;
  const per = def.barsPerChord ?? 1;
  const bars = Math.ceil(SECONDS / bar);
  const at = (b: number, k: number, steps: number) => {
    const d = bar / steps;
    return b * bar + k * d + (k % 2 && def.swing ? def.swing * d : 0);
  };

  for (let b = 0; b < bars; b++) {
    const chord = def.prog[Math.floor(b / per) % def.prog.length];
    const t0 = b * bar;
    if (def.pad && b % per === 0) for (const n of chord) s.pad(t0, hz(def.root + n), bar * per, def.pad.type, def.pad.gain, def.pad.filter);
    // тоника под всем — слух (и анализ) понимает, где «дом» лада
    if (def.drone && b % per === 0) s.pad(t0, hz(def.root - 12), bar * per, 'sine', def.drone, 500);
    if (def.arp) {
      const { steps, pattern, type, gain, decay, octave = 1 } = def.arp;
      for (let k = 0; k < steps; k++) {
        const idx = pattern[k % pattern.length];
        const n = chord[idx % chord.length] + 12 * (octave + Math.floor(idx / chord.length));
        s.note(at(b, k, steps), hz(def.root + n), type, gain, decay, 3500);
      }
    }
    const bass = def.bass;
    if (bass)
      [...bass.pat].forEach((c, k) => {
        if (c === '.') return;
        const n = chord[0] - 24 + (c === 'o' ? 12 : 0);
        s.note(at(b, k, 16), hz(def.root + n), bass.type, bass.gain, step16 * 1.8, bass.filter);
      });
    if (def.bells)
      for (let k = 0; k < 4; k++) if (r() < def.bells.p) s.note(t0 + k * beat + r() * 0.05, hz(def.root + 24 + chord[Math.floor(r() * chord.length)]), 'sine', def.bells.gain, 1.6);
    const dr = def.drums;
    if (dr) {
      const g = dr.gain ?? 0.8;
      const play = (pat: string | undefined, f: (t: number) => void) => {
        if (pat) [...pat].forEach((c, k) => c !== '.' && f(at(b, k, 16)));
      };
      play(dr.kick, (t) => s.kick(t, g));
      play(dr.snare, (t) => s.snare(t, g));
      play(dr.clap, (t) => s.clap(t, g));
      play(dr.hat, (t) => s.hat(t, g));
      play(dr.open, (t) => s.hat(t, g, true));
      play(dr.rim, (t) => s.rim(t, g));
      play(dr.tom, (t) => s.tom(t, g));
    }
  }
  for (const a of def.amb ?? []) s.ambience(a, r);

  const buf = await ctx.startRendering();
  // громкость сведения = задуманная энергия: тихая мелодия звучит тихо, праздник — плотно.
  // Меряем так же, как анализ песни: среднее RMS по кадрам, после мягкого ограничителя.
  const d = buf.getChannelData(0);
  const target = 0.045 + 0.2 * def.energy;
  const hann = Float32Array.from({ length: 2048 }, (_, j) => 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / 2047)); // как в Meyda
  const frameRms = (g: number) => {
    let total = 0;
    let n = 0;
    for (let i = 0; i + 2048 < d.length; i += 4096, n++) {
      let s = 0;
      for (let j = 0; j < 2048; j++) s += (Math.tanh(d[i + j] * g) * hann[j]) ** 2;
      total += Math.sqrt(s / 2048);
    }
    return total / Math.max(1, n);
  };
  let gain = 1;
  for (let it = 0; it < 5; it++) gain *= target / (frameRms(gain) || target);
  for (let k = 0; k < d.length; k++) d[k] = Math.tanh(d[k] * gain);
  return encodeWav(buf);
}

const cache = new Map<string, Promise<Blob>>();

/** Готовая мелодия как аудиофайл — тот же путь, что и у загруженной песни. */
export async function libraryFile(id: string): Promise<File> {
  const def = DEFS.find((d) => d.id === id);
  if (!def) throw new Error(`нет мелодии ${id}`);
  if (!cache.has(id)) cache.set(id, render(def));
  const blob = await cache.get(id)!;
  return new File([blob], `${LIBRARY_ARTIST} — ${def.name}.wav`, { type: 'audio/wav' });
}
