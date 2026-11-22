import { encodeWav } from './analysis/audio';
import { createDay } from './pipeline';
import { store } from './storage';

/**
 * Только для разработки: window.__seedDemo() создаёт 5 контрастных тестовых дней
 * с синтетическими «фото» (canvas) и синтетическими треками (OfflineAudioContext),
 * чтобы проверить «проверку лентой» без реальных материалов.
 */

type Scene = (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void;

function rnd(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

async function photo(scene: Scene, seed: number, name: string): Promise<File> {
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 900;
  const g = c.getContext('2d')!;
  scene(g, c.width, c.height, rnd(seed));
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.9));
  return new File([blob], name, { type: 'image/jpeg' });
}

const grad = (g: CanvasRenderingContext2D, h: number, stops: string[]) => {
  const lg = g.createLinearGradient(0, 0, 0, h);
  stops.forEach((s, i) => lg.addColorStop(i / (stops.length - 1), s));
  return lg;
};

const autumn: Scene = (g, w, h, r) => {
  g.fillStyle = grad(g, h, ['#f3d9a4', '#e7a65a', '#a5652e']);
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = '#3d2a1c';
    g.fillRect(r() * w, h * 0.25, 14 + r() * 18, h);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = ['#e2a032', '#c96f1e', '#f2c14e', '#9b4a17'][i % 4];
    g.beginPath();
    g.ellipse(r() * w, r() * h, 6 + r() * 10, 3 + r() * 5, r() * 3, 0, 7);
    g.fill();
  }
  g.fillStyle = '#5b2f1a';
  g.beginPath();
  g.ellipse(w * 0.55, h * 0.8, 70, 90, 0, 0, 7);
  g.fill();
};

const office: Scene = (g, w, h, r) => {
  g.fillStyle = grad(g, h, ['#0b1220', '#18233a', '#0d1422']);
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = r() > 0.7 ? '#9cc3ff' : '#2b3b5c';
    g.fillRect((i % 10) * 120 + 10, Math.floor(i / 10) * 110 + 40, 90, 60);
  }
  g.fillStyle = '#d8e6ff';
  g.fillRect(w * 0.3, h * 0.55, w * 0.4, h * 0.28);
  g.fillStyle = '#1a2438';
  g.fillRect(w * 0.32, h * 0.57, w * 0.36, h * 0.24);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = '#58f';
    g.fillRect(w * 0.34, h * 0.59 + i * 16, w * (0.1 + r() * 0.2), 6);
  }
};

const rain: Scene = (g, w, h, r) => {
  g.fillStyle = grad(g, h, ['#aeb6bd', '#8a949c', '#5d666e']);
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(230,236,240,.35)';
  for (let i = 0; i < 400; i++) {
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 4, y + 22);
    g.stroke();
  }
  g.fillStyle = '#3e454b';
  g.fillRect(w * 0.45, h * 0.35, w * 0.08, h * 0.5);
  g.beginPath();
  g.arc(w * 0.49, h * 0.32, 40, 0, 7);
  g.fill();
};

const party: Scene = (g, w, h, r) => {
  g.fillStyle = grad(g, h, ['#ff5d8f', '#ffb347', '#47c6ff']);
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = ['#ffe14d', '#ff3d6e', '#4dd2ff', '#7cff6b', '#ffffff'][i % 5];
    g.beginPath();
    g.arc(r() * w, r() * h, 6 + r() * 40, 0, 7);
    g.fill();
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = '#2a1640';
    g.beginPath();
    g.arc(120 + i * 190, h * 0.62, 45, 0, 7);
    g.fill();
    g.fillRect(85 + i * 190, h * 0.66, 70, h);
  }
};

const dacha: Scene = (g, w, h, r) => {
  g.fillStyle = grad(g, h, ['#cfe6ef', '#e9e2b8', '#7fa85a']);
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#8a5a3c';
  g.fillRect(w * 0.15, h * 0.35, w * 0.35, h * 0.35);
  g.fillStyle = '#a0412d';
  g.beginPath();
  g.moveTo(w * 0.12, h * 0.36);
  g.lineTo(w * 0.325, h * 0.18);
  g.lineTo(w * 0.53, h * 0.36);
  g.fill();
  for (let i = 0; i < 300; i++) {
    g.fillStyle = ['#e35d4f', '#f4d35e', '#ffffff', '#6aa84f'][i % 4];
    g.fillRect(r() * w, h * 0.72 + r() * h * 0.28, 5, 5);
  }
};

async function track(bpm: number, minor: boolean, energy: number, seconds = 30): Promise<File> {
  const sr = 22050;
  const ctx = new OfflineAudioContext(1, sr * seconds, sr);
  const beat = 60 / bpm;
  const root = minor ? 220 : 261.63;
  const chord = minor ? [1, 1.189, 1.498] : [1, 1.26, 1.498];
  // пэд
  for (const k of chord) {
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = root * k;
    gn.gain.value = 0.08;
    o.connect(gn).connect(ctx.destination);
    o.start(0);
  }
  // бочка и хэт
  for (let t = 0; t < seconds; t += beat) {
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    gn.gain.setValueAtTime(0.25 + energy * 0.6, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(gn).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.3);
    if (energy > 0.5) {
      const n = ctx.createBufferSource();
      const b = ctx.createBuffer(1, sr * 0.05, sr);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      n.buffer = b;
      const hg = ctx.createGain();
      hg.gain.value = 0.15 * energy;
      n.connect(hg).connect(ctx.destination);
      n.start(t + beat / 2);
    }
  }
  const buf = await ctx.startRendering();
  return new File([encodeWav(buf)], `demo-${bpm}.wav`, { type: 'audio/wav' });
}

// ── ноябрь целиком: помощники для быстрых «фото» ──────────────────

type G = CanvasRenderingContext2D;
const bg = (g: G, w: number, h: number, stops: string[]) => {
  g.fillStyle = grad(g, h, stops);
  g.fillRect(0, 0, w, h);
};
/** россыпь кругов: снег, огни, конфетти, звёзды */
const dots = (g: G, w: number, h: number, r: () => number, n: number, colors: string[], min: number, max: number, y0 = 0, y1 = 1, alpha = 1) => {
  g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    g.beginPath();
    g.arc(r() * w, (y0 + r() * (y1 - y0)) * h, min + r() * (max - min), 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
};
/** гряда холмов или гор */
const ridge = (g: G, w: number, h: number, r: () => number, y: number, amp: number, color: string, sharp = false) => {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += sharp ? 90 : 30) g.lineTo(x, h * y - (sharp ? r() * amp * h : Math.sin(x / 140 + y * 9) * amp * h * 0.5 + r() * 6));
  g.lineTo(w, h);
  g.fill();
};
const glow = (g: G, x: number, y: number, rad: number, color: string) => {
  const rg = g.createRadialGradient(x, y, 0, x, y, rad);
  rg.addColorStop(0, color);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
};
const lines = (g: G, w: number, h: number, r: () => number, n: number, color: string, dx: number, dy: number, width = 1.5) => {
  g.strokeStyle = color;
  g.lineWidth = width;
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + dx, y + dy);
    g.stroke();
  }
  g.lineWidth = 1;
};
const blocks = (g: G, w: number, h: number, r: () => number, n: number, colors: string[], y: number, minH: number, maxH: number) => {
  for (let i = 0; i < n; i++) {
    const bw = w / n;
    const bh = (minH + r() * (maxH - minH)) * h;
    g.fillStyle = colors[i % colors.length];
    g.fillRect(i * bw, h * y - bh, bw - 4, bh + h);
  }
};

const S: Record<string, Scene> = {
  firstSnow: (g, w, h, r) => {
    bg(g, w, h, ['#c9d6e3', '#e8eef3', '#ffffff']);
    blocks(g, w, h, r, 7, ['#7f8c99', '#95a2ad', '#6d7a87'], 0.75, 0.15, 0.35);
    dots(g, w, h, r, 30, ['#ffd27a'], 6, 10, 0.5, 0.7);
    dots(g, w, h, r, 700, ['#ffffff'], 1.5, 6);
  },
  sea: (g, w, h, r) => {
    bg(g, w, h, ['#8fb3c9', '#4f7f9c', '#1f4d6b']);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.4})`;
      g.lineWidth = 3;
      g.beginPath();
      const y = h * (0.45 + i * 0.02);
      for (let x = 0; x <= w; x += 20) g.lineTo(x, y + Math.sin(x / 50 + i) * 8);
      g.stroke();
    }
    g.fillStyle = '#d9c9a3';
    g.fillRect(0, h * 0.88, w, h);
  },
  neonCity: (g, w, h, r) => {
    bg(g, w, h, ['#120b24', '#25124a', '#0a0612']);
    blocks(g, w, h, r, 12, ['#1b1530', '#231b3d'], 0.95, 0.3, 0.75);
    for (let i = 0; i < 40; i++) glow(g, r() * w, h * (0.3 + r() * 0.6), 20 + r() * 60, ['rgba(255,60,170,.55)', 'rgba(60,220,255,.5)', 'rgba(255,200,60,.5)'][i % 3]);
  },
  morningRun: (g, w, h, r) => {
    bg(g, w, h, ['#ffb88a', '#ffd9a8', '#f4efe2']);
    glow(g, w * 0.7, h * 0.42, 260, 'rgba(255,240,200,.9)');
    ridge(g, w, h, r, 0.62, 0.05, '#c98f6b');
    g.fillStyle = '#b5523b';
    g.fillRect(0, h * 0.72, w, h);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = '#f4efe2';
      g.fillRect(0, h * (0.76 + i * 0.05), w, 4);
    }
  },
  concert: (g, w, h, r) => {
    bg(g, w, h, ['#05030a', '#140820', '#05030a']);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = ['rgba(255,40,90,.22)', 'rgba(80,120,255,.22)', 'rgba(255,220,90,.2)'][i % 3];
      g.beginPath();
      const x = w * (0.1 + i * 0.1);
      g.moveTo(x, 0);
      g.lineTo(x - 160 + r() * 320, h * 0.8);
      g.lineTo(x + 40 + r() * 160, h * 0.8);
      g.fill();
    }
    dots(g, w, h, r, 160, ['#0b0710'], 18, 34, 0.82, 1.02);
    dots(g, w, h, r, 30, ['#fff6c8'], 2, 4, 0.6, 0.8);
  },
  baking: (g, w, h, r) => {
    bg(g, w, h, ['#fbe3b6', '#f0c27f', '#c7894a']);
    dots(g, w, h, r, 6, ['#fff8ec'], 80, 130, 0.45, 0.85);
    dots(g, w, h, r, 40, ['#b8652f', '#8a4421', '#e9a35b'], 12, 30, 0.45, 0.85);
    dots(g, w, h, r, 400, ['rgba(255,255,255,.7)'], 1, 3);
  },
  sickDay: (g, w, h, r) => {
    bg(g, w, h, ['#dfe5dd', '#cfd8cf', '#b8c2b9']);
    g.fillStyle = '#f7f7f2';
    g.fillRect(w * 0.1, h * 0.55, w * 0.8, h * 0.35);
    g.fillStyle = '#9fb3c6';
    g.fillRect(w * 0.6, h * 0.12, w * 0.28, h * 0.32);
    dots(g, w, h, r, 3, ['#e8eef0'], 30, 50, 0.6, 0.7);
  },
  train: (g, w, h, r) => {
    bg(g, w, h, ['#9eb7c4', '#c9cfb6', '#7d8b5a']);
    ridge(g, w, h, r, 0.55, 0.08, '#6f7f56');
    lines(g, w, h, r, 260, 'rgba(255,255,255,.35)', 220, 0, 2);
    g.fillStyle = '#3a3a3f';
    g.fillRect(0, 0, w, h * 0.12);
    g.fillRect(0, h * 0.88, w, h);
  },
  mountains: (g, w, h, r) => {
    bg(g, w, h, ['#6f9fd6', '#b8d3ee', '#eef4fa']);
    ridge(g, w, h, r, 0.55, 0.35, '#5b6f86', true);
    ridge(g, w, h, r, 0.7, 0.2, '#e9f0f7', true);
    ridge(g, w, h, r, 0.9, 0.08, '#3f5a3b');
  },
  cinema: (g, w, h, r) => {
    bg(g, w, h, ['#08080c', '#121218', '#050507']);
    g.fillStyle = '#d8e4ff';
    g.fillRect(w * 0.15, h * 0.12, w * 0.7, h * 0.36);
    glow(g, w * 0.5, h * 0.3, 520, 'rgba(160,190,255,.25)');
    for (let row = 0; row < 4; row++) dots(g, w, h, r, 14, ['#16161c'], 26, 32, 0.62 + row * 0.1, 0.64 + row * 0.1);
  },
  forest: (g, w, h, r) => {
    bg(g, w, h, ['#2f4a33', '#1e3323', '#132116']);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = ['#0f1a10', '#203522', '#2c472d'][i % 3];
      const x = r() * w;
      g.beginPath();
      g.moveTo(x, h * (0.1 + r() * 0.3));
      g.lineTo(x - 70, h);
      g.lineTo(x + 70, h);
      g.fill();
    }
    dots(g, w, h, r, 14, ['#c0452f', '#e8d7b0'], 8, 16, 0.85, 0.97);
    glow(g, w * 0.3, 0, 400, 'rgba(220,240,180,.25)');
  },
  exam: (g, w, h, r) => {
    bg(g, w, h, ['#f1ece0', '#e6dfcf', '#d8cfbb']);
    for (let i = 0; i < 22; i++) {
      g.fillStyle = 'rgba(40,50,90,.35)';
      g.fillRect(w * 0.15, h * (0.12 + i * 0.035), w * (0.3 + r() * 0.4), 3);
    }
    g.fillStyle = '#c23b2e';
    g.fillRect(w * 0.08, 0, 3, h);
    dots(g, w, h, r, 4, ['rgba(120,80,40,.25)'], 40, 70, 0.7, 0.9);
  },
  lakeDawn: (g, w, h, r) => {
    bg(g, w, h, ['#f6b6a8', '#f7d6b8', '#c9b9d6']);
    glow(g, w * 0.5, h * 0.5, 200, 'rgba(255,230,190,.9)');
    g.fillStyle = 'rgba(150,140,190,.75)';
    g.fillRect(0, h * 0.52, w, h);
    lines(g, w, h, r, 80, 'rgba(255,230,210,.5)', 60, 0, 2);
    ridge(g, w, h, r, 0.53, 0.04, '#6c6488');
  },
  football: (g, w, h, r) => {
    bg(g, w, h, ['#0d1424', '#1b2a44', '#2e6b34']);
    for (let i = 0; i < 4; i++) glow(g, w * (0.1 + i * 0.27), h * 0.08, 160, 'rgba(255,255,230,.7)');
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#357d38' : '#43964a';
      g.fillRect(0, h * (0.55 + i * 0.075), w, h * 0.075);
    }
    dots(g, w, h, r, 400, ['#e33', '#fff', '#36c'], 3, 6, 0.3, 0.52);
  },
  museum: (g, w, h, r) => {
    bg(g, w, h, ['#f4f2ee', '#ecebe6', '#cfccc4']);
    const pal = ['#2b4c7e', '#c8553d', '#f2c14e', '#3f7d58', '#5e3c58'];
    for (let i = 0; i < 3; i++) {
      g.fillStyle = '#2a2622';
      g.fillRect(w * (0.08 + i * 0.31) - 10, h * 0.2 - 10, w * 0.24 + 20, h * 0.36 + 20);
      for (let k = 0; k < 6; k++) {
        g.fillStyle = pal[(i + k) % pal.length];
        g.fillRect(w * (0.08 + i * 0.31) + r() * w * 0.16, h * 0.2 + r() * h * 0.28, 30 + r() * 70, 20 + r() * 60);
      }
    }
    g.fillStyle = '#a89f92';
    g.fillRect(0, h * 0.82, w, h);
  },
  cafe: (g, w, h, r) => {
    bg(g, w, h, ['#6b4430', '#8c5a3c', '#4a2e20']);
    for (let i = 0; i < 8; i++) glow(g, r() * w, h * 0.15, 90, 'rgba(255,200,120,.6)');
    dots(g, w, h, r, 4, ['#f3ead8'], 50, 70, 0.6, 0.8);
    dots(g, w, h, r, 4, ['#3b2316'], 30, 44, 0.6, 0.8);
  },
  airport: (g, w, h) => {
    bg(g, w, h, ['#8ea4b8', '#c3cfda', '#e6ebef']);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = '#2e3842';
      g.fillRect(i * (w / 6), 0, 8, h * 0.7);
    }
    g.fillStyle = '#4f5d6b';
    g.beginPath();
    g.ellipse(w * 0.55, h * 0.4, 220, 26, -0.15, 0, 7);
    g.fill();
    g.fillRect(w * 0.48, h * 0.32, 90, 14);
    g.fillStyle = '#9aa4ad';
    g.fillRect(0, h * 0.7, w, h);
  },
  moving: (g, w, h, r) => {
    bg(g, w, h, ['#efe7da', '#e2d6c2', '#cdbb9e']);
    for (let i = 0; i < 9; i++) {
      const bw = 140 + r() * 140;
      const x = r() * (w - bw);
      const y = h * (0.35 + r() * 0.45);
      g.fillStyle = ['#b98b55', '#a87a46', '#c99c66'][i % 3];
      g.fillRect(x, y, bw, bw * 0.7);
      g.fillStyle = 'rgba(240,230,200,.8)';
      g.fillRect(x + bw / 2 - 12, y, 24, bw * 0.7);
    }
  },
  fairLights: (g, w, h, r) => {
    bg(g, w, h, ['#160f1c', '#24152a', '#0d0a10']);
    for (let row = 0; row < 4; row++) {
      for (let x = 0; x < w; x += 46) glow(g, x, h * (0.12 + row * 0.12) + Math.sin(x / 120) * 30, 26, 'rgba(255,200,110,.95)');
    }
    blocks(g, w, h, r, 6, ['#3b2a1f', '#4a3424'], 0.98, 0.25, 0.35);
    dots(g, w, h, r, 300, ['rgba(255,255,255,.8)'], 1, 3);
  },
  candle: (g, w, h) => {
    bg(g, w, h, ['#15151a', '#1f1f26', '#0c0c0f']);
    g.fillStyle = '#e9e1cf';
    g.fillRect(w * 0.48, h * 0.5, 40, 180);
    glow(g, w * 0.48 + 20, h * 0.46, 220, 'rgba(255,190,90,.45)');
    glow(g, w * 0.48 + 20, h * 0.46, 30, 'rgba(255,240,200,1)');
  },
  wedding: (g, w, h, r) => {
    bg(g, w, h, ['#fff4f2', '#fde3e3', '#f5ccd2']);
    dots(g, w, h, r, 90, ['#f28ca3', '#ffffff', '#f6c1cc', '#9fc79a'], 14, 40, 0, 0.35);
    dots(g, w, h, r, 200, ['#ffffff', '#ffd7e0'], 2, 6);
    glow(g, w * 0.5, h * 0.6, 300, 'rgba(255,255,255,.8)');
  },
  iceRink: (g, w, h, r) => {
    bg(g, w, h, ['#3d5f86', '#b7d7ef', '#e6f3fb']);
    g.fillStyle = '#eaf6fd';
    g.fillRect(0, h * 0.55, w, h);
    lines(g, w, h, r, 120, 'rgba(120,160,200,.45)', 180, 40, 2);
    for (let x = 0; x < w; x += 60) glow(g, x, h * 0.1, 30, 'rgba(255,240,180,.9)');
  },
  boardGames: (g, w, h, r) => {
    bg(g, w, h, ['#7a4b2c', '#94603a', '#5a361f']);
    g.fillStyle = '#efe2c4';
    g.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
    g.fillStyle = '#c9b48a';
    for (let i = 0; i < 8; i++) for (let k = 0; k < 8; k++) if ((i + k) % 2) g.fillRect(w * 0.2 + i * w * 0.075, h * 0.2 + k * h * 0.075, w * 0.075, h * 0.075);
    dots(g, w, h, r, 14, ['#c0392b', '#2471a3', '#f1c40f', '#27ae60'], 14, 22, 0.25, 0.75);
  },
  storm: (g, w, h, r) => {
    bg(g, w, h, ['#1d1530', '#3a2c55', '#14101e']);
    lines(g, w, h, r, 500, 'rgba(200,200,255,.25)', -8, 40);
    g.strokeStyle = '#f4f0ff';
    g.lineWidth = 5;
    g.beginPath();
    let x = w * 0.6;
    g.moveTo(x, 0);
    for (let y = 0; y < h * 0.8; y += 60) g.lineTo((x += -40 + r() * 80), y);
    g.stroke();
    g.lineWidth = 1;
    glow(g, w * 0.6, h * 0.2, 400, 'rgba(220,210,255,.35)');
  },
  shelter: (g, w, h, r) => {
    bg(g, w, h, ['#cfe3c4', '#e7efd9', '#b9a27c']);
    for (let i = 0; i < 4; i++) {
      const x = w * (0.15 + i * 0.22);
      g.fillStyle = ['#8b5a2b', '#3b3b3b', '#d9a066', '#f2efe8'][i];
      g.beginPath();
      g.ellipse(x, h * 0.7, 70, 40, 0, 0, 7);
      g.fill();
      g.beginPath();
      g.arc(x + 60, h * 0.6, 30, 0, 7);
      g.fill();
    }
    dots(g, w, h, r, 60, ['#e74c3c', '#f1c40f'], 3, 6, 0.85, 1);
  },
  goldenField: (g, w, h, r) => {
    bg(g, w, h, ['#f5a65b', '#f9d48b', '#d9a441']);
    glow(g, w * 0.3, h * 0.45, 240, 'rgba(255,240,190,.95)');
    lines(g, w, h, r, 600, 'rgba(140,90,20,.5)', 4, -40, 2);
    ridge(g, w, h, r, 0.55, 0.05, 'rgba(120,80,40,.35)');
  },
  rooftop: (g, w, h, r) => {
    bg(g, w, h, ['#050a1f', '#0f1d45', '#1c2b55']);
    dots(g, w, h, r, 500, ['#ffffff', '#cfd8ff'], 0.6, 2.2, 0, 0.7);
    blocks(g, w, h, r, 14, ['#070b18', '#0b1124'], 1, 0.1, 0.3);
    dots(g, w, h, r, 40, ['#ffd27a'], 2, 4, 0.75, 0.95);
  },
  market: (g, w, h, r) => {
    bg(g, w, h, ['#f4e9d8', '#e8d7bb', '#a87d4f']);
    const fruit = [['#e74c3c', '#c0392b'], ['#f39c12', '#e67e22'], ['#27ae60', '#2ecc71'], ['#8e44ad', '#f1c40f']];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = '#8a5d36';
      g.fillRect(w * (0.04 + i * 0.24), h * 0.5, w * 0.22, h * 0.4);
      dots(g, w, h, r, 60, fruit[i], 10, 18, 0.42, 0.55);
    }
    for (let i = 0; i < 12; i++) {
      g.fillStyle = i % 2 ? '#c0392b' : '#fdf6e3';
      g.fillRect(i * (w / 12), 0, w / 12, h * 0.12);
    }
  },
  karaoke: (g, w, h, r) => {
    bg(g, w, h, ['#3a0a4a', '#7a1f6e', '#1e0526']);
    dots(g, w, h, r, 120, ['rgba(255,80,200,.6)', 'rgba(80,200,255,.6)', 'rgba(255,240,120,.6)'], 6, 26);
    g.fillStyle = '#111';
    g.fillRect(w * 0.48, h * 0.4, 14, h * 0.5);
    g.beginPath();
    g.arc(w * 0.48 + 7, h * 0.38, 26, 0, 7);
    g.fill();
  },
  office,
};

interface SeedDay {
  date: string;
  text: string;
  scenes: [keyof typeof S, number][];
  artist: string;
  title: string;
}

/** Ноябрь 2026 целиком: у каждого дня свой характер (3 и 8 ноября уже есть в примерах). */
const NOVEMBER: SeedDay[] = [
  { date: '2026-11-01', text: 'Первый снег! Проснулся, а за окном всё белое. Выбежал во двор в тапках, ловил снежинки ртом как ребёнок. Тихо, светло и как-то очень чисто.', scenes: [['firstSnow', 1], ['firstSnow', 2]], artist: 'Sufjan Stevens', title: 'Holland' },
  { date: '2026-11-02', text: 'Понедельник, офис, бесконечные созвоны. Начальник опять переносит сроки. Устал, раздражён, хочется просто тишины. Вечером долго сидел в машине у подъезда.', scenes: [['office', 21]], artist: 'Radiohead', title: 'Everything In Its Right Place' },
  { date: '2026-11-04', text: 'Уехали на море на один день. Холодный ветер, пустой пляж, волны огромные. Кричали в ветер и смеялись. Свобода!', scenes: [['sea', 3], ['sea', 5]], artist: 'Florence + The Machine', title: 'Dog Days Are Over' },
  { date: '2026-11-05', text: 'Ночью гуляли по центру с друзьями: неон, витрины, шум машин. Ели шаурму на ходу и спорили о кино до трёх утра.', scenes: [['neonCity', 7], ['neonCity', 9]], artist: 'The Weeknd', title: 'Blinding Lights' },
  { date: '2026-11-06', text: 'Утренняя пробежка, первая за месяц. Рассвет розовый, ноги гудят, но в голове ясно. Горжусь собой.', scenes: [['morningRun', 4]], artist: 'Survivor', title: 'Eye of the Tiger' },
  { date: '2026-11-07', text: 'Концерт любимой группы! Толпа, свет, бас в груди, сорвал голос. Мурашки на первой же песне. Лучший вечер года.', scenes: [['concert', 11], ['concert', 13], ['concert', 17]], artist: 'Arctic Monkeys', title: 'Do I Wanna Know?' },
  { date: '2026-11-09', text: 'Пекли с мамой пирожки по бабушкиному рецепту. Вся кухня в муке, пахнет корицей. Мама рассказывала, какой была маленькой.', scenes: [['baking', 6], ['baking', 8]], artist: 'Ella Fitzgerald', title: 'Dream a Little Dream of Me' },
  { date: '2026-11-10', text: 'Заболел. Температура, всё ломит, лежу под одеялом и смотрю в потолок. Скучно и жалко себя. Чай с лимоном и тишина.', scenes: [['sickDay', 2]], artist: 'Billie Eilish', title: "when the party's over" },
  { date: '2026-11-11', text: 'Поезд в другой город к брату. Восемь часов в окне поля, леса, станции. Читал, дремал, думал о жизни. Дорога лечит.', scenes: [['train', 5], ['train', 12]], artist: 'Simon & Garfunkel', title: 'Homeward Bound' },
  { date: '2026-11-12', text: 'С братом поднялись на гору. Холодно, ветер, но наверху такой вид, что перехватило дыхание. Стояли молча и смотрели.', scenes: [['mountains', 3], ['mountains', 7]], artist: 'Hans Zimmer', title: 'Time' },
  { date: '2026-11-13', text: 'Пошёл в кино один на старый фильм. Пустой зал, попкорн, на экране чёрно-белая любовь. Вышел тихим и немного влюблённым в жизнь.', scenes: [['cinema', 4]], artist: 'Ludovico Einaudi', title: 'Nuvole Bianche' },
  { date: '2026-11-14', text: 'В лесу за грибами, хоть уже и поздно. Нашли всего три гриба, но зато сырость, мох, тишина и запах хвои. Спокойно.', scenes: [['forest', 6], ['forest', 10]], artist: 'Bon Iver', title: 'Holocene' },
  { date: '2026-11-15', text: 'Экзамен завтра, а я ничего не знаю. Страх, паника, пятая чашка кофе. Конспекты везде. Пальцы дрожат.', scenes: [['exam', 9]], artist: 'Nine Inch Nails', title: 'Hurt' },
  { date: '2026-11-16', text: 'Сдал экзамен на отлично! Не верю. Позвонил маме, она плакала от радости. Облегчение и гордость.', scenes: [['exam', 14], ['goldenField', 3]], artist: 'Queen', title: "Don't Stop Me Now" },
  { date: '2026-11-17', text: 'Рыбалка с отцом на рассвете. Туман над озером, ничего не поймали. Почти не разговаривали, но было хорошо вдвоём.', scenes: [['lakeDawn', 8]], artist: 'Fleetwood Mac', title: 'Landslide' },
  { date: '2026-11-18', text: 'Футбол на стадионе, наши проиграли на последней минуте. Злость, обида, орали на судью. Потом всё равно смеялись всю дорогу домой.', scenes: [['football', 5], ['football', 15]], artist: 'Kasabian', title: 'Fire' },
  { date: '2026-11-19', text: 'Музей современного искусства. Половину не понял, но одна картина зацепила так, что стоял перед ней минут двадцать. Удивление.', scenes: [['museum', 2], ['museum', 6]], artist: 'Erik Satie', title: 'Gymnopédie No. 1' },
  { date: '2026-11-20', text: 'Встретились в кафе с девушкой, с которой расстались год назад. Говорили спокойно, по-взрослому. Грустно и светло одновременно.', scenes: [['cafe', 7]], artist: 'Adele', title: 'Someone Like You' },
  { date: '2026-11-21', text: 'Проводил лучшего друга в аэропорту, он уезжает жить в другую страну. Обнялись, он ушёл за стекло. Пусто внутри.', scenes: [['airport', 4]], artist: 'Coldplay', title: 'Fix You' },
  { date: '2026-11-22', text: 'Переезд в новую квартиру! Коробки везде, спина болит, пиццу ели на полу. Но это наш дом. Предвкушение.', scenes: [['moving', 3], ['moving', 11]], artist: 'Vampire Weekend', title: 'A-Punk' },
  { date: '2026-11-23', text: 'В центре открылась ярмарка. Гирлянды, глинтвейн, запах имбирного печенья. Уже чувствуется праздник.', scenes: [['fairLights', 5], ['market', 13]], artist: 'Michael Bublé', title: "It's Beginning to Look a Lot Like Christmas" },
  { date: '2026-11-24', text: 'Годовщина смерти деда. Зажгли свечу, смотрели старые фото, молчали. Очень его не хватает.', scenes: [['candle', 1]], artist: 'Max Richter', title: 'On the Nature of Daylight' },
  { date: '2026-11-25', text: 'Свадьба сестры! Цветы, белое платье, все плакали и танцевали до утра. Сестра такая счастливая. Любовь вокруг.', scenes: [['wedding', 4], ['wedding', 8], ['wedding', 12]], artist: 'Ed Sheeran', title: 'Perfect' },
  { date: '2026-11-26', text: 'Каток с племянниками. Падали, смеялись, мокрые и румяные. Горячий шоколад после. Беззаботно, как в детстве.', scenes: [['iceRink', 6], ['iceRink', 10]], artist: 'ABBA', title: 'Dancing Queen' },
  { date: '2026-11-27', text: 'Вечер настолок с семьёй. Папа жульничал в монополию, мама обиделась понарошку. Уютно, тепло, громко.', scenes: [['boardGames', 2]], artist: 'Paul McCartney', title: 'Wonderful Christmastime' },
  { date: '2026-11-28', text: 'Гроза в ноябре! Свет вырубило, сидели при свечах, гром такой, что дрожали окна. Страшно и красиво.', scenes: [['storm', 7], ['storm', 3]], artist: 'Led Zeppelin', title: 'When the Levee Breaks' },
  { date: '2026-11-29', text: 'Волонтёрил в приюте для собак. Гуляли с ними в поле, одна псина не отходила ни на шаг. Кажется, я её заберу.', scenes: [['shelter', 5], ['goldenField', 9]], artist: 'Pharrell Williams', title: 'Happy' },
  { date: '2026-11-30', text: 'Последний вечер ноября: караоке с друзьями, потом поднялись на крышу. Звёзды, холод, плед и термос. Думал, каким был этот месяц. Благодарен.', scenes: [['karaoke', 4], ['rooftop', 8]], artist: 'Pink Floyd', title: 'Wish You Were Here' },
];

/**
 * Только в dev: window.__seedNovember() добавляет в архив весь ноябрь (без треков — музыку оценит Gemini по названию).
 * __seedNovember(['2026-11-06']) пересоздаёт только эти даты (например, если Gemini не ответил и сработала эвристика).
 */
export async function seedNovember(only?: string[]) {
  const out: string[] = [];
  if (only) for (const old of await store.list()) if (only.includes(old.date)) await store.remove(old);
  for (const d of NOVEMBER.filter((x) => !only || only.includes(x.date))) {
    const photos: File[] = [];
    for (let i = 0; i < d.scenes.length; i++) photos.push(await photo(S[d.scenes[i][0]], d.scenes[i][1], `n${i}.jpg`));
    const day = await createDay({ date: d.date, text: d.text, photos, artist: d.artist, title: d.title }, () => {});
    out.push(`${d.date} ${day.title} → ${day.style.mode}/${day.style.secondary} (${day.signals.text.source})`);
    console.log(out[out.length - 1]);
  }
  return out;
}

// ── весь год картинками: без Gemini и без треков, только локальный разбор ──

const SEASON: Record<string, [keyof typeof S, string][]> = {
  winter: [['firstSnow', 'Снег во дворе'], ['iceRink', 'Каток вечером'], ['mountains', 'Горы в инее'], ['candle', 'Тихий вечер со свечой'], ['cinema', 'Кино в выходной'], ['rooftop', 'Звёзды над крышами'], ['boardGames', 'Настолки дома'], ['fairLights', 'Огни в городе']],
  spring: [['lakeDawn', 'Рассвет у озера'], ['morningRun', 'Утренняя пробежка'], ['wedding', 'Цветы и праздник'], ['museum', 'День в музее'], ['cafe', 'Кофе с другом'], ['market', 'Рынок по субботам'], ['rain', 'Весенний дождь'], ['train', 'Дорога за город']],
  summer: [['sea', 'День у моря'], ['goldenField', 'Золотое поле'], ['dacha', 'Лето на даче'], ['forest', 'Прогулка в лесу'], ['concert', 'Концерт под открытым небом'], ['football', 'Футбол вечером'], ['party', 'Праздник у друзей'], ['neonCity', 'Ночной город']],
  autumn: [['autumn', 'Жёлтые листья'], ['rain', 'Дождь за окном'], ['forest', 'Осенний лес'], ['office', 'Работа допоздна'], ['baking', 'Пирог на кухне'], ['train', 'Поезд домой'], ['cafe', 'Тёплое кафе'], ['storm', 'Гроза ночью']],
};
const seasonOf = (m: number) => (m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn');

/**
 * Только в dev: window.__seedYear() заполняет все пустые дни года до сегодня одной картинкой.
 * Сеть не трогает: текст — эвристика, музыка — оценка, фото маленькие.
 */
export async function seedYear(year = 2026) {
  const { analyzePhotos, decodeImage, resizeToJpeg } = await import('./analysis/photo');
  const { analyzeTextHeuristic } = await import('./analysis/text');
  const { buildStyle } = await import('./rules/engine');
  const { folderName, folderPath } = await import('./folder');
  const today = new Date().toISOString().slice(0, 10);
  const taken = new Set((await store.list()).map((d) => d.date));
  let n = 0;
  for (let t = new Date(Date.UTC(year, 0, 1)); ; t.setUTCDate(t.getUTCDate() + 1)) {
    const date = t.toISOString().slice(0, 10);
    if (date > today || !date.startsWith(String(year))) break;
    if (taken.has(date)) continue;
    const seed = Number(date.replace(/-/g, '')) % 100000;
    const r = rnd(seed);
    const pool = SEASON[seasonOf(t.getUTCMonth() + 1)];
    const [scene, phrase] = pool[Math.floor(r() * pool.length)];
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 360;
    S[scene](c.getContext('2d')!, c.width, c.height, rnd(seed + 7));
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.8));
    const bmp = await decodeImage(blob);
    const photoSig = analyzePhotos([bmp]);
    const text = analyzeTextHeuristic(phrase, date);
    text.title = phrase;
    const music = { bpm: 70 + Math.round(r() * 70), beatOffset: 0, energy: r(), brightness: r(), mode: r() > 0.4 ? 'major' : 'minor', source: 'estimated' } as const;
    const id = crypto.randomUUID();
    const built = buildStyle(text, photoSig, music, id);
    const base = folderPath(date, phrase, id);
    const ref = await store.putFile(`${base}/photo-1.jpg`, await resizeToJpeg(bmp));
    bmp.close?.();
    await store.save({
      id,
      folder: folderName(date, phrase),
      title: phrase,
      date,
      createdAt: new Date().toISOString(),
      text: phrase,
      photos: [ref],
      song: { artist: '', title: '', checked: false },
      signals: { text, photo: photoSig, music },
      ...built,
      version: 1,
    });
    n++;
  }
  console.log(`[seedYear] добавлено дней: ${n}`);
  return n;
}

export async function seedDemo() {
  const days = [
    {
      date: '2026-10-12',
      text: 'Гуляли с девушкой по парку, всё в жёлтых листьях. Было холодно, но мы пили какао из термоса и долго разговаривали на скамейке у пруда. Солнце садилось, было тепло и спокойно.',
      photos: [await photo(autumn, 3, 'a1.jpg'), await photo(autumn, 7, 'a2.jpg'), await photo(autumn, 11, 'a3.jpg')],
      artist: 'Frank Sinatra',
      title: 'Autumn in New York',
      link: 'https://music.yandex.ru/album/156125/track/33773819',
    },
    {
      date: '2026-10-28',
      text: 'Срочная сдача проекта, дедлайн в девять утра. Ночь в офисе, третий кофе, нервы, ничего не успеваем. В наушниках техно, за окном пустой город и фонари.',
      photos: [await photo(office, 5, 'o1.jpg'), await photo(office, 9, 'o2.jpg')],
      artist: 'Demo',
      title: 'Night Shift 128',
      audio: await track(128, true, 0.9),
    },
    {
      date: '2026-11-03',
      text: 'Весь день один дома. Дождь, серо, немного грустно и пусто. Читал книгу у окна и слушал, как стучит дождь.',
      photos: [await photo(rain, 2, 'r1.jpg')],
      artist: 'Demo',
      title: 'Slow Rain',
      audio: await track(68, true, 0.15),
    },
    {
      date: '2026-11-08',
      text: 'День рождения у друзей! Толпа людей, танцы до ночи, все смеялись, было громко, весело и шумно. Счастье.',
      photos: [await photo(party, 4, 'p1.jpg'), await photo(party, 8, 'p2.jpg'), await photo(party, 12, 'p3.jpg')],
      artist: 'Demo',
      title: 'Happy Upbeat',
      audio: await track(124, false, 0.85),
    },
    {
      date: '2026-11-15',
      text: 'Приехали к бабушке на дачу, как раньше в детстве. Пили чай с пирогом всей семьёй, вспоминали старые фотографии из альбома. Лето, которое помню до сих пор.',
      photos: [await photo(dacha, 6, 'd1.jpg'), await photo(dacha, 10, 'd2.jpg')],
      artist: 'ABBA',
      title: 'Chiquitita',
      link: 'https://music.yandex.ru/album/3742/track/31009',
    },
  ];
  const out = [];
  for (const d of days) {
    const day = await createDay(d, (s) => console.log(`[seed] ${s.label}: ${s.status} ${s.detail ?? ''}`));
    out.push(`${day.folder} → ${day.style.mode}/${day.style.secondary}`);
  }
  console.table(out);
  return out;
}
