/* Symulacja gry: fizyka robali, pociski, tury.

   Ten plik NIE dotyka DOM-u ani Math.random(). Dzięki temu odpala się
   w Node (test/*.test.mjs) i można sprawdzić, że ten sam stan z tą samą
   akcją daje ten sam wynik — czego potrzebuje warstwa sieciowa.

   Determinizm między przeglądarkami: w części liczonej u wszystkich są
   tylko +, -, *, / i sqrt (IEEE gwarantuje identyczny wynik wszędzie).
   Trygonometria (cos/sin/atan2) potrafi się różnić na ostatnim bicie
   między silnikami JS, więc liczy ją wyłącznie strzelec, a do innych
   leci gotowy wektor startowy pocisku. */

import { mulberry32, hashNumbers, hashTekstu } from './rng.js';
import * as T from './terrain.js';
import { WEAPONS, WEAPON_ORDER, startowaAmunicja } from './weapons.js';
import { normalizuj, WIATR_MNOZNIK } from './ustawienia.js';

export const DT = 1 / 120;          // stały krok symulacji, render interpoluje

const GRAVITY = 520;
const WALK_SPEED = 82;
const MAX_STEP = 5;                 // ile pikseli robal wejdzie pod górę
export const WORM_H = 20;
const JUMP_VY = -195;
const LINA_BUJANIE = 420;           // px/s² — wymach na linie (◀ ▶)
const LINA_WCIAGANIE = 160;         // px/s — skracanie/wydłużanie liny (▲▼)
const LINA_MIN = 24;               // 4.3.1: niższy skok (ok. 70% dawnej wysokości)
const JUMP_VX = 118;
const AIM_SPEED = 1.5;              // rad/s
const FALL_SAFE_V = 330;            // poniżej tej prędkości upadek nie boli
const AIR_DRAG = 0.06;
const POWIETRZE_PRZYSP = 520;       // px/s² — sterowanie w locie (po skoku można skręcać)
const POWIETRZE_MAX = 110;          // do takiej prędkości w bok da się rozpędzić w powietrzu

export const TURN_TIME = 30;           // domyślny; w partii — state.ust.czas (ustawienia lobby)
const SETTLE_MAX = 5;
const MAX_POWER_TIME = 1.4;         // ile trwa naładowanie strzału do pełna

/* Po każdym strzale robal ma 5 s na ruch (ucieczkę). Strzał wychodzi do
   sieci od razu, a wciśnięcia z kolejnych kroków lecą za nim paczkami
   (zwinięte RLE, zdarzenie 'odwrot' w protokol.js). Odbiorca odtwarza je krok
   w krok, bit w bit tak samo jak u strzelającego — tylko o ułamek sekundy
   później, bo na każdy krok musi mieć już wciśnięcie (czekaNaOdwrot). */
export const ODWROT_S = 5;
const OWCA_SKOK = 6;                // o ile pikseli owca wejdzie pod górę
export const ODWROT_KROKI = Math.round(ODWROT_S / DT);
const ODWROT_LEWO = 1, ODWROT_PRAWO = 2, ODWROT_SKOK = 4;

/* Nagła śmierć: po tylu pełnych rundach lawa zaczyna wzbierać,
   żeby partia nie ciągnęła się w nieskończoność. Domyślnie — w partii state.ust.lawaOd (od której rundy). */
export const LAWA_PO_RUNDACH = 6;
const LAWA_ZA_TURE = 12;
const LAWA_MIN = 40;                // od 4.3.1 mapy są wysokie — lawa dochodzi prawie pod sufit

/* Pięć odłamków kasetówki — stała tabela, żadnej losowości. */
const ODLAMKI = [[-160, -220], [-80, -290], [0, -330], [80, -290], [160, -220]];

/* Zrzuty zaopatrzenia: od drugiej rundy, najwyżej tyle skrzynek naraz;
   szansa na zrzut (%) — state.ust.zrzuty. */
const SKRZYNKI_MAX = 3;
/* Miny i beczki (4.9): leżą od startu, rozstawione z seeda. Mina odpala się, gdy podejdzie
   robal (lont MINA_LONT kroków), beczka i mina — gdy zahaczy je wybuch albo railgun.
   Wybuch ustawia im tylko lont, więc reakcja łańcuchowa idzie krok po kroku, bez rekurencji. */
const MINA_LONT = 132;             // 1,1 s
const BECZKA_LONT = 14;            // chwila — ładnie widać łańcuch
const WYBUCH_MINY = { id: 'mina', radius: 44, damage: 42, knockback: 300 };
const WYBUCH_BECZKI = { id: 'beczka', radius: 62, damage: 38, knockback: 280 };
const PULAPKI_ILE = [[0, 0], [3, 3], [7, 6]];   // [miny, beczki] na mapę 2048 px wg ustawienia
/* Płonąca ropa z beczki (4.10), jak napalm w Worms: po wybuchu beczki krople ognia
   rozlatują się (stała tabela prędkości + rozrzut z id beczki — bez trygonometrii
   i Math.random), spadają, rozpływają się chwilę po ziemi, co OGIEN_CO kroków parzą
   robale obok (z podskokiem), a co OGIEN_WYPAL kroków wypalają dołek w gruncie.
   Beczkę obok podpalają.
   Żyją tylko w bieżącej turze: tura czeka, aż zgasną, a stan tury ich nie zawiera. */
const OGIEN_KROPLE = [[-170, -210], [-130, -290], [-85, -340], [-40, -300], [0, -360], [40, -300],
  [85, -340], [130, -290], [170, -210], [-220, -140], [220, -140], [-15, -230], [15, -230], [0, -150]];
const OGIEN_ZYCIE = 300;           // kroków (2,5 s) + rozrzut do 0,75 s
const OGIEN_CO = 30;               // parzenie co 0,25 s
const OGIEN_DMG = 3;
const OGIEN_ZASIEG = 12;           // px w bok od płomienia do robala
const OGIEN_WYPAL = 48;            // wypalanie gruntu co 0,4 s…
const OGIEN_WYPAL_MAX = 3;         // …najwyżej tyle razy z jednej kropli
const OGIEN_WYPAL_R = 6;
const OGIEN_MAX = 56;
export const APTECZKA_HP = 35;
const HP_MAX = 150;
const INNE_ZAPASY = WEAPON_ORDER.filter((id) => WEAPONS[id].amunicja !== undefined && id !== 'kij');

/* Co może wypaść w skrzynce z zapasem przy danym zestawie broni: tylko bronie
   z limitem, które są w tej partii dostępne (w „Szale” limitów nie ma wcale). */
function zapasyDla(zestaw) {
  if (zestaw === 'szalony') return [];
  return INNE_ZAPASY;
}

const pusteWejscie = () => ({ left: false, right: false, aimUp: false, aimDown: false });

/* Kolejność tur tasowana z seeda — identyczna u każdego klienta.
   Osobna funkcja, żeby warstwa sieciowa znała kolejkę bez liczenia mapy. */
export function kolejnoscTur(seed, ids) {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const order = ids.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export const ROBALE_MAX = 3;

/* Kolejka robali (4.8): gracze potasowani jak dawniej, a robale po kolei —
   najpierw pierwsze robale wszystkich, potem drugie… Przy 1 robalu to dokładnie
   kolejnoscTur. nextTurn i tak idzie drużynami na zmianę, a w drużynie po tej kolejce,
   więc gracze w drużynie grają na zmianę, a każdy z nich kolejnym swoim robalem. */
export function kolejnoscRobali(seed, idsGraczy, ile = 1) {
  const gracze = kolejnoscTur(seed, idsGraczy);
  const order = [];
  for (let k = 0; k < ile; k++) for (const id of gracze) order.push(k ? id + '#' + (k + 1) : id);
  return order;
}

/* Kto steruje robalem (id gracza). */
export const wlasciciel = (w) => (w ? w.gracz ?? w.id : null);

/* Amunicja jest wspólna dla robali jednego gracza (jak w Worms) — po zmianie kopiujemy ją
   do reszty jego robali (snapshot i tak niesie ją przy każdym robalu). */
function wspolnaAmunicja(state, w) {
  for (const x of state.worms) if (x !== w && x.gracz === w.gracz) x.amunicja = { ...w.amunicja };
}

/* opcje.druzyny: tryb drużynowy — gracze mają pole `druzyna` (0, 1, 2…);
   koledzy z drużyny nie zadają sobie obrażeń ani odrzutu, tury idą na zmianę
   drużynami, wygrywa ostatnia drużyna. Bez tego każdy gra sam (druzyna = numer).

   opcje.sieciowa: tura nie przechodzi sama — po osiadaniu symulacja staje
   w fazie 'koniec' i czeka, aż warstwa sieciowa poda kanoniczny stan.
   Wtedy też licznik tury prowadzi warstwa sieciowa (wspólny czas serwera).

   opcje.ustawienia: ustawienia partii z lobby (ustawienia.js) — czas tury,
   życie, bronie, zrzuty, wiatr, nagła śmierć. Brak = standardowe. */
export function createGame(seed, players, opcje = {}) {
  const ust = normalizuj(opcje.ustawienia);
  // rozmiar i styl „ekstremalna” (4.5) idą z ustawień — teren niesie je w t.opcje dla rebuild()
  const terrain = T.createTerrain(seed, {
    szer: T.SZEROKOSCI[ust.rozmiar] || T.WORLD_W,
    styl: ust.mapa === 'ekstremalna' ? 'ekstremalna' : null
  });
  // 1–3 robale na gracza (4.8). Pierwszy ma id gracza (przy 1 robalu wszystko jak dawniej),
  // kolejne `id#2`, `id#3`; `gracz` = kto nim steruje. Robale drugiej i trzeciej „fali”
  // dostają dalsze punkty startu, więc robale jednego gracza stoją w różnych miejscach mapy.
  const ile = Math.max(1, Math.min(ROBALE_MAX, ust.robale | 0));
  const spawns = T.spawnPoints(terrain, players.length * ile, seed);
  const worms = [];
  for (let k = 0; k < ile; k++) {
    players.forEach((p, i) => {
      const s = spawns[k * players.length + i];
      worms.push({
        id: k ? p.id + '#' + (k + 1) : p.id,
        gracz: p.id,
        nick: p.name,              // nick gracza (name ma numer robala, gdy jest ich kilka)
        name: ile > 1 ? p.name + ' ' + (k + 1) : p.name,
        color: p.color,
        druzyna: opcje.druzyny ? Math.max(0, p.druzyna | 0) : i,
        x: s.x,
        y: s.y,
        vx: 0,
        vy: 0,
        hp: ust.hp,
        facing: s.x < terrain.w / 2 ? 1 : -1,
        angle: s.x < terrain.w / 2 ? -0.6 : Math.PI + 0.6,
        alive: true,
        onGround: true,
        amunicja: startowaAmunicja(ust.bronie),
        odszedl: false,
        lina: null                 // lina ninja: { x, y, dl } albo null (tylko lokalnie, przed strzałem)
      });
    });
  }

  const state = {
    seed: seed >>> 0,
    terrain,
    worms,
    order: kolejnoscRobali(seed, players.map((p) => p.id), ile),
    turnPtr: 0,
    druzynowa: !!opcje.druzyny,
    ust,                       // ustawienia partii — stałe przez całą partię
    ostatni: {},               // drużyna -> kto z niej grał ostatnio (kolejka w drużynie)
    turnNumber: 0,
    phase: 'aim',
    turnTimeLeft: ust.czas,
    settleTime: 0,
    wind: 0,
    lava: terrain.lava0,
    projectiles: [],
    nextProjectileId: 1,
    skrzynki: [],              // zrzuty: { id, typ: 'apteczka' | 'zapas', x, y }
    pulapki: [],               // miny i beczki (4.9): { id, typ: 'mina' | 'beczka', x, y, lont (-1 = spokój) }
    ogien: [],                 // płonąca ropa (4.10): { x, y, vx, vy, t, zycie, wyp, grunt } — tylko w bieżącej turze
    weapon: 'bazooka',
    power: 0,
    charging: false,
    firedThisTurn: false,
    odwrotKrok: 0,             // ucieczka po strzale: krok, plan (odbiorca) albo nagranie (strzelec)
    odwrotPlan: null,
    odwrotPelny: false,        // odbiorca zna już wszystkie kroki ucieczki
    odwrotNagranie: null,
    skokWKolejce: false,
    cel: null,                 // punkt nalotu wskazany przez strzelca
    mostObrot: 0,              // obrót mostu (0–7, co 22,5°) — tylko u strzelca, leci w akcji jako cel.k
    sieciowa: !!opcje.sieciowa,
    akcjeDoWyslania: [],       // strzały oddane lokalnie, do opublikowania
    events: [],
    winner: null,
    tick: 0,
    input: pusteWejscie()
  };

  state.wind = windFor(state, 0);
  rozstawPulapki(state);
  return state;
}

/* Miny i beczki na start — z seeda, na powierzchni i w jaskiniach, z dala od robali. */
function rozstawPulapki(state) {
  const [miny, beczki] = PULAPKI_ILE[state.ust.pulapki] || PULAPKI_ILE[0];
  const t = state.terrain;
  const skala = t.w / T.WORLD_W;
  const rng = mulberry32((state.seed ^ 0x6d696e79) >>> 0);
  let id = 1;
  for (const [typ, ile] of [['mina', Math.round(miny * skala)], ['beczka', Math.round(beczki * skala)]]) {
    for (let n = 0; n < ile; n++) {
      for (let proba = 0; proba < 40; proba++) {
        const x = Math.floor(t.w * (0.04 + rng() * 0.92));
        const y = T.findGround(t, x, Math.floor(rng() * t.lava0 * 0.8), 0, t.lava0);
        if (y === null || y > t.lava0 - 30 || T.solidAt(t, x, y - 12)) continue;
        if (state.worms.some((w) => Math.abs(w.x - x) < 80 && Math.abs(w.y - y) < 80)) continue;
        if (state.pulapki.some((p) => Math.abs(p.x - x) < 30 && Math.abs(p.y - y) < 30)) continue;
        state.pulapki.push({ id: id++, typ, x, y, lont: -1 });
        break;
      }
    }
  }
}

function windFor(state, turnNumber) {
  const rng = mulberry32((state.seed + turnNumber * 0x85ebca6b) >>> 0);
  const m = WIATR_MNOZNIK[state.ust.wiatr] ?? 1;
  return (rng() * 2 - 1) * 130 * m + 0;
}

export function activeWorm(state) {
  if (state.phase === 'over') return null;
  const id = state.order[state.turnPtr % state.order.length];
  return state.worms.find((w) => w.id === id) || null;
}

/* ---------- akcje gracza ---------- */

export function jump(state) {
  const w = activeWorm(state);
  // w czasie ucieczki skok idzie przez nagranie, żeby odbiorca go powtórzył
  if (state.phase === 'odwrot' && state.odwrotNagranie) { state.skokWKolejce = true; return; }
  if (w && w.lina && state.phase === 'aim') { odczep(w); return; }   // skok puszcza linę
  if (!w || !w.alive || !w.onGround || state.phase !== 'aim') return;
  skocz(w);
  state.events.push({ type: 'skok', x: w.x, y: w.y });   // tylko dźwięk (4.9)
}

/* ---------- lina ninja (4.4) ----------
   Narzędzie przed strzałem: nie kończy tury i nie leci do sieci jako akcja.
   Tak jak chodzenie liczy się tylko u gracza z turą — odbiorcy dostają
   gotowy stan robali w strzale albo pasie (lina jest wtedy już puszczona),
   a w międzyczasie widzą ją w podglądzie na żywo. Dlatego rzut haka może
   użyć trygonometrii (jak obliczStart), a samo bujanie i tak liczy tylko sqrt. */
export function linaPrzelacz(state) {
  const w = activeWorm(state);
  if (!w || !w.alive || state.phase !== 'aim' || state.firedThisTurn) return null;
  if (w.lina) { odczep(w); return 'puszczona'; }
  const zapas = w.amunicja.lina;
  if (zapas !== undefined && zapas <= 0) return 'brak';
  const c = Math.cos(w.angle), s = Math.sin(w.angle);
  const x0 = w.x, y0 = w.y - WORM_H * 0.5;
  for (let d = 26; d <= WEAPONS.lina.zasieg; d += 3) {   // od 26 px — nie łapie ściany, o którą robal się opiera
    const x = x0 + c * d, y = y0 + s * d;
    if (x < 0 || x >= state.terrain.w || y < 0) break;
    if (T.solidAt(state.terrain, x, y)) {
      w.lina = { x: Math.round(x), y: Math.round(y), dl: d };
      if (zapas !== undefined) w.amunicja.lina = zapas - 1;
      w.onGround = false;
      state.events.push({ type: 'lina', x: w.lina.x, y: w.lina.y });
      return 'zaczepiona';
    }
  }
  return 'pudlo';
}

function odczep(w) {
  w.lina = null;
  w.onGround = false;
}

/* Wahadło: grawitacja + wymach, potem długość liny jako więź (tylko sqrt). */
function krokLiny(state, w, ster, inp) {
  const L = w.lina;
  const t = state.terrain;
  if (!T.solidAt(t, L.x, L.y)) { odczep(w); return; }       // skała pod hakiem zniknęła
  const dir = ster.left ? -1 : ster.right ? 1 : 0;
  if (dir) { obroc(w, dir); w.vx += dir * LINA_BUJANIE * DT; }
  if (inp.aimUp) L.dl = Math.max(LINA_MIN, L.dl - LINA_WCIAGANIE * DT);
  if (inp.aimDown) L.dl = Math.min(WEAPONS.lina.zasieg, L.dl + LINA_WCIAGANIE * DT);
  w.vy += GRAVITY * DT;
  w.vx -= w.vx * 0.2 * DT;
  w.vy -= w.vy * 0.2 * DT;
  let nx = w.x + w.vx * DT;
  let ny = w.y + w.vy * DT;
  // więź: środek robala nie dalej niż długość liny od haka
  let dx = nx - L.x, dy = ny - WORM_H * 0.5 - L.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > L.dl && d > 0.001) {
    const k = L.dl / d;
    nx = L.x + dx * k;
    ny = L.y + dy * k + WORM_H * 0.5;
    dx /= d; dy /= d;
    const vr = w.vx * dx + w.vy * dy;
    if (vr > 0) { w.vx -= vr * dx; w.vy -= vr * dy; }
  }
  if (cialoWSkale(t, nx, ny)) {
    // odbicie od skały: tracimy prędkość, zostajemy na miejscu
    w.vx *= -0.25;
    w.vy *= -0.25;
  } else {
    w.x = nx;
    w.y = ny;
  }
  w.x = Math.max(2, Math.min(state.terrain.w - 2, w.x));
  if (w.y > state.lava) { odczep(w); killWorm(state, w, 'lawa'); }
}

function skocz(w) {
  w.vy = JUMP_VY;
  w.vx = JUMP_VX * w.facing;
  w.onGround = false;
}

/* Kąt w układzie ekranu: 0 = w prawo, ujemny = w górę. Robal patrzący
   w prawo celuje w [-π/2, π/2], patrzący w lewo w [π/2, 3π/2]. */
function aim(w, delta) {
  w.angle += delta * (w.facing >= 0 ? 1 : -1);
  const lo = w.facing >= 0 ? -Math.PI / 2 : Math.PI / 2;
  const hi = w.facing >= 0 ? Math.PI / 2 : (3 * Math.PI) / 2;
  if (w.angle < lo) w.angle = lo;
  if (w.angle > hi) w.angle = hi;
}

/* Obrót robala: celownik odbija się lustrzanie, żeby po zawróceniu
   dalej mierzył pod tym samym kątem nad ziemią. */
function obroc(w, dir) {
  if (dir === w.facing) return;
  w.facing = dir;
  w.angle = Math.PI - w.angle;
}

/* Celowanie myszką lub palcem: kąt prosto z punktu na ekranie.
   Wolane tylko u gracza prowadzącego turę — gotowy kąt i wektor
   startowy i tak lecą w zdarzeniu strzału. */
export function ustawCelownik(state, kat) {
  const w = activeWorm(state);
  if (!w || !w.alive || state.phase !== 'aim' || state.firedThisTurn) return;
  const facing = Math.cos(kat) >= 0 ? 1 : -1;
  if (facing < 0 && kat < 0) kat += 2 * Math.PI;
  w.facing = facing;
  w.angle = kat;
  aim(w, 0);   // przycięcie do dozwolonego zakresu
}

export function ustawCel(state, x, y) {
  if (state.phase !== 'aim' || state.firedThisTurn) return;
  state.cel = {
    x: Math.max(0, Math.min(state.terrain.w, Math.round(x))),
    y: Math.max(0, Math.min(state.terrain.h, Math.round(y)))
  };
}

export function mozeStrzelic(state, weaponId) {
  const w = activeWorm(state);
  if (!w || !w.alive || state.phase !== 'aim' || state.firedThisTurn) return false;
  const weapon = WEAPONS[weaponId];
  if (!weapon || weapon.ukryta || weapon.narzedzie) return false;   // lina to nie strzał
  const zapas = w.amunicja[weaponId];
  if (zapas !== undefined && zapas <= 0) return false;
  if (weapon.celowany && !state.cel) return false;
  if (weapon.kind === 'most' && powodBrakuMostu(state, w, state.cel)) return false;
  return true;
}

/* Czy w tym miejscu da się postawić most — null znaczy, że tak.
   Sprawdza tylko strzelec (odbiorca stawia most z kanonicznej akcji). */
export function powodBrakuMostu(state, w, cel, k = state.mostObrot | 0) {
  if (!cel) return 'brak celu';
  const weapon = WEAPONS.most;
  const dx = cel.x - w.x, dy = cel.y - (w.y - WORM_H * 0.5);
  if (dx * dx + dy * dy > weapon.zasiegBudowy * weapon.zasiegBudowy) return 'za daleko';
  if (cel.y > state.lava - 12 || cel.y < 20) return 'nie tutaj';
  const kolizja = k
    ? state.worms.some((r) => r.alive && [2, WORM_H * 0.5, WORM_H].some((h) => T.wMoscie(cel.x, cel.y, k, r.x, r.y - h, 6)))
    : state.worms.some((r) => r.alive &&
      Math.abs(r.x - cel.x) < T.MOST_DL / 2 + 6 && cel.y + T.MOST_GR > r.y - WORM_H - 2 && cel.y < r.y + 1);
  if (kolizja) return 'robal na drodze';
  return null;
}

/* Klawisz R / przycisk ⟳: następne ustawienie mostu (co 22,5°). */
export function obrocMost(state) {
  state.mostObrot = ((state.mostObrot | 0) + 1) % T.MOST_KIERUNKI.length;
  return state.mostObrot;
}

export function startCharging(state) {
  if (!mozeStrzelic(state, state.weapon)) return false;
  state.charging = true;
  state.power = 0;
  return true;
}

/* Puszczenie spustu. Akcja ląduje też w state.akcjeDoWyslania — to jedyna
   droga, którą strzał wychodzi do sieci, niezależnie od tego, czy wyzwolił
   go gracz, pełne naładowanie, czy koniec czasu. */
export function releaseFire(state) {
  if (!state.charging) return null;
  state.charging = false;
  if (!mozeStrzelic(state, state.weapon)) return null;
  const akt = activeWorm(state);
  if (akt && akt.lina) odczep(akt);          // strzał z liny: puszczamy i strzelamy w locie

  const action = przygotujStrzal(state);
  // Strzelec przechodzi przez tę samą ścieżkę co odbiorca — po normalizacji
  // liczb stan u obu jest identyczny co do bitu.
  zastosujStrzal(state, action);
  if (state.phase === 'odwrot') {
    // strzelec nagrywa swoją ucieczkę; protokół wysyła ją paczkami za strzałem
    state.odwrotPlan = null;
    state.odwrotPelny = true;
    state.odwrotNagranie = [];
  }
  state.akcjeDoWyslania.push(action);
  return action;
}

/* Pełny opis strzału: stan wszystkich robali w chwili strzału i gotowy
   wektor startowy. Odbiorca nie zgaduje niczego — ustawia to, co dostał. */
export function przygotujStrzal(state) {
  const w = activeWorm(state);
  const weapon = WEAPONS[state.weapon];
  const zMoca = weapon.kind === 'pocisk' || weapon.kind === 'odbijany' || weapon.kind === 'salwa';
  const power = zMoca ? Math.max(0.08, state.power) : 0;
  return {
    wormId: w.id,
    weapon: weapon.id,
    angle: w.angle,
    power,
    robale: stanRobali(state),
    kratery: plaskieKratery(state),
    skrzynki: stanSkrzynek(state),
    pulapki: stanPulapek(state),
    ogien: stanOgnia(state),
    start: obliczStart(w, weapon, w.angle, power),
    cel: weapon.celowany && state.cel
      ? (weapon.kind === 'most' && state.mostObrot ? { x: state.cel.x, y: state.cel.y, k: state.mostObrot } : { x: state.cel.x, y: state.cel.y })
      : null
  };
}

function obliczStart(w, weapon, angle, power) {
  if (weapon.kind === 'podkladany') return { x: w.x, y: w.y - WORM_H * 0.5, vx: 0, vy: 0 };
  if (weapon.kind === 'nalot' || weapon.kind === 'teleport' || weapon.kind === 'most') return null;
  const kier = w.facing >= 0 ? 1 : -1;
  if (weapon.kind === 'owca') return { x: w.x + kier * 10, y: w.y - 2, vx: kier, vy: 0 };
  const c = Math.cos(angle), s = Math.sin(angle);
  const mx = w.x + c * 18;
  const my = w.y - WORM_H * 0.55 + s * 18;
  if (weapon.kind === 'hitscan' || weapon.kind === 'railgun') return { x: mx, y: my, vx: c, vy: s };
  if (weapon.kind === 'wiertlo') {
    return { x: w.x + c * 8, y: w.y - WORM_H * 0.5 + s * 8, vx: c * weapon.speed, vy: s * weapon.speed };
  }
  if (weapon.kind === 'kij') return { x: w.x + c * 12, y: w.y - WORM_H * 0.55 + s * 12, vx: c, vy: s };
  if (weapon.kind === 'salwa') {
    // trzy wektory liczone u strzelającego — odbiorca nie liczy trygonometrii
    const speed = weapon.speed * power;
    const salwa = [-1, 0, 1].map((k) => {
      const a = angle + k * weapon.rozrzut;
      return [Math.cos(a) * speed, Math.sin(a) * speed];
    });
    return { x: mx, y: my, vx: c * speed, vy: s * speed, salwa };
  }
  const speed = weapon.speed * power;
  return { x: mx, y: my, vx: c * speed, vy: s * speed };
}

/* Strzał odebrany z sieci (albo własny, po normalizacji).
   Zwraca true, jeśli trzeba było przebudować teren (rzadkie: np. robal
   zginął od upadku jeszcze przed strzałem i jego wybuch zrobił krater). */
export function zastosujStrzal(state, action) {
  const przebudowa = ustawKratery(state, action.kratery);
  if (action.robale) ustawRobale(state, action.robale);
  if (action.skrzynki) ustawSkrzynki(state, action.skrzynki);
  if (action.pulapki) ustawPulapki(state, action.pulapki);
  ustawOgien(state, action.ogien);     // ogień z chwili strzału (brak = nie płonie nic)
  state.weapon = action.weapon;
  applyFire(state, action);
  return przebudowa;
}

/* Tura oddana bez strzału. */
export function applyPas(state) {
  if (state.phase === 'over' || state.phase === 'koniec') return;
  for (const w of state.worms) if (w.lina) odczep(w);
  state.charging = false;
  state.power = 0;
  state.phase = 'settle';
  state.settleTime = SETTLE_MAX;
}

export function applyFire(state, action) {
  const w = state.worms.find((x) => x.id === action.wormId);
  if (!w || !w.alive) return false;
  const weapon = WEAPONS[action.weapon];
  if (!weapon || weapon.ukryta) return false;

  const zapas = w.amunicja[weapon.id];
  if (zapas !== undefined) {
    if (zapas <= 0) return false;
    w.amunicja[weapon.id] = zapas - 1;
    wspolnaAmunicja(state, w);
  }

  const start = action.start || obliczStart(w, weapon, action.angle, action.power);

  if (weapon.kind === 'hitscan') {
    strzalNatychmiastowy(state, w, start, weapon);
  } else if (weapon.kind === 'railgun') {
    strzalRailgun(state, w, start, weapon);
  } else if (weapon.kind === 'kij') {
    ciosKijem(state, w, start, weapon);
  } else if (weapon.kind === 'teleport') {
    teleportuj(state, w, action.cel);
  } else if (weapon.kind === 'most') {
    const cel = action.cel;
    if (cel) {
      const k = Number.isInteger(cel.k) && cel.k > 0 && cel.k < T.MOST_KIERUNKI.length ? cel.k : 0;
      const r = T.carve(state.terrain, cel.x, cel.y, -1 - k);
      state.events.push({ type: 'most', x: Math.round(cel.x), y: Math.round(cel.y), x0: r.x0, x1: r.x1 });
    }
  } else if (weapon.kind === 'salwa') {
    for (const [vx, vy] of (start.salwa || [[start.vx, start.vy]])) {
      spawnProjectile(state, WEAPONS.rakietka, start.x, start.y, vx, vy, w.id);
    }
  } else if (weapon.kind === 'nalot') {
    const cel = action.cel || { x: w.x, y: 0 };
    const n = weapon.rakiety;
    const kier = w.facing >= 0 ? 1 : -1;
    // Od 4.8 start każdej rakiety liczymy z wysokości celu: ile spada (grawitacja rakiety),
    // tyle zdąży ją znieść ukośny lot i wiatr — więc trafia w punkt także na wysokich
    // szczytach (dawniej stałe 70 px przesunięcia = pudło obok celu stojącego wysoko).
    const rak = WEAPONS.rakieta;
    const a = GRAVITY * rak.gravityFactor, aw = state.wind * rak.windFactor;
    for (let i = 0; i < n; i++) {
      // od 4.9 rakiety startują z wysokości 1,5× mapy (pół mapy nad jej górną krawędzią)
      const y0 = -Math.round(state.terrain.h * 0.5) - 40 - i * 22;
      const dy = Math.max(0, cel.y - y0);
      const t = (-110 + Math.sqrt(110 * 110 + 2 * a * dy)) / a;
      const dryf = kier * 55 * t + aw * t * t / 2;
      spawnProjectile(state, rak, cel.x + (i - (n - 1) / 2) * weapon.rozstaw - dryf + 0, y0, kier * 55, 110, null);
    }
  } else {
    spawnProjectile(state, weapon, start.x, start.y, start.vx, start.vy, w.id);
  }

  state.firedThisTurn = true;
  state.charging = false;
  state.power = 0;
  // po każdej broni: 5 s ruchu (faza odwrot), potem lot i osiadanie
  state.phase = 'odwrot';
  state.odwrotKrok = 0;
  // Całe nagranie w akcji (testy, stary zapis) albo — w sieci — paczki na żywo.
  state.odwrotPlan = rozwinOdwrot(action.odwrot);
  state.odwrotPelny = Array.isArray(action.odwrot) || !state.sieciowa;
  state.odwrotNagranie = null;
  state.skokWKolejce = false;
  state.events.push({ type: 'strzal', weapon: weapon.id, wormId: w.id, x: w.x, y: w.y - WORM_H * 0.5 });
  return true;
}

function spawnProjectile(state, weapon, x, y, vx, vy, ownerId) {
  state.projectiles.push({
    id: state.nextProjectileId++,
    weapon: weapon.id,
    x: x + 0, y: y + 0, vx: vx + 0, vy: vy + 0,
    fuse: weapon.kind === 'wiertlo' ? weapon.czas : weapon.fuse,
    ownerId,
    krok: 0
  });
}

/* Kij: cios wręcz w stronę celownika — trafia robale blisko końca kija,
   mało obrażeń, ogromny odrzut (najlepiej prosto w lawę). */
function ciosKijem(state, w, start, weapon) {
  state.events.push({ type: 'uderzenie', x: start.x, y: start.y });
  for (const inny of state.worms) {
    if (!inny.alive || inny === w || swoj(state, inny, w.id)) continue;
    const dx = inny.x - start.x;
    const dy = (inny.y - WORM_H * 0.5) - start.y;
    if (dx * dx + dy * dy > weapon.zasieg * weapon.zasieg) continue;
    damageWorm(state, inny, weapon.damage, 'kij');
    if (!inny.alive) continue;
    inny.vx += start.vx * weapon.knockback;
    inny.vy += start.vy * weapon.knockback - weapon.knockback * 0.35;
    inny.onGround = false;
  }
}

/* Teleport: robal ląduje we wskazanym miejscu. Cel w skale — szukamy wolnego
   miejsca w górę (do 220 px); nad lawą albo bez miejsca — teleport nie działa. */
function teleportuj(state, w, cel) {
  if (!cel) return;
  const t = state.terrain;
  const x = Math.round(Math.max(12, Math.min(state.terrain.w - 12, cel.x)));
  let y = Math.round(cel.y);
  const wolne = (yy) => !T.solidAt(t, x, yy - 1) && !T.solidAt(t, x, yy - WORM_H * 0.5) && !T.solidAt(t, x, yy - WORM_H + 1);
  let n = 0;
  while (!wolne(y) && n < 220) { y--; n++; }
  if (!wolne(y) || y >= state.lava - 4 || y < 10) return;
  state.events.push({ type: 'teleport', x0: w.x, y0: w.y, x1: x, y1: y });
  w.x = x;
  w.y = y;
  w.vx = 0;
  w.vy = 0;
  w.onGround = false;
}

/* Strzelba: promień po prostej co 2 px, do pierwszej skały albo robala. */
function strzalNatychmiastowy(state, w, start, weapon) {
  const t = state.terrain;
  let x = start.x, y = start.y;
  const dx = start.vx * 2, dy = start.vy * 2;
  const kroki = Math.ceil(weapon.zasieg / 2);
  let trafiony = null, wSkale = false;

  for (let i = 0; i < kroki; i++) {
    x += dx;
    y += dy;
    if (x < 0 || x >= state.terrain.w || y >= state.lava || y < -200) break;
    if (T.solidAt(t, x, y)) { wSkale = true; break; }
    trafiony = state.worms.find(
      (o) => o.alive && o.id !== w.id && !swoj(state, o, w.id) && Math.abs(o.x - x) < 9 && y > o.y - WORM_H && y < o.y
    ) || null;
    if (trafiony) break;
  }

  state.events.push({ type: 'smuga', x0: start.x, y0: start.y, x1: x, y1: y });
  if (trafiony) {
    damageWorm(state, trafiony, weapon.bezposrednie, 'strzal');
    if (trafiony.alive) {
      trafiony.vx += start.vx * weapon.knockback;
      trafiony.vy += start.vy * weapon.knockback - 60;
      trafiony.onGround = false;
    }
    explode(state, x, y, weapon);
  } else if (wSkale) {
    explode(state, x, y, weapon);
  }
}

/* Railgun (4.9): laser leci po prostej aż za mapę — przez skały i przez robale; każdy trafiony
   dostaje raz pełne obrażenia. Od 4.10 wypala w każdej skale na drodze tunel (nad lawą). Kierunek (vx, vy)
   policzył strzelający (obliczStart), tu tylko dodawanie i porównania. */
function strzalRailgun(state, w, start, weapon) {
  const t = state.terrain;
  let x = start.x, y = start.y;
  const dx = start.vx * 2, dy = start.vy * 2;
  const trafieni = [];
  // skała na drodze lasera (nad lawą): odcinki od wejścia do wyjścia, szczeliny do 12 px się sklejają;
  // wycinamy je dopiero po przejściu lasera, żeby wycinanie nie zmieniało tego, co laser „widzi”
  const tunele = [];
  let wejscie = null, ostatni = null, powietrze = 0;
  for (let i = 0; i < 6000; i++) {
    x += dx;
    y += dy;
    if (x < -40 || x >= t.w + 40 || y < -400 || y > t.h + 40) break;
    if (y < state.lava && T.solidAt(t, x, y)) {
      if (!wejscie) wejscie = [x, y];
      ostatni = [x, y];
      powietrze = 0;
    } else if (wejscie && ++powietrze > 6) {
      tunele.push([wejscie[0], wejscie[1], ostatni[0], ostatni[1]]);
      wejscie = null;
    }
    for (const p of state.pulapki) {
      if (p.lont < 0 && Math.abs(p.x - x) < 9 && y > p.y - 16 && y < p.y + 2) p.lont = p.typ === 'beczka' ? BECZKA_LONT : 6;
    }
    for (const o of state.worms) {
      if (!o.alive || o === w || trafieni.includes(o) || swoj(state, o, w.id)) continue;
      if (Math.abs(o.x - x) < 9 && y > o.y - WORM_H - 2 && y < o.y + 2) trafieni.push(o);
    }
  }
  if (wejscie) tunele.push([wejscie[0], wejscie[1], ostatni[0], ostatni[1]]);
  state.events.push({ type: 'railgun', x0: start.x, y0: start.y, x1: x, y1: y, trafieni: trafieni.length });
  for (const [ax, ay, bx, by] of tunele) {
    const pole = T.wytnijTunel(t, ax, ay, bx, by, weapon.tunel);
    state.events.push({ type: 'tunel', x0: pole.x0, x1: pole.x1, ax, ay, bx, by, r: weapon.tunel });
  }
  for (const o of trafieni) {
    damageWorm(state, o, weapon.damage, 'railgun');
    if (o.alive) {
      o.vx += start.vx * weapon.knockback + 0;
      o.vy += start.vy * weapon.knockback - 80 + 0;
      o.onGround = false;
    }
  }
}

/* ---------- krok symulacji ---------- */

export function step(state) {
  if (state.phase === 'over' || state.phase === 'koniec') return;
  state.tick++;

  const act = activeWorm(state);

  // Zabezpieczenie: jeśli aktywny robal nie żyje (np. wszedł do lawy),
  // tura musi ruszyć dalej — inaczej gra stoi w miejscu.
  if (state.phase === 'aim' && (!act || !act.alive)) {
    state.charging = false;
    state.phase = 'settle';
    state.settleTime = SETTLE_MAX;
  }

  if (state.phase === 'aim' && act && act.alive) {
    if (state.input.aimUp) aim(act, -AIM_SPEED * DT);
    if (state.input.aimDown) aim(act, AIM_SPEED * DT);
    if (state.charging) {
      state.power = Math.min(1, state.power + DT / MAX_POWER_TIME);
      if (state.power >= 1) releaseFire(state);
    }
    if (!state.sieciowa) {
      state.turnTimeLeft -= DT;
      if (state.turnTimeLeft <= 0) {
        state.turnTimeLeft = 0;
        applyPas(state);
      }
    }
  }

  let ster = state.input;
  if (state.phase === 'odwrot') {
    let b;
    if (state.odwrotNagranie) {
      const inp = state.input;
      b = (inp.left ? ODWROT_LEWO : inp.right ? ODWROT_PRAWO : 0) | (state.skokWKolejce ? ODWROT_SKOK : 0);
      state.skokWKolejce = false;
      state.odwrotNagranie.push(b);
    } else {
      b = state.odwrotPlan[state.odwrotKrok] || 0;
    }
    state.odwrotKrok++;
    ster = { left: (b & ODWROT_LEWO) !== 0, right: (b & ODWROT_PRAWO) !== 0 };
    if ((b & ODWROT_SKOK) && act && act.alive && act.onGround) skocz(act);
  }

  const steruje = state.phase === 'aim' || state.phase === 'odwrot';
  for (const w of state.worms) stepWorm(state, w, w === act && steruje, ster);
  stepProjectiles(state);
  stepSkrzynki(state);
  stepPulapki(state);
  stepOgien(state);

  // Nagranie zostaje do końca tury — protokół wysyła z niego ostatnią paczkę.
  if (state.phase === 'odwrot' && state.odwrotKrok >= ODWROT_KROKI) state.phase = 'flight';

  if (state.phase === 'flight' && state.projectiles.length === 0) {
    state.phase = 'settle';
    state.settleTime = 0;
  }

  if (state.phase === 'settle') {
    state.settleTime += DT;
    const moving = state.worms.some((w) => w.alive && (!w.onGround || Math.abs(w.vy) > 8)) ||
      state.pulapki.some((p) => p.lont >= 0) || state.ogien.length > 0;
    if (!moving || state.settleTime > SETTLE_MAX) {
      if (state.sieciowa) {
        state.phase = 'koniec';
        state.events.push({ type: 'koniecTury', nr: state.turnNumber });
      } else {
        nextTurn(state);
      }
    }
  }
}

function headBlocked(t, x, groundY) {
  return T.solidAt(t, x, groundY - WORM_H) || T.solidAt(t, x, groundY - WORM_H + 6) ||
    T.solidAt(t, x, groundY - WORM_H * 0.5);
}

/* Czy w kolumnie x robal stojący stopami na y miałby skałę w ciele. */
function cialoWSkale(t, x, y) {
  return T.solidAt(t, x, y - 1) || T.solidAt(t, x, y - WORM_H * 0.5) || T.solidAt(t, x, y - WORM_H + 2);
}

/* Odbiorca: kolejne kroki ucieczki z sieci. `pelny` — więcej nie będzie
   (brakujące kroki to „stoi w miejscu”). */
export function dopiszOdwrot(state, bity, pelny) {
  if (!state.odwrotPlan) state.odwrotPlan = [];
  for (const b of bity) {
    if (state.odwrotPlan.length >= ODWROT_KROKI) break;
    state.odwrotPlan.push(b & 7);
  }
  if (pelny) state.odwrotPelny = true;
}

/* Czy odbiorca musi poczekać na kolejną paczkę, zanim zrobi następny krok. */
export function czekaNaOdwrot(state) {
  return state.phase === 'odwrot' && !state.odwrotNagranie && !state.odwrotPelny &&
    state.odwrotKrok >= (state.odwrotPlan ? state.odwrotPlan.length : 0);
}

/* Ile kroków ucieczki odbiorca ma już w zapasie (bufor na wahania sieci). */
export function zapasOdwrotu(state) {
  if (state.phase !== 'odwrot' || state.odwrotNagranie || state.odwrotPelny) return Infinity;
  return (state.odwrotPlan ? state.odwrotPlan.length : 0) - state.odwrotKrok;
}

export function zwinOdwrot(bity) {
  const rle = [];
  for (const b of bity) {
    const ost = rle[rle.length - 1];
    if (ost && ost[1] === b) ost[0]++;
    else rle.push([1, b]);
  }
  return rle;
}

export function rozwinOdwrot(rle) {
  const out = [];
  if (!Array.isArray(rle)) return out;
  for (const p of rle) {
    if (!Array.isArray(p)) continue;
    const n = Math.min(ODWROT_KROKI, Math.max(0, p[0] | 0));
    for (let i = 0; i < n && out.length < ODWROT_KROKI; i++) out.push(p[1] & 7);
  }
  return out;
}

function stepWorm(state, w, controllable, ster) {
  if (!w.alive) return;
  const t = state.terrain;
  if (w.lina) {
    if (controllable && state.phase === 'aim') { krokLiny(state, w, ster, state.input); return; }
    odczep(w);
  }

  if (controllable && w.onGround) {
    let dir = 0;
    if (ster.left) dir = -1;
    else if (ster.right) dir = 1;
    if (dir !== 0) {
      obroc(w, dir);
      const nx = w.x + dir * WALK_SPEED * DT;
      const g = T.findGround(t, nx, w.y, MAX_STEP, MAX_STEP);
      if (g !== null && !headBlocked(t, nx, g)) {
        w.x = nx;
        w.y = g;
      } else if (g === null && !cialoWSkale(t, nx, w.y)) {
        // naprawdę krawędź (pod nogami pusto) — schodzimy i spadamy
        w.x = nx;
        w.onGround = false;
      }
      // g === null przy pełnej skale obok = stroma ściana: stoimy.
      // Wcześniej robal wchodził wtedy w skałę i przenikał przez zbocze.
    }
  }

  if (controllable && !w.onGround) {
    // Sterowanie w locie: wolno dopychać w stronę wciśniętego kierunku, ale nie
    // szybciej niż POWIETRZE_MAX — odrzutu z wybuchu nie da się „wyprzedzić”.
    const dir = ster.left ? -1 : ster.right ? 1 : 0;
    if (dir !== 0) {
      obroc(w, dir);
      if (w.vx * dir < POWIETRZE_MAX) {
        w.vx += dir * POWIETRZE_PRZYSP * DT;
        if (w.vx * dir > POWIETRZE_MAX) w.vx = dir * POWIETRZE_MAX;
      }
    }
  }

  if (!w.onGround) {
    w.vy += GRAVITY * DT;
    w.vx -= w.vx * AIR_DRAG * DT * 60 * DT;

    moveAxis(state, w, w.vx * DT, 0);
    moveAxis(state, w, 0, w.vy * DT);
  } else if (!T.solidAt(t, w.x, w.y + 1)) {
    w.onGround = false;   // grunt zniknął pod nogami (np. po wybuchu)
  }

  if (w.y > state.lava) killWorm(state, w, 'lawa');
}

function moveAxis(state, w, dx, dy) {
  const t = state.terrain;
  const dist = Math.abs(dx) + Math.abs(dy);
  const steps = Math.max(1, Math.ceil(dist));
  const ix = dx / steps, iy = dy / steps;

  for (let i = 0; i < steps; i++) {
    const nx = w.x + ix, ny = w.y + iy;

    if (iy > 0 && T.solidAt(t, nx, ny)) {          // lądowanie
      const impact = Math.abs(w.vy);
      if (impact > FALL_SAFE_V) {
        const dmg = Math.round((impact - FALL_SAFE_V) / 7);
        if (dmg > 0) damageWorm(state, w, dmg, 'upadek');
      }
      w.vy = 0;
      w.vx = 0;
      w.onGround = true;
      return;
    }
    if (iy < 0 && T.solidAt(t, nx, ny - WORM_H)) { // uderzenie głową w strop
      w.vy = 0;
      return;
    }
    if (ix !== 0 && (T.solidAt(t, nx, ny - WORM_H * 0.5) || T.solidAt(t, nx, ny - WORM_H + 2) || T.solidAt(t, nx, ny - 3))) {
      // ściana: spróbuj wejść na nią, jeśli to tylko próg
      const g = T.findGround(t, nx, ny, MAX_STEP, 0);
      if (g !== null && !headBlocked(t, nx, g)) {
        w.x = nx;
        w.y = g;
        continue;
      }
      w.vx = 0;
      return;
    }
    w.x = nx;
    w.y = ny;
  }
}

function stepProjectiles(state) {
  const t = state.terrain;

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    const weapon = WEAPONS[p.weapon];

    if (p.fuse !== null) {
      p.fuse -= DT;
      if (p.fuse <= 0) {
        detonate(state, p, i);
        continue;
      }
    }

    if (weapon.kind === 'owca') {
      krokOwcy(state, p, weapon, i);
      continue;
    }
    if (weapon.kind === 'wiertlo') {
      krokWiertla(state, p, weapon, i);
      continue;
    }

    p.vx += state.wind * weapon.windFactor * DT;
    p.vy += GRAVITY * weapon.gravityFactor * DT;

    const dx = p.vx * DT, dy = p.vy * DT;
    const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy)));
    const ix = dx / steps, iy = dy / steps;
    let done = false;

    for (let s = 0; s < steps && !done; s++) {
      const nx = p.x + ix, ny = p.y + iy;

      if (T.solidAt(t, nx, ny)) {
        if (weapon.kind === 'pocisk') detonate(state, p, i);
        else bounce(state, p, weapon);
        done = true;
        break;
      }

      // trafienie w robala — tylko dla pocisków lecących
      if (weapon.kind === 'pocisk') {
        const hit = state.worms.find(
          (w) => w.alive && w.id !== p.ownerId && !swoj(state, w, p.ownerId) &&
                 Math.abs(w.x - nx) < 9 && ny > w.y - WORM_H && ny < w.y
        );
        if (hit) {
          detonate(state, p, i);
          done = true;
          break;
        }
      }

      p.x = nx;
      p.y = ny;
    }

    if (done) continue;

    if (p.y > state.lava || p.x < -80 || p.x > state.terrain.w + 80) {
      state.projectiles.splice(i, 1);
      state.events.push({ type: 'plusk', x: p.x, y: Math.min(p.y, state.lava) });
    }
  }
}

/* Owca: vx = kierunek (±1), vy = prędkość spadania. Na ziemi biegnie,
   wchodzi na progi do OWCA_SKOK px, na ścianie zawraca; bez gruntu spada.
   Wybucha przy pierwszym robalu innym niż właściciel albo po zapalniku. */
function krokOwcy(state, p, weapon, i) {
  const t = state.terrain;
  const naZiemi = T.solidAt(t, p.x, p.y + 1);
  if (naZiemi && p.vy >= 0) {
    p.vy = 0;
    const nx = p.x + p.vx * weapon.predkosc * DT;
    const g = T.findGround(t, nx, p.y, OWCA_SKOK, OWCA_SKOK);
    if (g !== null && !T.solidAt(t, nx, g - 8)) {
      p.x = nx;
      p.y = g;
    } else if (g === null && !T.solidAt(t, nx, p.y - 2) && !T.solidAt(t, nx, p.y - 8)) {
      p.x = nx;                                   // krawędź: dalej spada
    } else if (!T.solidAt(t, p.x - p.vx * 4, p.y - 22)) {
      p.vy = -weapon.skok;                        // przeszkoda: owca skacze przez nią
    } else {
      p.vx = -p.vx;                               // nisko nad głową strop: zawraca
    }
  } else {
    // w locie leci do przodu i spada; uderzenie w ścianę = zawrót
    p.vy += GRAVITY * DT;
    const nx = p.x + p.vx * weapon.predkosc * DT;
    if (!T.solidAt(t, nx, p.y - 2) && !T.solidAt(t, nx, p.y - 8)) p.x = nx;
    else if (p.vy > 0) p.vx = -p.vx;              // spada na ścianę: zawraca (wznosząc się — czeka, aż przeskoczy)
    const kroki = Math.max(1, Math.ceil(Math.abs(p.vy * DT)));
    const iy = (p.vy * DT) / kroki;
    for (let k = 0; k < kroki; k++) {
      if (iy > 0 && T.solidAt(t, p.x, p.y + iy + 1)) {
        // lądowanie: stopy na całym pikselu tuż nad gruntem, inaczej ułamek
        // wysokości sprawia, że owca „wisi” i nigdy nie biegnie po ziemi
        let yy = Math.floor(p.y + iy + 1);
        while (yy > 0 && T.solidAt(t, p.x, yy)) yy--;
        p.y = yy;
        p.vy = 0;
        break;
      }
      // strop sprawdzany kawałek za owcą — przy ścianie przód bywa już w skale
      if (iy < 0 && T.solidAt(t, p.x - p.vx * 4, p.y + iy - 10)) { p.vy = 0; break; }
      p.y += iy;
    }
  }
  const trafiony = state.worms.find(
    (w) => w.alive && w.id !== p.ownerId && !swoj(state, w, p.ownerId) && Math.abs(w.x - p.x) < 11 && p.y > w.y - WORM_H - 4 && p.y < w.y + 4
  );
  if (trafiony) { detonate(state, p, i); return; }
  if (p.y > state.lava || p.x < -80 || p.x > state.terrain.w + 80) {
    state.projectiles.splice(i, 1);
    state.events.push({ type: 'plusk', x: p.x, y: Math.min(p.y, state.lava) });
  }
}

/* Wiertło: jedzie prosto (bez grawitacji i wiatru) i co kilka kroków wycina
   kółko — powstaje tunel. Trafiony robal albo koniec czasu = mały wybuch. */
function krokWiertla(state, p, weapon, i) {
  p.x += p.vx * DT;
  p.y += p.vy * DT;
  if (p.krok % 8 === 0) {
    T.carve(state.terrain, p.x, p.y, weapon.promien);
    state.events.push({ type: 'wiercenie', x: Math.round(p.x), y: Math.round(p.y), r: weapon.promien });
  }
  p.krok++;
  const trafiony = state.worms.find(
    (w) => w.alive && w.id !== p.ownerId && !swoj(state, w, p.ownerId) && Math.abs(w.x - p.x) < 10 && p.y > w.y - WORM_H - 2 && p.y < w.y + 2
  );
  if (trafiony) { detonate(state, p, i); return; }
  if (p.y > state.lava || p.y < -200 || p.x < -80 || p.x > state.terrain.w + 80) {
    state.projectiles.splice(i, 1);
    if (p.y > state.lava) state.events.push({ type: 'plusk', x: p.x, y: state.lava });
  }
}

function bounce(state, p, weapon) {
  const n = surfaceNormal(state.terrain, p.x, p.y);
  const dot = p.vx * n.x + p.vy * n.y;
  const r = weapon.restitution ?? 0.5;
  p.vx = (p.vx - 2 * dot * n.x) * r;
  p.vy = (p.vy - 2 * dot * n.y) * r;
  // odsuń od ściany, żeby nie utknął w niej na kolejnej klatce
  p.x += n.x * 2;
  p.y += n.y * 2;
  state.events.push({ type: 'odbicie', x: p.x, y: p.y });
}

function surfaceNormal(t, x, y) {
  let nx = 0, ny = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (T.solidAt(t, x + dx, y + dy)) { nx -= dx; ny -= dy; }
    }
  }
  const len = Math.sqrt(nx * nx + ny * ny);
  if (len < 0.0001) return { x: 0, y: -1 };
  return { x: nx / len, y: ny / len };
}

function detonate(state, p, index) {
  state.projectiles.splice(index, 1);
  const weapon = WEAPONS[p.weapon];
  explode(state, p.x, p.y, weapon);
  if (weapon.odlamki) {
    for (const [vx, vy] of ODLAMKI) {
      spawnProjectile(state, WEAPONS.odlamek, p.x, p.y - 6, vx, vy, null);
    }
  }
}

/* Kolega z drużyny tego, kto teraz działa (albo właściciela pocisku) —
   takiego broń nie rani, nie odrzuca i przez niego przelatuje. Siebie tak. */
function swoj(state, w, ownerId) {
  if (!state.druzynowa) return false;
  const o = ownerId ? state.worms.find((x) => x.id === ownerId) : activeWorm(state);
  return !!o && o !== w && o.druzyna === w.druzyna;
}

export function explode(state, x, y, weapon) {
  T.carve(state.terrain, x, y, weapon.radius);
  state.events.push({ type: 'wybuch', x, y, r: weapon.radius });
  for (let i = state.skrzynki.length - 1; i >= 0; i--) {
    const c = state.skrzynki[i];
    const dx = c.x - x, dy = c.y - 8 - y;
    if (dx * dx + dy * dy <= (weapon.radius + 8) * (weapon.radius + 8)) {
      state.skrzynki.splice(i, 1);
      state.events.push({ type: 'skrzynkaRozbita', x: c.x, y: c.y });
    }
  }

  // wybuch odpala beczki i miny w zasięgu (4.9) — łańcuch idzie przez lont w stepPulapki
  for (const p of state.pulapki) {
    if (p.lont >= 0) continue;
    const dx = p.x - x, dy = p.y - 6 - y;
    const r = weapon.radius + 10;
    if (dx * dx + dy * dy <= r * r) p.lont = p.typ === 'beczka' ? BECZKA_LONT : 6;
  }

  const reach = weapon.radius * 1.7;
  for (const w of state.worms) {
    if (!w.alive || swoj(state, w)) continue;
    const dx = w.x - x;
    const dy = (w.y - WORM_H * 0.5) - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > reach) continue;

    const f = 1 - d / reach;
    damageWorm(state, w, Math.round(weapon.damage * f), 'wybuch');
    if (!w.alive) continue;

    const imp = weapon.knockback * f;
    const len = d < 0.001 ? 1 : d;
    w.vx += (dx / len) * imp;
    w.vy += (dy / len) * imp - imp * 0.35;
    w.onGround = false;
  }
}

function damageWorm(state, w, amount, cause) {
  if (!w.alive || amount <= 0) return;
  w.hp -= amount;
  state.events.push({ type: 'obrazenia', wormId: w.id, amount, cause, x: w.x, y: w.y });
  if (w.hp <= 0) {
    w.hp = 0;
    killWorm(state, w, cause);
  }
}

function killWorm(state, w, cause) {
  if (!w.alive) return;
  w.alive = false;
  w.hp = 0;
  state.events.push({ type: 'smierc', wormId: w.id, cause, x: w.x, y: w.y });
  // Robal wybucha po śmierci — tylko jeśli nie wpadł do lawy.
  if (cause !== 'lawa') {
    explode(state, w.x, w.y - WORM_H * 0.5,
      { radius: 34, damage: 22, knockback: 170, id: 'zwloki' });
  }
}

/* Gracze, którzy wyszli albo wypadli z sieci: robal znika z areny bez
   wybuchu. Wołane wyłącznie na granicy tur, w stanie kanonicznym. */
export function usunGraczy(state, ids) {
  for (const w of state.worms) {
    if (!(ids.includes(w.gracz) || ids.includes(w.id)) || w.odszedl) continue;
    w.odszedl = true;
    if (w.alive) {
      w.alive = false;
      w.hp = 0;
      state.events.push({ type: 'odszedl', wormId: w.id, x: w.x, y: w.y });
    }
  }
}

function nextTurn(state) {
  const living = state.worms.filter((w) => w.alive);
  if (new Set(living.map((w) => w.druzyna)).size <= 1) {
    // została jedna drużyna (w trybie „każdy na każdego” — jeden robal)
    state.phase = 'over';
    state.winner = living[0] ? wlasciciel(living[0]) : null;   // id gracza (przy 1 robalu = id robala)
    state.charging = false;
    state.events.push({ type: 'koniec', winner: state.winner });
    return;
  }

  // Na zmianę drużynami, a w drużynie po kolei (jak w Worms). Kolejność drużyn
  // i graczy w drużynie bierze się z potasowanej kolejki `order`, więc w trybie
  // „każdy na każdego” wychodzi dokładnie dawne „następny żywy z kolejki”.
  const n = state.order.length;
  const druzynaRobala = (id) => { const w = state.worms.find((x) => x.id === id); return w ? w.druzyna : -1; };
  const teraz = state.order[state.turnPtr % n];
  const moja = druzynaRobala(teraz);
  state.ostatni[moja] = teraz;
  const druzyny = [];
  for (const id of state.order) { const d = druzynaRobala(id); if (!druzyny.includes(d)) druzyny.push(d); }
  const di = druzyny.indexOf(moja);
  for (let k = 1; k <= druzyny.length; k++) {
    const d = druzyny[(di + k) % druzyny.length];
    const ost = state.ostatni[d];
    const od = ost === undefined ? -1 : state.order.indexOf(ost);
    let wybrany = -1;
    for (let j = 1; j <= n; j++) {
      const idx = (od + j + n) % n;
      const w = state.worms.find((x) => x.id === state.order[idx]);
      if (w && w.alive && w.druzyna === d) { wybrany = idx; break; }
    }
    if (wybrany >= 0) { state.turnPtr = wybrany; break; }
  }

  state.turnNumber++;
  // ustawienie 'lawaOd': od której rundy (pełnego kółka graczy) lawa rośnie, 0 = nigdy
  const lawaOd = state.ust.lawaOd;
  if (lawaOd && state.turnNumber >= state.order.length * lawaOd) {
    const nowa = Math.max(LAWA_MIN, state.lava - (state.ust.lawaTempo || LAWA_ZA_TURE));
    if (nowa !== state.lava) {
      state.lava = nowa;
      state.events.push({ type: 'lawa', y: nowa });
    }
  }
  zrzutZaopatrzenia(state);
  rozpocznijTure(state);
}

/* Na początku tury czasem spada skrzynka. Wszystko z seeda i numeru tury,
   więc każdy klient zrzuca to samo w tym samym miejscu — zero ruchu w sieci.
   Skrzynka ląduje od razu na gruncie (spadanie na spadochronie to tylko
   animacja w render.js). */
function zrzutZaopatrzenia(state) {
  if (state.turnNumber < state.order.length || state.skrzynki.length >= SKRZYNKI_MAX) return;
  const rng = mulberry32((state.seed ^ Math.imul(state.turnNumber + 1, 0x27d4eb2d)) >>> 0);
  if (Math.floor(rng() * 100) >= state.ust.zrzuty) return;
  let typ = rng() < 0.6 ? 'apteczka' : 'zapas';
  if (!zapasyDla(state.ust.bronie).length) typ = 'apteczka';   // „Szał”: zapas nie ma czego dać
  for (let proba = 0; proba < 12; proba++) {
    const x = Math.round(state.terrain.w * (0.1 + rng() * 0.8));
    const y = T.findGround(state.terrain, x, 0, 0, state.lava - 12);
    if (y === null || y > state.lava - 16) continue;
    if (state.worms.some((w) => w.alive && Math.abs(w.x - x) < 40)) continue;
    state.skrzynki.push({ id: state.turnNumber, typ, x, y });
    state.events.push({ type: 'zrzut', id: state.turnNumber, typ, x, y });
    return;
  }
}

/* Skrzynki spadają, gdy wybuch wytnie grunt spod nich, toną w lawie,
   a robal, który w nie wejdzie, zbiera zawartość. */
function stepSkrzynki(state) {
  const t = state.terrain;
  for (let i = state.skrzynki.length - 1; i >= 0; i--) {
    const c = state.skrzynki[i];
    if (!T.solidAt(t, c.x, c.y + 1)) {
      c.y += 2;
      if (c.y > state.lava) {
        state.skrzynki.splice(i, 1);
        state.events.push({ type: 'plusk', x: c.x, y: state.lava });
        continue;
      }
    }
    const w = state.worms.find((r) => r.alive && Math.abs(r.x - c.x) < 14 && c.y > r.y - WORM_H - 6 && c.y < r.y + 10);
    if (!w) continue;
    state.skrzynki.splice(i, 1);
    if (c.typ === 'apteczka') {
      const ile = Math.max(0, Math.min(APTECZKA_HP, Math.max(HP_MAX, state.ust.hp) - w.hp));
      w.hp += ile;
      state.events.push({ type: 'skrzynka', id: c.id, typ: c.typ, wormId: w.id, x: c.x, y: c.y, hp: ile });
    } else {
      // kij jest tylko w skrzynkach, więc wypada w co trzeciej
      const los = Math.imul(c.id + 7, 0x9e3779b1) >>> 0;
      const zapasy = zapasyDla(state.ust.bronie);
      const bron = los % 3 === 0 || !zapasy.length ? 'kij' : zapasy[(los >>> 4) % zapasy.length];
      w.amunicja[bron] = (w.amunicja[bron] || 0) + 1;
      wspolnaAmunicja(state, w);
      state.events.push({ type: 'skrzynka', id: c.id, typ: c.typ, wormId: w.id, x: c.x, y: c.y, bron });
    }
  }
}

/* Pola, które na starcie każdej tury są zawsze takie same. */
export function rozpocznijTure(state) {
  for (const w of state.worms) w.lina = null;
  state.turnTimeLeft = state.ust.czas;
  state.phase = 'aim';
  state.settleTime = 0;
  state.firedThisTurn = false;
  state.charging = false;
  state.power = 0;
  state.cel = null;
  state.odwrotKrok = 0;
  state.odwrotPlan = null;
  state.odwrotPelny = false;
  state.odwrotNagranie = null;
  state.skokWKolejce = false;
  state.projectiles = [];
  state.ogien = [];
  state.wind = windFor(state, state.turnNumber);
  state.input = pusteWejscie();
  const w = activeWorm(state);
  state.events.push({ type: 'tura', wormId: w ? w.id : null, wind: state.wind, nr: state.turnNumber });
}

/* ---------- synchronizacja ---------- */

export function stanRobali(state) {
  return state.worms.map((w) => ({
    id: w.id,
    x: w.x, y: w.y, vx: w.vx, vy: w.vy,
    hp: w.hp,
    alive: w.alive,
    onGround: w.onGround,
    facing: w.facing,
    angle: w.angle,
    amunicja: { ...w.amunicja },
    odszedl: !!w.odszedl
  }));
}

/* + 0 zamienia -0 na 0: JSON i tak zapisze -0 jako 0, więc bez tego
   nadawca miałby inną wartość niż odbiorca. */
export function ustawRobale(state, robale) {
  for (const s of robale) {
    const w = state.worms.find((x) => x.id === s.id);
    if (!w) continue;
    w.x = s.x + 0;
    w.y = s.y + 0;
    w.vx = s.vx + 0;
    w.vy = s.vy + 0;
    w.hp = s.hp;
    w.alive = !!s.alive;
    w.onGround = !!s.onGround;
    w.facing = s.facing >= 0 ? 1 : -1;
    w.angle = s.angle + 0;
    w.amunicja = { ...(s.amunicja || {}) };
    w.odszedl = !!s.odszedl;
    w.lina = null;             // lina nie leci przez sieć — w strzale i pasie jest już puszczona
  }
}

/* Miny i beczki: spadają, gdy wybuch wytnie grunt, toną w lawie, mina łapie robala,
   a po lontcie — wybuch. */
function stepPulapki(state) {
  const t = state.terrain;
  for (let i = state.pulapki.length - 1; i >= 0; i--) {
    const p = state.pulapki[i];
    if (!T.solidAt(t, p.x, p.y + 1)) {
      p.y += 2;
      if (p.y > state.lava) {
        state.pulapki.splice(i, 1);
        state.events.push({ type: 'plusk', x: p.x, y: state.lava });
        continue;
      }
    }
    if (p.typ === 'mina' && p.lont < 0 &&
        state.worms.some((w) => w.alive && Math.abs(w.x - p.x) < 20 && w.y > p.y - 26 && w.y < p.y + 14)) {
      p.lont = MINA_LONT;
      state.events.push({ type: 'mina', x: p.x, y: p.y });
    }
    if (p.lont > 0) { p.lont--; continue; }
    if (p.lont === 0) {
      state.pulapki.splice(i, 1);
      state.events.push({ type: p.typ === 'beczka' ? 'beczka' : 'minaWybuch', x: p.x, y: p.y });
      explode(state, p.x, p.y - 6, p.typ === 'beczka' ? WYBUCH_BECZKI : WYBUCH_MINY);
      if (p.typ === 'beczka') rozlejOgien(state, p.x, p.y - 10, p.id);
    }
  }
}

/* Wybuch beczki rozrzuca krople płonącej ropy. */
function rozlejOgien(state, x, y, id) {
  for (let i = 0; i < OGIEN_KROPLE.length && state.ogien.length < OGIEN_MAX; i++) {
    const los = Math.imul((id | 0) * 31 + i + 1, 0x9e3779b1) >>> 0;
    const [vx, vy] = OGIEN_KROPLE[i];
    state.ogien.push({
      x, y,
      vx: vx + (los % 61) - 30,
      vy: vy + ((los >>> 8) % 61) - 30,
      t: 0,
      zycie: OGIEN_ZYCIE + (los >>> 16) % 90,
      wyp: 0,               // ile dołków już wypaliła
      grunt: 0              // 1 = leży na ziemi
    });
  }
}

/* Krople ognia: lecą (grawitacja, trochę wiatru), przyklejają się do gruntu i palą.
   Robal obok płomienia dostaje OGIEN_DMG raz na takt (nie za każdą kroplę osobno)
   i podskakuje, odrzucony od ognia. */
function stepOgien(state) {
  if (!state.ogien.length) return;
  const t = state.terrain;
  const parzeni = [];
  for (let i = state.ogien.length - 1; i >= 0; i--) {
    const f = state.ogien[i];
    f.t++;
    if (f.t >= f.zycie) { state.ogien.splice(i, 1); continue; }
    if (f.grunt && !T.solidAt(t, f.x, f.y + 1)) f.grunt = 0;   // grunt wypalony albo wysadzony — spada
    if (!f.grunt) {
      f.vx += state.wind * 0.25 * DT;
      f.vy += GRAVITY * DT;
      const dx = f.vx * DT, dy = f.vy * DT;
      const kroki = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy)));
      const ix = dx / kroki, iy = dy / kroki;
      for (let k = 0; k < kroki; k++) {
        const nx = f.x + ix, ny = f.y + iy;
        if (T.solidAt(t, nx, ny)) {
          if (iy > 0 && T.solidAt(t, f.x, ny)) {
            // ląduje tuż nad gruntem i jeszcze chwilę płynie w bok (rozlewa się)
            f.y = Math.floor(ny) - 1;
            f.vx = f.vx * 0.5 + 0;
            f.vy = 0;
            f.grunt = 1;
          } else if (T.solidAt(t, nx, f.y)) {
            f.vx = 0;                                  // ściana z boku — spływa po niej w dół
          } else {
            f.vy = 0;                                  // strop — odbija się w dół
          }
          break;
        }
        f.x = nx;
        f.y = ny;
      }
      if (f.y > state.lava || f.x < -40 || f.x > t.w + 40 || f.y > t.h + 40) {
        state.ogien.splice(i, 1);
        continue;
      }
    } else if (f.vx !== 0) {
      // rozlana ropa płynie po ziemi: pod górkę do 3 px, w dół do 6 px, z krawędzi spada
      const nx = f.x + f.vx * DT;
      const g = T.findGround(t, nx, f.y, 3, 6);
      if (g !== null) {
        f.x = nx;
        f.y = g;
      } else if (T.solidAt(t, nx, f.y)) {
        f.vx = 0;                                      // ściana — staje
      } else {
        f.x = nx;
        f.grunt = 0;
      }
      f.vx = f.vx * 0.985 + 0;
      if (f.vx > -5 && f.vx < 5) f.vx = 0;
    }
    if (f.t % OGIEN_CO === 0) {
      for (const w of state.worms) {
        if (!w.alive || swoj(state, w) || parzeni.some((p) => p[0] === w)) continue;
        if (Math.abs(w.x - f.x) < OGIEN_ZASIEG && f.y > w.y - WORM_H - 4 && f.y < w.y + 6) parzeni.push([w, f]);
      }
      // ogień podpala beczkę, która w nim stoi
      for (const p of state.pulapki) {
        if (p.typ === 'beczka' && p.lont < 0 && Math.abs(p.x - f.x) < 11 && f.y > p.y - 24 && f.y < p.y + 6) p.lont = BECZKA_LONT;
      }
    }
    if (f.grunt && f.wyp < OGIEN_WYPAL_MAX && f.t % OGIEN_WYPAL === 0) {
      f.wyp++;
      T.carve(t, f.x, f.y + 2, OGIEN_WYPAL_R);
      state.events.push({ type: 'wypalenie', x: Math.round(f.x), y: Math.round(f.y + 2), r: OGIEN_WYPAL_R });
    }
  }
  for (const [w, f] of parzeni) {
    damageWorm(state, w, OGIEN_DMG, 'ogien');
    if (!w.alive) continue;
    const kier = w.x < f.x ? -1 : w.x > f.x ? 1 : w.facing;
    w.vx = kier * 55;
    w.vy = Math.min(w.vy, -110);
    w.onGround = false;
  }
}

export function stanOgnia(state) {
  return state.ogien.map((f) => [f.x, f.y, f.vx, f.vy, f.t, f.zycie, f.wyp, f.grunt]);
}

export function ustawOgien(state, lista) {
  state.ogien = !Array.isArray(lista) ? [] : lista
    .filter((f) => Array.isArray(f) && f.length === 8 && f.every((v) => typeof v === 'number'))
    .slice(0, OGIEN_MAX)
    .map((f) => ({ x: f[0] + 0, y: f[1] + 0, vx: f[2] + 0, vy: f[3] + 0, t: f[4] | 0, zycie: f[5] | 0, wyp: f[6] | 0, grunt: f[7] ? 1 : 0 }));
}

export function stanPulapek(state) {
  return state.pulapki.map((p) => ({ id: p.id, typ: p.typ, x: p.x, y: p.y, l: p.lont }));
}

export function ustawPulapki(state, lista) {
  if (!Array.isArray(lista)) return;
  state.pulapki = lista
    .filter((p) => p && (p.typ === 'mina' || p.typ === 'beczka'))
    .map((p) => ({ id: p.id | 0, typ: p.typ, x: p.x | 0, y: p.y | 0, lont: Number.isInteger(p.l) ? p.l : -1 }));
}

export function stanSkrzynek(state) {
  return state.skrzynki.map((c) => ({ id: c.id, typ: c.typ, x: c.x, y: c.y }));
}

export function ustawSkrzynki(state, lista) {
  if (!Array.isArray(lista)) return;
  state.skrzynki = lista
    .filter((c) => c && (c.typ === 'apteczka' || c.typ === 'zapas'))
    .map((c) => ({ id: c.id | 0, typ: c.typ, x: c.x | 0, y: c.y | 0 }));
}

export function plaskieKratery(state) {
  const kratery = [];
  for (const c of state.terrain.craters) {
    kratery.push(c.x, c.y, c.r);
    if (c.r <= T.TUNEL) kratery.push(c.x2, c.y2, T.TUNEL_DALEJ);     // tunel railguna: druga trójka
  }
  return kratery;
}

/* Kanoniczny stan na początku tury: kilka kilobajtów zamiast 2 MB mapy.
   Teren odtwarza się z seeda i listy kraterów (płaska lista x,y,r). */
export function snapshot(state) {
  const over = state.phase === 'over';
  const akt = over ? null : activeWorm(state);
  return {
    seed: state.seed,
    kratery: plaskieKratery(state),
    robale: stanRobali(state),
    turnPtr: state.turnPtr,
    turnNumber: state.turnNumber,
    ostatni: { ...state.ostatni },
    winner: state.winner,
    over,
    lava: state.lava,
    skrzynki: stanSkrzynek(state),
    pulapki: stanPulapek(state),
    aktywny: akt ? wlasciciel(akt) : null     // gracz z turą (protokół); robala wskazuje turnPtr
  };
}

/* Stan po zamknięciu bieżącej tury — BEZ zmieniania stanu źródłowego.
   Publikuje go jeden klient; wszyscy (łącznie z nim) przyjmują dopiero
   wersję, która wróci z logu. */
export function stanPoTurze(state, usun = []) {
  const kopia = {
    seed: state.seed,
    terrain: state.terrain,
    order: state.order,
    worms: state.worms.map((w) => ({ ...w, amunicja: { ...w.amunicja } })),
    turnPtr: state.turnPtr,
    druzynowa: state.druzynowa,
    ust: state.ust,
    ostatni: { ...state.ostatni },
    turnNumber: state.turnNumber,
    winner: state.winner,
    lava: state.lava,
    skrzynki: stanSkrzynek(state),
    pulapki: state.pulapki.map((p) => ({ ...p })),
    ogien: [],
    phase: 'koniec',
    events: [],
    projectiles: [],
    input: pusteWejscie()
  };
  usunGraczy(kopia, usun);
  nextTurn(kopia);
  return snapshot(kopia);
}

function teSameKratery(lista, plaska) {
  if (!Array.isArray(plaska)) return false;
  let i = 0;
  for (const c of lista) {
    if (c.x !== plaska[i] || c.y !== plaska[i + 1] || c.r !== plaska[i + 2]) return false;
    i += 3;
    if (c.r <= T.TUNEL) {
      if (c.x2 !== plaska[i] || c.y2 !== plaska[i + 1] || plaska[i + 2] !== T.TUNEL_DALEJ) return false;
      i += 3;
    }
  }
  return i === plaska.length;
}

/* Teren według listy kraterów — przebudowa tylko, gdy lista się różni.
   Zwraca true, jeśli teren trzeba przemalować. */
export function ustawKratery(state, plaska) {
  if (!Array.isArray(plaska) || teSameKratery(state.terrain.craters, plaska)) return false;
  const lista = [];
  for (let i = 0; i + 2 < plaska.length; i += 3) {
    const c = { x: plaska[i], y: plaska[i + 1], r: plaska[i + 2] };
    if (c.r <= T.TUNEL) {
      if (plaska[i + 5] !== T.TUNEL_DALEJ) break;       // urwany tunel — reszta listy to śmieci
      c.x2 = plaska[i + 3];
      c.y2 = plaska[i + 4];
      i += 3;
    } else if (c.r === T.TUNEL_DALEJ) continue;
    lista.push(c);
  }
  state.terrain = T.rebuild(state.seed, lista, state.terrain.opcje);
  return true;
}

/* Przyjęcie kanonicznego stanu. Teren przebudowuje się tylko wtedy, gdy
   lista kraterów faktycznie się różni — przy zgodnej symulacji nigdy.
   Zwraca true, jeśli teren trzeba przemalować. */
export function zastosujSnapshot(state, snap) {
  const przebudowa = ustawKratery(state, snap.kratery);
  ustawRobale(state, snap.robale);
  state.turnPtr = snap.turnPtr;
  state.turnNumber = snap.turnNumber;
  state.ostatni = snap.ostatni && typeof snap.ostatni === 'object' ? { ...snap.ostatni } : {};
  state.winner = snap.winner ?? null;
  state.lava = typeof snap.lava === 'number' ? snap.lava : state.terrain.lava0;
  state.skrzynki = [];
  ustawSkrzynki(state, snap.skrzynki);
  state.pulapki = [];
  ustawPulapki(state, snap.pulapki);
  state.projectiles = [];
  state.ogien = [];
  state.akcjeDoWyslania.length = 0;
  if (snap.over) {
    state.phase = 'over';
    state.charging = false;
    state.events.push({ type: 'koniec', winner: state.winner });
  } else {
    rozpocznijTure(state);
  }
  return przebudowa;
}

/* Hash całego stanu do testów i diagnostyki: równy hash = stan równy co do bitu. */
export function stateHash(state) {
  const s = snapshot(state);
  s.phase = state.phase;
  s.pociski = state.projectiles.map((p) => [p.weapon, p.x, p.y, p.vx, p.vy, p.fuse]);
  s.ogien = stanOgnia(state);
  return hashTekstu(JSON.stringify(s));
}

/* Zgrubny hash w pikselach — do porównań „czy wygląda tak samo”. */
export function hashPikseli(state) {
  const nums = [state.turnPtr, state.turnNumber, state.terrain.craters.length];
  for (const w of state.worms) nums.push(w.x, w.y, w.hp, w.alive ? 1 : 0);
  for (const c of state.terrain.craters) nums.push(c.x, c.y, c.r);
  return hashNumbers(nums);
}
