/* ============================================================
   Zrzutka — logika i animacje obu kategorii
   - dwie kategorie (Fortnite / 0 A.D.) przełączane przez #hash
   - kwoty, wpłaty, odznaki i zaczepki zapisują się w localStorage
   - monety lecą do licznika karty (Web Animations API),
     portrety reagują dymkami, a po zdobyciu celu jest ekran zwycięstwa
   ============================================================ */

(function () {
  'use strict';

  var DANE = window.ZRZUTKA_DANE;
  if (!DANE) return;
  var KAT = DANE.kategorie;

  var KLUCZ = 'zrzutka-v2';
  var SEZON = 2;                // nowy sezon = wyzerowane sumy i „moje” wpłaty; odznaki zostają
  var KLUCZ_V1 = 'vdolce-zrzutka-v1';
  var KLUCZ_NICK = 'zrzutka-nick';
  var KLUCZ_DZWIEK = 'zrzutka-dzwiek';
  var MAX_WPLAT = 40;
  var HASH = { fortnite: '#fortnite', zeroad: '#0ad' };
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var html = document.documentElement;

  var mniejRuchu = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var animowac = typeof html.animate === 'function' && !mniejRuchu;

  /* ---------------------------------------------------------
     Drobiazgi
     --------------------------------------------------------- */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function los(a, b) { return a + Math.random() * (b - a); }

  // 13500 -> "13 500" (twarda spacja, żeby liczba się nie łamała)
  function fmt(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // 1 V-dolec, 2 V-dolce, 5 V-dolców (tak samo srebrniki)
  function odmiana(kat, n) {
    var f = KAT[kat].formy;
    if (n === 1) return f[0];
    var j = n % 10, d = n % 100;
    if (j >= 2 && j <= 4 && (d < 12 || d > 14)) return f[1];
    return f[2];
  }

  function rzymska(n) {
    var cyfry = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    var w = '';
    cyfry.forEach(function (c) { while (n >= c[0]) { w += c[1]; n -= c[0]; } });
    return w;
  }

  function ikona(id, klasa) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    if (klasa) svg.setAttribute('class', klasa);
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  function elem(tag, klasa, tekst) {
    var e = document.createElement(tag);
    if (klasa) e.className = klasa;
    if (tekst != null) e.textContent = tekst;
    return e;
  }

  function srodek(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // restart animacji CSS przypiętej do klasy
  function odpal(el, klasa) {
    el.classList.remove(klasa);
    void el.offsetWidth;
    el.classList.add(klasa);
  }

  // losuje element tablicy, ale nie ten sam co ostatnio
  function losujInny(tablica, ostatni) {
    if (tablica.length < 2) return 0;
    var nr;
    do { nr = Math.floor(Math.random() * tablica.length); } while (nr === ostatni);
    return nr;
  }

  function czytajUstawienie(klucz) {
    try { return localStorage.getItem(klucz); } catch (e) { return null; }
  }

  function zapiszUstawienie(klucz, wartosc) {
    try { localStorage.setItem(klucz, wartosc); } catch (e) { /* trudno */ }
  }

  /* ---------------------------------------------------------
     Stan (localStorage bywa zablokowany — wtedy działa bez zapisu)
     --------------------------------------------------------- */

  var odznakaPoId = {};
  DANE.odznaki.forEach(function (o) { odznakaPoId[o.id] = o; });

  function pustyStan() {
    // sumy — wspólne (z serwera, a bez niego lokalne); moje — tylko wpłaty
    // z tej przeglądarki, z nich liczą się odznaki i tytuły sponsora
    var s = { sezon: SEZON, sumy: {}, moje: {}, wplaty: [], odznaki: {}, zaczepki: 0 };
    Object.keys(KAT).forEach(function (kat) {
      s.sumy[kat] = {};
      s.moje[kat] = {};
      Object.keys(KAT[kat].gracze).forEach(function (id) { s.sumy[kat][id] = 0; s.moje[kat][id] = 0; });
    });
    return s;
  }

  function poprawnaWplata(w) {
    return w && KAT[w.kat] && KAT[w.kat].gracze[w.komu] &&
      isFinite(w.ile) && w.ile > 0 && typeof w.kto === 'string' &&
      (w.msg == null || typeof w.msg === 'string');
  }

  function wczytaj() {
    var s = pustyStan();
    try {
      var z = JSON.parse(localStorage.getItem(KLUCZ));
      if (z && typeof z === 'object') {
        // zapis sprzed wspólnych sum nie ma „moje” — wtedy wszystko było własne
        var moje = z.moje && typeof z.moje === 'object' ? z.moje : z.sumy;
        // zapis z poprzedniego sezonu: bierzemy tylko odznaki i zaczepki
        var tenSezon = z.sezon === SEZON;
        if (tenSezon) Object.keys(s.sumy).forEach(function (kat) {
          Object.keys(s.sumy[kat]).forEach(function (id) {
            var v = Number(z.sumy && z.sumy[kat] && z.sumy[kat][id]);
            if (isFinite(v) && v > 0) s.sumy[kat][id] = Math.floor(v);
            var m = Number(moje && moje[kat] && moje[kat][id]);
            if (isFinite(m) && m > 0) s.moje[kat][id] = Math.floor(m);
          });
        });
        if (tenSezon && Array.isArray(z.wplaty)) s.wplaty = z.wplaty.filter(poprawnaWplata).slice(0, MAX_WPLAT);
        if (z.odznaki && typeof z.odznaki === 'object') {
          Object.keys(z.odznaki).forEach(function (id) {
            if (odznakaPoId[id]) s.odznaki[id] = Number(z.odznaki[id]) || Date.now();
          });
        }
        s.zaczepki = Math.max(0, Math.floor(Number(z.zaczepki) || 0));
        return s;
      }

      // pierwsza wersja strony miała tylko Fortnite — przenosimy jej wpłaty
      var v1 = JSON.parse(localStorage.getItem(KLUCZ_V1));
      if (v1 && v1.sumy) {
        Object.keys(s.sumy.fortnite).forEach(function (id) {
          var v = Number(v1.sumy[id]);
          if (isFinite(v) && v > 0) s.sumy.fortnite[id] = s.moje.fortnite[id] = Math.floor(v);
        });
        if (Array.isArray(v1.wplaty)) {
          s.wplaty = v1.wplaty.map(function (w) {
            return w && { kat: 'fortnite', komu: w.komu, ile: w.ile, kto: w.kto, t: w.t };
          }).filter(poprawnaWplata).slice(0, MAX_WPLAT);
        }
      }
    } catch (e) { /* brak zapisu albo zepsuty JSON */ }
    return s;
  }

  function zapisz() {
    try { localStorage.setItem(KLUCZ, JSON.stringify(stan)); } catch (e) { /* trudno */ }
  }

  var stan = wczytaj();

  function sumaKat(kat, zrodlo) {
    var s = (zrodlo || stan.sumy)[kat];
    return Object.keys(s).reduce(function (a, id) { return a + s[id]; }, 0);
  }

  function sumaMoje(kat) { return sumaKat(kat, stan.moje); }

  /* ---------------------------------------------------------
     Liczniki, które płynnie dojeżdżają do wartości
     --------------------------------------------------------- */

  var aktywneLiczniki = [];
  var ostatniaKlatka = 0;

  function Licznik(el, wartosc) {
    this.el = el;
    this.cel = wartosc;
    this.pokazana = wartosc;
    if (el) el.textContent = fmt(wartosc);
  }

  Licznik.prototype.ustaw = function (v, odRazu) {
    this.cel = v;
    if (!this.el) return;
    if (odRazu || !animowac) {
      this.pokazana = v;
      this.el.textContent = fmt(v);
      return;
    }
    if (aktywneLiczniki.indexOf(this) < 0) aktywneLiczniki.push(this);
    if (aktywneLiczniki.length === 1) {
      ostatniaKlatka = performance.now();
      requestAnimationFrame(krokLicznikow);
    }
  };

  Licznik.prototype.dodaj = function (ile) { this.ustaw(this.cel + ile); };

  function krokLicznikow(t) {
    var dt = Math.min(64, t - ostatniaKlatka);
    ostatniaKlatka = t;
    var k = 1 - Math.pow(0.8, dt / 16.67);
    aktywneLiczniki = aktywneLiczniki.filter(function (l) {
      var roznica = l.cel - l.pokazana;
      if (Math.abs(roznica) < 0.5) {
        l.pokazana = l.cel;
        l.el.textContent = fmt(l.cel);
        return false;
      }
      l.pokazana += roznica * k;
      l.el.textContent = fmt(l.pokazana);
      return true;
    });
    if (aktywneLiczniki.length) requestAnimationFrame(krokLicznikow);
  }

  /* ---------------------------------------------------------
     Dźwięki (syntezowane, bez plików)
     --------------------------------------------------------- */

  var dzwiekWl = czytajUstawienie(KLUCZ_DZWIEK) !== '0';
  var audio = null;
  var buforSzumu = null;

  function kontekstAudio() {
    if (!dzwiekWl) return null;
    if (!audio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { audio = new AC(); } catch (e) { return null; }
    }
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }

  function obwiednia(a, g, t, glosnosc, dlugosc) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(glosnosc, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dlugosc);
  }

  function ton(a, czest, start, dlugosc, glosnosc, typ) {
    var t = a.currentTime + start;
    var o = a.createOscillator();
    var g = a.createGain();
    o.type = typ || 'square';
    o.frequency.setValueAtTime(czest, t);
    obwiednia(a, g, t, glosnosc, dlugosc);
    o.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + dlugosc + 0.05);
  }

  function szum(a, start, dlugosc, glosnosc, typFiltra, czest, q, czestKoniec) {
    if (!buforSzumu) {
      var n = Math.floor(a.sampleRate * 0.6);
      buforSzumu = a.createBuffer(1, n, a.sampleRate);
      var d = buforSzumu.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = a.currentTime + start;
    var zr = a.createBufferSource();
    zr.buffer = buforSzumu;
    var f = a.createBiquadFilter();
    f.type = typFiltra;
    f.frequency.setValueAtTime(czest, t);
    if (czestKoniec) f.frequency.exponentialRampToValueAtTime(czestKoniec, t + dlugosc);
    f.Q.value = q || 1;
    var g = a.createGain();
    obwiednia(a, g, t, glosnosc, dlugosc);
    zr.connect(f);
    f.connect(g);
    g.connect(a.destination);
    zr.start(t);
    zr.stop(t + dlugosc + 0.05);
  }

  function rog(a, czest, start, dlugosc, glosnosc) {
    var t = a.currentTime + start;
    var o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(czest * 0.97, t);
    o.frequency.linearRampToValueAtTime(czest, t + 0.08);
    var f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(600, t);
    f.frequency.linearRampToValueAtTime(1700, t + 0.15);
    var g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(glosnosc, t + 0.06);
    g.gain.setValueAtTime(glosnosc, t + Math.max(0.07, dlugosc - 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dlugosc);
    o.connect(f);
    f.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + dlugosc + 0.05);
  }

  var dzwieki = {
    // moneta dolatuje do licznika; z każdą kolejną ton lekko w górę
    moneta: function (kat, i) {
      var a = kontekstAudio();
      if (!a) return;
      var p = Math.pow(2, Math.min(i, 12) / 24);
      if (kat === 'zeroad') {
        szum(a, 0, 0.05, 0.05, 'bandpass', 5200 * p, 3);
        ton(a, 2637 * p, 0, 0.22, 0.012, 'sine');
        ton(a, 3587 * p, 0, 0.16, 0.008, 'sine');
      } else {
        ton(a, 988 * p, 0, 0.07, 0.035);
        ton(a, 1319 * p, 0.06, 0.2, 0.03);
      }
    },
    fanfara: function (kat) {
      var a = kontekstAudio();
      if (!a) return;
      if (kat === 'zeroad') {
        szum(a, 0, 0.35, 0.12, 'lowpass', 180, 1);
        [196, 262, 330, 392].forEach(function (f, i) {
          rog(a, f, i * 0.2, i === 3 ? 1.1 : 0.26, 0.05);
          rog(a, f / 2, i * 0.2, i === 3 ? 1.1 : 0.26, 0.03);
        });
      } else {
        [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) {
          var dl = i === 5 ? 0.6 : 0.16;
          ton(a, f, i * 0.12, dl, 0.05, 'triangle');
          ton(a, f * 2, i * 0.12, dl, 0.015, 'square');
        });
      }
    },
    pieczec: function () {
      var a = kontekstAudio();
      if (!a) return;
      ton(a, 110, 0, 0.18, 0.12, 'sine');
      szum(a, 0, 0.12, 0.09, 'lowpass', 900, 1);
    },
    przejscie: function (kat) {
      var a = kontekstAudio();
      if (!a) return;
      szum(a, 0, 0.55, 0.06, 'bandpass', kat === 'zeroad' ? 300 : 500, 1.5, kat === 'zeroad' ? 1400 : 3500);
    },
    odznaka: function () {
      var a = kontekstAudio();
      if (!a) return;
      [1047, 1319, 1568, 2093].forEach(function (f, i) { ton(a, f, i * 0.08, 0.35, 0.03, 'sine'); });
    },
    zaczepka: function (kat) {
      var a = kontekstAudio();
      if (!a) return;
      if (kat === 'zeroad') szum(a, 0, 0.08, 0.08, 'lowpass', 700, 2);
      else ton(a, 660 + Math.random() * 200, 0, 0.1, 0.03, 'sine');
    },
    zlosc: function () {
      var a = kontekstAudio();
      if (!a) return;
      rog(a, 73, 0, 0.5, 0.06);
      rog(a, 77, 0.02, 0.5, 0.05);
      szum(a, 0, 0.4, 0.05, 'lowpass', 400, 1);
    }
  };

  var btnDzwiek = $('#btn-dzwiek');

  function rysujDzwiek() {
    btnDzwiek.setAttribute('aria-pressed', dzwiekWl ? 'true' : 'false');
    btnDzwiek.title = dzwiekWl ? 'Wycisz dźwięki' : 'Włącz dźwięki';
  }

  btnDzwiek.addEventListener('click', function () {
    dzwiekWl = !dzwiekWl;
    zapiszUstawienie(KLUCZ_DZWIEK, dzwiekWl ? '1' : '0');
    rysujDzwiek();
    if (dzwiekWl) dzwieki.moneta(aktywna, 0);
  });

  rysujDzwiek();

  /* ---------------------------------------------------------
     Karty graczy
     --------------------------------------------------------- */

  var aktywna = html.getAttribute('data-motyw') === 'zeroad' ? 'zeroad' : 'fortnite';
  var karty = {};           // 'kat:id' -> karta
  var kartyKat = {};        // kat -> [karty w kolejności z HTML]

  function aktualnyCel(kat, id, suma) {
    var cele = KAT[kat].gracze[id].cele;
    for (var i = 0; i < cele.length; i++) {
      if (suma < cele[i].kwota) return { nr: i, cel: cele[i] };
    }
    return { nr: cele.length, cel: null };
  }

  function etykietaEtapu(kat, nr, ile) {
    var etapy = KAT[kat].etapy;
    if (etapy) return etapy[nr] || etapy[etapy.length - 1];
    return 'Cel ' + (nr + 1) + '/' + ile;
  }

  function ustawPasek(pasek, ulamek, odZera) {
    var p = Math.max(0, Math.min(1, ulamek));
    if (odZera && animowac) {
      pasek.classList.add('bez-animacji');
      pasek.style.setProperty('--p', 0);
      void pasek.offsetWidth;
      pasek.classList.remove('bez-animacji');
    }
    pasek.style.setProperty('--p', p);
  }

  function rysujCel(k, odZera) {
    var suma = stan.sumy[k.kat][k.id];
    var cele = KAT[k.kat].gracze[k.id].cele;
    var ac = aktualnyCel(k.kat, k.id, suma);

    k.brakuje.textContent = '';
    if (ac.cel) {
      var brak = ac.cel.kwota - suma;
      k.etap.textContent = etykietaEtapu(k.kat, ac.nr, cele.length);
      k.celNazwa.textContent = ac.cel.nazwa;
      k.celKwota.textContent = fmt(ac.cel.kwota);
      k.brakuje.appendChild(document.createTextNode('Brakuje jeszcze '));
      k.brakuje.appendChild(elem('b', null, fmt(brak)));
      k.brakuje.appendChild(document.createTextNode(' ' + odmiana(k.kat, brak)));
      ustawPasek(k.pasek, suma / ac.cel.kwota, odZera);
    } else {
      k.etap.textContent = k.kat === 'zeroad' ? 'Imperium zbudowane' : 'Wszystkie cele zdobyte';
      k.celNazwa.textContent = k.kat === 'zeroad' ? 'Teraz już tylko darowizny z serca' : 'Teraz to już tylko wpłaty z serca';
      k.celKwota.textContent = fmt(cele[cele.length - 1].kwota);
      k.brakuje.textContent = 'Legenda zrzutki. Dzięki wam wszystkim!';
      ustawPasek(k.pasek, 1, odZera);
    }
  }

  $$('.kategoria').forEach(function (sekcja) {
    var kat = sekcja.getAttribute('data-kategoria');
    if (!KAT[kat]) return;
    kartyKat[kat] = [];

    $$('.karta', sekcja).forEach(function (el) {
      var id = el.getAttribute('data-gracz');
      if (!KAT[kat].gracze[id]) return;
      var k = {
        kat: kat,
        id: id,
        el: el,
        gracz: KAT[kat].gracze[id],
        obraz: $('.karta-obraz', el),
        dymek: $('.dymek', el),
        korona: $('.korona', el),
        licznik: new Licznik($('[data-kwota]', el), stan.sumy[kat][id]),
        ikona: $('.zebrano-kwota .vb', el),
        etap: $('[data-cel-etap]', el),
        celNazwa: $('[data-cel-nazwa]', el),
        celKwota: $('[data-cel-kwota]', el),
        pasek: $('[data-cel-pasek]', el),
        brakuje: $('[data-cel-brakuje]', el),
        ostatniaReakcja: -1,
        ostatniaZaczepka: -1,
        seria: 0,
        zaczepkiRazem: 0
      };
      karty[kat + ':' + id] = k;
      kartyKat[kat].push(k);
      rysujCel(k);

      $('.btn-wesprzyj', el).addEventListener('click', function () { otworzOkno(k); });

      // portret da się zaczepić — myszką, palcem i z klawiatury
      k.obraz.setAttribute('role', 'button');
      k.obraz.setAttribute('tabindex', '0');
      k.obraz.setAttribute('aria-label', 'Zaczep: ' + k.gracz.nick);
      k.obraz.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('a')) return;
        zaczep(k);
      });
      k.obraz.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          zaczep(k);
        }
      });
    });
  });

  /* ---------------------------------------------------------
     Dymki, reakcje, zaczepki, furia
     --------------------------------------------------------- */

  function pokazDymek(k, tekst, czas, link) {
    clearTimeout(k.dymekTimer);
    k.dymek.textContent = tekst;
    if (link) {
      k.dymek.appendChild(document.createElement('br'));
      k.dymek.appendChild(link);
    }
    odpal(k.dymek, 'widoczny');
    k.dymekTimer = setTimeout(function () { k.dymek.classList.remove('widoczny'); }, czas || 3600);
  }

  function wsciekly(k, czas) {
    clearTimeout(k.furiaTimer);
    odpal(k.el, 'wsciekly');
    dzwieki.zlosc();
    if (k.id === 'kozak') odblokuj('wkurzyciel');
    k.furiaTimer = setTimeout(function () { k.el.classList.remove('wsciekly'); }, czas || 2600);
  }

  function reaguj(k) {
    clearTimeout(k.reakcjaTimer);
    odpal(k.el, 'reaguje');
    k.reakcjaTimer = setTimeout(function () { k.el.classList.remove('reaguje'); }, 1700);
  }

  function reakcjaNaWplate(k, ile) {
    var g = k.gracz;
    var cfg = KAT[k.kat];

    if (g.malo && ile < g.malo) {
      pokazDymek(k, g.reakcjeMalo[Math.floor(Math.random() * g.reakcjeMalo.length)], 4200);
      wsciekly(k, 2800);
    } else {
      var nr = losujInny(g.reakcje, k.ostatniaReakcja);
      k.ostatniaReakcja = nr;
      var r = g.reakcje[nr];
      var tekst = typeof r === 'string' ? r : r.tekst;
      pokazDymek(k, tekst, 4200);
      if (r.furia) wsciekly(k, 2200);
      reaguj(k);
    }

    var rz = k.el.getAttribute('data-kolor');
    if (ile >= cfg.hojnie) toast(cfg.teksty.hojnie, rz, cfg.ikona);
    else if (ile === 1) toast(cfg.teksty.grosz, rz, cfg.ikona);
  }

  function zaczep(k) {
    var g = k.gracz;
    stan.zaczepki++;
    zapisz();
    sprawdzOdznaki();
    dzwieki.zaczepka(k.kat);

    // seria szybkich zaczepek liczy się do furii
    k.seria++;
    k.zaczepkiRazem++;
    clearTimeout(k.seriaTimer);
    k.seriaTimer = setTimeout(function () { k.seria = 0; }, 2500);

    if (g.progZlosci && k.seria >= g.progZlosci) {
      k.seria = 0;
      pokazDymek(k, g.wsciekly[Math.floor(Math.random() * g.wsciekly.length)], 3200);
      wsciekly(k, 2600);
      return;
    }

    if (g.dowod && k.zaczepkiRazem % g.dowod === 0) {
      var a = elem('a', null, 'Zobacz, jak było kiedyś →');
      a.href = 'goat/';
      a.addEventListener('click', function () { odblokuj('archeolog'); });
      pokazDymek(k, 'Nie wierzysz? Mam dowód.', 6000, a);
      odpal(k.el, 'zaczepiony');
      return;
    }

    // Apollo w 0 A.D.: po kilku zaczepkach wreszcie wychodzi armia z 20. minuty
    if (g.armiaPo && k.zaczepkiRazem % g.armiaPo === 0) {
      pokazDymek(k, 'Dobra, 20. minuta. ARMIA, NAPRZÓD!', 3600);
      odpal(k.el, 'armia');
      clearTimeout(k.armiaTimer);
      k.armiaTimer = setTimeout(function () { k.el.classList.remove('armia'); }, 3000);
      return;
    }

    var nr = losujInny(g.zaczepki, k.ostatniaZaczepka);
    k.ostatniaZaczepka = nr;
    pokazDymek(k, g.zaczepki[nr], 2600);
    odpal(k.el, 'zaczepiony');
  }

  /* ---------------------------------------------------------
     Nagłówek, ranking, korony, profil
     --------------------------------------------------------- */

  var sumaLicznik = new Licznik($('#suma'), sumaKat(aktywna));
  var metalLicznik = new Licznik($('#metal'), sumaKat('zeroad'));

  function rysujKorony(kat) {
    var lista = kartyKat[kat] || [];
    var najlepszy = null;
    lista.forEach(function (k) {
      if (stan.sumy[kat][k.id] > 0 && (!najlepszy || stan.sumy[kat][k.id] > stan.sumy[kat][najlepszy.id])) najlepszy = k;
    });
    lista.forEach(function (k) {
      var jest = k === najlepszy;
      if (jest && k.korona.hidden) {
        k.korona.hidden = false;
        odpal(k.korona, 'korona');
      } else if (!jest) {
        k.korona.hidden = true;
      }
    });
  }

  function rysujRanking() {
    var lista = $('#ranking');
    var kat = aktywna;
    var gracze = (kartyKat[kat] || []).slice().sort(function (a, b) {
      return stan.sumy[kat][b.id] - stan.sumy[kat][a.id];
    });
    var maks = Math.max(1, stan.sumy[kat][gracze[0].id]);
    var ikonaKat = KAT[kat].ikona;

    lista.textContent = '';
    gracze.forEach(function (k, i) {
      var suma = stan.sumy[kat][k.id];
      var li = elem('li');
      li.setAttribute('data-kolor', k.el.getAttribute('data-kolor'));
      li.appendChild(elem('span', 'rk-miejsce', kat === 'zeroad' ? rzymska(i + 1) : String(i + 1)));
      li.appendChild(elem('span', 'rk-nick', (i === 0 && suma > 0 ? '👑 ' : '') + k.gracz.nick));
      var ile = elem('span', 'rk-ile');
      ile.appendChild(ikona(ikonaKat, 'vb'));
      ile.appendChild(document.createTextNode(fmt(suma)));
      li.appendChild(ile);
      var pasek = elem('span', 'rk-pasek');
      var wyp = elem('i');
      pasek.appendChild(wyp);
      li.appendChild(pasek);
      lista.appendChild(li);
      wyp.style.setProperty('--p', 0);
      requestAnimationFrame(function () { wyp.style.setProperty('--p', suma / maks); });
    });
  }

  function ranga(kat, suma) {
    var rangi = KAT[kat].rangi;
    var nr = 0;
    for (var i = 0; i < rangi.length; i++) if (suma >= rangi[i][0]) nr = i;
    return { nr: nr, nazwa: rangi[nr][1], nastepna: rangi[nr + 1] || null, prog: rangi[nr][0] };
  }

  function rysujProfil() {
    Object.keys(KAT).forEach(function (kat) {
      var r = ranga(kat, sumaMoje(kat));
      $$('[data-tytul="' + kat + '"]').forEach(function (e) { e.textContent = r.nazwa; });
    });

    var suma = sumaMoje(aktywna);
    var r = ranga(aktywna, suma);
    $('#profil-ranga').textContent = r.nazwa;
    $('#profil-suma').textContent = fmt(suma);
    var pasek = $('#profil-pasek');
    if (r.nastepna) {
      var brak = r.nastepna[0] - suma;
      $('#profil-nastepny').textContent = 'Do tytułu „' + r.nastepna[1] + '” brakuje ' +
        fmt(brak) + ' ' + odmiana(aktywna, brak);
      pasek.style.setProperty('--p', (suma - r.prog) / (r.nastepna[0] - r.prog));
    } else {
      $('#profil-nastepny').textContent = 'Najwyższy tytuł. Szacunek.';
      pasek.style.setProperty('--p', 1);
    }
    rysujOdznaki();
  }

  /* ---------------------------------------------------------
     Odznaki
     --------------------------------------------------------- */

  var swiezeOdznaki = {};

  /* Osiągnięcia z Areny: lista z gra/osiagniecia.js, zdobyte w localStorage
     (ta sama domena, więc gra i strona widzą ten sam zapis). */
  function rysujOsiagnieciaAreny() {
    var A = window.ARENA_OSIAGNIECIA;
    var lista = $('#arena-osiagniecia');
    if (!A || !lista) return;
    var zdobyte = A.wczytaj();
    lista.textContent = '';
    var ile = 0;
    A.lista.forEach(function (o) {
      var ma = !!zdobyte[o.id];
      if (ma) ile++;
      var widac = ma || !o.ukryta;
      var li = elem('li', 'odznaka' + (ma ? '' : ' zablokowana'));
      li.appendChild(elem('span', 'odznaka-ikona', widac ? o.ikona : '❔'));
      li.appendChild(elem('span', 'odznaka-nazwa', widac ? o.nazwa : '???'));
      li.appendChild(elem('span', 'odznaka-opis', widac ? o.opis : 'Tajne osiągnięcie. Kombinuj w Arenie.'));
      lista.appendChild(li);
    });
    $('#arena-licznik').textContent = ile + '/' + A.lista.length;
  }

  // gra otwarta w drugiej karcie coś odblokowała — odświeżamy bez przeładowania
  window.addEventListener('storage', function (e) {
    if (window.ARENA_OSIAGNIECIA && e.key === window.ARENA_OSIAGNIECIA.klucz) rysujOsiagnieciaAreny();
  });

  function rysujOdznaki() {
    var lista = $('#odznaki');
    lista.textContent = '';
    var ile = 0;
    DANE.odznaki.forEach(function (o) {
      var ma = !!stan.odznaki[o.id];
      if (ma) ile++;
      var li = elem('li', 'odznaka' + (ma ? '' : ' zablokowana') + (swiezeOdznaki[o.id] ? ' swieza' : ''));
      li.appendChild(elem('span', 'odznaka-ikona', ma || !o.ukryta ? o.ikona : '❔'));
      li.appendChild(elem('span', 'odznaka-nazwa', ma || !o.ukryta ? o.nazwa : '???'));
      li.appendChild(elem('span', 'odznaka-opis', ma || !o.ukryta ? o.opis : 'Tajna odznaka. Szukaj dalej.'));
      lista.appendChild(li);
    });
    swiezeOdznaki = {};
    var tekst = ile + '/' + DANE.odznaki.length;
    $('#odznaki-licznik').textContent = tekst;
    $$('[data-odznaki-licznik]').forEach(function (e) { e.textContent = tekst; });
    rysujOsiagnieciaAreny();
  }

  function odblokuj(id) {
    var o = odznakaPoId[id];
    if (!o || stan.odznaki[id]) return;
    stan.odznaki[id] = Date.now();
    swiezeOdznaki[id] = true;
    zapisz();
    rysujProfil();
    popupOdznaki(o);
  }

  function sprawdzOdznaki(w) {
    var fn = stan.moje.fortnite, za = stan.moje.zeroad;
    var wszyscy = function (s) { return Object.keys(s).every(function (id) { return s[id] > 0; }); };

    if (sumaMoje('fortnite') + sumaMoje('zeroad') > 0) odblokuj('pierwsza');
    if (w && w.ile === 1) odblokuj('grosz');
    if (w && w.ile >= KAT[w.kat].hojnie) odblokuj('hojny');
    if (fn.krayo > 0) odblokuj('krayo');
    if (wszyscy(fn)) odblokuj('mecenas-fn');
    if (sumaMoje('fortnite') >= 50000) odblokuj('wieloryb');
    if (za.kozak > 0) odblokuj('haracz');
    if (za.lazi > 0) odblokuj('weteran');
    if (fn.apollo > 0) odblokuj('earningsy');
    if (za.apollo > 0) odblokuj('spichlerz');
    if (za.froxy > 0) odblokuj('nauczyciel');
    if (za.quber > 0) odblokuj('testudo');
    if (w && w.kat === 'zeroad' && w.komu === 'stozhinio' && w.ile === 300) odblokuj('sparta');
    if (wszyscy(za)) odblokuj('skarbnik');
    if (sumaMoje('fortnite') > 0 && sumaMoje('zeroad') > 0) odblokuj('dwa-swiaty');
    if (stan.zaczepki >= 15) odblokuj('zaczepialski');
  }

  var popupy = $('#odznaki-wyskakujace');

  function popupOdznaki(o) {
    var p = elem('div', 'odznaka-popup');
    p.appendChild(elem('span', 'odznaka-ikona', o.ikona));
    p.appendChild(elem('span', 'popup-nad', 'Odznaka odblokowana'));
    p.appendChild(elem('span', 'popup-nazwa', o.nazwa));
    popupy.appendChild(p);
    dzwieki.odznaka();
    setTimeout(function () {
      p.classList.add('znika');
      setTimeout(function () { p.remove(); }, animowac ? 350 : 0);
    }, 3400);
  }

  /* ---------------------------------------------------------
     Kategorie i przejście między nimi
     --------------------------------------------------------- */

  var TYTULY = {
    fortnite: 'V-dolce dla noobów · Zrzutka',
    zeroad: 'Srebrniki dla wojowników · Skarbiec 0 A.D.'
  };
  var KOLORY_PASKA = { fortnite: '#123a9c', zeroad: '#1b120a' };

  function kategoriaZHasha() {
    return /^#0ad$/i.test(location.hash) ? 'zeroad' : 'fortnite';
  }

  function zastosujKategorie(kat) {
    aktywna = kat;
    html.setAttribute('data-motyw', kat);
    document.title = TYTULY[kat];
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', KOLORY_PASKA[kat]);
    $$('.kat').forEach(function (a) {
      if (a.getAttribute('data-kat') === kat) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    $('#logo').setAttribute('href', HASH[kat]);
    sumaLicznik.ustaw(sumaKat(kat), true);
    rysujRanking();
    rysujWplaty();
    rysujProfil();
  }

  var przelaczanie = false;

  function przelacz(kat, zrodlo) {
    if (kat === aktywna || przelaczanie) return;
    if (!animowac) {
      zastosujKategorie(kat);
      window.scrollTo(0, 0);
      return;
    }

    przelaczanie = true;
    var kurtyna = $('#kurtyna');
    var p = zrodlo ? srodek(zrodlo) : { x: window.innerWidth / 2, y: 40 };
    var promien = Math.hypot(Math.max(p.x, window.innerWidth - p.x), Math.max(p.y, window.innerHeight - p.y)) + 20;

    kurtyna.setAttribute('data-cel', kat);
    $('#kurtyna-ikona').setAttribute('href', '#' + KAT[kat].ikona);
    $('#kurtyna-napis').textContent = KAT[kat].teksty.kurtyna;
    kurtyna.hidden = false;
    dzwieki.przejscie(kat);

    var wejscie = kurtyna.animate([
      { clipPath: 'circle(0px at ' + p.x + 'px ' + p.y + 'px)' },
      { clipPath: 'circle(' + promien + 'px at ' + p.x + 'px ' + p.y + 'px)' }
    ], { duration: 560, easing: 'cubic-bezier(.7, 0, .3, 1)', fill: 'forwards' });

    $('.kurtyna-srodek', kurtyna).animate([
      { opacity: 0, transform: 'scale(0.3) rotate(-160deg)' },
      { opacity: 1, transform: 'scale(1) rotate(0deg)' }
    ], { duration: 650, delay: 120, easing: 'cubic-bezier(.2, .9, .25, 1.3)', fill: 'both' });

    wejscie.onfinish = function () {
      zastosujKategorie(kat);
      window.scrollTo(0, 0);
      setTimeout(function () {
        var wyjscie = kurtyna.animate([
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(1.06)' }
        ], { duration: 420, easing: 'ease-in', fill: 'forwards' });
        wyjscie.onfinish = function () {
          kurtyna.hidden = true;
          kurtyna.getAnimations().forEach(function (a) { a.cancel(); });
          $('.kurtyna-srodek', kurtyna).getAnimations().forEach(function (a) { a.cancel(); });
          przelaczanie = false;
          // ktoś zdążył kliknąć drugą zakładkę w trakcie — doganiamy
          if (kategoriaZHasha() !== aktywna) przelacz(kategoriaZHasha());
        };
      }, 380);
    };
  }

  var ostatnioKliknieta = null;
  $$('.kat').forEach(function (a) {
    a.addEventListener('click', function () { ostatnioKliknieta = a; });
  });

  window.addEventListener('hashchange', function () {
    var kat = kategoriaZHasha();
    if (kat !== aktywna) przelacz(kat, ostatnioKliknieta);
    ostatnioKliknieta = null;
  });

  $('#logo').addEventListener('click', function (e) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: animowac ? 'smooth' : 'auto' });
  });

  $$('[data-do-profilu]').forEach(function (b) {
    b.addEventListener('click', function () {
      $('#profil').scrollIntoView({ behavior: animowac ? 'smooth' : 'auto', block: 'start' });
    });
  });

  /* ---------------------------------------------------------
     Okno wpłaty
     --------------------------------------------------------- */

  var okno = $('#okno');
  var form = $('#okno-form');
  var poleIle = $('#pole-ile');
  var poleNick = $('#pole-nick');
  var poleMsg = $('#pole-wiadomosc');
  var blad = $('#okno-blad');
  var szybkie = $('#szybkie');
  var suwak = $('#suwak');
  var wybrana = null;
  var wysylanie = false;

  poleNick.value = czytajUstawienie(KLUCZ_NICK) || czytajUstawienie('vdolce-nick') || '';

  function otworzOkno(k) {
    wybrana = k;
    var cfg = KAT[k.kat];
    var t = cfg.teksty;
    var suma = stan.sumy[k.kat][k.id];
    var ac = aktualnyCel(k.kat, k.id, suma);

    okno.setAttribute('data-kolor', k.el.getAttribute('data-kolor'));
    $('#okno-nad').textContent = t.oknoNad;
    $('#okno-tytul').textContent = k.gracz.nick;
    $('#etykieta-ile').textContent = t.ile;
    $('#etykieta-nick').textContent = t.nick;
    $('#etykieta-wiadomosc').textContent = t.wiadomosc;
    var strefy = window.ZRZUTKA_MINIGRY ? window.ZRZUTKA_MINIGRY.strefy(k.kat) : null;
    $('#wyslij-tekst').textContent = strefy && t.walcz ? t.walcz : t.wyslij;
    przygotujSuwak(k, strefy);
    poleNick.placeholder = t.nickPusty;
    poleMsg.placeholder = k.kat === 'zeroad' ? 'np. „Na chwałę Sparty!”' : 'np. „kup se skilla”';
    poleIle.max = cfg.maks;
    poleIle.placeholder = 'np. ' + cfg.szybkie[2];
    $('#pole-ikona').setAttribute('href', '#' + cfg.ikona);
    $('#wyslij-ikona').setAttribute('href', '#' + cfg.ikona);

    var awatar = $('#okno-awatar');
    awatar.textContent = '';
    var kopia = $('.awatar', k.el).cloneNode(true);
    kopia.removeAttribute('class');
    awatar.appendChild(kopia);

    var cel = $('#okno-cel');
    cel.textContent = '';
    if (ac.cel) {
      cel.appendChild(document.createTextNode('Do celu „' + ac.cel.nazwa + '” brakuje '));
      cel.appendChild(elem('b', null, fmt(ac.cel.kwota - suma)));
      cel.appendChild(document.createTextNode('.'));
    } else {
      cel.textContent = 'Wszystkie cele zdobyte — ale dokładka zawsze mile widziana.';
    }

    szybkie.textContent = '';
    cfg.szybkie.forEach(function (ile) {
      var b = elem('button');
      b.type = 'button';
      b.setAttribute('data-ile', ile);
      b.appendChild(ikona(cfg.ikona, 'vb'));
      b.appendChild(document.createTextNode(fmt(ile)));
      b.addEventListener('click', function () {
        poleIle.value = ile;
        blad.textContent = '';
        zaznaczSzybki();
        rysujPodglad();
      });
      szybkie.appendChild(b);
    });

    poleMsg.value = '';
    blad.textContent = '';
    wysylanie = false;
    ustawKwote(Math.min(cfg.maks, cfg.szybkie[2]));

    if (typeof okno.showModal === 'function') okno.showModal();
    else okno.setAttribute('open', '');

    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) suwak.focus();
  }

  /* ---------- suwak kwoty ze strefami minigierek ---------- */

  function przygotujSuwak(k, strefy) {
    var cfg = KAT[k.kat];
    suwak.max = cfg.maks;
    $('#suwak-ikona').setAttribute('href', '#' + cfg.ikona);
    $('#suwak-max').textContent = fmt(cfg.maks);
    $('#suwak-srodek').textContent = fmt(Math.round(cfg.maks / 2));
    var box = $('#suwak-strefy');
    box.textContent = '';
    if (!strefy) {
      box.hidden = true;
      suwak.style.removeProperty('--suwak-tlo');
      return;
    }
    box.hidden = false;
    strefy.forEach(function (s) {
      var b = elem('button', 'suwak-strefa' + (s.trudna ? ' trudna' : ''));
      b.type = 'button';
      b.setAttribute('data-od', s.od);
      b.setAttribute('data-do', s.do);
      b.appendChild(elem('span', 'ik', s.gra.ikona));
      var opis = elem('span');
      opis.appendChild(document.createTextNode(s.gra.nazwa));
      opis.appendChild(elem('small', null, fmt(s.od) + '–' + fmt(s.do)));
      b.appendChild(opis);
      b.addEventListener('click', function () { ustawKwote(Math.round((s.od + s.do) / 2 / 10) * 10); });
      box.appendChild(b);
    });
    // tor suwaka: zielono-żółta łatwa strefa, pomarańczowo-czerwona trudna
    var p = strefy[0].do / cfg.maks * 100;
    suwak.style.setProperty('--suwak-tlo', 'linear-gradient(90deg, #5ee06a, #ffe34d ' + p + '%, #ff9a2e ' + p + '%, #ff3b3b 92%, #b3002d)');
  }

  function ustawKwote(ile) {
    if (!wybrana) return;
    var cfg = KAT[wybrana.kat];
    ile = Math.max(1, Math.min(cfg.maks, Math.round(ile)));
    poleIle.value = ile;
    suwak.value = ile;
    suwak.style.setProperty('--p', (ile / cfg.maks).toFixed(4));
    $('#suwak-liczba').textContent = fmt(ile);
    $$('.suwak-strefa').forEach(function (b) {
      var od = Number(b.getAttribute('data-od')), dd = Number(b.getAttribute('data-do'));
      b.classList.toggle('aktywna', ile >= od && ile <= dd);
    });
    blad.textContent = '';
    zaznaczSzybki();
    rysujPodglad();
  }

  suwak.addEventListener('input', function () { ustawKwote(Number(suwak.value)); });

  // przyciski −/+: po 1 do 50, potem po 10; przytrzymanie przyspiesza
  $$('.suwak-krok').forEach(function (b) {
    var kier = Number(b.getAttribute('data-krok'));
    var zegar = 0, powtorzenia = 0;
    function krok() {
      var ile = Number(poleIle.value) || 0;
      var o = ile < 50 || (kier < 0 && ile <= 50) ? 1 : powtorzenia > 12 ? 50 : 10;
      var nowa = kier > 0 ? ile + o : ile - o;
      if (o > 1) nowa = kier > 0 ? Math.floor(nowa / o) * o : Math.ceil(nowa / o) * o;
      ustawKwote(nowa);
    }
    function stop() { clearTimeout(zegar); zegar = 0; }
    function powtarzaj() { powtorzenia++; krok(); zegar = setTimeout(powtarzaj, powtorzenia > 6 ? 60 : 120); }
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      powtorzenia = 0;
      krok();
      zegar = setTimeout(powtarzaj, 380);
    });
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointerleave', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); krok(); } });
  });

  function zamknijOkno() {
    if (typeof okno.close === 'function' && okno.open) okno.close();
    else okno.removeAttribute('open');
  }

  function zaznaczSzybki() {
    $$('button', szybkie).forEach(function (b) {
      b.classList.toggle('wybrany', b.getAttribute('data-ile') === poleIle.value);
    });
  }

  // pasek pokazuje, ile wpłata przybliży do bieżącego celu
  function rysujPodglad() {
    if (!wybrana) return;
    var k = wybrana;
    var suma = stan.sumy[k.kat][k.id];
    var ac = aktualnyCel(k.kat, k.id, suma);
    var ile = Math.floor(Number(poleIle.value));
    var ok = poleIle.value.trim() !== '' && isFinite(ile) && ile > 0 && ile <= KAT[k.kat].maks;
    var teraz = $('#podglad-teraz');
    var po = $('#podglad-po');
    var tekst = $('#podglad-tekst');
    tekst.textContent = '';

    if (!ac.cel) {
      opiszMinigre(k, ok ? ile : 0);
      teraz.style.setProperty('--p', 1);
      po.style.setProperty('--p', 0);
      tekst.textContent = 'Wszystkie cele zdobyte — każda wpłata to już czysta wdzięczność.';
      return;
    }

    var t = suma / ac.cel.kwota;
    teraz.style.setProperty('--p', t);
    po.style.setProperty('--od', t);
    po.style.setProperty('--p', ok ? Math.min(1, (suma + ile) / ac.cel.kwota) - t : 0);

    opiszMinigre(k, ok ? ile : 0);
    if (!ok) {
      tekst.textContent = 'Wpisz kwotę, a pokażę, ile brakuje do celu.';
      return;
    }

    var zdobyte = k.gracz.cele.filter(function (c) { return suma < c.kwota && suma + ile >= c.kwota; });
    if (zdobyte.length > 1) {
      tekst.appendChild(document.createTextNode('Ta wpłata zdobędzie od razu '));
      tekst.appendChild(elem('b', null, zdobyte.length + ' cele'));
      tekst.appendChild(document.createTextNode('!'));
    } else if (zdobyte.length === 1) {
      tekst.appendChild(document.createTextNode('Ta wpłata zdobędzie cel: '));
      tekst.appendChild(elem('b', null, zdobyte[0].nazwa));
      tekst.appendChild(document.createTextNode('!'));
    } else {
      var brak = ac.cel.kwota - suma - ile;
      tekst.appendChild(document.createTextNode('Po wpłacie do celu zostanie '));
      tekst.appendChild(elem('b', null, fmt(brak)));
      tekst.appendChild(document.createTextNode(' ' + odmiana(k.kat, brak) + '.'));
    }
  }

  // pod kwotą: jaka minigierka czeka na tę wpłatę i jak trudna
  function opiszMinigre(k, ile) {
    var p = $('#okno-minigra');
    var MG = window.ZRZUTKA_MINIGRY;
    p.textContent = '';
    var w = MG && ile > 0 ? MG.dlaKwoty(k.kat, ile) : null;
    if (!w) { p.hidden = true; return; }
    p.hidden = false;
    p.appendChild(elem('span', 'ik', w.gra.ikona));
    var tekst = elem('span', 'okno-minigra-tekst');
    tekst.appendChild(elem('b', null, w.gra.nazwa));
    tekst.appendChild(document.createTextNode(w.trudna ? 'Wygraj, żeby wpłacić — im więcej, tym ciężej' : 'Wygraj, żeby wpłacić — im więcej, tym trudniej'));
    p.appendChild(tekst);
    p.appendChild(elem('span', 'okno-minigra-poziom' + (w.trudna ? ' trudna' : ''), MG.nazwaTrudnosci(w.t, w.trudna)));
  }

  poleIle.addEventListener('input', function () {
    blad.textContent = '';
    zaznaczSzybki();
    rysujPodglad();
  });

  $('#okno-x').addEventListener('click', zamknijOkno);

  // klik w przyciemnione tło zamyka okno
  okno.addEventListener('click', function (e) {
    if (e.target === okno) zamknijOkno();
  });

  function pokazBlad(tekst) {
    blad.textContent = tekst;
    odpal(form, 'trzes');
  }

  // 0 A.D.: przed wysłaniem pieczęć spada na akt darowizny
  function pieczetuj(gotowe) {
    var p = $('#okno-pieczec');
    var a = p.animate([
      { opacity: 0, transform: 'scale(2.8) rotate(-30deg)' },
      { opacity: 1, transform: 'scale(0.92) rotate(-12deg)', offset: 0.55 },
      { opacity: 1, transform: 'scale(1.04) rotate(-12deg)', offset: 0.75 },
      { opacity: 1, transform: 'scale(1) rotate(-12deg)' }
    ], { duration: 540, easing: 'cubic-bezier(.55, 0, .45, 1)', fill: 'forwards' });
    setTimeout(function () {
      dzwieki.pieczec();
      form.animate([
        { transform: 'translateY(0)' },
        { transform: 'translateY(4px)' },
        { transform: 'translateY(0)' }
      ], { duration: 160 });
    }, 300);
    a.onfinish = function () {
      setTimeout(function () {
        var start = srodek(p);
        gotowe(start);
        a.cancel();
      }, 320);
    };
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!wybrana || wysylanie) return;
    var k = wybrana;
    var cfg = KAT[k.kat];
    var t = cfg.teksty;

    var surowe = poleIle.value.trim();
    var ile = Math.floor(Number(surowe));

    if (surowe === '' || !isFinite(ile)) return pokazBlad(t.brakKwoty);
    if (ile < 0) return pokazBlad(t.ujemna);
    if (ile === 0) return pokazBlad(t.zero);
    if (ile > cfg.maks) return pokazBlad(t.zaDuzo + ' Maksymalnie ' + fmt(cfg.maks) + '.');

    var nick = poleNick.value.trim().replace(/\s+/g, ' ').slice(0, 24);
    var msg = poleMsg.value.trim().replace(/\s+/g, ' ').slice(0, 60);
    zapiszUstawienie(KLUCZ_NICK, nick);
    wysylanie = true;

    function wyslij(start) {
      zamknijOkno();
      wplac(k, ile, nick || t.nickPusty, msg, start);
    }

    // przed wpłatą minigierka (jeśli kategoria ją ma) — wpłata leci dopiero po wygranej
    var MG = window.ZRZUTKA_MINIGRY;
    if (MG && MG.dlaKwoty(k.kat, ile)) {
      var czekaj = MG.pozostalaBlokada();
      if (czekaj > 0) {
        wysylanie = false;
        return pokazBlad('Po przegranej chwila przerwy — spróbuj za ' + czekaj + ' s.');
      }
      zamknijOkno();
      MG.graj({
        kat: k.kat,
        ile: ile,
        kwotaTekst: fmt(ile) + ' ' + odmiana(k.kat, ile),
        dla: k.gracz.nick,
        naWygrana: function (start) {
          wplac(k, ile, nick || t.nickPusty, msg, start || { x: innerWidth / 2, y: innerHeight / 2 });
        },
        naRezygnacje: function () {
          // wracamy do okna z tą samą kwotą — gracz może ją zmniejszyć
          wysylanie = false;
          if (typeof okno.showModal === 'function') okno.showModal();
          else okno.setAttribute('open', '');
        }
      });
      return;
    }

    if (k.kat === 'zeroad' && animowac) pieczetuj(wyslij);
    else wyslij(srodek($('#btn-wyslij')));
  });

  /* ---------------------------------------------------------
     Wpłata
     --------------------------------------------------------- */

  var ostatnieWplaty = [];

  function wplac(k, ile, nick, msg, start) {
    var kat = k.kat;
    var przed = stan.sumy[kat][k.id];
    var po = przed + ile;
    var celPrzed = aktualnyCel(kat, k.id, przed).cel;
    var zdobyte = k.gracz.cele.filter(function (c) { return przed < c.kwota && po >= c.kwota; });

    stan.sumy[kat][k.id] = po;
    stan.moje[kat][k.id] += ile;
    var wpis = { kat: kat, komu: k.id, ile: ile, kto: nick, t: Date.now(), id: noweId() };
    if (msg) wpis.msg = msg;
    stan.wplaty.unshift(wpis);
    if (stan.wplaty.length > MAX_WPLAT) stan.wplaty.length = MAX_WPLAT;
    mojeId[wpis.id] = true;
    zapisz();
    lotyTrwa++;
    wyslijNaSerwer(wpis);

    // trzy wpłaty w 2 minuty to combo (każdą trzeba wygrać w minigierce)
    var teraz = Date.now();
    ostatnieWplaty = ostatnieWplaty.filter(function (t) { return teraz - t < 120000; });
    ostatnieWplaty.push(teraz);
    var combo = ostatnieWplaty.length >= 3 ? ostatnieWplaty.length : 0;

    function koniec() {
      rysujWplaty();
      rysujRanking();
      rysujKorony(kat);
      rysujProfil();
      reakcjaNaWplate(k, ile);
      sprawdzOdznaki(wpis);
      if (combo) {
        pokazCombo(combo);
        odblokuj('combo');
      }
      if (zdobyte.length) {
        // pasek zostaje pełny pod ekranem zwycięstwa; nowy cel ładuje się po jego zamknięciu
        zwyciestwo(kat, k.gracz.nick, zdobyte, function () { rysujCel(k, true); });
      } else {
        rysujCel(k);
      }
      // stan z serwera, który przyszedł w trakcie lotu monet, wchodzi dopiero teraz
      lotyTrwa--;
      if (!lotyTrwa && zaleglyStan) {
        var d = zaleglyStan;
        zaleglyStan = null;
        przyjmijSerwer(d, true);
      }
    }

    if (!animowac) {
      k.licznik.ustaw(po, true);
      if (kat === aktywna) sumaLicznik.ustaw(sumaKat(kat), true);
      if (kat === 'zeroad') metalLicznik.ustaw(sumaKat('zeroad'), true);
      koniec();
      return;
    }

    // karta mogła uciec z ekranu (np. na telefonie) — dociągamy ją
    var r = k.ikona.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 10) {
      k.ikona.scrollIntoView({ block: 'center' });
    }

    var n = Math.max(5, Math.min(30, Math.round(4 + Math.log10(ile) * 5)));
    var cel = srodek(k.ikona);
    var wyplacone = 0;

    lotMonet(KAT[kat].ikona, start, cel, n, function (i) {
      // dzielimy kwotę między monety tak, żeby suma zgadzała się co do sztuki
      var doTejPory = Math.round(ile * i / n);
      var porcja = doTejPory - wyplacone;
      wyplacone = doTejPory;

      k.licznik.dodaj(porcja);
      if (kat === aktywna) sumaLicznik.dodaj(porcja);
      if (kat === 'zeroad') metalLicznik.dodaj(porcja);
      ustawPasek(k.pasek, celPrzed ? k.licznik.cel / celPrzed.kwota : 1);
      k.ikona.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.45) rotate(-12deg)' },
        { transform: 'scale(1)' }
      ], { duration: 220, easing: 'ease-out' });
      dzwieki.moneta(kat, i);
    }, function () {
      var c = srodek(k.ikona);
      odpal(k.el, 'blysk');
      plywajacyNapis('+' + fmt(ile), c.x, c.y);
      wybuch(KAT[kat].ikona, c.x, c.y, ile >= KAT[kat].hojnie ? 30 : 18);
      koniec();
    });
  }

  /* ---------------------------------------------------------
     Efekty
     --------------------------------------------------------- */

  var fx = $('#fx');

  function lotMonet(ikonaId, start, cel, n, naLadowanie, naKoniec) {
    var czas = 820;
    var odstep = Math.max(28, Math.min(70, 1000 / n));
    var wyladowane = 0;

    for (var i = 0; i < n; i++) {
      var m = elem('div', 'moneta-lot');
      m.appendChild(ikona(ikonaId));
      fx.appendChild(m);

      var sx = start.x + los(-40, 40), sy = start.y + los(-12, 12);
      var ex = cel.x, ey = cel.y;
      var cx = (sx + ex) / 2 + los(-180, 180);
      var cy = Math.min(sy, ey) - los(60, 240);
      var obroty = (Math.random() < 0.5 ? -1 : 1) * 360 * Math.ceil(los(1, 3));

      var klatki = [];
      for (var s = 0; s <= 14; s++) {
        var t = s / 14, u = 1 - t;
        var x = u * u * sx + 2 * u * t * cx + t * t * ex;
        var y = u * u * sy + 2 * u * t * cy + t * t * ey;
        var skala = t < 0.2 ? 0.3 + (t / 0.2) * 0.95 : 1.25 - ((t - 0.2) / 0.8) * 0.6;
        klatki.push({
          transform: 'translate(' + (x - 17).toFixed(1) + 'px,' + (y - 17).toFixed(1) + 'px) ' +
                     'perspective(300px) rotateY(' + (t * obroty).toFixed(0) + 'deg) scale(' + skala.toFixed(3) + ')',
          opacity: t === 0 ? 0 : 1
        });
      }

      var a = m.animate(klatki, {
        duration: czas + los(-140, 140),
        delay: i * odstep,
        easing: 'cubic-bezier(.4, 0, .6, 1)',
        fill: 'both'
      });

      a.onfinish = (function (m) {
        return function () {
          m.remove();
          wyladowane++;
          naLadowanie(wyladowane);
          if (wyladowane === n) naKoniec();
        };
      })(m);
    }
  }

  function wybuch(ikonaId, x, y, ile) {
    for (var i = 0; i < ile; i++) {
      var kat = (i / ile) * Math.PI * 2 + los(-0.2, 0.2);
      var dyst = los(50, 130);
      var dx = Math.cos(kat) * dyst, dy = Math.sin(kat) * dyst;
      var moneta = i % 3 === 0;
      var e;
      if (moneta) {
        e = elem('div', 'moneta-lot');
        e.appendChild(ikona(ikonaId));
      } else {
        e = elem('div', 'iskra');
      }
      fx.appendChild(e);
      var pol = moneta ? 17 : 4;
      var s0 = moneta ? 0.5 : 1.6;
      var a = e.animate([
        { transform: 'translate(' + (x - pol) + 'px,' + (y - pol) + 'px) scale(' + s0 + ')', opacity: 1 },
        { transform: 'translate(' + (x - pol + dx) + 'px,' + (y - pol + dy) + 'px) scale(' + (s0 * 0.4) + ')', opacity: 0 }
      ], { duration: los(550, 900), easing: 'cubic-bezier(.1, .8, .3, 1)', fill: 'forwards' });
      a.onfinish = (function (e) { return function () { e.remove(); }; })(e);
    }
  }

  function plywajacyNapis(tekst, x, y) {
    var e = elem('div', 'plus', tekst);
    fx.appendChild(e);
    var w = e.offsetWidth, h = e.offsetHeight;
    var bx = x - w / 2, by = y - h / 2;
    var a = e.animate([
      { transform: 'translate(' + bx + 'px,' + by + 'px) scale(0.4)', opacity: 0 },
      { transform: 'translate(' + bx + 'px,' + (by - 40) + 'px) scale(1.25)', opacity: 1, offset: 0.25 },
      { transform: 'translate(' + bx + 'px,' + (by - 70) + 'px) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translate(' + bx + 'px,' + (by - 110) + 'px) scale(0.9)', opacity: 0 }
    ], { duration: 1500, easing: 'ease-out', fill: 'forwards' });
    a.onfinish = function () { e.remove(); };
  }

  function pokazCombo(ile) {
    if (!animowac) {
      toast('COMBO ×' + ile + '!');
      return;
    }
    var e = elem('div', 'combo', 'COMBO ×' + ile + '!');
    fx.appendChild(e);
    var w = e.offsetWidth, h = e.offsetHeight;
    var bx = window.innerWidth / 2 - w / 2, by = window.innerHeight * 0.38 - h / 2;
    var a = e.animate([
      { transform: 'translate(' + bx + 'px,' + by + 'px) scale(3) rotate(-8deg)', opacity: 0 },
      { transform: 'translate(' + bx + 'px,' + by + 'px) scale(0.9) rotate(-4deg)', opacity: 1, offset: 0.2 },
      { transform: 'translate(' + bx + 'px,' + by + 'px) scale(1) rotate(-4deg)', opacity: 1, offset: 0.75 },
      { transform: 'translate(' + bx + 'px,' + (by - 60) + 'px) scale(1.05) rotate(-4deg)', opacity: 0 }
    ], { duration: 1600, easing: 'ease-out', fill: 'forwards' });
    a.onfinish = function () { e.remove(); };
  }

  /* ---------------------------------------------------------
     Ekran zdobycia celu
     --------------------------------------------------------- */

  var zw = $('#zwyciestwo');
  var zwTimer = 0;
  var poZwyciestwie = [];

  function zwyciestwo(kat, nick, cele, potem) {
    if (potem) poZwyciestwie.push(potem);
    var t = KAT[kat].teksty;
    var nazwy = cele.map(function (c) { return c.nazwa; }).join(' + ');

    $('#zw-numer').textContent = t.zwNumer;
    $('#zw-tytul').textContent = t.zwTytul;
    $('#zw-opis').textContent = t.zwOpis.replace('{nick}', nick).replace('{cele}', nazwy);

    clearTimeout(zwTimer);
    $$('.moneta-deszcz', zw).forEach(function (m) { m.remove(); });
    zw.classList.remove('znika');
    zw.hidden = false;
    dzwieki.fanfara(kat);

    if (animowac) {
      var W = window.innerWidth, H = window.innerHeight;
      for (var i = 0; i < 40; i++) {
        var m = elem('div', 'moneta-deszcz');
        m.appendChild(ikona(KAT[kat].ikona));
        zw.appendChild(m);
        var x = los(-20, W - 20);
        var dryf = los(-80, 80);
        var obrot = los(-540, 540);
        var sk = los(0.6, 1.3);
        var a = m.animate([
          { transform: 'translate(' + x + 'px,-60px) rotate(0deg) scale(' + sk + ')' },
          { transform: 'translate(' + (x + dryf) + 'px,' + (H + 60) + 'px) rotate(' + obrot + 'deg) scale(' + sk + ')' }
        ], { duration: los(1400, 2600), delay: los(0, 900), easing: 'cubic-bezier(.4, 0, .9, .6)', fill: 'both' });
        a.onfinish = (function (m) { return function () { m.remove(); }; })(m);
      }
    }

    zwTimer = setTimeout(schowajZwyciestwo, 3800);
  }

  function schowajZwyciestwo() {
    if (zw.hidden || zw.classList.contains('znika')) return;
    clearTimeout(zwTimer);
    zw.classList.add('znika');
    zwTimer = setTimeout(function () {
      zw.hidden = true;
      zw.classList.remove('znika');
      var kolejka = poZwyciestwie;
      poZwyciestwie = [];
      kolejka.forEach(function (f) { f(); });
    }, animowac ? 350 : 0);
  }

  zw.addEventListener('click', schowajZwyciestwo);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') schowajZwyciestwo();
  });

  /* ---------------------------------------------------------
     Powiadomienia
     --------------------------------------------------------- */

  var toasty = $('#toasty');

  function toast(tekst, kolor, ikonaId, ms) {
    var t = elem('div', 'toast');
    if (kolor) t.setAttribute('data-kolor', kolor);
    t.appendChild(ikona(ikonaId || KAT[aktywna].ikona, 'vb'));
    t.appendChild(elem('span', null, tekst));
    toasty.appendChild(t);
    while (toasty.children.length > 2) toasty.removeChild(toasty.firstChild);

    setTimeout(function () {
      t.classList.add('znika');
      setTimeout(function () { t.remove(); }, animowac ? 350 : 0);
    }, ms || 3000);
  }

  /* ---------------------------------------------------------
     Ostatnie wpłaty
     --------------------------------------------------------- */

  var lista = $('#wplaty-lista');
  var pusto = $('#wplaty-pusto');

  function kiedy(t) {
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 45) return 'przed chwilą';
    var min = Math.round(s / 60);
    if (min < 60) return min + ' min temu';
    var godz = Math.round(min / 60);
    if (godz < 24) return godz + ' godz. temu';
    var d = new Date(t);
    return d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  }

  function wplatyAktywnej() {
    return stan.wplaty.filter(function (w) { return w.kat === aktywna; }).slice(0, 12);
  }

  function rysujWplaty() {
    lista.textContent = '';
    var wplaty = wplatyAktywnej();
    wplaty.forEach(function (w) {
      var k = karty[w.kat + ':' + w.komu];
      var li = elem('li');
      li.setAttribute('data-kolor', k.el.getAttribute('data-kolor'));

      var kto = elem('span', 'wp-kto');
      kto.appendChild(elem('b', null, w.kto));
      kto.appendChild(document.createTextNode(' dla '));
      kto.appendChild(elem('b', null, k.gracz.nick));

      var ile = elem('span', 'wp-ile');
      ile.appendChild(ikona(KAT[w.kat].ikona, 'vb'));
      ile.appendChild(document.createTextNode(fmt(w.ile)));

      li.appendChild(kto);
      li.appendChild(ile);
      if (w.msg) li.appendChild(elem('span', 'wp-msg', w.msg));
      li.appendChild(elem('span', 'wp-kiedy', kiedy(w.t)));
      lista.appendChild(li);
    });
    pusto.hidden = wplaty.length > 0;
  }

  setInterval(function () {
    var wplaty = wplatyAktywnej();
    $$('.wp-kiedy', lista).forEach(function (e, i) {
      if (wplaty[i]) e.textContent = kiedy(wplaty[i].t);
    });
  }, 30000);

  /* ---------------------------------------------------------
     Wspólne sumy online (api/zrzutka.js)
     Bez serwera (np. plik otwarty lokalnie) strona działa jak dawniej,
     tylko na localStorage.
     --------------------------------------------------------- */

  var ADRES_API = '/api/zrzutka';
  var CO_ILE_ODSWIEZAC = 10000;
  var online = false;
  var serwerPadl = false;
  var lotyTrwa = 0;
  var widzianeWplaty = {};
  var zaleglyStan = null;
  var mojeId = {};
  stan.wplaty.forEach(function (w) { if (w.id) mojeId[w.id] = true; });

  function noweId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pobierzZSerwera(animuj) {
    if (!window.fetch) return;
    fetch(ADRES_API, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) { serwerPadl = false; przyjmijSerwer(d, animuj); })
      .catch(function () { serwerPadl = true; ustawOnline(false); });
  }

  function wyslijNaSerwer(wpis) {
    if (!window.fetch || (serwerPadl && !online)) return;
    fetch(ADRES_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kat: wpis.kat, komu: wpis.komu, ile: wpis.ile, kto: wpis.kto, msg: wpis.msg || '', id: wpis.id })
    })
      .then(function (r) {
        if (r.status === 429) toast('Wolniej! Serwer przyjmuje najwyżej 30 wpłat na minutę.');
        return r.ok ? r.json() : Promise.reject(r.status);
      })
      .then(function (d) { przyjmijSerwer(d, true); })
      .catch(function () {
        if (online) toast('Serwer nie przyjął wpłaty — zniknie przy następnym odświeżeniu.');
      });
  }

  function ustawOnline(tak) {
    online = tak;
    html.classList.toggle('online', tak);
  }

  function przyjmijSerwer(d, animuj) {
    if (!d || !d.sumy || !Array.isArray(d.wplaty)) return;
    var pierwszy = !online;
    ustawOnline(true);
    // w trakcie lotu monet liczniki są w ruchu — poczekamy na koniec
    if (lotyTrwa > 0) {
      zaleglyStan = d;
      return;
    }
    if (pierwszy) animuj = false;

    // Serwer oddaje więcej wpłat, niż trzymamy lokalnie (60 vs 40) — dlatego
    // „znane” to wszystkie id kiedykolwiek widziane w tej karcie, a nie tylko
    // lokalna lista. Inaczej starsze wpłaty co 10 s wyskakiwały jako nowe.
    var teraz = Number(d.teraz) || Date.now();   // czas serwera, nie zegar tej przeglądarki
    var cudze = pierwszy ? [] : d.wplaty.filter(function (w) {
      return poprawnaWplata(w) && w.id && !widzianeWplaty[w.id] && !mojeId[w.id] &&
        !(w.t && teraz - w.t > 2 * 60 * 1000);   // po powrocie do karty bez zaległego spamu
    });
    d.wplaty.forEach(function (w) { if (w && w.id) widzianeWplaty[w.id] = true; });

    var zmiana = false;
    Object.keys(KAT).forEach(function (kat) {
      Object.keys(stan.sumy[kat]).forEach(function (id) {
        var v = Math.floor(Number(d.sumy[kat] && d.sumy[kat][id]));
        if (!isFinite(v) || v < 0) return;
        var k = karty[kat + ':' + id];
        if (v === stan.sumy[kat][id] && v === k.licznik.cel) return;
        var urosla = v > stan.sumy[kat][id];
        stan.sumy[kat][id] = v;
        k.licznik.ustaw(v, !animuj);
        if (animuj && urosla && kat === aktywna) odpal(k.el, 'blysk');
        rysujCel(k);
        zmiana = true;
      });
    });

    stan.wplaty = d.wplaty.filter(poprawnaWplata).slice(0, MAX_WPLAT);
    zapisz();

    if (zmiana || pierwszy) {
      sumaLicznik.ustaw(sumaKat(aktywna), !animuj);
      metalLicznik.ustaw(sumaKat('zeroad'), !animuj);
      Object.keys(KAT).forEach(rysujKorony);
      rysujRanking();
    }
    rysujWplaty();

    cudze.slice(0, 2).forEach(function (w) {
      var k = karty[w.kat + ':' + w.komu];
      if (!k) return;
      toast(w.kto + ' → ' + k.gracz.nick + ': ' + fmt(w.ile) + ' ' + odmiana(w.kat, w.ile),
        k.el.getAttribute('data-kolor'), KAT[w.kat].ikona, 2400);
    });
  }

  setInterval(function () {
    if (document.visibilityState === 'visible') pobierzZSerwera(true);
  }, CO_ILE_ODSWIEZAC);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') pobierzZSerwera(true);
  });

  /* ---------------------------------------------------------
     Zerowanie
     --------------------------------------------------------- */

  $('#btn-zeruj').addEventListener('click', function () {
    if (online) return;   // wspólnej zrzutki nie zeruje się z przeglądarki
    if (!window.confirm('Wyzerować wszystkie wpłaty w obu kategoriach? Odznaki zostają.')) return;
    var odznaki = stan.odznaki;
    var zaczepki = stan.zaczepki;
    stan = pustyStan();
    stan.odznaki = odznaki;
    stan.zaczepki = zaczepki;
    zapisz();
    Object.keys(karty).forEach(function (klucz) {
      var k = karty[klucz];
      k.licznik.ustaw(0, true);
      rysujCel(k);
    });
    Object.keys(KAT).forEach(rysujKorony);
    sumaLicznik.ustaw(0, true);
    metalLicznik.ustaw(0, true);
    rysujRanking();
    rysujWplaty();
    rysujProfil();
    toast(aktywna === 'zeroad'
      ? 'Skarbiec opróżniony. Nolli już liczy od nowa.'
      : 'Zrzutka wyzerowana. Krayo znowu w domyślnej skórce.');
  });

  /* ---------------------------------------------------------
     Tło: unoszące się monety (i iskry z pochodni w 0 A.D.)
     --------------------------------------------------------- */

  if (animowac) {
    var waski = window.innerWidth < 640;
    $$('.tlo-monety').forEach(function (tlo) {
      var ikonaId = tlo.getAttribute('data-ikona');
      var ile = waski ? 8 : 14;
      for (var i = 0; i < ile; i++) {
        var m = elem('span', 'moneta-tlo');
        m.appendChild(ikona(ikonaId));
        var rozmiar = los(22, 78);
        m.style.setProperty('--x', los(0, 96).toFixed(1) + '%');
        m.style.setProperty('--s', rozmiar.toFixed(0) + 'px');
        m.style.setProperty('--d', los(16, 34).toFixed(1) + 's');
        m.style.setProperty('--o', (-los(0, 34)).toFixed(1) + 's');
        m.style.setProperty('--r', ((Math.random() < 0.5 ? -1 : 1) * los(180, 540)).toFixed(0) + 'deg');
        m.style.setProperty('--op', rozmiar > 55 ? '0.14' : '0.24');
        m.style.setProperty('--b', rozmiar > 60 ? '2px' : '0px');
        tlo.appendChild(m);
      }

      if (ikonaId !== 'srebrnik') return;
      for (var j = 0; j < (waski ? 14 : 26); j++) {
        var s = elem('span', 'iskra-tlo');
        s.style.setProperty('--x', los(0, 100).toFixed(1) + '%');
        s.style.setProperty('--s', los(3, 7).toFixed(1) + 'px');
        s.style.setProperty('--d', los(7, 15).toFixed(1) + 's');
        s.style.setProperty('--o', (-los(0, 15)).toFixed(1) + 's');
        s.style.setProperty('--dx', los(-120, 120).toFixed(0) + 'px');
        s.style.setProperty('--op', los(0.4, 0.9).toFixed(2));
        tlo.appendChild(s);
      }
    });
  }

  /* ---------------------------------------------------------
     Start
     --------------------------------------------------------- */

  Object.keys(KAT).forEach(rysujKorony);
  zastosujKategorie(kategoriaZHasha());
  sprawdzOdznaki();
  pobierzZSerwera(false);

  /* ---------------------------------------------------------
     Sezon 1 — Hall of Fame
     Archiwum się nie zmienia: pobieramy je raz (GET ?sezon=1, cache Vercela)
     i trzymamy w localStorage na zawsze. Przy pierwszej wizycie w sezonie 2
     okno otwiera się samo — tylko jeśli archiwum dało się pobrać.
     --------------------------------------------------------- */

  var KLUCZ_SEZON1 = 'zrzutka:sezon1';
  var KLUCZ_INTRO = 'zrzutka:sezon2-intro';
  var oknoSezon = $('#okno-sezon');

  function archiwumSezonu1(gotowe) {
    try {
      var z = JSON.parse(localStorage.getItem(KLUCZ_SEZON1));
      if (z && z.sumy) return gotowe(z);
    } catch (e) { /* brak albo zepsute */ }
    if (!window.fetch) return gotowe(null);
    fetch(ADRES_API + '?sezon=1')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) {
        if (!d || !d.sumy) return gotowe(null);
        var zapis = { sumy: d.sumy, wplaty: Array.isArray(d.wplaty) ? d.wplaty.filter(poprawnaWplata) : [] };
        try { localStorage.setItem(KLUCZ_SEZON1, JSON.stringify(zapis)); } catch (e) { /* trudno */ }
        gotowe(zapis);
      })
      .catch(function () { gotowe(null); });
  }

  function portret(kat, id) {
    var k = karty[kat + ':' + id];
    var awatar = k && $('.awatar', k.el);
    if (!awatar) return elem('span', 'sezon-portret');
    var kopia = awatar.cloneNode(true);
    kopia.removeAttribute('class');
    kopia.removeAttribute('role');
    kopia.setAttribute('aria-hidden', 'true');
    var box = elem('span', 'sezon-portret');
    box.appendChild(kopia);
    return box;
  }

  function rysujSezon(dane) {
    var box = $('#sezon-wyniki');
    box.textContent = '';
    if (!dane) {
      box.appendChild(elem('p', 'sezon-pusto', 'Nie udało się pobrać wyników sezonu 1 — spróbuj później.'));
      return;
    }
    Object.keys(KAT).forEach(function (kat) {
      var cfg = KAT[kat];
      var sumy = dane.sumy[kat] || {};
      var ranking = Object.keys(cfg.gracze).map(function (id) {
        return { id: id, gracz: cfg.gracze[id], suma: Math.max(0, Math.floor(Number(sumy[id]) || 0)) };
      }).sort(function (a, b) { return b.suma - a.suma; });
      var sekcja = elem('section', 'sezon-kat');
      sekcja.setAttribute('data-kat', kat);
      var naglowek = elem('h3', 'sezon-kat-tytul');
      naglowek.appendChild(ikona(cfg.ikona, 'vb'));
      naglowek.appendChild(document.createTextNode(cfg.nazwa));
      var razem = ranking.reduce(function (a, r) { return a + r.suma; }, 0);
      naglowek.appendChild(elem('small', null, 'razem ' + fmt(razem)));
      sekcja.appendChild(naglowek);

      if (!razem) {
        sekcja.appendChild(elem('p', 'sezon-pusto', 'W tej kategorii nikt nic nie wpłacił.'));
        box.appendChild(sekcja);
        return;
      }
      // podium: 2 · 1 · 3
      var podium = elem('div', 'sezon-podium');
      [1, 0, 2].forEach(function (miejsce) {
        var r = ranking[miejsce];
        if (!r || !r.suma) return;
        var stopien = elem('div', 'sezon-stopien m' + (miejsce + 1));
        stopien.appendChild(portret(kat, r.id));
        stopien.appendChild(elem('span', 'sezon-nick', r.gracz.nick));
        var kwota = elem('span', 'sezon-kwota');
        kwota.appendChild(ikona(cfg.ikona, 'vb'));
        kwota.appendChild(document.createTextNode(fmt(r.suma)));
        stopien.appendChild(kwota);
        var blok = elem('div', 'sezon-blok', ['🥇', '🥈', '🥉'][miejsce]);
        stopien.appendChild(blok);
        podium.appendChild(stopien);
      });
      sekcja.appendChild(podium);
      var reszta = ranking.slice(3).filter(function (r) { return r.suma > 0; });
      if (reszta.length) {
        var lista = elem('ol', 'sezon-reszta');
        lista.setAttribute('start', '4');
        reszta.forEach(function (r) {
          var li = elem('li');
          li.appendChild(elem('span', null, r.gracz.nick));
          li.appendChild(elem('b', null, fmt(r.suma)));
          lista.appendChild(li);
        });
        sekcja.appendChild(lista);
      }
      box.appendChild(sekcja);
    });

    // największe pojedyncze wpłaty z końcówki sezonu (serwer trzymał ostatnie 60)
    var top = (dane.wplaty || []).slice().sort(function (a, b) { return b.ile - a.ile; }).slice(0, 3);
    if (top.length) {
      var hojni = elem('section', 'sezon-kat sezon-hojni');
      hojni.appendChild(elem('h3', 'sezon-kat-tytul', '💸 Najhojniejsze wpłaty końcówki sezonu'));
      var ol = elem('ol', 'sezon-reszta');
      top.forEach(function (w) {
        var li = elem('li');
        var kto = elem('span');
        kto.appendChild(elem('b', null, w.kto));
        kto.appendChild(document.createTextNode(' → ' + KAT[w.kat].gracze[w.komu].nick));
        li.appendChild(kto);
        var ile = elem('b');
        ile.appendChild(ikona(KAT[w.kat].ikona, 'vb'));
        ile.appendChild(document.createTextNode(fmt(w.ile)));
        li.appendChild(ile);
        ol.appendChild(li);
      });
      hojni.appendChild(ol);
      box.appendChild(hojni);
    }
  }

  function otworzSezon(intro) {
    $('#sezon-nad').hidden = !intro;
    $('#sezon-wyniki').textContent = '';
    $('#sezon-wyniki').appendChild(elem('p', 'sezon-pusto', 'Ładuję kronikę sezonu 1…'));
    if (typeof oknoSezon.showModal === 'function') { if (!oknoSezon.open) oknoSezon.showModal(); }
    else oknoSezon.setAttribute('open', '');
    archiwumSezonu1(rysujSezon);
  }

  function zamknijSezon() {
    if (typeof oknoSezon.close === 'function' && oknoSezon.open) oknoSezon.close();
    else oknoSezon.removeAttribute('open');
  }

  $$('[data-sezon-okno]').forEach(function (b) { b.addEventListener('click', function () { otworzSezon(false); }); });
  $('#sezon-x').addEventListener('click', zamknijSezon);
  $('#sezon-ok').addEventListener('click', zamknijSezon);
  oknoSezon.addEventListener('click', function (e) { if (e.target === oknoSezon) zamknijSezon(); });

  // pierwsza wizyta w sezonie 2: okno otwiera się samo (raz), jeśli archiwum jest dostępne
  if (czytajUstawienie(KLUCZ_INTRO) !== '1') {
    setTimeout(function () {
      archiwumSezonu1(function (dane) {
        if (!dane || (okno && okno.open) || document.querySelector('.minigra')) return;
        zapiszUstawienie(KLUCZ_INTRO, '1');
        otworzSezon(true);
      });
    }, 1400);
  }
})();
