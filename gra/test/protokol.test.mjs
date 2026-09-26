/* Testy protokołu sieciowego: całe partie granych przez boty klientów
   z opóźnieniami, przesuniętym zegarem, wyjściami i zerwaniem połączenia.
   Serwer to atrapa logu zdarzeń zachowująca się jak api/arena.js.

   node gra/test/protokol.test.mjs

   Co sprawdzamy:
   - zbieżność: na granicy każdej tury lokalna symulacja każdego klienta
     zgadza się z kanonem co do bitu (licznik korekt = 0), a na końcu
     wszyscy mają identyczny stan;
   - żywotność: partia nigdy nie staje — nieobecni tracą turę,
     a wychodzący znikają z areny;
   - ścieżki awaryjne: wyścig pasa gospodarza ze strzałem, autor znikający
     przed opublikowaniem stanu, widz dołączający w trakcie. */

import * as S from '../src/sim.js';
import * as P from '../src/protokol.js';
import { WEAPONS, WEAPON_ORDER } from '../src/weapons.js';
import { mulberry32 } from '../src/rng.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    passed++;
    console.log('  \x1b[32mOK\x1b[0m  ' + name + ' \x1b[2m(' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)\x1b[0m');
  } catch (e) {
    failed++;
    console.log('  \x1b[31mBLAD\x1b[0m ' + name + '\n       ' + e.message);
  }
}
function assert(c, m) { if (!c) throw new Error(m || 'oczekiwano prawdy'); }

const kopia = (x) => JSON.parse(JSON.stringify(x));
const KLATKA = 1000 / 60;

/* ---------- atrapa serwera ---------- */

class Serwer {
  constructor() {
    this.czas = 1_000_000;
    this.log = [];
    this.obecnosc = {};
    this.ruch = null;
  }
  przyjmij(z) {
    if (z.t === 'puls') { this.obecnosc[z.id] = this.czas; return; }
    if (z.t === 'ruch') { this.ruch = { ...kopia(z), st: this.czas }; return; }
    if (z.t === 'wyjdz') delete this.obecnosc[z.id];
    this.log.push({ ...kopia(z), st: this.czas });
  }
}

/* ---------- klient: sieć z opóźnieniem + bot + protokół ---------- */

class Klient {
  constructor(id, serwer, rng, o = {}) {
    this.id = id;
    this.serwer = serwer;
    this.rng = rng;
    this.opoznienie = o.opoznienie ?? 120;         // ms w jedną stronę (± rozrzut)
    this.rozrzut = o.rozrzut ?? 80;
    this.coIle = o.coIle ?? 1000;                  // ms między odpytaniami
    this.skos = o.skos ?? 0;                       // błąd zegara klienta wobec serwera, ms
    this.gracz = o.gracz ?? true;                  // bot gra, gdy ma turę
    this.polaczony = true;
    this.poczta = [];                              // [czas, fn] — zdarzenia sieciowe w locie
    this.nastepnyGet = serwer.czas + rng() * this.coIle;
    this.nastepnyPuls = serwer.czas;
    this.pokoj = null;
    this.obecnosc = {};
    this.obecnoscTeraz = 0;
    this.odczytano = -Infinity;
    this.r = null;
    this.plan = null;
    this.wyslane = [];
    this.poStanie = [];     // hash stanu po przyjęciu każdego kanonicznego stanu: [nr, hash]
  }

  lat() { return Math.max(10, this.opoznienie + (this.rng() * 2 - 1) * this.rozrzut); }

  wyslij(z) {
    if (!this.polaczony) return;
    const tresc = kopia(z);
    this.wyslane.push(tresc);
    this.poczta.push([this.serwer.czas + this.lat(), () => this.serwer.przyjmij(tresc)]);
  }

  pobierz() {
    const s = this.serwer;
    const naSerwerze = s.czas + this.lat() / 2;
    // odpowiedź = to, co serwer ma w chwili przyjęcia zapytania
    this.poczta.push([naSerwerze, () => {
      const log = kopia(s.log);
      const obecnosc = { ...s.obecnosc };
      const ruch = s.ruch ? kopia(s.ruch) : null;
      const teraz = s.czas;
      this.poczta.push([s.czas + this.lat() / 2, () => {
        if (!this.polaczony) return;
        this.pokoj = P.zloz(log);
        this.obecnosc = obecnosc;
        this.obecnoscTeraz = teraz;
        this.odczytano = this.serwer.czas;
        this.ruch = ruch;
      }]);
    }]);
  }

  tik() {
    const s = this.serwer;
    // doręcz, co doleciało
    this.poczta.sort((a, b) => a[0] - b[0]);
    while (this.poczta.length && this.poczta[0][0] <= s.czas) this.poczta.shift()[1]();
    if (!this.polaczony) return;

    if (s.czas >= this.nastepnyPuls) { this.nastepnyPuls = s.czas + 8000; this.wyslij({ t: 'puls', id: this.id }); }
    if (s.czas >= this.nastepnyGet) {
      this.pobierz();
      const faza = this.r && this.r.state.phase;
      const szybko = this.r && (faza === 'koniec' || this.r.mojaAkcja);
      // ucieczkę po strzale oglądamy na żywo — jak przez WebSocket, często
      this.nastepnyGet = s.czas + (faza === 'odwrot' ? 150 : szybko ? 400 : this.coIle);
    }

    if (!this.pokoj) return;
    if (!this.r && this.pokoj.seed !== null && (this.pokoj.faza === 'gra' || this.pokoj.faza === 'koniec')) {
      this.r = P.nowaRozgrywka(this.pokoj, this.id);
      this.r.sledz = (nr, st) => this.poStanie.push([nr, S.stateHash(st)]);
    }
    if (!this.r) return;

    const ctx = {
      teraz: s.czas + this.skos,
      dt: KLATKA / 1000,
      obecnosc: this.obecnosc,
      obecnoscTeraz: this.obecnoscTeraz,
      obecnoscSwieza: s.czas - this.odczytano < 6000
    };
    this.bot(ctx);
    const przed = this.r.state.turnNumber;
    P.klatka(this.r, this.pokoj, ctx);
    this.r.ui.length = 0;
    if (this.r.state.turnNumber !== przed) this.plan = null;
    while (this.r.doWyslania.length) this.wyslij(this.r.doWyslania.shift());
  }

  /* Bot: myśli, czasem idzie albo skacze, wybiera broń i strzela.
     Czasem nic nie robi (koniec czasu), czasem trzyma spust do pełna. */
  bot(ctx) {
    if (this.gracz && this.r && P.mogeUciekac(this.r)) {
      // ucieczka po strzale: bieg w losową stronę, czasem skok — to leci paczkami do innych
      const st = this.r.state;
      if (!this.ucieczka || ctx.teraz > this.ucieczka.do) {
        // krótkie kroki i rzadkie skoki — bot nie ma skakać do lawy co turę
        const k = this.rng();
        this.ucieczka = { do: ctx.teraz + 200 + this.rng() * 500, lewo: k < 0.25, prawo: k > 0.75 };
        if (this.rng() < 0.1) S.jump(st);
      }
      st.input.left = this.ucieczka.lewo;
      st.input.right = this.ucieczka.prawo;
      return;
    }
    if (!this.gracz || !this.r || !P.mogeGrac(this.r, this.pokoj)) return;
    const st = this.r.state;
    const w = S.activeWorm(st);
    if (!this.plan) {
      const rng = this.rng;
      const dostepne = WEAPON_ORDER.filter((b) => (w.amunicja[b] ?? 1) > 0);
      this.plan = {
        start: ctx.teraz + 400 + rng() * 3500,
        idz: rng() < 0.4 ? (rng() < 0.5 ? -1 : 1) : 0,
        idzMs: 200 + rng() * 900,
        skok: rng() < 0.25,
        bron: dostepne[Math.floor(rng() * dostepne.length)],
        kat: -0.25 - rng() * 1.2,
        trzymaj: 150 + rng() * 1800,     // > 1400 ms = auto-strzał przy pełnej mocy
        nic: rng() < 0.08,               // przeczeka turę
        etap: 0
      };
    }
    const p = this.plan;
    if (p.nic || ctx.teraz < p.start) return;
    const t = ctx.teraz - p.start;
    if (p.etap === 0) {
      st.input.left = p.idz < 0;
      st.input.right = p.idz > 0;
      if (t > p.idzMs) {
        st.input.left = st.input.right = false;
        if (p.skok) S.jump(st);
        p.etap = 1;
        p.t1 = t;
      }
    } else if (p.etap === 1 && t > p.t1 + 120) {
      const cel = st.worms.filter((o) => o.alive && o.id !== w.id)
        .sort((a, b) => Math.abs(a.x - w.x) - Math.abs(b.x - w.x))[0];
      st.weapon = p.bron;
      if (cel && WEAPONS[p.bron].celowany) S.ustawCel(st, cel.x, cel.y);
      const kier = cel && cel.x < w.x ? -1 : 1;
      S.ustawCelownik(st, kier > 0 ? p.kat : Math.PI - p.kat);
      if (!S.startCharging(st)) { st.weapon = 'bazooka'; S.startCharging(st); }
      p.etap = 2;
      p.t2 = t;
    } else if (p.etap === 2 && t > p.t2 + p.trzymaj) {
      S.releaseFire(st);
      p.etap = 3;
    }
  }
}

/* ---------- przebieg partii ---------- */

function partia({ seed = 1, n = 3, klienci = {}, zdarzenia = [], maksSek = 900, doTury = Infinity, widzowie = [] }) {
  const rng = mulberry32(seed);
  const serwer = new Serwer();
  const ids = Array.from({ length: n }, (_, i) => 'k' + i);
  const lista = ids.map((id, i) => new Klient(id, serwer, mulberry32(seed * 31 + i), klienci[id] || {}));
  for (const k of lista) serwer.przyjmij({ t: 'puls', id: k.id });
  serwer.przyjmij({
    t: 'nowa', seed: (rng() * 0xffffffff) >>> 0,
    gracze: ids.map((id) => ({ id, name: id, color: '#f60' }))
  });

  const koniec = serwer.czas + maksSek * 1000;
  const zaplanowane = zdarzenia.slice().sort((a, b) => a.po - b.po);
  const start = serwer.czas;
  const przebieg = { serwer, klienci: lista, start, wszyscy: lista };

  while (serwer.czas < koniec) {
    serwer.czas += KLATKA;
    while (zaplanowane.length && serwer.czas - start >= zaplanowane[0].po * 1000) {
      zaplanowane.shift().fn(przebieg);
    }
    for (const k of przebieg.wszyscy) k.tik();
    const p = P.zloz(serwer.log);
    if (p.faza === 'koniec' || p.tura >= doTury) {
      // jeszcze chwila, żeby wszyscy przyjęli ostatni stan i dokończyli animację
      // (25 s: ostatni strzał może przyjść ~5 s po ucieczce, potem 5 s ucieczki u odbiorcy i lot)
      for (let i = 0; i < 60 * 25; i++) { serwer.czas += KLATKA; for (const k of przebieg.wszyscy) k.tik(); }
      break;
    }
  }
  przebieg.pokoj = P.zloz(serwer.log);
  return przebieg;
}

/* Zbieżność: tuż po przyjęciu każdego kanonicznego stanu wszyscy mają
   identyczny świat; gdy partia się skończyła — także na samym końcu.
   (W środku tury stany się różnią i tak ma być: gracz z turą chodzi
   i celuje lokalnie, reszta widzi to dopiero w strzale.) */
function zgodnoscKoncowa(pr) {
  const p = pr.pokoj;
  const polaczeni = pr.wszyscy.filter((k) => k.polaczony && k.r);
  if (p.faza === 'koniec') {
    const hashe = new Set(polaczeni.map((k) => S.stateHash(k.r.state)));
    assert(hashe.size === 1, 'klienci skonczyli z roznym stanem (' + hashe.size + ' wersji): ' +
      polaczeni.map((k) => k.id + '=' + k.r.state.turnNumber + '/' + k.r.state.phase).join(' '));
  }
  const poNr = new Map();
  for (const k of polaczeni) {
    for (const [nr, h] of k.poStanie) {
      if (!poNr.has(nr)) poNr.set(nr, h);
      else assert(poNr.get(nr) === h, 'po turze ' + nr + ' klient ' + k.id + ' ma inny stan');
    }
  }
}

function najdluzszaTura(pr) {
  const zd = pr.serwer.log;
  let poprz = zd.find((z) => z.t === 'nowa').st, maks = 0;
  const p = P.zloz(zd);
  for (const [, z] of p.stany) { maks = Math.max(maks, z.st - poprz); poprz = z.st; }
  return maks / 1000;
}

console.log('\nPARTIE BEZ ZAKLOCEN');

await test('trzech graczy do konca partii: zero rozjazdow, ten sam stan', () => {
  for (const seed of [1, 2]) {
    const pr = partia({
      seed, n: 3,
      klienci: { k0: { opoznienie: 60 }, k1: { opoznienie: 250, rozrzut: 200, skos: 700 }, k2: { opoznienie: 140, coIle: 1400, skos: -900 } }
    });
    assert(pr.pokoj.faza === 'koniec', 'partia nie doszla do konca (tura ' + pr.pokoj.tura + ')');
    zgodnoscKoncowa(pr);
    for (const k of pr.klienci) {
      assert(k.r.statystyki.korekty === 0, 'klient ' + k.id + ' musial korygowac stan ' + k.r.statystyki.korekty + ' razy');
      assert(k.r.statystyki.przesymulowania === 0, 'klient ' + k.id + ' przesymulowywal ture');
    }
    console.log('       seed ' + seed + ': ' + pr.pokoj.tura + ' tur, najdluzsza ' + najdluzszaTura(pr).toFixed(1) + ' s');
  }
});

await test('szesciu graczy z duzymi opoznieniami', () => {
  const klienci = {};
  for (let i = 0; i < 6; i++) klienci['k' + i] = { opoznienie: 80 + i * 90, rozrzut: 150, coIle: 900 + i * 150, skos: (i - 3) * 400 };
  const pr = partia({ seed: 7, n: 6, klienci, doTury: 30 });
  zgodnoscKoncowa(pr);
  for (const k of pr.klienci) assert(k.r.statystyki.korekty === 0, 'korekty u ' + k.id);
  assert(pr.pokoj.tura >= 30 || pr.pokoj.faza === 'koniec', 'partia stanela na turze ' + pr.pokoj.tura);
});

await test('zaden strzal nie przepada (kazda akcja strzal w logu ma swoj wybuch u wszystkich)', () => {
  // seed z długą partią — test liczy strzały. Od 4.2 boty uciekają po strzale i przy
  // niektórych seedach szybko wbiegają do lawy (np. seed 4: koniec po 2 turach).
  const pr = partia({ seed: 9, n: 2, doTury: 20 });
  const strzaly = [...pr.pokoj.akcje.values()].filter((a) => a.t === 'strzal').length;
  const wyslane = pr.klienci.reduce((s, k) => s + k.wyslane.filter((z) => z.t === 'strzal').length, 0);
  assert(strzaly > 5, 'za malo strzalow w partii: ' + strzaly);
  assert(wyslane >= strzaly, 'wyslanych strzalow mniej niz w logu');
  zgodnoscKoncowa(pr);
});

await test('ucieczka na zywo: odbiorca gra strzal i ucieczke ulamek sekundy za strzelcem', () => {
  const serwer = new Serwer();
  const ids = ['a', 'b', 'c'];
  // odświeżanie co 150 ms udaje WebSocket (serwer i tak rozsyła każdą zmianę od razu)
  const kl = ids.map((id, i) => new Klient(id, serwer, mulberry32(90 + i), { opoznienie: 60, rozrzut: 30, coIle: 150 }));
  for (const k of kl) serwer.przyjmij({ t: 'puls', id: k.id });
  serwer.przyjmij({ t: 'nowa', seed: 777, gracze: ids.map((id) => ({ id, name: id, color: '#fff' })) });
  let maks = 0, pomiary = 0;
  for (let i = 0; i < 60 * 150 && P.zloz(serwer.log).tura < 6; i++) {
    serwer.czas += KLATKA;
    for (const k of kl) k.tik();
    const autor = kl.find((k) => k.r && k.r.state.odwrotNagranie && k.r.state.phase === 'odwrot');
    if (!autor || autor.r.state.odwrotKrok < 60) continue;
    for (const k of kl) {
      if (k === autor || !k.r || k.r.state.turnNumber !== autor.r.state.turnNumber) continue;
      const krok = k.r.state.phase === 'odwrot' ? k.r.state.odwrotKrok : k.r.state.phase === 'aim' ? 0 : S.ODWROT_KROKI;
      maks = Math.max(maks, autor.r.state.odwrotKrok - krok);
      pomiary++;
    }
  }
  assert(pomiary > 300, 'za malo pomiarow: ' + pomiary);
  assert(maks * S.DT < 0.8, 'odbiorca za daleko za strzelcem: ' + (maks * S.DT).toFixed(2) + ' s');
  console.log('       najwieksze opoznienie ucieczki u odbiorcy: ' + (maks * S.DT).toFixed(2) + ' s (dawniej ~5 s)');
  zgodnoscKoncowa({ serwer, pokoj: P.zloz(serwer.log), wszyscy: kl, klienci: kl });
  for (const k of kl) assert(k.r.statystyki.korekty === 0, 'korekty u ' + k.id);
});

console.log('\nWYJSCIA I ROZLACZENIA');

await test('przycisk wyjscia w trakcie cudzej tury: robal znika na granicy tury', () => {
  const pr = partia({
    seed: 11, n: 3, doTury: 14,
    zdarzenia: [{ po: 40, fn: (p) => {
      const k = p.klienci.find((x) => x.r && x.pokoj && x.pokoj.aktywny !== x.id) || p.klienci[2];
      for (const z of P.opuszczam(k.r, k.pokoj)) k.wyslij(z);
      k.odszedlPo = p.serwer.czas;
      k.polaczony = false;
      p.odszedl = k.id;
    } }]
  });
  const p = pr.pokoj;
  assert(p.odeszli.has(pr.odszedl), 'serwer nie odnotowal wyjscia');
  const snap = p.ostatniStan.snap;
  const r = snap.robale.find((x) => x.id === pr.odszedl);
  assert(r.odszedl && !r.alive, 'robal gracza, ktory wyszedl, zostal na arenie');
  // nikt nie dostal tury po wyjsciu
  for (const [nr, a] of p.akcje) {
    if (a.st > pr.klienci.find((k) => k.id === pr.odszedl).odszedlPo + 5000) {
      assert(a.id !== pr.odszedl && a.za !== pr.odszedl, 'tura ' + nr + ' nalezala do gracza, ktory wyszedl');
    }
  }
  zgodnoscKoncowa({ ...pr, wszyscy: pr.klienci.filter((k) => k.id !== pr.odszedl) });
});

await test('wyjscie we wlasnej turze: tura oddana od razu, gra idzie dalej', () => {
  let kiedy = null, kto = null;
  const pr = partia({
    seed: 12, n: 3, doTury: 10,
    zdarzenia: [{ po: 5, fn: (p) => {
      const k = p.klienci.find((x) => x.r && P.mogeGrac(x.r, x.pokoj));
      if (!k) return;
      kto = k.id;
      kiedy = p.serwer.czas;
      for (const z of P.opuszczam(k.r, k.pokoj)) k.wyslij(z);
      k.polaczony = false;
    } }]
  });
  assert(kto, 'w chwili testu nikt nie mial tury');
  const p = pr.pokoj;
  const stanPo = [...p.stany.values()].find((z) => z.st > kiedy);
  assert(stanPo, 'po wyjsciu zadna tura sie nie zamknela');
  assert((stanPo.st - kiedy) / 1000 < 8, 'zamkniecie tury trwalo ' + ((stanPo.st - kiedy) / 1000).toFixed(1) + ' s');
  assert(stanPo.snap.robale.find((x) => x.id === kto).odszedl, 'wychodzacy nie zniknal na pierwszej granicy');
  zgodnoscKoncowa({ ...pr, wszyscy: pr.klienci.filter((k) => k.id !== kto) });
});

await test('zamkniecie karty bez sladu: tury oddawane po 15 s, wyrzucenie po 90 s', () => {
  let znikl = null, kiedy = null;
  const pr = partia({
    seed: 13, n: 3, doTury: 40, maksSek: 1200,
    zdarzenia: [{ po: 20, fn: (p) => { const k = p.klienci[1]; k.polaczony = false; znikl = k.id; kiedy = p.serwer.czas; } }]
  });
  const p = pr.pokoj;
  // tury zniklego po jego zniknieciu: oddane przez gospodarza, szybko
  const turyZniklego = [...p.akcje.values()].filter((a) => a.za === znikl && a.st > kiedy);
  for (const a of turyZniklego) {
    const odkad = [...p.stany.values()].filter((z) => z.nr === a.nr - 1)[0];
    const start = odkad ? odkad.st : p.startSt;
    assert((a.st - start) / 1000 < P.ROZLACZONY_PAS + 6, 'tura nieobecnego oddana po ' + ((a.st - start) / 1000).toFixed(1) + ' s');
  }
  const usuniety = [...p.stany.values()].find((z) => z.snap.robale.find((x) => x.id === znikl && x.odszedl));
  assert(usuniety, 'nieobecny nie zostal wyrzucony (tura ' + p.tura + ')');
  const poIlu = (usuniety.st - kiedy) / 1000;
  assert(poIlu >= P.ROZLACZONY_WYRZUC - 10 && poIlu < P.ROZLACZONY_WYRZUC + 50, 'wyrzucony po ' + poIlu.toFixed(0) + ' s');
  zgodnoscKoncowa({ ...pr, wszyscy: pr.klienci.filter((k) => k.id !== znikl) });
});

await test('scenariusz: strzal, a potem autor znika — partia rusza dalej', () => {
  const serwer = new Serwer();
  const rng = mulberry32(5);
  const ids = ['a', 'b', 'c'];
  const kl = ids.map((id, i) => new Klient(id, serwer, mulberry32(50 + i), { opoznienie: 100 }));
  for (const k of kl) serwer.przyjmij({ t: 'puls', id: k.id });
  serwer.przyjmij({ t: 'nowa', seed: 4242, gracze: ids.map((id) => ({ id, name: id, color: '#fff' })) });
  let autor = null, kiedy = null;
  for (let i = 0; i < 60 * 240; i++) {
    serwer.czas += KLATKA;
    for (const k of kl) {
      k.tik();
      if (!autor && k.polaczony && k.wyslane.some((z) => z.t === 'strzal')) {
        autor = k; kiedy = serwer.czas; k.polaczony = false;   // znika tuż po strzale
      }
    }
    const p = P.zloz(serwer.log);
    if (autor && p.tura >= 3) break;
  }
  void rng;
  for (let i = 0; i < 120; i++) { serwer.czas += KLATKA; for (const k of kl) k.tik(); }
  assert(autor, 'nikt nie strzelil');
  const p = P.zloz(serwer.log);
  assert(p.tura >= 3, 'partia stanela po zniknieciu autora (tura ' + p.tura + ')');
  const pierwszy = p.stany.get(0);
  assert(pierwszy && (pierwszy.st - kiedy) / 1000 < 20, 'stan zastepczy po ' + (pierwszy ? ((pierwszy.st - kiedy) / 1000).toFixed(1) : '∞') + ' s');
  zgodnoscKoncowa({ serwer, pokoj: p, wszyscy: kl.filter((k) => k !== autor), klienci: kl });
});

await test('wyscig: karta wlasciciela w tle, gospodarz oddaje ture, wlasciciel wraca i strzela', () => {
  let wyscigi = 0, przesymulowania = 0;
  for (const seed of [31, 32, 33, 34]) {
    const serwer = new Serwer();
    const ids = ['a', 'b', 'c'];
    const kl = ids.map((id, i) => new Klient(id, serwer, mulberry32(seed * 7 + i), { opoznienie: 150, rozrzut: 120 }));
    for (const k of kl) {
      serwer.przyjmij({ t: 'puls', id: k.id });
      k.nastepnyGet = serwer.czas;
    }
    serwer.przyjmij({ t: 'nowa', seed: seed * 1000, gracze: ids.map((id) => ({ id, name: id, color: '#fff' })) });
    const p0 = P.zloz(serwer.log);
    const wl = kl.find((k) => k.id === p0.aktywny);
    wl.gracz = false;
    let etap = 0, schowanyOd = 0;
    for (let i = 0; i < 60 * 200; i++) {
      serwer.czas += KLATKA;
      for (const k of kl) k.tik();
      if (etap === 0 && wl.r) { etap = 1; wl.polaczony = false; schowanyOd = serwer.czas; }
      // wraca dokładnie wtedy, gdy gospodarz oddaje jego turę (±1 s)
      if (etap === 1 && serwer.czas - schowanyOd > (P.ROZLACZONY_PAS + 1 + (seed % 3) * 0.4) * 1000) {
        etap = 2;
        wl.polaczony = true;
        wl.poczta.length = 0;
        const r = wl.r;
        if (r.state.phase === 'aim') {
          r.state.power = 0;
          r.state.charging = true;
          r.state.power = 0.6;
          const akcja = S.releaseFire(r.state);
          r.state.akcjeDoWyslania.length = 0;
          wl.wyslij({ t: 'strzal', nr: r.state.turnNumber, id: wl.id, ...akcja });
          r.mojaAkcja = { t: 'strzal', nr: r.state.turnNumber, id: wl.id, ...akcja };
          r.zastosowana = P.kluczAkcji(r.mojaAkcja);
        }
        wl.nastepnyGet = serwer.czas;
        wl.gracz = true;
      }
      if (P.zloz(serwer.log).tura >= 5) break;
    }
    const p = P.zloz(serwer.log);
    assert(p.tura >= 5 || p.faza === 'koniec', 'partia stanela po wyscigu (seed ' + seed + ', tura ' + p.tura + ')');
    const a0 = p.akcje.get(0);
    if (a0.t === 'pas' && wl.wyslane.some((z) => z.t === 'strzal' && z.nr === 0)) wyscigi++;
    przesymulowania += wl.r.statystyki.przesymulowania + wl.r.statystyki.skoki;
    zgodnoscKoncowa({ serwer, pokoj: p, wszyscy: kl, klienci: kl });
  }
  assert(wyscigi > 0, 'w zadnym przebiegu strzal nie przegral z pasem — test niczego nie sprawdzil');
  assert(przesymulowania > 0, 'przegrany strzal nie zostal cofniety u wlasciciela');
  console.log('       wyscigi przegrane przez strzal: ' + wyscigi + '/4, cofniete lokalnie: ' + przesymulowania);
});

await test('widz dolacza w trakcie i widzi ten sam stan', () => {
  const pr = partia({
    seed: 21, n: 3, doTury: 16,
    zdarzenia: [{ po: 60, fn: (p) => {
      const w = new Klient('widz', p.serwer, mulberry32(99), { opoznienie: 200, gracz: false });
      p.serwer.przyjmij({ t: 'puls', id: 'widz' });
      p.wszyscy = [...p.wszyscy, w];
      p.widz = w;
    } }]
  });
  assert(pr.widz && pr.widz.r, 'widz nie zbudowal planszy');
  assert(pr.widz.r.obserwator, 'widz nie jest obserwatorem');
  zgodnoscKoncowa(pr);
});

await test('karta w tle przez minute: po powrocie dogania log bez rozjazdu', () => {
  let schowany = null;
  const pr = partia({
    seed: 22, n: 3, doTury: 18,
    klienci: { k2: { gracz: false } },
    zdarzenia: [
      { po: 30, fn: (p) => { schowany = p.klienci[2]; schowany.polaczony = false; } },
      { po: 70, fn: () => { schowany.polaczony = true; schowany.nastepnyGet = 0; schowany.nastepnyPuls = 0; } }
    ]
  });
  zgodnoscKoncowa(pr);
  assert(schowany.r.statystyki.skoki > 0, 'powracajacy nie skoczyl do najnowszego stanu');
});

console.log('\nLOBBY');

await test('odliczanie do startu: 5 s po gotowosci, wpisy starej wersji i „na zaraz” sa pomijane', () => {
  const st = 1_000_000;
  const pelny = { t: 'odliczanie', do: st + P.ODLICZANIE_S * 1000, st, v: P.WERSJA };
  assert(P.zloz([pelny]).odliczanieDo === pelny.do, 'zwykle odliczanie nie przeszlo');
  assert(P.zloz([{ t: 'odliczanie', do: st + 20000, st }]).odliczanieDo === null, 'stare 20 s bez gotowosci przeszlo');
  const p = P.zloz([pelny, { t: 'odliczanie', do: st + 1800, st: st + 1000, v: P.WERSJA }]);
  assert(p.odliczanieDo === pelny.do, 'przyspieszenie przeszlo: termin ' + (p.odliczanieDo - st) + ' ms');
  assert(P.zloz([pelny, { t: 'odliczanie', anuluj: true, st: st + 500 }]).odliczanieDo === null, 'anulowanie nie dziala');
});

const wejscie = (ids) => ids.map((id) => ({ t: 'dolacz', id, name: id, color: '#fff', v: P.WERSJA }));

await test('lobby: najwyzej 8 graczy, kolejni czekaja; kazdy na kazdego to osobne druzyny', () => {
  const ids = Array.from({ length: 10 }, (_, i) => 'g' + i);
  const r = P.rozstaw(P.zloz(wejscie(ids)));
  assert(r.gracze.length === 8 && r.widzowie.length === 2, r.gracze.length + '/' + r.widzowie.length);
  assert(r.widzowie[0].id === 'g8', 'czeka nie ten, kto wszedl ostatni');
  assert(new Set(r.gracze.map((g) => g.druzyna)).size === 8, 'w trybie kazdy na kazdego ktos jest w parze');
  // nieobecny zwalnia miejsce
  const bez = P.rozstaw(P.zloz(wejscie(ids)), (id) => id !== 'g2');
  assert(bez.gracze.some((g) => g.id === 'g8') && bez.widzowie.length === 1, 'nieobecny blokuje miejsce');
});

await test('lobby: druzyny rowne, przejscie do wolnego miejsca, pelna druzyna nie przyjmuje', () => {
  // 6 graczy, 3 drużyny: po 2, a miejsc jest po 3 (8 graczy / 3 drużyny)
  const szesc = P.rozstaw(P.zloz([...wejscie(['a', 'b', 'c', 'd', 'e', 'f']), { t: 'tryb', id: 'a', druzyny: 3 }]));
  const ile = (r, d) => r.gracze.filter((g) => g.druzyna === d).length;
  assert([0, 1, 2].every((d) => ile(szesc, d) === 2) && szesc.pojemnosc === 3, 'nierowne druzyny: ' + szesc.gracze.map((g) => g.id + g.druzyna).join(' '));
  // 8 graczy, 4 drużyny po 2 — wszystkie pełne
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const log = [...wejscie(ids), { t: 'tryb', id: 'a', druzyny: 4 }];
  let r = P.rozstaw(P.zloz(log));
  assert([0, 1, 2, 3].every((d) => ile(r, d) === 2), 'nierowne druzyny: ' + r.gracze.map((g) => g.id + g.druzyna).join(' '));
  // utrwalenie auto-przydziału (klient wysyła go sam) i próba wejścia do pełnej drużyny
  for (const g of r.gracze) log.push({ t: 'druzyna', id: g.id, kto: g.id, d: g.druzyna, auto: 1 });
  const zPelnej = r.gracze.find((g) => g.druzyna === 0);
  const doPelnej = r.gracze.find((g) => g.druzyna === 1);
  log.push({ t: 'druzyna', id: doPelnej.id, kto: doPelnej.id, d: 0 });
  r = P.rozstaw(P.zloz(log));
  assert(ile(r, 0) === 2 && r.gracze.find((g) => g.id === zPelnej.id).druzyna === 0, 'pelna druzyna przyjela kolejnego albo wyrzucila starego');
  // gospodarz zamienia dwóch graczy z pełnych drużyn
  log.push({ t: 'zamien', id: 'a', a: zPelnej.id, b: doPelnej.id, da: 0, db: 1 });
  r = P.rozstaw(P.zloz(log));
  assert(r.gracze.find((g) => g.id === zPelnej.id).druzyna === 1 && r.gracze.find((g) => g.id === doPelnej.id).druzyna === 0, 'zamiana nie zadzialala');
  assert([0, 1, 2, 3].every((d) => ile(r, d) === 2), 'po zamianie nierowno');
});

await test('lobby: start dopiero, gdy wszyscy gotowi; zmiana skladu i nowy gracz cofaja gotowosc', () => {
  const log = [...wejscie(['a', 'b', 'c']), { t: 'tryb', id: 'a', druzyny: 2 }];
  const gotowi = ['a', 'b', 'c'].map((id) => ({ t: 'gotowy', id, tak: true }));
  assert(!P.gotowiDoStartu(P.rozstaw(P.zloz(log))), 'start bez gotowosci');
  assert(P.gotowiDoStartu(P.rozstaw(P.zloz([...log, ...gotowi]))), 'wszyscy gotowi, a startu nie ma');
  const odl = { t: 'odliczanie', do: 9000, st: 4000, v: P.WERSJA };
  let p = P.zloz([...log, ...gotowi, odl, { t: 'druzyna', id: 'a', kto: 'b', d: 1 }]);
  assert(!p.wLobby.some((g) => g.gotowy) && p.odliczanieDo === null, 'przeniesienie nie cofnelo gotowosci i odliczania');
  p = P.zloz([...log, ...gotowi, odl, ...wejscie(['d'])]);
  assert(p.odliczanieDo === null && !P.gotowiDoStartu(P.rozstaw(p)), 'nowy gracz nie zatrzymal startu');
  p = P.zloz([...log, ...gotowi, odl, { t: 'gotowy', id: 'b', tak: false }]);
  assert(p.odliczanieDo === null, 'cofniecie gotowosci nie zatrzymalo odliczania');
  // jedna niepusta drużyna to nie mecz
  const jedna = [...wejscie(['a', 'b']), { t: 'tryb', id: 'a', druzyny: 2 },
    { t: 'druzyna', id: 'a', kto: 'a', d: 0 }, { t: 'druzyna', id: 'b', kto: 'b', d: 0 },
    { t: 'gotowy', id: 'a', tak: true }, { t: 'gotowy', id: 'b', tak: true }];
  assert(!P.gotowiDoStartu(P.rozstaw(P.zloz(jedna))), 'start z jedna druzyna');
});

await test('druzyny w partii: nowa niesie druzyny, po partii lobby je pamieta, gotowosc od zera', () => {
  const gracze = [{ id: 'a', name: 'a', color: '#fff', druzyna: 1 }, { id: 'b', name: 'b', color: '#0f0', druzyna: 0 }, { id: 'c', name: 'c', color: '#00f', druzyna: 1 }];
  const p = P.zloz([{ t: 'nowa', seed: 5, gracze, druzyny: 2, v: P.WERSJA, st: 1 }]);
  assert(p.druzyny === 2 && p.tryb === 2, 'tryb nie przeszedl');
  const r = P.nowaRozgrywka(p, 'a');
  assert(r.state.druzynowa && r.state.worms.find((w) => w.id === 'c').druzyna === 1, 'robale bez druzyn');
  const roz = P.rozstaw(p);
  assert(roz.gracze.map((g) => g.druzyna).join() === '1,0,1' && !roz.gracze.some((g) => g.gotowy), 'lobby po partii zgubilo druzyny');
});

await test('partia druzynowa 2 na 2 do konca: zero rozjazdow, wygrywa druzyna', () => {
  const serwer = new Serwer();
  const ids = ['a', 'b', 'c', 'd'];
  const kl = ids.map((id, i) => new Klient(id, serwer, mulberry32(300 + i), { opoznienie: 80 + i * 40, coIle: 300 }));
  for (const k of kl) serwer.przyjmij({ t: 'puls', id: k.id });
  serwer.przyjmij({ t: 'nowa', seed: 4321, druzyny: 2, v: P.WERSJA,
    gracze: ids.map((id, i) => ({ id, name: id, color: '#fff', druzyna: i % 2 })) });
  for (let i = 0; i < 60 * 900; i++) {
    serwer.czas += KLATKA;
    for (const k of kl) k.tik();
    if (i % 60 === 0 && P.zloz(serwer.log).faza === 'koniec') break;
  }
  for (let i = 0; i < 60 * 25; i++) { serwer.czas += KLATKA; for (const k of kl) k.tik(); }
  const p = P.zloz(serwer.log);
  assert(p.faza === 'koniec', 'partia druzynowa nie doszla do konca (tura ' + p.tura + ')');
  zgodnoscKoncowa({ serwer, pokoj: p, wszyscy: kl, klienci: kl });
  for (const k of kl) assert(k.r.statystyki.korekty === 0, 'korekty u ' + k.id);
  const st = kl[0].r.state;
  const zywi = st.worms.filter((w) => w.alive);
  assert(new Set(zywi.map((w) => w.druzyna)).size <= 1, 'na koniec zyja dwie druzyny');
  // tury na zmianę drużynami
  const akcje = [...p.akcje.values()].sort((x, y) => x.nr - y.nr);
  const druz = (id) => ids.indexOf(id) % 2;
  for (let i = 1; i < akcje.length; i++) {
    const kto = (a) => a.t === 'strzal' ? a.id : (a.za || a.id);
    assert(druz(kto(akcje[i])) !== druz(kto(akcje[i - 1])), 'dwie tury z rzedu jednej druzyny (tura ' + akcje[i].nr + ')');
  }
  console.log('       ' + p.tura + ' tur, wygrala druzyna ' + (zywi[0] ? zywi[0].druzyna : '—'));
});

console.log('\n' + (failed === 0
  ? '\x1b[32mWszystkie testy przeszly (' + passed + ')\x1b[0m'
  : '\x1b[31m' + failed + ' bledow, ' + passed + ' ok\x1b[0m') + '\n');
process.exit(failed === 0 ? 0 : 1);
