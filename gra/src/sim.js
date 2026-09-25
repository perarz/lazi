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

export const DT = 1 / 120;          // stały krok symulacji, render interpoluje

const GRAVITY = 520;
const WALK_SPEED = 82;
const MAX_STEP = 5;                 // ile pikseli robal wejdzie pod górę
export const WORM_H = 20;
const JUMP_VY = -235;
const JUMP_VX = 118;
const AIM_SPEED = 1.5;              // rad/s
const FALL_SAFE_V = 330;            // poniżej tej prędkości upadek nie boli
const AIR_DRAG = 0.06;
const POWIETRZE_PRZYSP = 520;       // px/s² — sterowanie w locie (po skoku można skręcać)
const POWIETRZE_MAX = 110;          // do takiej prędkości w bok da się rozpędzić w powietrzu

export const TURN_TIME = 30;
const SETTLE_MAX = 5;
const MAX_POWER_TIME = 1.4;         // ile trwa naładowanie strzału do pełna

/* Po każdym strzale robal ma 5 s na ruch (ucieczkę). Wciśnięcia z tych
   kroków lecą w zdarzeniu strzału (zwinięte RLE), a strzał wychodzi do
   sieci dopiero po nich — odbiorca odtwarza wszystko krok w krok, bit w bit
   tak samo jak u strzelającego. */
export const ODWROT_S = 5;
const OWCA_SKOK = 6;                // o ile pikseli owca wejdzie pod górę
const ODWROT_KROKI = Math.round(ODWROT_S / DT);
const ODWROT_LEWO = 1, ODWROT_PRAWO = 2, ODWROT_SKOK = 4;

/* Nagła śmierć: po tylu pełnych rundach lawa zaczyna wzbierać,
   żeby partia nie ciągnęła się w nieskończoność. */
export const LAWA_PO_RUNDACH = 6;
const LAWA_ZA_TURE = 12;
const LAWA_MIN = 260;

/* Pięć odłamków kasetówki — stała tabela, żadnej losowości. */
const ODLAMKI = [[-160, -220], [-80, -290], [0, -330], [80, -290], [160, -220]];

/* Zrzuty zaopatrzenia: od drugiej rundy, najwyżej tyle skrzynek naraz. */
const SKRZYNKI_MAX = 3;
const SKRZYNKA_SZANSA = 40;         // % szans na zrzut na początku tury
export const APTECZKA_HP = 35;
const HP_MAX = 150;
const INNE_ZAPASY = WEAPON_ORDER.filter((id) => WEAPONS[id].amunicja !== undefined && id !== 'kij');

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

/* opcje.sieciowa: tura nie przechodzi sama — po osiadaniu symulacja staje
   w fazie 'koniec' i czeka, aż warstwa sieciowa poda kanoniczny stan.
   Wtedy też licznik tury prowadzi warstwa sieciowa (wspólny czas serwera). */
export function createGame(seed, players, opcje = {}) {
  const terrain = T.createTerrain(seed);
  const spawns = T.spawnPoints(terrain, players.length, seed);

  const worms = players.map((p, i) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    x: spawns[i].x,
    y: spawns[i].y,
    vx: 0,
    vy: 0,
    hp: 100,
    facing: spawns[i].x < T.WORLD_W / 2 ? 1 : -1,
    angle: spawns[i].x < T.WORLD_W / 2 ? -0.6 : Math.PI + 0.6,
    alive: true,
    onGround: true,
    amunicja: startowaAmunicja(),
    odszedl: false
  }));

  const state = {
    seed: seed >>> 0,
    terrain,
    worms,
    order: kolejnoscTur(seed, worms.map((w) => w.id)),
    turnPtr: 0,
    turnNumber: 0,
    phase: 'aim',
    turnTimeLeft: TURN_TIME,
    settleTime: 0,
    wind: 0,
    lava: T.LAVA_Y,
    projectiles: [],
    nextProjectileId: 1,
    skrzynki: [],              // zrzuty: { id, typ: 'apteczka' | 'zapas', x, y }
    weapon: 'bazooka',
    power: 0,
    charging: false,
    firedThisTurn: false,
    odwrotKrok: 0,             // ucieczka po dynamicie: krok, plan (odbiorca) albo nagranie (strzelec)
    odwrotPlan: null,
    odwrotNagranie: null,
    odwrotAkcja: null,
    skokWKolejce: false,
    cel: null,                 // punkt nalotu wskazany przez strzelca
    sieciowa: !!opcje.sieciowa,
    akcjeDoWyslania: [],       // strzały oddane lokalnie, do opublikowania
    events: [],
    winner: null,
    tick: 0,
    input: pusteWejscie()
  };

  state.wind = windFor(state.seed, 0);
  return state;
}

function windFor(seed, turnNumber) {
  const rng = mulberry32((seed + turnNumber * 0x85ebca6b) >>> 0);
  return (rng() * 2 - 1) * 130;
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
  if (!w || !w.alive || !w.onGround || state.phase !== 'aim') return;
  skocz(w);
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
    x: Math.max(0, Math.min(T.WORLD_W, Math.round(x))),
    y: Math.max(0, Math.min(T.WORLD_H, Math.round(y)))
  };
}

export function mozeStrzelic(state, weaponId) {
  const w = activeWorm(state);
  if (!w || !w.alive || state.phase !== 'aim' || state.firedThisTurn) return false;
  const weapon = WEAPONS[weaponId];
  if (!weapon || weapon.ukryta) return false;
  const zapas = w.amunicja[weaponId];
  if (zapas !== undefined && zapas <= 0) return false;
  if (weapon.celowany && !state.cel) return false;
  if (weapon.kind === 'most' && powodBrakuMostu(state, w, state.cel)) return false;
  return true;
}

/* Czy w tym miejscu da się postawić most — null znaczy, że tak.
   Sprawdza tylko strzelec (odbiorca stawia most z kanonicznej akcji). */
export function powodBrakuMostu(state, w, cel) {
  if (!cel) return 'brak celu';
  const weapon = WEAPONS.most;
  const dx = cel.x - w.x, dy = cel.y - (w.y - WORM_H * 0.5);
  if (dx * dx + dy * dy > weapon.zasiegBudowy * weapon.zasiegBudowy) return 'za daleko';
  if (cel.y > state.lava - 12 || cel.y < 20) return 'nie tutaj';
  const kolizja = state.worms.some((r) => r.alive &&
    Math.abs(r.x - cel.x) < T.MOST_DL / 2 + 6 && cel.y + T.MOST_GR > r.y - WORM_H - 2 && cel.y < r.y + 1);
  if (kolizja) return 'robal na drodze';
  return null;
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

  const action = przygotujStrzal(state);
  // Strzelec przechodzi przez tę samą ścieżkę co odbiorca — po normalizacji
  // liczb stan u obu jest identyczny co do bitu.
  zastosujStrzal(state, action);
  if (state.phase === 'odwrot') {
    // strzał wyjdzie dopiero po 5 s ruchu, razem z jego nagraniem
    state.odwrotPlan = null;
    state.odwrotNagranie = [];
    state.odwrotAkcja = action;
    return action;
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
    start: obliczStart(w, weapon, w.angle, power),
    cel: weapon.celowany && state.cel ? { x: state.cel.x, y: state.cel.y } : null
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
  if (weapon.kind === 'hitscan') return { x: mx, y: my, vx: c, vy: s };
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
  state.weapon = action.weapon;
  applyFire(state, action);
  return przebudowa;
}

/* Tura oddana bez strzału. */
export function applyPas(state) {
  if (state.phase === 'over' || state.phase === 'koniec') return;
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
  }

  const start = action.start || obliczStart(w, weapon, action.angle, action.power);

  if (weapon.kind === 'hitscan') {
    strzalNatychmiastowy(state, w, start, weapon);
  } else if (weapon.kind === 'kij') {
    ciosKijem(state, w, start, weapon);
  } else if (weapon.kind === 'teleport') {
    teleportuj(state, w, action.cel);
  } else if (weapon.kind === 'most') {
    const cel = action.cel;
    if (cel) {
      const r = T.carve(state.terrain, cel.x, cel.y, -1);
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
    for (let i = 0; i < n; i++) {
      spawnProjectile(state, WEAPONS.rakieta,
        cel.x + (i - (n - 1) / 2) * weapon.rozstaw - kier * 70,
        -40 - i * 22, kier * 55, 110, null);
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
  state.odwrotPlan = rozwinOdwrot(action.odwrot);
  state.odwrotNagranie = null;
  state.odwrotAkcja = null;
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
    if (!inny.alive || inny === w) continue;
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
  const x = Math.round(Math.max(12, Math.min(T.WORLD_W - 12, cel.x)));
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
    if (x < 0 || x >= T.WORLD_W || y >= state.lava || y < -200) break;
    if (T.solidAt(t, x, y)) { wSkale = true; break; }
    trafiony = state.worms.find(
      (o) => o.alive && o.id !== w.id && Math.abs(o.x - x) < 9 && y > o.y - WORM_H && y < o.y
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

  if (state.phase === 'odwrot' && state.odwrotKrok >= ODWROT_KROKI) {
    state.phase = 'flight';
    if (state.odwrotNagranie) {
      state.akcjeDoWyslania.push({ ...state.odwrotAkcja, odwrot: zwinOdwrot(state.odwrotNagranie) });
      state.odwrotNagranie = null;
      state.odwrotAkcja = null;
    }
  }

  if (state.phase === 'flight' && state.projectiles.length === 0) {
    state.phase = 'settle';
    state.settleTime = 0;
  }

  if (state.phase === 'settle') {
    state.settleTime += DT;
    const moving = state.worms.some((w) => w.alive && (!w.onGround || Math.abs(w.vy) > 8));
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

function zwinOdwrot(bity) {
  const rle = [];
  for (const b of bity) {
    const ost = rle[rle.length - 1];
    if (ost && ost[1] === b) ost[0]++;
    else rle.push([1, b]);
  }
  return rle;
}

function rozwinOdwrot(rle) {
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
          (w) => w.alive && w.id !== p.ownerId &&
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

    if (p.y > state.lava || p.x < -80 || p.x > T.WORLD_W + 80) {
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
    (w) => w.alive && w.id !== p.ownerId && Math.abs(w.x - p.x) < 11 && p.y > w.y - WORM_H - 4 && p.y < w.y + 4
  );
  if (trafiony) { detonate(state, p, i); return; }
  if (p.y > state.lava || p.x < -80 || p.x > T.WORLD_W + 80) {
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
    (w) => w.alive && w.id !== p.ownerId && Math.abs(w.x - p.x) < 10 && p.y > w.y - WORM_H - 2 && p.y < w.y + 2
  );
  if (trafiony) { detonate(state, p, i); return; }
  if (p.y > state.lava || p.y < -200 || p.x < -80 || p.x > T.WORLD_W + 80) {
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

  const reach = weapon.radius * 1.7;
  for (const w of state.worms) {
    if (!w.alive) continue;
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
    if (!ids.includes(w.id) || w.odszedl) continue;
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
  if (living.length <= 1) {
    state.phase = 'over';
    state.winner = living[0] ? living[0].id : null;
    state.charging = false;
    state.events.push({ type: 'koniec', winner: state.winner });
    return;
  }

  for (let i = 0; i < state.order.length; i++) {
    state.turnPtr = (state.turnPtr + 1) % state.order.length;
    const w = activeWorm(state);
    if (w && w.alive) break;
  }

  state.turnNumber++;
  if (state.turnNumber >= state.order.length * LAWA_PO_RUNDACH) {
    const nowa = Math.max(LAWA_MIN, state.lava - LAWA_ZA_TURE);
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
  if (Math.floor(rng() * 100) >= SKRZYNKA_SZANSA) return;
  const typ = rng() < 0.6 ? 'apteczka' : 'zapas';
  for (let proba = 0; proba < 12; proba++) {
    const x = Math.round(T.WORLD_W * (0.1 + rng() * 0.8));
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
      const ile = Math.min(APTECZKA_HP, HP_MAX - w.hp);
      w.hp += ile;
      state.events.push({ type: 'skrzynka', typ: c.typ, wormId: w.id, x: c.x, y: c.y, hp: ile });
    } else {
      // kij jest tylko w skrzynkach, więc wypada w co trzeciej
      const los = Math.imul(c.id + 7, 0x9e3779b1) >>> 0;
      const bron = los % 3 === 0 ? 'kij' : INNE_ZAPASY[(los >>> 4) % INNE_ZAPASY.length];
      w.amunicja[bron] = (w.amunicja[bron] || 0) + 1;
      state.events.push({ type: 'skrzynka', typ: c.typ, wormId: w.id, x: c.x, y: c.y, bron });
    }
  }
}

/* Pola, które na starcie każdej tury są zawsze takie same. */
export function rozpocznijTure(state) {
  state.turnTimeLeft = TURN_TIME;
  state.phase = 'aim';
  state.settleTime = 0;
  state.firedThisTurn = false;
  state.charging = false;
  state.power = 0;
  state.cel = null;
  state.odwrotKrok = 0;
  state.odwrotPlan = null;
  state.odwrotNagranie = null;
  state.odwrotAkcja = null;
  state.skokWKolejce = false;
  state.projectiles = [];
  state.wind = windFor(state.seed, state.turnNumber);
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
  }
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
  for (const c of state.terrain.craters) kratery.push(c.x, c.y, c.r);
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
    winner: state.winner,
    over,
    lava: state.lava,
    skrzynki: stanSkrzynek(state),
    aktywny: akt ? akt.id : null
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
    turnNumber: state.turnNumber,
    winner: state.winner,
    lava: state.lava,
    skrzynki: stanSkrzynek(state),
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
  if (!Array.isArray(plaska) || lista.length * 3 !== plaska.length) return false;
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    if (c.x !== plaska[i * 3] || c.y !== plaska[i * 3 + 1] || c.r !== plaska[i * 3 + 2]) return false;
  }
  return true;
}

/* Teren według listy kraterów — przebudowa tylko, gdy lista się różni.
   Zwraca true, jeśli teren trzeba przemalować. */
export function ustawKratery(state, plaska) {
  if (!Array.isArray(plaska) || teSameKratery(state.terrain.craters, plaska)) return false;
  const lista = [];
  for (let i = 0; i + 2 < plaska.length; i += 3) {
    lista.push({ x: plaska[i], y: plaska[i + 1], r: plaska[i + 2] });
  }
  state.terrain = T.rebuild(state.seed, lista);
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
  state.winner = snap.winner ?? null;
  state.lava = typeof snap.lava === 'number' ? snap.lava : T.LAVA_Y;
  state.skrzynki = [];
  ustawSkrzynki(state, snap.skrzynki);
  state.projectiles = [];
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
  return hashTekstu(JSON.stringify(s));
}

/* Zgrubny hash w pikselach — do porównań „czy wygląda tak samo”. */
export function hashPikseli(state) {
  const nums = [state.turnPtr, state.turnNumber, state.terrain.craters.length];
  for (const w of state.worms) nums.push(w.x, w.y, w.hp, w.alive ? 1 : 0);
  for (const c of state.terrain.craters) nums.push(c.x, c.y, c.r);
  return hashNumbers(nums);
}
