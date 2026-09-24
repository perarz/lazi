/* Testy rdzenia gry. Odpalane w Node, bez przeglądarki:
   node gra/test/sim.test.mjs
   Jednocześnie pilnują, żeby sim.js i terrain.js nie wciągnęły DOM-u. */

import { readFileSync } from 'fs';
import * as T from '../src/terrain.js';
import * as S from '../src/sim.js';
import { WEAPONS, WEAPON_ORDER } from '../src/weapons.js';
import { nowaPartiaOs, zdarzenieOs, koniecTuryOs, koniecPartiiOs } from '../src/osiagniecia-reguly.js';

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

const players = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Gracz' + i, color: '#f60' }));

function run(state, seconds) {
  const steps = Math.round(seconds / S.DT);
  for (let i = 0; i < steps; i++) S.step(state);
}

/* Do końca tury w trybie sieciowym (faza 'koniec'). */
function doKonca(state, maxSek = 40) {
  for (let i = 0; i < maxSek / S.DT && state.phase !== 'koniec' && state.phase !== 'over'; i++) S.step(state);
  return state.phase;
}

/* Symulacja wysyłki przez sieć: JSON w obie strony, jak w prawdziwym logu. */
const przezSiec = (x) => JSON.parse(JSON.stringify(x));

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

console.log('\nFIZYKA I STEROWANIE');

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

test('po dynamicie robal moze uciec, a potem traci sterowanie', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  const w = S.activeWorm(st);
  st.weapon = 'dynamit';
  assert(S.startCharging(st), 'nie da sie podlozyc');
  S.releaseFire(st);
  assert(st.phase === 'odwrot', 'brak fazy ucieczki: ' + st.phase);
  const x0 = w.x;
  st.input.left = true; st.input.right = false;
  run(st, 1);
  assert(w.x !== x0 || !w.alive, 'robal nie ruszyl sie w czasie ucieczki');
  run(st, S.ODWROT_S - 0.9);
  assert(st.phase !== 'odwrot', 'ucieczka trwa za dlugo');
  const x1 = w.x;
  run(st, 0.3);
  assert(Math.abs(w.x - x1) < 1 || !w.onGround, 'po ucieczce dalej mozna chodzic');
});

test('robal nie przenika przez stroma sciane', () => {
  const st = S.createGame(11, players(2));
  const w = S.activeWorm(st);
  // pionowa ściana tuż przed robalem
  const sx = Math.round(w.x) + 8;
  for (let y = Math.round(w.y) - 60; y < Math.round(w.y) + 20; y++) {
    for (let x = sx; x < sx + 30; x++) st.terrain.mask[y * T.WORLD_W + x] = 1;
  }
  w.facing = 1;
  st.input.right = true;
  run(st, 2);
  assert(w.x < sx, 'robal wszedl w sciane: x=' + w.x + ', sciana od ' + sx);
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

test('po zawroceniu celownik odbija sie lustrzanie', () => {
  const st = S.createGame(11, players(2));
  const w = S.activeWorm(st);
  w.facing = 1;
  w.angle = -0.6;                     // w gore i w prawo
  st.input.left = true;
  S.step(st);
  assert(w.facing === -1, 'nie zawrocil');
  assert(Math.abs(w.angle - (Math.PI + 0.6)) < 1e-9, 'kat po obrocie: ' + w.angle);
  assert(Math.sin(w.angle) < 0, 'celownik przestal mierzyc w gore');
});

test('celowanie myszka ustawia kat i kierunek', () => {
  const st = S.createGame(11, players(2));
  const w = S.activeWorm(st);
  S.ustawCelownik(st, Math.atan2(-1, -1));   // w lewo i w gore
  assert(w.facing === -1, 'powinien patrzec w lewo');
  assert(w.angle > Math.PI && w.angle < 1.5 * Math.PI, 'kat poza zakresem: ' + w.angle);
  S.ustawCelownik(st, Math.atan2(-1, 1));    // w prawo i w gore
  assert(w.facing === 1 && w.angle < 0 && w.angle > -Math.PI / 2, 'zly kat w prawo: ' + w.angle);
});

test('lawa zabija', () => {
  const st = S.createGame(11, players(2));
  const w = st.worms[0];
  w.y = T.LAVA_Y + 5;
  run(st, 0.1);
  assert(!w.alive, 'przezyl lawe');
});

console.log('\nOBRAZENIA I BRONIE');

test('obrazenia maleja z odlegloscia', () => {
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

test('strzelba trafia robala po prostej', () => {
  const st = S.createGame(21, players(2));
  const a = S.activeWorm(st);
  const b = st.worms.find((w) => w !== a);
  // Stawiamy cel tuż obok na tej samej wysokości, nad ziemią.
  b.x = a.x + 60 * a.facing;
  b.y = a.y;
  // Na nierównej mapie między nimi może stać skała — czyścimy linię strzału.
  for (let y = Math.round(a.y) - 30; y < Math.round(a.y) - 2; y++) {
    for (let x = Math.round(Math.min(a.x, b.x)) - 10; x <= Math.round(Math.max(a.x, b.x)) + 10; x++) {
      st.terrain.mask[y * T.WORLD_W + x] = 0;
    }
  }
  st.weapon = 'strzelba';
  S.ustawCelownik(st, a.facing > 0 ? 0 : Math.PI);
  assert(S.startCharging(st), 'nie da sie strzelic ze strzelby');
  S.releaseFire(st);
  assert(b.hp < 100, 'strzelba nie trafila, hp=' + b.hp);
});

test('kasetowka rozsypuje odlamki', () => {
  const st = S.createGame(21, players(2));
  st.weapon = 'kasetowa';
  S.ustawCelownik(st, -Math.PI / 2 + 0.2 * S.activeWorm(st).facing);
  S.startCharging(st);
  st.power = 0.5;
  S.releaseFire(st);
  let maks = 0;
  for (let i = 0; i < 12 / S.DT && (st.phase === 'flight' || st.phase === 'odwrot'); i++) {
    S.step(st);
    maks = Math.max(maks, st.projectiles.length);
  }
  assert(maks >= 5, 'po wybuchu bylo tylko ' + maks + ' pociskow');
});

test('nalot wymaga celu i zrzuca rakiety', () => {
  const st = S.createGame(21, players(2));
  st.weapon = 'nalot';
  assert(!S.startCharging(st), 'nalot bez celu nie powinien ruszyc');
  const cel = st.worms.find((w) => w !== S.activeWorm(st));
  S.ustawCel(st, cel.x, cel.y);
  assert(S.startCharging(st), 'nalot z celem nie ruszyl');
  S.releaseFire(st);
  assert(st.projectiles.length === WEAPONS.nalot.rakiety, 'rakiet: ' + st.projectiles.length);
  run(st, 10);
  assert(cel.hp < 100, 'nalot nie zranil celu');
});

/* Płaska półka wokół robala: czyste pole testowe na nierównej mapie. */
function polka(st, w, szer = 160) {
  const y0 = Math.round(w.y);
  for (let x = Math.round(w.x) - szer; x <= Math.round(w.x) + szer; x++) {
    for (let y = y0 - 80; y < y0 + 30; y++) st.terrain.mask[y * T.WORLD_W + x] = y >= y0 + 1 ? 1 : 0;
  }
}

test('owca biegnie do wroga i wybucha', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  const a = S.activeWorm(st);
  const b = st.worms.find((w) => w !== a);
  polka(st, a);
  a.y = Math.round(a.y); a.onGround = true; a.facing = 1;
  b.x = a.x + 70; b.y = a.y; b.onGround = true;
  st.weapon = 'owca';
  assert(S.startCharging(st), 'nie da sie wypuscic owcy');
  S.releaseFire(st);
  let wybuch = false;
  for (let i = 0; i < 6 / S.DT; i++) {
    S.step(st);
    if (st.events.some((e) => e.type === 'wybuch')) wybuch = true;
    st.events.length = 0;
  }
  assert(wybuch, 'owca nie wybuchla');
  assert(b.hp < 100, 'owca nie zranila wroga, hp=' + b.hp);
});

test('kij wybija wroga z ogromnym odrzutem', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  const a = S.activeWorm(st);
  const b = st.worms.find((w) => w !== a);
  polka(st, a);
  a.y = Math.round(a.y); a.onGround = true;
  b.x = a.x + 16; b.y = a.y; b.onGround = true;
  st.weapon = 'kij';
  S.ustawCelownik(st, -0.4);
  assert(S.startCharging(st), 'kij nie dziala');
  S.releaseFire(st);
  assert(b.hp === 100 - WEAPONS.kij.damage, 'kij: hp=' + b.hp);
  assert(b.vx > 300 && !b.onGround, 'brak odrzutu: vx=' + b.vx);
});

test('teleport przenosi robala we wskazane miejsce', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  const a = S.activeWorm(st);
  st.weapon = 'teleport';
  assert(!S.startCharging(st), 'teleport bez celu nie powinien ruszyc');
  const cx = Math.round(T.WORLD_W / 2), cy = 120;       // wysoko nad mapą — na pewno wolne
  S.ustawCel(st, cx, cy);
  assert(S.startCharging(st), 'teleport z celem nie dziala');
  S.releaseFire(st);
  assert(Math.abs(a.x - cx) < 1 && Math.abs(a.y - cy) < 1, 'robal jest w ' + a.x + ',' + a.y);
});

test('blitzkrieg wystrzeliwuje trzy rakiety', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  st.weapon = 'salwa';
  S.ustawCelownik(st, -Math.PI / 2 + 0.3 * S.activeWorm(st).facing);
  S.startCharging(st);
  st.power = 0.7;
  S.releaseFire(st);
  assert(st.projectiles.length === 3 && st.projectiles.every((p) => p.weapon === 'rakietka'), 'pociski: ' + st.projectiles.map((p) => p.weapon));
});

test('amunicja sie konczy', () => {
  const st = S.createGame(21, players(2));
  const w = S.activeWorm(st);
  w.amunicja.dynamit = 1;
  st.weapon = 'dynamit';
  assert(S.startCharging(st), 'pierwszy dynamit nie ruszyl');
  S.releaseFire(st);
  assert(w.amunicja.dynamit === 0, 'nie zmniejszylo zapasu');
  st.phase = 'aim';
  st.firedThisTurn = false;
  assert(!S.startCharging(st), 'dynamit bez zapasu dalej dziala');
  assert(!S.mozeStrzelic(st, 'dynamit'), 'mozeStrzelic przepuszcza pusty zapas');
});

test('pelne naladowanie strzela i trafia do kolejki wysylki', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  S.startCharging(st);
  run(st, 2);
  assert(st.firedThisTurn, 'pelna moc nie wystrzelila');
  run(st, S.ODWROT_S + 0.1);            // strzał wychodzi po 5 s ruchu
  assert(st.akcjeDoWyslania.length === 1, 'strzal nie trafil do kolejki wysylki — reszta by go nie zobaczyla');
});

console.log('\nTURY');

test('strzal przelacza faze i konczy ture', () => {
  const st = S.createGame(11, players(2));
  const kto = S.activeWorm(st).id;
  S.applyFire(st, { wormId: kto, weapon: 'bazooka', angle: -0.7, power: 0.9 });
  assert(st.phase === 'odwrot', 'faza to ' + st.phase);
  run(st, 16);
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

test('w trybie sieciowym tura czeka na stan kanoniczny', () => {
  const st = S.createGame(11, players(2), { sieciowa: true });
  S.applyPas(st);
  run(st, 1);
  assert(st.phase === 'koniec', 'faza to ' + st.phase);
  const nr = st.turnNumber;
  run(st, 5);
  assert(st.phase === 'koniec' && st.turnNumber === nr, 'tura przeszla bez stanu kanonicznego');
});

test('lawa wzbiera po kilku rundach', () => {
  const st = S.createGame(11, players(2), { sieciowa: true });
  const start = st.lava;
  let snap;
  for (let i = 0; i < 2 * S.LAWA_PO_RUNDACH + 2; i++) {
    S.applyPas(st);
    doKonca(st);
    snap = S.stanPoTurze(st);
    S.zastosujSnapshot(st, przezSiec(snap));
  }
  assert(st.lava < start, 'lawa nie wzbiera: ' + st.lava);
});

test('odejscie gracza konczy gre, gdy zostaje jeden', () => {
  const st = S.createGame(11, players(2), { sieciowa: true });
  S.applyPas(st);
  doKonca(st);
  const snap = S.stanPoTurze(st, ['p1']);
  assert(snap.over, 'gra nie skonczyla sie po wyjsciu przeciwnika');
  assert(snap.winner === 'p0', 'zly zwyciezca: ' + snap.winner);
  const odszedl = snap.robale.find((r) => r.id === 'p1');
  assert(odszedl.odszedl && !odszedl.alive, 'robal odchodzacego zostal na planszy');
});

test('odchodzacy jest pomijany w kolejce', () => {
  const st = S.createGame(11, players(3), { sieciowa: true });
  const kolejny = st.order[1];
  S.applyPas(st);
  doKonca(st);
  const snap = S.stanPoTurze(st, [kolejny]);
  assert(!snap.over, 'gra skonczyla sie za wczesnie');
  assert(snap.aktywny !== kolejny, 'ture dostal gracz, ktory wyszedl');
});

test('stanPoTurze nie zmienia stanu zrodlowego', () => {
  const st = S.createGame(11, players(3), { sieciowa: true });
  S.applyPas(st);
  doKonca(st);
  const przed = S.stateHash(st);
  S.stanPoTurze(st, ['p1']);
  assert(S.stateHash(st) === przed, 'stanPoTurze zmienil stan');
});

console.log('\nDETERMINIZM I SYNCHRONIZACJA');

/* Strzelec gra naprawdę (chodzi, skacze, strzela w locie), odbiorca dostaje
   tylko zdarzenie przez JSON. Po całym locie stany muszą być identyczne
   co do bitu — dla każdej broni. */
for (const bron of WEAPON_ORDER) {
  test('odbiorca odtwarza strzal co do bitu: ' + bron, () => {
    for (const seed of [5, 77, 1234]) {
      const a = S.createGame(seed, players(3), { sieciowa: true });
      const b = S.createGame(seed, players(3), { sieciowa: true });
      const kto = S.activeWorm(a);

      a.input.right = kto.facing < 0;
      a.input.left = kto.facing > 0;
      run(a, 0.4);
      a.input.left = a.input.right = false;
      S.jump(a);
      run(a, 0.15);                         // strzał w trakcie skoku
      a.weapon = bron;
      const cel = a.worms.find((w) => w.id !== kto.id);
      if (WEAPONS[bron].celowany) S.ustawCel(a, cel.x, cel.y);
      S.ustawCelownik(a, Math.atan2(-0.8, cel.x > kto.x ? 1 : -1));
      assert(S.startCharging(a), 'nie da sie strzelic: ' + bron);
      run(a, 0.5);
      S.releaseFire(a);
      // 5 s ruchu po strzale: bieg, skok, bieg z powrotem — nagranie leci w zdarzeniu
      assert(a.phase === 'odwrot' && a.akcjeDoWyslania.length === 0, 'strzal bez fazy ruchu: ' + bron);
      a.input.left = true; run(a, 1.2);
      a.input.left = false; S.jump(a); run(a, 0.6);
      a.input.right = true; run(a, 0.8);
      a.input.right = false;
      for (let i = 0; i < 2000 && a.akcjeDoWyslania.length === 0; i++) S.step(a);
      assert(a.akcjeDoWyslania.length === 1, 'brak akcji do wyslania');

      S.zastosujStrzal(b, przezSiec(a.akcjeDoWyslania[0]));
      doKonca(a);
      doKonca(b);
      assert(S.stateHash(a) === S.stateHash(b), 'rozjazd po locie (' + bron + ', seed ' + seed + ')');
    }
  });
}

test('snapshot przechodzi w obie strony i odtwarza teren', () => {
  const a = S.createGame(77, players(3), { sieciowa: true });
  S.startCharging(a);
  a.weapon = 'granat';
  a.power = 0.7;
  S.releaseFire(a);
  doKonca(a);
  const snap = przezSiec(S.stanPoTurze(a));

  const b = S.createGame(77, players(3), { sieciowa: true });
  const przebudowa = S.zastosujSnapshot(b, snap);
  S.zastosujSnapshot(a, snap);
  assert(przebudowa, 'odbiorca bez kraterow powinien przebudowac teren');
  assert(S.stateHash(a) === S.stateHash(b), 'stan po snapshocie sie rozjechal');
  assert(T.countSolid(a.terrain) === T.countSolid(b.terrain), 'teren po snapshocie inny');
});

test('zgodny snapshot nie przebudowuje terenu', () => {
  const a = S.createGame(77, players(2), { sieciowa: true });
  S.explode(a, 1000, 600, WEAPONS.bazooka);
  S.applyPas(a);
  doKonca(a);
  const snap = przezSiec(S.stanPoTurze(a));
  const teren = a.terrain;
  assert(!S.zastosujSnapshot(a, snap), 'zgodne kratery a teren przebudowany');
  assert(a.terrain === teren, 'podmieniony obiekt terenu');
});

test('snapshot jest maly', () => {
  const a = S.createGame(77, players(6));
  for (let i = 0; i < 40; i++) S.explode(a, 300 + i * 35, 600, WEAPONS.bazooka);
  const bajty = JSON.stringify(S.snapshot(a)).length;
  assert(bajty < 6000, 'snapshot ma ' + bajty + ' bajtow');
  console.log('       (snapshot, 6 graczy, 40 wybuchow: ' + bajty + ' B)');
});

test('rozne seedy daja rozny hash', () => {
  assert(S.stateHash(S.createGame(1, players(2))) !== S.stateHash(S.createGame(2, players(2))));
});

console.log('\nOSIAGNIECIA');

/* Prawdziwa symulacja, zdarzenia karmione do reguł tak jak w main.js. */
function grajZOsiagnieciami(st, os, mojeId, sek) {
  const zdobyte = new Set();
  for (let i = 0; i < sek / S.DT; i++) {
    S.step(st);
    const akt = S.activeWorm(st);
    for (const e of st.events) {
      for (const id of zdarzenieOs(os, e, { nr: st.turnNumber, aktId: akt ? akt.id : null, mojeId, fragiWczesniej: 0 })) zdobyte.add(id);
    }
    st.events.length = 0;
    if (st.phase === 'koniec' || st.phase === 'over') break;
  }
  return zdobyte;
}

test('zabicie nalotem daje „Nalot dywanowy” i „Pierwsza krew”', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  const ja = S.activeWorm(st);
  const wrog = st.worms.find((w) => w !== ja);
  wrog.hp = 1;
  st.weapon = 'nalot';
  S.ustawCel(st, wrog.x, wrog.y);
  assert(S.startCharging(st), 'nalot nie wystartowal');
  S.releaseFire(st);
  const os = nowaPartiaOs();
  const z = grajZOsiagnieciami(st, os, ja.id, 20);
  assert(!wrog.alive, 'nalot nie zabil');
  assert(z.has('nalot') && z.has('pierwsza-krew'), 'brak osiagniec: ' + [...z].join(','));
  assert(os.fragi === 1, 'fragi=' + os.fragi);
});

test('wrzucenie do lawy daje „Kąpiel w lawie”', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  const ja = S.activeWorm(st);
  const wrog = st.worms.find((w) => w !== ja);
  wrog.y = st.lava + 4;
  wrog.onGround = false;
  const z = grajZOsiagnieciami(st, nowaPartiaOs(), ja.id, 0.1);
  assert(z.has('lawa'), 'brak: ' + [...z].join(','));
});

test('smierc liczona raz, dublet, progi 5 i 25, samoboja', () => {
  const os = nowaPartiaOs();
  const ctx = { nr: 3, aktId: 'ja', mojeId: 'ja', fragiWczesniej: 3 };
  zdarzenieOs(os, { type: 'strzal', weapon: 'dynamit' }, ctx);
  const a = zdarzenieOs(os, { type: 'smierc', wormId: 'x', cause: 'wybuch' }, ctx);
  const b = zdarzenieOs(os, { type: 'smierc', wormId: 'x', cause: 'wybuch' }, ctx);
  const c = zdarzenieOs(os, { type: 'smierc', wormId: 'y', cause: 'wybuch' }, ctx);
  assert(a.includes('saper') && !a.includes('piec-fragow'), 'a: ' + a);
  assert(b.length === 0, 'podwojne liczenie: ' + b);
  assert(c.includes('dublet') && c.includes('piec-fragow') && !c.includes('rzeznik'), 'c: ' + c);
  assert(os.fragi === 2, 'fragi=' + os.fragi);
  assert(zdarzenieOs(os, { type: 'smierc', wormId: 'z' }, { ...ctx, fragiWczesniej: 30 }).includes('rzeznik'), 'rzeznik');
  assert(zdarzenieOs(os, { type: 'smierc', wormId: 'ja', cause: 'lawa' }, ctx).includes('samoboja'), 'samoboja');
  const os2 = nowaPartiaOs();
  zdarzenieOs(os2, { type: 'strzal', weapon: 'kij' }, ctx);
  assert(zdarzenieOs(os2, { type: 'smierc', wormId: 'q', cause: 'lawa' }, ctx).includes('home-run'), 'home run');
  // cudza tura: nic mi się nie liczy
  const d = zdarzenieOs(os, { type: 'smierc', wormId: 'w', cause: 'lawa' }, { ...ctx, nr: 4, aktId: 'inny' });
  assert(d.length === 0, 'cudza tura: ' + d);
});

test('masakra, ucieczka po dynamicie i osiagniecia konca partii', () => {
  const os = nowaPartiaOs();
  const ctx = { nr: 1, aktId: 'ja', mojeId: 'ja' };
  zdarzenieOs(os, { type: 'strzal', weapon: 'dynamit' }, ctx);
  assert(zdarzenieOs(os, { type: 'obrazenia', wormId: 'a', amount: 60 }, ctx).length === 0);
  assert(zdarzenieOs(os, { type: 'obrazenia', wormId: 'b', amount: 45 }, ctx).includes('masakra'), 'masakra');
  assert(koniecTuryOs(os, { mojeId: 'ja', jaZywy: true }).includes('ucieczka'), 'ucieczka');
  zdarzenieOs(os, { type: 'strzal', weapon: 'dynamit' }, { ...ctx, nr: 2 });
  zdarzenieOs(os, { type: 'obrazenia', wormId: 'ja', amount: 30 }, { ...ctx, nr: 2 });
  assert(!koniecTuryOs(os, { mojeId: 'ja', jaZywy: true }).includes('ucieczka'), 'ucieczka mimo ran');
  const k = koniecPartiiOs(os, { wygralem: true, hp: 7, partie: 10 });
  assert(k.includes('zwyciestwo') && k.includes('na-wlosku') && k.includes('weteran') && !k.includes('nietykalny'), 'koniec: ' + k);
  assert(koniecPartiiOs(nowaPartiaOs(), { wygralem: true, hp: 100, partie: 1 }).includes('nietykalny'), 'nietykalny');
});

test('kazde id z regul jest na liscie osiagniec', () => {
  const zrodlo = readFileSync(new URL('../osiagniecia.js', import.meta.url), 'utf8');
  const reguly = readFileSync(new URL('../src/osiagniecia-reguly.js', import.meta.url), 'utf8');
  const naLiscie = new Set([...zrodlo.matchAll(/id: '([a-z-]+)'/g)].map((m) => m[1]));
  const uzyte = new Set([...reguly.matchAll(/'([a-z]+(?:-[a-z]+)+|masakra|samoboja|dublet|lawa|rzeznik|ucieczka|weteran|zwyciestwo|nietykalny|nalot|saper|snajper|kasetowka|owca)'/g)].map((m) => m[1]));
  for (const id of ['pierwsza-krew', 'piec-fragow', 'rzeznik', 'dublet', 'lawa', 'masakra', 'samoboja', 'ucieczka', 'weteran', 'zwyciestwo', 'na-wlosku', 'nietykalny', 'nalot', 'saper', 'snajper', 'kasetowka', 'owca', 'home-run']) {
    assert(naLiscie.has(id), 'brak na liscie: ' + id);
    assert(uzyte.has(id), 'regula nie uzywa: ' + id);
  }
  assert(naLiscie.size === 18, 'na liscie jest ' + naLiscie.size);
});

console.log('\n' + (failed === 0
  ? '\x1b[32mWszystkie testy przeszly (' + passed + ')\x1b[0m'
  : '\x1b[31m' + failed + ' bledow, ' + passed + ' ok\x1b[0m') + '\n');

process.exit(failed === 0 ? 0 : 1);
