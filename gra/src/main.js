/* Spięcie: tożsamość, lobby, pętla gry, HUD.

   Zasada podziału ról: turę prowadzi wyłącznie jej właściciel i to on
   publikuje wynik. Pozostali odtwarzają go u siebie dla animacji, a potem
   porównują hash stanu z opublikowanym — jeśli się rozjechał, biorą
   snapshot. Deterministycznie gdy działa, samonaprawialnie gdy nie. */

import * as S from './sim.js';
import * as R from './render.js';
import { createFx, stepFx, emitExplosion, emitTrail, emitSpark } from './fx.js';
import { attachInput } from './input.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { createNet, zloz } from './net.js';

const KOLORY = ['#ff7a1e', '#4ea3ff', '#5ec26a', '#e04fd0', '#ffd93b', '#9b8cff'];
const ODLICZANIE = 20;

const el = (id) => document.getElementById(id);
const plotno = el('plotno');
const hud = el('hud');

let mojeId = null, mojaNazwa = '', mojKolor = KOLORY[0];
let net = null, pokoj = null;
let renderer = null, kamera = null, fx = null, state = null, sterowanie = null;
let dpr = 1, akumulator = 0, ostatniCzas = 0, petlaDziala = false;

let obserwator = false;
let gospodarz = false;
let startWToku = false;
/* odswiezLobby() chodzi co 500 ms, a stan z sieci przychodzi co ~3 s.
   Bez tych blokad kazda "samoleczaca" wysylka (zgloszenie siebie, publikacja
   odliczania) powtarzalaby sie kilkanascie razy, zanim odpowiedz zdazy wrocic
   — czyli zalew POST-ow i limit zapytan. */
const PONOW_PO = 6000;
let ostatnieZgloszenie = 0;
let ostatnieOdliczanie = 0;
let turaOdkad = 0;              // czas serwera, gdy zauwazylismy biezaca ture
let ostatniNrPilnowanej = -1;
const LIMIT_TURY_MS = (S.TURN_TIME + 12) * 1000;
let oczekujaceStany = new Map();   // nr tury -> { snap, hash }
let skorygowane = new Set();
let opublikowaneStany = new Set();
let zastosowaneTury = new Set();
let poprzedniaTura = -1;
let strzelilemWTurze = -1;

/* ---------- tożsamość ---------- */

function wczytajId() {
  try {
    let id = localStorage.getItem('arena:id');
    if (!id) {
      id = 'g' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('arena:id', id);
    }
    return id;
  } catch {
    return 'g' + Math.random().toString(36).slice(2, 10);   // tryb prywatny
  }
}

function zapamietajNazwe(n) {
  try { localStorage.setItem('arena:nazwa', n); } catch { /* nieistotne */ }
}

/* ---------- płótno ---------- */

function dopasujPlotno() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  plotno.width = Math.round(w * dpr);
  plotno.height = Math.round(h * dpr);
  plotno.style.width = w + 'px';
  plotno.style.height = h + 'px';
  if (renderer) { renderer.viewW = w; renderer.viewH = h; }
}
window.addEventListener('resize', dopasujPlotno, { passive: true });

const bazowyZoom = () => Math.max(0.45, Math.min(1.5, renderer.viewW / 1150));

/* ---------- ekran nazwy ---------- */

const inputNazwa = el('input-nazwa');
const btnWejdz = el('btn-wejdz');

try {
  const zapisana = localStorage.getItem('arena:nazwa');
  if (zapisana) inputNazwa.value = zapisana;
} catch { /* nieistotne */ }

function sprawdzNazwe() { btnWejdz.disabled = inputNazwa.value.trim().length < 2; }
inputNazwa.addEventListener('input', sprawdzNazwe);
inputNazwa.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !btnWejdz.disabled) wejdz(); });
btnWejdz.addEventListener('click', wejdz);
sprawdzNazwe();

async function wejdz() {
  mojaNazwa = inputNazwa.value.trim().slice(0, 14);
  if (mojaNazwa.length < 2) return;
  zapamietajNazwe(mojaNazwa);
  mojeId = wczytajId();
  mojKolor = KOLORY[Math.abs(hashTekstu(mojeId)) % KOLORY.length];

  btnWejdz.disabled = true;
  el('info-nazwa').textContent = 'Łączę z lobby…';

  net = createNet({
    id: mojeId,
    onZdarzenie: naZdarzenie,
    onStan: naStanSieci,
    onReset: naResetLogu,
    onBlad: naBladSieci
  });
  net.start();

  await net.wyslij({ t: 'dolacz', id: mojeId, name: mojaNazwa, color: mojKolor });
  await net.pobierz();

  el('ekran-nazwa').hidden = true;
  // Jesli wlasnie dolaczylismy do trwajacej partii, zbudujGre() juz pokazalo
  // plansze — nie zaslaniamy jej lobby.
  if (!state) el('ekran-lobby').hidden = false;
}

function hashTekstu(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/* ---------- sieć ---------- */

function naBladSieci(wiadomosc) {
  const baner = el('baner-blad');
  if (baner) {
    baner.hidden = false;
    baner.textContent = net && net.brakKonfiguracji
      ? 'Serwer lobby nie jest skonfigurowany (brak Upstash). Gra offline niedostępna.'
      : 'Problem z połączeniem: ' + wiadomosc;
  }
  el('info-nazwa').textContent = wiadomosc;
  el('info-lobby').textContent = wiadomosc;
}

function naResetLogu() {
  pokoj = null;
  zastosowaneTury.clear();
  oczekujaceStany.clear();
  skorygowane.clear();
  opublikowaneStany.clear();
}

/* Czy trwajaca partia ma jeszcze zywego uczestnika. Bez tego sprawdzenia
   porzucona gra zostaje w logu na zawsze i blokuje zakladanie nowych. */
function partiaWToku() {
  if (!pokoj || pokoj.faza !== 'gra' || !pokoj.gracze.length) return false;
  const zywi = net.zywi();
  return pokoj.gracze.some((g) => zywi.has(g.id) || g.id === mojeId);
}

function naStanSieci() {
  pokoj = zloz(net.zdarzenia);
  const baner = el('baner-blad');
  if (baner && net.polaczony) baner.hidden = true;

  if (partiaWToku() && !state) zbudujGre();
  if (!partiaWToku() && state && pokoj.faza !== 'gra') zakonczDoLobby();
  odswiezLobby();
}

function naZdarzenie(z) {
  if (z.t === 'nowa') {
    naResetLogu();
    pokoj = zloz(net.zdarzenia);
    zbudujGre();
    return;
  }
  if (!state) return;

  if (z.t === 'strzal' && z.nr === state.turnNumber && !zastosowaneTury.has(z.nr)) {
    zastosowaneTury.add(z.nr);
    const w = state.worms.find((x) => x.id === z.wormId);
    if (w) { w.x = z.x; w.y = z.y; w.facing = z.facing; w.onGround = true; w.vx = 0; w.vy = 0; }
    state.weapon = z.weapon;
    S.applyFire(state, { wormId: z.wormId, weapon: z.weapon, angle: z.angle, power: z.power });
  } else if (z.t === 'pas' && z.nr === state.turnNumber && !zastosowaneTury.has(z.nr)) {
    zastosowaneTury.add(z.nr);
    S.applyPas(state);
  } else if (z.t === 'stan') {
    oczekujaceStany.set(z.nr, { snap: z.snap, hash: z.hash });
  }
}

/* ---------- lobby ---------- */

function odswiezLobby() {
  if (!pokoj || el('ekran-lobby').hidden) return;

  const zywi = net.zywi();
  const obecni = pokoj.wLobby.filter((g) => zywi.has(g.id) || g.id === mojeId);

  // Samoleczenie: jeśli po resecie logu nie ma nas na liście, zgłaszamy się
  // ponownie — ale nie częściej niż raz na PONOW_PO, bo odpowiedź i tak
  // dotrze dopiero przy kolejnym odpytaniu.
  const teraz = Date.now();
  if (!pokoj.wLobby.some((g) => g.id === mojeId) && teraz - ostatnieZgloszenie > PONOW_PO) {
    ostatnieZgloszenie = teraz;
    net.wyslij({ t: 'dolacz', id: mojeId, name: mojaNazwa, color: mojKolor });
  }

  // Gospodarzem jest obecny gracz o najmniejszym id — bez uzgadniania,
  // każdy klient wylicza to samo.
  const idki = obecni.map((g) => g.id).sort();
  gospodarz = idki.length > 0 && idki[0] === mojeId;

  const lista = el('lista-graczy');
  lista.replaceChildren();
  for (const g of obecni) {
    const li = document.createElement('li');
    if (g.id === mojeId) li.classList.add('ja');

    const kropka = document.createElement('span');
    kropka.className = 'kropka';
    kropka.style.background = g.color;

    const imie = document.createElement('span');
    imie.className = 'imie';
    imie.textContent = g.name;

    li.append(kropka, imie);
    if (g.id === idki[0]) {
      const z = document.createElement('span');
      z.className = 'znacznik';
      z.textContent = 'GOSPODARZ';
      li.append(z);
    }
    if (g.id === mojeId) {
      const z = document.createElement('span');
      z.className = 'znacznik';
      z.textContent = 'TY';
      li.append(z);
    }
    lista.append(li);
  }

  el('lobby-podtytul').textContent = obecni.length < 2
    ? 'Czekamy na drugiego gracza…'
    : obecni.length + ' graczy w lobby.';

  // Termin startu zyje we wspolnym logu i w czasie SERWERA. Wczesniej kazdy
  // klient odliczal wlasne 20 s od chwili, w ktorej SAM zauwazyl drugiego
  // gracza — stad rozne odliczania na kazdym ekranie.
  const wToku = partiaWToku();
  // Termin z dawno zamknietej sesji lobby zignoruj — inaczej gra startuje
  // natychmiast po wejsciu, bo licznik "juz doszedl do zera".
  let termin = pokoj.odliczanieDo;
  if (termin !== null && net.czas() - termin > 60000) termin = null;
  if (gospodarz && !startWToku && !wToku && teraz - ostatnieOdliczanie > PONOW_PO) {
    // Po publikacji dociagamy log od razu — inaczej gospodarz przez cale
    // odpytanie (~3 s) nie widzi wlasnego odliczania, choc reszta juz je ma.
    if (obecni.length >= 2 && termin === null) {
      ostatnieOdliczanie = teraz;
      net.wyslij({ t: 'odliczanie', do: net.czas() + ODLICZANIE * 1000 })
        .then(() => net.pobierz());
    } else if (obecni.length < 2 && termin !== null) {
      ostatnieOdliczanie = teraz;
      net.wyslij({ t: 'odliczanie', anuluj: true }).then(() => net.pobierz());
    }
  }

  const box = el('odliczanie');
  if (termin !== null && obecni.length >= 2) {
    box.hidden = false;
    const sek = Math.max(0, Math.ceil((termin - net.czas()) / 1000));
    el('odliczanie-sek').textContent = sek;
    // Probowac moze kazdy — o tym, kto faktycznie zaklada partie,
    // rozstrzyga zamek po stronie serwera.
    if (sek === 0 && !wToku) startPartii(obecni);
  } else {
    box.hidden = true;
  }

  el('btn-start').disabled = obecni.length < 2;
  el('info-lobby').textContent = 'Każdy może przyspieszyć start.';
}

el('btn-start').addEventListener('click', async () => {
  el('btn-start').disabled = true;
  await net.wyslij({ t: 'odliczanie', do: net.czas() + 800 });
  await net.pobierz();
  odswiezLobby();
});

el('btn-znowu').addEventListener('click', () => {
  el('ekran-koniec').hidden = true;
  el('ekran-lobby').hidden = false;
  hud.hidden = true;
  state = null;
  net.ustawTryb('lobby');
  net.wyslij({ t: 'dolacz', id: mojeId, name: mojaNazwa, color: mojKolor });
});

async function startPartii(obecni) {
  if (startWToku) return;
  startWToku = true;
  try {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    // Jesli ktos nas ubiegl, serwer odpowie { ok: false } i niczego nie zaklada —
    // partie i tak dostaniemy zdarzeniem 'nowa'.
    await net.wyslij({
      t: 'nowa',
      seed,
      gracze: obecni.slice(0, 6).map((g) => ({ id: g.id, name: g.name, color: g.color }))
    });
    await net.pobierz();
  } finally {
    setTimeout(function () { startWToku = false; }, 4000);
  }
}

/* ---------- gra ---------- */

function zbudujGre() {
  if (!pokoj || pokoj.faza !== 'gra' || !pokoj.gracze.length) return;

  state = S.createGame(pokoj.seed, pokoj.gracze);
  obserwator = !pokoj.gracze.some((g) => g.id === mojeId);

  zastosowaneTury.clear();
  oczekujaceStany.clear();
  skorygowane.clear();
  opublikowaneStany.clear();
  poprzedniaTura = -1;
  strzelilemWTurze = -1;

  // Dołączenie w trakcie: zamiast odtwarzać całą partię bierzemy najnowszy
  // snapshot — po to jest w stanie kanonicznym.
  let najnowszy = null, najwyzszyNr = -1;
  for (const [nr, t] of pokoj.tury) {
    if (t.stan && nr > najwyzszyNr) { najwyzszyNr = nr; najnowszy = t.stan; }
  }
  if (najnowszy) {
    S.applySnapshot(state, najnowszy);
    for (let i = 0; i <= najwyzszyNr; i++) zastosowaneTury.add(i);
  }

  renderer = R.createRenderer(plotno);
  dopasujPlotno();
  R.buildTerrain(renderer, state.terrain);
  kamera = R.createCamera();
  fx = createFx();

  if (!sterowanie) {
    sterowanie = attachInput(() => state, {
      mojeId,
      onFire: opublikujStrzal,
      onWeaponChange: rysujBronie
    });
  }

  el('ekran-nazwa').hidden = true;
  el('ekran-lobby').hidden = true;
  el('ekran-koniec').hidden = true;
  hud.hidden = false;
  el('baner-obserwator').hidden = !obserwator;

  rysujBronie();
  const w = S.activeWorm(state);
  if (w) { kamera.x = w.x; kamera.y = w.y - 40; }
  kamera.zoom = kamera.tzoom = bazowyZoom();

  akumulator = 0;
  ostatniCzas = performance.now();
  if (!petlaDziala) { petlaDziala = true; requestAnimationFrame(petla); }
}

function opublikujStrzal(akcja) {
  const w = state.worms.find((x) => x.id === akcja.wormId);
  if (!w) return;
  strzelilemWTurze = state.turnNumber;
  zastosowaneTury.add(state.turnNumber);
  net.wyslij({
    t: 'strzal',
    nr: state.turnNumber,
    wormId: akcja.wormId,
    weapon: akcja.weapon,
    angle: akcja.angle,
    power: akcja.power,
    x: Math.round(w.x),
    y: Math.round(w.y),
    facing: w.facing
  });
  net.obudz();
}

function zakonczDoLobby() {
  state = null;
  hud.hidden = true;
  el('ekran-lobby').hidden = false;
}

/* ---------- pętla ---------- */

function petla(teraz) {
  requestAnimationFrame(petla);
  if (!state) return;

  let dt = (teraz - ostatniCzas) / 1000;
  ostatniCzas = teraz;
  if (dt > 0.25) dt = 0.25;

  const akt = S.activeWorm(state);
  const mojaTura = !!akt && akt.id === mojeId && !obserwator;
  state.zdalna = !mojaTura;
  net.ustawTryb(mojaTura ? 'mojaTura' : 'cudzaTura');

  sterowanie.apply();

  akumulator += dt;
  let kroki = 0;
  while (akumulator >= S.DT && kroki < 600) { S.step(state); akumulator -= S.DT; kroki++; }

  obsluzZdarzenia();
  obsluzPrzejscieTury(mojaTura);
  pilnujTury(mojaTura);

  for (const p of state.projectiles) {
    if (WEAPONS[p.weapon].kind === 'pocisk') emitTrail(fx, p.x, p.y);
  }

  ustawKamere();
  R.updateCamera(kamera, dt, renderer.viewW, renderer.viewH);
  stepFx(fx, dt);

  renderer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  R.draw(renderer, state, kamera, fx, dt);
  odswiezHud(akt, mojaTura);
}

/* Gracz prowadzacy ture moze zamknac karte albo stracic siec. Bez tego
   reszta czekalaby na jego zdarzenie w nieskonczonosc, bo ma zamrozony
   wlasny licznik tury. Po przekroczeniu terminu ture oddaje ktokolwiek —
   skladanie logu i tak bierze pierwszy 'pas'. */
function pilnujTury(mojaTura) {
  if (state.turnNumber !== ostatniNrPilnowanej) {
    ostatniNrPilnowanej = state.turnNumber;
    turaOdkad = net.czas();
    return;
  }
  if (mojaTura || state.phase !== 'aim') return;
  if (zastosowaneTury.has(state.turnNumber)) return;
  if (net.czas() - turaOdkad < LIMIT_TURY_MS) return;

  zastosowaneTury.add(state.turnNumber);
  net.wyslij({ t: 'pas', nr: state.turnNumber, id: mojeId, powod: 'brak-odpowiedzi' });
  S.applyPas(state);
}

/* Po zamknięciu tury: gracz, który ją prowadził, publikuje stan końcowy;
   reszta porównuje hash i koryguje się tylko wtedy, gdy faktycznie się rozjechała. */
function obsluzPrzejscieTury(mojaTura) {
  if (state.turnNumber === poprzedniaTura) return;
  const zamknieta = poprzedniaTura;
  poprzedniaTura = state.turnNumber;
  if (zamknieta < 0) return;

  if (strzelilemWTurze === zamknieta || (mojaTura && !zastosowaneTury.has(zamknieta))) {
    if (!opublikowaneStany.has(zamknieta)) {
      opublikowaneStany.add(zamknieta);
      if (strzelilemWTurze !== zamknieta) net.wyslij({ t: 'pas', nr: zamknieta, id: mojeId });
      net.wyslij({ t: 'stan', nr: zamknieta, snap: S.snapshot(state), hash: S.stateHash(state) });
    }
  }

  const oczekujacy = oczekujaceStany.get(zamknieta);
  if (oczekujacy && !skorygowane.has(zamknieta)) {
    skorygowane.add(zamknieta);
    if (oczekujacy.hash !== S.stateHash(state)) {
      S.applySnapshot(state, oczekujacy.snap);
      R.buildTerrain(renderer, state.terrain);   // po korekcie teren trzeba przemalować w całości
    }
  }
}

function ustawKamere() {
  const z = bazowyZoom();
  if (state.projectiles.length > 0) {
    const p = state.projectiles[0];
    R.focusCamera(kamera, p.x, p.y, z * 0.92);
  } else {
    const w = S.activeWorm(state);
    if (w) R.focusCamera(kamera, w.x, w.y - 40, z);
  }
}

function obsluzZdarzenia() {
  for (const e of state.events) {
    switch (e.type) {
      case 'wybuch':
        emitExplosion(fx, e.x, e.y, e.r);
        R.repaintRect(renderer, state.terrain, { x0: e.x - e.r - 3, x1: e.x + e.r + 3 });
        break;
      case 'strzal': emitSpark(fx, e.x, e.y, 14); break;
      case 'odbicie': emitSpark(fx, e.x, e.y, 5); break;
      case 'plusk': emitSpark(fx, e.x, e.y, 18); break;
      case 'koniec': pokazKoniec(e.winner); break;
    }
  }
  state.events.length = 0;
}

function pokazKoniec(winnerId) {
  const w = state.worms.find((x) => x.id === winnerId);
  el('koniec-tytul').textContent = w ? 'WYGRYWA ' + w.name.toUpperCase() : 'REMIS';
  el('koniec-opis').textContent = w
    ? 'Ostatni GOAT na arenie. Reszta poszła z dymem.'
    : 'Nikt nie przeżył. Bywa.';
  el('ekran-koniec').hidden = false;
  hud.hidden = true;
  if (gospodarz) net.wyslij({ t: 'koniec', winner: winnerId });
}

/* ---------- HUD ---------- */

function rysujBronie() {
  const box = el('bronie');
  box.replaceChildren();
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    const d = document.createElement('div');
    d.className = 'bron' + (state && state.weapon === id ? ' wybrana' : '');
    const k = document.createElement('span');
    k.className = 'klawisz';
    k.textContent = w.key;
    const n = document.createElement('span');
    n.textContent = w.name;
    d.append(k, n);
    box.append(d);
  }
}

let ostatniaBron = null, ostatniaTuraHud = -1;

function odswiezHud(akt, mojaTura) {
  if (state.weapon !== ostatniaBron) { ostatniaBron = state.weapon; rysujBronie(); }

  if (state.turnNumber !== ostatniaTuraHud) {
    ostatniaTuraHud = state.turnNumber;
    const panel = el('panel-gracze');
    panel.replaceChildren();
    for (const w of state.worms) {
      const d = document.createElement('div');
      d.className = 'gracz';
      d.dataset.worm = w.id;
      const kropka = document.createElement('span');
      kropka.className = 'kropka';
      kropka.style.background = w.color;
      const imie = document.createElement('span');
      imie.className = 'imie';
      imie.textContent = w.name + (w.id === mojeId ? ' (Ty)' : '');
      const hp = document.createElement('span');
      hp.className = 'hp';
      d.append(kropka, imie, hp);
      panel.append(d);
    }
  }

  for (const w of state.worms) {
    const row = document.querySelector('.gracz[data-worm="' + w.id + '"]');
    if (!row) continue;
    row.querySelector('.hp').textContent = w.hp;
    row.classList.toggle('trup', !w.alive);
    row.classList.toggle('aktywny', !!akt && akt.id === w.id);
  }

  el('tura-kto').textContent = akt ? (mojaTura ? 'TWOJA TURA' : akt.name) : '—';
  // Przy cudzej turze licznik w symulacji jest zamrozony, wiec czas liczymy
  // od chwili jej zaobserwowania — inaczej wszyscy widzieliby '…'.
  const sek = mojaTura
    ? Math.max(0, Math.ceil(state.turnTimeLeft))
    : Math.max(0, Math.ceil(S.TURN_TIME - (net.czas() - turaOdkad) / 1000));
  const zegar = el('tura-czas');
  zegar.textContent = state.phase !== 'aim' ? '–' : sek;
  zegar.classList.toggle('malo', state.phase === 'aim' && sek <= 5);

  const slup = el('wiatr-slup');
  const proc = Math.min(50, (Math.abs(state.wind) / 130) * 50);
  slup.style.left = state.wind >= 0 ? '50%' : (50 - proc) + '%';
  slup.style.width = proc + '%';
  el('wiatr-txt').textContent = (state.wind >= 0 ? '→ ' : '← ') + Math.abs(Math.round(state.wind));

  el('moc-wypelnienie').style.width = (state.power * 100).toFixed(0) + '%';
}

setInterval(() => { if (!el('ekran-lobby').hidden) odswiezLobby(); }, 500);

/* Podglad stanu do diagnostyki (konsola przegladarki: __arena()).
   Tylko do odczytu — nic tu nie zmienia przebiegu gry. */
window.__arena = () => ({
  mojeId, gospodarz, obserwator, startWToku,
  faza: pokoj && pokoj.faza,
  odliczanieDo: pokoj && pokoj.odliczanieDo,
  wLobby: pokoj ? pokoj.wLobby.map((g) => g.name) : null,
  gracze: pokoj ? pokoj.gracze.map((g) => g.name) : null,
  kursor: net && net.kursor,
  dlugoscLogu: net && net.dlugosc,
  obecnosc: net && Object.keys(net.obecnosc || {}),
  przesuniecieZegara: net && net.przesuniecieZegara,
  czasSerwera: net && net.czas()
});
