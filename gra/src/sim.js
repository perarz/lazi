/* Symulacja gry: fizyka robali, pociski, tury.

   Ten plik NIE dotyka DOM-u ani Math.random(). Dzięki temu odpala się
   w Node (test/sim.test.mjs) i można sprawdzić, że ten sam seed z tymi
   samymi akcjami daje ten sam stan — czego potrzebuje warstwa sieciowa. */

import { mulberry32, hashNumbers } from './rng.js';
import * as T from './terrain.js';
import { WEAPONS } from './weapons.js';

export const DT = 1 / 120;          // stały krok symulacji, render interpoluje

const GRAVITY = 520;
const WALK_SPEED = 82;
const MAX_STEP = 5;                 // ile pikseli robal wejdzie pod górę
const WORM_H = 20;
const JUMP_VY = -235;
const JUMP_VX = 118;
const AIM_SPEED = 1.5;              // rad/s
const FALL_SAFE_V = 330;            // poniżej tej prędkości upadek nie boli
const AIR_DRAG = 0.06;

export const TURN_TIME = 30;
const SETTLE_MAX = 5;
const MAX_POWER_TIME = 1.4;         // ile trwa naładowanie strzału do pełna

export function createGame(seed, players) {
  const terrain = T.createTerrain(seed);
  const spawns = T.spawnPoints(terrain, players.length, seed);
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);

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
    onGround: true
  }));

  // Kolejność tur tasowana z seeda — identyczna u każdego klienta.
  const order = worms.map((w) => w.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const state = {
    seed: seed >>> 0,
    terrain,
    worms,
    order,
    turnPtr: 0,
    turnNumber: 0,
    phase: 'aim',
    turnTimeLeft: TURN_TIME,
    settleTime: 0,
    wind: 0,
    projectiles: [],
    nextProjectileId: 1,
    weapon: 'bazooka',
    power: 0,
    charging: false,
    firedThisTurn: false,
    zdalna: false,          // true = turę prowadzi ktoś inny, czekamy na sieć
    events: [],
    winner: null,
    tick: 0,
    input: { left: false, right: false, aimUp: false, aimDown: false }
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
  if (!w || !w.alive || !w.onGround || state.phase !== 'aim') return;
  w.vy = JUMP_VY;
  w.vx = JUMP_VX * w.facing;
  w.onGround = false;
}

export function startCharging(state) {
  if (state.phase !== 'aim' || state.firedThisTurn) return;
  state.charging = true;
  state.power = 0;
}

/* Zwraca opis strzału — to jest dokładnie ten obiekt, który poleci
   do innych graczy przez sieć. */
export function releaseFire(state) {
  if (!state.charging) return null;
  state.charging = false;
  const w = activeWorm(state);
  if (!w || !w.alive) return null;
  const action = {
    wormId: w.id,
    weapon: state.weapon,
    angle: w.angle,
    power: state.weapon === 'dynamit' ? 0 : Math.max(0.08, state.power)
  };
  applyFire(state, action);
  return action;
}

/* Tura oddana bez strzału — u pozostałych graczy wywoływane po
   otrzymaniu zdarzenia 'pas' od gracza, który ją prowadził. */
export function applyPas(state) {
  if (state.phase === 'over') return;
  state.phase = 'settle';
  state.settleTime = SETTLE_MAX;
}

export function applyFire(state, action) {
  const w = state.worms.find((x) => x.id === action.wormId);
  if (!w || !w.alive) return;
  const weapon = WEAPONS[action.weapon];
  if (!weapon) return;

  if (weapon.kind === 'podkladany') {
    spawnProjectile(state, weapon, w.x, w.y - WORM_H * 0.5, 0, 0, w.id);
  } else {
    const speed = weapon.speed * action.power;
    const mx = w.x + Math.cos(action.angle) * 18;
    const my = w.y - WORM_H * 0.55 + Math.sin(action.angle) * 18;
    spawnProjectile(state, weapon, mx, my,
      Math.cos(action.angle) * speed, Math.sin(action.angle) * speed, w.id);
  }

  state.firedThisTurn = true;
  state.power = 0;
  state.phase = 'flight';
  state.events.push({ type: 'strzal', weapon: weapon.id, x: w.x, y: w.y - WORM_H * 0.5 });
}

function spawnProjectile(state, weapon, x, y, vx, vy, ownerId) {
  state.projectiles.push({
    id: state.nextProjectileId++,
    weapon: weapon.id,
    x, y, vx, vy,
    fuse: weapon.fuse,
    ownerId
  });
}

/* ---------- krok symulacji ---------- */

export function step(state) {
  if (state.phase === 'over') return;
  state.tick++;

  const act = activeWorm(state);

  // Zabezpieczenie: jeśli aktywny robal nie żyje (zginął w cudzej turze albo
  // na starcie), tura musi ruszyć dalej — inaczej gra stoi w miejscu.
  if (state.phase === 'aim' && (!act || !act.alive)) {
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
    if (!state.zdalna) {
      state.turnTimeLeft -= DT;
      if (state.turnTimeLeft <= 0) {
        state.turnTimeLeft = 0;
        state.phase = 'settle';
        // Gdy nic nie leci, nie ma na co czekac: faza osiadania odliczalaby
        // do SETTLE_MAX i tura przechodzila z kilkusekundowym opoznieniem.
        state.settleTime = state.projectiles.length ? 0 : SETTLE_MAX;
      }
    }
  }

  for (const w of state.worms) stepWorm(state, w, w === act && state.phase === 'aim');
  stepProjectiles(state);

  if (state.phase === 'flight' && state.projectiles.length === 0) {
    state.phase = 'settle';
    state.settleTime = 0;
  }

  if (state.phase === 'settle') {
    state.settleTime += DT;
    const moving = state.worms.some((w) => w.alive && (!w.onGround || Math.abs(w.vy) > 8));
    if (!moving || state.settleTime > SETTLE_MAX) nextTurn(state);
  }
}

function aim(w, delta) {
  // Kąt trzymamy w układzie ekranu: 0 = w prawo, ujemny = w górę.
  w.angle += delta * (w.facing >= 0 ? 1 : -1);
  const lo = w.facing >= 0 ? -Math.PI / 2 : Math.PI / 2;
  const hi = w.facing >= 0 ? Math.PI / 2 : (3 * Math.PI) / 2;
  if (w.angle < lo) w.angle = lo;
  if (w.angle > hi) w.angle = hi;
}

function headBlocked(t, x, groundY) {
  return T.solidAt(t, x, groundY - WORM_H) || T.solidAt(t, x, groundY - WORM_H + 6);
}

function stepWorm(state, w, controllable) {
  if (!w.alive) return;
  const t = state.terrain;

  if (controllable && w.onGround) {
    let dir = 0;
    if (state.input.left) dir = -1;
    else if (state.input.right) dir = 1;
    if (dir !== 0) {
      w.facing = dir;
      // Kąt lustrzany, żeby po obrocie celownik został po tej samej stronie.
      const nx = w.x + dir * WALK_SPEED * DT;
      const g = T.findGround(t, nx, w.y, MAX_STEP, MAX_STEP);
      if (g !== null && !headBlocked(t, nx, g)) {
        w.x = nx;
        w.y = g;
      } else if (g === null) {
        w.x = nx;
        w.onGround = false;
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

  if (w.y > T.LAVA_Y) killWorm(state, w, 'lawa');
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
    if (ix !== 0 && T.solidAt(t, nx, ny - WORM_H * 0.5)) {
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

    p.vx += state.wind * weapon.windFactor * DT;
    p.vy += GRAVITY * weapon.gravityFactor * DT;

    const dx = p.vx * DT, dy = p.vy * DT;
    const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy)));
    const ix = dx / steps, iy = dy / steps;
    let done = false;

    for (let s = 0; s < steps && !done; s++) {
      const nx = p.x + ix, ny = p.y + iy;

      if (T.solidAt(t, nx, ny)) {
        if (weapon.kind === 'pocisk') {
          detonate(state, p, i);
          done = true;
        } else {
          bounce(state, p, weapon);
          done = true;
        }
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

    if (p.y > T.LAVA_Y || p.x < -80 || p.x > T.WORLD_W + 80) {
      state.projectiles.splice(i, 1);
      state.events.push({ type: 'plusk', x: p.x, y: Math.min(p.y, T.LAVA_Y) });
    }
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
  explode(state, p.x, p.y, WEAPONS[p.weapon]);
}

export function explode(state, x, y, weapon) {
  T.carve(state.terrain, x, y, weapon.radius);
  state.events.push({ type: 'wybuch', x, y, r: weapon.radius });

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

function nextTurn(state) {
  const living = state.worms.filter((w) => w.alive);
  if (living.length <= 1) {
    state.phase = 'over';
    state.winner = living[0] ? living[0].id : null;
    state.events.push({ type: 'koniec', winner: state.winner });
    return;
  }

  for (let i = 0; i < state.order.length; i++) {
    state.turnPtr = (state.turnPtr + 1) % state.order.length;
    const w = activeWorm(state);
    if (w && w.alive) break;
  }

  state.turnNumber++;
  state.turnTimeLeft = TURN_TIME;
  state.phase = 'aim';
  state.firedThisTurn = false;
  state.charging = false;
  state.power = 0;
  state.wind = windFor(state.seed, state.turnNumber);
  state.input = { left: false, right: false, aimUp: false, aimDown: false };
  state.events.push({ type: 'tura', wormId: state.order[state.turnPtr], wind: state.wind });
}

/* ---------- synchronizacja ---------- */

/* Kanoniczny stan pokoju: kilkaset bajtów zamiast 2 MB mapy.
   Teren odtwarza się z seeda i listy kraterów. */
export function snapshot(state) {
  return {
    seed: state.seed,
    craters: state.terrain.craters.map((c) => ({
      x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.r)
    })),
    worms: state.worms.map((w) => ({
      id: w.id, x: Math.round(w.x), y: Math.round(w.y),
      hp: w.hp, alive: w.alive, facing: w.facing
    })),
    turnPtr: state.turnPtr,
    turnNumber: state.turnNumber,
    winner: state.winner
  };
}

export function applySnapshot(state, snap) {
  state.terrain = T.rebuild(snap.seed, snap.craters);
  for (const s of snap.worms) {
    const w = state.worms.find((x) => x.id === s.id);
    if (!w) continue;
    w.x = s.x; w.y = s.y; w.hp = s.hp; w.alive = s.alive; w.facing = s.facing;
    w.vx = 0; w.vy = 0; w.onGround = true;
  }
  state.turnPtr = snap.turnPtr;
  state.turnNumber = snap.turnNumber;
  state.winner = snap.winner;
  state.projectiles = [];
}

/* Hash do wykrycia rozjazdu między klientami. */
export function stateHash(state) {
  const nums = [state.turnPtr, state.turnNumber, state.terrain.craters.length];
  for (const w of state.worms) nums.push(w.x, w.y, w.hp, w.alive ? 1 : 0);
  for (const c of state.terrain.craters) nums.push(c.x, c.y, c.r);
  return hashNumbers(nums);
}
