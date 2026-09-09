/* Spięcie: ekrany, pętla gry, HUD.
   Symulacja chodzi stałym krokiem, rysowanie tak szybko, jak zdąży. */

import * as S from './sim.js';
import * as T from './terrain.js';
import * as R from './render.js';
import { createFx, stepFx, emitExplosion, emitTrail, emitSpark } from './fx.js';
import { attachInput } from './input.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';

const KOLORY = ['#ff7a1e', '#4ea3ff', '#5ec26a', '#e04fd0'];

const el = (id) => document.getElementById(id);
const plotno = el('plotno');
const hud = el('hud');
const ekranStart = el('ekran-start');
const ekranKoniec = el('ekran-koniec');

let renderer = null;
let kamera = null;
let fx = null;
let state = null;
let sterowanie = null;
let dpr = 1;
let akumulator = 0;
let ostatniCzas = 0;

const gracze = [];

/* ---------- rozmiar płótna ---------- */

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

function bazowyZoom() {
  const z = renderer.viewW / 1150;
  return Math.max(0.45, Math.min(1.5, z));
}

/* ---------- ekran startowy ---------- */

function odswiezListe() {
  const lista = el('lista-graczy');
  lista.replaceChildren();

  gracze.forEach((g, i) => {
    const li = document.createElement('li');

    const kropka = document.createElement('span');
    kropka.className = 'kropka';
    kropka.style.background = g.color;

    const imie = document.createElement('span');
    imie.className = 'imie';
    imie.textContent = g.name;

    const usun = document.createElement('button');
    usun.textContent = 'usuń';
    usun.addEventListener('click', () => { gracze.splice(i, 1); odswiezListe(); });

    li.append(kropka, imie, usun);
    lista.append(li);
  });

  el('btn-start').disabled = gracze.length < 2;
  el('btn-dodaj').disabled = gracze.length >= KOLORY.length;
  el('info-start').textContent = gracze.length < 2
    ? 'Dodaj od 2 do 4 graczy (na razie na jednym ekranie).'
    : gracze.length + ' graczy gotowych. Można zaczynać.';
}

function dodajGracza() {
  const input = el('input-nazwa');
  const nazwa = input.value.trim().slice(0, 14);
  if (!nazwa || gracze.length >= KOLORY.length) return;
  if (gracze.some((g) => g.name.toLowerCase() === nazwa.toLowerCase())) {
    input.value = '';
    return;
  }
  gracze.push({ id: 'g' + gracze.length + '_' + Date.now(), name: nazwa, color: KOLORY[gracze.length] });
  input.value = '';
  input.focus();
  odswiezListe();
}

el('btn-dodaj').addEventListener('click', dodajGracza);
el('input-nazwa').addEventListener('keydown', (e) => { if (e.key === 'Enter') dodajGracza(); });
el('btn-start').addEventListener('click', () => startGry());
el('btn-znowu').addEventListener('click', () => {
  ekranKoniec.hidden = true;
  ekranStart.hidden = false;
  hud.hidden = true;
  state = null;
});

/* ---------- start gry ---------- */

function startGry() {
  const seed = (Math.random() * 0xffffffff) >>> 0;   // seed losujemy raz, dalej wszystko jest z niego
  state = S.createGame(seed, gracze.map((g) => ({ id: g.id, name: g.name, color: g.color })));

  renderer = R.createRenderer(plotno);
  dopasujPlotno();
  R.buildTerrain(renderer, state.terrain);

  kamera = R.createCamera();
  fx = createFx();

  if (!sterowanie) sterowanie = attachInput(() => state, { onWeaponChange: rysujBronie });

  ekranStart.hidden = true;
  ekranKoniec.hidden = true;
  hud.hidden = false;

  rysujBronie();
  const w = S.activeWorm(state);
  if (w) { kamera.x = w.x; kamera.y = w.y - 40; }
  kamera.zoom = kamera.tzoom = bazowyZoom();

  akumulator = 0;
  ostatniCzas = performance.now();
  requestAnimationFrame(petla);
}

/* ---------- pętla ---------- */

function petla(teraz) {
  if (!state) return;
  requestAnimationFrame(petla);

  let dt = (teraz - ostatniCzas) / 1000;
  ostatniCzas = teraz;
  if (dt > 0.25) dt = 0.25;      // po powrocie z tła nie nadrabiamy sekund naraz

  sterowanie.apply();

  akumulator += dt;
  let kroki = 0;
  while (akumulator >= S.DT && kroki < 600) {
    S.step(state);
    akumulator -= S.DT;
    kroki++;
  }

  obsluzZdarzenia();

  for (const p of state.projectiles) {
    if (WEAPONS[p.weapon].kind === 'pocisk') emitTrail(fx, p.x, p.y);
  }

  ustawKamere();
  R.updateCamera(kamera, dt, renderer.viewW, renderer.viewH);
  stepFx(fx, dt);

  const ctx = renderer.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  R.draw(renderer, state, kamera, fx, dt);

  odswiezHud();
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
      case 'strzal':
        emitSpark(fx, e.x, e.y, 14);
        break;
      case 'odbicie':
        emitSpark(fx, e.x, e.y, 5);
        break;
      case 'plusk':
        emitSpark(fx, e.x, e.y, 18);
        break;
      case 'koniec':
        pokazKoniec(e.winner);
        break;
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
  ekranKoniec.hidden = false;
  hud.hidden = true;
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

let ostatniaBron = null;
let ostatniaTura = -1;

function odswiezHud() {
  const akt = S.activeWorm(state);

  if (state.weapon !== ostatniaBron) { ostatniaBron = state.weapon; rysujBronie(); }

  if (state.turnNumber !== ostatniaTura) {
    ostatniaTura = state.turnNumber;
    const panel = el('panel-gracze');
    panel.replaceChildren();
    for (const w of state.worms) {
      const d = document.createElement('div');
      d.className = 'gracz' + (w.alive ? '' : ' trup');
      d.dataset.worm = w.id;

      const kropka = document.createElement('span');
      kropka.className = 'kropka';
      kropka.style.background = w.color;

      const imie = document.createElement('span');
      imie.className = 'imie';
      imie.textContent = w.name;

      const hp = document.createElement('span');
      hp.className = 'hp';
      hp.textContent = w.hp;

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

  el('tura-kto').textContent = akt ? akt.name : '—';
  const sek = Math.max(0, Math.ceil(state.turnTimeLeft));
  const zegar = el('tura-czas');
  zegar.textContent = state.phase === 'aim' ? sek : '–';
  zegar.classList.toggle('malo', state.phase === 'aim' && sek <= 5);

  const wiatr = state.wind;
  const slup = el('wiatr-slup');
  const proc = Math.min(50, (Math.abs(wiatr) / 130) * 50);
  slup.style.left = wiatr >= 0 ? '50%' : (50 - proc) + '%';
  slup.style.width = proc + '%';
  el('wiatr-txt').textContent = (wiatr >= 0 ? '→ ' : '← ') + Math.abs(Math.round(wiatr));

  el('moc-wypelnienie').style.width = (state.power * 100).toFixed(0) + '%';
}

odswiezListe();
