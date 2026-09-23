/* ============================================================
   V-dolce dla noobów — logika zrzutki i animacje
   - kwoty i historia wpłat zapisują się w localStorage
   - monety lecą z okna do licznika karty (Web Animations API)
   - po zdobyciu celu: ekran „#1” i deszcz V-dolców
   ============================================================ */

(function () {
  'use strict';

  var GRACZE = {
    powpow: {
      nick: 'PowPow',
      cele: [
        { kwota: 950, nazwa: 'Karnet Bojowy' },
        { kwota: 2800, nazwa: 'Legendarna skórka do full boxa' },
        { kwota: 13500, nazwa: 'Bilet na Fortnite World Cup (w marzeniach)' }
      ],
      reakcje: [
        'Konradek z radości postawił full boxa. Na środku pustego pola.',
        'PowPow: „dzięki byku, od jutra gram rankedy na serio”.',
        'PowPow z wdzięczności zrobił trzy dziewięćdziesiątki. Nikt nie strzelał.',
        'Konradek obiecuje, że te V-dolce zwrócą się w pierwszym turnieju.',
        'PowPow: „spokojnie, mam boxa”. Tym razem na V-dolce.'
      ]
    },
    krayo: {
      nick: 'Krayo',
      cele: [
        { kwota: 800, nazwa: 'Jakakolwiek skórka, żeby nie brali go za bota' },
        { kwota: 2000, nazwa: 'Myszka, która „nie laguje”' },
        { kwota: 5000, nazwa: 'Korepetycje z budowania u PowPowa' }
      ],
      reakcje: [
        'Krayo kupił skórkę i zginął, zanim wyskoczył z autobusu. Ale dzięki!',
        'Krayo: „no, teraz to już na pewno nie będzie lagować”.',
        'Krayo z wrażenia wypadł poza mapę. Docenia.',
        'Krayo dalej nie umie grać, ale od teraz nie umie grać w stylu.',
        'Krayo próbował podziękować, ale postawił ścianę tyłem do ekranu.'
      ]
    },
    karp: {
      nick: 'Śliski Karp',
      cele: [
        { kwota: 950, nazwa: 'Karnet Bojowy (wnuczek pomoże kliknąć)' },
        { kwota: 3000, nazwa: 'Nowe okulary do celowania' },
        { kwota: 10000, nazwa: 'Fotel gamingowy z podparciem na krzyż' }
      ],
      reakcje: [
        'Dziadek Piotr dziękuje, tylko pyta, gdzie się to klika.',
        'Śliski Karp: „za moich czasów V-dolce to były złotówki”.',
        'Dziadek wydrukował potwierdzenie wpłaty i przykleił na lodówkę.',
        'Śliski Karp schował V-dolce w krzaku. Nikt ich nie znajdzie.',
        'Dziadek Piotr: „dziękuję, synku”. Mówi tak do wszystkich.'
      ]
    }
  };

  var MAKS = 1000000;
  var KLUCZ = 'vdolce-zrzutka-v1';
  var KLUCZ_NICK = 'vdolce-nick';
  var KLUCZ_DZWIEK = 'vdolce-dzwiek';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var mniejRuchu = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var maAnimacje = typeof document.body.animate === 'function';
  var animowac = maAnimacje && !mniejRuchu;

  /* ---------------------------------------------------------
     Drobiazgi
     --------------------------------------------------------- */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function los(a, b) { return a + Math.random() * (b - a); }

  // 13500 -> "13 500" (twarda spacja, żeby liczba się nie łamała)
  function fmt(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function odmiana(n) {
    if (n === 1) return 'V-dolec';
    var j = n % 10, d = n % 100;
    if (j >= 2 && j <= 4 && (d < 12 || d > 14)) return 'V-dolce';
    return 'V-dolców';
  }

  function ikonaVB(klasa) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    if (klasa) svg.setAttribute('class', klasa);
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#vbuck');
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

  /* ---------------------------------------------------------
     Stan (localStorage bywa zablokowany — wtedy działa bez zapisu)
     --------------------------------------------------------- */

  function pustyStan() {
    var sumy = {};
    Object.keys(GRACZE).forEach(function (id) { sumy[id] = 0; });
    return { sumy: sumy, wplaty: [] };
  }

  function wczytaj() {
    var s = pustyStan();
    try {
      var zapis = JSON.parse(localStorage.getItem(KLUCZ));
      if (zapis && zapis.sumy) {
        Object.keys(s.sumy).forEach(function (id) {
          var v = Number(zapis.sumy[id]);
          if (isFinite(v) && v > 0) s.sumy[id] = Math.floor(v);
        });
      }
      if (zapis && Array.isArray(zapis.wplaty)) {
        s.wplaty = zapis.wplaty.filter(function (w) {
          return w && GRACZE[w.komu] && isFinite(w.ile) && typeof w.kto === 'string';
        }).slice(0, 15);
      }
    } catch (e) { /* brak zapisu albo zepsuty JSON */ }
    return s;
  }

  function zapisz() {
    try { localStorage.setItem(KLUCZ, JSON.stringify(stan)); } catch (e) { /* trudno */ }
  }

  function czytajUstawienie(klucz) {
    try { return localStorage.getItem(klucz); } catch (e) { return null; }
  }

  function zapiszUstawienie(klucz, wartosc) {
    try { localStorage.setItem(klucz, wartosc); } catch (e) { /* trudno */ }
  }

  var stan = wczytaj();

  function sumaWszystkich() {
    return Object.keys(stan.sumy).reduce(function (a, id) { return a + stan.sumy[id]; }, 0);
  }

  /* ---------------------------------------------------------
     Liczniki, które płynnie dojeżdżają do wartości
     --------------------------------------------------------- */

  var aktywneLiczniki = [];
  var ostatniaKlatka = 0;

  function Licznik(el, wartosc) {
    this.el = el;
    this.cel = wartosc;
    this.pokazana = wartosc;
    el.textContent = fmt(wartosc);
  }

  Licznik.prototype.ustaw = function (v, odRazu) {
    this.cel = v;
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
     Dźwięk monet (syntezowany, bez plików)
     --------------------------------------------------------- */

  var dzwiekWl = czytajUstawienie(KLUCZ_DZWIEK) !== '0';
  var audio = null;

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

  function ton(a, czest, start, dlugosc, glosnosc, typ) {
    var t = a.currentTime + start;
    var o = a.createOscillator();
    var g = a.createGain();
    o.type = typ || 'square';
    o.frequency.setValueAtTime(czest, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(glosnosc, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dlugosc);
    o.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + dlugosc + 0.05);
  }

  // klasyczne „dzyń”: dwa szybkie tony, lekko w górę z każdą monetą
  function dzwiekMonety(i) {
    var a = kontekstAudio();
    if (!a) return;
    var p = Math.pow(2, Math.min(i, 12) / 24);
    ton(a, 988 * p, 0, 0.07, 0.035);
    ton(a, 1319 * p, 0.06, 0.2, 0.03);
  }

  function fanfara() {
    var a = kontekstAudio();
    if (!a) return;
    [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) {
      var dl = i === 5 ? 0.6 : 0.16;
      ton(a, f, i * 0.12, dl, 0.05, 'triangle');
      ton(a, f * 2, i * 0.12, dl, 0.015, 'square');
    });
  }

  var btnDzwiek = $('#btn-dzwiek');

  function rysujDzwiek() {
    btnDzwiek.setAttribute('aria-pressed', dzwiekWl ? 'true' : 'false');
    btnDzwiek.title = dzwiekWl ? 'Wycisz monety' : 'Włącz dźwięk monet';
  }

  btnDzwiek.addEventListener('click', function () {
    dzwiekWl = !dzwiekWl;
    zapiszUstawienie(KLUCZ_DZWIEK, dzwiekWl ? '1' : '0');
    rysujDzwiek();
    if (dzwiekWl) dzwiekMonety(0);
  });

  rysujDzwiek();

  /* ---------------------------------------------------------
     Karty graczy
     --------------------------------------------------------- */

  var karty = {};
  var sumaLicznik = new Licznik($('#suma'), sumaWszystkich());

  function aktualnyCel(id, suma) {
    var cele = GRACZE[id].cele;
    for (var i = 0; i < cele.length; i++) {
      if (suma < cele[i].kwota) return { nr: i, cel: cele[i] };
    }
    return { nr: cele.length, cel: null };
  }

  function ustawPasek(k, ulamek, odZera) {
    var p = Math.max(0, Math.min(1, ulamek));
    if (odZera && animowac) {
      k.pasek.classList.add('bez-animacji');
      k.pasek.style.setProperty('--p', 0);
      void k.pasek.offsetWidth;
      k.pasek.classList.remove('bez-animacji');
    }
    k.pasek.style.setProperty('--p', p);
  }

  function rysujCel(id, odZera) {
    var k = karty[id];
    var suma = stan.sumy[id];
    var cele = GRACZE[id].cele;
    var ac = aktualnyCel(id, suma);

    k.brakuje.textContent = '';
    if (ac.cel) {
      var brak = ac.cel.kwota - suma;
      k.etap.textContent = 'Cel ' + (ac.nr + 1) + '/' + cele.length;
      k.celNazwa.textContent = ac.cel.nazwa;
      k.celKwota.textContent = fmt(ac.cel.kwota);
      k.brakuje.appendChild(document.createTextNode('Brakuje jeszcze '));
      k.brakuje.appendChild(elem('b', null, fmt(brak)));
      k.brakuje.appendChild(document.createTextNode(' ' + odmiana(brak)));
      ustawPasek(k, suma / ac.cel.kwota, odZera);
    } else {
      k.etap.textContent = 'Wszystkie cele zdobyte';
      k.celNazwa.textContent = 'Teraz to już tylko wpłaty z serca';
      k.celKwota.textContent = fmt(cele[cele.length - 1].kwota);
      k.brakuje.textContent = 'Legenda zrzutki. Dzięki wam wszystkim!';
      ustawPasek(k, 1, odZera);
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('.karta'), function (el) {
    var id = el.getAttribute('data-gracz');
    if (!GRACZE[id]) return;
    karty[id] = {
      el: el,
      licznik: new Licznik($('[data-kwota]', el), stan.sumy[id]),
      ikona: $('.zebrano-kwota .vb', el),
      etap: $('[data-cel-etap]', el),
      celNazwa: $('[data-cel-nazwa]', el),
      celKwota: $('[data-cel-kwota]', el),
      pasek: $('[data-cel-pasek]', el),
      brakuje: $('[data-cel-brakuje]', el),
      ostatniaReakcja: -1
    };
    rysujCel(id);
    $('.btn-dofinansuj', el).addEventListener('click', function () { otworzOkno(id); });
  });

  /* ---------------------------------------------------------
     Okno dofinansowania
     --------------------------------------------------------- */

  var okno = $('#okno');
  var form = $('#okno-form');
  var poleIle = $('#pole-ile');
  var poleNick = $('#pole-nick');
  var blad = $('#okno-blad');
  var szybkie = document.querySelectorAll('.szybkie button');
  var wybrany = null;

  poleNick.value = czytajUstawienie(KLUCZ_NICK) || '';

  function otworzOkno(id) {
    wybrany = id;
    var g = GRACZE[id];
    var suma = stan.sumy[id];
    var ac = aktualnyCel(id, suma);

    okno.setAttribute('data-rzadkosc', karty[id].el.getAttribute('data-rzadkosc'));
    $('#okno-tytul').textContent = g.nick;

    var awatar = $('#okno-awatar');
    awatar.textContent = '';
    var kopia = $('.awatar', karty[id].el).cloneNode(true);
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

    poleIle.value = '';
    blad.textContent = '';
    zaznaczSzybki(null);

    if (typeof okno.showModal === 'function') okno.showModal();
    else okno.setAttribute('open', '');

    // na telefonie nie wyskakuje klawiatura od razu — są szybkie kwoty
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) poleIle.focus();
  }

  function zamknijOkno() {
    if (typeof okno.close === 'function' && okno.open) okno.close();
    else okno.removeAttribute('open');
  }

  function zaznaczSzybki(btn) {
    Array.prototype.forEach.call(szybkie, function (b) {
      b.classList.toggle('wybrany', b === btn);
    });
  }

  Array.prototype.forEach.call(szybkie, function (b) {
    b.addEventListener('click', function () {
      poleIle.value = b.getAttribute('data-ile');
      blad.textContent = '';
      zaznaczSzybki(b);
    });
  });

  poleIle.addEventListener('input', function () {
    blad.textContent = '';
    var pasuje = null;
    Array.prototype.forEach.call(szybkie, function (b) {
      if (b.getAttribute('data-ile') === poleIle.value) pasuje = b;
    });
    zaznaczSzybki(pasuje);
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

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!wybrany) return;

    var surowe = poleIle.value.trim();
    var ile = Math.floor(Number(surowe));

    if (surowe === '' || !isFinite(ile)) return pokazBlad('Wpisz, ile V-dolców chcesz wrzucić.');
    if (ile < 0) return pokazBlad('Nie można zabierać V-dolców biednym graczom!');
    if (ile === 0) return pokazBlad('Zero V-dolców? Tak to Krayo gra, a nie wpłaca.');
    if (ile > MAKS) return pokazBlad('Ej, tyle V-dolców nie ma nawet Epic. Maksymalnie ' + fmt(MAKS) + '.');

    var nick = poleNick.value.trim().replace(/\s+/g, ' ').slice(0, 24);
    zapiszUstawienie(KLUCZ_NICK, nick);

    var start = srodek($('#btn-wyslij'));
    zamknijOkno();
    wplac(wybrany, ile, nick || 'Anonimowy sponsor', start);
  });

  /* ---------------------------------------------------------
     Wpłata
     --------------------------------------------------------- */

  function wplac(id, ile, nick, start) {
    var k = karty[id];
    var przed = stan.sumy[id];
    var po = przed + ile;
    var celPrzed = aktualnyCel(id, przed).cel;
    var zdobyte = GRACZE[id].cele.filter(function (c) {
      return przed < c.kwota && po >= c.kwota;
    });

    stan.sumy[id] = po;
    stan.wplaty.unshift({ kto: nick, komu: id, ile: ile, t: Date.now() });
    if (stan.wplaty.length > 15) stan.wplaty.length = 15;
    zapisz();

    function koniec() {
      rysujWplaty();
      reakcja(id, ile);
      if (zdobyte.length) {
        // pasek zostaje pełny pod ekranem „#1”; nowy cel ładuje się po jego zamknięciu
        zwyciestwo(GRACZE[id].nick, zdobyte, function () { rysujCel(id, true); });
      } else {
        rysujCel(id);
      }
    }

    if (!animowac) {
      k.licznik.ustaw(po, true);
      sumaLicznik.ustaw(sumaWszystkich(), true);
      koniec();
      return;
    }

    // karta mogła uciec z ekranu (np. na telefonie) — dociągamy ją
    var r = k.ikona.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 10) {
      k.ikona.scrollIntoView({ block: 'center' });
    }

    var n = Math.max(5, Math.min(30, Math.round(4 + Math.log10(ile) * 5)));
    var cel = srodek(k.ikona);
    var wyplacone = 0;

    lotMonet(start, cel, n, function (i) {
      // dzielimy kwotę między monety tak, żeby suma zgadzała się co do sztuki
      var doTejPory = Math.round(ile * i / n);
      var porcja = doTejPory - wyplacone;
      wyplacone = doTejPory;

      k.licznik.dodaj(porcja);
      sumaLicznik.dodaj(porcja);
      ustawPasek(k, celPrzed ? k.licznik.cel / celPrzed.kwota : 1);
      k.ikona.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.45) rotate(-12deg)' },
        { transform: 'scale(1)' }
      ], { duration: 220, easing: 'ease-out' });
      dzwiekMonety(i);
    }, function () {
      var c = srodek(k.ikona);
      odpal(k.el, 'blysk');
      plywajacyNapis('+' + fmt(ile), c.x, c.y);
      wybuch(c.x, c.y, ile >= 5000 ? 30 : 18);
      koniec();
    });
  }

  function reakcja(id, ile) {
    var g = GRACZE[id];
    var k = karty[id];
    var nr;
    do {
      nr = Math.floor(Math.random() * g.reakcje.length);
    } while (g.reakcje.length > 1 && nr === k.ostatniaReakcja);
    k.ostatniaReakcja = nr;

    var rz = k.el.getAttribute('data-rzadkosc');
    toast(g.reakcje[nr], rz);
    if (ile >= 13500) {
      toast('Ale hojność! Ktoś tu chyba wygrał World Cup.', rz);
    } else if (ile < 10) {
      toast('Każdy V-dolec się liczy. Nawet ' + (ile === 1 ? 'ten jeden.' : 'te ' + ile + '.'), rz);
    }
  }

  /* ---------------------------------------------------------
     Efekty
     --------------------------------------------------------- */

  var fx = $('#fx');

  function lotMonet(start, cel, n, naLadowanie, naKoniec) {
    var czas = 820;
    var odstep = Math.max(28, Math.min(70, 1000 / n));
    var wyladowane = 0;

    for (var i = 0; i < n; i++) {
      var m = elem('div', 'moneta-lot');
      m.appendChild(ikonaVB());
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

  function wybuch(x, y, ile) {
    for (var i = 0; i < ile; i++) {
      var kat = (i / ile) * Math.PI * 2 + los(-0.2, 0.2);
      var dyst = los(50, 130);
      var dx = Math.cos(kat) * dyst, dy = Math.sin(kat) * dyst;
      var moneta = i % 3 === 0;
      var e;
      if (moneta) {
        e = elem('div', 'moneta-lot');
        e.appendChild(ikonaVB());
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
    var a = e.animate([
      { transform: 'translate(' + (x - w / 2) + 'px,' + (y - h / 2) + 'px) scale(0.4)', opacity: 0 },
      { transform: 'translate(' + (x - w / 2) + 'px,' + (y - h / 2 - 40) + 'px) scale(1.25)', opacity: 1, offset: 0.25 },
      { transform: 'translate(' + (x - w / 2) + 'px,' + (y - h / 2 - 70) + 'px) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translate(' + (x - w / 2) + 'px,' + (y - h / 2 - 110) + 'px) scale(0.9)', opacity: 0 }
    ], { duration: 1500, easing: 'ease-out', fill: 'forwards' });
    a.onfinish = function () { e.remove(); };
  }

  /* ---------------------------------------------------------
     Ekran zdobycia celu
     --------------------------------------------------------- */

  var zw = $('#zwyciestwo');
  var zwTimer = 0;
  var poZwyciestwie = [];

  function zwyciestwo(nick, cele, potem) {
    if (potem) poZwyciestwie.push(potem);
    $('#zw-opis').textContent = nick + ' zdobywa: ' +
      cele.map(function (c) { return c.nazwa; }).join(' + ');

    clearTimeout(zwTimer);
    Array.prototype.forEach.call(zw.querySelectorAll('.moneta-deszcz'), function (m) { m.remove(); });
    zw.classList.remove('znika');
    zw.hidden = false;
    fanfara();

    if (animowac) {
      var W = window.innerWidth, H = window.innerHeight;
      for (var i = 0; i < 40; i++) {
        var m = elem('div', 'moneta-deszcz');
        m.appendChild(ikonaVB());
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

    zwTimer = setTimeout(schowajZwyciestwo, 3600);
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

  function toast(tekst, rzadkosc) {
    var t = elem('div', 'toast');
    if (rzadkosc) t.setAttribute('data-rzadkosc', rzadkosc);
    t.appendChild(ikonaVB('vb'));
    t.appendChild(elem('span', null, tekst));
    toasty.appendChild(t);
    while (toasty.children.length > 3) toasty.removeChild(toasty.firstChild);

    setTimeout(function () {
      t.classList.add('znika');
      setTimeout(function () { t.remove(); }, animowac ? 350 : 0);
    }, 4500);
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

  function rysujWplaty() {
    lista.textContent = '';
    stan.wplaty.forEach(function (w) {
      var li = elem('li');
      li.setAttribute('data-rzadkosc', karty[w.komu].el.getAttribute('data-rzadkosc'));

      var kto = elem('span', 'wp-kto');
      kto.appendChild(elem('b', null, w.kto));
      kto.appendChild(document.createTextNode(' dla '));
      kto.appendChild(elem('b', null, GRACZE[w.komu].nick));

      var ile = elem('span', 'wp-ile');
      ile.appendChild(ikonaVB('vb'));
      ile.appendChild(document.createTextNode(fmt(w.ile)));

      li.appendChild(kto);
      li.appendChild(ile);
      li.appendChild(elem('span', 'wp-kiedy', kiedy(w.t)));
      lista.appendChild(li);
    });
    pusto.hidden = stan.wplaty.length > 0;
  }

  rysujWplaty();
  setInterval(function () {
    Array.prototype.forEach.call(lista.querySelectorAll('.wp-kiedy'), function (e, i) {
      if (stan.wplaty[i]) e.textContent = kiedy(stan.wplaty[i].t);
    });
  }, 30000);

  /* ---------------------------------------------------------
     Zerowanie
     --------------------------------------------------------- */

  $('#btn-zeruj').addEventListener('click', function () {
    if (!window.confirm('Na pewno wyzerować zrzutkę? Krayo znowu zostanie w domyślnej skórce.')) return;
    stan = pustyStan();
    zapisz();
    Object.keys(karty).forEach(function (id) {
      karty[id].licznik.ustaw(0, true);
      rysujCel(id);
    });
    sumaLicznik.ustaw(0, true);
    rysujWplaty();
    toast('Zrzutka wyzerowana. Krayo znowu w domyślnej skórce.');
  });

  /* ---------------------------------------------------------
     Unoszące się V-dolce w tle
     --------------------------------------------------------- */

  if (animowac) {
    var tlo = $('.tlo-monety');
    var ile = window.innerWidth < 640 ? 8 : 14;
    for (var i = 0; i < ile; i++) {
      var m = elem('span', 'moneta-tlo');
      m.appendChild(ikonaVB());
      var rozmiar = los(22, 78);
      m.style.setProperty('--x', los(0, 96).toFixed(1) + '%');
      m.style.setProperty('--s', rozmiar.toFixed(0) + 'px');
      m.style.setProperty('--d', los(16, 34).toFixed(1) + 's');
      m.style.setProperty('--o', (-los(0, 34)).toFixed(1) + 's');
      m.style.setProperty('--r', (Math.random() < 0.5 ? -1 : 1) * los(180, 540).toFixed(0) + 'deg');
      m.style.setProperty('--op', (rozmiar > 55 ? 0.14 : 0.24).toFixed(2));
      m.style.setProperty('--b', rozmiar > 60 ? '2px' : '0px');
      tlo.appendChild(m);
    }
  }
})();
