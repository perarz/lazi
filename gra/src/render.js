/* Rysowanie świata. Czyta maskę terenu i stan symulacji, sam niczego
   w nich nie zmienia.

   Teren malujemy raz do offscreen canvasu; po wybuchu przemalowujemy
   tylko kolumny objęte kraterem, a nie całe 2 MB. */

import { WORLD_W, WORLD_H } from './terrain.js';
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
    time: 0
  };
}

/* Kolor zależy od tego, ile solidnych pikseli jest bezpośrednio nad danym —
   czyli od głębokości pod powierzchnią. Liczone jednym przejściem w dół
   kolumny, więc całe 2 MB idzie w ~2 mln operacji zamiast w dziesiątki. */
function paintColumns(r, terrain, x0, x1) {
  x0 = Math.max(0, Math.floor(x0));
  x1 = Math.min(WORLD_W - 1, Math.ceil(x1));
  const w = x1 - x0 + 1;
  if (w <= 0) return;

  const img = r.tctx.createImageData(w, WORLD_H);
  const d = img.data;
  const mask = terrain.mask;

  for (let x = x0; x <= x1; x++) {
    let depth = 9999;
    const col = x - x0;
    for (let y = 0; y < WORLD_H; y++) {
      const solid = mask[y * WORLD_W + x];
      depth = solid ? depth + 1 : 0;
      const o = (y * w + col) * 4;

      if (!solid) { d[o + 3] = 0; continue; }

      // deterministyczne, tanie ziarno — tylko dla urozmaicenia faktury
      let h = (x * 374761393 + y * 668265263) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h = h ^ (h >>> 16);
      const n = h & 15;                  // drobna faktura skały
      const zylka = (h & 1023) === 0;    // rzadka żyłka magmy w głębi
      let rr, gg, bb;

      if (depth <= 2) {            // rozżarzona skorupa na świeżej krawędzi
        rr = 255; gg = 190 + (n & 7) * 4; bb = 90;
      } else if (depth <= 5) {
        rr = 236; gg = 118; bb = 26;
      } else if (depth <= 11) {
        rr = 150; gg = 62; bb = 20;
      } else if (depth <= 34) {
        rr = 88 + n; gg = 47 + (n >> 1); bb = 32;
      } else {
        rr = 46 + n; gg = 30; bb = 26;
        if (zylka) { rr = 168; gg = 62; bb = 22; }
      }
      d[o] = rr; d[o + 1] = gg; d[o + 2] = bb; d[o + 3] = 255;
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

  const halfW = viewW / (2 * cam.zoom);
  const halfH = viewH / (2 * cam.zoom);
  const minX = halfW - Math.min(ZAPAS_BOK, halfW * 0.8);
  const maxX = WORLD_W - minX;
  const minY = halfH - Math.min(ZAPAS_NIEBO, halfH);
  const maxY = WORLD_H - (viewH / 2 - dol) / cam.zoom;
  if (halfW * 2 < WORLD_W) {
    cam.x = Math.max(minX, Math.min(maxX, cam.x));
    cam.tx = Math.max(minX, Math.min(maxX, cam.tx));
  } else {
    cam.x = WORLD_W / 2;
  }
  if (halfH * 2 < WORLD_H) {
    cam.y = Math.min(maxY, Math.max(minY, cam.y));
    cam.ty = Math.min(maxY, Math.max(minY, cam.ty));
  } else {
    cam.y = Math.max(WORLD_H / 2, maxY);
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
  sky.addColorStop(0, '#0a0a0a');
  sky.addColorStop(0.55, '#1d0703');
  sky.addColorStop(1, '#511403');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  ctx.drawImage(r.terrainCanvas, 0, 0);
  drawLava(ctx, r.time, state.lava);

  if (opcje.celNalotu) drawCel(ctx, opcje.celNalotu, r.time);

  const akt = activeOf(state);
  for (const p of state.projectiles) drawProjectile(ctx, p);
  for (const w of state.worms) {
    if (!w.alive) continue;
    drawWorm(ctx, w, w === akt && state.phase === 'aim', r.time, {
      ja: w.id === opcje.mojeId,
      rozlaczony: !!opcje.rozlaczeni && opcje.rozlaczeni.has(w.id),
      moc: w === akt && state.phase === 'aim' ? (w.widok ? w.widok.moc : state.charging ? state.power : 0) : 0
    });
  }

  if (fx) drawFx(fx, ctx);
  ctx.restore();
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

function drawProjectile(ctx, p) {
  const weapon = WEAPONS[p.weapon];
  ctx.save();
  ctx.translate(p.x, p.y);

  if (weapon.kind === 'pocisk') {
    ctx.rotate(Math.atan2(p.vy, p.vx));
    if (weapon.id === 'odlamek') {
      ctx.fillStyle = '#2d2a26';
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, 6.283);
      ctx.fill();
    } else {
      const dl = weapon.id === 'rakieta' ? 14 : 18;
      ctx.fillStyle = weapon.id === 'rakieta' ? '#c9c2b6' : '#e8e2d8';
      ctx.fillRect(-dl / 2, -3, dl, 6);
      ctx.fillStyle = '#ff3b00';
      ctx.beginPath();
      ctx.moveTo(dl / 2, 0); ctx.lineTo(dl / 2 - 6, -4); ctx.lineTo(dl / 2 - 6, 4);
      ctx.fill();
    }
  } else {
    const dynamit = weapon.id === 'dynamit';
    ctx.fillStyle = dynamit ? '#c62b1a' : weapon.id === 'kasetowa' ? '#5b4a8a' : '#3f4a35';
    ctx.beginPath();
    ctx.arc(0, 0, dynamit ? 8 : 6, 0, 6.283);
    ctx.fill();
    if (weapon.id === 'kasetowa') {
      ctx.strokeStyle = '#ffd93b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, 6.283);
      ctx.stroke();
    }
    // lont miga tym szybciej, im bliżej wybuchu
    if (p.fuse !== null) {
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
  ctx.fillStyle = w.color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 8, 10, 0, 0, 6.283);
  ctx.fill();
  ctx.strokeStyle = o.ja ? '#fff6cf' : 'rgba(0,0,0,0.55)';
  ctx.lineWidth = o.ja ? 2 : 1.5;
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx + facing * 3, cy - 3, 2.6, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(cx + facing * 3.8, cy - 3, 1.3, 0, 6.283);
  ctx.fill();
  ctx.globalAlpha = 1;

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

  const nazwa = w.name + (o.rozlaczony ? ' (brak sieci)' : '');
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText(nazwa, cx, top - 5);
  ctx.fillStyle = o.ja ? '#fff6cf' : '#ffe9c8';
  ctx.fillText(nazwa, cx, top - 6);
}
