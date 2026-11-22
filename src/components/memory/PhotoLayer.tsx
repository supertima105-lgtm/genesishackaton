import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { hexToVec3 } from '../../lib/color';
import type { ModeId, StyleParams } from '../../lib/types';
import { fragmentShader, vertexShader } from './shaders';

interface Props {
  url: string;
  style: StyleParams;
  seed: number;
  onCover?: (b: Blob) => void;
  /** меняется после пересборки стиля — обложка снимается заново */
  coverKey?: number;
}

/** Фото дня в его почерке (шейдер режима). Кадр неподвижный: рисуется заново только при смене стиля или размера. */
export function PhotoLayer(props: Props) {
  return (
    <Canvas
      orthographic
      flat
      linear
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true, antialias: false, alpha: false }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Suspense fallback={null}>
        <Plane {...props} />
      </Suspense>
    </Canvas>
  );
}

const EDGE: Record<ModeId, number> = { impression: 1, ma: 0.8, film: 0, kandinsky: 0, collage: 0 };

function makeUniforms() {
  const f = (v = 0) => ({ value: v });
  const v4 = () => ({ value: new THREE.Vector4(1, 0.5, 0.5, 0) });
  return {
    uTexA: { value: null as THREE.Texture | null },
    uTexB: { value: null as THREE.Texture | null },
    uAspectA: f(1),
    uAspectB: f(1),
    uFrameAspect: f(1),
    uCamA: v4(),
    uCamB: v4(),
    uTrans: { value: -1 },
    uTransP: f(),
    uTransDir: { value: new THREE.Vector2(1, 0) },
    uReveal: { value: 0 },
    uRevealP: f(1),
    uTime: f(),
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
    uExposure: f(),
    uTemperature: f(),
    uHalation: f(),
    uAberration: f(),
    uFade: f(),
    uEdge: f(),
    uDots: f(),
    uFlash: f(),
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uBlur: f(),
    uBlurDir: { value: new THREE.Vector2() },
    uGlitch: f(),
    uMosaic: f(),
    uRipple: f(),
    uPaper: { value: new THREE.Color() },
    uInk: { value: new THREE.Color() },
    uAccent: { value: new THREE.Color() },
  };
}

function Plane({ url, style, seed, onCover, coverKey = 0 }: Props) {
  const texture = useLoader(THREE.TextureLoader, url) as THREE.Texture;
  const { size, invalidate } = useThree();
  const material = useMemo(() => new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: makeUniforms() }), []);

  useEffect(() => {
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    invalidate();
  }, [texture, invalidate]);

  useEffect(() => {
    const u = material.uniforms;
    const s = style.shader;
    const img = texture.image as { width: number; height: number } | undefined;
    const aspect = img && img.height ? img.width / img.height : 1;
    u.uTexA.value = texture;
    u.uTexB.value = texture;
    u.uAspectA.value = aspect;
    u.uAspectB.value = aspect;
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
    u.uSeed.value = (seed % 1000) / 37;
    (u.uPaper.value as THREE.Color).setRGB(...hexToVec3(style.palette.paper));
    (u.uInk.value as THREE.Color).setRGB(...hexToVec3(style.palette.ink));
    (u.uAccent.value as THREE.Color).setRGB(...hexToVec3(style.palette.accent));
    invalidate();
  }, [style, material, seed, texture, invalidate]);

  useEffect(() => () => material.dispose(), [material]);

  // Обложка для архива: снимаем первый отрисованный кадр (и заново после пересборки стиля).
  const captured = useRef(false);
  useEffect(() => {
    if (!coverKey) return;
    captured.current = false;
    invalidate();
  }, [coverKey, invalidate]);

  useFrame((state) => {
    const u = material.uniforms;
    (u.uRes.value as THREE.Vector2).set(size.width * state.viewport.dpr, size.height * state.viewport.dpr);
    u.uFrameAspect.value = size.width / Math.max(1, size.height);
    if (onCover && !captured.current && u.uTexA.value) {
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
