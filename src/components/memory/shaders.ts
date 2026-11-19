/**
 * Один «убер-шейдер» на все режимы. Режим дня — это только набор чисел (uniforms),
 * поэтому Моне, Кандинский, плёнка, суми-э и коллаж говорят на одном визуальном языке.
 */
export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const fragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uAspectA;
uniform float uAspectB;
uniform float uFrameAspect;
uniform float uZoomA;
uniform float uZoomB;
uniform vec2 uDriftA;
uniform vec2 uDriftB;
uniform float uMix;
uniform int uTransition; // 0 наплыв, 1 склейка, 2 шторка, 3 тушь
uniform float uTime;
uniform float uPulse;
uniform vec2 uRes;
uniform float uSeed;

uniform float uPainterly;
uniform float uGrain;
uniform float uVignette;
uniform float uPosterize;
uniform float uDuotone;
uniform float uHalftone;
uniform float uSaturation;
uniform float uContrast;
uniform float uTemperature;
uniform float uHalation;
uniform float uAberration;
uniform float uFade;
uniform float uEdge;
uniform float uKick; // живой бас → кадр вздрагивает
uniform float uDots; // живой бас → растр крупнее

uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uAccent;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

vec2 cover(vec2 uv, float imgAspect, float zoom, vec2 drift) {
  vec2 p = uv - 0.5;
  if (imgAspect > uFrameAspect) p.x *= uFrameAspect / imgAspect;
  else p.y *= imgAspect / uFrameAspect;
  p /= zoom;
  p += drift;
  return clamp(p + 0.5, 0.001, 0.999);
}

// Фильтр Кувахары: в каждой точке берём среднее того квадранта, где цвет ровнее всего.
// Детали исчезают, края остаются — получается мазок кисти.
vec3 kuwahara(sampler2D t, vec2 uv, vec2 texel, float r) {
  vec3 m0 = vec3(0.0); vec3 m1 = vec3(0.0); vec3 m2 = vec3(0.0); vec3 m3 = vec3(0.0);
  vec3 s0 = vec3(0.0); vec3 s1 = vec3(0.0); vec3 s2 = vec3(0.0); vec3 s3 = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(float(i), float(j)) * r * texel;
      vec3 c;
      c = texture2D(t, uv + vec2(-o.x, -o.y)).rgb; m0 += c; s0 += c * c;
      c = texture2D(t, uv + vec2( o.x, -o.y)).rgb; m1 += c; s1 += c * c;
      c = texture2D(t, uv + vec2(-o.x,  o.y)).rgb; m2 += c; s2 += c * c;
      c = texture2D(t, uv + vec2( o.x,  o.y)).rgb; m3 += c; s3 += c * c;
    }
  }
  m0 /= 16.0; m1 /= 16.0; m2 /= 16.0; m3 /= 16.0;
  vec3 v0 = abs(s0 / 16.0 - m0 * m0);
  vec3 v1 = abs(s1 / 16.0 - m1 * m1);
  vec3 v2 = abs(s2 / 16.0 - m2 * m2);
  vec3 v3 = abs(s3 / 16.0 - m3 * m3);
  float e0 = v0.r + v0.g + v0.b;
  float e1 = v1.r + v1.g + v1.b;
  float e2 = v2.r + v2.g + v2.b;
  float e3 = v3.r + v3.g + v3.b;
  vec3 res = m0; float best = e0;
  if (e1 < best) { best = e1; res = m1; }
  if (e2 < best) { best = e2; res = m2; }
  if (e3 < best) { res = m3; }
  return res;
}

vec3 sampleTex(sampler2D t, vec2 uv) {
  vec3 c;
  if (uPainterly > 0.02) c = kuwahara(t, uv, vec2(1.0 / 1300.0), uPainterly * 3.2);
  else c = texture2D(t, uv).rgb;
  if (uAberration > 0.01) {
    vec2 d = (uv - 0.5) * uAberration * 0.014;
    c.r = mix(c.r, texture2D(t, uv + d).r, 0.85);
    c.b = mix(c.b, texture2D(t, uv - d).b, 0.85);
  }
  return c;
}

float transitionMask(vec2 uv) {
  if (uTransition == 1) return step(0.999, uMix);
  if (uTransition == 2) {
    float edge = uv.x * 0.82 + (1.0 - uv.y) * 0.18;
    return smoothstep(edge - 0.004, edge + 0.004, uMix * 1.02);
  }
  if (uTransition == 3) {
    float n = fbm(uv * vec2(uFrameAspect, 1.0) * 3.0 + uSeed);
    return smoothstep(n - 0.12, n + 0.12, uMix * 1.3 - 0.15);
  }
  return smoothstep(0.0, 1.0, uMix);
}

void main() {
  vec2 uv = vUv;
  float zoomPulse = 1.0 + uPulse * 0.012 + uKick * 0.03;
  vec2 uvA = cover(uv, uAspectA, uZoomA * zoomPulse, uDriftA);
  vec2 uvB = cover(uv, uAspectB, uZoomB * zoomPulse, uDriftB);
  float m = transitionMask(uv);

  vec3 col;
  if (m <= 0.001) col = sampleTex(uTexA, uvA);
  else if (m >= 0.999) col = sampleTex(uTexB, uvB);
  else col = mix(sampleTex(uTexA, uvA), sampleTex(uTexB, uvB), m);

  // температура и тон
  col.r += uTemperature * 0.06;
  col.g += uTemperature * 0.012;
  col.b -= uTemperature * 0.07;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  col = col * (1.0 - uFade * 0.22) + uFade * 0.22 * mix(vec3(0.5), uPaper, 0.6);

  if (uPosterize > 0.01) {
    float lv = mix(24.0, 3.5, uPosterize);
    col = floor(col * lv + 0.5) / lv;
  }

  l = dot(clamp(col, 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722));
  vec3 duo = l < 0.5 ? mix(uInk, uAccent, l * 2.0) : mix(uAccent, uPaper, (l - 0.5) * 2.0);
  col = mix(col, duo, uDuotone);

  if (uHalftone > 0.01) {
    vec2 st = uv * vec2(uFrameAspect, 1.0) * 85.0;
    mat2 R = mat2(0.707, -0.707, 0.707, 0.707);
    vec2 g = fract(R * st) - 0.5;
    float radius = sqrt(clamp(1.0 - l, 0.0, 1.0)) * 0.62 * (1.0 + uDots * 0.35);
    float dotMask = 1.0 - smoothstep(radius - 0.07, radius + 0.07, length(g));
    vec3 ht = mix(mix(uPaper, col, 0.75), col * 0.3, dotMask);
    col = mix(col, ht, uHalftone);
  }

  float hl = smoothstep(0.62, 1.0, l);
  col += uHalation * hl * vec3(1.0, 0.42, 0.22) * 0.38;

  float gr = hash(uv * uRes + fract(uTime * 7.13) * 91.7) - 0.5;
  col += gr * uGrain * 0.24;

  vec2 q = uv - 0.5;
  float v = 1.0 - dot(q, q) * 2.4;
  col *= mix(1.0, smoothstep(0.0, 1.0, v), uVignette);

  col += uPulse * 0.03 * uAccent;

  // рваный край: фото «впитывается» в бумагу (импрессионизм, суми-э)
  if (uEdge > 0.01) {
    float e = min(min(uv.x, 1.0 - uv.x) * uFrameAspect, min(uv.y, 1.0 - uv.y));
    float rough = fbm(uv * vec2(uFrameAspect, 1.0) * 7.0 + uSeed) * 0.07 * uEdge;
    float em = smoothstep(0.0, 0.035 * uEdge + 0.001, e - rough);
    col = mix(uPaper, col, em);
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
