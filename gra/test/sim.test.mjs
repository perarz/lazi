/* Testy rdzenia gry. Odpalane w Node, bez przeglądarki:
   node gra/test/sim.test.mjs
   Jednocześnie pilnują, żeby sim.js i terrain.js nie wciągnęły DOM-u. */

import { readFileSync } from 'fs';
import * as T from '../src/terrain.js';
import * as S from '../src/sim.js';
import { WEAPONS, WEAPON_ORDER } from '../src/weapons.js';
import { nowaPartiaOs, zdarzenieOs, koniecTuryOs, koniecPartiiOs } from '../src/osiagniecia-reguly.js';
import * as R from '../src/render.js';
import * as U from '../src/ustawienia.js';
import * as M from '../src/muzyka.js';     // tylko kamera (czysta matematyka, bez DOM)

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

test('spawny zawsze na gruncie, takze na archipelagu z 6 graczami', () => {
  let archipelagi = 0;
  for (let k = 1; k <= 120 && archipelagi < 12; k++) {
    const seed = (k * 2654435761) >>> 0;
    const t = T.createTerrain(seed);
    if (t.styl !== 'archipelag' && k > 6) continue;
    if (t.styl === 'archipelag') archipelagi++;
    for (const p of T.spawnPoints(t, 6, seed)) {
      assert(T.solidAt(t, p.x, p.y + 1) && !T.solidAt(t, p.x, p.y), 'spawn w powietrzu: seed ' + seed + ' ' + JSON.stringify(p));
      assert(p.y < T.LAVA_Y - 30, 'spawn nad sama lawa: seed ' + seed);
    }
  }
  assert(archipelagi >= 5, 'za malo archipelagow w probce: ' + archipelagi);
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

test('railgun przebija skale i trafia dwoch robali na linii (75), a w skale wypala tunel', () => {
  const st = S.createGame(21, players(3));
  const a = S.activeWorm(st);
  const [b, c] = st.worms.filter((w) => w !== a);
  const kier = a.x < st.terrain.w / 2 ? 1 : -1;
  a.facing = kier;
  b.x = a.x + 120 * kier; b.y = a.y;
  c.x = a.x + 300 * kier; c.y = a.y;
  // gruba skała na linii strzału między robalami
  const yl = Math.round(a.y - 10);
  const xs = Math.round(a.x + 180 * kier);
  for (let y = yl - 25; y < yl + 20; y++) for (let x = xs - 20; x < xs + 20; x++) st.terrain.mask[y * st.terrain.w + x] = 1;
  const kraterow = st.terrain.craters.length;
  st.weapon = 'railgun';
  S.ustawCelownik(st, kier > 0 ? 0 : Math.PI);
  assert(S.startCharging(st), 'nie da sie strzelic z railguna');
  S.releaseFire(st);
  assert(b.hp === 25 && c.hp === 25, 'hp: ' + b.hp + ', ' + c.hp);
  assert(a.amunicja.railgun === 0, 'amunicja railguna: ' + a.amunicja.railgun);
  assert(st.events.some((e) => e.type === 'railgun' && e.trafieni === 2), 'brak zdarzenia railgun');
  // tunel: dziura na wysokości lasera przez całą grubość skały, nad i pod nią skała zostaje
  const ly = Math.round(a.y - S.WORM_H * 0.55);              // wysokość lufy = wysokość lasera
  const tunele = st.terrain.craters.slice(kraterow).filter((k) => k.r <= T.TUNEL);
  assert(tunele.length >= 1, 'brak tunelu na liscie kraterow');
  for (let x = xs - 18; x < xs + 18; x += 6) assert(!T.solidAt(st.terrain, x, ly), 'skala w tunelu na x=' + x);
  assert(T.solidAt(st.terrain, xs, ly - 12) && T.solidAt(st.terrain, xs, ly + 12), 'tunel za szeroki');
  assert(st.events.some((e) => e.type === 'tunel'), 'brak zdarzenia tunel');
});

test('tunel railguna: jeden wpis na liscie, przez siec (dwie trojki) i rebuild daje ten sam teren', () => {
  const a = S.createGame(77, players(2), { sieciowa: true });
  T.wytnijTunel(a.terrain, 300.4, 200.6, 900.2, 520.9, 7);
  T.carve(a.terrain, 500, 300, 30);
  T.wytnijTunel(a.terrain, 1200, 700, 1200, 400, 7);              // pionowy
  const plaska = przezSiec(S.plaskieKratery(a));
  assert(plaska.length === 3 * 5, 'dlugosc listy: ' + plaska.length);
  const b = S.createGame(77, players(2), { sieciowa: true });
  assert(S.ustawKratery(b, plaska), 'brak przebudowy');
  assert(T.countSolid(b.terrain) === T.countSolid(a.terrain), 'inny teren po rebuild');
  assert(!S.ustawKratery(b, przezSiec(S.plaskieKratery(a))), 'zgodna lista przebudowala teren');
  assert(!T.solidAt(b.terrain, 600, 360) && !T.solidAt(b.terrain, 1200, 550), 'brak dziury po rebuild');
  // urwany tunel z sieci nie wywraca gry
  const c = S.createGame(77, players(2), { sieciowa: true });
  S.ustawKratery(c, [300, 200, T.TUNEL - 7, 900]);
  assert(c.terrain.craters.length === 0, 'urwany tunel przyjety');
});

test('miny i beczki: rozstawione z seeda, na gruncie, z dala od robali; ustawienie 0 = brak', () => {
  const a = S.createGame(4242, players(4)), b = S.createGame(4242, players(4));
  assert(a.pulapki.length >= 4, 'za malo pulapek: ' + a.pulapki.length);
  assert(JSON.stringify(a.pulapki) === JSON.stringify(b.pulapki), 'rozne rozstawienie przy tym samym seedzie');
  for (const p of a.pulapki) {
    assert(T.solidAt(a.terrain, p.x, p.y + 1), 'pulapka w powietrzu: ' + JSON.stringify(p));
    assert(a.worms.every((w) => Math.abs(w.x - p.x) >= 80 || Math.abs(w.y - p.y) >= 80), 'pulapka przy robalu');
  }
  assert(S.createGame(4242, players(4), { ustawienia: { pulapki: 0 } }).pulapki.length === 0, 'wylaczone, a sa');
  assert(S.createGame(4242, players(4), { ustawienia: { pulapki: 2 } }).pulapki.length > a.pulapki.length, 'duzo nie wiecej');
});

test('mina: robal podchodzi, po lontcie wybuch rani; beczki wybuchaja lancuchem', () => {
  const st = S.createGame(21, players(2), { sieciowa: true, ustawienia: { pulapki: 0 } });
  const a = S.activeWorm(st);
  polka(st, a, 220);
  a.y = Math.round(a.y); a.onGround = true;
  const y = Math.round(a.y);
  st.pulapki = [{ id: 1, typ: 'mina', x: Math.round(a.x) + 12, y, lont: -1 },
    { id: 2, typ: 'beczka', x: Math.round(a.x) + 55, y, lont: -1 }, { id: 3, typ: 'beczka', x: Math.round(a.x) + 115, y, lont: -1 }];
  S.step(st);
  assert(st.pulapki[0].lont > 0, 'mina nie zlapala robala');
  const hp0 = a.hp;
  for (let i = 0; i < 600 && st.pulapki.length; i++) S.step(st);
  assert(st.pulapki.length === 0, 'zostaly pulapki: ' + JSON.stringify(st.pulapki));
  assert(a.hp < hp0, 'mina nie zranila robala');
});

test('pulapki w snapshocie: odbiorca ma ten sam stan co autor (lont tez)', () => {
  const st = S.createGame(99, players(3), { sieciowa: true });
  st.pulapki[0].lont = 40;
  const snap = przezSiec(S.snapshot(st));
  const b = S.createGame(99, players(3), { sieciowa: true });
  S.zastosujSnapshot(b, snap);
  assert(JSON.stringify(S.stanPulapek(b)) === JSON.stringify(S.stanPulapek(st)), 'rozne pulapki');
  assert(S.stateHash(b) === S.stateHash(st), 'rozny hash');
});

test('beczka rozlewa plonaca rope: ogien leci, laduje na ziemi, wypala dolki i gasnie; tura czeka', () => {
  const st = S.createGame(21, players(2), { sieciowa: true, ustawienia: { pulapki: 0 } });
  const a = S.activeWorm(st);
  const b = st.worms.find((w) => w !== a);
  polka(st, a, 300);
  a.y = Math.round(a.y); a.onGround = true;
  b.x = a.x - 250; b.y = a.y; b.onGround = true;          // daleko, poza wybuchem i ogniem
  st.wind = 0;
  st.pulapki = [{ id: 7, typ: 'beczka', x: Math.round(a.x) + 150, y: Math.round(a.y), lont: 1 }];
  st.phase = 'settle';                                      // osiadanie po strzale: tura czeka na ogień
  st.settleTime = 0;
  const kraterow = st.terrain.craters.length;
  let bylOgien = 0, wypalen = 0, naZiemi = 0;
  for (let i = 0; i < 20 * 120 && st.phase === 'settle'; i++) {
    S.step(st);
    bylOgien = Math.max(bylOgien, st.ogien.length);
    naZiemi = Math.max(naZiemi, st.ogien.filter((f) => f.grunt).length);
    wypalen += st.events.filter((e) => e.type === 'wypalenie').length;
    st.events.length = 0;
  }
  assert(bylOgien >= 10, 'za malo ognia: ' + bylOgien);
  assert(naZiemi >= 5, 'ogien nie lezal na ziemi: ' + naZiemi);
  assert(wypalen >= 5 && st.terrain.craters.length >= kraterow + 1 + wypalen, 'ogien nie wypalil ziemi: ' + wypalen);
  assert(st.terrain.craters.slice(kraterow + 1).every((c) => c.r === 6 && Number.isInteger(c.x) && Number.isInteger(c.y)), 'dziwne dolki');
  assert(st.ogien.length === 0 && st.phase === 'koniec', 'ogien nie zgasl albo tura nie ruszyla: ' + st.phase);
});

test('ogien parzy robala raz na takt (nie za kazda krople), robal odskakuje; kolegi nie rusza', () => {
  const st = S.createGame(21, players(3), { sieciowa: true, ustawienia: { pulapki: 0 } });
  const a = S.activeWorm(st);
  const [b] = st.worms.filter((w) => w !== a);
  polka(st, b, 120);
  b.y = Math.round(b.y); b.onGround = true;
  const kropla = (dx) => ({ x: b.x + dx, y: b.y - 1, vx: 0, vy: 0, t: 0, zycie: 300, wyp: 3, grunt: 1 });
  S.ustawOgien(st, S.stanOgnia({ ogien: [kropla(-4), kropla(2), kropla(5)] }));
  const hp = b.hp;
  for (let i = 0; i < 30; i++) S.step(st);
  assert(b.hp === hp - 3, 'trzy krople = jedno parzenie, hp: ' + hp + ' -> ' + b.hp);
  assert(!b.onGround && b.vy < 0, 'robal nie odskoczyl od ognia');
  assert(st.events.some((e) => e.type === 'obrazenia' && e.cause === 'ogien'), 'brak obrazen od ognia');
  // w druzynach ogień (jak wybuch) nie rusza kolegi gracza z turą
  const d = S.createGame(21, [{ id: 'p0', name: 'A', color: '#f60', druzyna: 0 }, { id: 'p1', name: 'B', color: '#f60', druzyna: 1 },
    { id: 'p2', name: 'C', color: '#f60', druzyna: 1 }], { sieciowa: true, druzyny: true, ustawienia: { pulapki: 0 } });
  const akt = S.activeWorm(d);
  const kol = d.worms.find((w) => w !== akt && w.druzyna === akt.druzyna);
  assert(kol, 'gracz z tura bez kolegi (seed)');
  polka(d, kol, 120);
  kol.y = Math.round(kol.y); kol.onGround = true;
  d.ogien = [{ x: kol.x, y: kol.y - 1, vx: 0, vy: 0, t: 0, zycie: 300, wyp: 3, grunt: 1 }];
  const hk = kol.hp;
  for (let i = 0; i < 31; i++) S.step(d);
  assert(kol.hp === hk, 'ogien poparzyl kolege');
});

test('ogien podpala beczke obok', () => {
  const st = S.createGame(21, players(2), { sieciowa: true, ustawienia: { pulapki: 0 } });
  const a = S.activeWorm(st);
  polka(st, a, 300);
  const x = Math.round(a.x) + 200, y = Math.round(a.y);
  st.pulapki = [{ id: 1, typ: 'beczka', x, y, lont: -1 }];
  st.ogien = [{ x: x + 4, y: y - 1, vx: 0, vy: 0, t: 0, zycie: 300, wyp: 3, grunt: 1 }];
  for (let i = 0; i < 31; i++) S.step(st);
  assert(st.pulapki.length === 0 || st.pulapki[0].lont >= 0, 'beczka w ogniu sie nie zapalila');
});

test('ogien w strzale: beczka wybucha przed strzalem, odbiorca po locie ma ten sam stan', () => {
  for (const seed of [5, 77]) {
    const a = S.createGame(seed, players(3), { sieciowa: true });
    const b = S.createGame(seed, players(3), { sieciowa: true });
    const kto = S.activeWorm(a);
    // u strzelca (tylko u niego) beczka obok wybucha, zanim strzeli — odbiorca dowie się ze strzału
    a.pulapki.push({ id: 99, typ: 'beczka', x: Math.round(kto.x) + (kto.facing > 0 ? -90 : 90), y: Math.round(kto.y), lont: 1 });
    run(a, 0.5);
    assert(a.ogien.length > 0, 'brak ognia przed strzalem');
    a.weapon = 'granat';
    S.ustawCelownik(a, -1.1);
    assert(S.startCharging(a), 'nie da sie strzelic');
    run(a, 0.3);
    S.releaseFire(a);
    const akcja = przezSiec(a.akcjeDoWyslania[0]);
    assert(Array.isArray(akcja.ogien) && akcja.ogien.length > 0, 'strzal bez ognia');
    S.zastosujStrzal(b, akcja);
    S.dopiszOdwrot(b, [], true);
    doKonca(a);
    doKonca(b);
    assert(S.stateHash(a) === S.stateHash(b), 'rozjazd z ogniem (seed ' + seed + ')');
    assert(a.ogien.length === 0, 'ogien zostal na koniec tury');
  }
});

test('pas niesie ogien, stan tury juz nie (ogien gasnie na granicy tur)', () => {
  const st = S.createGame(5, players(2), { sieciowa: true });
  st.ogien = [{ x: 500.5, y: 300, vx: -0, vy: 12.25, t: 3, zycie: 300, wyp: 0, grunt: 0 }];
  const kopia = przezSiec(S.stanOgnia(st));
  const b = S.createGame(5, players(2), { sieciowa: true });
  S.ustawOgien(b, kopia);
  assert(JSON.stringify(S.stanOgnia(b)) === JSON.stringify(S.stanOgnia(st)), 'ogien przez siec inny');
  const snap = przezSiec(S.stanPoTurze(st));
  assert(snap.ogien === undefined, 'ogien w stanie tury');
  S.zastosujSnapshot(b, snap);
  assert(b.ogien.length === 0, 'ogien przetrwal granice tury');
  S.ustawOgien(b, [[1, 2, 3], 'x', null]);
  assert(b.ogien.length === 0, 'smieci z sieci przeszly');
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

/* Nalot spada z nieba: na piętrowych mapach cel bywa pod nawisem — czyścimy
   szyb nad nim i wyłączamy wiatr, żeby test sprawdzał broń, a nie kształt mapy. */
function otworzNiebo(st, w) {
  for (let y = 0; y < w.y - 30; y += 20) T.carve(st.terrain, w.x, y, 45);
  st.wind = 0;
}

test('nalot wymaga celu i zrzuca rakiety', () => {
  const st = S.createGame(21, players(2));
  st.weapon = 'nalot';
  assert(!S.startCharging(st), 'nalot bez celu nie powinien ruszyc');
  const cel = st.worms.find((w) => w !== S.activeWorm(st));
  otworzNiebo(st, cel);
  S.ustawCel(st, cel.x, cel.y);
  assert(S.startCharging(st), 'nalot z celem nie ruszyl');
  S.releaseFire(st);
  assert(st.projectiles.length === WEAPONS.nalot.rakiety, 'rakiet: ' + st.projectiles.length);
  run(st, 10);
  assert(cel.hp < 100, 'nalot nie zranil celu');
});

test('nalot trafia w cel stojacy wysoko, takze przy wietrze (4.8)', () => {
  for (const [yCelu, wiatr] of [[120, 0], [120, 180], [700, -180]]) {
    const st = S.createGame(21, players(2));
    const t = st.terrain;
    // puste niebo i gruba skała, której wierzch jest na wysokości celu
    t.mask.fill(0, 0, (yCelu + 400) * t.w);
    const cx = 1000;
    for (let x = cx - 300; x <= cx + 300; x++) for (let y = yCelu; y < yCelu + 300; y++) t.mask[y * t.w + x] = 1;
    st.wind = wiatr;
    st.weapon = 'nalot';
    S.ustawCel(st, cx, yCelu);
    assert(S.startCharging(st), 'nalot nie ruszył');
    S.releaseFire(st);
    const wybuchy = [];
    for (let i = 0; i < 8 / S.DT && st.projectiles.length; i++) {
      S.step(st);
      for (const e of st.events) if (e.type === 'wybuch') wybuchy.push(e);
      st.events.length = 0;
    }
    assert(wybuchy.length === WEAPONS.nalot.rakiety, 'wybuchów: ' + wybuchy.length);
    const srodek = wybuchy.reduce((s, e) => s + e.x, 0) / wybuchy.length;
    // pierwsze rakiety uderzają w wierzch skały, kolejne wpadają w ich kratery (trochę niżej)
    assert(Math.abs(srodek - cx) < 15 && wybuchy.every((e) => e.y >= yCelu - 5 && e.y < yCelu + 60),
      'nalot obok celu (y ' + yCelu + ', wiatr ' + wiatr + '): środek ' + srodek.toFixed(0));
  }
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

test('owca biegnie daleko i przeskakuje przeszkody', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  const a = S.activeWorm(st);
  const b = st.worms.find((w) => w !== a);
  polka(st, a, 260);
  a.y = Math.round(a.y); a.onGround = true; a.facing = 1;
  b.x = a.x - 200;                                   // wróg daleko za plecami — owca go nie złapie
  // próg 14 px na drodze owcy
  for (let x = Math.round(a.x) + 60; x < Math.round(a.x) + 90; x++) {
    for (let y = Math.round(a.y) - 14; y <= Math.round(a.y); y++) st.terrain.mask[y * T.WORLD_W + x] = 1;
  }
  st.weapon = 'owca';
  S.startCharging(st);
  S.releaseFire(st);
  let maxX = 0;
  for (let i = 0; i < 3.5 / S.DT && st.projectiles.length; i++) {
    S.step(st);
    maxX = Math.max(maxX, st.projectiles[0] ? st.projectiles[0].x - a.x : maxX);
  }
  assert(maxX > 150, 'owca przebiegla tylko ' + Math.round(maxX) + ' px');
});

test('w locie po skoku mozna skrecac', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  const a = S.activeWorm(st);
  polka(st, a, 200);
  a.y = Math.round(a.y); a.onGround = true; a.facing = 1;
  S.jump(st);
  st.input.left = true;                             // skok w prawo, w locie w lewo
  run(st, 0.35);
  assert(a.vx < 0, 'w locie nie da sie skrecic, vx=' + a.vx);
  assert(a.facing === -1, 'robal nie obrocil sie w locie');
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
  assert(!S.startCharging(st), 'kij bez skrzynki nie powinien dzialac');
  a.amunicja.kij = 1;
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

test('wiertlo drazy tunel w strone celownika', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  const a = S.activeWorm(st);
  const b = st.worms.find((w) => w !== a);
  b.x = a.x > T.WORLD_W / 2 ? 150 : T.WORLD_W - 150;  // wróg daleko
  const x0 = Math.round(a.x), y0 = Math.round(a.y);
  for (let x = x0 - 40; x <= x0 + 220; x++) for (let y = y0 - 60; y < y0 + 260; y++) st.terrain.mask[y * T.WORLD_W + x] = y > y0 ? 1 : 0;
  a.facing = 1;
  st.weapon = 'wiertlo';
  S.ustawCelownik(st, 0.9);                         // skos w dół, w prawo
  assert(S.startCharging(st), 'wiertlo nie rusza');
  S.releaseFire(st);
  assert(st.projectiles.length === 1, 'brak wiertla');
  doKonca(st);
  // środek toru po ok. 100 px drogi jest pusty
  const tx = x0 + Math.round(Math.cos(0.9) * 100), ty = y0 - 10 + Math.round(Math.sin(0.9) * 100);
  assert(!T.solidAt(st.terrain, tx, ty), 'brak tunelu w ' + tx + ',' + ty);
  assert(st.terrain.craters.length > 10, 'za malo wyciec: ' + st.terrain.craters.length);
});

/* Tura do przodu bez strzału, z przyjęciem stanu kanonicznego. */
function nastepnaTura(st) {
  S.applyPas(st);
  doKonca(st);
  S.zastosujSnapshot(st, przezSiec(S.stanPoTurze(st)));
}

test('zrzuty skrzynek: te same u kazdego, apteczka leczy', () => {
  const a = S.createGame(4242, players(3), { sieciowa: true });
  const b = S.createGame(4242, players(3), { sieciowa: true });
  for (let i = 0; i < 40 && a.skrzynki.length === 0; i++) { nastepnaTura(a); nastepnaTura(b); }
  assert(a.skrzynki.length > 0, 'przez 40 tur nic nie spadlo');
  assert(JSON.stringify(a.skrzynki) === JSON.stringify(b.skrzynki), 'rozne skrzynki u graczy');
  const c = a.skrzynki[0];
  assert(T.solidAt(a.terrain, c.x, c.y + 1), 'skrzynka wisi w powietrzu');
  const w = S.activeWorm(a);
  w.hp = 50;
  c.typ = 'apteczka';
  w.x = c.x; w.y = c.y; w.vx = 0; w.vy = 0;
  a.events.length = 0;
  S.step(a);
  assert(w.hp === 50 + S.APTECZKA_HP, 'apteczka nie wyleczyla, hp=' + w.hp);
  assert(!a.skrzynki.includes(c), 'skrzynka nie zniknela');
  assert(a.events.some((e) => e.type === 'skrzynka'), 'brak zdarzenia');
});

test('skrzynka z zapasem dodaje amunicje, wybuch niszczy skrzynke', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  const w = S.activeWorm(st);
  polka(st, w, 200);
  w.y = Math.round(w.y); w.onGround = true;
  const suma = () => Object.values(w.amunicja).reduce((x, y) => x + y, 0);
  const przed = suma();
  st.skrzynki.push({ id: 9, typ: 'zapas', x: Math.round(w.x), y: w.y });
  S.step(st);
  assert(suma() === przed + 1, 'zapas nie dodal amunicji');
  st.skrzynki.push({ id: 10, typ: 'apteczka', x: Math.round(w.x) + 120, y: w.y });
  S.explode(st, w.x + 120, w.y - 5, WEAPONS.bazooka);
  assert(st.skrzynki.length === 0, 'wybuch nie rozbil skrzynki');
});

test('skrzynka zebrana przed strzalem dociera do odbiorcy', () => {
  const a = S.createGame(21, players(2), { sieciowa: true });
  const b = S.createGame(21, players(2), { sieciowa: true });
  const w = S.activeWorm(a);
  polka(a, w, 200); polka(b, S.activeWorm(b), 200);
  for (const st of [a, b]) {
    const r = S.activeWorm(st);
    r.y = Math.round(r.y); r.onGround = true; r.hp = 60;
    st.skrzynki.push({ id: 3, typ: 'apteczka', x: Math.round(r.x) + 30, y: r.y });
  }
  a.input.right = true;
  run(a, 0.8);                                      // wchodzi w skrzynkę tylko u strzelca
  a.input.right = false;
  assert(a.skrzynki.length === 0 && w.hp > 60, 'strzelec nie zebral skrzynki');
  a.weapon = 'bazooka';
  S.ustawCelownik(a, -1.2);
  S.startCharging(a);
  a.power = 0.5;
  S.releaseFire(a);
  for (let i = 0; i < 2000 && a.akcjeDoWyslania.length === 0; i++) S.step(a);
  S.zastosujStrzal(b, przezSiec(a.akcjeDoWyslania[0]));
  doKonca(a); doKonca(b);
  assert(b.skrzynki.length === 0, 'odbiorca dalej widzi skrzynke');
  assert(S.stateHash(a) === S.stateHash(b), 'rozjazd po zebraniu skrzynki');
});

test('most stawia belke, po ktorej da sie chodzic, i przezywa rebuild', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  const a = S.activeWorm(st);
  polka(st, a, 200);
  a.y = Math.round(a.y); a.onGround = true;
  const cx = Math.round(a.x) + 80, cy = a.y - 40;
  st.weapon = 'most';
  S.ustawCel(st, a.x + 20, a.y - 10);
  assert(!S.startCharging(st), 'most na robalu nie powinien powstac');
  S.ustawCel(st, a.x + 900, cy);
  assert(!S.startCharging(st), 'most za daleko nie powinien powstac');
  S.ustawCel(st, cx, cy);
  assert(S.startCharging(st), 'most nie powstal');
  S.releaseFire(st);
  assert(T.solidAt(st.terrain, cx, cy + 3) && T.solidAt(st.terrain, cx - 40, cy + 6), 'brak belki');
  assert(st.terrain.mask[(cy + 3) * T.WORLD_W + cx] === 2, 'belka nie ma wartosci 2');
  assert(a.amunicja.most === WEAPONS.most.amunicja - 1, 'nie zuzyto mostu');
  // odbudowa z listy kraterów: most, a potem wybuch, który go przecina
  const t1 = T.createTerrain(77);
  T.carve(t1, 1000, 60, -1);
  T.carve(t1, 1030, 63, 10);
  const t2 = T.rebuild(77, t1.craters);
  assert(T.countSolid(t2) === T.countSolid(t1) && t2.mask[62 * T.WORLD_W + 980] === 2, 'rebuild zgubil most');
  assert(!T.solidAt(t2, 1030, 63), 'wybuch po moscie nie przecial belki');
  // robal postawiony na moście stoi
  a.x = cx; a.y = cy - 1; a.vx = 0; a.vy = 0; a.onGround = false;
  run(st, 1);
  assert(Math.abs(a.y - (cy - 1)) < 1.5 && a.onGround, 'robal spadl z mostu, y=' + a.y);
});

test('most obracany R: skos i pion, odbiorca stawia to samo, rebuild pamieta obrot', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  const odb = S.createGame(21, players(2), { sieciowa: true });
  const a = S.activeWorm(st);
  polka(st, a, 260);
  const cx = Math.round(a.x) + 90, cy = Math.round(a.y) - 60;
  st.weapon = 'most';
  for (let i = 0; i < 4; i++) S.obrocMost(st);          // 4 × 22,5° = pion
  assert(st.mostObrot === 4, 'obrot: ' + st.mostObrot);
  S.ustawCel(st, cx, cy);
  assert(S.startCharging(st), 'pionowy most nie powstal');
  S.releaseFire(st);
  const akcja = przezSiec(st.akcjeDoWyslania[0]);
  assert(akcja.cel.k === 4, 'obrot nie leci w akcji');
  // pion: pełno nad i pod środkiem, pusto 20 px w bok
  assert(T.solidAt(st.terrain, cx, cy - 40) && T.solidAt(st.terrain, cx, cy + 40), 'brak pionowej belki');
  assert(!T.solidAt(st.terrain, cx + 20, cy - 40) || st.terrain.mask[(cy - 40) * st.terrain.w + cx + 20] !== 2, 'belka za gruba');
  // odbiorca: ten sam teren
  // odbiorca buduje teren z listy kraterów (półka testowa jest tylko u strzelca, więc porównujemy odbudowy)
  S.ustawKratery(odb, S.plaskieKratery(st));
  const t2 = T.rebuild(21, st.terrain.craters, st.terrain.opcje);
  assert(T.countSolid(odb.terrain) === T.countSolid(t2), 'odbiorca ma inny most');
  assert(t2.mask[(cy + 30) * t2.w + cx] === 2 || T.solidAt(t2, cx, cy + 30), 'rebuild zgubil obrot mostu');
  assert(t2.craters[t2.craters.length - 1].r === -5, 'obrot nie zapisany w kraterach: ' + t2.craters[t2.craters.length - 1].r);
  // skos (k = 2, 45°) i kolizja z robalem liczy obrót
  const b = S.createGame(21, players(2), { sieciowa: true });
  const w = S.activeWorm(b);
  polka(b, w, 260);
  b.weapon = 'most';
  S.obrocMost(b); S.obrocMost(b);
  S.ustawCel(b, w.x, w.y - 10);
  assert(S.powodBrakuMostu(b, w, b.cel) === 'robal na drodze', 'skosny most na robalu');
  assert(T.wMoscie(100, 100, 2, 100 + 30 * 0.7071, 100 + 30 * 0.7071) && !T.wMoscie(100, 100, 2, 130, 100), 'geometria skosu');
});

test('rozmiar mapy: duza i mala maja inna szerokosc, spawny na gruncie, stan przechodzi przez siec', () => {
  for (const [rozmiar, szer] of [['mala', 1536], ['duza', 3072], ['ogromna', 4096]]) {
    const st = S.createGame(99, players(4), { sieciowa: true, ustawienia: { rozmiar } });
    assert(st.terrain.w === szer && st.terrain.mask.length === szer * T.WORLD_H, rozmiar + ': zla szerokosc ' + st.terrain.w);
    for (const w of st.worms) {
      assert(w.x > 0 && w.x < szer && T.solidAt(st.terrain, w.x, w.y + 1), rozmiar + ': robal w powietrzu');
    }
    T.carve(st.terrain, szer - 300, 500, 40);
    const t2 = T.rebuild(99, st.terrain.craters, st.terrain.opcje);
    assert(t2.w === szer && T.countSolid(t2) === T.countSolid(st.terrain), rozmiar + ': rebuild inny');
  }
  const zwykla = S.createGame(99, players(2));
  assert(zwykla.terrain.w === T.WORLD_W, 'standard nie ma 2048');
});

test('mapa ekstremalna: styl tylko z ustawien, gesta siec jaskin, spawny na gruncie', () => {
  const st = S.createGame(12345, players(6), { sieciowa: true, ustawienia: { mapa: 'ekstremalna' } });
  assert(st.terrain.styl === 'ekstremalna', 'styl: ' + st.terrain.styl);
  // 4.8: ekstremalna jest wyższa (1,75×), lawa 144 px nad dnem, stan zna wysokość
  assert(st.terrain.h === T.WYS_EKSTREMALNA && st.terrain.mask.length === st.terrain.w * T.WYS_EKSTREMALNA, 'wysokosc: ' + st.terrain.h);
  assert(st.terrain.lava0 === T.WYS_EKSTREMALNA - (T.WORLD_H - T.LAVA_Y) && st.lava === st.terrain.lava0, 'lawa: ' + st.lava);
  const t2 = T.rebuild(12345, [{ x: 500, y: 1500, r: 40 }], st.terrain.opcje);
  assert(t2.h === st.terrain.h && !T.solidAt(t2, 500, 1500), 'rebuild wyzszej mapy');
  for (const w of st.worms) assert(T.solidAt(st.terrain, w.x, w.y + 1), 'robal w powietrzu na ekstremalnej');
  // dużo skały nad lawą i dużo pustki w środku (jaskinie)
  let skala = 0, pustka = 0;
  for (let y = 300; y < st.terrain.lava0 - 40; y += 4) for (let x = 200; x < st.terrain.w - 200; x += 4) {
    if (T.solidAt(st.terrain, x, y)) skala++; else pustka++;
  }
  assert(skala > pustka * 0.4 && pustka > skala * 0.15, 'ekstremalna nie wyglada na mrowisko: skala ' + skala + ', pustka ' + pustka);
  for (let seed = 1; seed < 200; seed += 23) assert(T.stylMapy(seed) !== 'ekstremalna', 'ekstremalna w losowaniu');
  // 4.5.1: iglice prawie pod sufit, ale zostaje pas nieba na przerzut
  let szczyt = st.terrain.h;
  for (let x = 100; x < st.terrain.w - 100; x += 2) {
    let y = 0;
    while (y < st.terrain.lava0 && !T.solidAt(st.terrain, x, y)) y++;
    szczyt = Math.min(szczyt, y);
  }
  assert(szczyt < 120 && szczyt >= 36, 'szczyt ekstremalnej: ' + szczyt);
});

test('wpisywane ustawienia: zycie, czas i runda lawy z zakresu, reszta odpada', () => {
  assert(U.poprawna('hp', 237) && !U.poprawna('hp', 5) && !U.poprawna('hp', 12.5), 'hp');
  assert(U.poprawna('lawaOd', 0) && U.poprawna('lawaOd', 17) && !U.poprawna('lawaOd', -3), 'lawaOd');
  assert(U.zLiczby('hp', '9999') === 500 && U.zLiczby('czas', '7') === 10 && U.zLiczby('hp', 'abc') === null, 'przyciecie');
  const st = S.createGame(5, players(2), { ustawienia: { hp: 237, czas: 75 } });
  assert(st.worms[0].hp === 237 && st.turnTimeLeft === 75, 'partia nie z wpisanych liczb');
});

test('kij tylko ze skrzynki: na starcie 0, skrzynki go dają', () => {
  const st = S.createGame(21, players(2), { sieciowa: true });
  assert(st.worms.every((w) => w.amunicja.kij === 0), 'kij na starcie');
  const w = S.activeWorm(st);
  polka(st, w, 200);
  w.y = Math.round(w.y); w.onGround = true;
  let kije = 0;
  for (let id = 0; id < 30; id++) {
    st.skrzynki.push({ id, typ: 'zapas', x: Math.round(w.x), y: w.y });
    S.step(st);
  }
  kije = w.amunicja.kij;
  assert(kije >= 5 && kije <= 15, 'kij ze skrzynek: ' + kije + '/30');
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
  assert(st.akcjeDoWyslania.length === 1, 'strzal nie trafil do kolejki wysylki — reszta by go nie zobaczyla');
  run(st, S.ODWROT_S + 0.1);            // ucieczka nie wysyła drugiej akcji (idzie paczkami w protokole)
  assert(st.akcjeDoWyslania.length === 1, 'po ucieczce doszla druga akcja');
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

test('ustawienia partii: zycie, bronie, wiatr, czas tury; bez ustawien jak dawniej', () => {
  const zwykla = S.createGame(77, players(2));
  assert(zwykla.worms[0].hp === 100 && zwykla.turnTimeLeft === S.TURN_TIME && zwykla.worms[0].amunicja.nalot === 1, 'domyslne inne niz dawniej');
  const st = S.createGame(77, players(2), { ustawienia: { hp: 200, czas: 45, wiatr: 0 } });
  assert(st.worms[0].hp === 200 && st.turnTimeLeft === 45, 'hp albo czas nie z ustawien');
  assert(st.worms[0].amunicja.nalot === 1 && st.worms[0].amunicja.kij === 0, 'normalne limity zle');
  assert(st.wind === 0 && Object.is(st.wind, 0), 'wiatr mimo „bez wiatru”: ' + st.wind);
  const hur = S.createGame(77, players(2), { ustawienia: { wiatr: 2 } });
  assert(Math.abs(hur.wind) > Math.abs(zwykla.wind), 'huragan nie silniejszy');
  const stary = S.createGame(77, players(2), { ustawienia: { bronie: 'klasyka' } });   // usunięty w 4.3.1 zestaw = normalny
  assert(stary.ust.bronie === 'pelny' && stary.worms[0].amunicja.teleport === 1, 'stary zestaw broni nie wrocil do normalnego');
  const szal = S.createGame(77, players(2), { ustawienia: { bronie: 'szalony' } });
  assert(Object.keys(szal.worms[0].amunicja).length === 0 && S.mozeStrzelic(szal, 'kij'), 'szal ma limity');
  // ustawienia przeżywają granicę tury (stanPoTurze → snapshot)
  S.applyPas(st);
  doKonca(st);
  S.zastosujSnapshot(st, przezSiec(S.stanPoTurze(st)));
  assert(st.turnTimeLeft === 45 && st.wind === 0, 'po turze ustawienia zgubione');
});

test('ustawienia partii: bez nagłej śmierci lawa stoi, bez zrzutów nic nie spada, w szale tylko apteczki', () => {
  const bez = S.createGame(11, players(2), { sieciowa: true, ustawienia: { lawaOd: 0, zrzuty: 0 } });
  const szal = S.createGame(4242, players(3), { sieciowa: true, ustawienia: { bronie: 'szalony', zrzuty: 70 } });
  const start = bez.lava;
  let skrzynki = 0;
  for (let i = 0; i < 3 * S.LAWA_PO_RUNDACH; i++) {
    nastepnaTura(bez);
    skrzynki += bez.skrzynki.length;
    nastepnaTura(szal);
  }
  assert(bez.lava === start, 'lawa wzbiera mimo „nigdy”');
  assert(skrzynki === 0, 'skrzynki mimo wylaczonych zrzutow');
  assert(szal.skrzynki.length > 0 && szal.skrzynki.every((c) => c.typ === 'apteczka'), 'w szale zapas albo brak skrzynek');
  // od 10. tury, błyskawicznie (40 px na turę) — i rośnie wyżej niż dawne 260 px
  const krotka = S.createGame(11, players(2), { sieciowa: true, ustawienia: { lawaOd: 5, lawaTempo: 40 } });
  for (let i = 0; i < 9; i++) nastepnaTura(krotka);
  assert(krotka.lava === start, 'lawa ruszyla przed 10. tura');
  nastepnaTura(krotka);
  assert(krotka.lava === start - 40, 'lawa od 10. tury nie o 40 px: ' + (start - krotka.lava));
  krotka.lava = 270;
  for (const w of krotka.worms) { w.y = 100; w.vy = 0; }   // żeby partia trwała
  nastepnaTura(krotka);
  assert(krotka.lava === 230, 'lawa stanela na dawnym limicie 260 px: ' + krotka.lava);
});

test('mapa wybrana w lobby: styl ze seeda zgadza sie z generatorem', () => {
  for (let seed = 1; seed < 400; seed += 37) {
    assert(T.stylMapy(seed) === T.createTerrain(seed).styl, 'inny styl dla seeda ' + seed);
  }
});

test('lina ninja: zaczepia o skale, buja, nie konczy tury, skok puszcza, zuzywa zapas', () => {
  const st = S.createGame(77, players(2), { sieciowa: true });
  const w = S.activeWorm(st);
  polka(st, w, 240);
  // sufit nad robalem: pas skały 150 px wyżej
  for (let x = w.x - 120; x <= w.x + 120; x++) for (let y = w.y - 170; y < w.y - 150; y++) st.terrain.mask[Math.round(y) * T.WORLD_W + Math.round(x)] = 1;
  st.weapon = 'lina';
  assert(!S.startCharging(st), 'lina da sie „wystrzelic” jak bron');
  S.ustawCelownik(st, -Math.PI / 2 + 0.5);        // w górę i w prawo
  const start = w.amunicja.lina;
  assert(S.linaPrzelacz(st) === 'zaczepiona' && w.lina, 'hak nie zaczepil sie o sufit');
  assert(w.amunicja.lina === start - 1, 'lina nie zuzyla zapasu');
  const d = () => Math.sqrt((w.x - w.lina.x) ** 2 + (w.y - S.WORM_H * 0.5 - w.lina.y) ** 2);
  st.input.right = true;
  run(st, 1.5);
  st.input.right = false;
  assert(w.lina && d() <= w.lina.dl + 1, 'robal oderwal sie od liny: ' + d().toFixed(1) + ' > ' + (w.lina && w.lina.dl));
  assert(st.phase === 'aim' && !st.firedThisTurn, 'lina zakonczyla ture');
  const dl = w.lina.dl;
  st.input.aimUp = true; run(st, 0.5); st.input.aimUp = false;
  assert(w.lina.dl < dl - 40, 'wciaganie liny nie dziala');
  S.jump(st);
  assert(!w.lina && !w.onGround, 'skok nie puscil liny');
  // w pasie i snapshocie liny nie ma
  S.linaPrzelacz(st);
  S.applyPas(st);
  assert(!w.lina, 'pas nie puscil liny');
  const nic = S.createGame(77, players(2), { sieciowa: true });
  S.ustawCelownik(nic, Math.PI / 2 - 0.01);     // w dół? zasięg kończy się pod ziemią — ale teren jest
  nic.weapon = 'lina';
  S.ustawCelownik(nic, -Math.PI / 2 + 0.05);
  const a = S.activeWorm(nic);
  for (let y = 0; y < a.y - 10; y++) for (let x = a.x - 40; x <= a.x + 60; x++) nic.terrain.mask[y * T.WORLD_W + Math.round(x)] = 0;
  assert(S.linaPrzelacz(nic) === 'pudlo' && !a.lina, 'hak zaczepil sie o powietrze');
});

test('Swiety GOAT: najwiekszy wybuch w grze, 1 sztuka', () => {
  const najwiekszy = Math.max(...WEAPON_ORDER.filter((b) => b !== 'swiety').map((b) => WEAPONS[b].radius || 0));
  assert(WEAPONS.swiety.radius > najwiekszy && WEAPONS.swiety.damage >= 90, 'Swiety GOAT nie jest najmocniejszy');
  const st = S.createGame(77, players(2));
  assert(st.worms[0].amunicja.swiety === 1, 'zapas Swietego GOAT-a: ' + st.worms[0].amunicja.swiety);
  const w = S.activeWorm(st);
  const wrog = st.worms.find((x) => x !== w);
  const hp = wrog.hp;
  S.explode(st, wrog.x, wrog.y - 10, WEAPONS.swiety);
  assert(hp - wrog.hp >= 70 || !wrog.alive, 'Swiety GOAT slabo bije: ' + (hp - wrog.hp));
});

test('stanPoTurze nie zmienia stanu zrodlowego', () => {
  const st = S.createGame(11, players(3), { sieciowa: true });
  S.applyPas(st);
  doKonca(st);
  const przed = S.stateHash(st);
  S.stanPoTurze(st, ['p1']);
  assert(S.stateHash(st) === przed, 'stanPoTurze zmienil stan');
});

console.log('\nDRUZYNY');

const druzynowi = (uklad) => uklad.map((d, i) => ({ id: 'p' + i, name: 'Gracz' + i, color: '#f60', druzyna: d }));

test('druzyny: wybuch nie rani i nie odrzuca kolegi, rani siebie i wroga', () => {
  const st = S.createGame(11, druzynowi([0, 0, 1]), { druzyny: true });
  st.turnPtr = st.order.indexOf('p0');
  const akt = S.activeWorm(st);
  const kolega = st.worms.find((w) => w !== akt && w.druzyna === akt.druzyna);
  const wrog = st.worms.find((w) => w.druzyna !== akt.druzyna);
  for (const w of [akt, kolega, wrog]) { w.x = 1000 + st.worms.indexOf(w) * 12; w.y = akt.y; w.vx = 0; w.vy = 0; }
  const hp = st.worms.map((w) => w.hp);
  S.explode(st, 1012, (akt.y - S.WORM_H * 0.5), WEAPONS.bazooka);
  assert(kolega.hp === hp[st.worms.indexOf(kolega)] && kolega.vx === 0 && kolega.vy === 0, 'kolega oberwal: hp ' + kolega.hp + ' vx ' + kolega.vx);
  assert(akt.hp < hp[st.worms.indexOf(akt)], 'strzelajacy nie rani sam siebie');
  assert(wrog.hp < hp[st.worms.indexOf(wrog)], 'wrog nie oberwal');
});

test('druzyny: tury na zmiane druzynami, w druzynie po kolei', () => {
  const st = S.createGame(5, druzynowi([0, 0, 0, 1]), { druzyny: true, sieciowa: true });
  const kto = [];
  for (let t = 0; t < 8; t++) {
    kto.push(S.activeWorm(st));
    const snap = przezSiec(S.stanPoTurze(st));
    S.zastosujSnapshot(st, snap);
  }
  for (let t = 1; t < kto.length; t++) assert(kto[t].druzyna !== kto[t - 1].druzyna, 'dwie tury z rzedu tej samej druzyny: ' + kto.map((w) => w.id).join(','));
  const zA = kto.filter((w) => w.druzyna === 0).map((w) => w.id);
  assert(new Set(zA.slice(0, 3)).size === 3, 'w druzynie nie po kolei: ' + zA.join(','));
  assert(zA[3] === zA[0], 'kolejka w druzynie nie wraca na poczatek: ' + zA.join(','));
});

test('druzyny: martwy gracz jest pomijany, ale druzyna dalej gra na zmiane', () => {
  const st = S.createGame(5, druzynowi([0, 0, 1, 1]), { druzyny: true, sieciowa: true });
  st.worms.find((w) => w.druzyna === 0 && w.id !== S.activeWorm(st).id).alive = false;
  const kto = [];
  for (let t = 0; t < 6; t++) { kto.push(S.activeWorm(st)); S.zastosujSnapshot(st, przezSiec(S.stanPoTurze(st))); }
  for (let t = 1; t < kto.length; t++) assert(kto[t].druzyna !== kto[t - 1].druzyna, 'dwie tury z rzedu tej samej druzyny');
  assert(kto.every((w) => w.alive), 'ture dostal martwy robal');
});

test('druzyny: wygrywa ostatnia druzyna, nawet z dwoma zywymi', () => {
  const st = S.createGame(11, druzynowi([0, 1, 0, 1]), { druzyny: true });
  for (const w of st.worms) if (w.druzyna === 1) w.alive = false;
  run(st, S.TURN_TIME + 7);
  assert(st.phase === 'over', 'faza to ' + st.phase);
  assert(st.worms.find((w) => w.id === st.winner).druzyna === 0, 'zly zwyciezca');
});

test('kilka robali: 1 robal = dawna kolejka, id i start jak przed 4.8', () => {
  const a = S.createGame(9, players(4), { sieciowa: true });
  const b = S.createGame(9, players(4), { sieciowa: true, ustawienia: { robale: 1 } });
  assert(JSON.stringify(a.order) === JSON.stringify(S.kolejnoscTur(9, players(4).map((p) => p.id))), 'inna kolejka');
  assert(S.stateHash(a) === S.stateHash(b), 'robale: 1 zmienia partie');
  assert(a.worms.every((w) => w.gracz === w.id && w.name === w.nick), 'zle pola robala');
});

test('kilka robali: 3 na gracza, druzyny na zmiane, gracze i robale po kolei', () => {
  const st = S.createGame(5, druzynowi([0, 0, 1]), { druzyny: true, sieciowa: true, ustawienia: { robale: 3 } });
  assert(st.worms.length === 9 && st.order.length === 9, 'robali: ' + st.worms.length);
  assert(new Set(st.worms.map((w) => w.id)).size === 9, 'powtorzone id');
  for (const w of st.worms) assert(T.solidAt(st.terrain, w.x, w.y + 2) || T.solidAt(st.terrain, w.x, w.y + 4), 'robal w powietrzu: ' + w.id);
  const kto = [];
  for (let t = 0; t < 12; t++) { kto.push(S.activeWorm(st)); S.zastosujSnapshot(st, przezSiec(S.stanPoTurze(st))); }
  for (let t = 1; t < kto.length; t++) assert(kto[t].druzyna !== kto[t - 1].druzyna, 'dwie tury z rzedu tej samej druzyny');
  const zA = kto.filter((w) => w.druzyna === 0);
  // w druzynie A (dwoch graczy po 3 robale): gracze na zmiane, kazdy kolejnym robalem
  for (let t = 1; t < zA.length; t++) assert(zA[t].gracz !== zA[t - 1].gracz, 'ten sam gracz dwa razy z rzedu: ' + zA.map((w) => w.id).join(','));
  assert(new Set(zA.map((w) => w.id)).size === 6, 'nie wszystkie robale druzyny A zagraly: ' + zA.map((w) => w.id).join(','));
  const zB = kto.filter((w) => w.druzyna === 1).map((w) => w.id);
  assert(new Set(zB.slice(0, 3)).size === 3 && zB[3] === zB[0], 'robale gracza B nie po kolei: ' + zB.join(','));
  assert(st.worms.filter((w) => w.gracz === 'p2').map((w) => w.name).join() === 'Gracz2 1,Gracz2 2,Gracz2 3', 'nazwy');
});

test('kilka robali: wspolna amunicja, snapshot gracza z tura, wygrywa gracz', () => {
  const st = S.createGame(7, players(2), { sieciowa: true, ustawienia: { robale: 2 } });
  const akt = S.activeWorm(st);
  const brat = st.worms.find((w) => w.gracz === akt.gracz && w !== akt);
  S.applyFire(st, { wormId: akt.id, weapon: 'dynamit', angle: 0, power: 0 });
  assert(brat.amunicja.dynamit === akt.amunicja.dynamit && akt.amunicja.dynamit === 1, 'amunicja nie jest wspolna');
  assert(S.snapshot(st).aktywny === akt.gracz, 'aktywny w snapshocie to nie gracz');
  S.usunGraczy(st, ['p1']);
  assert(st.worms.filter((w) => w.gracz === 'p1').every((w) => w.odszedl && !w.alive), 'usunGraczy nie usunal wszystkich robali');
  const snap = S.stanPoTurze(st);
  assert(snap.over && snap.winner === 'p0', 'zwyciezca: ' + snap.winner);
});

test('kazdy na kazdego: kolejnosc jak dawniej (nastepny zywy z kolejki)', () => {
  const st = S.createGame(9, players(4), { sieciowa: true });
  for (let t = 0; t < 8; t++) {
    const przed = st.turnPtr;
    S.zastosujSnapshot(st, przezSiec(S.stanPoTurze(st)));
    assert(st.turnPtr === (przed + 1) % 4, 'kolejnosc sie zmienila: ' + przed + ' -> ' + st.turnPtr);
  }
});

test('druzyny: pocisk przelatuje przez kolege', () => {
  const st = S.createGame(11, druzynowi([0, 0, 1]), { druzyny: true });
  st.turnPtr = st.order.indexOf('p0');
  const akt = S.activeWorm(st);
  const kolega = st.worms.find((w) => w !== akt && w.druzyna === akt.druzyna);
  // wolny korytarz w powietrzu i kolega na linii lotu
  for (let x = 560; x <= 900; x += 20) T.carve(st.terrain, x, 295, 34);
  akt.x = 600; akt.y = 300; kolega.x = 700; kolega.y = 305; kolega.alive = true;
  st.projectiles.push({ id: 99, weapon: 'bazooka', x: 640, y: 295, vx: 400, vy: 0, fuse: 0, ownerId: akt.id, krok: 0 });
  const hp = kolega.hp;
  for (let i = 0; i < 40; i++) S.step(st);
  assert(kolega.hp === hp, 'kolega trafiony pociskiem');
});

console.log('\nDETERMINIZM I SYNCHRONIZACJA');

/* Strzelec gra naprawdę (chodzi, skacze, strzela w locie), odbiorca dostaje
   tylko zdarzenie przez JSON. Po całym locie stany muszą być identyczne
   co do bitu — dla każdej broni. */
for (const bron of WEAPON_ORDER.filter((b) => !WEAPONS[b].narzedzie)) {   // lina to nie strzał
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
      if (bron === 'most') S.ustawCel(a, kto.x + (cel.x > kto.x ? 70 : -70), kto.y - 70);
      else if (WEAPONS[bron].celowany) S.ustawCel(a, cel.x, cel.y);
      if (bron === 'kij') S.activeWorm(a).amunicja.kij = 1;
      S.ustawCelownik(a, Math.atan2(-0.8, cel.x > kto.x ? 1 : -1));
      assert(S.startCharging(a), 'nie da sie strzelic: ' + bron);
      run(a, 0.5);
      S.releaseFire(a);
      // strzał wychodzi od razu, 5 s ruchu po nim leci paczkami: bieg, skok, bieg z powrotem
      assert(a.phase === 'odwrot' && a.akcjeDoWyslania.length === 1, 'strzal bez fazy ruchu: ' + bron);
      S.zastosujStrzal(b, przezSiec(a.akcjeDoWyslania[0]));
      assert(S.czekaNaOdwrot(b), 'odbiorca nie czeka na ruchy ucieczki');
      let wyslane = 0;
      const paczka = (koniec) => {
        const bity = S.rozwinOdwrot(przezSiec(S.zwinOdwrot(a.odwrotNagranie.slice(wyslane))));
        wyslane = a.odwrotNagranie.length;
        S.dopiszOdwrot(b, bity, koniec);
        while (!S.czekaNaOdwrot(b) && b.phase === 'odwrot') S.step(b);   // odbiorca gra, ile może
      };
      const krok = (sek) => { for (let i = 0; i < sek / S.DT; i++) { S.step(a); if (i % 13 === 0) paczka(false); } };
      a.input.left = true; krok(1.2);
      a.input.left = false; S.jump(a); krok(0.6);
      a.input.right = true; krok(0.8);
      a.input.right = false;
      for (let i = 0; i < 2000 && a.phase === 'odwrot'; i++) S.step(a);
      paczka(true);
      assert(a.akcjeDoWyslania.length === 1, 'ucieczka dolozyla akcje');
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
  otworzNiebo(st, wrog);
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

console.log('\nMUZYKA');

test('muzyka: 7 utworow po 1,5-3 min, nuty w zakresie, kazdy instrument ma brzmienie, zawsze te same nuty', () => {
  const zrodlo = readFileSync(new URL('../src/dzwieki.js', import.meta.url), 'utf8');
  assert(M.UTWORY.length >= 7, 'utworow: ' + M.UTWORY.length);
  assert(new Set(M.UTWORY.map((u) => u.nazwa)).size === M.UTWORY.length, 'powtorzone nazwy');
  for (const def of M.UTWORY) {
    const u = M.zbudujUtwor(def);
    const sek = M.czasUtworu(u);
    assert(sek >= 80 && sek <= 200, def.id + ': ' + Math.round(sek) + ' s');
    const instr = new Set();
    let melodia = 0;
    for (const k of u.kroki) for (const [i, m, dl, gl] of k || []) {
      instr.add(i);
      assert(Number.isFinite(m) && dl > 0 && gl > 0 && gl <= 1, def.id + ': zla nuta ' + JSON.stringify([i, m, dl, gl]));
      if (m) assert(m >= 28 && m <= 100, def.id + ': nuta poza zakresem ' + m);
      if (i === def.brzmienie.melodia) melodia++;
    }
    assert(melodia >= 40, def.id + ': za malo melodii: ' + melodia);
    for (const i of instr) assert(new RegExp('\\b' + i + '[:(]').test(zrodlo), def.id + ': brak brzmienia „' + i + '” w dzwieki.js');
    assert(JSON.stringify(M.zbudujUtwor(def)) === JSON.stringify(u), def.id + ': rozne nuty przy drugim skladaniu');
  }
});

console.log('\nKAMERA');

test('oddalanie nie rzuca kamera na srodek mapy — granice zmieniaja sie plynnie', () => {
  // Robal przy lewym brzegu, ekran 1280×800. Zoom schodzi przez próg, przy którym
  // widok robi się szerszy od mapy — dawniej kamera skakała tam o ~380 px w jednej klatce.
  const cam = R.createCamera();
  cam.x = cam.tx = 300; cam.y = cam.ty = 600; cam.zoom = cam.tzoom = 1.1;
  let poprz = null, maks = 0;
  for (let i = 0; i < 400; i++) {
    cam.tx = 300; cam.ty = 600;                       // śledzenie robala co klatkę, jak w main.js
    cam.tzoom = Math.max(0.35, 1.1 - i * 0.004);
    R.updateCamera(cam, 1 / 60, 1280, 800, 60);
    if (poprz !== null) maks = Math.max(maks, Math.abs(cam.x - poprz));
    poprz = cam.x;
  }
  assert(maks < 20, 'kamera skoczyla o ' + maks.toFixed(1) + ' px w jednej klatce');
  assert(Math.abs(cam.x - T.WORLD_W / 2) < 1, 'przy calej mapie w kadrze kamera nie stoi na srodku: ' + cam.x);
  // przy zwykłym zoomie kamera trzyma robala (granica nie przeszkadza)
  const c2 = R.createCamera();
  c2.x = c2.tx = 900; c2.zoom = c2.tzoom = 1;
  R.updateCamera(c2, 1 / 60, 1280, 800, 60);
  assert(c2.x === 900, 'kamera nie trzyma robala przy zwyklym zoomie: ' + c2.x);
});

console.log('\n' + (failed === 0
  ? '\x1b[32mWszystkie testy przeszly (' + passed + ')\x1b[0m'
  : '\x1b[31m' + failed + ' bledow, ' + passed + ' ok\x1b[0m') + '\n');

process.exit(failed === 0 ? 0 : 1);
