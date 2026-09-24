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

/* Style map — losowane z seeda, żeby każda partia wyglądała inaczej. */
export const STYLE = ['gory', 'archipelag', 'kaniony', 'jaskinie'];

/* Szum 2D na siatce haszy. Tylko działania całkowite (Math.imul) i + - * /
   — żadnej trygonometrii, więc każda przeglądarka liczy go bit w bit tak samo,
   a od tego zależy, czy wszyscy gracze mają identyczną mapę. */
function szum2D(ziarno) {
  const s = ziarno | 0;
  const wezel = (xi, yi) => {
    let h = (Math.imul(xi, 374761393) + Math.imul(yi, 668265263) + s) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = wezel(xi, yi), b = wezel(xi + 1, yi);
    const c = wezel(xi, yi + 1), d = wezel(xi + 1, yi + 1);
    const g = a + (b - a) * fx;
    const h = c + (d - c) * fx;
    return g + (h - g) * fy;
  };
}

/* Bazowa maska jest droga (~100 ms), a rebuild() po korekcie stanu robi ją
   od nowa — trzymamy więc kopię ostatnio wygenerowanej. */
let pamiec = null;

export function createTerrain(seed) {
  seed = seed >>> 0;
  if (pamiec && pamiec.seed === seed) {
    return { mask: pamiec.mask.slice(), seed, craters: [], styl: pamiec.styl };
  }
  const rng = mulberry32(seed);
  // styl z osobnego haszu seeda — pierwsze losowanie mulberry32 dla
  // sąsiednich seedów wychodzi podobne, a style mają się mieszać
  let hs = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b);
  hs = Math.imul(hs ^ (hs >>> 13), 0xc2b2ae35);
  const styl = STYLE[((hs ^ (hs >>> 16)) >>> 0) % STYLE.length];
  const mask = new Uint8Array(WORLD_W * WORLD_H);

  // --- profil wyspy: kilka oktaw szumu 1D ---
  const oct = [
    { n: valueNoise1D(rng, 5), freq: 5, amp: 1.0 },
    { n: valueNoise1D(rng, 11), freq: 11, amp: 0.55 },
    { n: valueNoise1D(rng, 23), freq: 23, amp: 0.3 },
    { n: valueNoise1D(rng, 53), freq: 53, amp: 0.14 },
    { n: valueNoise1D(rng, 131), freq: 131, amp: 0.05 }
  ];
  let ampTotal = 0;
  for (const o of oct) ampTotal += o.amp;
  const wyspy = valueNoise1D(rng, 7);          // archipelag: gdzie są przerwy
  const plaskowyz = 0.55 + rng() * 0.15;        // kaniony: wysokość płaskowyżu
  const ciecia = [];                            // kaniony: pozycje wąwozów
  for (let i = 0, n = randInt(rng, 3, 5); i < n; i++) {
    ciecia.push({ u: randRange(rng, 0.18, 0.82), w: randRange(rng, 0.018, 0.04), g: randRange(rng, 0.3, 0.8) });
  }

  const surface = new Float64Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) {
    const u = x / WORLD_W;
    let s = 0;
    for (const o of oct) s += o.n(u * o.freq) * o.amp;
    s /= ampTotal;

    let wys;                                     // 0..1 — ułamek maksymalnej wysokości
    if (styl === 'gory') {
      // grzbiety: odwrócona wartość bezwzględna daje ostre szczyty
      const r = 1 - Math.abs(2 * s - 1);
      wys = 0.15 + r * r * 1.05;
    } else if (styl === 'archipelag') {
      const m = smoothstep(0.32, 0.5, wyspy(u * 7));
      wys = (0.2 + s * 0.8) * (m * 1.15 - 0.12);
    } else if (styl === 'kaniony') {
      wys = Math.min(plaskowyz, 0.2 + s * 0.9);
      for (const c of ciecia) {
        const d = Math.abs(u - c.u) / c.w;
        if (d < 1) wys -= c.g * (1 - d * d) * (1 - d * d);
      }
    } else {
      wys = 0.3 + s * 0.75;
    }

    const relief = wys * 430;
    // Wygaszenie na brzegach: teren schodzi pod lawę, więc powstaje wyspa,
    // z której da się spaść.
    const edge = smoothstep(0.03, 0.16, u) * smoothstep(0.03, 0.16, 1 - u);
    surface[x] = Math.max(60, LAVA_Y - relief * edge);
  }

  // --- bryła 2D: szum przesuwa powierzchnię w pionie i w poziomie,
  //     więc powstają nawisy, łuki i półki zamiast gładkiej linii ---
  const n1 = szum2D(Math.floor(rng() * 2147483647));
  const n2 = szum2D(Math.floor(rng() * 2147483647));
  const n3 = szum2D(Math.floor(rng() * 2147483647));
  const nawisy = styl === 'jaskinie' ? 150 : styl === 'gory' ? 120 : 95;
  const tunele = styl === 'jaskinie' ? 0.06 : 0.035;
  const PAS = 190;                              // do tej głębokości pod powierzchnią działa szum

  for (let x = 0; x < WORLD_W; x++) {
    const sx = surface[x];
    const y0 = Math.max(0, Math.floor(sx - PAS));
    for (let y = y0; y < BEDROCK_Y; y++) {
      const i = y * WORLD_W + x;
      const glebokosc = y - sx;
      if (glebokosc > PAS) {
        mask[i] = 1;
      } else {
        const g = glebokosc
          + (n1(x / 95, y / 95) - 0.5) * nawisy
          + (n2(x / 34, y / 34) - 0.5) * 38;
        mask[i] = g > 0 ? 1 : 0;
      }
      // kręte tunele: wąski pas wokół połowy wartości szumu
      if (mask[i] && glebokosc > 45 && y < LAVA_Y - 25) {
        const t = n3(x / 150, y / 62) - 0.5;
        if (t < tunele && t > -tunele) mask[i] = 0;
      }
    }
  }

  // --- kilka komór i pływających skał ---
  const komory = randInt(rng, styl === 'jaskinie' ? 5 : 2, styl === 'jaskinie' ? 8 : 4);
  for (let i = 0; i < komory; i++) {
    const cx = randRange(rng, WORLD_W * 0.15, WORLD_W * 0.85);
    const top = surface[Math.floor(cx)];
    if (top > LAVA_Y - 150) continue;
    const cy = randRange(rng, top + 90, Math.max(top + 100, LAVA_Y - 60));
    ksztaltEllipsy(mask, n2, cx, cy, randRange(rng, 55, 150), randRange(rng, 28, 70), 0);
  }
  const skaly = styl === 'gory' ? randInt(rng, 1, 2) : randInt(rng, 2, 4);
  for (let i = 0; i < skaly; i++) {
    const cx = randRange(rng, WORLD_W * 0.18, WORLD_W * 0.82);
    const top = surface[Math.floor(cx)];
    const cy = Math.max(140, top - randRange(rng, 150, 260));
    ksztaltEllipsy(mask, n2, cx, cy, randRange(rng, 55, 110), randRange(rng, 16, 30), 1);
  }

  usunOkruchy(mask, 450);

  pamiec = { seed, mask: mask.slice(), styl };
  return { mask, seed, craters: [], styl };
}

/* Elipsa z postrzępionym brzegiem: wartosc 0 wycina (komora), 1 dokłada (skała). */
function ksztaltEllipsy(mask, szum, cx, cy, rx, ry, wartosc) {
  const x0 = Math.max(0, Math.floor(cx - rx * 1.3));
  const x1 = Math.min(WORLD_W - 1, Math.ceil(cx + rx * 1.3));
  const y0 = Math.max(0, Math.floor(cy - ry * 1.3));
  const y1 = Math.min(BEDROCK_Y - 1, Math.ceil(cy + ry * 1.3));
  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy) / ry;
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      // skała jest płaska od spodu i garbata od góry — jak prawdziwy głaz
      const garb = wartosc === 1 && dy < 0 ? 0.25 : 0;
      const d = dx * dx + dy * dy - (szum(x / 18, y / 18) - 0.5) * 0.7 - garb;
      if (d <= 1) mask[y * WORLD_W + x] = wartosc;
    }
  }
}

/* Usuwa bryłki mniejsze niż `min` pikseli — szum zostawia czasem drobne
   okruchy wiszące w powietrzu, na których robal utknąłby bez sensu. */
function usunOkruchy(mask, min) {
  const znak = new Int32Array(mask.length);
  const stos = new Int32Array(mask.length);
  const lista = new Int32Array(mask.length);
  let nr = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || znak[s]) continue;
    nr++;
    let sp = 0, n = 0;
    stos[sp++] = s; znak[s] = nr;
    while (sp > 0) {
      const i = stos[--sp];
      lista[n++] = i;
      const x = i % WORLD_W;
      if (x > 0 && mask[i - 1] && !znak[i - 1]) { znak[i - 1] = nr; stos[sp++] = i - 1; }
      if (x < WORLD_W - 1 && mask[i + 1] && !znak[i + 1]) { znak[i + 1] = nr; stos[sp++] = i + 1; }
      if (i >= WORLD_W && mask[i - WORLD_W] && !znak[i - WORLD_W]) { znak[i - WORLD_W] = nr; stos[sp++] = i - WORLD_W; }
      if (i + WORLD_W < mask.length && mask[i + WORLD_W] && !znak[i + WORLD_W]) { znak[i + WORLD_W] = nr; stos[sp++] = i + WORLD_W; }
    }
    if (n < min) for (let k = 0; k < n; k++) mask[lista[k]] = 0;
  }
}

/* Odtworzenie terenu u klienta, który dołączył później albo się rozjechał. */
export function rebuild(seed, craters) {
  const t = createTerrain(seed);
  for (const c of craters) carve(t, c.x, c.y, c.r);
  return t;
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
      const y = gruntPodNiebem(t, x);
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

/* Pierwszy grunt od góry, który nie jest cienką pływającą skałą —
   start na skale bez zejścia byłby pułapką. */
function gruntPodNiebem(t, x) {
  let y = 0;
  while (y < LAVA_Y - 20) {
    const g = findGround(t, x, y, 0, LAVA_Y - 20 - y);
    if (g === null) return null;
    let gruby = true;
    for (let d = 1; d <= 70; d++) if (!solidAt(t, x, g + d)) { gruby = false; break; }
    if (gruby) return g;
    y = g + 2;
    while (y < LAVA_Y && solidAt(t, x, y)) y++;
  }
  return null;
}

export function countSolid(t) {
  let n = 0;
  for (let i = 0; i < t.mask.length; i++) n += t.mask[i];
  return n;
}
