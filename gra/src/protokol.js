/* Protokół partii sieciowej — czysta logika, bez DOM-u i bez fetch.

   Źródłem prawdy jest log zdarzeń na serwerze (jedna kolejność dla
   wszystkich). Zasady:

   1. Każda tura ma dokładnie jedną kanoniczną AKCJĘ: pierwszy w logu
      'strzal' albo 'pas' z numerem otwartej tury, od kogoś uprawnionego.
      Strzał niesie pełny stan robali i gotowy wektor startowy, więc każdy
      odtwarza lot co do bitu. Strzał idzie od razu, a 5 s ucieczki po nim
      leci za nim paczkami 'odwrot' (od, b = RLE, koniec) — odbiorcy grają
      ucieczkę na żywo, tylko o ułamek sekundy za strzelcem. Gdy strzelec
      zniknie w trakcie, gospodarz domyka ucieczkę ('odwrot' z `za`, koniec).
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
import { hashTekstu } from './rng.js';
import { TRYBY } from './druzyny.js';
import * as U from './ustawienia.js';

export const GRACE_PAS = 12;          // s po terminie tury, zanim gospodarz odda ją za gracza
export const ROZLACZONY_PAS = 15;     // s bez pulsu gracza z turą — tura oddana od razu
export const ROZLACZONY_WYRZUC = 90;  // s bez pulsu — robal znika na granicy tury
export const ZYWY_PULS = 20;          // s — dłuższa cisza wyklucza z wyboru gospodarza
export const ZASTEPCZY_STAN = 4;      // s czekania na stan od autora akcji
export const START_ZWLOKA = 3;        // s na załadowanie planszy po starcie partii
export const DOGON_PO = 2;            // s — starszego stanu nie animujemy, tylko do niego skaczemy
export const ODLICZANIE_S = 5;        // s od chwili, gdy wszyscy dali GOTOWY, do startu partii
export const WERSJA = 4;              // wersja protokołu lobby (4.2: drużyny i gotowość, 4.3: ustawienia partii, 4.3.1: lawa w turach, emotki)
export const MAX_GRACZY = 8;          // w partii; kolejni w lobby oglądają

/* Ucieczka na żywo. */
export const ODWROT_CO = 120;         // ms między paczkami ruchów ucieczki
const ODWROT_PONOW = 1500;            // ms bez potwierdzenia w logu = wyślij od potwierdzonego miejsca
const ODWROT_CISZA = 4000;            // ms bez paczki od strzelca — gospodarz domyka ucieczkę
const ODWROT_BUFOR = 14;              // kroki (~0,12 s) zapasu, zanim odbiorca ruszy z ucieczką

export function kluczAkcji(a) {
  return a ? a.t + ':' + a.id : null;
}

/* ---------- składanie logu w stan pokoju (czysta funkcja) ---------- */

export function zloz(zdarzenia) {
  const p = {
    faza: 'lobby',
    seed: null,
    gracze: [],            // uczestnicy bieżącej partii (z polem druzyna)
    druzyny: 0,            // tryb bieżącej partii: 0 = każdy na każdego, n = tyle drużyn
    wLobby: [],            // zgłoszeni: { id, name, color, v, druzyna, druzynaNr, gotowy }
    tryb: 0,               // tryb ustawiony w lobby przez gospodarza
    ustawienia: U.domyslne(),   // ustawienia następnej partii (lobby, gospodarz)
    ustawieniaGry: U.domyslne(),// ustawienia bieżącej partii (z 'nowa')
    czasTury: S.TURN_TIME, // s — czas tury bieżącej partii
    wyrzuceni: new Set(),  // id wyrzuconych z lobby przez gospodarza (do ich ponownego 'dolacz')
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
    odwroty: new Map(),    // nr tury -> { bity, koniec, za, st, czeka } — ucieczka po kanonicznym strzale
    paczkiPrzed: new Map(),// nr tury -> paczki ucieczki, które przyszły przed strzałem
    odeszli: new Map()     // id -> czas wyjścia
  };

  const aktywnosc = (z) => { p.ostatniaAktywnosc = Math.max(p.ostatniaAktywnosc, z.st || 0); };
  // Zmiana składu drużyn: gotowość trzeba potwierdzić jeszcze raz, odliczanie staje.
  const zmianaSkladu = () => {
    for (const g of p.wLobby) g.gotowy = false;
    p.odliczanieDo = null;
  };
  const wLobby = (id) => p.wLobby.find((g) => g.id === id);

  for (let i = 0; i < zdarzenia.length; i++) {
    const z = zdarzenia[i];
    if (!z || typeof z.t !== 'string') continue;
    switch (z.t) {
      case 'dolacz': {
        p.wyrzuceni.delete(z.id);
        const byl = wLobby(z.id);
        if (byl) { byl.name = z.name; byl.color = z.color; byl.v = z.v | 0; }
        else if (typeof z.id === 'string') {
          p.wLobby.push({ id: z.id, name: String(z.name || '?'), color: z.color, v: z.v | 0, druzyna: null, druzynaNr: 0, gotowy: false });
          p.odliczanieDo = null;      // nowy gracz jeszcze nie jest gotowy
        }
        break;
      }

      case 'tryb':
        if (!TRYBY.includes(z.druzyny) || z.druzyny === p.tryb) break;
        p.tryb = z.druzyny;
        for (const g of p.wLobby) g.druzyna = null;    // drużyny losują się od nowa
        zmianaSkladu();
        break;

      case 'druzyna': {
        const g = wLobby(z.kto);
        if (!g || !Number.isInteger(z.d) || z.d < 0 || z.d >= Math.max(1, p.tryb)) break;
        if (z.auto && g.druzyna === z.d) break;
        g.druzyna = z.d;
        g.druzynaNr = i;
        if (!z.auto) zmianaSkladu();
        break;
      }

      case 'ustaw': {
        // Ustawienie partii (gospodarz lobby). `domyslne` przywraca wszystkie.
        if (z.domyslne) {
          const d = U.domyslne();
          if (U.USTAWIENIA.every((o) => p.ustawienia[o.klucz] === d[o.klucz])) break;
          p.ustawienia = d;
        } else {
          if (!U.poprawna(z.klucz, z.w) || p.ustawienia[z.klucz] === z.w) break;
          p.ustawienia = { ...p.ustawienia, [z.klucz]: z.w };
        }
        zmianaSkladu();          // gotowość dotyczyła innych warunków
        break;
      }

      case 'sklad': {
        // Gospodarz losuje drużyny: cały przydział naraz { id: drużyna }.
        if (!p.tryb || !z.d || typeof z.d !== 'object') break;
        let zmiana = false;
        for (const g of p.wLobby) {
          const d = z.d[g.id];
          if (!Number.isInteger(d) || d < 0 || d >= p.tryb) continue;
          g.druzyna = d;
          g.druzynaNr = i;
          zmiana = true;
        }
        if (zmiana) zmianaSkladu();
        break;
      }

      case 'wyrzuc': {
        // Gospodarz usuwa gracza z lobby (np. AFK blokuje start). Wyrzucony
        // nie zgłasza się sam z powrotem — wraca dopiero własnym przyciskiem.
        if (typeof z.kto !== 'string' || z.kto === z.id || !wLobby(z.id) || !wLobby(z.kto)) break;
        p.wLobby = p.wLobby.filter((g) => g.id !== z.kto);
        p.wyrzuceni.add(z.kto);
        p.odliczanieDo = null;
        break;
      }

      case 'korona': {
        // Gospodarz oddaje koronę: wskazany gracz idzie na początek kolejki
        // (gospodarzem jest pierwszy obecny w kolejności wejścia).
        const g = wLobby(z.kto);
        if (!g || !wLobby(z.id) || z.kto === z.id) break;
        p.wLobby = [g, ...p.wLobby.filter((x) => x !== g)];
        break;
      }

      case 'zamien': {
        const a = wLobby(z.a), b = wLobby(z.b);
        if (!a || !b || a === b || !Number.isInteger(z.da) || !Number.isInteger(z.db)) break;
        // drużyny, jakie obaj mieli na ekranie gospodarza (auto-przydział mógł nie dojść do logu)
        a.druzyna = z.db; b.druzyna = z.da;
        a.druzynaNr = b.druzynaNr = i;
        zmianaSkladu();
        break;
      }

      case 'gotowy': {
        const g = wLobby(z.id);
        if (!g) break;
        g.gotowy = !!z.tak;
        if (!g.gotowy) p.odliczanieDo = null;
        break;
      }

      case 'wyjdz':
        p.wLobby = p.wLobby.filter((g) => g.id !== z.id);
        p.odliczanieDo = null;
        if (p.faza === 'gra' && p.gracze.some((g) => g.id === z.id) && !p.odeszli.has(z.id)) {
          p.odeszli.set(z.id, z.st || 0);
          aktywnosc(z);
        }
        break;

      case 'odliczanie':
        // Wygrywa OSTATNI opublikowany termin. Od 4.2 odliczanie rusza dopiero,
        // gdy wszyscy są gotowi (v 2); wpisy starej wersji (samo 20 s) są pomijane,
        // tak samo termin „na zaraz” (dawny przycisk przyspieszenia).
        if (z.anuluj) p.odliczanieDo = null;
        else if (typeof z.do === 'number' && (z.v | 0) >= WERSJA &&
                 !(z.st && z.do - z.st < (ODLICZANIE_S - 2) * 1000)) p.odliczanieDo = z.do;
        break;

      case 'nowa': {
        if (!Array.isArray(z.gracze) || !z.gracze.length) break;
        p.faza = 'gra';
        p.seed = z.seed >>> 0;
        p.gracze = z.gracze;
        p.druzyny = TRYBY.includes(z.druzyny) ? z.druzyny : 0;
        p.tryb = p.druzyny;
        // Ustawienia jadą w 'nowa' (od 4.3) — po partii lobby je pamięta.
        p.ustawieniaGry = U.normalizuj(z.ustawienia);
        p.ustawienia = p.ustawieniaGry;
        p.czasTury = p.ustawieniaGry.czas;
        p.wyrzuceni = new Set();
        // Log jest zerowany przy nowej partii — lista lobby startuje od graczy
        // partii w tej samej kolejności (gospodarz zostaje ten sam), w tych samych drużynach.
        p.wLobby = z.gracze.filter((g) => g && typeof g.id === 'string')
          .map((g, k) => ({
            id: g.id, name: String(g.name || '?'), color: g.color, v: z.v | 0,
            druzyna: p.druzyny && Number.isInteger(g.druzyna) ? g.druzyna : null, druzynaNr: -100 + k, gotowy: false
          }));
        p.odliczanieDo = null;
        p.startSt = z.st || 0;
        p.kolejnosc = S.kolejnoscTur(p.seed, p.gracze.map((g) => g.id));
        p.tura = 0;
        p.turaOdkad = (z.st || 0) + START_ZWLOKA * 1000;
        p.aktywny = p.kolejnosc[0];
        p.akcje = new Map();
        p.stany = new Map();
        p.odwroty = new Map();
        p.paczkiPrzed = new Map();
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
        if (z.t === 'strzal') {
          // stary zapis: całe nagranie ucieczki w strzale
          const pelne = Array.isArray(z.odwrot);
          const o = { bity: pelne ? S.rozwinOdwrot(z.odwrot) : [], koniec: pelne, za: null, st: z.st || 0, czeka: new Map() };
          p.odwroty.set(z.nr, o);
          for (const pz of p.paczkiPrzed.get(z.nr) || []) if (pz.id === z.id) dolozPaczke(o, pz);
          p.paczkiPrzed.delete(z.nr);
        }
        aktywnosc(z);
        break;

      case 'odwrot': {
        // Paczka ruchów ucieczki: tylko po kanonicznym strzale tej tury i tylko
        // od jego autora. Składana ciągiem po `od` — paczka z przyszłości czeka
        // na brakujące, duplikaty odpadają.
        // Także dla tury już zamkniętej stanem: odbiorca może jeszcze grać jej
        // ucieczkę (paczka i stan mogły przyjść w dowolnej kolejności).
        if (p.faza === 'lobby' || typeof z.nr !== 'number' || z.nr > p.tura || typeof z.id !== 'string') break;
        const a = p.akcje.get(z.nr);
        if (!a) {
          // paczka wyprzedziła strzał (inna droga w sieci) — poczeka na niego
          const lista = p.paczkiPrzed.get(z.nr) || [];
          if (lista.length < 80) lista.push(z);
          p.paczkiPrzed.set(z.nr, lista);
          break;
        }
        const o = p.odwroty.get(z.nr);
        if (a.t !== 'strzal' || !o || o.koniec) break;
        if (z.id === a.id) {
          dolozPaczke(o, z);
        } else if (z.za === a.id && z.koniec) {
          o.koniec = true;         // gospodarz domyka: reszta kroków = robal stoi
          o.za = z.id;
          o.st = z.st || o.st;
        }
        break;
      }

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

/* Paczka ucieczki do składanki `o` (ciągiem po `od`). */
function dolozPaczke(o, z) {
  if (typeof z.od !== 'number' || z.od < 0) return;
  o.st = Math.max(o.st, z.st || 0);
  if (z.od > o.bity.length) {
    if (o.czeka.size < 80) o.czeka.set(z.od, z);
    return;
  }
  const bity = S.rozwinOdwrot(z.b);
  for (let i = o.bity.length - z.od; i < bity.length && o.bity.length < S.ODWROT_KROKI; i++) o.bity.push(bity[i]);
  if (z.koniec && z.od + bity.length >= o.bity.length) o.koniec = true;
  const dalej = o.czeka.get(o.bity.length);
  if (dalej && !o.koniec) {
    o.czeka.delete(o.bity.length);
    dolozPaczke(o, dalej);
  }
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
  return (z.st || 0) - p.turaOdkad >= (p.czasTury + GRACE_PAS) * 1000;
}

/* Po tylu sekundach ciszy partia jest porzucona (dłuższa tura = dłużej). */
export function porzuconaPo(p) {
  return Math.max(p.czasTury, S.TURN_TIME) + GRACE_PAS + 35;
}

/* Czy partia jeszcze żyje: coś się w niej działo niedawno i jest w niej
   ktoś, kto nie wyszedł i daje znak życia. */
export function partiaZywa(p, teraz, polaczony) {
  if (!p || p.faza !== 'gra' || !p.gracze.length) return false;
  if (!p.ostatniaAktywnosc) return false;
  if (teraz - p.ostatniaAktywnosc > porzuconaPo(p) * 1000) return false;
  return p.gracze.some((g) => !p.odeszli.has(g.id) && polaczony(g.id));
}

/* ---------- lobby: kto gra i w jakiej drużynie ---------- */

export function pojemnoscDruzyny(n) {
  return n ? Math.ceil(MAX_GRACZY / n) : 1;
}

/* Rozstawienie obecnych w lobby: pierwszych MAX_GRACZY (kolejność wejścia)
   gra, reszta czeka. W trybie drużynowym każdy trzyma swoją drużynę, o ile
   jest w niej miejsce — pierwszeństwo ma ten, kto do niej trafił wcześniej
   (druzynaNr); pozostali trafiają do drużyny z najmniejszą liczbą graczy
   (przy remisie „losowo”, ale tak samo u wszystkich — z hasha id).
   `jest(id)` — czy gracz jest obecny (obecność zna tylko main.js). */
export function rozstaw(p, jest = () => true) {
  const obecni = p.wLobby.filter((g) => jest(g.id));
  const gracze = obecni.slice(0, MAX_GRACZY);
  const widzowie = obecni.slice(MAX_GRACZY);
  const n = p.tryb;
  if (!n) return { n, gracze: gracze.map((g, i) => ({ ...g, druzyna: i })), widzowie, pojemnosc: 1 };
  const cap = pojemnoscDruzyny(n);
  const ile = new Array(n).fill(0);
  const wynik = new Map();
  const zPrzydzialem = gracze
    .filter((g) => Number.isInteger(g.druzyna) && g.druzyna < n)
    .sort((a, b) => a.druzynaNr - b.druzynaNr);
  for (const g of zPrzydzialem) {
    if (ile[g.druzyna] < cap) { wynik.set(g.id, g.druzyna); ile[g.druzyna]++; }
  }
  for (const g of gracze) {
    if (wynik.has(g.id)) continue;
    const min = Math.min(...ile);
    const wolne = [];
    for (let d = 0; d < n; d++) if (ile[d] === min) wolne.push(d);
    const d = wolne[parseInt(hashTekstu(g.id), 16) % wolne.length];
    wynik.set(g.id, d);
    ile[d]++;
  }
  return { n, gracze: gracze.map((g) => ({ ...g, druzyna: wynik.get(g.id) })), widzowie, pojemnosc: cap };
}

/* Czy można startować: 2+ graczy, wszyscy gotowi i z aktualną wersją gry
   (starsza nie zna ustawień partii — rozjechałaby się), a w trybie
   drużynowym co najmniej dwie drużyny z kimś w środku. */
export function gotowiDoStartu(rozstawienie) {
  const { n, gracze } = rozstawienie;
  if (gracze.length < 2 || !gracze.every((g) => g.gotowy && (g.v | 0) >= WERSJA)) return false;
  return !n || new Set(gracze.map((g) => g.druzyna)).size >= 2;
}

/* ---------- rozgrywka po stronie klienta ---------- */

export function nowaRozgrywka(pokoj, mojeId) {
  const state = S.createGame(pokoj.seed, pokoj.gracze, { sieciowa: true, druzyny: pokoj.druzyny > 0, ustawienia: pokoj.ustawieniaGry });
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
    odwrotWyslane: 0,      // ile kroków mojej ucieczki poszło już do sieci
    odwrotCzas: -Infinity, // kiedy wysłałem ostatnią paczkę
    odwrotRuszyl: false,   // odbiorca: bufor ucieczki się napełnił, gramy
    odwrotKoniec: false,   // wysłałem już paczkę z końcem ucieczki
    odwrotPotw: 0, odwrotPotwCzas: 0, odwrotPonowCzas: 0,   // postęp potwierdzony w logu
    efekty: [],            // moja tura: ostatnie zdarzenia do podglądu (upadek, skrzynka) — [nr, …]
    efektNr: 0,
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
  return pokoj.turaOdkad + pokoj.czasTury * 1000;
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

  // 1b. Ucieczka po strzale: dopisz kroki z logu (odbiorca) albo — gdy ucieczkę
  //     domknął za mnie gospodarz — zagraj ją jak odbiorca.
  const o = a && a.t === 'strzal' && r.zastosowana === kluczAkcji(a) ? pokoj.odwroty.get(nr) : null;
  if (o) {
    if (st.odwrotNagranie && o.za) {
      przesymuluj(r, a);             // moja ucieczka urwała się w sieci — kanon jest krótszy
    }
    if (!st.odwrotNagranie && st.odwrotPlan) {
      const znane = st.odwrotPlan.length;
      if (o.bity.length > znane || (o.koniec && !st.odwrotPelny)) {
        S.dopiszOdwrot(st, o.bity.slice(znane), o.koniec);
      }
    }
  }

  // 2. Moja tura: termin, auto-pas, wysyłka strzału.
  const mojaTura = otwarta && !r.obserwator && pokoj.aktywny === r.mojeId;
  const termin = otwarta ? pokoj.turaOdkad + pokoj.czasTury * 1000 : null;
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
    else if (ctx.teraz - pokoj.turaOdkad >= (pokoj.czasTury + GRACE_PAS) * 1000) powod = 'czas';
    if (powod) {
      wyslijRaz(r, 'zastepstwo:' + nr, { t: 'pas', nr, id: r.mojeId, za: kto, powod }, ctx.teraz, 4000);
    }
  }

  // 3b. Strzelec zniknął w trakcie ucieczki — jego zastępca ją domyka.
  const zastepca = a && a.id !== r.mojeId && jestemGospodarzem(r, pokoj, ctx, a.id);
  if (o && zastepca && !o.koniec && (
    pokoj.odeszli.has(a.id) ||
    rozlaczonyOd(r, pokoj, ctx, a.id) >= ROZLACZONY_PAS * 1000 ||
    ctx.teraz - o.st >= ODWROT_CISZA
  )) {
    wyslijRaz(r, 'odwrot-koniec:' + nr, { t: 'odwrot', nr, id: r.mojeId, za: a.id, koniec: 1 }, ctx.teraz, 3000);
  }

  // 4. Symulacja stałym krokiem. Odbiorca ucieczki trzyma mały zapas kroków
  //    (bufor na wahania sieci): rusza, gdy go uzbiera, a gdy zapas rośnie
  //    (np. po zacięciu sieci), gra odrobinę szybciej, żeby dogonić.
  const zapas = S.zapasOdwrotu(st);
  let tempo = 1;
  if (zapas !== Infinity) {
    if (!r.odwrotRuszyl && zapas >= ODWROT_BUFOR) r.odwrotRuszyl = true;
    if (!r.odwrotRuszyl) tempo = 0;
    else if (zapas > ODWROT_BUFOR * 3) tempo = 1.25;
  }
  r.akumulator = Math.min(r.akumulator + ctx.dt * tempo, 0.5);
  let kroki = 0;
  while (r.akumulator >= S.DT && kroki < 120) {
    if (S.czekaNaOdwrot(st)) {
      r.akumulator = Math.min(r.akumulator, S.DT);   // nie nadrabiamy czekania skokiem
      r.odwrotRuszyl = false;                          // znów zbieramy zapas
      break;
    }
    S.step(st);
    r.akumulator -= S.DT;
    kroki++;
    if (st.phase === 'koniec') break;
  }
  zbierzStrzaly(r, mojaTura && !a);
  if (r.mojaAkcja && otwarta && !a && r.mojaAkcja.nr === nr) {
    wyslijRaz(r, 'akcja:' + nr, r.mojaAkcja, ctx.teraz, 2500);
  }
  wyslijOdwrot(r, pokoj, ctx);        // po strzale — kolejność w logu: najpierw strzał, potem paczki

  // 5. Koniec tury: przyjmij stan z logu albo go opublikuj.
  if (st.phase === 'koniec') {
    if (r.koniecOd === null) r.koniecOd = ctx.teraz;
    const stan = otwarta ? null : pokoj.stany.get(nr);
    if (stan) {
      wejdzWStan(r, stan);
    } else if (a && r.zastosowana === kluczAkcji(a)) {
      const autor = a.id === r.mojeId;
      const zastepczo = zastepca && (
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

  // 6. Podgląd na żywo dla reszty (poza logiem): pozycja, celownik, moc,
  //    wybrana broń i jej zapas, życie oraz ostatnie zdarzenia (upadek,
  //    zebrana skrzynka, śmierć) — widz nie symuluje cudzego chodzenia,
  //    więc bez tego zobaczyłby je dopiero w strzale.
  // Zbieramy też w klatce, w której tura skończyła się sama (np. upadek do lawy),
  // i wysyłamy wtedy ostatni podgląd — inaczej widz nie zobaczy, co się stało.
  const mojeChodzenie = otwarta && !r.obserwator && pokoj.aktywny === r.mojeId && !st.firedThisTurn &&
    (!a || a.id === r.mojeId);
  const przedEfektami = r.efektNr;
  if (mojeChodzenie) zbierzEfekty(r);
  const akt6 = S.activeWorm(st);
  if (mogeGrac(r, pokoj) || (mojeChodzenie && r.efektNr > przedEfektami && akt6 && akt6.id === r.mojeId)) {
    const w = akt6;
    const zapas = w.amunicja[st.weapon];
    const ruch = {
      t: 'ruch', nr: st.turnNumber, id: r.mojeId,
      x: Math.round(w.x), y: Math.round(w.y), f: w.facing,
      k: Math.round(w.angle * 40) / 40,
      b: st.weapon,
      m: st.charging ? Math.round(st.power * 10) / 10 : 0,
      c: st.cel ? [st.cel.x, st.cel.y] : null,
      h: w.hp,
      z: zapas === undefined ? null : zapas,
      a: w.amunicja,                  // cały ekwipunek — pokazuje go tylko obserwator (nie gracz partii)
      e: r.efekty.length ? r.efekty : undefined
    };
    const sygnatura = JSON.stringify(ruch);
    const pilne = r.efektNr > przedEfektami;    // świeże zdarzenie nie czeka na odstęp
    if (sygnatura !== r.ostatniRuch && (pilne || ctx.teraz - r.ostatniRuchCzas >= (ctx.ruchCo ?? 450))) {
      r.ostatniRuch = sygnatura;
      r.ostatniRuchCzas = ctx.teraz;
      r.doWyslania.push(ruch);
    }
  }
}

/* Moja tura przed strzałem: zdarzenia z mojej symulacji, których widzowie
   nie policzą sami (chodzą po podglądzie). Kolejne numery w turze, w podglądzie
   leci kilka ostatnich — widz pokazuje te, których jeszcze nie widział,
   więc zgubiony podgląd nic nie gubi. Wydarzeń nie zjadamy (main.js je rysuje). */
const EFEKTY_W_RUCHU = 4;
function zbierzEfekty(r) {
  const st = r.state;
  for (const e of st.events) {
    if (e.wPodgladzie) continue;       // testy nie czyszczą zdarzeń co klatkę
    e.wPodgladzie = true;
    let ef = null;
    if (e.type === 'obrazenia') ef = ['o', Math.round(e.x), Math.round(e.y), e.amount];
    else if (e.type === 'smierc') ef = ['d', Math.round(e.x), Math.round(e.y), e.cause === 'lawa' ? 1 : 0];
    else if (e.type === 'skrzynka') ef = ['s', e.x, e.y, e.id, e.typ === 'apteczka' ? e.hp : e.bron];
    if (!ef) continue;
    r.efekty.push([++r.efektNr, ...ef]);
    if (r.efekty.length > EFEKTY_W_RUCHU) r.efekty.shift();
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
  r.odwrotRuszyl = false;
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
  r.odwrotWyslane = 0;
  r.odwrotCzas = -Infinity;
  r.odwrotRuszyl = false;
  r.odwrotKoniec = false;
  r.odwrotPotw = 0;
  r.odwrotPotwCzas = 0;
  r.odwrotPonowCzas = 0;
  r.efekty = [];
  r.efektNr = 0;

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

/* Moja ucieczka po strzale → paczki do logu, ciągiem od miejsca, które
   log już potwierdził. Ostatnia paczka ma `koniec`. */
function wyslijOdwrot(r, pokoj, ctx) {
  const st = r.state;
  const nag = st.odwrotNagranie;
  const m = r.mojaAkcja;
  if (!nag || !m || m.t !== 'strzal' || m.nr !== st.turnNumber) return;
  const a = pokoj.akcje.get(m.nr);
  if (a && kluczAkcji(a) !== kluczAkcji(m)) return;           // przegrałem wyścig — nie moja ucieczka
  const o = a ? pokoj.odwroty.get(m.nr) : null;
  if (o && o.koniec) return;
  const potwierdzone = o ? o.bity.length : 0;
  if (!r.odwrotPotwCzas) r.odwrotPotwCzas = ctx.teraz;
  if (potwierdzone !== r.odwrotPotw) { r.odwrotPotw = potwierdzone; r.odwrotPotwCzas = ctx.teraz; }
  if (r.odwrotWyslane < potwierdzone) r.odwrotWyslane = potwierdzone;
  if (r.odwrotWyslane > potwierdzone && ctx.teraz - Math.max(r.odwrotPotwCzas, r.odwrotPonowCzas) >= ODWROT_PONOW) {
    r.odwrotWyslane = potwierdzone;                             // coś zginęło po drodze — od potwierdzonego
    r.odwrotPonowCzas = ctx.teraz;
  }
  const skonczona = st.phase !== 'odwrot';
  const nowe = nag.length - r.odwrotWyslane;
  let pora;
  if (nowe > 0) pora = skonczona || ctx.teraz - r.odwrotCzas >= ODWROT_CO;
  else pora = skonczona && r.odwrotWyslane === potwierdzone &&
    (!r.odwrotKoniec || ctx.teraz - r.odwrotCzas >= ODWROT_PONOW);   // sam „koniec” (albo jego powtórka)
  if (!pora) return;
  const z = { t: 'odwrot', nr: m.nr, id: r.mojeId, od: r.odwrotWyslane, b: S.zwinOdwrot(nag.slice(r.odwrotWyslane)) };
  if (skonczona) { z.koniec = 1; r.odwrotKoniec = true; }
  r.doWyslania.push(z);
  r.odwrotWyslane = nag.length;
  r.odwrotCzas = ctx.teraz;
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
   nie wyszli. Gdy takich nie ma — wśród wszystkich połączonych (widzów).
   `bez` — z pominięciem tego gracza: zastępca autora akcji (domknięcie
   ucieczki, stan zastępczy) nie czeka, aż sam autor przestanie być gospodarzem. */
export function jestemGospodarzem(r, pokoj, ctx, bez = null) {
  const zywy = (id) => id !== bez && rozlaczonyOd(r, pokoj, ctx, id) < ZYWY_PULS * 1000;
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
