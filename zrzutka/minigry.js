/* ============================================================
   Minigierki przed wpłatą — wszystko w przeglądarce, zero zapytań.

   Kwota wybiera grę: do 1000 łatwa, 1001–2000 trudna. W obrębie
   przedziału trudność (t = 0…1) rośnie z kwotą. Wpłata leci dopiero
   po wygranej; po przegranej jest 10 s przerwy.

   Każda gra to obiekt { nazwa, ikona, opis[], start(env) } — start zwraca
   { krok(dt), rysuj(ctx), wcisniete(p), ruch(p), puszczone(p, stukniecie),
     najazd?(p), klawisz(k, wdol), podpowiedz?(), debug?() }.
   env daje wymiary (W, H, u = 1% krótszego boku), trudność t
   i funkcje wygrana() / przegrana(powod).
   ============================================================ */

(function () {
  'use strict';

  var BLOKADA_MS = 10000;
  var KLUCZ_BLOKADY = 'zrzutka:minigra-blokada';
  var PROG = 1000;          // do tej kwoty łatwa gra
  var MAKS = 2000;
  var FONT = 'Rubik, system-ui, sans-serif';

  function lerp(a, b, t) { return a + (b - a) * t; }
  function los(a, b) { return a + Math.random() * (b - a); }
  function zakres(x, a, b) { return x < a ? a : x > b ? b : x; }
  function wybierz(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

  /* ---------- wspólne drobiazgi rysowania ---------- */

  function zaokr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function napis(g, tekst, x, y, rozmiar, kolor, obrys, wyrownanie, grubosc) {
    g.font = (grubosc || 800) + ' ' + Math.round(rozmiar) + 'px ' + FONT;
    g.textAlign = wyrownanie || 'center';
    g.textBaseline = 'middle';
    if (obrys) {
      g.lineJoin = 'round';
      g.lineWidth = Math.max(2, rozmiar * 0.2);
      g.strokeStyle = obrys;
      g.strokeText(tekst, x, y);
    }
    g.fillStyle = kolor;
    g.fillText(tekst, x, y);
  }

  /* Cząsteczki: iskry, drzazgi, konfetti. */
  function czasteczki() {
    var lista = [];
    return {
      dodaj: function (x, y, ile, kolory, sila, opcje) {
        opcje = opcje || {};
        for (var i = 0; i < ile; i++) {
          var a = los(0, 6.283), v = los(0.3, 1) * sila;
          lista.push({
            x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opcje.wGore || 0),
            zycie: los(0.4, 0.9) * (opcje.zycie || 1), max: 1, r: los(0.6, 1.2) * (opcje.r || 3),
            kolor: wybierz(kolory), grawitacja: opcje.grawitacja || 0, obrot: los(0, 6), kwadrat: !!opcje.kwadrat
          });
        }
      },
      krok: function (dt) {
        for (var i = lista.length - 1; i >= 0; i--) {
          var c = lista[i];
          c.zycie -= dt;
          if (c.zycie <= 0) { lista.splice(i, 1); continue; }
          c.vy += c.grawitacja * dt;
          c.vx *= 1 - dt * 1.5;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.obrot += dt * 8;
        }
      },
      rysuj: function (g) {
        for (var i = 0; i < lista.length; i++) {
          var c = lista[i];
          g.globalAlpha = Math.min(1, c.zycie * 2.5);
          g.fillStyle = c.kolor;
          if (c.kwadrat) {
            g.save();
            g.translate(c.x, c.y);
            g.rotate(c.obrot);
            g.fillRect(-c.r, -c.r * 0.5, c.r * 2, c.r);
            g.restore();
          } else {
            g.beginPath();
            g.arc(c.x, c.y, c.r, 0, 6.283);
            g.fill();
          }
        }
        g.globalAlpha = 1;
      }
    };
  }

  /* Wyskakujące napisy („HEADSHOT!”, „+20”). */
  function napisy() {
    var lista = [];
    return {
      dodaj: function (tekst, x, y, kolor, rozmiar) { lista.push({ tekst: tekst, x: x, y: y, kolor: kolor, rozmiar: rozmiar, zycie: 1 }); },
      krok: function (dt) {
        for (var i = lista.length - 1; i >= 0; i--) {
          lista[i].zycie -= dt * 1.1;
          lista[i].y -= dt * lista[i].rozmiar * 1.6;
          if (lista[i].zycie <= 0) lista.splice(i, 1);
        }
      },
      rysuj: function (g) {
        lista.forEach(function (n) {
          var s = n.zycie > 0.85 ? 1 + (n.zycie - 0.85) * 3 : 1;
          g.globalAlpha = Math.min(1, n.zycie * 2);
          napis(g, n.tekst, n.x, n.y, n.rozmiar * s, n.kolor, '#0a1646');
        });
        g.globalAlpha = 1;
      }
    };
  }

  /* =========================================================
     FORTNITE 1 · Snajper z Tilted Towers (łatwa)
     ========================================================= */
  var SKORKI = [
    { stroj: '#e0473c', helm: '#7a1d17' },
    { stroj: '#f08a24', helm: '#8a4a0c' },
    { stroj: '#8e44ad', helm: '#3f1a52' },
    { stroj: '#2f3542', helm: '#111418' },
    { stroj: '#27ae60', helm: '#0f5230' }
  ];

  var snajper = {
    nazwa: 'Snajper z Tilted',
    ikona: '🎯',
    opis: [
      'Wrogowie wychylają się z okien i dachów Tilted Towers — stuknij, żeby strzelić.',
      'Nie strzelaj do swoich (niebieski znacznik nad głową)!',
      'Trafienie w głowę = HEADSHOT. Uważaj na amunicję i czas.'
    ],
    start: function (env) {
      var W = env.W, H = env.H, u = env.u, t = env.t;
      var cel = Math.round(lerp(5, 9, t));
      var czasGry = lerp(26, 24, t);
      var amunicja = cel + Math.round(lerp(12, 5, t));
      var widocznosc = lerp(1.8, 0.95, t);
      var coIle = lerp(1.05, 0.62, t);
      var naraz = Math.round(lerp(1, 3, t));
      var szansaSwoj = lerp(0.1, 0.28, t);
      var trafione = 0, czas = 0, doWroga = 0.6, koniec = false, licznikPostaci = 0;
      var celownik = { x: W / 2, y: H * 0.45 }, odrzut = 0, blysk = 0, wstrzas = 0;
      var dziury = [], postacie = [];
      var cz = czasteczki(), nap = napisy();

      // --- miasto: kilka budynków z oknami, dachy też są miejscami ---
      var horyzont = H * 0.9;
      var n = W > H * 1.2 ? 5 : 3;
      var budynki = [], miejsca = [];
      var szer = W / n;
      for (var b = 0; b < n; b++) {
        var bw = szer * los(0.72, 0.86);
        var bx = b * szer + (szer - bw) / 2;
        var bh = H * (H > W ? los(0.58, 0.8) : los(0.42, 0.66));
        var by = horyzont - bh;
        var pietra = Math.max(2, Math.floor(bh / (u * 15)));
        var kolumny = bw > u * 26 ? 2 : 1;
        var bud = { x: bx, y: by, w: bw, h: bh, okna: [], kolor: wybierz(['#b86b4b', '#9c5a44', '#c98a5a', '#8a6f5c', '#a4776a']) };
        var ow = Math.min(u * 10, bw / (kolumny * 1.6)), oh = u * 9;
        for (var p = 0; p < pietra; p++) {
          for (var k = 0; k < kolumny; k++) {
            var ox = bx + bw * (kolumny === 1 ? 0.5 : (k === 0 ? 0.3 : 0.7)) - ow / 2;
            var oy = by + u * 5 + p * (bh - u * 8) / pietra;
            if (oy + oh > horyzont - u * 3) continue;
            var okno = { x: ox, y: oy, w: ow, h: oh };
            bud.okna.push(okno);
            miejsca.push({ typ: 'okno', x: ox + ow / 2, dol: oy + oh, gora: oy, szer: ow, zajete: false });
          }
        }
        miejsca.push({ typ: 'dach', x: bx + bw / 2, dol: by, gora: by - u * 12, szer: bw * 0.8, zajete: false });
        budynki.push(bud);
      }

      // tło: chmury i przelatujący Battle Bus
      var chmury = [];
      for (var ch = 0; ch < 5; ch++) chmury.push({ x: los(0, W), y: los(H * 0.06, H * 0.35), r: los(u * 4, u * 8), v: los(u * 1, u * 3) });
      var bus = { x: -u * 20, y: H * 0.2, v: u * 9 };

      function nowaPostac() {
        var wolne = miejsca.filter(function (m) { return !m.zajete; });
        if (!wolne.length) return;
        var m = wybierz(wolne);
        m.zajete = true;
        var swoj = Math.random() < szansaSwoj;
        postacie.push({
          id: ++licznikPostaci, m: m, swoj: swoj, skorka: swoj ? { stroj: '#2e86de', helm: '#123e6b' } : wybierz(SKORKI),
          faza: 0, zycie: widocznosc * los(0.85, 1.15), trafiony: 0,
          dx: 0, v: m.typ === 'dach' && t > 0.45 && !swoj ? los(-1, 1) * u * lerp(4, 14, t) : 0
        });
      }

      function wysokoscPostaci(m) { return m.typ === 'okno' ? m.dol - m.gora : u * 12; }

      function strzal(p) {
        if (koniec) return;
        if (amunicja <= 0) return;
        amunicja--;
        celownik = p;
        odrzut = 1; blysk = 0.07; wstrzas = u * 0.8;
        // najbliższa trafiona postać (od przodu)
        var hit = null, glowa = false;
        for (var i = postacie.length - 1; i >= 0; i--) {
          var c = postacie[i];
          if (c.trafiony || c.faza < 0.5) continue;
          var h = wysokoscPostaci(c.m) * c.faza;
          var cx = c.m.x + c.dx, gora = c.m.dol - h;
          var szer = Math.min(c.m.szer * 0.55, u * 7);
          if (p.x > cx - szer / 2 && p.x < cx + szer / 2 && p.y > gora && p.y < c.m.dol) {
            hit = c;
            glowa = p.y < gora + Math.min(h, u * 12) * 0.4;
            break;
          }
        }
        if (!hit) {
          dziury.push({ x: p.x, y: p.y, zycie: 2.5 });
          cz.dodaj(p.x, p.y, 6, ['#d8c3a5', '#8a7a66'], u * 25, { r: u * 0.4, grawitacja: u * 60 });
          return;
        }
        hit.trafiony = 0.5;
        if (hit.swoj) {
          trafione = Math.max(0, trafione - 1);
          nap.dodaj('Swojego?! −1', p.x, p.y - u * 4, '#ff8a7a', u * 5);
          cz.dodaj(p.x, p.y, 14, ['#2e86de', '#9ad4ff'], u * 40, { r: u * 0.7 });
        } else {
          trafione++;
          nap.dodaj(glowa ? 'HEADSHOT!' : '+1', p.x, p.y - u * 4, glowa ? '#ffe34d' : '#ffffff', glowa ? u * 6 : u * 5);
          cz.dodaj(p.x, p.y, glowa ? 22 : 14, ['#ffe34d', '#ffffff', '#3cb6f7'], u * 55, { r: u * 0.7 });
          if (trafione >= cel) { koniec = true; env.wygrana(); }
        }
      }

      return {
        krok: function (dt) {
          czas += dt;
          bus.x += bus.v * dt;
          if (bus.x > W + u * 20) bus.x = -u * 20;
          chmury.forEach(function (c) { c.x += c.v * dt; if (c.x > W + c.r * 3) c.x = -c.r * 3; });
          odrzut = Math.max(0, odrzut - dt * 6);
          blysk = Math.max(0, blysk - dt);
          wstrzas = Math.max(0, wstrzas - dt * u * 8);
          cz.krok(dt);
          nap.krok(dt);
          for (var d = dziury.length - 1; d >= 0; d--) { dziury[d].zycie -= dt; if (dziury[d].zycie <= 0) dziury.splice(d, 1); }
          if (koniec) return;
          doWroga -= dt;
          var aktywne = postacie.filter(function (c) { return !c.trafiony; }).length;
          if (doWroga <= 0 && aktywne < naraz) { nowaPostac(); doWroga = coIle * los(0.7, 1.3); }
          for (var i = postacie.length - 1; i >= 0; i--) {
            var c = postacie[i];
            if (c.trafiony) {
              c.trafiony -= dt;
              c.faza = Math.max(0, c.faza - dt * 4);
              if (c.trafiony <= 0) { c.m.zajete = false; postacie.splice(i, 1); }
              continue;
            }
            c.zycie -= dt;
            if (c.zycie > 0) c.faza = Math.min(1, c.faza + dt * 6);
            else c.faza -= dt * 6;
            if (c.v) {
              c.dx += c.v * dt;
              if (Math.abs(c.dx) > c.m.szer * 0.4) { c.dx = zakres(c.dx, -c.m.szer * 0.4, c.m.szer * 0.4); c.v = -c.v; }
            }
            if (c.faza <= 0 && c.zycie <= 0) { c.m.zajete = false; postacie.splice(i, 1); }
          }
          if (czas >= czasGry) { koniec = true; env.przegrana('Czas minął — trafiłeś ' + trafione + ' z ' + cel + '.'); }
          else if (amunicja <= 0 && trafione < cel) { koniec = true; env.przegrana('Pusty magazynek! Trafiłeś ' + trafione + ' z ' + cel + '.'); }
        },
        rysuj: function (g) {
          g.save();
          if (wstrzas > 0) g.translate(los(-1, 1) * wstrzas, los(-1, 1) * wstrzas);
          // niebo o zachodzie
          var niebo = g.createLinearGradient(0, 0, 0, horyzont);
          niebo.addColorStop(0, '#1b2f7a');
          niebo.addColorStop(0.55, '#6d5bd0');
          niebo.addColorStop(0.85, '#ff9a6b');
          niebo.addColorStop(1, '#ffd08a');
          g.fillStyle = niebo;
          g.fillRect(-20, -20, W + 40, H + 40);
          g.fillStyle = 'rgba(255, 230, 160, 0.9)';
          g.beginPath(); g.arc(W * 0.78, horyzont - H * 0.32, u * 9, 0, 6.283); g.fill();
          g.fillStyle = 'rgba(255, 220, 230, 0.35)';
          chmury.forEach(function (c) {
            g.beginPath();
            g.arc(c.x, c.y, c.r, 0, 6.283);
            g.arc(c.x + c.r, c.y + c.r * 0.25, c.r * 0.7, 0, 6.283);
            g.arc(c.x - c.r, c.y + c.r * 0.3, c.r * 0.6, 0, 6.283);
            g.fill();
          });
          // Battle Bus z balonem
          g.save();
          g.translate(bus.x, bus.y);
          g.strokeStyle = 'rgba(0,0,0,0.5)';
          g.lineWidth = Math.max(1, u * 0.25);
          g.beginPath(); g.moveTo(-u * 2.5, -u * 1.5); g.lineTo(0, -u * 5); g.moveTo(u * 2.5, -u * 1.5); g.lineTo(0, -u * 5); g.stroke();
          g.fillStyle = '#ff4fa3';
          g.beginPath(); g.ellipse(0, -u * 6.8, u * 2.6, u * 2.9, 0, 0, 6.283); g.fill();
          g.fillStyle = '#1f6fe0';
          zaokr(g, -u * 4.5, -u * 1.5, u * 9, u * 3.6, u * 0.8); g.fill();
          g.fillStyle = '#bff0ff';
          for (var ok = 0; ok < 3; ok++) g.fillRect(-u * 3.6 + ok * u * 2.5, -u * 0.8, u * 1.6, u * 1.2);
          g.restore();
          // wzgórza w tle
          g.fillStyle = '#3b3a8a';
          g.beginPath();
          g.moveTo(0, horyzont);
          for (var x = 0; x <= W; x += W / 8) g.lineTo(x, horyzont - H * 0.18 - Math.sin(x * 0.01 + 1) * H * 0.05);
          g.lineTo(W, horyzont);
          g.fill();
          // budynki
          budynki.forEach(function (bd) {
            g.fillStyle = 'rgba(0,0,0,0.25)';
            g.fillRect(bd.x + u, bd.y + u, bd.w, bd.h);
            g.fillStyle = bd.kolor;
            g.fillRect(bd.x, bd.y, bd.w, bd.h);
            g.fillStyle = 'rgba(255,255,255,0.08)';
            for (var yy = bd.y + u * 2; yy < horyzont; yy += u * 3) g.fillRect(bd.x, yy, bd.w, u * 0.4);
            g.fillStyle = '#5b3a2e';
            g.fillRect(bd.x - u, bd.y - u * 1.2, bd.w + u * 2, u * 2);
            bd.okna.forEach(function (o) {
              g.fillStyle = '#1a1030';
              g.fillRect(o.x, o.y, o.w, o.h);
              g.fillStyle = 'rgba(255, 200, 120, 0.18)';
              g.fillRect(o.x, o.y + o.h * 0.6, o.w, o.h * 0.4);
            });
          });
          // postacie (przycięte do okna / nad dachem)
          postacie.forEach(function (c) {
            if (c.faza <= 0) return;
            var m = c.m, h = wysokoscPostaci(m);
            var x = m.x + c.dx, wys = h * c.faza;
            g.save();
            g.beginPath();
            if (m.typ === 'okno') g.rect(m.x - m.szer / 2, m.gora, m.szer, m.dol - m.gora);
            else g.rect(x - u * 8, m.gora - u * 6, u * 16, m.dol - m.gora + u * 6);
            g.clip();
            var s = Math.min(m.szer * 0.5, u * 6.5) / (u * 6.5);   // skala 0…1 względem pełnej postaci
            g.translate(x, m.dol - wys + u * 1.5 * s);
            if (c.trafiony) g.rotate((0.5 - c.trafiony) * 1.4);
            // ramiona
            g.fillStyle = c.skorka.stroj;
            zaokr(g, -u * 3.2 * s, u * 3.4 * s, u * 6.4 * s, u * 8 * s, u * 1.4 * s);
            g.fill();
            // głowa
            g.fillStyle = '#f2c79b';
            g.beginPath(); g.arc(0, u * 1.8 * s, u * 2.2 * s, 0, 6.283); g.fill();
            // hełm z przyłbicą
            g.fillStyle = c.skorka.helm;
            g.beginPath(); g.arc(0, u * 1.4 * s, u * 2.4 * s, Math.PI, 0); g.fill();
            g.fillStyle = 'rgba(160, 230, 255, 0.85)';
            g.fillRect(-u * 1.8 * s, u * 1.3 * s, u * 3.6 * s, u * 0.9 * s);
            // karabin
            g.fillStyle = '#222';
            g.fillRect(u * 1 * s, u * 5 * s, u * 5.5 * s, u * 1 * s);
            g.restore();
            if (c.swoj && c.faza > 0.6) {
              // niebieski znacznik sojusznika
              g.fillStyle = '#3cb6f7';
              g.beginPath();
              var ty = m.dol - wys - u * 2.2;
              g.moveTo(x - u * 1.6, ty - u * 2); g.lineTo(x + u * 1.6, ty - u * 2); g.lineTo(x, ty);
              g.fill();
            }
          });
          // przerwa między budynkami: ulica
          g.fillStyle = '#3d3d4a';
          g.fillRect(-20, horyzont, W + 40, H - horyzont + 20);
          g.fillStyle = '#ffe34d';
          for (var xx = 0; xx < W; xx += u * 10) g.fillRect(xx, horyzont + (H - horyzont) / 2, u * 5, u * 0.6);
          dziury.forEach(function (d) {
            g.globalAlpha = Math.min(1, d.zycie);
            g.fillStyle = '#111';
            g.beginPath(); g.arc(d.x, d.y, u * 0.7, 0, 6.283); g.fill();
          });
          g.globalAlpha = 1;
          cz.rysuj(g);
          nap.rysuj(g);
          g.restore();

          // celownik lunety
          var cx = celownik.x, cy = celownik.y - odrzut * u * 3;
          g.strokeStyle = 'rgba(255, 60, 60, 0.95)';
          g.lineWidth = Math.max(1.5, u * 0.35);
          g.beginPath();
          g.arc(cx, cy, u * 5, 0, 6.283);
          g.moveTo(cx - u * 8, cy); g.lineTo(cx - u * 2, cy);
          g.moveTo(cx + u * 2, cy); g.lineTo(cx + u * 8, cy);
          g.moveTo(cx, cy - u * 8); g.lineTo(cx, cy - u * 2);
          g.moveTo(cx, cy + u * 2); g.lineTo(cx, cy + u * 8);
          g.stroke();
          if (blysk > 0) { g.fillStyle = 'rgba(255,255,255,' + blysk * 5 + ')'; g.fillRect(0, 0, W, H); }

          // HUD
          var zostalo = Math.max(0, czasGry - czas);
          g.fillStyle = 'rgba(8, 22, 80, 0.8)';
          zaokr(g, u * 2, u * 2, W - u * 4, u * 9, u * 2.5);
          g.fill();
          napis(g, '🎯 ' + trafione + ' / ' + cel, u * 5, u * 6.5, u * 4, '#ffffff', null, 'left');
          napis(g, (zostalo < 5 ? '⏱ ' : '⏱ ') + zostalo.toFixed(1) + ' s', W / 2, u * 6.5, u * 4, zostalo < 5 ? '#ff8a7a' : '#ffe34d');
          napis(g, '🔫 ' + amunicja, W - u * 5, u * 6.5, u * 4, amunicja <= 3 ? '#ff8a7a' : '#ffffff', null, 'right');
        },
        wcisniete: function (p) { strzal(p); },
        ruch: function (p) { celownik = p; },
        najazd: function (p) { celownik = p; },
        puszczone: function () {},
        klawisz: function () {},
        podpowiedz: function () { return czas < 2.5 ? 'Stukaj we wrogów w oknach' : ''; },
        debug: function () {
          return { trafione: trafione, cel: cel, amunicja: amunicja, postacie: postacie.map(function (c) {
            var h = wysokoscPostaci(c.m) * c.faza;
            return { id: c.id, x: c.m.x + c.dx, y: c.m.dol - h * 0.4, swoj: c.swoj, faza: c.faza, trafiony: c.trafiony };
          }) };
        }
      };
    }
  };

  /* =========================================================
     FORTNITE 2 · Build fight w burzy (trudna)
     ========================================================= */
  var budowanieWBurzy = {
    nazwa: 'Build fight w burzy',
    ikona: '🔨',
    opis: [
      'Przeciągaj palcem (albo WASD), żeby biegać. Nie wychodź poza krąg burzy.',
      'Gdy wróg celuje (czerwony laser), stuknij albo naciśnij BUDUJ — ściana złapie serię (10 🪵).',
      'Zbieraj drewno. Przetrwaj do końca odliczania.'
    ],
    start: function (env) {
      var W = env.W, H = env.H, u = env.u, t = env.t;
      var min = Math.min(W, H);
      var gora = u * 13;                           // pod HUD-em
      var czasGry = lerp(20, 32, t);
      var gracz = { x: W / 2, y: (H + gora) / 2, r: u * 2.6, hp: 100, kat: -Math.PI / 2, krok: 0 };
      var cel = null, klawisze = {};
      var mat = Math.round(lerp(60, 30, t));
      var sciany = [], kule = [], drewno = [], wrogowie = [];
      var czas = 0, koniec = false, doDrewna = 1.5, blysk = 0, brakMat = 0, wstrzas = 0;
      var cz = czasteczki(), nap = napisy();
      var przycisk = { x: W - u * 11, y: H - u * 11, r: u * 8.5 };
      var burza = {
        x: W / 2, y: (H + gora) / 2, r: Math.sqrt(W * W + H * H) / 2 + u * 4,
        rMin: min * lerp(0.34, 0.2, t),
        cx: W / 2 + los(-1, 1) * min * lerp(0, 0.18, t),
        cy: (H + gora) / 2 + los(-1, 1) * min * lerp(0, 0.18, t)
      };
      burza.r0 = burza.r;
      var ilu = t < 0.5 ? 1 : 2;
      for (var i = 0; i < ilu; i++) {
        wrogowie.push({ faza: i * Math.PI + los(0, 1), strzal: lerp(1.6, 1.0, t) + i * 0.7, seria: 0, doKuli: 0, ostrz: 0, x: 0, y: 0, blysk: 0, skorka: wybierz(SKORKI) });
      }
      var przerwa = lerp(2.4, 1.4, t);
      var wSerii = 3 + Math.round(t * 2);
      var predkoscKuli = u * lerp(42, 70, t);
      // ozdoby: krzaki i kamienie (tylko wygląd)
      var ozdoby = [];
      for (var o = 0; o < 14; o++) ozdoby.push({ x: los(0, W), y: los(gora, H), r: los(u * 1.5, u * 3.5), typ: Math.random() < 0.6 ? 'krzak' : 'kamien' });
      var plamy = [];
      for (var q = 0; q < 10; q++) plamy.push({ x: los(0, W), y: los(0, H), r: los(u * 8, u * 20) });

      function pozycjaWroga(w) {
        // biega po obwodzie areny
        var a = w.faza;
        var sx = W / 2, sy = (H + gora) / 2;
        var rx = W / 2 - u * 4, ry = (H - gora) / 2 - u * 4;
        var c = Math.cos(a), s = Math.sin(a);
        var k = 1 / Math.max(Math.abs(c) / rx, Math.abs(s) / ry);
        w.x = sx + c * k;
        w.y = sy + s * k;
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
        if (mat < 10) { brakMat = 0.8; return; }
        var w = najblizszy();
        var dx = w.x - gracz.x, dy = w.y - gracz.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= d; dy /= d;
        mat -= 10;
        sciany.push({
          x: gracz.x + dx * u * 6, y: gracz.y + dy * u * 6,
          px: -dy, py: dx, dl: u * 7, hp: 3, zycie: 4.5, wzrost: 0
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

      function wPrzycisku(p) {
        var dx = p.x - przycisk.x, dy = p.y - przycisk.y;
        return dx * dx + dy * dy < przycisk.r * przycisk.r * 1.2;
      }

      function rysujPostac(g, x, y, kat, stroj, helm, krok, r) {
        g.save();
        g.translate(x, y);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath(); g.ellipse(r * 0.2, r * 0.35, r * 1.1, r * 0.8, 0, 0, 6.283); g.fill();
        g.rotate(kat);
        // nogi (kroki)
        var nk = Math.sin(krok) * r * 0.5;
        g.fillStyle = '#2b2b38';
        g.fillRect(-r * 0.6 + nk, -r * 0.75, r * 0.7, r * 0.45);
        g.fillRect(-r * 0.6 - nk, r * 0.3, r * 0.7, r * 0.45);
        // tułów
        g.fillStyle = stroj;
        g.beginPath(); g.ellipse(0, 0, r * 0.8, r * 1.05, 0, 0, 6.283); g.fill();
        // karabin
        g.fillStyle = '#1b1b22';
        g.fillRect(r * 0.3, r * 0.2, r * 1.6, r * 0.32);
        // głowa z hełmem
        g.fillStyle = helm;
        g.beginPath(); g.arc(r * 0.1, 0, r * 0.62, 0, 6.283); g.fill();
        g.fillStyle = 'rgba(160, 230, 255, 0.9)';
        g.fillRect(r * 0.35, -r * 0.3, r * 0.28, r * 0.6);
        g.restore();
      }

      return {
        krok: function (dt) {
          cz.krok(dt);
          nap.krok(dt);
          blysk = Math.max(0, blysk - dt);
          brakMat = Math.max(0, brakMat - dt);
          wstrzas = Math.max(0, wstrzas - dt * u * 6);
          if (koniec) return;
          czas += dt;
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
            gracz.y = zakres(gracz.y + vy / vd * u * 36 * dt, gora + gracz.r, H - gracz.r);
            gracz.krok += dt * 14;
          }
          var wr = najblizszy();
          if (wr) gracz.kat = Math.atan2(wr.y - gracz.y, wr.x - gracz.x);
          // burza
          var f = Math.min(1, czas / (czasGry * 0.85));
          burza.r = lerp(burza.r0, burza.rMin, f);
          burza.x = lerp(W / 2, burza.cx, f);
          burza.y = lerp((H + gora) / 2, burza.cy, f);
          var bx = gracz.x - burza.x, by = gracz.y - burza.y;
          if (bx * bx + by * by > burza.r * burza.r) {
            gracz.hp -= lerp(10, 16, t) * dt;
            if (Math.random() < dt * 8) cz.dodaj(gracz.x, gracz.y, 1, ['#c77dff', '#e0aaff'], u * 10, { r: u * 0.6 });
          }
          // drewno
          doDrewna -= dt;
          if (doDrewna <= 0 && drewno.length < 3) {
            var a = los(0, 6.283), r = los(0, burza.r * 0.8);
            drewno.push({ x: zakres(burza.x + Math.cos(a) * r, u * 4, W - u * 4), y: zakres(burza.y + Math.sin(a) * r, gora + u * 4, H - u * 4), faza: los(0, 6) });
            doDrewna = lerp(2.2, 4.2, t);
          }
          for (var i = drewno.length - 1; i >= 0; i--) {
            var dd = drewno[i];
            dd.faza += dt * 4;
            if (Math.abs(dd.x - gracz.x) < u * 3.5 && Math.abs(dd.y - gracz.y) < u * 3.5) {
              drewno.splice(i, 1); mat += 20;
              nap.dodaj('+20 🪵', dd.x, dd.y - u * 3, '#ffe34d', u * 3.6);
              cz.dodaj(dd.x, dd.y, 8, ['#c99356', '#8b5a2b'], u * 25, { r: u * 0.6 });
            }
          }
          // wrogowie i serie
          wrogowie.forEach(function (w) {
            w.faza += dt * lerp(0.12, 0.3, t);
            w.blysk = Math.max(0, w.blysk - dt);
            pozycjaWroga(w);
            if (w.seria > 0) {
              w.doKuli -= dt;
              if (w.doKuli <= 0) {
                w.seria--;
                w.doKuli = 0.13;
                w.blysk = 0.06;
                var kx = gracz.x - w.x, ky = gracz.y - w.y, kd = Math.sqrt(kx * kx + ky * ky) || 1;
                var rozrzut = los(-1, 1) * 0.06;
                var c = Math.cos(rozrzut), s = Math.sin(rozrzut);
                var nx = kx / kd, ny = ky / kd;
                kule.push({ x: w.x, y: w.y, vx: (nx * c - ny * s) * predkoscKuli, vy: (nx * s + ny * c) * predkoscKuli });
              }
            } else {
              w.strzal -= dt;
              w.ostrz = w.strzal < 0.45 ? 1 : 0;   // laser przed serią
              if (w.strzal <= 0) { w.seria = wSerii; w.doKuli = 0; w.strzal = przerwa * los(0.85, 1.15); }
            }
          });
          // kule
          for (var k = kule.length - 1; k >= 0; k--) {
            var b = kule[k];
            b.x += b.vx * dt; b.y += b.vy * dt;
            var zbita = false;
            for (var j = 0; j < sciany.length; j++) {
              if (trafiaSciane(sciany[j], b.x, b.y)) {
                sciany[j].hp--; zbita = true;
                cz.dodaj(b.x, b.y, 7, ['#c99356', '#8b5a2b', '#e8c48a'], u * 30, { r: u * 0.5, kwadrat: true });
                break;
              }
            }
            if (!zbita) {
              var gx = b.x - gracz.x, gy = b.y - gracz.y;
              if (gx * gx + gy * gy < gracz.r * gracz.r * 1.3) {
                var obr = lerp(8, 8.5, t);
                gracz.hp -= obr; zbita = true; blysk = 0.25; wstrzas = u * 1.2;
                nap.dodaj('−' + Math.round(obr), gracz.x, gracz.y - u * 4, '#ff8a7a', u * 3.6);
                cz.dodaj(b.x, b.y, 8, ['#ff5a4a', '#ffd0c8'], u * 30, { r: u * 0.5 });
              }
            }
            if (zbita || b.x < -20 || b.y < -20 || b.x > W + 20 || b.y > H + 20) kule.splice(k, 1);
          }
          for (var m = sciany.length - 1; m >= 0; m--) {
            var sc = sciany[m];
            sc.zycie -= dt;
            sc.wzrost = Math.min(1, sc.wzrost + dt * 8);
            if (sc.hp <= 0) cz.dodaj(sc.x, sc.y, 14, ['#c99356', '#8b5a2b'], u * 35, { r: u * 0.7, kwadrat: true });
            if (sc.hp <= 0 || sc.zycie <= 0) sciany.splice(m, 1);
          }
          if (gracz.hp <= 0) {
            gracz.hp = 0;
            koniec = true;
            cz.dodaj(gracz.x, gracz.y, 30, ['#3cb6f7', '#ffffff', '#1f6fe0'], u * 50, { r: u * 0.8 });
            env.przegrana('Wyeliminowany! Burza i spocone lobby wygrały.');
          } else if (czas >= czasGry) {
            koniec = true;
            env.wygrana();
          }
        },
        rysuj: function (g) {
          g.save();
          if (wstrzas > 0) g.translate(los(-1, 1) * wstrzas, los(-1, 1) * wstrzas);
          // łąka
          g.fillStyle = '#58b04a';
          g.fillRect(-20, -20, W + 40, H + 40);
          plamy.forEach(function (p) {
            g.fillStyle = 'rgba(40, 110, 40, 0.18)';
            g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
          });
          ozdoby.forEach(function (o) {
            if (o.typ === 'krzak') {
              g.fillStyle = '#2f7d32';
              g.beginPath(); g.arc(o.x, o.y, o.r, 0, 6.283); g.arc(o.x + o.r * 0.7, o.y + o.r * 0.2, o.r * 0.7, 0, 6.283); g.fill();
              g.fillStyle = 'rgba(255,255,255,0.12)';
              g.beginPath(); g.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.4, 0, 6.283); g.fill();
            } else {
              g.fillStyle = '#8d8f99';
              g.beginPath(); g.ellipse(o.x, o.y, o.r, o.r * 0.7, 0.3, 0, 6.283); g.fill();
              g.fillStyle = 'rgba(255,255,255,0.18)';
              g.beginPath(); g.ellipse(o.x - o.r * 0.3, o.y - o.r * 0.2, o.r * 0.4, o.r * 0.25, 0.3, 0, 6.283); g.fill();
            }
          });
          // drewno z poświatą
          drewno.forEach(function (d) {
            var bob = Math.sin(d.faza) * u * 0.6;
            g.fillStyle = 'rgba(255, 227, 77, 0.25)';
            g.beginPath(); g.arc(d.x, d.y, u * 4 + Math.sin(d.faza) * u * 0.5, 0, 6.283); g.fill();
            g.save();
            g.translate(d.x, d.y + bob);
            g.fillStyle = '#8b5a2b';
            zaokr(g, -u * 2.4, -u * 1.5, u * 4.8, u * 1.4, u * 0.6); g.fill();
            zaokr(g, -u * 1.8, u * 0.1, u * 4.8, u * 1.4, u * 0.6); g.fill();
            g.fillStyle = '#e0b57a';
            g.beginPath(); g.arc(u * 2.4, -u * 0.8, u * 0.7, 0, 6.283); g.arc(u * 3, u * 0.8, u * 0.7, 0, 6.283); g.fill();
            g.restore();
          });
          // lasery ostrzegawcze
          wrogowie.forEach(function (w) {
            if (!w.ostrz) return;
            g.strokeStyle = 'rgba(255, 40, 40,' + (0.35 + Math.sin(czas * 40) * 0.2) + ')';
            g.lineWidth = Math.max(1.5, u * 0.35);
            g.setLineDash([u * 1.5, u * 1]);
            g.beginPath(); g.moveTo(w.x, w.y); g.lineTo(gracz.x, gracz.y); g.stroke();
            g.setLineDash([]);
          });
          // ściany: drewniane panele
          sciany.forEach(function (s) {
            g.save();
            g.globalAlpha = Math.min(1, s.zycie * 2);
            g.translate(s.x, s.y);
            g.rotate(Math.atan2(s.py, s.px));
            var dl = s.dl * s.wzrost, gr = u * 1.9;
            g.fillStyle = s.hp >= 3 ? '#b27b45' : s.hp === 2 ? '#9a6536' : '#7a4a24';
            g.fillRect(-dl, -gr / 2, dl * 2, gr);
            g.strokeStyle = '#5a3414';
            g.lineWidth = Math.max(1, u * 0.3);
            g.strokeRect(-dl, -gr / 2, dl * 2, gr);
            for (var d = -dl + u * 2.3; d < dl; d += u * 2.3) { g.beginPath(); g.moveTo(d, -gr / 2); g.lineTo(d, gr / 2); g.stroke(); }
            if (s.hp < 3) {
              g.strokeStyle = '#2a1608';
              g.beginPath(); g.moveTo(-u, -gr / 2); g.lineTo(u * 0.5, 0); g.lineTo(-u * 0.3, gr / 2); g.stroke();
            }
            g.restore();
          });
          // wrogowie
          wrogowie.forEach(function (w) {
            var kat = Math.atan2(gracz.y - w.y, gracz.x - w.x);
            rysujPostac(g, w.x, w.y, kat, w.skorka.stroj, w.skorka.helm, czas * 10, u * 2.6);
            if (w.blysk > 0) {
              g.fillStyle = '#fff3a0';
              g.beginPath(); g.arc(w.x + Math.cos(kat) * u * 5, w.y + Math.sin(kat) * u * 5, u * 1.3, 0, 6.283); g.fill();
            }
            if (w.ostrz) napis(g, '!', w.x, w.y - u * 5, u * 5, '#ff3b3b', '#ffffff');
          });
          // kule ze smugą
          kule.forEach(function (b) {
            var n = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
            g.strokeStyle = 'rgba(255, 227, 77, 0.55)';
            g.lineWidth = u * 0.6;
            g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx / n * u * 4, b.y - b.vy / n * u * 4); g.stroke();
            g.fillStyle = '#fff6b0';
            g.beginPath(); g.arc(b.x, b.y, u * 0.6, 0, 6.283); g.fill();
          });
          // gracz
          if (!(koniec && gracz.hp <= 0)) {
            rysujPostac(g, gracz.x, gracz.y, gracz.kat, blysk > 0 ? '#ff8a7a' : '#1f6fe0', '#0b2a8c', gracz.krok, gracz.r);
          }
          // burza: fiolet poza kręgiem, prostokąt zgodnie z zegarem, krąg przeciwnie
          g.beginPath();
          g.moveTo(-20, -20); g.lineTo(W + 20, -20); g.lineTo(W + 20, H + 20); g.lineTo(-20, H + 20); g.closePath();
          // uwaga: arc(…, 0, 2π, true) to w canvasie okrąg zerowej długości —
          // pełny okrąg „pod prąd” trzeba rysować od 2π do 0
          g.moveTo(burza.x + burza.r, burza.y);
          g.arc(burza.x, burza.y, burza.r, Math.PI * 2, 0, true);
          g.closePath();
          g.fillStyle = 'rgba(110, 30, 190, 0.45)';
          g.fill();
          for (var fala = 0; fala < 3; fala++) {
            g.strokeStyle = 'rgba(220, 170, 255,' + (0.5 - fala * 0.15) + ')';
            g.lineWidth = u * (0.8 - fala * 0.2);
            g.beginPath();
            g.arc(burza.x, burza.y, burza.r + fala * u * 1.4 + Math.sin(czas * 3 + fala) * u * 0.4, 0, 6.283);
            g.stroke();
          }
          cz.rysuj(g);
          nap.rysuj(g);
          g.restore();

          // przycisk BUDUJ
          var gotowy = mat >= 10;
          g.fillStyle = gotowy ? 'rgba(255, 227, 77, 0.92)' : 'rgba(80, 80, 100, 0.75)';
          g.beginPath(); g.arc(przycisk.x, przycisk.y, przycisk.r, 0, 6.283); g.fill();
          g.strokeStyle = brakMat > 0 ? '#ff3b3b' : '#0a1646';
          g.lineWidth = u * 0.7;
          g.stroke();
          napis(g, '🧱', przycisk.x, przycisk.y - u * 1.8, u * 4.5, '#000');
          napis(g, 'BUDUJ', przycisk.x, przycisk.y + u * 3, u * 2.4, gotowy ? '#1c1400' : '#ddd', null, 'center', 900);

          // HUD
          var zostalo = Math.max(0, czasGry - czas);
          g.fillStyle = 'rgba(8, 22, 80, 0.82)';
          zaokr(g, u * 2, u * 2, W - u * 4, u * 9.5, u * 2.5);
          g.fill();
          napis(g, '⏱ ' + zostalo.toFixed(1) + ' s', W / 2, u * 5, u * 3.8, zostalo < 5 ? '#7dff9a' : '#ffffff');
          napis(g, '🪵 ' + mat, W - u * 5, u * 5, u * 3.6, brakMat > 0 ? '#ff8a7a' : '#ffe34d', null, 'right');
          var sz = W - u * 8;
          g.fillStyle = 'rgba(255,255,255,0.18)';
          zaokr(g, u * 4, u * 8, sz, u * 2, u);
          g.fill();
          g.fillStyle = gracz.hp > 40 ? '#5ee06a' : '#ff5a4a';
          zaokr(g, u * 4, u * 8, Math.max(u * 2, sz * gracz.hp / 100), u * 2, u);
          g.fill();
          napis(g, '❤ ' + Math.ceil(gracz.hp), u * 5, u * 5, u * 3.6, '#ffffff', null, 'left');
        },
        wcisniete: function (p) {
          if (wPrzycisku(p)) { zbuduj(); return; }
          cel = p;
        },
        ruch: function (p) { if (cel) cel = p; },
        puszczone: function (p, stukniecie) {
          var byl = cel;
          cel = null;
          if (stukniecie && byl && !(p && wPrzycisku(p))) zbuduj();
        },
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
    fortnite: [snajper, budowanieWBurzy]
  };

  /* =========================================================
     Ramka: ekran startowy, odliczanie, pętla, wynik, blokada
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
    if (!lista || !(ile > 0)) return null;
    var trudna = ile > PROG;
    var t = trudna ? (ile - PROG - 1) / (MAKS - PROG - 1) : (ile - 1) / (PROG - 1);
    return { gra: lista[trudna ? 1 : 0], t: zakres(t, 0, 1), trudna: trudna };
  }

  // strefy na suwaku kwoty w oknie wpłaty
  function strefy(kat) {
    var lista = GRY[kat];
    if (!lista) return null;
    return [
      { od: 1, do: PROG, gra: lista[0], trudna: false },
      { od: PROG + 1, do: MAKS, gra: lista[1], trudna: true }
    ];
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
    var tytul = el('div', 'minigra-tytul');
    tytul.appendChild(el('span', 'minigra-tytul-ikona', gra.ikona));
    tytul.appendChild(el('span', null, gra.nazwa));
    var stawka = el('div', 'minigra-stawka', opcje.kwotaTekst);
    var btnX = el('button', 'minigra-x', '×');
    btnX.type = 'button';
    btnX.setAttribute('aria-label', 'Zrezygnuj');
    gora.appendChild(tytul);
    gora.appendChild(stawka);
    gora.appendChild(btnX);
    var scena = el('div', 'minigra-scena');
    var plotno = el('canvas', 'minigra-plotno');
    var podp = el('div', 'minigra-podpowiedz');
    var licznik = el('div', 'minigra-odliczanie');
    scena.appendChild(plotno);
    scena.appendChild(podp);
    scena.appendChild(licznik);
    var panel = el('div', 'minigra-panel');
    scena.appendChild(panel);
    nak.appendChild(gora);
    nak.appendChild(scena);
    document.body.appendChild(nak);
    document.documentElement.classList.add('minigra-otwarta');

    var g = plotno.getContext('2d');
    var W = 0, H = 0, dpr = 1;
    var stan = null, instancja = null, rafId = 0, ostatni = 0, zamknieta = false, odliczanie = 0, doStartu = 0;
    var konfetti = czasteczki();

    function rozmiar() {
      // offsetWidth, nie getBoundingClientRect — ta druga liczy też animację wejścia (scale)
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(200, scena.offsetWidth);
      H = Math.max(200, scena.offsetHeight);
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

    function pokazPanel(tresc, klasa) {
      panel.textContent = '';
      panel.className = 'minigra-panel' + (klasa ? ' ' + klasa : '');
      tresc.forEach(function (x) { panel.appendChild(x); });
      panel.hidden = false;
    }

    function pasekTrudnosci() {
      var box = el('div', 'minigra-trudnosc');
      var napisT = el('div', 'minigra-trudnosc-napis');
      napisT.appendChild(el('span', null, 'Trudność'));
      napisT.appendChild(el('b', null, nazwaTrudnosci(wybor.t, wybor.trudna)));
      var pas = el('div', 'minigra-trudnosc-pas');
      var wyp = el('i');
      wyp.style.width = Math.round(8 + wybor.t * 92) + '%';
      if (wybor.trudna) wyp.classList.add('trudna');
      pas.appendChild(wyp);
      box.appendChild(napisT);
      box.appendChild(pas);
      return box;
    }

    function ekranStartu() {
      stan = 'start';
      var ikona = el('div', 'minigra-panel-ikona', gra.ikona);
      var h = el('h3', 'minigra-panel-tytul', gra.nazwa);
      var za = el('p', 'minigra-panel-nad');
      za.appendChild(document.createTextNode('Stawka: '));
      za.appendChild(el('b', null, opcje.kwotaTekst));
      za.appendChild(document.createTextNode(' dla ' + opcje.dla));
      var lista = el('ol', 'minigra-opis');
      gra.opis.forEach(function (o) { lista.appendChild(el('li', null, o)); });
      var przyciski = el('div', 'minigra-przyciski');
      var btnGraj = el('button', 'minigra-btn glowny', 'Walcz!');
      btnGraj.type = 'button';
      var nie = el('button', 'minigra-btn', 'Wróć');
      nie.type = 'button';
      btnGraj.addEventListener('click', startuj);
      nie.addEventListener('click', rezygnuj);
      przyciski.appendChild(nie);
      przyciski.appendChild(btnGraj);
      pokazPanel([ikona, h, za, pasekTrudnosci(), lista, przyciski], 'start');
      setTimeout(function () { btnGraj.focus(); }, 30);
    }

    function startuj() {
      panel.hidden = true;
      rozmiar();
      var u = Math.min(W, H) / 100;
      instancja = gra.start({
        W: W, H: H, u: u, t: wybor.t,
        wygrana: function () { stan = 'wynik'; setTimeout(wygrana, 450); },
        przegrana: function (powod) { stan = 'wynik'; setTimeout(function () { przegrana(powod); }, 650); }
      });
      stan = 'odliczanie';
      doStartu = 3;
      licznik.textContent = '3';
      licznik.hidden = false;
      ostatni = performance.now();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(petla);
    }

    function petla(teraz) {
      if (zamknieta) return;
      var dt = Math.min(0.05, (teraz - ostatni) / 1000);
      ostatni = teraz;
      if (instancja) {
        if (stan === 'odliczanie') {
          var przed = Math.ceil(doStartu);
          doStartu -= dt;
          var po = Math.ceil(doStartu);
          if (doStartu <= 0) {
            stan = 'gra';
            licznik.textContent = 'START!';
            licznik.classList.remove('pulsuj');
            void licznik.offsetWidth;
            licznik.classList.add('pulsuj');
            setTimeout(function () { if (stan !== 'odliczanie') licznik.hidden = true; }, 500);
          } else if (po !== przed) {
            licznik.textContent = String(po);
            licznik.classList.remove('pulsuj');
            void licznik.offsetWidth;
            licznik.classList.add('pulsuj');
          }
        } else {
          instancja.krok(dt);
        }
        konfetti.krok(dt);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        instancja.rysuj(g);
        konfetti.rysuj(g);
        podp.textContent = stan === 'gra' && instancja.podpowiedz ? instancja.podpowiedz() : '';
      }
      rafId = requestAnimationFrame(petla);
    }

    function wygrana() {
      if (zamknieta) return;
      for (var i = 0; i < 4; i++) {
        konfetti.dodaj(W * (0.2 + i * 0.2), H * 0.35, 30, ['#ffe34d', '#3cb6f7', '#ff4fa3', '#7dff9a', '#ffffff'], Math.min(W, H) * 0.9,
          { r: Math.min(W, H) / 110, grawitacja: Math.min(W, H) * 0.9, wGore: Math.min(W, H) * 0.5, zycie: 2.2, kwadrat: true });
      }
      var ikona = el('div', 'minigra-panel-ikona', '🏆');
      var h = el('h3', 'minigra-panel-tytul wygrana', 'Victory Royale!');
      var p = el('p', 'minigra-panel-nad');
      p.appendChild(el('b', null, opcje.kwotaTekst));
      p.appendChild(document.createTextNode(' leci do: ' + opcje.dla));
      pokazPanel([ikona, h, p], 'wynik');
      var r = panel.getBoundingClientRect();
      var start = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      setTimeout(function () {
        zamknij();
        opcje.naWygrana(start);
      }, 1700);
    }

    function przegrana(powod) {
      if (zamknieta) return;
      ustawBlokade();
      var ikona = el('div', 'minigra-panel-ikona', '💀');
      var h = el('h3', 'minigra-panel-tytul przegrana', 'Wyeliminowany');
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
      pokazPanel([ikona, h, p, info, przyciski], 'wynik');
      function odswiez() {
        var s = pozostalaBlokada();
        znowu.disabled = s > 0;
        znowu.textContent = s > 0 ? 'Rewanż za ' + s + ' s' : 'Rewanż!';
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
      return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
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
      if (!instancja || stan !== 'gra') return;
      var p = punkt(e);
      if (!dotyk) { if (instancja.najazd && e.pointerType === 'mouse') instancja.najazd(p); return; }
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
      var obrot = (scena.offsetWidth > scena.offsetHeight) !== (W > H);
      if ((stan === 'gra' || stan === 'odliczanie') && obrot) startuj();
      else if (stan !== 'gra' && stan !== 'odliczanie') rozmiar();
    }
    window.addEventListener('keydown', naKlawisz);
    window.addEventListener('keyup', naKlawisz);
    window.addEventListener('resize', naResize);
    btnX.addEventListener('click', rezygnuj);

    licznik.hidden = true;
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
    strefy: strefy,
    nazwaTrudnosci: nazwaTrudnosci,
    pozostalaBlokada: pozostalaBlokada,
    PROG: PROG,
    MAKS: MAKS,
    _gry: GRY              // tylko testy
  };
})();
