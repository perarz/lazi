/* Protokół partii sieciowej — czysta logika, bez DOM-u i bez fetch.

   Źródłem prawdy jest log zdarzeń na serwerze (jedna kolejność dla
   wszystkich). Zasady:

   1. Każda tura ma dokładnie jedną kanoniczną AKCJĘ: pierwszy w logu
      'strzal' albo 'pas' z numerem otwartej tury, od kogoś uprawnionego.
      Strzał niesie pełny stan robali i gotowy wektor startowy, więc każdy
      odtwarza lot co do bitu.
   2. Tura kończy się kanonicznym STANEM: pierwszym 'stan' w logu, który
      powstał z kanonicznej akcji. Stan niesie cały świat na początek
      następnej tury (kratery, robale, kolejka).
   3. Nikt — łącznie z autorem — nie zaczyna następnej tury, zanim nie
      przyjmie stanu z logu. Rozjazd nie może więc przetrwać granicy tury,
      a lokalne odchylenia (przegrany wyścig, spóźniony klient) goją się same.
   4. Kto wyszedł albo za długo nie daje znaku życia, znika z areny na
      najbliższej granicy tury; jego turę oddaje gospodarz.

   Warstwa sieciowa dostarcza tu tylko: log, obecność (ostatni puls) i czas
   serwera. Wszystko inne da się sprawdzić w Node — test/protokol.test.mjs
   gra pełne partie kilkoma klientami z opóźnieniami i rozłączeniami. */

import * as S from './sim.js';

export const GRACE_PAS = 12;          // s po terminie tury, zanim gospodarz odda ją za gracza (strzał wychodzi po 5 s ruchu)
export const ROZLACZONY_PAS = 15;     // s bez pulsu gracza z turą — tura oddana od razu
export const ROZLACZONY_WYRZUC = 90;  // s bez pulsu — robal znika na granicy tury
export const ZYWY_PULS = 20;          // s — dłuższa cisza wyklucza z wyboru gospodarza
export const ZASTEPCZY_STAN = 4;      // s czekania na stan od autora akcji
export const START_ZWLOKA = 3;        // s na załadowanie planszy po starcie partii
export const DOGON_PO = 2;            // s — starszego stanu nie animujemy, tylko do niego skaczemy
export const PORZUCONA_PO = S.TURN_TIME + GRACE_PAS + 35;   // s ciszy = partia porzucona
export const ODLICZANIE_S = 20;       // s od zebrania się 2+ graczy do startu partii
/* Startu nie da się przyspieszyć (od 4.1 nie ma przycisku „Zaczynamy”). Termin
   krótszy niż tyle sekund od stempla serwera to wpis ze starej wersji gry. */
const ODLICZANIE_MIN_S = ODLICZANIE_S - 5;

export function kluczAkcji(a) {
  return a ? a.t + ':' + a.id : null;
}

/* ---------- składanie logu w stan pokoju (czysta funkcja) ---------- */

export function zloz(zdarzenia) {
  const p = {
    faza: 'lobby',
    seed: null,
    gracze: [],            // uczestnicy bieżącej partii
    wLobby: [],            // zgłoszeni, czekają na start
    odliczanieDo: null,    // termin startu w czasie SERWERA
    ostatniaAktywnosc: 0,  // czas serwera ostatniego zdarzenia partii
    zwyciezca: null,
    startSt: 0,
    kolejnosc: [],
    tura: 0,               // numer kanonicznie otwartej tury
    turaOdkad: 0,          // czas serwera, od kiedy tura jest otwarta
    aktywny: null,         // kto prowadzi otwartą turę
    akcje: new Map(),      // nr tury -> kanoniczna akcja
    stany: new Map(),      // nr tury -> kanoniczny stan zamykający tę turę
    ostatniStan: null,
    odeszli: new Map()     // id -> czas wyjścia
  };

  const aktywnosc = (z) => { p.ostatniaAktywnosc = Math.max(p.ostatniaAktywnosc, z.st || 0); };

  for (const z of zdarzenia) {
    if (!z || typeof z.t !== 'string') continue;
    switch (z.t) {
      case 'dolacz': {
        const byl = p.wLobby.find((g) => g.id === z.id);
        if (byl) { byl.name = z.name; byl.color = z.color; }
        else if (typeof z.id === 'string') p.wLobby.push({ id: z.id, name: String(z.name || '?'), color: z.color });
        break;
      }

      case 'wyjdz':
        p.wLobby = p.wLobby.filter((g) => g.id !== z.id);
        if (p.faza === 'gra' && p.gracze.some((g) => g.id === z.id) && !p.odeszli.has(z.id)) {
          p.odeszli.set(z.id, z.st || 0);
          aktywnosc(z);
        }
        break;

      case 'odliczanie':
        // Wygrywa OSTATNI opublikowany termin (patrz historia: wariant
        // „najwcześniejszy wygrywa” zakleszczał się na starym wpisie).
        // Termin „na zaraz” (dawny przycisk przyspieszenia) jest pomijany.
        if (z.anuluj) p.odliczanieDo = null;
        else if (typeof z.do === 'number' && !(z.st && z.do - z.st < ODLICZANIE_MIN_S * 1000)) p.odliczanieDo = z.do;
        break;

      case 'nowa': {
        if (!Array.isArray(z.gracze) || !z.gracze.length) break;
        p.faza = 'gra';
        p.seed = z.seed >>> 0;
        p.gracze = z.gracze;
        // Log jest zerowany przy nowej partii — lista lobby startuje od graczy
        // partii w tej samej kolejności, więc gospodarz zostaje ten sam.
        p.wLobby = z.gracze.filter((g) => g && typeof g.id === 'string')
          .map((g) => ({ id: g.id, name: String(g.name || '?'), color: g.color }));
        p.odliczanieDo = null;
        p.startSt = z.st || 0;
        p.kolejnosc = S.kolejnoscTur(p.seed, p.gracze.map((g) => g.id));
        p.tura = 0;
        p.turaOdkad = (z.st || 0) + START_ZWLOKA * 1000;
        p.aktywny = p.kolejnosc[0];
        p.akcje = new Map();
        p.stany = new Map();
        p.ostatniStan = null;
        p.odeszli = new Map();
        p.zwyciezca = null;
        p.ostatniaAktywnosc = z.st || 0;
        break;
      }

      case 'strzal':
      case 'pas':
        if (p.faza !== 'gra' || z.nr !== p.tura || p.akcje.has(z.nr)) break;
        if (!mozeDzialac(p, z)) break;
        p.akcje.set(z.nr, z);
        aktywnosc(z);
        break;

      case 'stan': {
        if (p.faza !== 'gra' || z.nr !== p.tura) break;
        const a = p.akcje.get(z.nr);
        if (!a || z.akcja !== kluczAkcji(a)) break;   // stan z innej akcji niż kanoniczna
        if (!z.snap || typeof z.snap !== 'object' || z.snap.seed !== p.seed) break;
        p.stany.set(z.nr, z);
        p.ostatniStan = z;
        p.tura = z.nr + 1;
        p.turaOdkad = z.st || 0;
        p.aktywny = z.snap.aktywny ?? null;
        aktywnosc(z);
        if (z.snap.over) {
          p.faza = 'koniec';
          p.zwyciezca = z.snap.winner ?? null;
        }
        break;
      }
    }
  }
  return p;
}

/* Strzelać może tylko gracz z turą. Oddać ją za kogoś innego wolno,
   gdy wyszedł, gdy wypadł z sieci (to widzi tylko gospodarz, więc mu
   ufamy) albo po terminie z zapasem. */
function mozeDzialac(p, z) {
  if (z.t === 'strzal') return z.id === p.aktywny;
  if (z.id === p.aktywny) return true;
  if (z.za !== p.aktywny) return false;
  if (p.odeszli.has(p.aktywny)) return true;
  if (z.powod === 'rozlaczony') return true;
  return (z.st || 0) - p.turaOdkad >= (S.TURN_TIME + GRACE_PAS) * 1000;
}

/* Czy partia jeszcze żyje: coś się w niej działo niedawno i jest w niej
   ktoś, kto nie wyszedł i daje znak życia. */
export function partiaZywa(p, teraz, polaczony) {
  if (!p || p.faza !== 'gra' || !p.gracze.length) return false;
  if (!p.ostatniaAktywnosc) return false;
  if (teraz - p.ostatniaAktywnosc > PORZUCONA_PO * 1000) return false;
  return p.gracze.some((g) => !p.odeszli.has(g.id) && polaczony(g.id));
}

/* ---------- rozgrywka po stronie klienta ---------- */

export function nowaRozgrywka(pokoj, mojeId) {
  const state = S.createGame(pokoj.seed, pokoj.gracze, { sieciowa: true });
  const r = {
    mojeId,
    seed: pokoj.seed,
    state,
    obserwator: !pokoj.gracze.some((g) => g.id === mojeId) || pokoj.odeszli.has(mojeId),
    wyrzucony: false,
    akumulator: 0,
    poczatekSnap: S.snapshot(state),   // stan z początku bieżącej tury (do przesymulowania)
    zastosowana: null,     // klucz akcji, którą odtwarza lokalna symulacja
    mojaAkcja: null,       // moje zdarzenie akcji w tej turze (ponawiane do skutku)
    koniecOd: null,
    proby: new Map(),      // klucz wysyłki -> czas ostatniej próby
    doWyslania: [],        // zdarzenia dla warstwy sieciowej
    ui: [],                // sygnały dla interfejsu
    ostatniRuch: '',
    ostatniRuchCzas: 0,
    statystyki: { korekty: 0, przesymulowania: 0, skoki: 0 }
  };
  if (pokoj.ostatniStan) wejdzWStan(r, pokoj.ostatniStan);
  return r;
}

/* Czy lokalny gracz może teraz sterować (chodzić, celować, strzelać). */
export function mogeGrac(r, pokoj) {
  const st = r.state;
  if (r.obserwator || st.phase !== 'aim' || r.mojaAkcja) return false;
  if (!pokoj || pokoj.seed !== r.seed || pokoj.tura !== st.turnNumber) return false;
  if (pokoj.aktywny !== r.mojeId || pokoj.akcje.has(st.turnNumber)) return false;
  const w = S.activeWorm(st);
  return !!w && w.alive && w.id === r.mojeId;
}

/* Ucieczka po dynamicie: chodzić i skakać wolno, strzelać już nie. */
export function mogeUciekac(r) {
  const st = r.state;
  if (r.obserwator || st.phase !== 'odwrot' || !st.odwrotNagranie) return false;
  const w = S.activeWorm(st);
  return !!w && w.alive && w.id === r.mojeId;
}

/* Termin bieżącej tury w czasie serwera (albo null, gdy log jest gdzie indziej). */
export function terminTury(r, pokoj) {
  if (!pokoj || pokoj.tura !== r.state.turnNumber) return null;
  return pokoj.turaOdkad + S.TURN_TIME * 1000;
}

/* Jedna klatka: synchronizacja z logiem, krok symulacji, decyzje o wysyłce.
   ctx = { teraz, dt, obecnosc: {id: czasPulsu}, obecnoscTeraz, obecnoscSwieza } */
export function klatka(r, pokoj, ctx) {
  const st = r.state;
  if (!pokoj || pokoj.seed !== r.seed || st.phase === 'over') return;

  dogonLog(r, pokoj, ctx);
  if (st.phase === 'over') return;

  const nr = st.turnNumber;
  const otwarta = pokoj.tura === nr;
  const a = pokoj.akcje.get(nr) || null;   // kanoniczna akcja mojej bieżącej tury (także gdy log jest już dalej)

  // 1. Kanoniczna akcja tury — lokalna symulacja zawsze idzie za nią.
  if (a && r.zastosowana !== kluczAkcji(a)) {
    if (r.zastosowana === null && st.phase === 'aim') zastosujAkcje(r, a);
    else przesymuluj(r, a);
  }

  // 2. Moja tura: termin, auto-pas, wysyłka strzału.
  const mojaTura = otwarta && !r.obserwator && pokoj.aktywny === r.mojeId;
  const termin = otwarta ? pokoj.turaOdkad + S.TURN_TIME * 1000 : null;
  if (termin !== null) st.turnTimeLeft = Math.max(0, (termin - ctx.teraz) / 1000);

  zbierzStrzaly(r, mojaTura && !a);
  if (mojaTura && !a && !r.mojaAkcja) {
    const akt = S.activeWorm(st);
    if (st.phase === 'aim' && ctx.teraz >= termin) {
      if (st.charging) { S.releaseFire(st); zbierzStrzaly(r, true); }
      else mojPas(r, 'czas');
    } else if (st.phase !== 'aim' && !st.firedThisTurn && akt && akt.id === r.mojeId) {
      mojPas(r, 'smierc');           // tura skończyła się bez strzału (np. lawa, upadek)
    }
  }
  if (r.mojaAkcja && otwarta && !a && r.mojaAkcja.nr === nr) {
    wyslijRaz(r, 'akcja:' + nr, r.mojaAkcja, ctx.teraz, 2500);
  }

  // 3. Gospodarz oddaje turę nieobecnego.
  const gosp = jestemGospodarzem(r, pokoj, ctx);
  if (otwarta && !a && st.phase === 'aim' && gosp && pokoj.aktywny && pokoj.aktywny !== r.mojeId) {
    const kto = pokoj.aktywny;
    let powod = null;
    if (pokoj.odeszli.has(kto)) powod = 'odszedl';
    else if (rozlaczonyOd(r, pokoj, ctx, kto) >= ROZLACZONY_PAS * 1000) powod = 'rozlaczony';
    else if (ctx.teraz - pokoj.turaOdkad >= (S.TURN_TIME + GRACE_PAS) * 1000) powod = 'czas';
    if (powod) {
      wyslijRaz(r, 'zastepstwo:' + nr, { t: 'pas', nr, id: r.mojeId, za: kto, powod }, ctx.teraz, 4000);
    }
  }

  // 4. Symulacja stałym krokiem.
  r.akumulator = Math.min(r.akumulator + ctx.dt, 0.5);
  let kroki = 0;
  while (r.akumulator >= S.DT && kroki < 120) {
    S.step(st);
    r.akumulator -= S.DT;
    kroki++;
    if (st.phase === 'koniec') break;
  }
  zbierzStrzaly(r, mojaTura && !a);
  if (r.mojaAkcja && otwarta && !a && r.mojaAkcja.nr === nr) {
    wyslijRaz(r, 'akcja:' + nr, r.mojaAkcja, ctx.teraz, 2500);
  }

  // 5. Koniec tury: przyjmij stan z logu albo go opublikuj.
  if (st.phase === 'koniec') {
    if (r.koniecOd === null) r.koniecOd = ctx.teraz;
    const stan = otwarta ? null : pokoj.stany.get(nr);
    if (stan) {
      wejdzWStan(r, stan);
    } else if (a && r.zastosowana === kluczAkcji(a)) {
      const autor = a.id === r.mojeId;
      const zastepczo = gosp && (
        pokoj.odeszli.has(a.id) ||
        rozlaczonyOd(r, pokoj, ctx, a.id) >= ROZLACZONY_PAS * 1000 ||
        ctx.teraz - r.koniecOd >= ZASTEPCZY_STAN * 1000
      );
      if (autor || zastepczo) {
        wyslijRaz(r, 'stan:' + nr, () => ({
          t: 'stan', nr, akcja: kluczAkcji(a),
          snap: S.stanPoTurze(st, doUsuniecia(r, pokoj, ctx))
        }), ctx.teraz, 2500);
      }
    }
  }

  // 6. Podgląd na żywo dla reszty (poza logiem): pozycja, celownik, moc.
  if (mogeGrac(r, pokoj)) {
    const w = S.activeWorm(st);
    const ruch = {
      t: 'ruch', nr: st.turnNumber, id: r.mojeId,
      x: Math.round(w.x), y: Math.round(w.y), f: w.facing,
      k: Math.round(w.angle * 40) / 40,
      b: st.weapon,
      m: st.charging ? Math.round(st.power * 10) / 10 : 0,
      c: st.cel ? [st.cel.x, st.cel.y] : null
    };
    const sygnatura = JSON.stringify(ruch);
    if (sygnatura !== r.ostatniRuch && ctx.teraz - r.ostatniRuchCzas >= 450) {
      r.ostatniRuch = sygnatura;
      r.ostatniRuchCzas = ctx.teraz;
      r.doWyslania.push(ruch);
    }
  }
}

/* Log jest dalej niż my: stan zamykający naszą turę już jest. */
function dogonLog(r, pokoj, ctx) {
  const st = r.state;
  const nr = st.turnNumber;
  if (pokoj.tura > nr + 1 && pokoj.ostatniStan) {
    r.statystyki.skoki++;
    wejdzWStan(r, pokoj.ostatniStan);
    return;
  }
  if (pokoj.tura === nr + 1) {
    const stan = pokoj.stany.get(nr);
    if (!stan) return;
    const a = pokoj.akcje.get(nr);
    const wiek = ctx.teraz - (stan.st || 0);
    const kanon = kluczAkcji(a);
    if (st.phase === 'koniec') {
      wejdzWStan(r, stan);
    } else if (
      (r.zastosowana !== null && r.zastosowana !== kanon) ||   // gram nie tę akcję — nie ma czego oglądać
      (r.zastosowana === null && wiek > DOGON_PO * 1000) ||     // spóźniony: nie animujemy starej tury
      wiek > 12000                                             // animacja utknęła
    ) {
      r.statystyki.skoki++;
      wejdzWStan(r, stan);
    }
  }
}

/* Odbiorca i autor przechodzą przez tę samą ścieżkę: stan z akcji,
   potem pas albo strzał. Dzięki temu dalsze kroki są identyczne. */
function zastosujAkcje(r, a) {
  const st = r.state;
  let przebudowa = false;
  if (a.t === 'strzal') {
    przebudowa = S.zastosujStrzal(st, a);
  } else {
    przebudowa = S.ustawKratery(st, a.kratery);
    if (Array.isArray(a.robale)) S.ustawRobale(st, a.robale);
    if (Array.isArray(a.skrzynki)) S.ustawSkrzynki(st, a.skrzynki);
    if (st.phase === 'koniec') st.phase = 'settle';
    S.applyPas(st);
  }
  r.zastosowana = kluczAkcji(a);
  if (przebudowa) r.ui.push({ typ: 'teren' });
}

/* Lokalnie poszła inna akcja niż kanoniczna (np. mój strzał przegrał
   wyścig z pasem gospodarza) — wracamy na początek tury i gramy kanon. */
function przesymuluj(r, a) {
  const st = r.state;
  const przebudowa = S.zastosujSnapshot(st, r.poczatekSnap);
  r.statystyki.przesymulowania++;
  if (r.mojaAkcja && kluczAkcji(r.mojaAkcja) !== kluczAkcji(a)) r.mojaAkcja = null;
  r.koniecOd = null;
  r.akumulator = 0;
  zastosujAkcje(r, a);
  r.ui.push({ typ: 'przesymulowano', przebudowa });
}

/* Czy lokalna symulacja tury rozjechała się z kanonem (poza usunięciem
   graczy, które jest zamierzone). Tylko do statystyk i testów. */
function rozjazd(st, snap) {
  const kr = st.terrain.craters;
  if (kr.length * 3 !== snap.kratery.length) return true;
  for (let i = 0; i < kr.length; i++) {
    if (kr[i].x !== snap.kratery[i * 3] || kr[i].y !== snap.kratery[i * 3 + 1] || kr[i].r !== snap.kratery[i * 3 + 2]) return true;
  }
  for (const s of snap.robale) {
    const w = st.worms.find((x) => x.id === s.id);
    if (!w) return true;
    if (s.odszedl && !w.odszedl) continue;
    if (w.x !== s.x || w.y !== s.y || w.hp !== s.hp || w.alive !== s.alive) return true;
  }
  return false;
}

function wejdzWStan(r, stan) {
  const st = r.state;
  if (st.phase === 'koniec' && r.zastosowana !== null && stan.nr === st.turnNumber && rozjazd(st, stan.snap)) {
    r.statystyki.korekty++;
    if (r.naRozjazd) r.naRozjazd(st, stan);   // tylko testy
  }
  const przebudowa = S.zastosujSnapshot(st, stan.snap);
  r.poczatekSnap = stan.snap;
  r.zastosowana = null;
  r.mojaAkcja = null;
  r.koniecOd = null;
  r.akumulator = 0;
  r.proby.clear();
  r.ostatniRuch = '';

  const ja = st.worms.find((w) => w.id === r.mojeId);
  if (ja && ja.odszedl && !r.obserwator) {
    r.obserwator = true;
    r.wyrzucony = true;
    r.ui.push({ typ: 'wyrzucony' });
  }
  r.ui.push({ typ: 'stan', nr: stan.nr, przebudowa, koniec: st.phase === 'over' });
  if (r.sledz) r.sledz(stan.nr, st);   // tylko testy: stan tuż po przyjęciu
}

/* Mój pas niesie cały stan świata z tej chwili (robale i kratery) —
   także gdy tura skończyła się sama, bo mój robal zginął (upadek robi
   krater z wybuchu zwłok). Potem gram go dokładnie tak jak odbiorcy. */
function mojPas(r, powod) {
  const st = r.state;
  const z = { t: 'pas', nr: st.turnNumber, id: r.mojeId, powod, robale: S.stanRobali(st), kratery: S.plaskieKratery(st), skrzynki: S.stanSkrzynek(st) };
  r.mojaAkcja = z;
  zastosujAkcje(r, z);
}

/* Strzały oddane lokalnie (spust, pełna moc, koniec czasu) → do logu. */
function zbierzStrzaly(r, wolno) {
  const st = r.state;
  while (st.akcjeDoWyslania.length) {
    const akcja = st.akcjeDoWyslania.shift();
    if (!wolno || r.mojaAkcja) continue;
    r.mojaAkcja = { t: 'strzal', nr: st.turnNumber, id: r.mojeId, ...akcja };
    r.zastosowana = kluczAkcji(r.mojaAkcja);
  }
}

function wyslijRaz(r, klucz, z, teraz, odstep) {
  const ost = r.proby.get(klucz);
  if (ost !== undefined && teraz - ost < odstep) return;
  r.proby.set(klucz, teraz);
  r.doWyslania.push(typeof z === 'function' ? z() : z);
}

/* Ile ms gracz nie daje znaku życia (0, gdy nie wiemy — np. dane
   o obecności są nieświeże po powrocie karty z tła). */
export function rozlaczonyOd(r, pokoj, ctx, id) {
  if (id === r.mojeId || !ctx.obecnoscSwieza) return 0;
  const ts = ctx.obecnosc[id] ?? pokoj.startSt ?? 0;
  return Math.max(0, ctx.obecnoscTeraz - ts);
}

/* Gospodarz partii: najmniejsze id wśród połączonych uczestników, którzy
   nie wyszli. Gdy takich nie ma — wśród wszystkich połączonych (widzów). */
export function jestemGospodarzem(r, pokoj, ctx) {
  const zywy = (id) => rozlaczonyOd(r, pokoj, ctx, id) < ZYWY_PULS * 1000;
  const usuniety = (id) => {
    const w = r.state.worms.find((x) => x.id === id);
    return !w || w.odszedl;
  };
  let kandydaci = pokoj.gracze
    .map((g) => g.id)
    .filter((id) => !pokoj.odeszli.has(id) && !usuniety(id) && zywy(id));
  if (!kandydaci.length) {
    kandydaci = Object.keys(ctx.obecnosc || {}).filter(zywy);
    kandydaci.push(r.mojeId);
  }
  kandydaci.sort();
  return kandydaci[0] === r.mojeId;
}

/* Kogo usunąć z areny na tej granicy tury. */
function doUsuniecia(r, pokoj, ctx) {
  const ids = [];
  for (const g of pokoj.gracze) {
    const w = r.state.worms.find((x) => x.id === g.id);
    if (!w || w.odszedl) continue;
    if (pokoj.odeszli.has(g.id) || rozlaczonyOd(r, pokoj, ctx, g.id) >= ROZLACZONY_WYRZUC * 1000) ids.push(g.id);
  }
  return ids;
}

/* Wyjście z partii z własnej woli: jeśli to moja tura, najpierw ją oddaję,
   żeby reszta nie czekała na gospodarza. Zwraca zdarzenia do wysłania. */
export function opuszczam(r, pokoj) {
  const out = [];
  const st = r.state;
  if (!r.obserwator && pokoj && pokoj.tura === st.turnNumber && pokoj.aktywny === r.mojeId &&
      !pokoj.akcje.has(st.turnNumber) && !r.mojaAkcja) {
    out.push({ t: 'pas', nr: st.turnNumber, id: r.mojeId, powod: 'wyjscie' });
  }
  out.push({ t: 'wyjdz', id: r.mojeId });
  return out;
}
