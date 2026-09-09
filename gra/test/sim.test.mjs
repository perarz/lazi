/* Testy rdzenia gry. Odpalane w Node, bez przeglądarki:
   node gra/test/sim.test.mjs
   Jednocześnie pilnują, żeby sim.js i terrain.js nie wciągnęły DOM-u. */

import * as T from '../src/terrain.js';
import * as S from '../src/sim.js';
import { WEAPONS } from '../src/weapons.js';

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \x1b[32mOK\x1b[0m  ' + name);
  } catch (e) {
    failed++;
    console.log('  \x1b[31mBLAD\x1b[0m ' + name + '\n       ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'oczekiwano prawdy');
}

function near(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error((msg || '') + ' — ' + a + ' vs ' + b + ' (tol ' + tol + ')');
}

const players = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Gracz' + i, color: '#f60' }));

function run(state, seconds) {
  const steps = Math.round(seconds / S.DT);
  for (let i = 0; i < steps; i++) S.step(state);
}

console.log('\nTEREN');

test('krater zeruje maske w promieniu', () => {
  const t = T.createTerrain(7);
  T.carve(t, 900, 600, 40);
  assert(!T.solidAt(t, 900, 600), 'srodek powinien byc pusty');
  assert(!T.solidAt(t, 900 + 30, 600), 'wnetrze promienia puste');
});

test('krater nie rusza pikseli poza promieniem', () => {
  const t = T.createTerrain(7);
  const far = T.solidAt(t, 900 + 80, 600);
  T.carve(t, 900, 600, 40);
  assert(T.solidAt(t, 900 + 80, 600) === far, 'piksel poza promieniem zmieniony');
});

test('ten sam seed daje identyczna mape', () => {
  assert(T.countSolid(T.createTerrain(99)) === T.countSolid(T.createTerrain(99)));
});

test('mapa odtwarza sie z seeda i listy kraterow', () => {
  const a = T.createTerrain(55);
  T.carve(a, 800, 500, 60);
  T.carve(a, 1200, 620, 45);
  const b = T.rebuild(55, a.craters);
  assert(T.countSolid(a) === T.countSolid(b), 'rebuild dal inna mape');
});

test('spawny leza na gruncie i nad lawa', () => {
  const t = T.createTerrain(3);
  for (const p of T.spawnPoints(t, 4, 3)) {
    assert(p.y < T.LAVA_Y, 'spawn pod lawa: ' + JSON.stringify(p));
    assert(T.solidAt(t, p.x, p.y + 1), 'spawn nie ma gruntu pod soba');
  }
});

console.log('\nFIZYKA');

test('robal spada i laduje na powierzchni', () => {
  const st = S.createGame(11, players(2));
  const w = st.worms[0];
  w.y -= 160;
  w.onGround = false;
  run(st, 3);
  assert(w.onGround, 'nie wyladowal');
  assert(T.solidAt(st.terrain, w.x, w.y + 1), 'stoi w powietrzu');
  assert(!T.solidAt(st.terrain, w.x, w.y), 'utknal w skale');
});

test('upadek z duzej wysokosci boli, z malej nie', () => {
  const mk = (drop) => {
    const st = S.createGame(11, players(2));
    const w = st.worms[0];
    w.y -= drop;
    w.onGround = false;
    run(st, 5);
    return w.hp;
  };
  assert(mk(40) === 100, 'krotki upadek nie powinien bolec, hp=' + mk(40));
  assert(mk(600) < 100, 'dlugi upadek powinien zabrac hp');
});

test('robal wchodzi na lagodne zbocze', () => {
  const st = S.createGame(11, players(2));
  const w = S.activeWorm(st);
  const x0 = w.x;
  st.input.right = true;
  run(st, 1.5);
  assert(Math.abs(w.x - x0) > 40, 'nie przeszedl dystansu, dx=' + (w.x - x0));
  assert(w.alive, 'zginal podczas chodzenia');
});

test('lawa zabija', () => {
  const st = S.createGame(11, players(2));
  const w = st.worms[0];
  w.y = T.LAVA_Y + 5;
  run(st, 0.1);
  assert(!w.alive, 'przezyl lawe');
});

console.log('\nOBRAZENIA');

test('obrazenia maleja z odlegloscia', () => {
  const st = S.createGame(11, players(3));
  const w = st.worms[0];
  const blisko = (() => {
    const s2 = S.createGame(11, players(3));
    S.explode(s2, s2.worms[0].x, s2.worms[0].y - 10, WEAPONS.bazooka);
    return 100 - s2.worms[0].hp;
  })();
  const daleko = (() => {
    const s2 = S.createGame(11, players(3));
    S.explode(s2, s2.worms[0].x + 70, s2.worms[0].y - 10, WEAPONS.bazooka);
    return 100 - s2.worms[0].hp;
  })();
  assert(blisko > daleko, 'blisko=' + blisko + ' daleko=' + daleko);
  assert(daleko >= 0, 'ujemne obrazenia');
  void w;
});

test('wybuch poza zasiegiem nie rusza hp', () => {
  const st = S.createGame(11, players(2));
  const hp = st.worms[0].hp;
  S.explode(st, st.worms[0].x + 400, st.worms[0].y, WEAPONS.bazooka);
  assert(st.worms[0].hp === hp, 'oberwal z drugiego konca mapy');
});

test('wybuch robi krater w terenie', () => {
  const st = S.createGame(11, players(2));
  const przed = T.countSolid(st.terrain);
  S.explode(st, 1024, 700, WEAPONS.bazooka);
  assert(T.countSolid(st.terrain) < przed, 'teren sie nie zmienil');
});

console.log('\nTURY');

test('strzal przelacza faze i konczy ture', () => {
  const st = S.createGame(11, players(2));
  const kto = S.activeWorm(st).id;
  st.weapon = 'bazooka';
  S.applyFire(st, { wormId: kto, weapon: 'bazooka', angle: -0.7, power: 0.9 });
  assert(st.phase === 'flight', 'faza to ' + st.phase);
  run(st, 12);
  assert(st.phase !== 'flight', 'pocisk nigdy nie wybuchl');
  if (st.phase !== 'over') assert(S.activeWorm(st).id !== kto, 'tura sie nie zmienila');
});

test('tura przepada po uplywie czasu', () => {
  const st = S.createGame(11, players(2));
  const kto = S.activeWorm(st).id;
  run(st, S.TURN_TIME + 1.5);
  if (st.phase !== 'over') assert(S.activeWorm(st).id !== kto, 'AFK zablokowal gre');
});

test('ostatni zywy wygrywa', () => {
  const st = S.createGame(11, players(2));
  st.worms[1].alive = false;
  run(st, S.TURN_TIME + 7);
  assert(st.phase === 'over', 'faza to ' + st.phase);
  assert(st.winner === st.worms[0].id, 'zly zwyciezca');
});

console.log('\nDETERMINIZM I SYNCHRONIZACJA');

test('ten sam seed + te same akcje = ten sam hash', () => {
  const scenariusz = (st) => {
    st.input.right = true;
    run(st, 0.8);
    st.input.right = false;
    S.applyFire(st, { wormId: S.activeWorm(st).id, weapon: 'bazooka', angle: -0.6, power: 0.85 });
    run(st, 10);
  };
  const a = S.createGame(2024, players(3));
  const b = S.createGame(2024, players(3));
  scenariusz(a);
  scenariusz(b);
  assert(S.stateHash(a) === S.stateHash(b), a.stateHash + ' != ' + S.stateHash(b));
});

test('rozne seedy daja rozny hash', () => {
  assert(S.stateHash(S.createGame(1, players(2))) !== S.stateHash(S.createGame(2, players(2))));
});

test('snapshot przechodzi w obie strony', () => {
  const a = S.createGame(77, players(3));
  S.applyFire(a, { wormId: S.activeWorm(a).id, weapon: 'granat', angle: -0.8, power: 0.7 });
  run(a, 9);

  const b = S.createGame(77, players(3));
  S.applySnapshot(b, S.snapshot(a));
  assert(S.stateHash(a) === S.stateHash(b), 'stan po snapshocie sie rozjechal');
});

test('snapshot jest maly', () => {
  const a = S.createGame(77, players(4));
  for (let i = 0; i < 12; i++) S.explode(a, 300 + i * 120, 600, WEAPONS.bazooka);
  const bajty = JSON.stringify(S.snapshot(a)).length;
  assert(bajty < 2000, 'snapshot ma ' + bajty + ' bajtow');
  console.log('       (snapshot po 12 wybuchach: ' + bajty + ' B)');
});

console.log('\n' + (failed === 0
  ? '\x1b[32mWszystkie testy przeszly (' + passed + ')\x1b[0m'
  : '\x1b[31m' + failed + ' bledow, ' + passed + ' ok\x1b[0m') + '\n');

process.exit(failed === 0 ? 0 : 1);
