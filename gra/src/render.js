/* Rysowanie świata. Czyta maskę terenu i stan symulacji, sam niczego
   w nich nie zmienia.

   Teren malujemy raz do offscreen canvasu; po wybuchu przemalowujemy
   tylko kolumny objęte kraterem, a nie całe 2 MB. */

import { WORLD_W, WORLD_H, LAVA_Y as T_LAVA } from './terrain.js';
import { WEAPONS } from './weapons.js';
import { WORM_H } from './sim.js';
import { drawFx } from './fx.js';

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
  x1 = Math.min(WORLD_W - 1, Math.ceil(x1));
  const w = x1 - x0 + 1;
  if (w <= 0) return;

  const img = r.tctx.createImageData(w, WORLD_H);
  const d = img.data;
  const mask = terrain.mask;
  const pal = PALETY[terrain.styl] || PALETY.gory;

  for (let x = x0; x <= x1; x++) {
    let depth = 9999;
    const col = x - x0;
    // falowanie warstw skalnych — tylko wygląd, więc wolno użyć sinusa
    const fala = Math.sin(x * 0.011) * 14 + Math.sin(x * 0.037 + 1.3) * 6;
    for (let y = 0; y < WORLD_H; y++) {
      const i = y * WORLD_W + x;
      const solid = mask[i];
      depth = solid ? depth + 1 : 0;
      const o = (y * w + col) * 4;

      if (!solid) { d[o + 3] = 0; continue; }
      if (solid === 2) {
        // most: stalowa belka z nitami co 10 px
        // dźwigar: ciemne pasy góra/dół i kratownica (ukośne żebra) w środku
        const brzeg = depth <= 1 || (y + 1 < WORLD_H && mask[i + WORLD_W] !== 2);
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
      if (depth > 2 && ((x > 0 && !mask[i - 1]) || (x < WORLD_W - 1 && !mask[i + 1]))) {
        rr += 55; gg += 30; bb += 10;
      } else if (depth > 2 && y + 1 < WORLD_H && !mask[i + WORLD_W]) {
        // sufit komory: przyciemniony, z lekkim żarem od dołu
        rr = rr * 0.7 + 30; gg *= 0.6; bb *= 0.6;
      }
      d[o] = rr > 255 ? 255 : rr; d[o + 1] = gg > 255 ? 255 : gg; d[o + 2] = bb > 255 ? 255 : bb; d[o + 3] = 255;
    }
  }
  r.tctx.putImageData(img, x0, 0);
}

export function buildTerrain(r, terrain) {
  r.tctx.clearRect(0, 0, WORLD_W, WORLD_H);
  paintColumns(r, terrain, 0, WORLD_W - 1);
}

export function repaintRect(r, terrain, rect) {
  const x0 = Math.max(0, Math.floor(rect.x0) - 2);
  const x1 = Math.min(WORLD_W - 1, Math.ceil(rect.x1) + 2);
  r.tctx.clearRect(x0, 0, x1 - x0 + 1, WORLD_H);
  paintColumns(r, terrain, x0, x1);
}

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
  const k = Math.min(1, dt * 4.2);
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
  const maxX = WORLD_W - halfW + zapasX;
  if (minX <= maxX) {
    cam.x = Math.max(minX, Math.min(maxX, cam.x));
    cam.tx = Math.max(minX, Math.min(maxX, cam.tx));
  } else {
    cam.x = cam.tx = WORLD_W / 2;
  }
  const minY = halfH - Math.min(ZAPAS_NIEBO, halfH);
  const maxY = WORLD_H - (viewH / 2 - dol) / cam.zoom;
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
  for (const c of state.skrzynki || []) drawSkrzynka(ctx, r, c);
  for (const p of state.projectiles) drawProjectile(ctx, p);
  for (const w of state.worms) {
    if (!w.alive) continue;
    drawWorm(ctx, w, w === akt && state.phase === 'aim', r.time, {
      ja: w.id === opcje.mojeId,
      rozlaczony: !!opcje.rozlaczeni && opcje.rozlaczeni.has(w.id),
      moc: w === akt && state.phase === 'aim' ? (w.widok ? w.widok.moc : state.charging ? state.power : 0) : 0,
      bron: w === akt ? (w.widok ? w.widok.bron : state.weapon) : null
    });
  }

  if (fx) drawFx(fx, ctx);
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
  const horyzont = H * 0.62 + (T_LAVA - cam.y) * cam.zoom * 0.12;
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
  const g = ctx.createLinearGradient(0, poziom - 20, 0, WORLD_H);
  g.addColorStop(0, 'rgba(255,150,30,0.85)');
  g.addColorStop(0.18, '#ff5a00');
  g.addColorStop(1, '#8a0f00');
  ctx.fillStyle = g;
  // lawa sięga daleko za mapę — kamera potrafi tam zajrzeć
  ctx.fillRect(-1400, poziom, WORLD_W + 2800, WORLD_H - poziom + 1400);

  // falująca, świecąca powierzchnia
  ctx.strokeStyle = 'rgba(255,220,120,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = -1400; x <= WORLD_W + 1400; x += 16) {
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
    ctx.fillRect(cel.x - 45, cel.y, 90, 7);
    ctx.strokeRect(cel.x - 45, cel.y, 90, 7);
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
  ctx.save();
  ctx.translate(c.x + Math.sin(r.time * 3 + c.id) * (1 - f) * 10, c.y - spad);
  if (f < 1) {
    // spadochron
    ctx.strokeStyle = 'rgba(255,240,220,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -14); ctx.lineTo(-16, -36);
    ctx.moveTo(8, -14); ctx.lineTo(16, -36);
    ctx.stroke();
    ctx.fillStyle = c.typ === 'apteczka' ? '#f4f1ea' : '#e0a93a';
    ctx.beginPath();
    ctx.arc(0, -34, 19, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = c.typ === 'apteczka' ? '#d8261c' : '#8a5a1a';
    ctx.fillRect(-4, -52, 8, 18);
  }
  const bujanie = f >= 1 ? Math.sin(r.time * 2.4 + c.id) * 1.2 : 0;
  ctx.translate(0, bujanie);
  if (c.typ === 'apteczka') {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(-9, -16, 18, 16);
    ctx.fillStyle = '#d8261c';
    ctx.fillRect(-2.5, -13, 5, 10);
    ctx.fillRect(-6, -10.5, 12, 5);
  } else {
    ctx.fillStyle = '#9a6a2e';
    ctx.fillRect(-10, -16, 20, 16);
    ctx.strokeStyle = '#5a3a14';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-9.5, -15.5, 19, 15);
    ctx.beginPath();
    ctx.moveTo(-9, -15); ctx.lineTo(9, -1);
    ctx.moveTo(9, -15); ctx.lineTo(-9, -1);
    ctx.stroke();
    if (f >= 1) {
      ctx.fillStyle = '#ffd23b';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AMMO', 0, -19);
    }
  }
  ctx.restore();
}

function drawProjectile(ctx, p) {
  const weapon = WEAPONS[p.weapon];
  ctx.save();
  ctx.translate(p.x, p.y);

  if (weapon.kind === 'owca') {
    // owca: wełna z kilku kółek, czarny łepek w stronę biegu, przebierające nóżki
    const kier = p.vx >= 0 ? 1 : -1;
    const t = performance.now() / 1000;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    for (const [lx, faza] of [[-5, 0], [-1, 1.6], [3, 3.1], [6, 4.7]]) {
      const kr = Math.sin(t * 16 + faza) * 2;
      ctx.beginPath();
      ctx.moveTo(lx * kier, -5);
      ctx.lineTo(lx * kier + kr, 0);
      ctx.stroke();
    }
    ctx.fillStyle = '#f4f1ea';
    for (const [bx, by, br] of [[-6, -9, 5], [-1, -11, 5.5], [4, -9, 5], [-3, -6, 5], [3, -6, 4.5]]) {
      ctx.beginPath();
      ctx.arc(bx * kier, by, br, 0, 6.283);
      ctx.fill();
    }
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(10 * kier, -10, 4.2, 3.4, 0, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(10 * kier + kier * 1.2 - 0.8, -11.5, 1.6, 1.6);
    if (p.fuse !== null) {
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.fuse < 1.5 ? '#ff3b23' : '#fff1c2';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      const napis = Math.ceil(p.fuse).toString();
      ctx.strokeText(napis, 0, -22);
      ctx.fillText(napis, 0, -22);
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

function drawWorm(ctx, w, isActive, time, o) {
  // Cudzy robal w trakcie tury: pozycja i celownik z podglądu na żywo.
  const v = w.widok || w;
  const cx = v.x;
  const cy = v.y - WORM_H / 2;
  const facing = v.facing ?? w.facing;
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
  // ogonek z dwóch segmentów za plecami
  ctx.fillStyle = w.color;
  ctx.beginPath();
  ctx.ellipse(cx - facing * 8, v.y - 3.5, 4.6, 3.5, 0, 0, 6.283);
  ctx.ellipse(cx - facing * 12.5, v.y - 2.2, 3, 2.2, 0, 0, 6.283);
  ctx.fill();
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
  ctx.globalAlpha = 1;

  // broń w łapach aktywnego robala, ustawiona wzdłuż celownika
  if (isActive && o.bron) {
    const rura = o.bron === 'bazooka' || o.bron === 'salwa';
    const dl = o.bron === 'strzelba' ? 16 : rura ? 18 : o.bron === 'kij' ? 17 : o.bron === 'wiertlo' ? 15 : 0;
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

  // pasek zdrowia i nazwa
  const barW = 34;
  const top = cy - 26;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(cx - barW / 2, top, barW, 4);
  ctx.fillStyle = w.hp > 50 ? '#5ec26a' : w.hp > 22 ? '#ffb020' : '#ff3b23';
  ctx.fillRect(cx - barW / 2, top, (barW * w.hp) / 100, 4);

  // nick w kolorze gracza (wybranym przy wejściu), z ciemną obwódką dla czytelności
  const nazwa = (o.ja ? '▸ ' : '') + w.name + (o.rozlaczony ? ' (brak sieci)' : '');
  ctx.font = (o.ja ? '800' : '700') + ' 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.78)';
  ctx.strokeText(nazwa, cx, top - 6);
  ctx.fillStyle = w.color || '#ffe9c8';
  ctx.fillText(nazwa, cx, top - 6);
}

/* Podgląd robala na ekranie wejścia (wybór koloru): ten sam rysunek co w grze,
   na kawałku gruntu, z bazooką w łapach i nickiem w wybranym kolorze. */
export function rysujPodgladRobala(canvas, { kolor, nazwa, czas = 0 }) {
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
  const g = H * 0.8;
  ctx.fillStyle = '#704a3a';
  ctx.fillRect(0, g, W, H - g);
  ctx.fillStyle = '#d66e28';
  ctx.fillRect(0, g, W, 3);
  ctx.fillStyle = '#ffc46e';
  ctx.fillRect(0, g, W, 1.2);
  // od stóp do nicku robal ma ok. 50 px świata — tyle musi się zmieścić nad gruntem
  const skala = Math.max(0.5, Math.min(2.4, (g - 4) / 50, W / 90));
  ctx.save();
  ctx.translate(W * 0.42, g);
  ctx.scale(skala, skala);
  const robal = { x: 0, y: 0, facing: 1, angle: -0.5 + Math.sin(czas * 1.2) * 0.12, color: kolor, hp: 100, name: nazwa || 'Ty', widok: null };
  drawWorm(ctx, robal, true, czas, { ja: false, bron: 'bazooka', moc: 0 });
  ctx.restore();
}
