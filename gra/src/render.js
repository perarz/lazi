/* Rysowanie świata. Czyta maskę terenu i stan symulacji, sam niczego
   w nich nie zmienia.

   Teren malujemy raz do offscreen canvasu; po wybuchu przemalowujemy
   tylko kolumny objęte kraterem, a nie całe 2 MB. */

import { akcesorium } from './akcesoria.js';
import { DRUZYNY } from './druzyny.js';
import { WORLD_W, WORLD_H, LAVA_Y as T_LAVA, solidAt } from './terrain.js';
import { WEAPONS } from './weapons.js';
import { WORM_H } from './sim.js';
import { drawFx } from './fx.js';

/* Szerokość bieżącego świata (od 4.5 zależy od rozmiaru mapy w ustawieniach).
   Ustawia ją buildTerrain; kamera i lawa czytają ją stąd. */
let swiatW = WORLD_W;
// wysokość świata i poziom lawy na starcie (od 4.8 ekstremalna jest wyższa)
let swiatH = WORLD_H, swiatLawa = T_LAVA;

export function createRenderer(canvas) {
  const terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = WORLD_W;
  terrainCanvas.height = WORLD_H;

  return {
    canvas,
    ctx: canvas.getContext('2d'),
    terrainCanvas,
    tctx: terrainCanvas.getContext('2d'),
    viewW: 0,
    viewH: 0,
    time: 0,
    zrzuty: new Map()          // id skrzynki → chwila zrzutu (animacja spadochronu)
  };
}

/* Palety skał dla stylów mapy (terrain.styl). Każda: skorupa na świeżej
   krawędzi, podskórna warstwa, trzy pasy warstw skalnych, głębia i żyłka. */
const PALETY = {
  gory: {
    skorupa: [255, 196, 110], pod: [214, 110, 40],
    pasy: [[112, 72, 58], [96, 62, 54], [124, 84, 64]], gleboko: [52, 36, 38], zyla: [255, 120, 40]
  },
  archipelag: {
    skorupa: [255, 214, 140], pod: [196, 120, 56],
    pasy: [[70, 58, 66], [58, 50, 60], [82, 66, 72]], gleboko: [30, 26, 34], zyla: [255, 90, 60]
  },
  kaniony: {
    skorupa: [255, 186, 96], pod: [226, 104, 34],
    pasy: [[168, 78, 40], [140, 60, 34], [186, 96, 50]], gleboko: [70, 34, 24], zyla: [255, 170, 60]
  },
  jaskinie: {
    skorupa: [255, 170, 90], pod: [180, 80, 40],
    pasy: [[66, 46, 52], [56, 40, 48], [78, 54, 58]], gleboko: [28, 20, 26], zyla: [120, 230, 255]
  }
};

/* Kolor zależy od głębokości pod powierzchnią (liczonej jednym przejściem
   w dół kolumny), od pasa skalnego i od tego, czy obok jest powietrze.
   Całe 2 MB idzie w kilka milionów prostych operacji. */
function paintColumns(r, terrain, x0, x1) {
  x0 = Math.max(0, Math.floor(x0));
  x1 = Math.min(terrain.w - 1, Math.ceil(x1));
  const w = x1 - x0 + 1;
  if (w <= 0) return;

  const H = terrain.h || WORLD_H;
  const img = r.tctx.createImageData(w, H);
  const d = img.data;
  const mask = terrain.mask;
  const pal = PALETY[terrain.styl] || PALETY.gory;

  for (let x = x0; x <= x1; x++) {
    let depth = 9999;
    const col = x - x0;
    // falowanie warstw skalnych — tylko wygląd, więc wolno użyć sinusa
    const fala = Math.sin(x * 0.011) * 14 + Math.sin(x * 0.037 + 1.3) * 6;
    for (let y = 0; y < H; y++) {
      const i = y * terrain.w + x;
      const solid = mask[i];
      depth = solid ? depth + 1 : 0;
      const o = (y * w + col) * 4;

      if (!solid) { d[o + 3] = 0; continue; }
      if (solid === 2) {
        // most: stalowa belka z nitami co 10 px
        // dźwigar: ciemne pasy góra/dół i kratownica (ukośne żebra) w środku
        const brzeg = depth <= 1 || (y + 1 < H && mask[i + terrain.w] !== 2);
        const rz = depth - 1;
        const zebro = ((x - rz * 2) % 12 + 12) % 12 < 2 || ((x + rz * 2) % 12 + 12) % 12 < 2;
        const v = brzeg ? 0.6 : zebro ? 1.3 : 0.82;
        d[o] = Math.min(255, 196 * v); d[o + 1] = Math.min(255, 92 * v); d[o + 2] = Math.min(255, 38 * v); d[o + 3] = 255;
        continue;
      }

      // deterministyczne, tanie ziarno — faktura skały
      let h = (x * 374761393 + y * 668265263) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h = h ^ (h >>> 16);
      const n = h & 15;
      let c;
      // Ściemnianie w głąb liczone od wysokości, nie od głębokości w kolumnie —
      // inaczej pod każdym tunelem wychodziłby jaśniejszy pionowy pas.
      const k = y < 420 ? 0 : y > 860 ? 1 : (y - 420) / 440;
      if (depth <= 2) c = pal.skorupa;
      else if (depth <= 6) c = pal.pod;
      else if (depth > 40 && k > 0.5 && (h & 2047) < 5) c = pal.zyla;
      else {
        const pas = Math.floor((y + fala) / 18);
        c = pal.pasy[((pas % 3) + 3) % 3];
        c = [c[0] + (pal.gleboko[0] - c[0]) * k, c[1] + (pal.gleboko[1] - c[1]) * k, c[2] + (pal.gleboko[2] - c[2]) * k];
      }
      let rr = c[0] + n - 7, gg = c[1] + (n >> 1) - 3, bb = c[2] + (n >> 2);
      // krawędź od boku (ściany jaskiń, zbocza) — jaśniejsza obwódka
      if (depth > 2 && ((x > 0 && !mask[i - 1]) || (x < terrain.w - 1 && !mask[i + 1]))) {
        rr += 55; gg += 30; bb += 10;
      } else if (depth > 2 && y + 1 < H && !mask[i + terrain.w]) {
        // sufit komory: przyciemniony, z lekkim żarem od dołu
        rr = rr * 0.7 + 30; gg *= 0.6; bb *= 0.6;
      }
      d[o] = rr > 255 ? 255 : rr; d[o + 1] = gg > 255 ? 255 : gg; d[o + 2] = bb > 255 ? 255 : bb; d[o + 3] = 255;
    }
  }
  r.tctx.putImageData(img, x0, 0);
}

export function buildTerrain(r, terrain) {
  swiatW = terrain.w;
  swiatH = terrain.h || WORLD_H;
  swiatLawa = terrain.lava0 ?? T_LAVA;
  if (r.terrainCanvas.width !== terrain.w) r.terrainCanvas.width = terrain.w;   // inny rozmiar mapy
  if (r.terrainCanvas.height !== swiatH) r.terrainCanvas.height = swiatH;
  r.tctx.clearRect(0, 0, terrain.w, swiatH);
  paintColumns(r, terrain, 0, terrain.w - 1);
}

export function repaintRect(r, terrain, rect) {
  const x0 = Math.max(0, Math.floor(rect.x0) - 2);
  const x1 = Math.min(terrain.w - 1, Math.ceil(rect.x1) + 2);
  r.tctx.clearRect(x0, 0, x1 - x0 + 1, swiatH);
  paintColumns(r, terrain, x0, x1);
}

/* Minimapa w rogu HUD-u (od 4.8): cały teren w skali, lawa, skrzynki, robale
   (aktywny z białą obwódką) i prostokąt tego, co widać na ekranie. */
export function rysujMinimape(canvas, r, state, cam, pingi = null) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sx = W / swiatW, sy = H / swiatH;
  ctx.fillStyle = '#0d0706';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(r.terrainCanvas, 0, 0, swiatW, swiatH, 0, 0, W, H);
  ctx.fillStyle = 'rgba(255, 90, 0, 0.85)';
  ctx.fillRect(0, state.lava * sy, W, H - state.lava * sy);
  ctx.fillStyle = '#ffd93b';
  for (const c of state.skrzynki || []) ctx.fillRect(c.x * sx - 1.5, c.y * sy - 3, 3, 3);
  const akt = activeOf(state);
  for (const w of state.worms) {
    if (!w.alive) continue;
    const v = w.widok || w;
    ctx.fillStyle = w.color;
    ctx.beginPath();
    ctx.arc(v.x * sx, (v.y - 8) * sy, w === akt ? 3.6 : 2.6, 0, 6.283);
    ctx.fill();
    if (w === akt) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); }
  }
  // pingi (4.9): migające kółka w kolorze gracza
  for (const p of pingi || []) {
    const t = (performance.now() - p.od) / 1000;
    ctx.strokeStyle = p.kolor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 10);
    ctx.beginPath();
    ctx.arc(p.x * sx, p.y * sy, 4 + (t * 6) % 5, 0, 6.283);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // kadr kamery
  const kw = r.viewW / cam.zoom, kh = r.viewH / cam.zoom;
  ctx.strokeStyle = 'rgba(255, 246, 207, 0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect((cam.x - kw / 2) * sx, (cam.y - kh / 2) * sy, kw * sx, kh * sy);
}

/* Rozmiar bieżącego świata (kamera, minimapa). */
export const rozmiarSwiata = () => ({ w: swiatW, h: swiatH });

/* ---------- kamera ---------- */

export function createCamera() {
  return { x: WORLD_W / 2, y: 520, zoom: 1, tx: WORLD_W / 2, ty: 520, tzoom: 1 };
}

export function focusCamera(cam, x, y, zoom) {
  cam.tx = x;
  cam.ty = y;
  if (zoom) cam.tzoom = zoom;
}

/* Ile świata wolno pokazać poza krawędzią mapy. Z boku i w górę kamera
   może wyjechać w pustkę (niebo, lawa), żeby robal stojący przy samej
   krawędzi był w kadrze, a nie przyklejony do brzegu ekranu albo schowany
   pod przyciskami na telefonie. */
const ZAPAS_BOK = 380;
const ZAPAS_NIEBO = 420;

/* dol: ile px CSS od dołu ekranu zasłania HUD (bronie, przyciski dotykowe).
   Dno świata może podjechać ponad ten pas, a świat niższy od ekranu
   (telefon pionowo) stoi tuż nad nim zamiast wisieć na środku. */
export function updateCamera(cam, dt, viewW, viewH, dol = 0) {
  const k = Math.min(1, dt * (cam.tempo || 4.2));   // 4.9: za pociskiem szybciej
  cam.x += (cam.tx - cam.x) * k;
  cam.y += (cam.ty - cam.y) * k;
  cam.zoom += (cam.tzoom - cam.zoom) * k;
  ograniczKamere(cam, viewW, viewH, dol);
}

/* Granice kamery zmieniają się z zoomem w sposób ciągły: im bardziej oddalona,
   tym węższy zakres, aż przy całej mapie w kadrze zostaje sam środek.
   Dawniej po przekroczeniu szerokości mapy kamera w jednej klatce skakała
   na środek i gubiła śledzonego robala. */
export function ograniczKamere(cam, viewW, viewH, dol = 0) {
  const halfW = viewW / (2 * cam.zoom);
  const halfH = viewH / (2 * cam.zoom);
  const zapasX = Math.min(ZAPAS_BOK, halfW * 0.8);
  const minX = halfW - zapasX;
  const maxX = swiatW - halfW + zapasX;
  if (minX <= maxX) {
    cam.x = Math.max(minX, Math.min(maxX, cam.x));
    cam.tx = Math.max(minX, Math.min(maxX, cam.tx));
  } else {
    cam.x = cam.tx = swiatW / 2;
  }
  const minY = halfH - Math.min(ZAPAS_NIEBO, halfH);
  const maxY = swiatH - (viewH / 2 - dol) / cam.zoom;
  if (minY <= maxY) {
    cam.y = Math.min(maxY, Math.max(minY, cam.y));
    cam.ty = Math.min(maxY, Math.max(minY, cam.ty));
  } else {
    cam.y = cam.ty = maxY;       // dno świata zostaje tuż nad dolnym HUD-em
  }
}

/* Punkt na ekranie (px CSS) → punkt w świecie. */
export function ekranNaSwiat(r, cam, sx, sy) {
  return {
    x: cam.x + (sx - r.viewW / 2) / cam.zoom,
    y: cam.y + (sy - r.viewH / 2) / cam.zoom
  };
}

/* ---------- rysowanie ---------- */

/* opcje: { mojeId, rozlaczeni: Set, celNalotu: {x,y}|null } */
export function draw(r, state, cam, fx, dt, opcje = {}) {
  const ctx = r.ctx;
  const W = r.viewW, H = r.viewH;
  r.time += dt;

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#07060a');
  sky.addColorStop(0.5, '#1d0704');
  sky.addColorStop(1, '#5a1604');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  drawTlo(ctx, r, cam, W, H);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  ctx.drawImage(r.terrainCanvas, 0, 0);
  drawLava(ctx, r.time, state.lava);

  if (opcje.celNalotu) drawCel(ctx, opcje.celNalotu, r.time);

  const akt = activeOf(state);
  // nagrobki poległych (4.9) — tylko grafika: opadają na grunt, gdy wybuch wytnie go spod nich
  for (const w of state.worms) if (!w.alive && !w.odszedl) drawNagrobek(ctx, r, state, w);
  for (const p of state.pulapki || []) drawPulapka(ctx, r, p);
  for (const c of state.skrzynki || []) {
    // skrzynka zebrana przez gracza z turą — widz wie o tym z podglądu na żywo
    if (opcje.zebraneSkrzynki && opcje.zebraneSkrzynki.has(c.id)) continue;
    drawSkrzynka(ctx, r, c);
  }
  for (const p of state.projectiles) drawProjectile(ctx, p);
  // lina ninja: od haka do robala (u gracza z turą ze stanu, u widzów z podglądu na żywo)
  for (const w of state.worms) {
    const v = w.widok || w;
    const hak = w.widok ? w.widok.lina : w.lina;
    if (!w.alive || !hak) continue;
    ctx.strokeStyle = '#d8c7a0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hak.x, hak.y);
    ctx.lineTo(v.x, v.y - WORM_H * 0.6);
    ctx.stroke();
    ctx.fillStyle = '#8e979f';
    ctx.beginPath();
    ctx.arc(hak.x, hak.y, 3, 0, 6.283);
    ctx.fill();
  }
  for (const w of state.worms) {
    if (!w.alive) continue;
    drawWorm(ctx, w, w === akt && state.phase === 'aim', r.time, {
      ja: (w.gracz ?? w.id) === opcje.mojeId,
      // w drużynach nick jest w kolorze drużyny (robal zostaje w swoim)
      kolorNicku: state.druzynowa && DRUZYNY[w.druzyna] ? DRUZYNY[w.druzyna].kolor : w.color,
      rozlaczony: !!opcje.rozlaczeni && opcje.rozlaczeni.has(w.gracz ?? w.id),
      moc: w === akt && state.phase === 'aim' ? (w.widok ? w.widok.moc : state.charging ? state.power : 0) : 0,
      bron: w === akt ? (w.widok ? w.widok.bron : state.weapon) : null,
      hpMax: state.ust ? state.ust.hp : 100,
      emotka: opcje.emotki ? opcje.emotki.get(w.gracz ?? w.id) || null : null,
      akc: opcje.akcesoria ? akcesorium(opcje.akcesoria.get(w.gracz ?? w.id)) : null
    });
  }

  if (fx) drawFx(fx, ctx);
  if (opcje.pingi) for (const p of opcje.pingi) drawPing(ctx, p, cam.zoom);
  ctx.restore();
  // pingi poza kadrem: strzałka przy krawędzi ekranu w kolorze gracza
  if (opcje.pingi) for (const p of opcje.pingi) strzalkaPingu(ctx, r, cam, p);
}

/* Ping (4.9): pinezka z pulsującymi kręgami i nickiem — rozmiar niezależny od zoomu. */
function drawPing(ctx, p, zoom) {
  const s = 1 / Math.max(0.35, Math.min(1.6, zoom));
  const znik = Math.min(1, (p.dl - p.t) / 0.6);
  const wejscie = Math.min(1, p.t / 0.25);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(s, s);
  ctx.globalAlpha = znik;
  for (let k = 0; k < 3; k++) {
    const f = (p.t * 0.9 + k / 3) % 1;
    ctx.globalAlpha = znik * (1 - f) * 0.8;
    ctx.strokeStyle = p.kolor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8 + f * 34, (8 + f * 34) * 0.45, 0, 0, 6.283);
    ctx.stroke();
  }
  ctx.globalAlpha = znik;
  const skok = -Math.abs(Math.sin(p.t * 5)) * 6 * (1 - Math.min(1, p.t / 2)) - 30 * (1 - wejscie);
  ctx.translate(0, skok);
  // pinezka: kropla w kolorze gracza z białym środkiem
  ctx.fillStyle = p.kolor;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-4, -8, -12, -14, -12, -24);
  ctx.arc(0, -24, 12, Math.PI, 0);
  ctx.bezierCurveTo(12, -14, 4, -8, 0, 0);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, -24, 4.5, 0, 6.283);
  ctx.fill();
  ctx.font = '800 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(p.nick, 0, -42);
  ctx.fillStyle = p.kolor;
  ctx.fillText(p.nick, 0, -42);
  ctx.restore();
}

function strzalkaPingu(ctx, r, cam, p) {
  const sx = (p.x - cam.x) * cam.zoom + r.viewW / 2;
  const sy = (p.y - cam.y) * cam.zoom + r.viewH / 2;
  const m = 26;
  if (sx >= m && sx <= r.viewW - m && sy >= m && sy <= r.viewH - m) return;
  const x = Math.max(m, Math.min(r.viewW - m, sx)), y = Math.max(m, Math.min(r.viewH - m, sy));
  const kat = Math.atan2(sy - y, sx - x);
  ctx.save();
  ctx.globalAlpha = Math.min(1, (p.dl - p.t) / 0.6) * (0.75 + 0.25 * Math.sin(p.t * 8));
  ctx.translate(x, y);
  ctx.rotate(kat);
  ctx.fillStyle = p.kolor;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* Tło: gwiazdy, dwa pasma odległych gór (paralaksa) i unoszący się popiół.
   Wszystko w układzie ekranu, liczone z pozycji kamery — nic z tego nie
   wpływa na grę. */
const GORY_TLA = [0.18, 0.38].map((par, k) => {
  const pkt = [];
  let h = 0.5;
  for (let i = 0; i <= 64; i++) {
    h += Math.sin(i * (1.7 + k) + k * 3.1) * 0.22 + Math.sin(i * 0.37 + k) * 0.12;
    h = Math.max(0.1, Math.min(0.95, h));
    pkt.push(h);
  }
  return { par, pkt, kolor: k === 0 ? '#1a0a0a' : '#260d08', wys: k === 0 ? 260 : 200 };
});
const GWIAZDY = Array.from({ length: 70 }, (_, i) => ({
  x: (Math.sin(i * 12.9898) * 43758.5453) % 1, y: (Math.sin(i * 78.233) * 12543.1) % 1, r: 0.6 + (i % 3) * 0.4
}));

function drawTlo(ctx, r, cam, W, H) {
  // gwiazdy prawie nieruchome
  ctx.fillStyle = 'rgba(255,230,200,0.5)';
  for (const g of GWIAZDY) {
    const x = ((Math.abs(g.x) * W * 1.3 - cam.x * 0.03) % W + W) % W;
    const y = Math.abs(g.y) * H * 0.45 - cam.y * 0.02;
    const miganie = 0.5 + 0.5 * Math.sin(r.time * 1.5 + g.x * 50);
    ctx.globalAlpha = 0.3 + miganie * 0.5;
    ctx.fillRect(x, y, g.r, g.r);
  }
  ctx.globalAlpha = 1;
  // pasma gór: im dalej, tym wolniej przesuwają się z kamerą
  const horyzont = H * 0.62 + (swiatLawa - cam.y) * cam.zoom * 0.12;
  // 4.9: krwawy księżyc z poświatą i daleki wulkan z łuną
  const kx = W * 0.78 - cam.x * 0.01, ky = H * 0.2 - cam.y * 0.01;
  const kr = Math.max(26, Math.min(W, H) * 0.07);
  const halo = ctx.createRadialGradient(kx, ky, kr * 0.6, kx, ky, kr * 3.2);
  halo.addColorStop(0, 'rgba(255,120,70,0.28)');
  halo.addColorStop(1, 'rgba(255,80,40,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(kx - kr * 3.2, ky - kr * 3.2, kr * 6.4, kr * 6.4);
  const ks = ctx.createRadialGradient(kx - kr * 0.3, ky - kr * 0.3, kr * 0.1, kx, ky, kr);
  ks.addColorStop(0, '#ffc9a0');
  ks.addColorStop(1, '#c2462a');
  ctx.fillStyle = ks;
  ctx.beginPath();
  ctx.arc(kx, ky, kr, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,30,20,0.35)';
  for (const [ox, oy, rr] of [[-0.3, -0.1, 0.22], [0.25, 0.3, 0.16], [0.1, -0.4, 0.1]]) {
    ctx.beginPath(); ctx.arc(kx + ox * kr, ky + oy * kr, rr * kr, 0, 6.283); ctx.fill();
  }
  const wx = W * 0.3 - (cam.x * 0.06) % (W * 1.6), wy = horyzont - 20;
  for (const wxx of [wx, wx + W * 1.6]) {
    const luna = ctx.createRadialGradient(wxx, wy - 150, 5, wxx, wy - 150, 160);
    luna.addColorStop(0, 'rgba(255,120,30,' + (0.35 + 0.1 * Math.sin(r.time * 1.3)) + ')');
    luna.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = luna;
    ctx.fillRect(wxx - 160, wy - 310, 320, 320);
    ctx.fillStyle = '#140707';
    ctx.beginPath();
    ctx.moveTo(wxx - 190, wy + 40);
    ctx.lineTo(wxx - 30, wy - 150);
    ctx.lineTo(wxx + 30, wy - 150);
    ctx.lineTo(wxx + 200, wy + 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,110,20,0.8)';
    ctx.fillRect(wxx - 26, wy - 152, 52, 4);
  }
  for (const g of GORY_TLA) {
    const skok = 90;
    const przes = -(cam.x * g.par) % skok;
    const start = Math.floor((cam.x * g.par) / skok);
    ctx.fillStyle = g.kolor;
    ctx.beginPath();
    ctx.moveTo(-skok, H);
    for (let i = -1; i <= Math.ceil(W / skok) + 1; i++) {
      const p = g.pkt[(((start + i) % 64) + 64) % 64];
      ctx.lineTo(i * skok + przes, horyzont - p * g.wys * (0.6 + g.par));
    }
    ctx.lineTo(W + skok, H);
    ctx.closePath();
    ctx.fill();
  }
  // żar od lawy na dole ekranu
  const zar = ctx.createLinearGradient(0, H * 0.55, 0, H);
  zar.addColorStop(0, 'rgba(255,80,0,0)');
  zar.addColorStop(1, 'rgba(255,90,0,0.22)');
  ctx.fillStyle = zar;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);
  // popiół i iskry
  for (let i = 0; i < 26; i++) {
    const sx = ((i * 97.3 + r.time * (8 + (i % 5) * 3)) % (W + 40)) - 20;
    const sy = H - ((i * 53.7 + r.time * (14 + (i % 7) * 4)) % (H + 40));
    ctx.fillStyle = i % 4 === 0 ? 'rgba(255,150,60,0.55)' : 'rgba(160,140,130,0.25)';
    ctx.fillRect(sx, sy, i % 4 === 0 ? 2 : 1.5, i % 4 === 0 ? 2 : 1.5);
  }
}

function activeOf(state) {
  if (state.phase === 'over') return null;
  const id = state.order[state.turnPtr % state.order.length];
  return state.worms.find((w) => w.id === id) || null;
}

function drawLava(ctx, time, poziom) {
  const g = ctx.createLinearGradient(0, poziom - 20, 0, swiatH);
  g.addColorStop(0, 'rgba(255,150,30,0.85)');
  g.addColorStop(0.18, '#ff5a00');
  g.addColorStop(1, '#8a0f00');
  ctx.fillStyle = g;
  // lawa sięga daleko za mapę — kamera potrafi tam zajrzeć
  ctx.fillRect(-1400, poziom, swiatW + 2800, swiatH - poziom + 1400);

  // poświata nad lawą (4.9)
  const zar = ctx.createLinearGradient(0, poziom - 90, 0, poziom);
  zar.addColorStop(0, 'rgba(255,90,0,0)');
  zar.addColorStop(1, 'rgba(255,110,10,0.28)');
  ctx.fillStyle = zar;
  ctx.fillRect(-1400, poziom - 90, swiatW + 2800, 90);
  // bąble i jaśniejsze plamy pod powierzchnią
  for (let i = 0; i < Math.ceil(swiatW / 70); i++) {
    const x = i * 70 + Math.sin(i * 12.7) * 30;
    const faza = (time * (0.35 + (i % 5) * 0.08) + i * 0.37) % 1;
    ctx.fillStyle = 'rgba(255,200,80,' + (0.25 * (1 - faza)) + ')';
    ctx.beginPath();
    ctx.ellipse(x, poziom + 14 + (i % 3) * 10, 16 + (i % 4) * 5, 4, 0, 0, 6.283);
    ctx.fill();
    if (faza < 0.35) {
      const rr = 2 + faza * 12;
      ctx.strokeStyle = 'rgba(255,230,150,' + (0.8 - faza * 2) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + 8, poziom - 1, rr, Math.PI, 0);
      ctx.stroke();
    }
  }

  // falująca, świecąca powierzchnia
  ctx.strokeStyle = 'rgba(255,220,120,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = -1400; x <= swiatW + 1400; x += 16) {
    const y = poziom + Math.sin(x * 0.012 + time * 1.6) * 3 + Math.sin(x * 0.03 - time * 2.3) * 2;
    if (x === -1400) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawCel(ctx, cel, time) {
  const r = 14 + Math.sin(time * 6) * 2;
  if (cel.most) {
    // zarys belki, zielony gdy da się postawić, czerwony gdy nie
    ctx.fillStyle = cel.zle ? 'rgba(255,60,40,0.35)' : 'rgba(255,170,70,0.35)';
    ctx.strokeStyle = cel.zle ? '#ff3b23' : '#ffb347';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    if (cel.k) {
      // obrócony most (klawisz R): środek belki w punkcie celu, co 22,5°
      ctx.save();
      ctx.translate(cel.x, cel.y);
      ctx.rotate(cel.k * Math.PI / 8);
      ctx.fillRect(-45, -3.5, 90, 7);
      ctx.strokeRect(-45, -3.5, 90, 7);
      ctx.restore();
    } else {
      ctx.fillRect(cel.x - 45, cel.y, 90, 7);
      ctx.strokeRect(cel.x - 45, cel.y, 90, 7);
    }
    ctx.setLineDash([]);
    return;
  }
  if (cel.teleport) {
    // portal: wirujące fioletowe pierścienie tam, gdzie robal się pojawi
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = 'rgba(190,120,255,' + (0.9 - i * 0.25) + ')';
      ctx.lineWidth = 2.5 - i * 0.5;
      ctx.beginPath();
      ctx.ellipse(cel.x, cel.y - 10, 9 + i * 5, 14 + i * 5, 0, time * (3 + i) , time * (3 + i) + 4.6);
      ctx.stroke();
    }
    return;
  }
  ctx.strokeStyle = '#ff3b23';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cel.x, cel.y, r, 0, 6.283);
  ctx.moveTo(cel.x - r - 6, cel.y); ctx.lineTo(cel.x + r + 6, cel.y);
  ctx.moveTo(cel.x, cel.y - r - 6); ctx.lineTo(cel.x, cel.y + r + 6);
  ctx.stroke();
  // pionowa linia — rakiety spadają z nieba
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = 'rgba(255,80,40,0.35)';
  ctx.beginPath();
  ctx.moveTo(cel.x, 0);
  ctx.lineTo(cel.x, cel.y - r - 8);
  ctx.stroke();
  ctx.setLineDash([]);
}

/* Zrzut na spadochronie: przez pierwsze 1,6 s skrzynka opada z nieba
   (tylko obraz — w symulacji już leży na gruncie). */
export function zrzutAnimacja(r, id) {
  r.zrzuty.set(id, r.time);
  if (r.zrzuty.size > 20) r.zrzuty.delete(r.zrzuty.keys().next().value);
}

function drawSkrzynka(ctx, r, c) {
  const t0 = r.zrzuty.get(c.id);
  const f = t0 === undefined ? 1 : Math.min(1, (r.time - t0) / 1.6);
  const spad = (1 - f) * 420;
  const apteczka = c.typ === 'apteczka';
  const t = r.time + c.id;
  ctx.save();
  ctx.translate(c.x + Math.sin(r.time * 3 + c.id) * (1 - f) * 10, c.y - spad);
  if (f < 1) {
    // spadochron w pasy, linki do rogów skrzynki
    ctx.strokeStyle = 'rgba(255,240,220,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const x of [-11, -4, 4, 11]) { ctx.moveTo(x * 0.9, -18); ctx.lineTo(x * 2.1, -40); }
    ctx.stroke();
    const segm = 6;
    for (let i = 0; i < segm; i++) {
      const a0 = Math.PI + (i / segm) * Math.PI, a1 = Math.PI + ((i + 1) / segm) * Math.PI;
      ctx.fillStyle = i % 2 ? '#f6efe2' : (apteczka ? '#e0302a' : '#e0a93a');
      ctx.beginPath();
      ctx.moveTo(0, -38);
      ctx.arc(0, -38, 25, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -38, 25, Math.PI, 0);
    ctx.stroke();
  } else {
    // poświata: pulsuje, żeby skrzynkę było widać z daleka
    const puls = 0.5 + 0.5 * Math.sin(t * 3);
    const g = ctx.createRadialGradient(0, -9, 2, 0, -9, 26);
    g.addColorStop(0, apteczka ? 'rgba(120,255,150,' + (0.35 + puls * 0.25) + ')' : 'rgba(255,210,70,' + (0.3 + puls * 0.25) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-28, -36, 56, 54);
    // cień na gruncie
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 2.8, 0, 0, 6.283);
    ctx.fill();
  }
  const bujanie = f >= 1 ? Math.sin(r.time * 2.4 + c.id) * 1.2 : 0;
  ctx.translate(0, bujanie);
  const zaokr = (x, y, w, h, rr) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, rr); else ctx.rect(x, y, w, h);
  };
  if (apteczka) {
    // apteczka: biała walizka z uchwytem, połyskiem i czerwonym krzyżem
    ctx.strokeStyle = '#5a5a5a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, -17); ctx.lineTo(-5, -21); ctx.lineTo(5, -21); ctx.lineTo(5, -17);
    ctx.stroke();
    const g = ctx.createLinearGradient(0, -17, 0, 0);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#cfd6dc');
    ctx.fillStyle = g;
    zaokr(-11, -17, 22, 17, 3);
    ctx.fill();
    ctx.strokeStyle = '#7a8590';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#e02a24';
    ctx.fillRect(-2.6, -14.5, 5.2, 12);
    ctx.fillRect(-6.8, -11, 13.6, 5.2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-9.5, -15.6, 19, 2);
    // unoszące się plusiki
    if (f >= 1) {
      for (let k = 0; k < 2; k++) {
        const u = (t * 0.7 + k * 0.5) % 1;
        ctx.globalAlpha = (1 - u) * 0.9;
        ctx.fillStyle = '#7dff9a';
        const px = (k ? 7 : -7) + Math.sin(u * 6 + k) * 2, py = -22 - u * 18;
        ctx.fillRect(px - 2.5, py - 0.8, 5, 1.6);
        ctx.fillRect(px - 0.8, py - 2.5, 1.6, 5);
      }
      ctx.globalAlpha = 1;
    }
  } else {
    // skrzynka z amunicją: wojskowa, zielona, z okuciami, pasem ostrzegawczym i nabojami
    const g = ctx.createLinearGradient(0, -18, 0, 0);
    g.addColorStop(0, '#6f7f3f');
    g.addColorStop(1, '#465426');
    ctx.fillStyle = g;
    zaokr(-12, -18, 24, 18, 2.5);
    ctx.fill();
    ctx.strokeStyle = '#232a12';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // wieko
    ctx.fillStyle = '#809149';
    ctx.fillRect(-12, -18, 24, 4.5);
    ctx.strokeStyle = '#232a12';
    ctx.lineWidth = 1;
    ctx.strokeRect(-12, -18, 24, 4.5);
    // pas żółto-czarny
    ctx.save();
    ctx.beginPath();
    ctx.rect(-12, -9, 24, 4);
    ctx.clip();
    ctx.fillStyle = '#ffd23b';
    ctx.fillRect(-12, -9, 24, 4);
    ctx.fillStyle = '#1a1a1a';
    for (let x = -14; x < 14; x += 4) {
      ctx.beginPath();
      ctx.moveTo(x, -5); ctx.lineTo(x + 2, -9); ctx.lineTo(x + 4, -9); ctx.lineTo(x + 2, -5);
      ctx.fill();
    }
    ctx.restore();
    // okucia i nity
    ctx.fillStyle = '#c9ced2';
    for (const [x, y] of [[-10.5, -12], [10.5, -12], [-10.5, -2], [10.5, -2]]) {
      ctx.beginPath(); ctx.arc(x, y, 1.1, 0, 6.283); ctx.fill();
    }
    // naboje wystające spod wieka
    for (const x of [-6, -2, 2, 6]) {
      ctx.fillStyle = '#d9a441';
      ctx.fillRect(x - 1.2, -22, 2.4, 4.5);
      ctx.fillStyle = '#b87333';
      ctx.beginPath();
      ctx.arc(x, -22, 1.2, Math.PI, 0);
      ctx.fill();
    }
    if (f >= 1) {
      ctx.font = '800 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText('AMMO', 0, -26 - Math.abs(Math.sin(t * 2)) * 2);
      ctx.fillStyle = '#ffd23b';
      ctx.fillText('AMMO', 0, -26 - Math.abs(Math.sin(t * 2)) * 2);
    }
  }
  ctx.restore();
}

/* Mina: płaski dysk z kolcami i diodą — miga spokojnie, a po uzbrojeniu szybko na czerwono.
   Beczka: czerwona beczka z ostrzeżeniem, przed wybuchem drży i świeci. */
function drawPulapka(ctx, r, p) {
  const t = r.time + p.id * 0.7;
  const lont = p.lont >= 0;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.typ === 'mina') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 2.4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#3a3f45';
    ctx.strokeStyle = '#15181b';
    ctx.lineWidth = 1;
    for (const kx of [-7, -3.5, 0, 3.5, 7]) {
      ctx.beginPath(); ctx.moveTo(kx - 1, -3); ctx.lineTo(kx, -7.5); ctx.lineTo(kx + 1, -3); ctx.fill();
    }
    const g = ctx.createLinearGradient(0, -6, 0, 0);
    g.addColorStop(0, '#6b737c');
    g.addColorStop(1, '#2c3136');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, -2.5, 9, 3.6, 0, Math.PI, 0); ctx.lineTo(9, 0); ctx.lineTo(-9, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    const miga = lont ? Math.sin(t * 30) > 0 : Math.sin(t * 3) > 0.6;
    ctx.fillStyle = miga ? (lont ? '#ff2a1a' : '#ff6a3a') : '#5a1a14';
    ctx.beginPath(); ctx.arc(0, -5.5, 1.8, 0, 6.283); ctx.fill();
    if (miga) {
      const gl = ctx.createRadialGradient(0, -5.5, 0, 0, -5.5, lont ? 16 : 9);
      gl.addColorStop(0, lont ? 'rgba(255,40,20,0.7)' : 'rgba(255,90,40,0.4)');
      gl.addColorStop(1, 'rgba(255,40,20,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(-16, -22, 32, 32);
    }
    if (lont) {
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText('!', 0, -14);
      ctx.fillStyle = '#ff3b23';
      ctx.fillText('!', 0, -14);
    }
  } else {
    if (lont) ctx.translate(Math.sin(t * 60) * 1.2, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 2.6, 0, 0, 6.283); ctx.fill();
    const g = ctx.createLinearGradient(-8, 0, 8, 0);
    g.addColorStop(0, '#7a1410');
    g.addColorStop(0.45, '#e0402a');
    g.addColorStop(1, '#6a100c');
    ctx.fillStyle = g;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-7.5, -21, 15, 21, 3); else ctx.rect(-7.5, -21, 15, 21);
    ctx.fill();
    ctx.strokeStyle = '#3a0806';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#9a2a1a';
    ctx.fillRect(-7.5, -16, 15, 1.6);
    ctx.fillRect(-7.5, -6, 15, 1.6);
    ctx.fillStyle = '#c0341f';
    ctx.beginPath(); ctx.ellipse(0, -21, 7.5, 2, 0, 0, 6.283); ctx.fill();
    // żółty romb z płomieniem
    ctx.fillStyle = '#ffd23b';
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(4, -11); ctx.lineTo(0, -7); ctx.lineTo(-4, -11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.moveTo(0, -13.5); ctx.quadraticCurveTo(1.8, -11, 0, -8.6); ctx.quadraticCurveTo(-1.8, -11, 0, -13.5); ctx.fill();
    if (lont) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 40);
      const gl = ctx.createRadialGradient(0, -10, 2, 0, -10, 24);
      gl.addColorStop(0, 'rgba(255,200,60,0.8)');
      gl.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(-24, -34, 48, 48);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

/* Nagrobek (4.9): kamień z rogami kozła i imieniem. Pozycja tylko do rysowania —
   opada do gruntu pod sobą (w stanie gry martwy robal nie istnieje). */
const nagrobkiY = new Map();
function drawNagrobek(ctx, r, state, w) {
  const t = state.terrain;
  if (w.y > state.lava - 4) return;           // w lawie nagrobka nie ma
  const x = Math.round(w.x);
  const klucz = state.seed + ':' + w.id;
  let y = nagrobkiY.has(klucz) ? nagrobkiY.get(klucz) : w.y;
  if (y > w.y + 2000 || y < w.y - 2000) y = w.y;
  if (!solidAt(t, x, Math.round(y) + 1)) {
    y = Math.min(y + 4, state.lava + 20);
  } else {
    while (solidAt(t, x, Math.round(y)) && y > w.y - 40) y -= 1;
  }
  nagrobkiY.set(klucz, y);
  if (nagrobkiY.size > 200) nagrobkiY.clear();
  if (y > state.lava) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 2.4, 0, 0, 6.283); ctx.fill();
  // rogi kozła
  ctx.strokeStyle = '#8f8778';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, -20); ctx.quadraticCurveTo(-10, -27, -12, -19);
  ctx.moveTo(4, -20); ctx.quadraticCurveTo(10, -27, 12, -19);
  ctx.stroke();
  const g = ctx.createLinearGradient(-8, 0, 8, 0);
  g.addColorStop(0, '#7d7a74');
  g.addColorStop(0.5, '#b4afa6');
  g.addColorStop(1, '#6a665f');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#3a3834';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-8, 0); ctx.lineTo(-8, -15); ctx.quadraticCurveTo(-8, -23, 0, -23); ctx.quadraticCurveTo(8, -23, 8, -15); ctx.lineTo(8, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // krzyżyk i pasek w kolorze robala
  ctx.fillStyle = '#4a4742';
  ctx.fillRect(-0.9, -19, 1.8, 8);
  ctx.fillRect(-3.2, -16.5, 6.4, 1.8);
  ctx.fillStyle = w.color;
  ctx.fillRect(-6, -6, 12, 2.4);
  ctx.font = '700 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText('RIP ' + w.name, 0, -28);
  ctx.fillStyle = 'rgba(255,240,220,0.85)';
  ctx.fillText('RIP ' + w.name, 0, -28);
  ctx.restore();
}

function drawProjectile(ctx, p) {
  const weapon = WEAPONS[p.weapon];
  ctx.save();
  ctx.translate(p.x, p.y);

  if (weapon.kind === 'owca') {
    // koza (GOAT): smukłe ciało, rogi zagięte do tyłu, bródka, przebierające nóżki
    const kier = p.vx >= 0 ? 1 : -1;
    const t = performance.now() / 1000;
    ctx.scale(kier, 1);                              // rysujemy w prawo, lustro dla biegu w lewo
    ctx.strokeStyle = '#3b2a1c';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const [lx, faza] of [[-6, 0], [-2, 1.6], [3, 3.1], [6.5, 4.7]]) {
      const kr = Math.sin(t * 18 + faza) * 2.2;
      ctx.beginPath();
      ctx.moveTo(lx, -5);
      ctx.lineTo(lx + kr, 0);
      ctx.stroke();
    }
    // ogonek do góry
    ctx.fillStyle = '#e9e1d2';
    ctx.beginPath();
    ctx.ellipse(-9.5, -11, 1.6, 3, -0.5, 0, 6.283);
    ctx.fill();
    // tułów z łatą
    ctx.fillStyle = '#efe7d8';
    ctx.beginPath();
    ctx.ellipse(0, -8.5, 9.5, 5, 0, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = '#b89a78';
    ctx.beginPath();
    ctx.ellipse(-3, -10, 3.4, 2.4, 0.3, 0, 6.283);
    ctx.fill();
    // szyja i łeb
    ctx.fillStyle = '#efe7d8';
    ctx.beginPath();
    ctx.moveTo(5, -11); ctx.lineTo(9, -17); ctx.lineTo(12, -15); ctx.lineTo(9, -8);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(12, -16, 3.8, 2.8, 0.35, 0, 6.283);
    ctx.fill();
    // rogi zagięte do tyłu
    ctx.strokeStyle = '#6b5a45';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(10.5, -18.5); ctx.quadraticCurveTo(8, -23.5, 4.5, -22);
    ctx.moveTo(12, -18.8); ctx.quadraticCurveTo(10.5, -24.5, 7, -24);
    ctx.stroke();
    // ucho, oko, bródka
    ctx.fillStyle = '#d8ccb6';
    ctx.beginPath();
    ctx.ellipse(9, -16, 2.6, 1.1, -0.4, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = '#1a1210';
    ctx.fillRect(12.4, -17.4, 1.5, 1.5);
    ctx.fillStyle = '#d8ccb6';
    ctx.beginPath();
    ctx.moveTo(13.5, -14); ctx.lineTo(15.2, -9.5); ctx.lineTo(12.6, -12.8);
    ctx.fill();
    ctx.scale(kier, 1);                              // napis lontu bez lustra
    if (p.fuse !== null) {
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.fuse < 1.5 ? '#ff3b23' : '#fff1c2';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      const napis = Math.ceil(p.fuse).toString();
      ctx.strokeText(napis, 0, -30);                 // nad rogami
      ctx.fillText(napis, 0, -30);
    }
    ctx.restore();
    return;
  }

  if (weapon.kind === 'wiertlo') {
    // świder: korpus i obracający się gwint z przodu
    ctx.rotate(Math.atan2(p.vy, p.vx));
    const t = performance.now() / 40;
    ctx.fillStyle = '#6d7680';
    ctx.fillRect(-12, -5, 10, 10);
    ctx.fillStyle = '#b8c2cc';
    ctx.beginPath();
    ctx.moveTo(-2, -6); ctx.lineTo(12, 0); ctx.lineTo(-2, 6);
    ctx.fill();
    ctx.strokeStyle = '#4a525a';
    ctx.lineWidth = 1.4;
    for (let k = 0; k < 3; k++) {
      const x = -1 + ((t + k * 4) % 12);
      const h = 6 * (1 - x / 12);
      ctx.beginPath();
      ctx.moveTo(x, -h); ctx.lineTo(x + 2, h);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (weapon.kind === 'pocisk') {
    ctx.rotate(Math.atan2(p.vy, p.vx));
    if (weapon.id === 'odlamek') {
      ctx.fillStyle = '#2d2a26';
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, 6.283);
      ctx.fill();
    } else {
      const dl = weapon.id === 'rakieta' ? 14 : weapon.id === 'rakietka' ? 12 : 18;
      ctx.fillStyle = weapon.id === 'rakieta' ? '#c9c2b6' : weapon.id === 'rakietka' ? '#d9c38a' : '#e8e2d8';
      ctx.fillRect(-dl / 2, -3, dl, 6);
      ctx.fillStyle = '#ff3b00';
      ctx.beginPath();
      ctx.moveTo(dl / 2, 0); ctx.lineTo(dl / 2 - 6, -4); ctx.lineTo(dl / 2 - 6, 4);
      ctx.fill();
    }
  } else if (weapon.id === 'swiety') {
    // Święty GOAT: złota kula z rogami i aureolą, lont odlicza nad nią
    const t = performance.now() / 1000;
    ctx.strokeStyle = 'rgba(255, 236, 150, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, -13 + Math.sin(t * 4) * 1, 7, 2.2, 0, 0, 6.283);
    ctx.stroke();
    const g = ctx.createRadialGradient(-2, -3, 1, 0, 0, 8);
    g.addColorStop(0, '#fff6c4');
    g.addColorStop(1, '#d9a81c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = '#8a6a1a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-3, -6); ctx.quadraticCurveTo(-7, -11, -10, -8);
    ctx.moveTo(3, -6); ctx.quadraticCurveTo(7, -11, 10, -8);
    ctx.stroke();
    ctx.fillStyle = '#3a2a10';
    ctx.fillRect(-3.4, -1.5, 1.6, 1.6);
    ctx.fillRect(1.8, -1.5, 1.6, 1.6);
    if (p.fuse !== null) {
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.fuse < 1.5 ? '#ff3b23' : '#fff1c2';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      const napis = Math.ceil(p.fuse).toString();
      ctx.strokeText(napis, 0, -20);
      ctx.fillText(napis, 0, -20);
    }
  } else if (weapon.id === 'dynamit') {
    // laska dynamitu z tlącym się lontem i odliczaniem nad nią
    ctx.fillStyle = '#c62b1a';
    ctx.fillRect(-5, -9, 10, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-4, -9, 3, 18);
    ctx.fillStyle = '#2b1a10';
    ctx.fillRect(-5, -3, 10, 2.5);
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(4, -14, 2, -17);
    ctx.stroke();
    if (p.fuse !== null) {
      const t = performance.now() / 1000;
      ctx.fillStyle = '#ffd23b';
      for (let i = 0; i < 4; i++) {
        const a = t * 20 + i * 1.6;
        ctx.fillRect(2 + Math.cos(a) * 4, -17 + Math.sin(a) * 4, 1.6, 1.6);
      }
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.fuse < 1.5 ? '#ff3b23' : '#fff1c2';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      const napis = Math.ceil(p.fuse).toString();
      ctx.strokeText(napis, 0, -24);
      ctx.fillText(napis, 0, -24);
    }
  } else {
    const dynamit = false;
    ctx.fillStyle = weapon.id === 'kasetowa' ? '#5b4a8a' : '#3f4a35';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(-2, -2, 2, 0, 6.283);
    ctx.fill();
    if (weapon.id === 'kasetowa') {
      ctx.strokeStyle = '#ffd93b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, 6.283);
      ctx.stroke();
    }
    // lont miga tym szybciej, im bliżej wybuchu
    if (p.fuse !== null && !dynamit) {
      const blink = p.fuse < 1 ? (Math.floor(p.fuse * 10) % 2 === 0) : true;
      if (blink) {
        ctx.fillStyle = '#ffd23b';
        ctx.beginPath();
        ctx.arc(0, -9, 2.5, 0, 6.283);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/* Robal z emotką albo w tańcu (od 4.3.1): taniec to tylko przesunięcie
   i obrót rysunku — symulacja o niczym nie wie. o.emotka = { tekst, taniec, t (s), dl (s) }. */
function drawWorm(ctx, w, isActive, time, o) {
  const e = o.emotka;
  if (!e) { rysujRobala(ctx, w, isActive, time, o); return; }
  let dx = 0, dy = 0, odwroc = false, obrot = 0;
  const v0 = w.widok || w;
  if (e.taniec === 'breakdance') {
    obrot = e.t * 9;                                  // kręci się na głowie
    dy = -8 - Math.abs(Math.sin(e.t * 9)) * 3;
  } else if (e.taniec === 'floss') {
    dx = Math.sin(e.t * 14) * 6;                     // szybkie bujanie na boki
    obrot = Math.sin(e.t * 14 + 1.5) * 0.35;
    odwroc = Math.floor(e.t * 4.5) % 2 === 1;
  } else if (e.taniec === 'helikopter') {
    dy = -Math.sin(Math.min(1, e.t / e.dl) * Math.PI) * 30;   // wznosi się i ląduje
    odwroc = Math.floor(e.t * 12) % 2 === 1;                  // wirnik
    obrot = Math.sin(e.t * 3) * 0.15;
  } else if (e.taniec === 'disco') {
    dy = -Math.abs(Math.sin(e.t * 6)) * 7;
    obrot = Math.sin(e.t * 3) * 0.45;                // ręka w górę, ręka w dół
    odwroc = Math.sin(e.t * 3) < 0;
  } else if (e.taniec === 'kozi') {
    dy = -Math.abs(Math.sin(e.t * 7)) * 16;           // kozie susy z obrotem w locie
    obrot = Math.sin(e.t * 7) > 0.2 ? Math.sin(e.t * 3.5) * 0.9 : 0;
    dx = Math.sin(e.t * 3.5) * 10;
  } else if (e.taniec === 'szczescie') {
    dy = -Math.abs(Math.sin(e.t * 9)) * 12;          // podskoki
    odwroc = Math.floor(e.t * 2.2) % 2 === 1;        // obrót co skok albo dwa
  } else if (e.taniec === 'robak') {
    dx = Math.sin(e.t * 11) * 5;                     // wężyk na boki
    dy = -Math.abs(Math.sin(e.t * 5.5)) * 4;
    odwroc = Math.sin(e.t * 5.5) < 0;
  }
  ctx.save();
  ctx.translate(dx, dy);
  if (obrot) {
    const oy = v0.y - WORM_H / 2;
    ctx.translate(v0.x, oy);
    ctx.rotate(obrot);
    ctx.translate(-v0.x, -oy);
  }
  rysujRobala(ctx, w, isActive, time, { ...o, bron: e.taniec ? null : o.bron, odwroc, bezNapisu: o.bezNapisu || !!obrot });
  ctx.restore();
  // przy obrocie nick i pasek życia rysujemy osobno, prosto
  if (obrot && !o.bezNapisu) rysujRobala(ctx, w, false, time, { ...o, tylkoNapis: true });
  if (e.tekst) dymekEmotki(ctx, w.widok || w, e);
}

/* Dymek nad głową: wyskakuje, trzyma się i znika pod koniec. */
function dymekEmotki(ctx, v, e) {
  const wejscie = Math.min(1, e.t / 0.18);
  const znikanie = Math.min(1, Math.max(0, (e.dl - e.t) / 0.4));
  const skala = 0.6 + 0.4 * wejscie;
  const x = v.x, y = v.y - WORM_H - 44;
  ctx.save();
  ctx.globalAlpha = znikanie;
  ctx.translate(x, y);
  ctx.scale(skala, skala);
  ctx.font = '800 16px system-ui, sans-serif';
  const szer = Math.max(34, ctx.measureText(e.tekst).width + 18);
  ctx.fillStyle = 'rgba(255, 250, 240, 0.96)';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-szer / 2, -14, szer, 28, 12) : ctx.rect(-szer / 2, -14, szer, 28);
  ctx.moveTo(-5, 14); ctx.lineTo(0, 22); ctx.lineTo(5, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1a1210';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e.tekst, 0, 1);
  ctx.restore();
}

function rysujRobala(ctx, w, isActive, time, o) {
  // Cudzy robal w trakcie tury: pozycja i celownik z podglądu na żywo.
  const v = w.widok || w;
  const cx = v.x;
  const cy = v.y - WORM_H / 2;
  if (o.tylkoNapis) { napisRobala(ctx, w, v, cx, cy, o); return; }
  const facing = (v.facing ?? w.facing) * (o.odwroc ? -1 : 1);
  const angle = v.angle ?? w.angle;

  if (isActive) {
    ctx.globalAlpha = 0.35 + Math.sin(time * 4) * 0.15;
    ctx.fillStyle = w.color;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = o.rozlaczony ? 0.45 : 1;
  // cień na ziemi
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, v.y, 9, 2.5, 0, 0, 6.283);
  ctx.fill();
  // oddech: lekkie rozciąganie w pionie
  const oddech = 1 + Math.sin(time * 3 + cx * 0.1) * 0.04;
  // akcesorium na plecach i tylne części czapek (wstęgi, pióropusz) są za ciałem
  if (o.akc && o.akc.tyl) o.akc.rysuj(ctx, cx, cy, facing, time);
  if (o.akc && o.akc.zaGlowa) o.akc.zaGlowa(ctx, cx, cy, facing, time);
  // ciało z połyskiem
  const g = ctx.createRadialGradient(cx - facing * 2 - 1, cy - 5, 1, cx, cy, 12);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.35, w.color);
  g.addColorStop(1, w.color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy + (1 - oddech) * 10, 8, 10 * oddech, 0, 0, 6.283);
  ctx.fill();
  ctx.strokeStyle = o.ja ? '#fff6cf' : 'rgba(0,0,0,0.55)';
  ctx.lineWidth = o.ja ? 2 : 1.5;
  ctx.stroke();
  // brzuszek
  ctx.fillStyle = 'rgba(255,240,210,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx + facing * 2.5, cy + 3, 4, 5, 0, 0, 6.283);
  ctx.fill();

  // oczy: aktywny patrzy tam, gdzie celuje
  const patrzX = isActive ? Math.cos(angle) : facing;
  const patrzY = isActive ? Math.sin(angle) : 0;
  const mruga = Math.sin(time * 1.3 + cx) > 0.985;
  for (const ox of [facing * 1.2, facing * 5.6]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx + ox, cy - 4, 2.7, mruga ? 0.5 : 3.1, 0, 0, 6.283);
    ctx.fill();
    if (!mruga) {
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(cx + ox + patrzX * 1.3, cy - 4 + patrzY * 1.5, 1.3, 0, 6.283);
      ctx.fill();
    }
  }
  // akcesorium na głowie (korona, czapka, hełm, wieniec)
  if (o.akc && !o.akc.tyl) o.akc.rysuj(ctx, cx, cy, facing, time);
  ctx.globalAlpha = 1;

  // broń w łapach aktywnego robala, ustawiona wzdłuż celownika
  if (isActive && o.bron) {
    const rura = o.bron === 'bazooka' || o.bron === 'salwa';
    const dl = o.bron === 'strzelba' ? 16 : rura ? 18 : o.bron === 'kij' ? 17 : o.bron === 'wiertlo' ? 15 : o.bron === 'railgun' ? 21 : 0;
    if (dl) {
      ctx.save();
      ctx.translate(cx + facing * 2, cy + 3);
      ctx.rotate(angle);
      if (o.bron === 'wiertlo') {
        ctx.fillStyle = '#6d7680';
        ctx.fillRect(-4, -3, 8, 6);
        ctx.fillStyle = '#b8c2cc';
        ctx.beginPath();
        ctx.moveTo(4, -3.5); ctx.lineTo(dl, 0); ctx.lineTo(4, 3.5);
        ctx.fill();
      } else if (o.bron === 'railgun') {
        // railgun (4.9): dwie szyny z pulsującą, błękitną energią między nimi
        const puls = 0.55 + Math.sin(time * 9) * 0.35;
        ctx.fillStyle = '#39414d';
        ctx.fillRect(-5, -3.5, 10, 7);
        ctx.fillStyle = '#9aa7b6';
        ctx.fillRect(2, -3.6, dl - 2, 2);
        ctx.fillRect(2, 1.6, dl - 2, 2);
        ctx.globalAlpha = puls;
        ctx.fillStyle = '#6fe0ff';
        ctx.fillRect(3, -1.4, dl - 4, 2.8);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(dl, 0, 1.6 + puls, 0, 6.283);
        ctx.fill();
      } else if (o.bron === 'kij') {
        // kij bejsbolowy: grubieje ku końcowi
        ctx.fillStyle = '#c8955a';
        ctx.beginPath();
        ctx.moveTo(-4, -1.5); ctx.lineTo(dl, -3.2); ctx.lineTo(dl, 3.2); ctx.lineTo(-4, 1.5);
        ctx.fill();
        ctx.fillStyle = '#6b4423';
        ctx.fillRect(-4, -1.8, 4, 3.6);
      } else {
        ctx.fillStyle = o.bron === 'salwa' ? '#7a4a2a' : rura ? '#5f6b4a' : '#4a3a2a';
        ctx.fillRect(-4, -2.5, dl, rura ? 5 : 3.5);
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(dl - 6, -3, 3, rura ? 6 : 4.5);
      }
      ctx.restore();
    }
  }

  if (isActive) {
    const ax = cx + Math.cos(angle) * 42;
    const ay = cy + Math.sin(angle) * 42;
    ctx.strokeStyle = 'rgba(255,210,120,0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.arc(ax, ay, 3, 0, 6.283);
    ctx.fill();

    // ładowanie strzału — łuk wokół robala
    if (o.moc > 0) {
      ctx.strokeStyle = o.moc > 0.85 ? '#ff2200' : '#ffb020';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, -Math.PI / 2, -Math.PI / 2 + o.moc * 6.283);
      ctx.stroke();
    }
  }

  if (o.bezNapisu) return;
  napisRobala(ctx, w, v, cx, cy, o);
}

function napisRobala(ctx, w, v, cx, cy, o) {
  // pasek zdrowia i nazwa (nad akcesorium trochę wyżej)
  const barW = 34;
  const top = cy - 26 - (o.akc && !o.akc.tyl ? o.akc.wys ?? 5 : 0);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(cx - barW / 2, top, barW, 4);
  // życie z podglądu na żywo (upadek, apteczka u gracza z turą), pasek względem życia na start
  const hp = v.hp ?? w.hp;
  const czesc = Math.min(1, hp / (o.hpMax || 100));
  ctx.fillStyle = czesc > 0.5 ? '#5ec26a' : czesc > 0.22 ? '#ffb020' : '#ff3b23';
  ctx.fillRect(cx - barW / 2, top, barW * czesc, 4);

  // nick w kolorze gracza (w drużynach — drużyny), z ciemną obwódką dla czytelności
  const nazwa = (o.ja ? '▸ ' : '') + w.name + (o.rozlaczony ? ' (brak sieci)' : '');
  ctx.font = (o.ja ? '800' : '700') + ' 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.78)';
  ctx.strokeText(nazwa, cx, top - 6);
  ctx.fillStyle = o.kolorNicku || w.color || '#ffe9c8';
  ctx.fillText(nazwa, cx, top - 6);
}

/* Podgląd robala na ekranie wejścia (wybór koloru): ten sam rysunek co w grze,
   na kawałku gruntu, z bazooką w łapach i nickiem w wybranym kolorze. */
export function rysujPodgladRobala(canvas, { kolor, nazwa, czas = 0, akc = null, mini = false }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth || 150, H = canvas.clientHeight || 110;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const niebo = ctx.createLinearGradient(0, 0, 0, H);
  niebo.addColorStop(0, '#120806');
  niebo.addColorStop(1, '#4a1404');
  ctx.fillStyle = niebo;
  ctx.fillRect(0, 0, W, H);
  // grunt: skorupa i warstwy skały jak na mapie „Góry”
  const g = H * (mini ? 0.84 : 0.8);
  ctx.fillStyle = '#704a3a';
  ctx.fillRect(0, g, W, H - g);
  ctx.fillStyle = '#d66e28';
  ctx.fillRect(0, g, W, 3);
  ctx.fillStyle = '#ffc46e';
  ctx.fillRect(0, g, W, 1.2);
  // od stóp do nicku robal ma ok. 50 px świata (mini: bez nicku, ok. 36 px) — tyle musi się zmieścić nad gruntem
  const skala = Math.max(0.5, Math.min(mini ? 3 : 2.4, (g - 4) / (mini ? 46 : 50), W / (mini ? 40 : 90)));
  ctx.save();
  ctx.translate(W * (mini ? 0.5 : 0.42), g);
  ctx.scale(skala, skala);
  const robal = { x: 0, y: 0, facing: 1, angle: -0.5 + Math.sin(czas * 1.2) * 0.12, color: kolor, hp: 100, name: nazwa || 'Ty', widok: null };
  drawWorm(ctx, robal, !mini, czas, { ja: false, bron: mini ? null : 'bazooka', moc: 0, akc: akcesorium(akc), bezNapisu: mini });
  ctx.restore();
}

/* Scena ekranu ładowania (od 4.7): wzgórza nad lawą, Twój robal (kolor
   i akcesorium) strzela z bazooki, na spadochronie leci skrzynka.
   Czysta grafika — nic z symulacji, więc wolno tu trygonometrię. */
const gwiazdyLadowania = Array.from({ length: 70 }, () => [Math.random(), Math.random() * 0.6, 0.4 + Math.random() * 1.2, Math.random() * 6]);
export function rysujSceneLadowania(canvas, { kolor, nazwa, czas = 0, akc = null }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const W = canvas.clientWidth || window.innerWidth, H = canvas.clientHeight || window.innerHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // niebo i gwiazdy
  const niebo = ctx.createLinearGradient(0, 0, 0, H);
  niebo.addColorStop(0, '#07040a');
  niebo.addColorStop(0.55, '#2a0a04');
  niebo.addColorStop(1, '#6a1a02');
  ctx.fillStyle = niebo;
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, f] of gwiazdyLadowania) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(czas * 2 + f);
    ctx.fillStyle = '#ffe9c8';
    ctx.fillRect(x * W, y * H, r, r);
  }
  ctx.globalAlpha = 1;
  // odległe góry w dwóch warstwach, powoli przesuwane (paralaksa)
  const pasmo = (baza, amp, fal, pr, kol) => {
    ctx.fillStyle = kol;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 20) {
      const u = x / W * fal + czas * pr;
      ctx.lineTo(x, H * baza - amp * H * (0.5 + 0.3 * Math.sin(u) + 0.2 * Math.sin(u * 2.7 + 1.3)));
    }
    ctx.lineTo(W, H);
    ctx.fill();
  };
  pasmo(0.62, 0.22, 5, 0.03, '#1d0a08');
  pasmo(0.72, 0.16, 8, 0.06, '#2e120b');
  // lawa na dole: falująca, z poświatą
  const lawaY = H * 0.9;
  const lg = ctx.createLinearGradient(0, lawaY - 30, 0, H);
  lg.addColorStop(0, 'rgba(255,120,20,0)');
  lg.addColorStop(0.3, '#ff5a00');
  lg.addColorStop(1, '#b21a00');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W + 16; x += 16) ctx.lineTo(x, lawaY + Math.sin(x * 0.03 + czas * 2.2) * 4);
  ctx.lineTo(W, H);
  ctx.fill();
  // wzgórze pod robalem i wyspa po prawej (cel strzału)
  // skala: na wąskim telefonie liczy się szerokość, na szerokim ekranie wysokość
  const s = Math.max(0.7, Math.min(2.2, H / 420, W / 330));
  const robX = W * 0.28, robY = H * 0.74;
  const celX = W * 0.74, celY = H * 0.7;
  const wyspa = (cx, cy, rx) => {
    const g = ctx.createLinearGradient(0, cy, 0, cy + rx * 0.9);
    g.addColorStop(0, '#7a5040');
    g.addColorStop(1, '#3a2018');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy + 4);
    ctx.quadraticCurveTo(cx - rx * 0.5, cy - 8 * s, cx, cy - 2);
    ctx.quadraticCurveTo(cx + rx * 0.5, cy - 8 * s, cx + rx, cy + 4);
    ctx.quadraticCurveTo(cx + rx * 0.4, cy + rx * 0.9, cx, cy + rx);
    ctx.quadraticCurveTo(cx - rx * 0.4, cy + rx * 0.9, cx - rx, cy + 4);
    ctx.fill();
    ctx.strokeStyle = '#ff9a3c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy + 4);
    ctx.quadraticCurveTo(cx - rx * 0.5, cy - 8 * s, cx, cy - 2);
    ctx.quadraticCurveTo(cx + rx * 0.5, cy - 8 * s, cx + rx, cy + 4);
    ctx.stroke();
  };
  wyspa(robX, robY, Math.min(120 * s, W * 0.21));
  wyspa(celX, celY, Math.min(90 * s, W * 0.17));

  // strzał co 2,6 s: pocisk po paraboli z łap robala na wyspę i wybuch
  const T = 2.6, faza = (czas % T) / T;
  const x0 = robX + 14 * s, y0 = robY - 18 * s;
  const kat = -0.62 + Math.sin(czas * 1.2) * 0.05;
  if (faza < 0.55) {
    const p = faza / 0.55;
    const px = x0 + (celX - x0) * p;
    const py = y0 + (celY - 6 - y0) * p - Math.sin(p * Math.PI) * H * 0.28;
    // smuga dymu
    for (let k = 1; k <= 6; k++) {
      const q = Math.max(0, p - k * 0.025);
      ctx.globalAlpha = 0.35 * (1 - k / 7);
      ctx.fillStyle = '#c9b8a8';
      ctx.beginPath();
      ctx.arc(x0 + (celX - x0) * q, y0 + (celY - 6 - y0) * q - Math.sin(q * Math.PI) * H * 0.28, (3 + k) * s * 0.7, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#5f6b4a';
    ctx.beginPath();
    ctx.arc(px, py, 4 * s, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = '#ffcf5a';
    ctx.beginPath();
    ctx.arc(px, py, 2 * s, 0, 6.283);
    ctx.fill();
  } else {
    const p = (faza - 0.55) / 0.45;
    const r = (20 + 60 * p) * s;
    ctx.globalAlpha = 1 - p;
    const wg = ctx.createRadialGradient(celX, celY - 6, 1, celX, celY - 6, r);
    wg.addColorStop(0, '#fff6cf');
    wg.addColorStop(0.35, '#ffb020');
    wg.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.arc(celX, celY - 6, r, 0, 6.283);
    ctx.fill();
    // odłamki
    ctx.fillStyle = '#ffd27a';
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * 6.283 + 0.3;
      ctx.fillRect(celX + Math.cos(a) * r * 0.9, celY - 6 + Math.sin(a) * r * 0.6 - p * 20 * s, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  // skrzynka na spadochronie dryfuje nad sceną
  const sx = W * (0.86 + 0.05 * Math.sin(czas * 0.7)), sy = H * 0.46 + ((czas * 18) % (H * 0.26));
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.sin(czas * 1.6) * 0.12);
  ctx.fillStyle = '#e8e1d0';
  ctx.beginPath();
  ctx.arc(0, -26 * s, 18 * s, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,225,208,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-18 * s, -26 * s); ctx.lineTo(-6 * s, -6 * s);
  ctx.moveTo(18 * s, -26 * s); ctx.lineTo(6 * s, -6 * s);
  ctx.stroke();
  ctx.fillStyle = '#b07a3a';
  ctx.fillRect(-8 * s, -8 * s, 16 * s, 14 * s);
  ctx.fillStyle = '#e8453c';
  ctx.fillRect(-2 * s, -6 * s, 4 * s, 10 * s);
  ctx.fillRect(-6 * s, -3 * s, 12 * s, 4 * s);
  ctx.restore();

  // robal z bazooką — ten sam rysunek co w grze, w dużej skali
  const skala = 1.7 * s;
  ctx.save();
  ctx.translate(robX, robY - 2);
  ctx.scale(skala, skala);
  const odrzut = faza < 0.06 ? -2 * (1 - faza / 0.06) : 0;
  const robal = { x: odrzut, y: 0, facing: 1, angle: kat, color: kolor, hp: 100, name: nazwa || 'Ty', widok: null };
  drawWorm(ctx, robal, true, czas, { ja: false, bron: 'bazooka', moc: 0, akc: akcesorium(akc) });
  ctx.restore();

  // unoszący się popiół
  ctx.fillStyle = 'rgba(255,170,90,0.55)';
  for (let k = 0; k < 24; k++) {
    const x = (k * 97.3 + czas * (8 + k % 5) * 3) % W;
    const y = H - ((k * 53.1 + czas * (14 + k % 7) * 3) % H);
    ctx.fillRect(x, y, 2, 2);
  }
}
