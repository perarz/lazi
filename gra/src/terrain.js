/* Teren niszczalny per-piksel.
   Maska Uint8Array jest JEDYNĄ prawdą o kolizjach — warstwa graficzna
   (render.js) rysuje tylko to, co maska już mówi.

   Mapa nigdy nie leci przez sieć: to seed + lista kraterów, czyli
   kilkaset bajtów zamiast 2 MB. rebuild() odtwarza ją u każdego. */

import { mulberry32, valueNoise1D, randRange, randInt, smoothstep } from './rng.js';

export const WORLD_W = 2048;
export const WORLD_H = 1024;
export const LAVA_Y = 880;          // poniżej tej linii jest lawa — spadnięcie zabija
const BEDROCK_Y = Math.min(LAVA_Y + 40, WORLD_H);

export function createTerrain(seed) {
  const mask = new Uint8Array(WORLD_W * WORLD_H);
  const rng = mulberry32(seed >>> 0);

  // Cztery oktawy szumu składają się na profil wyspy.
  const oct = [
    { n: valueNoise1D(rng, 6), freq: 6, amp: 1.0 },
    { n: valueNoise1D(rng, 13), freq: 13, amp: 0.5 },
    { n: valueNoise1D(rng, 29), freq: 29, amp: 0.25 },
    { n: valueNoise1D(rng, 61), freq: 61, amp: 0.12 }
  ];
  let ampTotal = 0;
  for (const o of oct) ampTotal += o.amp;

  const surface = new Float64Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) {
    const u = x / WORLD_W;
    let s = 0;
    for (const o of oct) s += o.n(u * o.freq) * o.amp;
    s /= ampTotal;

    const relief = 120 + s * 380;
    // Wygaszenie na brzegach: teren schodzi pod lawę, więc powstaje wyspa,
    // z której da się spaść.
    const edge = smoothstep(0.03, 0.16, u) * smoothstep(0.03, 0.16, 1 - u);
    surface[x] = LAVA_Y - relief * edge;
  }

  for (let x = 0; x < WORLD_W; x++) {
    const top = Math.max(0, Math.ceil(surface[x]));
    for (let y = top; y < BEDROCK_Y; y++) mask[y * WORLD_W + x] = 1;
  }

  const t = { mask, seed: seed >>> 0, craters: [], surface };

  // Kilka jaskiń, żeby wnętrze wyspy nie było jednolitą bryłą.
  const caves = randInt(rng, 3, 6);
  for (let i = 0; i < caves; i++) {
    const cx = randRange(rng, WORLD_W * 0.15, WORLD_W * 0.85);
    const top = surface[Math.floor(cx)];
    const cy = randRange(rng, top + 90, Math.max(top + 100, LAVA_Y - 50));
    carveEllipse(mask, cx, cy, randRange(rng, 60, 170), randRange(rng, 30, 80));
  }

  return t;
}

/* Odtworzenie terenu u klienta, który dołączył później albo się rozjechał. */
export function rebuild(seed, craters) {
  const t = createTerrain(seed);
  for (const c of craters) carve(t, c.x, c.y, c.r);
  return t;
}

function carveEllipse(mask, cx, cy, rx, ry) {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(WORLD_W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(WORLD_H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy) / ry;
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      if (dx * dx + dy * dy <= 1) mask[y * WORLD_W + x] = 0;
    }
  }
}

/* Wybicie krateru. Zwraca dirty rect, żeby render przemalował tylko tyle,
   ile trzeba, zamiast całej mapy. */
export function carve(t, cx, cy, r) {
  // Zaokrąglamy przed wycięciem, a nie przy zapisie do sieci: inaczej
  // rebuild() u drugiego gracza wyciąłby krater minimalnie gdzie indziej.
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(WORLD_W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(WORLD_H - 1, Math.ceil(cy + r));
  const r2 = r * r;

  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const row = y * WORLD_W;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= r2) t.mask[row + x] = 0;
    }
  }
  t.craters.push({ x: cx, y: cy, r });
  return { x0, y0, x1, y1 };
}

export function solidAt(t, x, y) {
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= WORLD_W || yi >= WORLD_H) return false;
  return t.mask[yi * WORLD_W + xi] !== 0;
}

/* Szuka powierzchni w kolumnie x, zaczynając od yFrom.
   Zwraca y gruntu albo null, jeśli w zasięgu nic nie ma. */
export function findGround(t, x, yFrom, maxUp, maxDown) {
  for (let dy = -maxUp; dy <= maxDown; dy++) {
    const y = Math.round(yFrom + dy);
    if (!solidAt(t, x, y) && solidAt(t, x, y + 1)) return y;
  }
  return null;
}

/* Punkty startowe robali: rozrzucone po wyspie, na tyle wysoko nad lawą,
   żeby nikt nie zaczynał w pułapce. */
export function spawnPoints(t, count, seed) {
  const rng = mulberry32((seed ^ 0x5bf03635) >>> 0);
  const points = [];
  const margin = WORLD_W * 0.14;
  const span = WORLD_W - margin * 2;

  for (let i = 0; i < count; i++) {
    let best = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      // Każdy gracz dostaje własny wycinek mapy, więc nikt nie startuje na kimś.
      const slotStart = margin + (span * i) / count;
      const x = Math.round(slotStart + rng() * (span / count));
      const y = findGround(t, x, 0, 0, LAVA_Y - 20);
      if (y === null || y > LAVA_Y - 60) continue;
      const clear = !solidAt(t, x, y - 20) && !solidAt(t, x, y - 10);
      if (!clear) continue;
      const far = points.every((p) => Math.abs(p.x - x) > 90);
      if (!far) continue;
      best = { x, y };
      break;
    }
    points.push(best || { x: Math.round(margin + (span * (i + 0.5)) / count), y: 200 });
  }
  return points;
}

export function countSolid(t) {
  let n = 0;
  for (let i = 0; i < t.mask.length; i++) n += t.mask[i];
  return n;
}
