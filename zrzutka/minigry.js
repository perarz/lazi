/* ============================================================
   Minigierki przed wpłatą — wszystko w przeglądarce, zero zapytań.

   Kwota wybiera grę: do 1000 łatwa, 1001–2000 trudna. W obrębie
   przedziału trudność (t = 0…1) rośnie z kwotą. Wpłata leci dopiero
   po wygranej; po przegranej jest 10 s przerwy.

   Każda gra to obiekt { nazwa, opis[], start(env) } — start zwraca
   { krok(dt), rysuj(ctx), wcisniete(p), puszczone(p), ruch(p), klawisz(k, wdol) }.
   env daje wymiary (W, H, u = 1% krótszego boku), trudność t
   i funkcje wygrana() / przegrana(powod).
   ============================================================ */

(function () {
  'use strict';

  var BLOKADA_MS = 10000;
  var KLUCZ_BLOKADY = 'zrzutka:minigra-blokada';
  var PROG = 1000;          // do tej kwoty łatwa gra
  var MAKS = 2000;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function los(a, b) { return a + Math.random() * (b - a); }
  function zakres(x, a, b) { return x < a ? a : x > b ? b : x; }

  /* =========================================================
     FORTNITE 1 · Skok z Battle Busa (łatwa)
     ========================================================= */
  var MIEJSCA = ['Tilted Towers', 'Pleasant Park', 'Retail Row', 'Salty Springs', 'Lazy Lake', 'Sweaty Sands'];

  var skokZBusa = {
    nazwa: 'Skok z Battle Busa',
    opis: [
      'Stuknij, żeby wyskoczyć z autobusu.',
      'Potem trzymaj palec po stronie, w którą chcesz lecieć (albo ← →).',
      'Wyląduj na podświetlonym miejscu. Uważaj na wiatr!'
    ],
    start: function (env) {
      var W = env.W, H = env.H, u = env.u, t = env.t;
      var ziemia = H * 0.84;
      var strefaW = W * lerp(0.3, 0.12, t);
      var strefaX = los(strefaW / 2 + W * 0.06, W - strefaW / 2 - W * 0.06);
      var kier = Math.random() < 0.5 ? 1 : -1;
      var bus = { x: kier > 0 ? -u * 12 : W + u * 12, y: H * 0.13, v: W * lerp(0.16, 0.3, t) * kier };
      var wiatrMaks = W * lerp(0.02, 0.13, t);
      var wiatr = 0, wiatrCel = 0, doZmiany = 0;
      var spadanie = H * lerp(0.12, 0.2, t);
      var ster = 0, palec = null, klawisze = { l: false, p: false };
      var gracz = null, koniec = false, czas = 0;
      var miejsce = MIEJSCA[Math.floor(Math.random() * MIEJSCA.length)];
      var chmury = [];
      for (var i = 0; i < 7; i++) chmury.push({ x: los(0, W), y: los(H * 0.05, H * 0.6), r: los(u * 5, u * 11), v: los(4, 12) * u / 10 });

      function skocz() {
        if (gracz || koniec) return;
        gracz = { x: zakres(bus.x, u * 3, W - u * 3), y: bus.y + u * 3, vy: 0 };
      }

      return {
        krok: function (dt) {
          czas += dt;
          for (var i = 0; i < chmury.length; i++) {
            var c = chmury[i];
            c.x += (c.v + wiatr * 0.3) * dt;
            if (c.x > W + c.r * 2) c.x = -c.r * 2;
            if (c.x < -c.r * 2) c.x = W + c.r * 2;
          }
          doZmiany -= dt;
          if (doZmiany <= 0) { wiatrCel = los(-wiatrMaks, wiatrMaks); doZmiany = lerp(1.6, 0.9, t); }
          wiatr += (wiatrCel - wiatr) * Math.min(1, dt * 1.5);
          bus.x += bus.v * dt;
          if (koniec) return;
          if (!gracz) {
            if ((kier > 0 && bus.x > W + u * 8) || (kier < 0 && bus.x < -u * 8)) {
              koniec = true;
              env.przegrana('Autobus odleciał bez ciebie!');
            }
            return;
          }
          ster = 0;
          if (klawisze.l) ster -= 1;
          if (klawisze.p) ster += 1;
          if (palec && Math.abs(palec.x - gracz.x) > u * 1.5) ster = palec.x < gracz.x ? -1 : 1;
          gracz.vy = Math.min(spadanie, gracz.vy + spadanie * 2 * dt);
          gracz.y += gracz.vy * dt;
          gracz.x = zakres(gracz.x + (ster * W * 0.3 + wiatr) * dt, u * 2, W - u * 2);
          if (gracz.y >= ziemia) {
            gracz.y = ziemia;
            koniec = true;
            if (Math.abs(gracz.x - strefaX) <= strefaW / 2) env.wygrana();
            else env.przegrana('Wylądowałeś obok ' + miejsce + '. Loot zabrał ktoś inny.');
          }
        },
        rysuj: function (g) {
          var niebo = g.createLinearGradient(0, 0, 0, H);
          niebo.addColorStop(0, '#2f7fe6');
          niebo.addColorStop(0.7, '#8fd6ff');
          niebo.addColorStop(1, '#bfeaff');
          g.fillStyle = niebo;
          g.fillRect(0, 0, W, H);
          g.fillStyle = 'rgba(255,255,255,0.85)';
          chmury.forEach(function (c) {
            g.beginPath();
            g.arc(c.x, c.y, c.r, 0, 6.283);
            g.arc(c.x + c.r * 0.9, c.y + c.r * 0.2, c.r * 0.75, 0, 6.283);
            g.arc(c.x - c.r * 0.9, c.y + c.r * 0.25, c.r * 0.65, 0, 6.283);
            g.fill();
          });

          // wyspa
          g.fillStyle = '#3aa0e8';
          g.fillRect(0, ziemia + u * 2, W, H - ziemia);
          g.fillStyle = '#f2d98a';
          g.beginPath();
          g.moveTo(-u, H);
          g.lineTo(-u, ziemia + u * 3);
          g.quadraticCurveTo(W * 0.5, ziemia - u * 3, W + u, ziemia + u * 3);
          g.lineTo(W + u, H);
          g.fill();
          g.fillStyle = '#4fbf4a';
          g.beginPath();
          g.moveTo(-u, H);
          g.lineTo(-u, ziemia + u * 4);
          g.quadraticCurveTo(W * 0.5, ziemia - u * 1.5, W + u, ziemia + u * 4);
          g.lineTo(W + u, H);
          g.fill();

          // strefa lądowania
          var puls = 0.5 + Math.sin(czas * 5) * 0.15;
          g.fillStyle = 'rgba(255, 227, 77,' + (0.18 + puls * 0.12) + ')';
          g.fillRect(strefaX - strefaW / 2, 0, strefaW, ziemia);
          g.fillStyle = '#ffe34d';
          g.fillRect(strefaX - strefaW / 2, ziemia - u * 0.6, strefaW, u * 1.4);
          // domki w strefie
          for (var d = -1; d <= 1; d++) {
            var dx = strefaX + d * strefaW * 0.28, dh = u * (4 + (d + 1) * 1.5);
            g.fillStyle = d === 0 ? '#c9754a' : '#a85f3c';
            g.fillRect(dx - u * 2, ziemia - dh, u * 4, dh);
            g.fillStyle = '#6b3a24';
            g.beginPath();
            g.moveTo(dx - u * 2.6, ziemia - dh);
            g.lineTo(dx, ziemia - dh - u * 2.2);
            g.lineTo(dx + u * 2.6, ziemia - dh);
            g.fill();
          }
          g.font = '700 ' + Math.round(u * 3.4) + 'px Rubik, system-ui, sans-serif';
          g.textAlign = 'center';
          g.lineWidth = u * 0.7;
          g.strokeStyle = '#0a1646';
          g.fillStyle = '#ffffff';
          g.strokeText(miejsce, strefaX, ziemia + u * 7.5);
          g.fillText(miejsce, strefaX, ziemia + u * 7.5);

          // autobus z balonem
          g.save();
          g.translate(bus.x, bus.y);
          g.strokeStyle = '#333';
          g.lineWidth = u * 0.3;
          g.beginPath();
          g.moveTo(-u * 3, -u * 2); g.lineTo(0, -u * 7);
          g.moveTo(u * 3, -u * 2); g.lineTo(0, -u * 7);
          g.stroke();
          g.fillStyle = '#ff4fa3';
          g.beginPath();
          g.ellipse(0, -u * 9, u * 3.4, u * 3.8, 0, 0, 6.283);
          g.fill();
          g.fillStyle = '#1f6fe0';
          g.fillRect(-u * 6, -u * 2, u * 12, u * 5);
          g.fillStyle = '#ffe34d';
          g.fillRect(-u * 6, u * 1.6, u * 12, u * 1);
          g.fillStyle = '#bff0ff';
          for (var o = 0; o < 4; o++) g.fillRect(-u * 5 + o * u * 2.7, -u * 1.2, u * 1.8, u * 1.6);
          g.restore();

          // skoczek z lotnią
          if (gracz) {
            g.save();
            g.translate(gracz.x, gracz.y);
            var przechyl = ster * 0.25 + wiatr / (W * 0.4);
            g.rotate(przechyl);
            g.fillStyle = '#ffe34d';
            g.beginPath();
            g.moveTo(-u * 5, -u * 3.5);
            g.quadraticCurveTo(0, -u * 6.5, u * 5, -u * 3.5);
            g.lineTo(0, -u * 4.4);
            g.fill();
            g.strokeStyle = '#0a1646';
            g.lineWidth = u * 0.25;
            g.beginPath();
            g.moveTo(-u * 4, -u * 3.6); g.lineTo(0, -u * 0.8); g.lineTo(u * 4, -u * 3.6);
            g.stroke();
            g.fillStyle = '#ff7a2f';
            g.fillRect(-u * 0.9, -u * 0.8, u * 1.8, u * 2.6);
            g.fillStyle = '#ffd7b0';
            g.beginPath();
            g.arc(0, -u * 1.2, u * 0.9, 0, 6.283);
            g.fill();
            g.restore();
          }

          // wiatr
          if (wiatrMaks > 1) {
            var sila = wiatr / wiatrMaks;
            g.fillStyle = 'rgba(10,22,70,0.55)';
            g.fillRect(W / 2 - u * 12, H * 0.23, u * 24, u * 4.6);
            g.fillStyle = '#ffffff';
            g.font = '600 ' + Math.round(u * 2.4) + 'px Rubik, system-ui, sans-serif';
            g.fillText('WIATR', W / 2, H * 0.23 + u * 2.6);
            g.fillStyle = '#ffe34d';
            var dl = sila * u * 10;
            g.fillRect(dl < 0 ? W / 2 + dl : W / 2, H * 0.23 + u * 3.3, Math.abs(dl), u * 0.9);
          }
        },
        wcisniete: function (p) { palec = p; skocz(); },
        ruch: function (p) { if (palec) palec = p; },
        puszczone: function () { palec = null; },
        klawisz: function (k, wdol) {
          if (k === 'ArrowLeft' || k === 'a') klawisze.l = wdol;
          else if (k === 'ArrowRight' || k === 'd') klawisze.p = wdol;
          else if (wdol && (k === ' ' || k === 'Enter')) skocz();
        },
        podpowiedz: function () { return gracz ? 'Trzymaj palec tam, gdzie chcesz lecieć' : 'Stuknij, żeby skoczyć!'; },
        debug: function () { return { bus: bus.x, strefaX: strefaX, strefaW: strefaW, gracz: gracz && { x: gracz.x, y: gracz.y } }; }
      };
    }
  };

  /* =========================================================
     FORTNITE 2 · Build fight w burzy (trudna)
     ========================================================= */
  var budowanieWBurzy = {
    nazwa: 'Build fight w burzy',
    opis: [
      'Przeciągaj palcem (albo WASD), żeby biegać. Nie wychodź poza krąg burzy.',
      'Krótkie stuknięcie = ściana w stronę najbliższego wroga (10 materiałów).',
      'Zbieraj drewno 🪵. Przetrwaj do końca odliczania.'
    ],
    start: function (env) {
      var W = env.W, H = env.H, u = env.u, t = env.t;
      var min = Math.min(W, H);
      var czasGry = lerp(20, 32, t);
      var gracz = { x: W / 2, y: H / 2, r: u * 2.4, hp: 100 };
      var cel = null, klawisze = {};
      var mat = Math.round(lerp(60, 30, t));
      var sciany = [], kule = [], drewno = [], wrogowie = [];
      var czas = 0, koniec = false, doDrewna = 1.5, blysk = 0;
      var burza = {
        x: W / 2, y: H / 2, r: Math.sqrt(W * W + H * H) / 2 + u * 4,
        rMin: min * lerp(0.34, 0.2, t),
        cx: W / 2 + los(-1, 1) * min * lerp(0, 0.18, t),
        cy: H / 2 + los(-1, 1) * min * lerp(0, 0.18, t)
      };
      burza.r0 = burza.r;
      var ilu = t < 0.5 ? 1 : 2;
      for (var i = 0; i < ilu; i++) {
        wrogowie.push({ faza: i * Math.PI + los(0, 1), strzal: lerp(1.6, 1.0, t) + i * 0.7, seria: 0, doKuli: 0, ostrz: 0, x: 0, y: 0 });
      }
      var przerwa = lerp(2.4, 1.3, t);
      var wSerii = 3 + Math.round(t * 2);
      var predkoscKuli = u * lerp(42, 78, t);

      function pozycjaWroga(w) {
        // biega po obwodzie ekranu
        var a = w.faza;
        var rx = W / 2 - u * 4, ry = H / 2 - u * 4;
        var c = Math.cos(a), s = Math.sin(a);
        var k = 1 / Math.max(Math.abs(c) / rx, Math.abs(s) / ry);
        w.x = W / 2 + c * k;
        w.y = H / 2 + s * k;
      }

      function najblizszy() {
        var best = null, bd = 1e9;
        wrogowie.forEach(function (w) {
          var d = (w.x - gracz.x) * (w.x - gracz.x) + (w.y - gracz.y) * (w.y - gracz.y);
          if (d < bd) { bd = d; best = w; }
        });
        return best;
      }

      function zbuduj() {
        if (koniec) return;
        if (mat < 10) { blysk = 0.5; return; }
        var w = najblizszy();
        var dx = w.x - gracz.x, dy = w.y - gracz.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= d; dy /= d;
        mat -= 10;
        sciany.push({
          x: gracz.x + dx * u * 6, y: gracz.y + dy * u * 6,
          px: -dy, py: dx, dl: u * 7, hp: 3, zycie: 4.5
        });
      }

      // odległość punktu od odcinka ściany
      function trafiaSciane(s, x, y) {
        var rx = x - s.x, ry = y - s.y;
        var wzd = rx * s.px + ry * s.py;
        var w = zakres(wzd, -s.dl, s.dl);
        var qx = s.x + s.px * w - x, qy = s.y + s.py * w - y;
        return qx * qx + qy * qy < u * u * 1.4;
      }

      return {
        krok: function (dt) {
          if (koniec) return;
          czas += dt;
          blysk = Math.max(0, blysk - dt);
          // ruch
          var vx = 0, vy = 0;
          if (klawisze.l) vx -= 1;
          if (klawisze.p) vx += 1;
          if (klawisze.g) vy -= 1;
          if (klawisze.d) vy += 1;
          if (cel) {
            var cx = cel.x - gracz.x, cy = cel.y - gracz.y, cd = Math.sqrt(cx * cx + cy * cy);
            if (cd > u) { vx = cx / cd; vy = cy / cd; }
          }
          var vd = Math.sqrt(vx * vx + vy * vy);
          if (vd > 0) {
            gracz.x = zakres(gracz.x + vx / vd * u * 36 * dt, gracz.r, W - gracz.r);
            gracz.y = zakres(gracz.y + vy / vd * u * 36 * dt, gracz.r, H - gracz.r);
          }
          // burza
          var f = Math.min(1, czas / (czasGry * 0.85));
          burza.r = lerp(burza.r0, burza.rMin, f);
          burza.x = lerp(W / 2, burza.cx, f);
          burza.y = lerp(H / 2, burza.cy, f);
          var bx = gracz.x - burza.x, by = gracz.y - burza.y;
          if (bx * bx + by * by > burza.r * burza.r) gracz.hp -= lerp(10, 16, t) * dt;
          // drewno
          doDrewna -= dt;
          if (doDrewna <= 0 && drewno.length < 3) {
            var a = los(0, 6.283), r = los(0, burza.r * 0.8);
            drewno.push({ x: zakres(burza.x + Math.cos(a) * r, u * 4, W - u * 4), y: zakres(burza.y + Math.sin(a) * r, u * 4, H - u * 4) });
            doDrewna = lerp(2.2, 4.2, t);
          }
          for (var i = drewno.length - 1; i >= 0; i--) {
            var dd = drewno[i];
            if (Math.abs(dd.x - gracz.x) < u * 3.5 && Math.abs(dd.y - gracz.y) < u * 3.5) { drewno.splice(i, 1); mat += 20; }
          }
          // wrogowie i serie
          wrogowie.forEach(function (w) {
            w.faza += dt * lerp(0.12, 0.3, t);
            pozycjaWroga(w);
            if (w.seria > 0) {
              w.doKuli -= dt;
              if (w.doKuli <= 0) {
                w.seria--;
                w.doKuli = 0.13;
                var kx = gracz.x - w.x, ky = gracz.y - w.y, kd = Math.sqrt(kx * kx + ky * ky) || 1;
                var rozrzut = los(-1, 1) * 0.06;
                var c = Math.cos(rozrzut), s = Math.sin(rozrzut);
                var nx = kx / kd, ny = ky / kd;
                kule.push({ x: w.x, y: w.y, vx: (nx * c - ny * s) * predkoscKuli, vy: (nx * s + ny * c) * predkoscKuli });
              }
            } else {
              w.strzal -= dt;
              w.ostrz = w.strzal < 0.45 ? 1 : 0;   // mignięcie przed serią
              if (w.strzal <= 0) { w.seria = wSerii; w.doKuli = 0; w.strzal = przerwa * los(0.85, 1.15); }
            }
          });
          // kule
          for (var k = kule.length - 1; k >= 0; k--) {
            var b = kule[k];
            b.x += b.vx * dt; b.y += b.vy * dt;
            var zbita = false;
            for (var j = 0; j < sciany.length; j++) {
              if (trafiaSciane(sciany[j], b.x, b.y)) { sciany[j].hp--; zbita = true; break; }
            }
            if (!zbita) {
              var gx = b.x - gracz.x, gy = b.y - gracz.y;
              if (gx * gx + gy * gy < gracz.r * gracz.r * 1.3) { gracz.hp -= lerp(8, 9, t); zbita = true; blysk = 0.25; }
            }
            if (zbita || b.x < -20 || b.y < -20 || b.x > W + 20 || b.y > H + 20) kule.splice(k, 1);
          }
          for (var m = sciany.length - 1; m >= 0; m--) {
            sciany[m].zycie -= dt;
            if (sciany[m].hp <= 0 || sciany[m].zycie <= 0) sciany.splice(m, 1);
          }
          if (gracz.hp <= 0) {
            gracz.hp = 0;
            koniec = true;
            env.przegrana('Wyeliminowany! Burza i spocone lobby wygrały.');
          } else if (czas >= czasGry) {
            koniec = true;
            env.wygrana();
          }
        },
        rysuj: function (g) {
          g.fillStyle = '#5bb84f';
          g.fillRect(0, 0, W, H);
          // trawa w kratkę
          g.fillStyle = 'rgba(0,0,0,0.05)';
          var kr = u * 8;
          for (var y = 0; y < H; y += kr) for (var x = ((y / kr) % 2) * kr; x < W; x += kr * 2) g.fillRect(x, y, kr, kr);
          drewno.forEach(function (d) {
            g.fillStyle = '#8b5a2b';
            g.fillRect(d.x - u * 2.2, d.y - u * 0.9, u * 4.4, u * 1.4);
            g.fillRect(d.x - u * 1.6, d.y + u * 0.4, u * 4.4, u * 1.4);
            g.fillStyle = '#c99356';
            g.beginPath(); g.arc(d.x + u * 2.2, d.y - u * 0.2, u * 0.7, 0, 6.283); g.fill();
          });
          // burza: fiolet poza kręgiem
          // prostokąt zgodnie z zegarem, krąg przeciwnie — w środku zostaje dziura
          g.beginPath();
          g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(0, H); g.closePath();
          g.moveTo(burza.x + burza.r, burza.y);
          g.arc(burza.x, burza.y, burza.r, 0, 6.283, true);
          g.closePath();
          g.fillStyle = 'rgba(120, 40, 200, 0.42)';
          g.fill();
          g.strokeStyle = 'rgba(210, 160, 255, 0.9)';
          g.lineWidth = u * 0.6;
          g.beginPath(); g.arc(burza.x, burza.y, burza.r, 0, 6.283); g.stroke();
          // ściany
          sciany.forEach(function (s) {
            g.save();
            g.globalAlpha = Math.min(1, s.zycie * 2);
            g.strokeStyle = s.hp >= 3 ? '#9ad4ff' : s.hp === 2 ? '#6fb3ec' : '#e0925a';
            g.lineWidth = u * 1.6;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(s.x - s.px * s.dl, s.y - s.py * s.dl);
            g.lineTo(s.x + s.px * s.dl, s.y + s.py * s.dl);
            g.stroke();
            g.restore();
          });
          // wrogowie
          wrogowie.forEach(function (w) {
            g.fillStyle = w.ostrz ? '#ffffff' : '#e23b3b';
            g.beginPath(); g.arc(w.x, w.y, u * 2.3, 0, 6.283); g.fill();
            g.strokeStyle = '#2a0a0a';
            g.lineWidth = u * 0.5;
            g.stroke();
            var kx = gracz.x - w.x, ky = gracz.y - w.y, kd = Math.sqrt(kx * kx + ky * ky) || 1;
            g.beginPath(); g.moveTo(w.x, w.y); g.lineTo(w.x + kx / kd * u * 3.6, w.y + ky / kd * u * 3.6); g.stroke();
          });
          // kule
          g.fillStyle = '#ffe34d';
          kule.forEach(function (b) { g.beginPath(); g.arc(b.x, b.y, u * 0.7, 0, 6.283); g.fill(); });
          // gracz
          g.fillStyle = blysk > 0 ? '#ff8a7a' : '#1f6fe0';
          g.beginPath(); g.arc(gracz.x, gracz.y, gracz.r, 0, 6.283); g.fill();
          g.strokeStyle = '#ffe34d';
          g.lineWidth = u * 0.6;
          g.stroke();
          // HUD
          var zostalo = Math.max(0, czasGry - czas);
          g.fillStyle = 'rgba(10,22,70,0.7)';
          g.fillRect(u * 2, u * 2, u * 34, u * 9.5);
          g.fillStyle = '#ffffff';
          g.font = '700 ' + Math.round(u * 3) + 'px Rubik, system-ui, sans-serif';
          g.textAlign = 'left';
          g.fillText('⏱ ' + zostalo.toFixed(1) + ' s', u * 3.5, u * 5.6);
          g.fillStyle = mat < 10 && blysk > 0 ? '#ff8a7a' : '#ffe34d';
          g.fillText('🪵 ' + mat, u * 21, u * 5.6);
          g.fillStyle = 'rgba(255,255,255,0.25)';
          g.fillRect(u * 3.5, u * 7.4, u * 31, u * 2.2);
          g.fillStyle = gracz.hp > 40 ? '#5ee06a' : '#ff5a4a';
          g.fillRect(u * 3.5, u * 7.4, u * 31 * gracz.hp / 100, u * 2.2);
        },
        wcisniete: function (p) { cel = p; },
        ruch: function (p) { if (cel) cel = p; },
        puszczone: function (p, stukniecie) { cel = null; if (stukniecie) zbuduj(); },
        klawisz: function (k, wdol) {
          if (k === 'ArrowLeft' || k === 'a') klawisze.l = wdol;
          else if (k === 'ArrowRight' || k === 'd') klawisze.p = wdol;
          else if (k === 'ArrowUp' || k === 'w') klawisze.g = wdol;
          else if (k === 'ArrowDown' || k === 's') klawisze.d = wdol;
          else if (wdol && (k === ' ' || k === 'Enter')) zbuduj();
        },
        podpowiedz: function () { return czas < 3 ? 'Przeciągaj = bieg · stuknij = ściana' : ''; },
        debug: function () {
          return { hp: gracz.hp, x: gracz.x, y: gracz.y, mat: mat, czas: czas, czasGry: czasGry, burza: { x: burza.x, y: burza.y, r: burza.r },
            sciany: sciany.length, kule: kule, wrogowie: wrogowie, drewno: drewno };
        }
      };
    }
  };

  var GRY = {
    fortnite: [skokZBusa, budowanieWBurzy]
  };

  /* =========================================================
     Ramka: ekran startowy, pętla, wynik, blokada po przegranej
     ========================================================= */

  function el(tag, klasa, tekst) {
    var e = document.createElement(tag);
    if (klasa) e.className = klasa;
    if (tekst !== undefined) e.textContent = tekst;
    return e;
  }

  function czytajBlokade() {
    try { return Number(localStorage.getItem(KLUCZ_BLOKADY)) || 0; } catch (e) { return 0; }
  }
  var blokadaDo = czytajBlokade();

  function ustawBlokade() {
    blokadaDo = Date.now() + BLOKADA_MS;
    try { localStorage.setItem(KLUCZ_BLOKADY, String(blokadaDo)); } catch (e) { /* tryb prywatny */ }
  }

  function pozostalaBlokada() {
    return Math.max(0, Math.ceil((blokadaDo - Date.now()) / 1000));
  }

  // gra i trudność dla kwoty; null = ta kategoria nie ma (jeszcze) minigierek
  function dlaKwoty(kat, ile) {
    var lista = GRY[kat];
    if (!lista) return null;
    var trudna = ile > PROG;
    var t = trudna ? (ile - PROG - 1) / (MAKS - PROG - 1) : (ile - 1) / (PROG - 1);
    return { gra: lista[trudna ? 1 : 0], t: zakres(t, 0, 1), trudna: trudna };
  }

  function nazwaTrudnosci(t, trudna) {
    if (!trudna) return t < 0.25 ? 'Luz' : t < 0.6 ? 'Spoko' : t < 0.9 ? 'Konkret' : 'Pot na czole';
    return t < 0.25 ? 'Trudno' : t < 0.6 ? 'Ciężko' : t < 0.9 ? 'Bardzo ciężko' : 'KOSZMAR';
  }

  /* opcje: { kat, ile, kwotaTekst, dla, naWygrana(start), naRezygnacje() } */
  function graj(opcje) {
    var wybor = dlaKwoty(opcje.kat, opcje.ile);
    if (!wybor) { opcje.naWygrana(null); return; }
    var gra = wybor.gra;

    var nak = el('div', 'minigra');
    nak.setAttribute('role', 'dialog');
    nak.setAttribute('aria-modal', 'true');
    nak.setAttribute('aria-label', gra.nazwa);
    var gora = el('div', 'minigra-gora');
    var tytul = el('div', 'minigra-tytul', gra.nazwa);
    var btnX = el('button', 'minigra-x', '×');
    btnX.type = 'button';
    btnX.setAttribute('aria-label', 'Zrezygnuj');
    gora.appendChild(tytul);
    gora.appendChild(btnX);
    var scena = el('div', 'minigra-scena');
    var plotno = el('canvas', 'minigra-plotno');
    var podp = el('div', 'minigra-podpowiedz');
    scena.appendChild(plotno);
    scena.appendChild(podp);
    var panel = el('div', 'minigra-panel');
    scena.appendChild(panel);
    nak.appendChild(gora);
    nak.appendChild(scena);
    document.body.appendChild(nak);
    document.documentElement.classList.add('minigra-otwarta');

    var g = plotno.getContext('2d');
    var W = 0, H = 0, dpr = 1;
    var stan = null, instancja = null, rafId = 0, ostatni = 0, zamknieta = false, odliczanie = 0;

    function rozmiar() {
      var r = scena.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(200, Math.round(r.width));
      H = Math.max(200, Math.round(r.height));
      plotno.width = W * dpr;
      plotno.height = H * dpr;
    }

    function zamknij() {
      if (zamknieta) return;
      zamknieta = true;
      cancelAnimationFrame(rafId);
      clearInterval(odliczanie);
      window.removeEventListener('keydown', naKlawisz);
      window.removeEventListener('keyup', naKlawisz);
      window.removeEventListener('resize', naResize);
      document.documentElement.classList.remove('minigra-otwarta');
      nak.remove();
    }

    function rezygnuj() {
      zamknij();
      if (opcje.naRezygnacje) opcje.naRezygnacje();
    }

    function pokazPanel(tresc) {
      panel.textContent = '';
      tresc.forEach(function (x) { panel.appendChild(x); });
      panel.hidden = false;
    }

    function pasekTrudnosci() {
      var box = el('div', 'minigra-trudnosc');
      var napis = el('div', 'minigra-trudnosc-napis');
      napis.appendChild(el('span', null, 'Trudność'));
      napis.appendChild(el('b', null, nazwaTrudnosci(wybor.t, wybor.trudna)));
      var pas = el('div', 'minigra-trudnosc-pas');
      var wyp = el('i');
      wyp.style.width = Math.round(8 + wybor.t * 92) + '%';
      if (wybor.trudna) wyp.classList.add('trudna');
      pas.appendChild(wyp);
      box.appendChild(napis);
      box.appendChild(pas);
      return box;
    }

    function ekranStartu() {
      stan = 'start';
      var h = el('h3', 'minigra-panel-tytul', gra.nazwa);
      var za = el('p', 'minigra-panel-nad', 'Wygraj, a ' + opcje.kwotaTekst + ' poleci do: ' + opcje.dla);
      var lista = el('ol', 'minigra-opis');
      gra.opis.forEach(function (o) { lista.appendChild(el('li', null, o)); });
      var przyciski = el('div', 'minigra-przyciski');
      var graj = el('button', 'minigra-btn glowny', 'Graj!');
      graj.type = 'button';
      var nie = el('button', 'minigra-btn', 'Anuluj');
      nie.type = 'button';
      graj.addEventListener('click', startuj);
      nie.addEventListener('click', rezygnuj);
      przyciski.appendChild(nie);
      przyciski.appendChild(graj);
      pokazPanel([za, h, pasekTrudnosci(), lista, przyciski]);
      setTimeout(function () { graj.focus(); }, 30);
    }

    function startuj() {
      panel.hidden = true;
      rozmiar();
      var u = Math.min(W, H) / 100;
      instancja = gra.start({
        W: W, H: H, u: u, t: wybor.t,
        wygrana: function () { setTimeout(wygrana, 350); stan = 'wynik'; },
        przegrana: function (powod) { setTimeout(function () { przegrana(powod); }, 450); stan = 'wynik'; }
      });
      stan = 'gra';
      ostatni = performance.now();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(petla);
    }

    function petla(teraz) {
      if (zamknieta) return;
      var dt = Math.min(0.05, (teraz - ostatni) / 1000);
      ostatni = teraz;
      if (instancja) {
        instancja.krok(dt);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        instancja.rysuj(g);
        podp.textContent = stan === 'gra' && instancja.podpowiedz ? instancja.podpowiedz() : '';
      }
      rafId = requestAnimationFrame(petla);
    }

    function wygrana() {
      if (zamknieta) return;
      var h = el('h3', 'minigra-panel-tytul wygrana', 'Wygrana! 🏆');
      var p = el('p', 'minigra-panel-nad', opcje.kwotaTekst + ' leci do: ' + opcje.dla);
      pokazPanel([h, p]);
      var start = null;
      var r = panel.getBoundingClientRect();
      start = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      setTimeout(function () {
        zamknij();
        opcje.naWygrana(start);
      }, 1300);
    }

    function przegrana(powod) {
      if (zamknieta) return;
      ustawBlokade();
      var h = el('h3', 'minigra-panel-tytul przegrana', 'Przegrana');
      var p = el('p', 'minigra-panel-nad', powod);
      var info = el('p', 'minigra-info', 'Wpłata nie poszła. Spróbuj jeszcze raz.');
      var przyciski = el('div', 'minigra-przyciski');
      var nie = el('button', 'minigra-btn', 'Rezygnuję');
      nie.type = 'button';
      var znowu = el('button', 'minigra-btn glowny');
      znowu.type = 'button';
      nie.addEventListener('click', rezygnuj);
      znowu.addEventListener('click', function () { if (!znowu.disabled) startuj(); });
      przyciski.appendChild(nie);
      przyciski.appendChild(znowu);
      pokazPanel([h, p, info, przyciski]);
      function odswiez() {
        var s = pozostalaBlokada();
        znowu.disabled = s > 0;
        znowu.textContent = s > 0 ? 'Jeszcze raz (' + s + ' s)' : 'Jeszcze raz';
        if (s <= 0) clearInterval(odliczanie);
      }
      clearInterval(odliczanie);
      odliczanie = setInterval(odswiez, 250);
      odswiez();
    }

    // --- wejście ---
    var dotyk = null;
    function punkt(e) {
      var r = plotno.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    plotno.addEventListener('pointerdown', function (e) {
      if (stan !== 'gra' || !instancja) return;
      e.preventDefault();
      try { plotno.setPointerCapture(e.pointerId); } catch (x) { /* stare przeglądarki */ }
      var p = punkt(e);
      dotyk = { x: p.x, y: p.y, czas: performance.now(), daleko: false };
      instancja.wcisniete(p);
    });
    plotno.addEventListener('pointermove', function (e) {
      if (stan !== 'gra' || !instancja || !dotyk) return;
      var p = punkt(e);
      if (Math.abs(p.x - dotyk.x) + Math.abs(p.y - dotyk.y) > 12) dotyk.daleko = true;
      instancja.ruch(p);
    });
    function puszczenie(e) {
      if (!dotyk) return;
      var stukniecie = !dotyk.daleko && performance.now() - dotyk.czas < 260;
      dotyk = null;
      if (stan === 'gra' && instancja) instancja.puszczone(punkt(e), stukniecie);
    }
    plotno.addEventListener('pointerup', puszczenie);
    plotno.addEventListener('pointercancel', puszczenie);

    function naKlawisz(e) {
      if (e.key === 'Escape' && e.type === 'keydown') { rezygnuj(); return; }
      if (stan !== 'gra' || !instancja) return;
      var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.type === 'keydown' && e.repeat) { e.preventDefault(); return; }
      instancja.klawisz(k, e.type === 'keydown');
      if (k === ' ' || k.indexOf('Arrow') === 0) e.preventDefault();
    }
    function naResize() {
      // tylko obrót ekranu restartuje grę — chowający się pasek adresu na
      // telefonie też wywołuje resize, a wtedy wystarczy, że CSS rozciągnie płótno
      var r = scena.getBoundingClientRect();
      var obrot = (r.width > r.height) !== (W > H);
      if (stan === 'gra' && obrot) startuj();
      else if (stan !== 'gra') rozmiar();
    }
    window.addEventListener('keydown', naKlawisz);
    window.addEventListener('keyup', naKlawisz);
    window.addEventListener('resize', naResize);
    btnX.addEventListener('click', rezygnuj);

    rozmiar();
    ekranStartu();

    // diagnostyka do testów (Playwright)
    window.__minigra = function () {
      return { stan: stan, gra: gra.nazwa, t: wybor.t, W: W, H: H, d: instancja && instancja.debug ? instancja.debug() : null };
    };
  }

  window.ZRZUTKA_MINIGRY = {
    graj: graj,
    dlaKwoty: dlaKwoty,
    pozostalaBlokada: pozostalaBlokada,
    PROG: PROG,
    _gry: GRY,             // tylko testy
    MAKS: MAKS
  };
})();
