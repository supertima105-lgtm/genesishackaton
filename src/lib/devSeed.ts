import { encodeWav } from './analysis/audio';
import { createDay } from './pipeline';

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

export async function seedDemo() {
  const days = [
    {
      date: '2026-10-12',
      text: 'Гуляли с девушкой по парку, всё в жёлтых листьях. Было холодно, но мы пили какао из термоса и долго разговаривали на скамейке у пруда. Солнце садилось, было тепло и спокойно.',
      photos: [await photo(autumn, 3, 'a1.jpg'), await photo(autumn, 7, 'a2.jpg'), await photo(autumn, 11, 'a3.jpg')],
      artist: 'Frank Sinatra',
      title: 'Autumn in New York',
      link: 'https://open.spotify.com/track/0Bp1cgsS8DHEJyR6vQCuXq',
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
