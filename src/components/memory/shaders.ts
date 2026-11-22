/**
 * Один «убер-шейдер» на все режимы. Режим дня — это набор чисел (почерк страницы).
 * Кадр неподвижный; униформы камеры и переходов остаются в покое (зум 1, без перехода).
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
uniform vec4 uCamA; // zoom, центр x, центр y, поворот
uniform vec4 uCamB;
uniform int uTrans;
uniform float uTransP;
uniform vec2 uTransDir;
uniform int uReveal;
uniform float uRevealP;
uniform float uTime;
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
uniform float uExposure;
uniform float uTemperature;
uniform float uHalation;
uniform float uAberration;
uniform float uFade;
uniform float uEdge;
uniform float uDots;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uBlur;
uniform vec2 uBlurDir;
uniform float uGlitch;
uniform float uMosaic;
uniform float uRipple;

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

// камера: поворот в пропорциях экрана, вписывание фото «cover», наезд к точке интереса
vec2 camUV(vec2 uv, float imgAspect, vec4 cam) {
  vec2 p = uv - 0.5;
  p.x *= uFrameAspect;
  float c = cos(cam.w);
  float s = sin(cam.w);
  p = mat2(c, -s, s, c) * p;
  p.x /= uFrameAspect;
  if (imgAspect > uFrameAspect) p.x *= uFrameAspect / imgAspect;
  else p.y *= imgAspect / uFrameAspect;
  p /= cam.x;
  vec2 q = p + cam.yz;
  q = 1.0 - abs(1.0 - abs(q)); // зеркально у краёв, без чёрных полей
  return q;
}

// Кувахара: среднее того квадранта, где цвет ровнее. Радиус — в пикселях экрана, отсчёты плотные,
// а квадранты смешиваются мягко — поэтому мазок без квадратов и ступенек.
vec3 kuwahara(sampler2D t, vec2 uv, float zoom, float amt) {
  vec2 px = vec2(1.0 / max(uRes.x, uRes.y)) / max(zoom, 0.5);
  float r = 1.2 + amt * 4.5;
  vec2 jit = (vec2(fbm(uv * 60.0 + uSeed), fbm(uv * 60.0 - uSeed)) - 0.5) * px * r * 1.2; // направление мазка
  vec3 m0 = vec3(0.0); vec3 m1 = vec3(0.0); vec3 m2 = vec3(0.0); vec3 m3 = vec3(0.0);
  vec3 s0 = vec3(0.0); vec3 s1 = vec3(0.0); vec3 s2 = vec3(0.0); vec3 s3 = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(float(i), float(j)) * (r / 3.0) * px;
      vec2 u = uv + jit;
      vec3 c;
      c = texture2D(t, u + vec2(-o.x, -o.y)).rgb; m0 += c; s0 += c * c;
      c = texture2D(t, u + vec2( o.x, -o.y)).rgb; m1 += c; s1 += c * c;
      c = texture2D(t, u + vec2(-o.x,  o.y)).rgb; m2 += c; s2 += c * c;
      c = texture2D(t, u + vec2( o.x,  o.y)).rgb; m3 += c; s3 += c * c;
    }
  }
  m0 /= 16.0; m1 /= 16.0; m2 /= 16.0; m3 /= 16.0;
  vec3 v0 = abs(s0 / 16.0 - m0 * m0);
  vec3 v1 = abs(s1 / 16.0 - m1 * m1);
  vec3 v2 = abs(s2 / 16.0 - m2 * m2);
  vec3 v3 = abs(s3 / 16.0 - m3 * m3);
  float w0 = 1.0 / (1e-4 + pow(v0.r + v0.g + v0.b, 2.0));
  float w1 = 1.0 / (1e-4 + pow(v1.r + v1.g + v1.b, 2.0));
  float w2 = 1.0 / (1e-4 + pow(v2.r + v2.g + v2.b, 2.0));
  float w3 = 1.0 / (1e-4 + pow(v3.r + v3.g + v3.b, 2.0));
  return (m0 * w0 + m1 * w1 + m2 * w2 + m3 * w3) / (w0 + w1 + w2 + w3);
}

vec3 sampleTex(sampler2D t, vec2 uv, vec4 cam) {
  vec3 c;
  if (uBlur > 0.02) {
    vec2 dir = length(uBlurDir) > 0.0 ? uBlurDir * 0.07 / cam.x : (uv - cam.yz) * 0.22;
    c = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float k = (float(i) / 11.0 - 0.5) * uBlur;
      c += texture2D(t, uv + dir * k).rgb;
    }
    c /= 12.0;
  } else if (uPainterly > 0.02) c = kuwahara(t, uv, cam.x, uPainterly);
  else c = texture2D(t, uv).rgb;
  if (uAberration > 0.01) {
    vec2 d = (uv - cam.yz) * uAberration * 0.016;
    c.r = mix(c.r, texture2D(t, uv + d).r, 0.85);
    c.b = mix(c.b, texture2D(t, uv - d).b, 0.85);
  }
  return c;
}

// 0 склейка 1 наплыв 2 в затемнение 3 вспышка 4 шторка 5 диафрагма 6 тушь 7 засветка 8 сквозь кадр
// 9 смаз 10 сбой 11 мозаика 12 рябь 13 прожиг 14 жалюзи 15 циферблат 16 через бумагу 17 затвор
float transMask(vec2 uv) {
  float p = uTransP;
  vec2 a = vec2(uFrameAspect, 1.0);
  if (uTrans == 0 || uTrans == 2 || uTrans == 3 || uTrans == 9 || uTrans == 11 || uTrans == 16 || uTrans == 17) return step(0.5, p);
  if (uTrans == 4) {
    vec2 d = normalize(uTransDir);
    float e = dot((uv - 0.5) * a, d) / (0.5 * (abs(d.x) * uFrameAspect + abs(d.y))) * 0.5 + 0.5;
    return 1.0 - smoothstep(p * 1.12 - 0.06, p * 1.12, e);
  }
  if (uTrans == 5) {
    float r = length((uv - 0.5) * a);
    float R = 0.5 * length(a) * 1.05 * p;
    return 1.0 - smoothstep(R - 0.025, R, r);
  }
  if (uTrans == 6) {
    float n = fbm(uv * a * 3.0 + uSeed);
    return smoothstep(n - 0.12, n + 0.12, p * 1.3 - 0.15);
  }
  if (uTrans == 10) {
    float band = floor(uv.y * 22.0);
    return step(hash(vec2(band, floor(uTime * 24.0))), p * 1.1 - 0.05);
  }
  if (uTrans == 13) {
    float n = fbm(uv * a * 2.5 + uSeed) * 0.7 + length((uv - vec2(0.2, 0.8)) * a) * 0.35;
    return smoothstep(n - 0.03, n, p * 1.25);
  }
  if (uTrans == 14) {
    float k = fract((uTransDir.x > 0.0 ? uv.x : uv.y) * 8.0);
    return smoothstep(k - 0.06, k, p * 1.06);
  }
  if (uTrans == 15) {
    vec2 q = (uv - 0.5) * a;
    float ang = fract(atan(q.x, q.y) / 6.28318 + 1.0);
    return smoothstep(ang - 0.015, ang, p * 1.02);
  }
  if (uTrans == 12) return smoothstep(0.3, 0.7, p);
  if (uTrans == 7) return smoothstep(0.25, 0.75, p);
  return smoothstep(0.0, 1.0, p);
}

void main() {
  vec2 uv = vUv;

  // рябь и мозаика — искажают сам экран
  if (uRipple > 0.001) {
    vec2 q = (uv - 0.5) * vec2(uFrameAspect, 1.0);
    float d = length(q);
    uv += normalize(q + 1e-5) * sin(d * 46.0 - uTime * 7.0) * 0.012 * uRipple;
  }
  if (uMosaic > 0.001) {
    float cell = mix(1.0 / 900.0, 1.0 / 14.0, uMosaic * uMosaic);
    vec2 cs = vec2(cell / uFrameAspect, cell);
    uv = (floor(uv / cs) + 0.5) * cs;
  }
  // сбой: горизонтальные полосы съезжают
  if (uGlitch > 0.01) {
    float band = floor(uv.y * 26.0);
    float r = hash(vec2(band, floor(uTime * 18.0)));
    if (r < uGlitch * 0.45) uv.x += (hash(vec2(band, 7.0)) - 0.5) * 0.12 * uGlitch;
  }

  vec2 uvA = camUV(uv, uAspectA, uCamA);
  vec2 uvB = camUV(uv, uAspectB, uCamB);
  float m = uTrans < 0 ? 0.0 : transMask(uv);

  vec3 col;
  if (m <= 0.001) col = sampleTex(uTexA, uvA, uCamA);
  else if (m >= 0.999) col = sampleTex(uTexB, uvB, uCamB);
  else col = mix(sampleTex(uTexA, uvA, uCamA), sampleTex(uTexB, uvB, uCamB), m);

  if (uGlitch > 0.01) {
    float band = floor(uv.y * 26.0);
    float r = hash(vec2(band + 3.0, floor(uTime * 18.0)));
    if (r < uGlitch * 0.35) col = vec3(col.r, col.g * 0.6, col.b * 1.3) + vec3(0.08, 0.0, 0.1) * uGlitch;
  }

  // переходы через цвет: затемнение, вспышка, бумага, затвор
  float tp = uTransP;
  if (uTrans == 2 || uTrans == 3 || uTrans == 16) {
    vec3 tone = uTrans == 2 ? vec3(0.0) : uTrans == 3 ? vec3(1.0) : uPaper;
    float k = 1.0 - smoothstep(0.0, 0.5, abs(tp - 0.5));
    col = mix(col, tone, k);
  }
  if (uTrans == 17) {
    float k = 1.0 - smoothstep(0.0, 0.5, abs(tp - 0.5));
    col = mix(col, vec3(0.02), step(0.5 * (1.0 - k), abs(vUv.y - 0.5)));
  }
  if (uTrans == 7) { // засветка: тёплый свет заливает с края
    float g = sin(3.14159 * tp) * smoothstep(1.2, 0.0, length((vUv - vec2(1.0, 0.85)) * vec2(uFrameAspect, 1.0)) - tp * 0.5);
    col += vec3(1.0, 0.55, 0.2) * g * 1.1;
  }
  if (uTrans == 13) { // кромка прожига
    float n = fbm(uv * vec2(uFrameAspect, 1.0) * 2.5 + uSeed) * 0.7 + length((uv - vec2(0.2, 0.8)) * vec2(uFrameAspect, 1.0)) * 0.35;
    float e = smoothstep(n - 0.12, n - 0.03, tp * 1.25) - smoothstep(n - 0.03, n, tp * 1.25);
    col += vec3(1.0, 0.6, 0.2) * e * 2.2;
  }

  // тон и цвет
  col *= exp2(uExposure * 1.6);
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

  float hl = smoothstep(0.55, 1.0, l);
  col += uHalation * hl * vec3(1.0, 0.5, 0.28) * 0.42;

  float gr = hash(uv * uRes + fract(uTime * 7.13) * 91.7) - 0.5;
  col += gr * uGrain * 0.24;

  vec2 q = vUv - 0.5;
  float v = 1.0 - dot(q, q) * 2.4;
  col *= mix(1.0, smoothstep(0.0, 1.0, v), clamp(uVignette, 0.0, 1.0));

  // удар доли
  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));

  // проявление в начале круга и уход в конце
  float rp = clamp(uRevealP, 0.0, 1.0);
  if (uReveal > 0 && rp < 0.999) {
    vec2 a = vec2(uFrameAspect, 1.0);
    if (uReveal == 1) { // полароид проявляется: молочно-голубой → цвет
      vec3 milk = mix(uPaper, vec3(0.78, 0.86, 0.86), 0.5);
      col = mix(mix(milk, vec3(l) * 0.5 + milk * 0.5, smoothstep(0.0, 0.6, rp)), col, pow(rp, 1.6));
    } else if (uReveal == 2) {
      col *= pow(rp, 1.4);
    } else if (uReveal == 4 || uReveal == 5) { // тушь / мазками — из бумаги
      float n = uReveal == 4 ? fbm(vUv * a * 3.2 + uSeed) : fbm(vUv * vec2(uFrameAspect * 9.0, 2.2) + uSeed);
      col = mix(uPaper, col, smoothstep(n - 0.1, n + 0.1, rp * 1.3 - 0.15));
    } else if (uReveal == 7) {
      col = mix(vec3(1.0), col, smoothstep(0.0, 1.0, rp));
    } else if (uReveal == 8) {
      float r = length((vUv - 0.5) * a);
      float R = 0.5 * length(a) * 1.05 * rp;
      col = mix(uInk * 0.6, col, 1.0 - smoothstep(R - 0.02, R, r));
    } else if (uReveal == 9) {
      col = mix(uPaper, col, smoothstep(0.0, 1.0, rp));
    } else if (uReveal == 10) {
      float band = floor(vUv.y * 18.0);
      col *= step(hash(vec2(band, floor(uTime * 12.0))), rp * 1.15);
    } else {
      col = mix(uPaper, col, smoothstep(0.0, 0.6, rp));
    }
  }

  // рваный край: фото «впитывается» в бумагу (импрессионизм, суми-э)
  if (uEdge > 0.01) {
    float e = min(min(vUv.x, 1.0 - vUv.x) * uFrameAspect, min(vUv.y, 1.0 - vUv.y));
    // кромка неровная, но узкая: фото на весь лист не должно терять края
    float rough = fbm(vUv * vec2(uFrameAspect, 1.0) * 9.0 + uSeed) * 0.04 * uEdge;
    float em = smoothstep(0.0, 0.02 * uEdge + 0.001, e - rough);
    col = mix(uPaper, col, em);
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
