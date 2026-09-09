/* Efekty wizualne: ogień, dym, iskry.

   UWAGA: ten plik używa Math.random() do woli i to jest w porządku —
   cząsteczki są wyłącznie ozdobą i NIGDY nie wracają do symulacji.
   Losowość, która wpływa na rozgrywkę, siedzi w rng.js i tylko tam. */

const SPRITE = 48;
const PALETTE = ['#fff6cf', '#ffd93b', '#ffa000', '#ff6a00', '#ff2e00', '#8a0500'];
const SMOKE = ['#6b6560', '#4a4542', '#332f2d', '#211f1e'];

function makeSprites(colors) {
  const base = document.createElement('canvas');
  base.width = base.height = SPRITE;
  const b = base.getContext('2d');
  const h = SPRITE / 2;
  const g = b.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  b.fillStyle = g;
  b.fillRect(0, 0, SPRITE, SPRITE);

  return colors.map((c) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = SPRITE;
    const x = cv.getContext('2d');
    x.drawImage(base, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = c;
    x.fillRect(0, 0, SPRITE, SPRITE);
    return cv;
  });
}

export function createFx() {
  return {
    parts: [],
    free: [],
    fire: makeSprites(PALETTE),
    smoke: makeSprites(SMOKE),
    shocks: []
  };
}

const MAX = 1400;

function emit(fx, cfg) {
  let p = fx.free.pop();
  if (!p) {
    if (fx.parts.length >= MAX) return;
    p = {};
    fx.parts.push(p);
  }
  Object.assign(p, cfg);
  p.maxLife = cfg.life;
  p.dead = false;
}

export function emitExplosion(fx, x, y, r) {
  fx.shocks.push({ x, y, r: r * 0.3, max: r * 2.1, life: 0.45, maxLife: 0.45 });

  const n = Math.round(28 + r * 0.9);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283;
    const s = (0.25 + Math.random() * 0.95) * r * 7;
    emit(fx, {
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - r * 0.6,
      grav: 260, drag: 1.5, size: 6 + Math.random() * r * 0.42,
      life: 0.35 + Math.random() * 0.75, tint: 0, cool: 6, alpha: 1, set: 'fire'
    });
  }
  for (let i = 0; i < Math.round(r * 0.4); i++) {
    const a = Math.random() * 6.283;
    emit(fx, {
      x: x + Math.cos(a) * r * 0.5, y: y + Math.sin(a) * r * 0.5,
      vx: Math.cos(a) * 30, vy: -30 - Math.random() * 60,
      grav: -18, drag: 0.7, size: r * 0.5 + Math.random() * r * 0.5,
      life: 0.9 + Math.random() * 1.4, tint: 0, cool: 3, alpha: 0.4, set: 'smoke'
    });
  }
}

export function emitTrail(fx, x, y) {
  emit(fx, {
    x, y, vx: (Math.random() - 0.5) * 24, vy: -12 - Math.random() * 26,
    grav: -30, drag: 1, size: 4 + Math.random() * 7,
    life: 0.25 + Math.random() * 0.4, tint: 0, cool: 5, alpha: 0.8, set: 'fire'
  });
}

export function emitSpark(fx, x, y, count = 10) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * 6.283;
    const s = 40 + Math.random() * 150;
    emit(fx, {
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
      grav: 300, drag: 1.2, size: 2 + Math.random() * 4,
      life: 0.2 + Math.random() * 0.4, tint: 0, cool: 6, alpha: 1, set: 'fire'
    });
  }
}

export function stepFx(fx, dt) {
  for (const p of fx.parts) {
    if (p.dead) continue;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; fx.free.push(p); continue; }
    p.vy += p.grav * dt;
    const d = Math.max(0, 1 - p.drag * dt);
    p.vx *= d; p.vy *= d;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = fx.shocks.length - 1; i >= 0; i--) {
    const s = fx.shocks[i];
    s.life -= dt;
    if (s.life <= 0) fx.shocks.splice(i, 1);
  }
}

export function drawFx(fx, ctx) {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of fx.parts) {
    if (p.dead) continue;
    const t = p.life / p.maxLife;
    const fade = Math.min(1, (1 - t) * 8);
    const a = p.alpha * t * fade;
    if (a <= 0.01) continue;
    const size = p.size * (0.5 + Math.sqrt(t) * 0.7);
    const sprites = p.set === 'smoke' ? fx.smoke : fx.fire;
    const idx = Math.min(sprites.length - 1, p.tint + Math.floor((1 - t) * p.cool));
    ctx.globalAlpha = a;
    ctx.drawImage(sprites[idx], p.x - size / 2, p.y - size / 2, size, size);
  }

  for (const s of fx.shocks) {
    const t = 1 - s.life / s.maxLife;
    const r = s.r + (s.max - s.r) * t;
    ctx.globalAlpha = (1 - t) * 0.5;
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = Math.max(1, 7 * (1 - t));
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, 6.283);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
