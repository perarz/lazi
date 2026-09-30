/* Teren niszczalny per-piksel.
   Maska Uint8Array jest JEDYNĄ prawdą o kolizjach — warstwa graficzna
   (render.js) rysuje tylko to, co maska już mówi.

   Mapa nigdy nie leci przez sieć: to seed + lista kraterów, czyli
   kilkaset bajtów zamiast 2 MB. rebuild() odtwarza ją u każdego. */

import { mulberry32, valueNoise1D, randRange, randInt, smoothstep } from './rng.js';

export const WORLD_W = 2048;
export const WORLD_H = 1024;
export const LAVA_Y = 880;          // poniżej tej linii jest lawa — spadnięcie zabija
// wysokość mapy ekstremalnej (od 4.8: 1,75 × zwykłej); zwykłe mapy mają WORLD_H. Teren niesie t.h i t.lava0.
export const WYS_EKSTREMALNA = 1792;

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

/* Styl mapy wynika z seeda — z osobnego haszu, bo pierwsze losowanie
   mulberry32 dla sąsiednich seedów wychodzi podobne, a style mają się mieszać.
   Gospodarz, który wybrał konkretną mapę, po prostu losuje seed z tym stylem. */
export function stylMapy(seed) {
  seed = seed >>> 0;
  let hs = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b);
  hs = Math.imul(hs ^ (hs >>> 13), 0xc2b2ae35);
  return STYLE[((hs ^ (hs >>> 16)) >>> 0) % STYLE.length];
}

/* Rozmiar mapy z ustawień partii (od 4.5): szerokość świata w pikselach.
   Wysokość zostaje 1024 — lawa, niebo i kamera liczą się jak dawniej. */
export const SZEROKOSCI = { mala: 1536, normalna: 2048, duza: 3072, ogromna: 4096 };

/* opcje: { szer, styl } — szer z SZEROKOSCI, styl 'ekstremalna' wymusza mapę
   „wszystko połączone” (tego stylu nie ma w losowaniu z seeda). Te same opcje
   trzeba podać do rebuild(), dlatego teren niesie je w polu `opcje`. */
export function createTerrain(seed, opcje = {}) {
  seed = seed >>> 0;
  const W = opcje.szer || WORLD_W;
  const ekstremalna = opcje.styl === 'ekstremalna';
  const opc = { szer: W, styl: ekstremalna ? 'ekstremalna' : null };
  // Od 4.8 ekstremalna jest wyższa (WYS_EKSTREMALNA): lawa zostaje 144 px nad dnem świata.
  const H = ekstremalna ? WYS_EKSTREMALNA : WORLD_H;
  const LV = H - (WORLD_H - LAVA_Y);
  const BR = Math.min(LV + 40, H);
  if (pamiec && pamiec.seed === seed && pamiec.w === W && pamiec.ekstremalna === ekstremalna) {
    return { mask: pamiec.mask.slice(), seed, craters: [], styl: pamiec.styl, w: W, h: H, lava0: LV, opcje: opc };
  }
  const rng = mulberry32(seed);
  if (ekstremalna) {
    const mask = mapaEkstremalna(rng, W, H, LV, BR);
    pamiec = { seed, mask: mask.slice(), styl: 'ekstremalna', w: W, ekstremalna };
    return { mask, seed, craters: [], styl: 'ekstremalna', w: W, h: H, lava0: LV, opcje: opc };
  }
  const styl = stylMapy(seed);
  const skala = W / WORLD_W;                    // na większej mapie więcej jaskiń, skał i pięter
  const ile = (n) => Math.max(1, Math.round(n * skala));
  const mask = new Uint8Array(W * H);

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
  const surface = new Float64Array(W);
  for (let x = 0; x < W; x++) {
    const u = x / W;
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

    // Od 4.3 mapy sięgają prawie pod sufit świata (dawniej 430 px): wysokie
    // góry i miejsce na kilka pięter jaskiń jedna nad drugą.
    const relief = wys * 660;
    // Wygaszenie na brzegach (w pikselach, niezależnie od szerokości mapy): teren
    // schodzi pod lawę, więc powstaje wyspa, z której da się spaść.
    const edge = smoothstep(0.03, 0.16, x / WORLD_W) * smoothstep(0.03, 0.16, (W - x) / WORLD_W);
    surface[x] = Math.max(110, LV - relief * edge);   // nad szczytem zostaje niebo na lot pocisków
  }

  // --- bryła 2D: szum przesuwa powierzchnię w pionie i w poziomie,
  //     więc powstają nawisy, łuki i półki zamiast gładkiej linii ---
  const n1 = szum2D(Math.floor(rng() * 2147483647));
  const n2 = szum2D(Math.floor(rng() * 2147483647));
  const n3 = szum2D(Math.floor(rng() * 2147483647));   // duża skala: wielkie nawisy i „szalone” bryły
  const nawisy = styl === 'jaskinie' ? 190 : styl === 'gory' ? 160 : 130;
  const wielkie = styl === 'kaniony' ? 170 : 240;
  const PAS = 300;                              // do tej głębokości pod powierzchnią działa szum

  for (let x = 0; x < W; x++) {
    const sx = surface[x];
    const y0 = Math.max(0, Math.floor(sx - PAS));
    for (let y = y0; y < BR; y++) {
      const i = y * W + x;
      const glebokosc = y - sx;
      if (glebokosc > PAS) {
        mask[i] = 1;
      } else {
        const g = glebokosc
          + (n3(x / 260, y / 230) - 0.5) * wielkie
          + (n1(x / 95, y / 95) - 0.5) * nawisy
          + (n2(x / 34, y / 34) - 0.5) * 38;
        mask[i] = g > 0 ? 1 : 0;
      }
    }
  }
  const elipsa = (cx, cy, rx, ry, wartosc, nachyl, postrzep) =>
    ksztaltEllipsy(mask, W, BR, n2, cx, cy, rx, ry, wartosc, nachyl, postrzep);

  // --- piętra: długie, płaskie jaskinie jedna nad drugą — w grubym terenie
  //     powstaje kilka poziomów, po których da się chodzić (od 4.3) ---
  const pietra = ile(randInt(rng, styl === 'jaskinie' ? 4 : 2, styl === 'jaskinie' ? 7 : 5));
  for (let i = 0; i < pietra; i++) {
    const cx = randRange(rng, W * 0.14, W * 0.86);
    const top = surface[Math.floor(cx)];
    const miejsca = LV - 70 - (top + 70);
    if (miejsca < 90) continue;
    const ry = randRange(rng, 24, Math.min(70, miejsca / 3));
    const cy = randRange(rng, top + 70 + ry, LV - 70 - ry);
    // pochylone i poszarpane mocniej niż zwykła komora — mają wyglądać dziko, nie jak pasy
    elipsa(cx, cy, randRange(rng, 150, 360), ry, 0, randRange(rng, -0.22, 0.22), 1.3);
  }
  // --- kominy: wąskie pionowe szyby, które łączą piętra ---
  const kominy = ile(randInt(rng, 1, styl === 'jaskinie' ? 4 : 3));
  for (let i = 0; i < kominy; i++) {
    const cx = randRange(rng, W * 0.18, W * 0.82);
    const top = surface[Math.floor(cx)];
    if (top > LV - 260) continue;
    const ry = randRange(rng, 90, Math.min(190, (LV - top - 120) / 2));
    const cy = randRange(rng, top + 40 + ry, LV - 80 - ry);
    elipsa(cx, cy, randRange(rng, 20, 42), ry, 0, randRange(rng, -0.5, 0.5), 1);
  }
  // --- kilka komór i pływających skał ---
  const komory = ile(randInt(rng, styl === 'jaskinie' ? 5 : 3, styl === 'jaskinie' ? 9 : 5));
  for (let i = 0; i < komory; i++) {
    const cx = randRange(rng, W * 0.15, W * 0.85);
    const top = surface[Math.floor(cx)];
    if (top > LV - 150) continue;
    const cy = randRange(rng, top + 90, Math.max(top + 100, LV - 60));
    elipsa(cx, cy, randRange(rng, 55, 170), randRange(rng, 30, 90), 0);
  }
  // --- wielkie jaskinie: wysokie hale z podłogą ---
  const duze = ile(styl === 'jaskinie' ? randInt(rng, 2, 3) : randInt(rng, 1, 2));
  for (let i = 0; i < duze; i++) {
    const cx = randRange(rng, W * 0.22, W * 0.78);
    const top = surface[Math.floor(cx)];
    if (top > LV - 250) continue;
    const ry = randRange(rng, 60, Math.min(150, (LV - top - 130) / 2));
    const cy = randRange(rng, top + 60 + ry, LV - 70 - ry);
    elipsa(cx, cy, randRange(rng, 170, 320), ry, 0);
  }
  const skaly = ile(styl === 'gory' ? randInt(rng, 2, 3) : randInt(rng, 3, 5));
  for (let i = 0; i < skaly; i++) {
    const cx = randRange(rng, W * 0.15, W * 0.85);
    const top = surface[Math.floor(cx)];
    const cy = Math.max(90, top - randRange(rng, 130, 300));
    elipsa(cx, cy, randRange(rng, 55, 130), randRange(rng, 16, 34), 1);
  }
  usunOkruchy(mask, W, 450);

  pamiec = { seed, mask: mask.slice(), styl, w: W, ekstremalna };
  return { mask, seed, craters: [], styl, w: W, h: H, lava0: LV, opcje: opc };
}

/* Mapa ekstremalna od 4.13 — „jak w Wormsach”: 2–3 duże, obłe wyspy nad lawą z łagodnymi
   zboczami, 1–3 wysokie góry, gładkie nawisy, kilka wielkich jaskiń, szerokie ukośne korytarze
   i pływające wysepki na niebie. Bez drobnego szumu i cienkich pięter
   (4.5–4.12 były poszarpane jak mrowisko); na koniec brzegi wygładza filtr większościowy,
   więc skała ma okrągłe kształty. Tylko + - * /, sqrt, szum z haszy i mulberry32. */
function mapaEkstremalna(rng, W, H, LV, BR) {
  const skala = W / WORLD_W;
  const ile = (n) => Math.max(1, Math.round(n * skala));
  const mask = new Uint8Array(W * H);
  const WYS = LV - 150;                         // największa wysokość gór nad lawą

  // --- profil: miękkie wzgórza (tylko niskie częstotliwości) ---
  const o1 = valueNoise1D(rng, 4), o2 = valueNoise1D(rng, 9), o3 = valueNoise1D(rng, 19);
  const gory = [];                              // 1–3 wysokie, szerokie góry
  for (let i = 0, n = ile(randInt(rng, 1, 3)); i < n; i++) {
    gory.push({ u: randRange(rng, 0.12, 0.88), w: randRange(rng, 0.1, 0.17) / skala, h: randRange(rng, 0.2, 0.34) });
  }
  const zatoki = [];                            // łagodne doliny z lawą między wyspami
  for (let i = 0, n = ile(randInt(rng, 1, 2)); i < n; i++) {
    zatoki.push({ u: randRange(rng, 0.25, 0.75), w: randRange(rng, 0.13, 0.18) / skala });
  }
  const surface = new Float64Array(W);
  for (let x = 0; x < W; x++) {
    const u = x / W;
    const s = o1(u * 4) * 0.55 + o2(u * 9) * 0.3 + o3(u * 19) * 0.15;
    let wys = 0.36 + s * 0.4;
    for (const g of gory) {
      const d = Math.abs(u - g.u) / g.w;
      if (d < 1) wys += g.h * (1 - d * d) * (1 - d * d);
    }
    for (const z of zatoki) {
      const d = Math.abs(u - z.u) / z.w;
      if (d < 1) wys *= smoothstep(0.15, 1, d);
    }
    // brzegi: wyspa łagodnie schodzi do lawy, a nie urywa się pionową ścianą
    const edge = smoothstep(0.01, 0.2, x / WORLD_W) * smoothstep(0.01, 0.2, (W - x) / WORLD_W);
    surface[x] = Math.max(170, LV + 40 - wys * WYS * edge);
  }

  // --- bryła: szum dużej skali przesuwa powierzchnię, więc są nawisy i półki, ale gładkie ---
  const n1 = szum2D(Math.floor(rng() * 2147483647));
  const n2 = szum2D(Math.floor(rng() * 2147483647));
  const PAS = 280;
  for (let x = 0; x < W; x++) {
    const sx = surface[x];
    for (let y = Math.max(0, Math.floor(sx - PAS)); y < BR; y++) {
      const gl = y - sx;
      if (gl > PAS) { mask[y * W + x] = 1; continue; }
      const g = gl + (n1(x / 260, y / 220) - 0.5) * 260 + (n2(x / 110, y / 110) - 0.5) * 80;
      mask[y * W + x] = g > 0 ? 1 : 0;
    }
  }
  const gladka = (cx, cy, rx, ry, wartosc, nachyl) => ksztaltEllipsy(mask, W, BR, n2, cx, cy, rx, ry, wartosc, nachyl, 0.15);

  // --- jaskinie: obłe hale w grubym terenie, jedna nad drugą, gdzie jest miejsce ---
  for (let i = 0, n = ile(randInt(rng, 5, 7)); i < n; i++) {
    const cx = randRange(rng, W * 0.12, W * 0.88);
    const top = surface[Math.floor(cx)];
    const miejsca = LV - 100 - (top + 120);
    if (miejsca < 170) continue;
    const ry = randRange(rng, 50, Math.min(115, miejsca / 2.4));
    const cy = randRange(rng, top + 120 + ry, LV - 100 - ry);
    gladka(cx, cy, randRange(rng, 140, 280), ry, 0, randRange(rng, -0.15, 0.15));
  }
  // --- ukośne korytarze: szerokie, łączą jaskinie ---
  for (let i = 0, n = ile(randInt(rng, 1, 2)); i < n; i++) {
    const cx = randRange(rng, W * 0.2, W * 0.8);
    const top = surface[Math.floor(cx)];
    if (top > LV - 420) continue;
    const cy = randRange(rng, top + 180, LV - 180);
    gladka(cx, cy, randRange(rng, 170, 260), randRange(rng, 30, 42), 0, (rng() < 0.5 ? -1 : 1) * randRange(rng, 0.35, 0.6));
  }
  // --- pływające wysepki na niebie: obłe, płaskie od spodu ---
  for (let i = 0, n = ile(randInt(rng, 3, 5)); i < n; i++) {
    const cx = randRange(rng, W * 0.1, W * 0.9);
    const top = surface[Math.floor(cx)];
    if (top < 380) continue;
    const cy = randRange(rng, 170, top - 160);
    gladka(cx, cy, randRange(rng, 80, 170), randRange(rng, 26, 46), 1, randRange(rng, -0.08, 0.08));
  }

  wygladz(mask, W, BR, 6);
  wygladz(mask, W, BR, 3);
  mask.fill(0, 0, 36 * W);                      // pas nieba na przerzut górą
  usunOkruchy(mask, W, 900);
  return mask;
}

/* Filtr większościowy: piksel jest skałą, gdy w kwadracie (2r+1)² wokół jest jej więcej niż pół.
   Zaokrągla brzegi i zjada ostre kolce. Sumy kroczące, więc liniowo względem rozmiaru mapy. */
function wygladz(mask, W, dno, r) {
  const bok = 2 * r + 1, prog = (bok * bok) >> 1;
  const wiersz = new Uint8Array(W * dno);       // sumy w poziomie (≤ 2r+1)
  for (let y = 0; y < dno; y++) {
    const o = y * W;
    let suma = 0;
    for (let x = -r; x <= r; x++) suma += mask[o + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      wiersz[o + x] = suma;
      suma += mask[o + Math.min(W - 1, x + r + 1)] - mask[o + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let suma = 0;
    for (let y = -r; y <= r; y++) suma += wiersz[Math.min(dno - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < dno; y++) {
      mask[y * W + x] = suma > prog ? 1 : 0;
      suma += wiersz[Math.min(dno - 1, y + r + 1) * W + x] - wiersz[Math.max(0, y - r) * W + x];
    }
  }
}

/* Elipsa z postrzępionym brzegiem: wartosc 0 wycina (komora), 1 dokłada (skała). */
/* nachyl — przesunięcie w pionie na piksel w poziomie (pochylona elipsa),
   postrzep — siła poszarpania brzegu. */
function ksztaltEllipsy(mask, W, dno, szum, cx, cy, rx, ry, wartosc, nachyl = 0, postrzep = 1) {
  const x0 = Math.max(0, Math.floor(cx - rx * 1.3));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx * 1.3));
  const zapas = Math.abs(nachyl) * rx * 1.3;
  const y0 = Math.max(0, Math.floor(cy - ry * 1.3 - zapas));
  const y1 = Math.min(dno - 1, Math.ceil(cy + ry * 1.3 + zapas));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy - nachyl * (x - cx)) / ry;
      // skała jest płaska od spodu i garbata od góry — jak prawdziwy głaz
      const garb = wartosc === 1 && dy < 0 ? 0.25 : 0;
      const d = dx * dx + dy * dy - (szum(x / 18, y / 18) - 0.5) * 0.7 * postrzep - garb;
      if (d <= 1) mask[y * W + x] = wartosc;
    }
  }
}

/* Usuwa bryłki mniejsze niż `min` pikseli — szum zostawia czasem drobne
   okruchy wiszące w powietrzu, na których robal utknąłby bez sensu. */
function usunOkruchy(mask, W, min) {
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
      const x = i % W;
      if (x > 0 && mask[i - 1] && !znak[i - 1]) { znak[i - 1] = nr; stos[sp++] = i - 1; }
      if (x < W - 1 && mask[i + 1] && !znak[i + 1]) { znak[i + 1] = nr; stos[sp++] = i + 1; }
      if (i >= W && mask[i - W] && !znak[i - W]) { znak[i - W] = nr; stos[sp++] = i - W; }
      if (i + W < mask.length && mask[i + W] && !znak[i + W]) { znak[i + W] = nr; stos[sp++] = i + W; }
    }
    if (n < min) for (let k = 0; k < n; k++) mask[lista[k]] = 0;
  }
}

/* Odtworzenie terenu u klienta, który dołączył później albo się rozjechał. */
export function rebuild(seed, craters, opcje = {}) {
  const t = createTerrain(seed, opcje);
  for (const c of craters) {
    if (c.r <= TUNEL) wytnijTunel(t, c.x, c.y, c.x2, c.y2, TUNEL - c.r);
    else carve(t, c.x, c.y, c.r);
  }
  return t;
}

/* Tunel railguna (4.10): pas o promieniu r wzdłuż odcinka (x0, y0)–(x1, y1) — jeden wpis na liście
   kraterów { x, y, r: TUNEL - r, x2, y2 } zamiast setek kółek (lista leci w każdym strzale i stanie).
   W sieci to dwie trójki: x, y, TUNEL - r, x2, y2, TUNEL_DALEJ. Tylko + - * / i porównania. */
export const TUNEL = -100, TUNEL_DALEJ = -99;
export function wytnijTunel(t, x0, y0, x1, y1, r) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); r = Math.round(r);
  const dx = x1 - x0, dy = y1 - y0, dl2 = dx * dx + dy * dy, r2 = r * r;
  const by0 = Math.max(0, Math.min(y0, y1) - r), by1 = Math.min(t.h - 1, Math.max(y0, y1) + r);
  let bx0 = t.w, bx1 = -1;
  for (let y = by0; y <= by1; y++) {
    // zakres x w tym wierszu: odcinek przycięty do pasa y ± r, poszerzony o r (z zapasem)
    let ua = 0, ub = 1;
    if (dy !== 0) {
      ua = (y - r - y0) / dy;
      ub = (y + r - y0) / dy;
      if (ua > ub) { const z = ua; ua = ub; ub = z; }
      ua = ua < 0 ? 0 : ua > 1 ? 1 : ua;
      ub = ub < 0 ? 0 : ub > 1 ? 1 : ub;
    }
    const xa = x0 + ua * dx, xb = x0 + ub * dx;
    const od = Math.max(0, Math.floor(Math.min(xa, xb)) - r - 1);
    const doX = Math.min(t.w - 1, Math.ceil(Math.max(xa, xb)) + r + 1);
    const row = y * t.w;
    for (let x = od; x <= doX; x++) {
      const px = x - x0, py = y - y0;
      let u = dl2 ? (px * dx + py * dy) / dl2 : 0;
      if (u < 0) u = 0; else if (u > 1) u = 1;
      const ex = px - u * dx, ey = py - u * dy;
      if (ex * ex + ey * ey <= r2) {
        t.mask[row + x] = 0;
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
      }
    }
  }
  t.craters.push({ x: x0, y: y0, r: TUNEL - r, x2: x1, y2: y1 });
  return { x0: bx1 < 0 ? x0 : bx0, y0: by0, x1: bx1 < 0 ? x0 : bx1, y1: by1 };
}

/* Wybicie krateru. Zwraca dirty rect, żeby render przemalował tylko tyle,
   ile trzeba, zamiast całej mapy. */
export function carve(t, cx, cy, r) {
  if (r < 0) return zbudujMost(t, cx, cy, r);
  // Zaokrąglamy przed wycięciem, a nie przy zapisie do sieci: inaczej
  // rebuild() u drugiego gracza wyciąłby krater minimalnie gdzie indziej.
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(t.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(t.h - 1, Math.ceil(cy + r));
  const r2 = r * r;

  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const row = y * t.w;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= r2) t.mask[row + x] = 0;
    }
  }
  t.craters.push({ x: cx, y: cy, r });
  return { x0, y0, x1, y1 };
}

/* Most: belka MOST_DL × MOST_GR. Trzymany na liście kraterów z ujemnym r,
   więc rebuild() stawia go w tej samej kolejności względem wybuchów. W masce
   ma wartość 2 (render maluje go jak stal).
   r = -1 — poziomy, środek górnej krawędzi w (cx, cy) (jak do 4.4);
   r = -1 - k, k = 1..7 — obrócony o k × 22,5° (klawisz R), środek belki w (cx, cy).
   Kierunki to stała tabela liczb (bez Math.cos), więc każdy klient liczy to samo. */
export const MOST_DL = 90, MOST_GR = 7;
export const MOST_KIERUNKI = [
  [1, 0], [0.9238795325112867, 0.3826834323650898], [0.7071067811865476, 0.7071067811865476],
  [0.3826834323650898, 0.9238795325112867], [0, 1], [-0.3826834323650898, 0.9238795325112867],
  [-0.7071067811865476, 0.7071067811865476], [-0.9238795325112867, 0.3826834323650898]
];
export function obrotMostu(r) {
  const k = -1 - Math.round(r);
  return k >= 0 && k < MOST_KIERUNKI.length ? k : 0;
}

/* Czy punkt (px, py) leży w belce mostu (z zapasem `zapas` px). */
export function wMoscie(cx, cy, k, px, py, zapas = 0) {
  if (!k) {
    return px >= cx - MOST_DL / 2 - zapas && px <= cx + MOST_DL / 2 - 1 + zapas &&
      py >= cy - zapas && py <= cy + MOST_GR - 1 + zapas;
  }
  const [c, s] = MOST_KIERUNKI[k];
  const dx = px - cx, dy = py - cy;
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  return Math.abs(u) <= MOST_DL / 2 + zapas && Math.abs(v) <= MOST_GR / 2 + zapas;
}

function zbudujMost(t, cx, cy, r) {
  cx = Math.round(cx); cy = Math.round(cy);
  const k = obrotMostu(r);
  r = -1 - k;
  const pol = k ? MOST_DL / 2 + MOST_GR : 0;
  const x0 = Math.max(0, k ? cx - pol : cx - MOST_DL / 2);
  const x1 = Math.min(t.w - 1, k ? cx + pol : cx + MOST_DL / 2 - 1);
  const y0 = Math.max(0, k ? cy - pol : cy);
  const y1 = Math.min(t.h - 1, k ? cy + pol : cy + MOST_GR - 1);
  for (let y = y0; y <= y1; y++) {
    const row = y * t.w;
    for (let x = x0; x <= x1; x++) {
      if (!t.mask[row + x] && (!k || wMoscie(cx, cy, k, x, y))) t.mask[row + x] = 2;
    }
  }
  t.craters.push({ x: cx, y: cy, r });
  return { x0, y0, x1, y1 };
}

export function solidAt(t, x, y) {
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= t.w || yi >= t.h) return false;
  return t.mask[yi * t.w + xi] !== 0;
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
  const margin = t.w * 0.14;
  const span = t.w - margin * 2;
  // odstęp między robalami: 90 px, a przy wielu robalach (4.8) mniej, żeby zmieścić wszystkich
  const odstep = Math.min(90, span / count * 0.7);

  for (let i = 0; i < count; i++) {
    let best = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      // Każdy gracz dostaje własny wycinek mapy, więc nikt nie startuje na kimś.
      const slotStart = margin + (span * i) / count;
      const x = Math.round(slotStart + rng() * (span / count));
      const y = gruntPodNiebem(t, x);
      if (y === null || y > t.lava0 - 60) continue;
      const clear = !solidAt(t, x, y - 20) && !solidAt(t, x, y - 10);
      if (!clear) continue;
      const far = points.every((p) => Math.abs(p.x - x) > odstep);
      if (!far) continue;
      best = { x, y };
      break;
    }
    // W wycinku nie ma gruntu (np. przerwa między wyspami) — bierzemy dobry
    // grunt z całej mapy, jak najdalej od pozostałych. Nigdy nie w powietrzu.
    points.push(best || zapasowyStart(t, points, margin));
  }
  return points;
}

function zapasowyStart(t, points, margin) {
  let best = null, bestOdl = -1;
  for (let wymog = 0; wymog < 2 && !best; wymog++) {
    for (let x = Math.round(margin * 0.5); x < t.w - margin * 0.5; x += 6) {
      const y = wymog === 0 ? gruntPodNiebem(t, x) : findGround(t, x, 0, 0, t.lava0 - 30);
      if (y === null || y > t.lava0 - 60) continue;
      if (solidAt(t, x, y - 20) || solidAt(t, x, y - 10)) continue;
      let odl = 1e9;
      for (const p of points) odl = Math.min(odl, Math.abs(p.x - x));
      if (odl > bestOdl) { bestOdl = odl; best = { x, y }; }
    }
  }
  return best || { x: t.w >> 1, y: findGround(t, t.w >> 1, 0, 0, t.h) ?? t.lava0 - 80 };
}

/* Pierwszy grunt od góry, który nie jest cienką pływającą skałą —
   start na skale bez zejścia byłby pułapką. */
function gruntPodNiebem(t, x) {
  let y = 0;
  while (y < t.lava0 - 20) {
    const g = findGround(t, x, y, 0, t.lava0 - 20 - y);
    if (g === null) return null;
    let gruby = true;
    for (let d = 1; d <= 70; d++) if (!solidAt(t, x, g + d)) { gruby = false; break; }
    if (gruby) return g;
    y = g + 2;
    while (y < t.lava0 && solidAt(t, x, y)) y++;
  }
  return null;
}

export function countSolid(t) {
  let n = 0;
  for (let i = 0; i < t.mask.length; i++) n += t.mask[i];
  return n;
}
