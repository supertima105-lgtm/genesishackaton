import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clamp, hexToVec3, mulberry32 } from '../../lib/color';
import { ZERO_LEVELS } from '../../lib/liveAudio';
import { reactionFor } from '../../lib/rules/react';
import type { ModeId, StyleParams } from '../../lib/types';
import { beatPulse, type Clock } from './layout';
import { fragmentShader, vertexShader } from './shaders';

interface Props {
  urls: string[];
  style: StyleParams;
  clock: Clock;
  seed: number;
  beatOffset: number;
  onCover?: (b: Blob) => void;
  /** меняется после пересборки стиля — обложка снимается заново */
  coverKey?: number;
}

export function PhotoLayer(props: Props) {
  return (
    <Canvas
      orthographic
      flat
      linear
      dpr={[1, 1.5]}
      gl={{ preserveDrawingBuffer: true, antialias: false, alpha: false }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Suspense fallback={null}>
        <Plane {...props} />
      </Suspense>
    </Canvas>
  );
}

const TRANSITION = { dissolve: 0, cut: 1, wipe: 2, ink: 3 } as const;
const EDGE: Record<ModeId, number> = { impression: 1, ma: 0.8, film: 0, kandinsky: 0, collage: 0 };

function makeUniforms() {
  const f = (v = 0) => ({ value: v });
  return {
    uTexA: { value: null as THREE.Texture | null },
    uTexB: { value: null as THREE.Texture | null },
    uAspectA: f(1),
    uAspectB: f(1),
    uFrameAspect: f(1),
    uZoomA: f(1),
    uZoomB: f(1),
    uDriftA: { value: new THREE.Vector2() },
    uDriftB: { value: new THREE.Vector2() },
    uMix: f(),
    uTransition: { value: 0 },
    uTime: f(),
    uPulse: f(),
    uRes: { value: new THREE.Vector2(1, 1) },
    uSeed: f(),
    uPainterly: f(),
    uGrain: f(),
    uVignette: f(),
    uPosterize: f(),
    uDuotone: f(),
    uHalftone: f(),
    uSaturation: f(1),
    uContrast: f(1),
    uTemperature: f(),
    uHalation: f(),
    uAberration: f(),
    uFade: f(),
    uEdge: f(),
    uKick: f(),
    uDots: f(),
    uPaper: { value: new THREE.Color() },
    uInk: { value: new THREE.Color() },
    uAccent: { value: new THREE.Color() },
  };
}

const aspect = (t: THREE.Texture) => {
  const img = t.image as { width: number; height: number } | undefined;
  return img && img.height ? img.width / img.height : 1;
};

function Plane({ urls, style, clock, seed, beatOffset, onCover, coverKey = 0 }: Props) {
  const textures = useLoader(THREE.TextureLoader, urls) as THREE.Texture[];
  const { size } = useThree();
  const material = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: makeUniforms() }),
    [],
  );

  useEffect(() => {
    textures.forEach((t) => {
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.colorSpace = THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
    });
  }, [textures]);

  useEffect(() => {
    const u = material.uniforms;
    const s = style.shader;
    u.uPainterly.value = s.painterly;
    u.uGrain.value = s.grain;
    u.uVignette.value = s.vignette;
    u.uPosterize.value = s.posterize;
    u.uDuotone.value = s.duotone;
    u.uHalftone.value = s.halftone;
    u.uSaturation.value = s.saturation;
    u.uContrast.value = s.contrast;
    u.uTemperature.value = s.temperature;
    u.uHalation.value = s.halation;
    u.uAberration.value = s.aberration;
    u.uFade.value = s.fade;
    u.uEdge.value = EDGE[style.mode];
    u.uTransition.value = TRANSITION[style.motion.transition];
    u.uSeed.value = (seed % 1000) / 37;
    (u.uPaper.value as THREE.Color).setRGB(...hexToVec3(style.palette.paper));
    (u.uInk.value as THREE.Color).setRGB(...hexToVec3(style.palette.ink));
    (u.uAccent.value as THREE.Color).setRGB(...hexToVec3(style.palette.accent));
  }, [style, material, seed]);

  useEffect(() => () => material.dispose(), [material]);
  const react = useMemo(() => reactionFor(style), [style]);

  // Обложка для архива: снимаем кадр сразу после явной отрисовки, когда буфер гарантированно заполнен.
  const frames = useRef(0);
  const captured = useRef(false);
  useEffect(() => {
    if (!coverKey) return;
    captured.current = false;
    frames.current = 0;
  }, [coverKey]);

  useFrame((state) => {
    const u = material.uniforms;
    const t = clock.time();
    const n = textures.length;
    if (!n) return;
    const { shotSeconds: shot, transitionShare: share, zoom, drift, pulse, bpm } = style.motion;
    const k = Math.floor(t / shot);
    const local = t / shot - k;
    const mix = share > 0 ? clamp((local - (1 - share)) / share) : 0;
    const ta = textures[((k % n) + n) % n];
    const tb = textures[(((k + 1) % n) + n) % n];

    // «Кен Бёрнс»: у каждого кадра свой наезд/отъезд и направление дрейфа (детерминированно от seed).
    const kb = (idx: number, progress: number) => {
      const r = mulberry32(seed + idx * 7919);
      const zoomIn = r() > 0.5;
      const ang = r() * Math.PI * 2;
      const p = clamp(progress);
      const z = 1.02 + zoom * 0.3 + zoom * (zoomIn ? p : 1 - p);
      const d = drift * (p - 0.5);
      return { z, dx: Math.cos(ang) * d, dy: Math.sin(ang) * d };
    };
    const span = 1 + share;
    const A = kb(k, (local + share) / span);
    const B = kb(k + 1, (local - (1 - share)) / span);

    u.uTexA.value = ta;
    u.uTexB.value = tb;
    u.uAspectA.value = aspect(ta);
    u.uAspectB.value = aspect(tb);
    u.uZoomA.value = A.z;
    u.uZoomB.value = B.z;
    (u.uDriftA.value as THREE.Vector2).set(A.dx, A.dy);
    (u.uDriftB.value as THREE.Vector2).set(B.dx, B.dy);
    u.uMix.value = mix;
    u.uPulse.value = clock.playing() ? beatPulse(t, bpm, beatOffset) * pulse : 0;

    // живой звук: каждый режим слышит песню по-своему (см. rules/react.ts)
    const lv = clock.levels?.() ?? ZERO_LEVELS;
    const s = style.shader;
    u.uPainterly.value = s.painterly * (1 + lv.bass * react.brush * 0.7);
    u.uGrain.value = clamp(s.grain + lv.high * react.grain * 0.3);
    u.uHalation.value = clamp(s.halation + lv.level * react.glow * 0.45);
    u.uAberration.value = s.aberration + lv.hit * react.shake * 0.9;
    u.uKick.value = lv.bass * react.kick;
    u.uDots.value = lv.bass * react.dots;
    u.uTime.value = state.clock.elapsedTime;
    (u.uRes.value as THREE.Vector2).set(size.width, size.height);
    u.uFrameAspect.value = size.width / Math.max(1, size.height);

    if (onCover && !captured.current && ++frames.current >= 8) {
      captured.current = true;
      state.gl.render(state.scene, state.camera);
      state.gl.domElement.toBlob((b) => b && onCover(b), 'image/jpeg', 0.9);
    }
  });

  return (
    <mesh frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
