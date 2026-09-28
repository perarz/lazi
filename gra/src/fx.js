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
    shocks: [],
    teksty: [],     // unoszące się napisy: obrażenia, komunikaty nad robalami
    smugi: [],      // ślad strzału ze strzelby
    lasery: [],     // promień railguna (4.9)
    gruz: [],       // odłamki skały z wybuchu (4.11): rysowane zwykle, nie „świecąco”
    blyski: []      // błysk wybuchu (4.11)
  };
}

/* Napis unoszący się nad punktem (np. „-24” po trafieniu). */
export function emitTekst(fx, x, y, tekst, kolor = '#ffe9c8', rozmiar = 15) {
  if (fx.teksty.length > 40) fx.teksty.shift();
  fx.teksty.push({ x, y, tekst, kolor, rozmiar, life: 1.4, maxLife: 1.4 });
}

export function emitSmuga(fx, x0, y0, x1, y1) {
  fx.smugi.push({ x0, y0, x1, y1, life: 0.35, maxLife: 0.35 });
}

/* Railgun: gruby, świecący promień z helisą, gasnący przez ~0,9 s, i iskry wzdłuż. */
export function emitLaser(fx, x0, y0, x1, y1) {
  fx.lasery.push({ x0, y0, x1, y1, life: 0.9, maxLife: 0.9 });
  const dl = Math.hypot(x1 - x0, y1 - y0) || 1;
  const n = Math.min(90, Math.round(dl / 30));
  for (let i = 0; i < n; i++) {
    const k = Math.random();
    const a = Math.random() * 6.283;
    const s = 20 + Math.random() * 70;
    emit(fx, {
      x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      grav: 0, drag: 2.5, size: 3 + Math.random() * 5,
      life: 0.3 + Math.random() * 0.5, tint: 0, cool: 4, alpha: 0.9, set: 'fire'
    });
  }
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

/* Wybuch (od 4.11 mocniejszy): błysk, fala, kula ognia, odłamki skały w jej kolorach
   (`kolory` = próbki terenu sprzed wycięcia krateru) i dym, który chwilę wisi w powietrzu. */
export function emitExplosion(fx, x, y, r, kolory = null) {
  fx.shocks.push({ x, y, r: r * 0.3, max: r * 2.1, life: 0.45, maxLife: 0.45 });
  fx.blyski.push({ x, y, r: r * 2.6, life: 0.16, maxLife: 0.16 });
  if (kolory && kolory.length) {
    const n = Math.min(40, Math.round(8 + r * 0.45));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.08 + Math.random() * 0.84);        // głównie w górę
      const s = (0.35 + Math.random() * 0.8) * (150 + r * 3.5);
      if (fx.gruz.length > 260) fx.gruz.shift();
      fx.gruz.push({
        x: x + (Math.random() - 0.5) * r * 0.6, y: y + (Math.random() - 0.5) * r * 0.4,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        rot: Math.random() * 6.283, vrot: (Math.random() - 0.5) * 18,
        size: 1.5 + Math.random() * (2 + r * 0.05),
        kolor: kolory[(Math.random() * kolory.length) | 0],
        life: 0.9 + Math.random() * 0.9
      });
    }
  }
  // dym, który po dużym wybuchu wisi dłużej i powoli się rozwiewa
  for (let i = 0; i < Math.round(r * 0.18); i++) {
    emit(fx, {
      x: x + (Math.random() - 0.5) * r, y: y - Math.random() * r * 0.5,
      vx: (Math.random() - 0.5) * 20, vy: -12 - Math.random() * 18,
      grav: -6, drag: 0.4, size: r * 0.7 + Math.random() * r * 0.6,
      life: 2 + Math.random() * 1.6, tint: 1, cool: 2, alpha: 0.22, set: 'smoke'
    });
  }

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

/* Płonąca ropa (4.10): iskra lecąca w górę, a co jakiś czas kłąb dymu. */
export function emitPlomien(fx, x, y, naZiemi) {
  emit(fx, {
    x: x + (Math.random() - 0.5) * 6, y, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 40,
    grav: -40, drag: 1.2, size: 3 + Math.random() * 5,
    life: 0.25 + Math.random() * 0.35, tint: 1, cool: 4, alpha: 0.85, set: 'fire'
  });
  if (naZiemi && Math.random() < 0.35) {
    emit(fx, {
      x: x + (Math.random() - 0.5) * 4, y: y - 8, vx: (Math.random() - 0.5) * 10, vy: -18 - Math.random() * 20,
      grav: -12, drag: 0.6, size: 7 + Math.random() * 9,
      life: 0.9 + Math.random() * 1.1, tint: 0, cool: 3, alpha: 0.28, set: 'smoke'
    });
  }
}

/* Smużka dymu za granatem (4.11) — cienka, szara, bez ognia. */
export function emitDymek(fx, x, y) {
  emit(fx, {
    x, y, vx: (Math.random() - 0.5) * 10, vy: -8 - Math.random() * 10,
    grav: -10, drag: 1, size: 3 + Math.random() * 4,
    life: 0.35 + Math.random() * 0.35, tint: 0, cool: 3, alpha: 0.35, set: 'smoke'
  });
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
  for (let i = fx.teksty.length - 1; i >= 0; i--) {
    const t = fx.teksty[i];
    t.life -= dt;
    t.y -= 26 * dt;
    if (t.life <= 0) fx.teksty.splice(i, 1);
  }
  for (let i = fx.smugi.length - 1; i >= 0; i--) {
    const s = fx.smugi[i];
    s.life -= dt;
    if (s.life <= 0) fx.smugi.splice(i, 1);
  }
  for (let i = fx.lasery.length - 1; i >= 0; i--) {
    const s = fx.lasery[i];
    s.life -= dt;
    if (s.life <= 0) fx.lasery.splice(i, 1);
  }
  for (let i = fx.blyski.length - 1; i >= 0; i--) {
    fx.blyski[i].life -= dt;
    if (fx.blyski[i].life <= 0) fx.blyski.splice(i, 1);
  }
  for (let i = fx.gruz.length - 1; i >= 0; i--) {
    const g = fx.gruz[i];
    g.life -= dt;
    if (g.life <= 0) { fx.gruz.splice(i, 1); continue; }
    g.vy += 560 * dt;
    g.vx *= 1 - 0.4 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.rot += g.vrot * dt;
  }
}

export function drawFx(fx, ctx) {
  // odłamki skały: zwykłe kolory (nie świecą), z ciemną krawędzią
  for (const g of fx.gruz) {
    ctx.globalAlpha = Math.min(1, g.life * 2.5);
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rot);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-g.size / 2 - 0.6, -g.size / 2 - 0.6, g.size + 1.2, g.size * 0.8 + 1.2);
    ctx.fillStyle = g.kolor;
    ctx.fillRect(-g.size / 2, -g.size / 2, g.size, g.size * 0.8);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  for (const b of fx.blyski) {
    const t = b.life / b.maxLife;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, 'rgba(255, 250, 220, ' + (0.9 * t).toFixed(3) + ')');
    g.addColorStop(0.35, 'rgba(255, 190, 90, ' + (0.45 * t).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }
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

  for (const s of fx.smugi) {
    const t = s.life / s.maxLife;
    ctx.globalAlpha = t;
    ctx.strokeStyle = '#fff1c2';
    ctx.lineWidth = 1 + 2 * t;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
    ctx.stroke();
  }

  for (const s of fx.lasery) {
    const t = s.life / s.maxLife;
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
    const dl = Math.hypot(dx, dy) || 1;
    const nx = -dy / dl, ny = dx / dl;
    // poświata, rdzeń i biały środek
    for (const [kolor, gr, al] of [['#2fb8ff', 22, 0.35], ['#7fe3ff', 9, 0.8], ['#ffffff', 3, 1]]) {
      ctx.globalAlpha = al * t;
      ctx.strokeStyle = kolor;
      ctx.lineWidth = gr * (0.4 + t * 0.6);
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    }
    // helisa wokół promienia
    ctx.globalAlpha = 0.7 * t;
    ctx.strokeStyle = '#b48cff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const kroki = Math.min(600, Math.round(dl / 6));
    const faza = (1 - t) * 20;
    for (let i = 0; i <= kroki; i++) {
      const k = i / kroki;
      const o = Math.sin(k * dl / 14 + faza) * 7 * (0.5 + t * 0.5);
      const px = s.x0 + dx * k + nx * o, py = s.y0 + dy * k + ny * o;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  for (const t of fx.teksty) {
    const a = Math.min(1, t.life / t.maxLife * 2.5);
    // 4.11: napis wyskakuje (większy na starcie, sprężyście wraca do rozmiaru)
    const wiek = t.maxLife - t.life;
    const skok = wiek < 0.22 ? 1 + 0.55 * Math.sin((wiek / 0.22) * Math.PI) * (1 - wiek / 0.22) + (1 - wiek / 0.22) * 0.25 : 1;
    ctx.globalAlpha = a;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(skok, skok);
    ctx.font = '700 ' + t.rozmiar + 'px "Russo One", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(t.tekst, 0, 0);
    ctx.fillStyle = t.kolor;
    ctx.fillText(t.tekst, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
