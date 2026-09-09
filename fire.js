/* ============================================================
   ŁAZI TO GOAT — cząsteczki ognia
   - żar unoszący się z dołu ekranu
   - ognisty ślad za kursorem
   - wybuch iskier po kliknięciu
   - dodatkowy płomień spod napisu GOAT przy najechaniu
   ============================================================ */

(function () {
  'use strict';

  var canvas = document.getElementById('fx');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var body = document.body;
  var heat = document.querySelector('.heat');
  var container = document.querySelector('.container');
  var goat = document.querySelector('.goat-wrap');

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------
     Rozmiar płótna
     --------------------------------------------------------- */

  var W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    goatRect = null;
  }

  /* ---------------------------------------------------------
     Sprite'y żaru (gotowe, pokolorowane — dużo szybsze
     niż tworzenie gradientu dla każdej cząsteczki)
     --------------------------------------------------------- */

  var SPRITE_SIZE = 48;
  var PALETTE = ['#fff6cf', '#ffd93b', '#ffa000', '#ff6a00', '#ff2e00', '#8a0500'];
  var SPRITES = (function () {
    var base = document.createElement('canvas');
    base.width = base.height = SPRITE_SIZE;
    var b = base.getContext('2d');
    var half = SPRITE_SIZE / 2;
    var g = b.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.28, 'rgba(255,255,255,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    b.fillStyle = g;
    b.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    return PALETTE.map(function (color) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = SPRITE_SIZE;
      var c = cv.getContext('2d');
      c.drawImage(base, 0, 0);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = color;
      c.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      return cv;
    });
  }());

  /* ---------------------------------------------------------
     Cząsteczki (prosta pula obiektów)
     --------------------------------------------------------- */

  var MAX_PARTICLES = 900;
  var particles = [];
  var recycled = [];

  function emit(x, y, vx, vy, cfg) {
    var p = recycled.pop();
    if (!p) {
      if (particles.length >= MAX_PARTICLES) return;
      p = {};
      particles.push(p);
    }
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.buoyancy = cfg.buoyancy;   // px/s² (ujemna = unosi się)
    p.drag = cfg.drag;           // opór na sekundę
    p.sway = cfg.sway;           // boczne wahanie
    p.size = cfg.size;
    p.life = cfg.life;
    p.maxLife = cfg.life;
    p.tint = cfg.tint;           // startowy indeks w palecie
    p.cool = cfg.cool;           // jak szybko stygnie (przesuw palety)
    p.alpha = cfg.alpha;
    p.seed = Math.random() * 6.283;
    p.dead = false;
  }

  function emitEmber() {
    emit(
      Math.random() * W,
      H + 12,
      (Math.random() - 0.5) * 22,
      -(28 + Math.random() * 78),
      { buoyancy: -16, drag: 0.35, sway: 15,
        size: 4 + Math.random() * 8,
        life: 2.6 + Math.random() * 3.6,
        tint: Math.random() < 0.55 ? 2 : 3, cool: 3, alpha: 0.7 }
    );
  }

  function emitTrail(x, y, speed) {
    var n = Math.min(6, 1 + speed * 0.05);
    for (var i = 0; i < n; i++) {
      emit(
        x + (Math.random() - 0.5) * 16,
        y + (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 70,
        -(15 + Math.random() * 95),
        { buoyancy: -55, drag: 0.9, sway: 28,
          size: 4 + Math.random() * 11,
          life: 0.5 + Math.random() * 1.1,
          tint: 0, cool: 6, alpha: 0.75 }
      );
    }
  }

  function emitBurst(x, y) {
    /* błysk w miejscu kliknięcia */
    emit(x, y, 0, -20,
      { buoyancy: -10, drag: 3, sway: 0,
        size: 250, life: 0.3, tint: 1, cool: 4, alpha: 0.85 });

    /* iskry rozlatujące się na boki */
    for (var i = 0; i < 70; i++) {
      var a = Math.random() * 6.283;
      var s = 160 + Math.random() * 560;
      emit(
        x, y,
        Math.cos(a) * s,
        Math.sin(a) * s - 90,
        { buoyancy: 230, drag: 0.85, sway: 6,
          size: 4 + Math.random() * 9,
          life: 0.55 + Math.random() * 1.2,
          tint: 0, cool: 6, alpha: 1 }
      );
    }

    /* leniwe języki ognia w górę */
    for (var j = 0; j < 18; j++) {
      emit(
        x + (Math.random() - 0.5) * 60, y,
        (Math.random() - 0.5) * 40,
        -(120 + Math.random() * 220),
        { buoyancy: -70, drag: 0.8, sway: 30,
          size: 10 + Math.random() * 22,
          life: 0.6 + Math.random() * 1.0,
          tint: 0, cool: 5, alpha: 0.55 }
      );
    }
  }

  var goatRect = null;

  function emitFromGoat() {
    if (!goat) return;
    if (!goatRect) goatRect = goat.getBoundingClientRect();
    var r = goatRect;
    emit(
      r.left + Math.random() * r.width,
      r.bottom - Math.random() * r.height * 0.35,
      (Math.random() - 0.5) * 50,
      -(60 + Math.random() * 150),
      { buoyancy: -80, drag: 0.7, sway: 34,
        size: 5 + Math.random() * 13,
        life: 0.7 + Math.random() * 1.3,
        tint: 0, cool: 5, alpha: 0.62 }
    );
  }

  /* ---------------------------------------------------------
     Kursor
     --------------------------------------------------------- */

  var pointerX = -999, pointerY = -999;
  var lastX = -999, lastY = -999;
  var lightX = 0, lightY = 0, lightReady = false;
  var lastHeatX = -1, lastHeatY = -1;
  var pointerActive = false;

  function setPointer(x, y) {
    pointerX = x;
    pointerY = y;
    if (!lightReady) { lightX = x; lightY = y; lightReady = true; }
    pointerActive = true;
  }

  window.addEventListener('pointermove', function (e) {
    setPointer(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('pointerdown', function (e) {
    setPointer(e.clientX, e.clientY);
    if (!reduceMotion) emitBurst(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('pointerleave', function () {
    pointerActive = false;
    lastX = lastY = -999;
  }, { passive: true });

  /* Rozpalenie napisu */
  var hot = false;
  if (goat) {
    goat.addEventListener('pointerenter', function () {
      hot = true;
      goatRect = goat.getBoundingClientRect();
      body.classList.add('ignite');
    });
    goat.addEventListener('pointerleave', function () {
      hot = false;
      body.classList.remove('ignite');
    });
  }

  /* ---------------------------------------------------------
     Pętla animacji
     --------------------------------------------------------- */

  var emberAccumulator = 0;
  var goatAccumulator = 0;
  var rectAge = 0;
  var lastTime = 0;
  var running = true;

  function frame(now) {
    if (!running) return;
    window.requestAnimationFrame(frame);

    var dt = lastTime ? (now - lastTime) / 1000 : 0.016;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;   // po powrocie z tła nie skacz

    /* Światło ciepła + paralaksa — płynnie doganiają kursor.
       Zapisujemy PROSTO na elementy: ustawianie zmiennych CSS na <html>
       unieważnia style całego dokumentu w każdej klatce i zabija płynność. */
    if (lightReady) {
      var ease = Math.min(1, dt * 11);
      lightX += (pointerX - lightX) * ease;
      lightY += (pointerY - lightY) * ease;

      var hx = Math.round(lightX);
      var hy = Math.round(lightY);
      if (hx !== lastHeatX || hy !== lastHeatY) {
        lastHeatX = hx;
        lastHeatY = hy;
        if (heat) {
          heat.style.setProperty('--mx', hx + 'px');
          heat.style.setProperty('--my', hy + 'px');
        }
        if (container) {
          container.style.transform =
            'translate3d(' + (-(hx / W - 0.5) * 32).toFixed(1) + 'px,' +
                             (-(hy / H - 0.5) * 22).toFixed(1) + 'px,0)';
        }
      }
    }

    /* ślad za kursorem */
    if (pointerActive && lastX > -900) {
      var dx = pointerX - lastX;
      var dy = pointerY - lastY;
      var speed = Math.sqrt(dx * dx + dy * dy);
      if (speed > 1.2) emitTrail(pointerX, pointerY, speed);
    }
    lastX = pointerX;
    lastY = pointerY;

    /* żar z dołu ekranu */
    emberAccumulator += dt * (W / 22);
    while (emberAccumulator >= 1) {
      emberAccumulator -= 1;
      emitEmber();
    }

    /* płomień spod GOAT przy najechaniu */
    if (hot) {
      /* napis dryfuje z paralaksą — odświeżamy jego pozycję co ~0,25 s
         zamiast w każdej klatce (getBoundingClientRect wymusza layout) */
      rectAge += dt;
      if (rectAge > 0.25) {
        rectAge = 0;
        goatRect = goat.getBoundingClientRect();
      }
      goatAccumulator += dt * 90;
      while (goatAccumulator >= 1) {
        goatAccumulator -= 1;
        emitFromGoat();
      }
    } else {
      goatAccumulator = 0;
    }

    /* fizyka */
    var time = now / 1000;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (p.dead) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.dead = true;
        recycled.push(p);
        continue;
      }

      p.vy += p.buoyancy * dt;
      p.vx += Math.sin(p.y * 0.012 + p.seed + time * 1.1) * p.sway * dt;

      var d = 1 - p.drag * dt;
      if (d < 0) d = 0;
      p.vx *= d;
      p.vy *= d;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.y < -80 || p.x < -120 || p.x > W + 120) {
        p.dead = true;
        recycled.push(p);
      }
    }

    /* rysowanie */
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    for (var j = 0; j < particles.length; j++) {
      var q = particles[j];
      if (q.dead) continue;

      var t = q.life / q.maxLife;             // 1 → 0
      var fadeIn = (1 - t) * 9;
      if (fadeIn > 1) fadeIn = 1;

      var alpha = q.alpha * t * fadeIn;
      if (alpha <= 0.01) continue;

      var size = q.size * (0.45 + Math.sqrt(t) * 0.75);
      var tint = q.tint + Math.floor((1 - t) * q.cool);
      if (tint > 5) tint = 5;

      ctx.globalAlpha = alpha;
      ctx.drawImage(SPRITES[tint], q.x - size / 2, q.y - size / 2, size, size);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------------------------------------
     Start
     --------------------------------------------------------- */

  resize();
  window.addEventListener('resize', resize, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      lastTime = 0;
      window.requestAnimationFrame(frame);
    }
  });

  if (reduceMotion) {
    canvas.style.display = 'none';
  } else {
    window.requestAnimationFrame(frame);
  }
}());
