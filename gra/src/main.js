/* Spięcie: tożsamość, lobby, pętla gry, HUD.

   Cała logika partii (czyja tura, co jest kanoniczne, kto wypadł, kiedy
   oddać turę za nieobecnego) siedzi w protokol.js i jest przetestowana
   w Node. Tutaj tylko podpinamy ją do sieci, sterowania i ekranu. */

import * as S from './sim.js';
import * as P from './protokol.js';
import * as R from './render.js';
import { createFx, stepFx, emitExplosion, emitTrail, emitSpark, emitTekst, emitSmuga, emitLaser } from './fx.js';
import { attachInput } from './input.js';
import { WEAPONS, startowaAmunicja } from './weapons.js';
import { createNet, RUCH_CO } from './net.js';
import { nowaPartiaOs, zdarzenieOs, koniecTuryOs, koniecPartiiOs } from './osiagniecia-reguly.js';
import { createEkwipunek, ikonaBroni } from './ekwipunek.js';
import { DRUZYNY, TRYBY, nazwaTrybu } from './druzyny.js';
import * as U from './ustawienia.js';
import { EMOTKI, EMOTKA_S, TANIEC_S, EMOTKA_CO, emotka } from './emotki.js';
import * as D from './dzwieki.js';
import { stylMapy } from './terrain.js';
import * as K from './konto.js';
import { PODSTAWOWE, AKCESORIA_ID, akcesorium, odblokowane } from './akcesoria.js';
import { CZAPKI } from './czapki.js';

/* Kolory robali do wyboru przy wejściu. Kolejność ma znaczenie: przy
   kolizji dostaje się pierwszy wolny, więc najbardziej różne są na początku. */
const PALETA = [
  ['#ff7a1e', 'pomarańczowy'], ['#4ea3ff', 'niebieski'], ['#5ec26a', 'zielony'],
  ['#e04fd0', 'fioletowy'], ['#ffd93b', 'żółty'], ['#9b8cff', 'lawendowy'],
  ['#ff4d5e', 'czerwony'], ['#2fdcc8', 'turkusowy'], ['#ff9ecb', 'różowy'],
  ['#b5ee3c', 'limonkowy'], ['#f1f1f6', 'biały'], ['#aab4c0', 'srebrny']
];
const KOLORY = PALETA.map((k) => k[0]);

/* Dwóch graczy może wybrać ten sam kolor — przy starcie partii (i na liście
   w lobby) pierwszy chętny zachowuje swój, reszta bierze pierwszy wolny.
   Obowiązują kolory z `nowa`. */
function rozdzielKolory(gracze) {
  const zajete = new Set();
  return gracze.map((g) => {
    let color = g.color;
    if (!KOLORY.includes(color) || zajete.has(color)) color = KOLORY.find((k) => !zajete.has(k)) || color;
    zajete.add(color);
    return { ...g, color };
  });
}
/* odswiezLobby() chodzi co 500 ms, a stan z sieci przychodzi co ~3 s.
   Bez tej blokady każda „samolecząca” wysyłka (zgłoszenie siebie,
   publikacja odliczania) powtarzałaby się kilkanaście razy. */
const PONOW_PO = 6000;

const el = (id) => document.getElementById(id);
const plotno = el('plotno');
const hud = el('hud');
const ekwipunek = createEkwipunek({
  panel: el('ekwipunek'),
  tlo: el('ekw-tlo'),
  siatka: el('ekw-siatka'),
  opis: el('ekw-opis'),
  tytul: el('ekw-tytul'),
  przycisk: el('btn-bron'),
  zamknij: el('ekw-zamknij'),
  onWybierz: (id) => wybierzBron(id)
});

let mojeId = null, mojaNazwa = '', mojKolor = KOLORY[0];
let net = null, pokoj = null;
let rg = null;                         // bieżąca rozgrywka (protokol.js)
let renderer = null, kamera = null, fx = null, sterowanie = null;
let dpr = 1, ostatniCzas = 0, petlaDziala = false;

/* Seed partii, którą świadomie opuściłem — inaczej kolejne odpytanie
   wciągałoby mnie z powrotem na planszę, bo gra obiektywnie trwa. */
let opuszczonySeed = null;
let startWToku = false;
let ostatnieZgloszenie = 0;
let ostatnieOdliczanie = 0;
let recznaKameraDo = 0;                // do kiedy kamera nie śledzi sama (po przesunięciu palcem)
let zoomGracza = 1;
let czekamOd = null;
let mojaBron = czytaj('arena:bron') || 'bazooka';
if (!WEAPONS[mojaBron] || WEAPONS[mojaBron].ukryta) mojaBron = 'bazooka';

const dotykowy = () => document.body.classList.contains('dotykowy');
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('dotykowy');
window.addEventListener('touchstart', () => document.body.classList.add('dotykowy'), { passive: true, once: true });

/* Co gracz zobaczy na starcie partii — styl mapy wynika z seeda. */
const OPISY_MAP = {
  gory: 'Mapa: Góry — ostre szczyty, z góry widać wszystko, ale i ciebie widać.',
  archipelag: 'Mapa: Archipelag — między wyspami jest lawa. Skacz ostrożnie.',
  kaniony: 'Mapa: Kaniony — wąwozy do samej lawy i skalne łuki.',
  jaskinie: 'Mapa: Jaskinie — wielkie groty, nawisy i pływające skały. Granat się przyda.',
  ekstremalna: 'Mapa: Ekstremalna — wszystkie mapy naraz: iglice pod niebo, wąwozy do lawy, wyspy, piętra jaskiń i tunele. Lina ninja w dłoń!'
};

/* Statystyki gracza liczone wyłącznie w przeglądarce (localStorage) —
   zero dodatkowych zapytań do serwera. */
let tura = pustaTura();                           // co się dzieje w bieżącej turze
let partia = pustaPartia();

function pustaTura(nr = -1, kto = null) {
  return { nr, kto, suma: 0 };
}
function pustaPartia() {
  // os: stan reguł osiągnięć (osiagniecia-reguly.js) — liczy też fragi bez duplikatów
  return { obrazenia: 0, liczona: false, nowe: [], os: nowaPartiaOs() };
}
function turaDla(st, akt) {
  if (tura.nr !== st.turnNumber) tura = pustaTura(st.turnNumber, akt);
  return tura;
}

/* Osiągnięcia z Areny (lista w gra/osiagniecia.js, zapis w localStorage). */
const OSIAGNIECIA = window.ARENA_OSIAGNIECIA || null;
const kolejkaOsiagniec = [];
let osiagniecieTimer = null;
function zdobadz(id) {
  if (!OSIAGNIECIA || !rg || rg.obserwator) return;
  const o = OSIAGNIECIA.odblokuj(id);
  if (!o) return;
  partia.nowe.push(o);
  kolejkaOsiagniec.push(o);
  if (!osiagniecieTimer) pokazOsiagniecie();
}
function pokazOsiagniecie() {
  const o = kolejkaOsiagniec.shift();
  const box = el('osiagniecie');
  if (!o) { box.hidden = true; osiagniecieTimer = null; return; }
  el('osiagniecie-ikona').textContent = o.ikona;
  el('osiagniecie-nazwa').textContent = o.nazwa;
  el('osiagniecie-opis').textContent = o.opis;
  box.hidden = false;
  box.classList.remove('wchodzi');
  void box.offsetWidth;
  box.classList.add('wchodzi');
  try { navigator.vibrate?.(40); } catch { /* nie wszędzie */ }
  osiagniecieTimer = setTimeout(pokazOsiagniecie, 2800);
}
function wczytajStaty() {
  try {
    const z = JSON.parse(czytaj('arena:staty'));
    if (z && typeof z === 'object') return { partie: 0, wygrane: 0, obrazenia: 0, fragi: 0, rekordTury: 0, ...z };
  } catch { /* zepsuty zapis */ }
  return { partie: 0, wygrane: 0, obrazenia: 0, fragi: 0, rekordTury: 0 };
}
let podpisOsiagniec = null;         // null: lista jeszcze nie narysowana (także gdy nic nie zdobyto)
function rysujOsiagnieciaLobby() {
  if (!OSIAGNIECIA) return;
  const zdobyte = OSIAGNIECIA.wczytaj();
  const podpis = Object.keys(zdobyte).sort().join(',');
  if (podpis === podpisOsiagniec) return;
  podpisOsiagniec = podpis;
  const lista = el('osiagniecia-lista');
  lista.replaceChildren();
  let ile = 0;
  for (const o of OSIAGNIECIA.lista) {
    const ma = !!zdobyte[o.id];
    if (ma) ile++;
    const li = document.createElement('li');
    li.className = ma ? 'ma' : 'brak';
    const ik = document.createElement('span');
    ik.className = 'ikona';
    ik.textContent = ma || !o.ukryta ? o.ikona : '❔';
    const tekst = document.createElement('span');
    const b = document.createElement('b');
    b.textContent = ma || !o.ukryta ? o.nazwa : '???';
    const opis = document.createElement('small');
    opis.textContent = ma || !o.ukryta ? o.opis : 'Tajne. Kombinuj.';
    tekst.append(b, opis);
    // nagroda: czapka za to osiągnięcie (od 4.7.1)
    const czapka = CZAPKI.find((c) => c.osiagniecie === o.id);
    if (czapka) {
      const nagroda = document.createElement('em');
      nagroda.className = 'nagroda';
      nagroda.textContent = (ma ? '🎩 ' : '🔒 ') + czapka.nazwa;
      tekst.append(nagroda);
    }
    li.append(ik, tekst);
    lista.append(li);
  }
  el('osiagniecia-licznik').textContent = ile + '/' + OSIAGNIECIA.lista.length;
}

function czytaj(k) { try { return localStorage.getItem(k); } catch { return null; } }
function zapisz(k, v) { try { localStorage.setItem(k, v); } catch { /* tryb prywatny */ } }

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

const bazowyZoom = () => Math.max(0.42, Math.min(1.5, Math.min(renderer.viewW / 1150, renderer.viewH / 560)));

/* Najdalsze oddalenie (od 4.8): cała mapa mieści się między panelami — na dużej
   mapie dawniej nie było widać drugiego końca. */
function minZoomGracza() {
  const { w, h } = R.rozmiarSwiata();
  const wolneH = Math.max(120, renderer.viewH - pasy.gora - pasy.dol);
  const calosc = Math.min(renderer.viewW * 0.96 / w, wolneH * 0.96 / h) / bazowyZoom();
  return Math.min(0.55, calosc);
}

/* Podgląd całej mapy: przycisk 🗺️ albo M — oddala do całości i wraca do poprzedniego zoomu. */
let podgladMapy = false, zoomPrzedPodgladem = 1;
function przelaczPodgladMapy() {
  if (!rg) return;
  podgladMapy = !podgladMapy;
  if (podgladMapy) {
    zoomPrzedPodgladem = zoomGracza;
    zoomGracza = minZoomGracza();
    const { w, h } = R.rozmiarSwiata();
    kamera.tx = w / 2;
    kamera.ty = h / 2;
    recznaKameraDo = performance.now() + 60000;
  } else {
    zoomGracza = zoomPrzedPodgladem;
    recznaKameraDo = 0;
  }
  el('btn-mapa').setAttribute('aria-pressed', podgladMapy ? 'true' : 'false');
}
el('btn-mapa').addEventListener('click', przelaczPodgladMapy);

/* Dźwięk i muzyka (4.9): dwa przełączniki w HUD, zapamiętane w localStorage. */
function odswiezPrzyciskiDzwieku() {
  el('btn-dzwiek').textContent = D.dzwiekWlaczony() ? '🔊' : '🔇';
  el('btn-dzwiek').setAttribute('aria-pressed', D.dzwiekWlaczony() ? 'true' : 'false');
  el('btn-muzyka').setAttribute('aria-pressed', D.muzykaWlaczona() ? 'true' : 'false');
  el('btn-muzyka').classList.toggle('wyl', !D.muzykaWlaczona());
}
el('btn-dzwiek').addEventListener('click', (e) => { D.ustawDzwiek(!D.dzwiekWlaczony()); odswiezPrzyciskiDzwieku(); e.currentTarget.blur(); });
el('btn-muzyka').addEventListener('click', (e) => { D.ustawMuzyke(!D.muzykaWlaczona()); odswiezPrzyciskiDzwieku(); e.currentTarget.blur(); });
odswiezPrzyciskiDzwieku();

/* Minimapa: stuknięcie albo przeciąganie przenosi kamerę w to miejsce (na 5 s). */
{
  const mini = el('minimapa');
  let ciagne = false;
  const doSwiata = (e) => {
    if (!rg) return;
    const r = mini.getBoundingClientRect();
    const { w, h } = R.rozmiarSwiata();
    const x = (e.clientX - r.left) / r.width * w, y = (e.clientY - r.top) / r.height * h;
    kamera.x = kamera.tx = x;
    kamera.y = kamera.ty = y;
    recznaKameraDo = performance.now() + (podgladMapy ? 60000 : 5000);
  };
  mini.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (trybPingu && rg) {
      const r = mini.getBoundingClientRect();
      const { w, h } = R.rozmiarSwiata();
      wyslijPing((e.clientX - r.left) / r.width * w, (e.clientY - r.top) / r.height * h);
      return;
    }
    ciagne = true;
    try { mini.setPointerCapture(e.pointerId); } catch { /* nic */ }
    doSwiata(e);
  });
  mini.addEventListener('pointermove', (e) => { if (ciagne) doSwiata(e); });
  const pusc = () => { ciagne = false; };
  mini.addEventListener('pointerup', pusc);
  mini.addEventListener('pointercancel', pusc);
}
let minimapaKlatka = 0;
function rysujMinimape(st) {
  const mini = el('minimapa');
  // proporcje jak świat; odświeżana co drugą klatkę
  const { w, h } = R.rozmiarSwiata();
  const szer = mini.clientWidth || 160;
  const wys = Math.round(szer * h / w);
  if (Math.abs(mini.clientHeight - wys) > 1) mini.style.height = wys + 'px';
  // telefon pionowo: panele u góry zajmują całą szerokość — minimapa pod nimi (pomiar co ~0,5 s)
  if (minimapaKlatka % 30 === 0) {
    const gora = document.querySelector('#hud .hud-gora');
    const pion = window.matchMedia('(max-width: 560px)').matches;
    mini.style.top = pion && gora ? (gora.offsetTop + gora.offsetHeight + 6) + 'px' : '';
  }
  if (minimapaKlatka++ % 2 === 0) R.rysujMinimape(mini, renderer, st, kamera, pingi);
}

/* Pasy ekranu zasłonięte przez HUD: u góry panele, u dołu bronie, moc
   i przyciski dotykowe. Kamera trzyma robala w wolnym pasie pomiędzy.
   Pomiar co pół sekundy (to odczyt układu strony), a wynik dochodzi
   płynnie, żeby świat nie skakał, gdy przyciski pojawiają się w turze. */
const pasy = { gora: 0, dol: 0, bok: 0, cel: { gora: 0, dol: 0, bok: 0 }, pomiar: -1e9, swieze: true };
function pasyHud(teraz, dt) {
  if (teraz - pasy.pomiar > 500) {
    pasy.pomiar = teraz;
    const W = renderer.viewW, H = renderer.viewH;
    let gora = H, bok = 0;
    // Grupy przycisków dotykowych mierzymy osobno: te przy bokach nie zasłaniają
    // środka ekranu, gdzie stoi robal — pilnujemy tylko, żeby nie wszedł pod nie z boku.
    const dotyk = el('dotyk');
    const elementy = [hud.querySelector('.hud-dol')];
    if (dotyk && !dotyk.hidden) elementy.push(...dotyk.children);
    const boczne = [];
    for (const e of elementy) {
      const r = e.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0) continue;
      if (r.left < W * 0.62 && r.right > W * 0.38) gora = Math.min(gora, r.top);
      else boczne.push(r);
    }
    // boczna grupa liczy się tylko, jeśli wystaje ponad dolny pas (telefon poziomo)
    for (const r of boczne) if (r.top < gora) bok = Math.max(bok, r.left < W / 2 ? r.right : W - r.left);
    pasy.cel.dol = Math.max(0, Math.min(H * 0.5, H - gora));
    pasy.cel.bok = Math.min(W * 0.32, bok);
    const g = hud.querySelector('.hud-gora').getBoundingClientRect();
    pasy.cel.gora = Math.max(0, Math.min(H * 0.35, g.bottom));
  }
  if (pasy.swieze) {                     // pierwsza klatka partii: bez dojazdu
    pasy.swieze = false;
    pasy.gora = pasy.cel.gora;
    pasy.dol = pasy.cel.dol;
    pasy.bok = pasy.cel.bok;
  } else {
    const k = Math.min(1, dt * 4);
    pasy.gora += (pasy.cel.gora - pasy.gora) * k;
    pasy.dol += (pasy.cel.dol - pasy.dol) * k;
    pasy.bok += (pasy.cel.bok - pasy.bok) * k;
  }
  return pasy;
}

/* ---------- konto, ekran ładowania i ekran Areny (4.6, układ od 4.7) ---------- */

/* Arena jest tylko dla kont: logowanie → ekran ładowania → ekran Areny.
   Ekran Areny ma dwie kolumny: po lewej panel gracza (profil, wygląd robala,
   ranking killi, osiągnięcia), po prawej lista aren albo lobby areny, w której
   jestem. Domyślnej areny nie ma — ktoś musi ją założyć. */
let konto = null;
let aktualnyPokoj = null;             // { id, klucz, nazwa } — arena, w której jestem
const EKRANY = ['ekran-logowanie', 'ekran-ladowanie', 'ekran-arena', 'ekran-koniec'];
const Z_PASKIEM = ['ekran-logowanie', 'ekran-arena'];
function pokazEkran(id) {
  for (const e of EKRANY) el(e).hidden = e !== id;
  // pasek Fortnite / 0 A.D. / Arena na górze ekranu logowania i Areny
  const pasek = el('nawigacja');
  if (Z_PASKIEM.includes(id)) { el(id).prepend(pasek); pasek.hidden = false; } else pasek.hidden = true;
  el('nawigacja-konto').hidden = !konto;
  if (id === 'ekran-arena' || id === 'ekran-ladowanie') startPodgladu();
}
/* Prawa kolumna: lista aren albo lobby. */
function pokazWidok(lobby) {
  el('widok-pokoje').hidden = lobby;
  el('widok-lobby').hidden = !lobby;
}
const wLobby = () => !el('ekran-arena').hidden && !el('widok-lobby').hidden;
const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

/* Arena z adresu (?pokoj=…) — link do znajomych albo odświeżenie strony w lobby. */
function pokojZAdresu() {
  try {
    const p = new URLSearchParams(location.search).get('pokoj');
    return p && /^[a-z0-9-]{1,24}$/i.test(p) ? p.toLowerCase() : null;
  } catch { return null; }
}
function ustawAdres(pokojId) {
  try {
    const u = new URL(location.href);
    if (pokojId) u.searchParams.set('pokoj', pokojId); else u.searchParams.delete('pokoj');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch { /* stara przeglądarka */ }
}

/* ----- wygląd robala: kolor i akcesorium (na koncie i w przeglądarce) ----- */

mojKolor = (() => {
  const z = czytaj('arena:kolor');
  return KOLORY.includes(z) ? z : KOLORY[0];
})();
let mojeAkcesorium = (() => {
  const z = czytaj('arena:akcesorium');
  return AKCESORIA_ID.includes(z) ? z : null;
})();

/* Zmiana wyglądu: od razu na ekranie, na koncie i — jeśli jestem w lobby — u innych. */
function zmienWyglad(zmiana) {
  if ('kolor' in zmiana) { mojKolor = zmiana.kolor; zapisz('arena:kolor', mojKolor); }
  if ('akcesorium' in zmiana) { mojeAkcesorium = zmiana.akcesorium; zapisz('arena:akcesorium', mojeAkcesorium || ''); }
  zaznaczKolor();
  zaznaczAkcesorium();
  el('nawigacja-kropka').style.background = mojKolor;
  K.ustawWyglad(zmiana);
  if (net && !rg) zglosSie();
}

const boxKolorow = el('kolory');
for (const [kolor, nazwa] of PALETA) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'kolor';
  b.style.setProperty('--kolor', kolor);
  b.dataset.kolor = kolor;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-label', nazwa);
  b.title = nazwa;
  b.addEventListener('click', () => zmienWyglad({ kolor }));
  boxKolorow.append(b);
}
function zaznaczKolor() {
  for (const b of boxKolorow.children) {
    const tak = b.dataset.kolor === mojKolor;
    b.setAttribute('aria-checked', tak ? 'true' : 'false');
    b.tabIndex = tak ? 0 : -1;
  }
}
// strzałki przesuwają wybór jak w zwykłej grupie radiowej
boxKolorow.addEventListener('keydown', (e) => {
  const kier = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!kier) return;
  e.preventDefault();
  const i = (KOLORY.indexOf(mojKolor) + kier + KOLORY.length) % KOLORY.length;
  boxKolorow.children[i].click();
  boxKolorow.children[i].focus();
});

/* Akcesoria: kafelki z robalem, który już je nosi (plus „bez”), a niżej czapki za
   osiągnięcia (od 4.7.1) — zablokowana ma kłódkę i nazwę osiągnięcia, które ją daje. */
const kafelkiAkcesoriow = [];
const osiagniecieCzapki = (a) => (OSIAGNIECIA ? OSIAGNIECIA.lista.find((o) => o.id === a.osiagniecie) : null);
const WSZYSTKIE = OSIAGNIECIA ? OSIAGNIECIA.lista.map((o) => o.id) : [];
const ileZdobytych = (zdobyte) => WSZYSTKIE.filter((id) => zdobyte && zdobyte[id]).length;
function kafelek(box, a) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'akcesorium';
  b.setAttribute('role', 'radio');
  const plotnoA = document.createElement('canvas');
  plotnoA.setAttribute('aria-hidden', 'true');
  const podpis = document.createElement('span');
  podpis.textContent = a.nazwa;
  b.append(plotnoA);
  const zn = document.createElement('small');
  if (a.gra) {
    zn.className = 'akcesorium-gra ' + (a.gra === 'Fortnite' ? 'fn' : 'ad');
    zn.textContent = a.gra;
    b.append(zn);
  } else if (a.osiagniecie) {
    const o = osiagniecieCzapki(a);
    zn.className = 'akcesorium-gra os';
    zn.textContent = a.osiagniecie === '*' ? '🏆 wszystkie osiągnięcia' : o ? o.ikona + ' ' + (o.ukryta ? '???' : o.nazwa) : '';
    if (a.osiagniecie === '*') b.classList.add('krolewska');
    b.append(zn);
    const klodka = document.createElement('i');
    klodka.className = 'klodka';
    klodka.setAttribute('aria-hidden', 'true');
    klodka.textContent = '🔒';
    b.append(klodka);
  }
  b.append(podpis);
  b.title = a.nazwa + (a.gra ? ' (' + a.gra + ')' : '');
  b.addEventListener('click', () => {
    const zdobyte = OSIAGNIECIA ? OSIAGNIECIA.wczytaj() : {};
    if (a.osiagniecie && !odblokowane(a, zdobyte, WSZYSTKIE)) {
      const o = osiagniecieCzapki(a);
      el('info-wyglad').textContent = a.osiagniecie === '*'
        ? '🔒 ' + a.nazwa + ' — zdobądź wszystkie osiągnięcia Areny (masz ' + ileZdobytych(zdobyte) + '/' + WSZYSTKIE.length + ').'
        : '🔒 ' + a.nazwa + ' — zdobądź osiągnięcie „' + (o && !o.ukryta ? o.nazwa + '”: ' + o.opis : '???”: to tajemnica. Kombinuj.');
      return;
    }
    el('info-wyglad').textContent = '';
    zmienWyglad({ akcesorium: a.id });
  });
  box.append(b);
  kafelkiAkcesoriow.push({ id: a.id, a, b, plotno: plotnoA });
}
for (const a of [{ id: null, nazwa: 'Bez dodatków', gra: '' }, ...PODSTAWOWE]) kafelek(el('akcesoria'), a);
for (const a of CZAPKI) kafelek(el('czapki'), a);
function zaznaczAkcesorium() {
  const zdobyte = OSIAGNIECIA ? OSIAGNIECIA.wczytaj() : {};
  let ile = 0;
  for (const k of kafelkiAkcesoriow) {
    const tak = k.id === mojeAkcesorium;
    const zablokowana = !!k.a.osiagniecie && !odblokowane(k.a, zdobyte, WSZYSTKIE);
    if (k.a.osiagniecie === '*') k.b.querySelector('.akcesorium-gra').textContent = '🏆 ' + ileZdobytych(zdobyte) + '/' + WSZYSTKIE.length + ' osiągnięć';
    if (k.a.osiagniecie && !zablokowana) ile++;
    k.b.classList.toggle('zablokowane', zablokowana);
    k.b.setAttribute('aria-disabled', zablokowana ? 'true' : 'false');
    if (k.a.osiagniecie) k.b.title = k.a.nazwa + (zablokowana ? ' — zablokowana' : '');
    k.b.setAttribute('aria-checked', tak ? 'true' : 'false');
    k.b.tabIndex = tak ? 0 : -1;
  }
  el('czapki-licznik').textContent = ile + '/' + CZAPKI.length;
}
zaznaczKolor();
zaznaczAkcesorium();

/* Podgląd robala w profilu, kafelki akcesoriów i scena ładowania — tym samym kodem co w grze. */
let podgladDziala = false, klatkaPodgladu = 0;
function startPodgladu() {
  if (podgladDziala) return;
  podgladDziala = true;
  requestAnimationFrame(petlaPodgladu);
}
function petlaPodgladu(t) {
  const arena = !el('ekran-arena').hidden, ladowanie = !el('ekran-ladowanie').hidden;
  if (!arena && !ladowanie) { podgladDziala = false; return; }
  const czas = t / 1000;
  const dane = { kolor: mojKolor, nazwa: konto ? konto.nick : 'Ty', czas, akc: mojeAkcesorium };
  if (arena) {
    R.rysujPodgladRobala(el('podglad-robala'), dane);
    // kafelki co trzecią klatkę — 24 małe płótna
    if (klatkaPodgladu++ % 3 === 0) {
      for (const k of kafelkiAkcesoriow) R.rysujPodgladRobala(k.plotno, { kolor: mojKolor, czas, akc: k.id, mini: true });
    }
  }
  if (ladowanie) R.rysujSceneLadowania(el('ladowanie-scena'), { ...dane, postep: postepLadowania });
  requestAnimationFrame(petlaPodgladu);
}

/* ----- ekran ładowania ----- */

const TEKSTY_LADOWANIA = [
  'Ostrzę rogi…', 'Podgrzewam lawę…', 'Liczę kozy…', 'Kopię jaskinie…', 'Smaruję linę ninja…',
  'Święcę Świętego GOATa…', 'Ustawiam wiatr pod bazookę…', 'Rozkładam mosty…', 'Polerujemy koronę Victory Royale…',
  'Spartanie ustawiają falangę…', 'Przecieram okulary przeciwsłoneczne…', 'Stroję muzyczkę…'
];
const PORADY = [
  'R obraca most co 22,5° — skosy i pionowe ściany.',
  'Q albo prawy przycisk myszy otwiera ekwipunek.',
  'Lina ninja nie kończy tury: przebujaj się i dopiero strzelaj.',
  'Po strzale masz 5 sekund na ucieczkę.',
  'Święty GOAT robi największy wybuch w grze. ALLELUJA!',
  'Kij jest tylko w skrzynkach z zapasami.',
  'E otwiera emotki — GG działa też w cudzej turze.',
  'Wiatr pcha bazookę, granaty i naloty. Patrz na pasek u góry.',
  'Każdy kill ląduje na koncie i w rankingu.',
  'Arenę na hasło widać na liście z kłódką 🔒.'
];
let postepLadowania = 0;

/* Ekran przejściowy: scena, pasek z procentami, żarty i porada, dopóki
   `zadanie` nie skończy (min. 1,8 s). */
async function ladowanie(zadanie, nad = 'Wchodzisz na') {
  pokazEkran('ekran-ladowanie');
  podgladDziala = false;
  startPodgladu();
  el('btn-ponow').hidden = true;
  el('ladowanie-nad').textContent = nad;
  const pasek = el('ladowanie-postep'), procent = el('ladowanie-procent'), tekst = el('ladowanie-tekst');
  el('ladowanie-porada').textContent = 'Porada: ' + PORADY[Math.floor(Math.random() * PORADY.length)];
  let gotowe = false;
  const t0 = performance.now();
  let nrTekstu = Math.floor(Math.random() * TEKSTY_LADOWANIA.length);
  tekst.textContent = TEKSTY_LADOWANIA[nrTekstu];
  const zmiana = setInterval(() => {
    nrTekstu = (nrTekstu + 1) % TEKSTY_LADOWANIA.length;
    tekst.textContent = TEKSTY_LADOWANIA[nrTekstu];
  }, 700);
  const pokaz = (p) => {
    postepLadowania = p;
    pasek.style.width = (p * 100).toFixed(1) + '%';
    procent.textContent = Math.floor(p * 100) + '%';
  };
  const animuj = () => {
    if (gotowe) return;
    // do 90% w niecałe dwie sekundy, potem powoli — ostatnie 10% dopiero po odpowiedzi serwera
    const t = (performance.now() - t0) / 1000;
    pokaz(t < 1.8 ? (1 - (1 - t / 1.8) ** 2) * 0.9 : 0.9 + 0.08 * (1 - 1 / (1 + (t - 1.8))));
    requestAnimationFrame(animuj);
  };
  requestAnimationFrame(animuj);
  try {
    const [wynik] = await Promise.all([zadanie(), czekaj(1800)]);
    return wynik;
  } finally {
    gotowe = true;
    clearInterval(zmiana);
    pokaz(1);
    tekst.textContent = 'Gotowe!';
    await czekaj(320);
  }
}

/* Start strony: zapamiętane konto → kurtyna Areny (jak przejście Fortnite ↔ 0 A.D.
   na zrzutce, przejscie.js) → ekran Areny (albo od razu arena z adresu).
   Ekran ładowania ze sceną jest tylko po zalogowaniu formularzem. */
const kurtyna = window.PRZEJSCIE || { zaslon() {}, odslon() {}, wejscie: null };
async function start() {
  if (!K.token()) { pokazLogowanie(); kurtyna.odslon(); return; }
  kurtyna.zaslon(kurtyna.wejscie || 'arena');
  const [w] = await Promise.all([(async () => {
    const w = await K.ja();
    if (w.status === 200) {
      ustawKonto(w.dane.konto);
      await Promise.all([odswiezPokoje(), odswiezRanking()]);
    }
    return w;
  })(), czekaj(kurtyna.wejscie ? 250 : 700)]);   // bez przejścia kurtyna nie może tylko mignąć
  if (w.status === 200) await poZalogowaniu(w.dane.konto);
  else if (w.status === 401) pokazLogowanie('Sesja wygasła — zaloguj się jeszcze raz.');
  else pokazBladStartu(w);
  kurtyna.odslon();
}
/* Serwer nie odpowiada: scena ładowania z komunikatem i „Spróbuj jeszcze raz”. */
function pokazBladStartu(w) {
  pokazEkran('ekran-ladowanie');
  el('ladowanie-nad').textContent = 'Nie udało się wejść na';
  el('ladowanie-postep').style.width = '0%';
  el('ladowanie-procent').textContent = '';
  el('ladowanie-porada').textContent = '';
  el('ladowanie-tekst').textContent = K.opisBledu(w.dane) + ' Serwer mógł się właśnie restartować.';
  el('btn-ponow').hidden = false;
}
el('btn-ponow').addEventListener('click', start);

/* ----- logowanie i rejestracja ----- */

let trybKonta = 'logowanie';
function ustawTrybKonta(tryb) {
  trybKonta = tryb;
  const rej = tryb === 'rejestracja';
  el('tab-logowanie').setAttribute('aria-selected', rej ? 'false' : 'true');
  el('tab-rejestracja').setAttribute('aria-selected', rej ? 'true' : 'false');
  el('pole-haslo2').hidden = !rej;
  el('podpowiedz-konta').hidden = !rej;
  el('input-haslo').autocomplete = rej ? 'new-password' : 'current-password';
  el('btn-konto').textContent = rej ? 'Zakładam konto' : 'Wchodzę';
  el('info-konto').textContent = '';
}
el('tab-logowanie').addEventListener('click', () => ustawTrybKonta('logowanie'));
el('tab-rejestracja').addEventListener('click', () => ustawTrybKonta('rejestracja'));

function pokazLogowanie(komunikat = '') {
  pokazEkran('ekran-logowanie');
  const zapisana = czytaj('arena:nazwa');
  if (zapisana && !el('input-nick').value) el('input-nick').value = zapisana;
  el('info-konto').textContent = komunikat;
  // za pierwszym razem (nikt tu jeszcze nie grał z kontem) zaczynamy od zakładania
  if (!zapisana && !czytaj('arena:stare-przeniesione')) ustawTrybKonta('rejestracja');
}

el('form-konto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nick = el('input-nick').value.trim();
  const haslo = el('input-haslo').value;
  const info = el('info-konto');
  const rej = trybKonta === 'rejestracja';
  if (nick.length < 3) { info.textContent = 'Nick: co najmniej 3 znaki.'; return; }
  if (haslo.length < 4) { info.textContent = 'Hasło: co najmniej 4 znaki.'; return; }
  if (rej && haslo !== el('input-haslo2').value) { info.textContent = 'Hasła się różnią.'; return; }
  const btn = el('btn-konto');
  btn.disabled = true;
  info.textContent = rej ? 'Zakładam konto…' : 'Loguję…';
  const w = await (rej ? K.rejestracja(nick, haslo) : K.logowanie(nick, haslo));
  btn.disabled = false;
  if (w.status !== 200) { info.textContent = K.opisBledu(w.dane); return; }
  info.textContent = '';
  el('input-haslo').value = '';
  el('input-haslo2').value = '';
  ustawKonto(w.dane.konto);
  await ladowanie(() => Promise.all([odswiezPokoje(), odswiezRanking()]), rej ? 'Witaj po raz pierwszy na' : 'Wracasz na');
  poZalogowaniu(w.dane.konto);
});

function ustawKonto(k) {
  konto = k;
  mojeId = k.id;
  mojaNazwa = k.nick.slice(0, 14);
  if (KOLORY.includes(k.kolor)) mojKolor = k.kolor;
  if (k.akcesorium === null || AKCESORIA_ID.includes(k.akcesorium)) mojeAkcesorium = k.akcesorium;
  if (mojeAkcesorium && !odblokowane(akcesorium(mojeAkcesorium), k.osiagniecia, WSZYSTKIE)) mojeAkcesorium = null;
  zaznaczKolor();
  zaznaczAkcesorium();
  el('nawigacja-nick').textContent = k.nick;
  el('nawigacja-kropka').style.background = mojKolor;
}

async function poZalogowaniu(k) {
  ustawKonto(k);
  // pierwszy raz na koncie — wygląd wybrany wcześniej w tej przeglądarce
  if (!KOLORY.includes(k.kolor)) K.ustawWyglad({ kolor: mojKolor, akcesorium: mojeAkcesorium });
  const zAdresu = pokojZAdresu();          // przed otworzArene — ona czyści adres
  otworzArene();
  if (!zAdresu) return;
  const p = pokojeLista.find((x) => x.id === zAdresu);
  if (!p || !p.haslo) return polaczZPokojem(zAdresu, null, p ? p.nazwa : zAdresu);
  rozwinietyPokoj = zAdresu;            // arena na hasło: pole hasła od razu otwarte
  rysujPokoje(true);
}

el('btn-wyloguj').addEventListener('click', async () => {
  opuscPokoj();
  await K.wyloguj();
  konto = null;
  pokazLogowanie('Wylogowano.');
  ustawTrybKonta('logowanie');
});

/* ----- ekran Areny ----- */

let arenaTimer = null, ileOdswiezen = 0;
function otworzArene() {
  pokazEkran('ekran-arena');
  pokazWidok(!!net);
  if (!net) ustawAdres(null);
  rysujProfil();
  podpisOsiagniec = null;
  rysujOsiagnieciaLobby();
  zaznaczAkcesorium();
  rysujPokoje(true);
  rysujRanking();
  clearInterval(arenaTimer);
  // lista aren co 5 s (gdy ją widać), ranking co 20 s — dopóki ekran Areny jest na wierzchu
  arenaTimer = setInterval(() => {
    if (el('ekran-arena').hidden) { clearInterval(arenaTimer); return; }
    if (document.hidden) return;
    if (!el('widok-pokoje').hidden) odswiezPokoje().then(() => rysujPokoje());
    if (++ileOdswiezen % 4 === 0) odswiezRanking().then(rysujRanking);
  }, 5000);
}

/* Ranga za kille — sam napis w profilu. */
const RANGI = [[0, 'Świeżak areny'], [1, 'Pierwsza krew'], [5, 'Rekrut z bazooką'], [15, 'Weteran lawy'],
  [30, 'Rzeźnik Areny'], [60, 'Postrach lobby'], [100, 'GOAT areny']];
function rysujProfil() {
  if (!konto) return;
  el('profil-nick').textContent = konto.nick;
  const s = wczytajStaty();
  el('profil-ranga').textContent = RANGI.filter(([od]) => s.fragi >= od).pop()[1];
  const lista = el('profil-staty');
  lista.replaceChildren();
  const skutecznosc = s.partie ? Math.round(s.wygrane / s.partie * 100) + '%' : '—';
  for (const [ikona, ile, nazwa] of [['💀', s.fragi, 'killi'], ['🏆', s.wygrane, 'wygranych'], ['🎮', s.partie, 'partii'],
    ['📈', skutecznosc, 'wygrywa'], ['💥', s.obrazenia, 'obrażeń'], ['🔥', s.rekordTury, 'max obrażeń w turze']]) {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = ikona + ' ' + ile;
    const sm = document.createElement('small');
    sm.textContent = nazwa;
    li.append(b, sm);
    lista.append(li);
  }
}

/* Areny */
let pokojeLista = [];
let pokojeBlad = '';
let podpisPokoi = '';
let rozwinietyPokoj = null;           // arena na hasło z otwartym polem hasła

async function odswiezPokoje() {
  const w = await K.pokoje();
  if (w.status === 200 && Array.isArray(w.dane.pokoje)) { pokojeLista = w.dane.pokoje; pokojeBlad = ''; }
  else pokojeBlad = K.opisBledu(w.dane);
}

function rysujPokoje(wymus = false) {
  const lista = el('lista-pokoi');
  // nie przebudowujemy listy pod palcem piszącym hasło
  if (!wymus && lista.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const podpis = JSON.stringify([pokojeLista, rozwinietyPokoj]);
  if (!wymus && podpis === podpisPokoi) return;
  podpisPokoi = podpis;
  lista.replaceChildren();
  el('pusto-pokoje').hidden = pokojeLista.length > 0;
  const graczy = pokojeLista.reduce((s, p) => s + p.ile, 0);
  el('licznik-pokoi').textContent = pokojeLista.length ? pokojeLista.length + ' · ' + graczy + ' graczy' : '';
  for (const p of pokojeLista) {
    const li = document.createElement('li');
    li.className = 'pokoj' + (p.partia ? ' w-grze' : '') + (p.haslo ? ' zamkniety' : '');
    const opis = document.createElement('div');
    opis.className = 'pokoj-opis';
    const nazwa = document.createElement('b');
    nazwa.textContent = (p.haslo ? '🔒 ' : '') + p.nazwa;
    const kto = document.createElement('small');
    kto.textContent = p.ile ? p.gracze.join(', ') : 'pusto — wejdź pierwszy';
    const znaczki = document.createElement('div');
    znaczki.className = 'pokoj-znaczki';
    const ile = document.createElement('span');
    ile.className = 'pokoj-ile';
    ile.textContent = '👥 ' + p.ile + '/' + P.MAX_GRACZY;
    znaczki.append(ile);
    if (p.partia) {
      const znak = document.createElement('span');
      znak.className = 'pokoj-gra';
      znak.textContent = 'trwa partia';
      znaczki.append(znak);
    }
    if (p.zalozyl) {
      const z = document.createElement('span');
      z.className = 'pokoj-zalozyl';
      z.textContent = '👑 ' + p.zalozyl;
      znaczki.append(z);
    }
    opis.append(nazwa, znaczki, kto);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = p.partia ? 'Oglądaj' : 'Wejdź';
    btn.addEventListener('click', () => {
      if (!p.haslo) return polaczZPokojem(p.id, null, p.nazwa);
      rozwinietyPokoj = rozwinietyPokoj === p.id ? null : p.id;
      rysujPokoje(true);
      if (rozwinietyPokoj) el('lista-pokoi').querySelector('input')?.focus();
    });
    li.append(opis, btn);
    if (p.haslo && rozwinietyPokoj === p.id) {
      const form = document.createElement('form');
      form.className = 'pokoj-haslo';
      form.noValidate = true;
      const input = document.createElement('input');
      input.type = 'password';
      input.maxLength = 40;
      input.placeholder = 'Hasło areny';
      input.autocomplete = 'off';
      const ok = document.createElement('button');
      ok.type = 'submit';
      ok.textContent = 'Wchodzę';
      form.append(input, ok);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        ok.disabled = true;
        const w = await K.wejdzDoPokoju(p.id, input.value);
        ok.disabled = false;
        if (w.status === 200) return polaczZPokojem(p.id, w.dane.klucz, p.nazwa);
        el('info-pokoje').textContent = w.status === 403 ? 'Złe hasło do areny „' + p.nazwa + '”.' : K.opisBledu(w.dane);
        input.select();
      });
      li.append(form);
    }
    lista.append(li);
  }
  if (pokojeBlad) el('info-pokoje').textContent = pokojeBlad;
}

el('form-pokoj').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nazwa = el('input-pokoj-nazwa').value.trim();
  const haslo = el('input-pokoj-haslo').value;
  const info = el('info-pokoje');
  if (nazwa.length < 3) { info.textContent = 'Nazwa areny: co najmniej 3 znaki.'; return; }
  if (haslo && haslo.length < 3) { info.textContent = 'Hasło areny: co najmniej 3 znaki (albo puste).'; return; }
  el('btn-pokoj').disabled = true;
  const w = await K.nowyPokoj(nazwa, haslo || undefined);
  el('btn-pokoj').disabled = false;
  if (w.status !== 200) { info.textContent = K.opisBledu(w.dane); return; }
  info.textContent = '';
  el('input-pokoj-nazwa').value = '';
  el('input-pokoj-haslo').value = '';
  polaczZPokojem(w.dane.id, w.dane.klucz, nazwa, !!haslo);
});

/* Ranking killi */
let rankingLista = null;
async function odswiezRanking() {
  const w = await K.ranking();
  if (w.status === 200 && Array.isArray(w.dane.ranking)) rankingLista = w.dane.ranking;
}
function rysujRanking() {
  const ol = el('ranking');
  ol.replaceChildren();
  const lista = rankingLista || [];
  el('info-ranking').textContent = rankingLista === null ? 'Nie udało się pobrać rankingu.'
    : lista.length ? '' : 'Jeszcze nikt nie zagrał. Bądź pierwszy!';
  lista.forEach((r, i) => {
    const li = document.createElement('li');
    if (i < 3) li.classList.add('podium', 'miejsce-' + (i + 1));
    if (konto && r.nick === konto.nick) li.classList.add('ja');
    const miejsce = document.createElement('span');
    miejsce.className = 'miejsce';
    miejsce.textContent = i < 3 ? ['🥇', '🥈', '🥉'][i] : (i + 1) + '.';
    const kropka = document.createElement('span');
    kropka.className = 'kropka';
    kropka.style.background = KOLORY.includes(r.kolor) ? r.kolor : '#888';
    const nick = document.createElement('span');
    nick.className = 'nick';
    const a = akcesorium(r.akcesorium);
    nick.textContent = r.nick + (a ? ' ' + a.ikona : '');
    const kille = document.createElement('b');
    kille.textContent = r.kille + ' 💀';
    const reszta = document.createElement('small');
    reszta.textContent = r.wygrane + ' wyg. · ' + r.partie + ' partii';
    li.append(miejsce, kropka, nick, reszta, kille);
    ol.append(li);
  });
}

/* ----- wejście do areny i powrót do listy ----- */

function zglosSie() {
  ostatnieZgloszenie = Date.now();
  return net.wyslij({ t: 'dolacz', id: mojeId, name: mojaNazwa, color: mojKolor, akc: mojeAkcesorium, v: P.WERSJA });
}

async function polaczZPokojem(id, klucz, nazwa, haslo) {
  if (net) opuscPokoj();
  const p = pokojeLista.find((x) => x.id === id);
  aktualnyPokoj = { id, klucz, nazwa };
  rozwinietyPokoj = null;
  ustawAdres(id);
  el('lobby-tytul').textContent = ((p ? p.haslo : haslo) ? '🔒 ' : '') + (nazwa || 'Lobby');
  el('info-lobby').textContent = 'Łączę z areną…';
  if (el('ekran-arena').hidden) otworzArene();
  pokazWidok(true);

  net = createNet({
    id: mojeId,
    pokoj: id,
    token: K.token(),
    klucz,
    onStan: naStanSieci,
    onReset: () => { pokoj = null; emotkiIndeks = 0; },
    onBlad: naBladSieci
  });
  net.start();

  await zglosSie();
  await net.pobierz();
  // Jeśli właśnie dołączyliśmy do trwającej partii, plansza już jest.
  if (rg) el('ekran-arena').hidden = true;
}

/* Wyjście z areny do listy: pożegnanie w logu i koniec połączenia. */
function opuscPokoj() {
  if (!net) return;
  net.opusc();
  net.stop();
  net = null;
  pokoj = null;
  aktualnyPokoj = null;
  emotkiIndeks = 0;
  opuszczonySeed = null;
  podpisLobby = '';
  ostatnieUstawienia = null;
  bylemGospodarzem = false;
  bylemWyrzucony = false;
  wybranyGracz = null;
  el('baner-blad').hidden = true;
}
el('btn-panel').addEventListener('click', async () => {
  opuscPokoj();
  ustawAdres(null);
  pokazWidok(false);
  await Promise.all([odswiezPokoje(), odswiezRanking()]);
  rysujPokoje(true);
  rysujRanking();
});

/* Koniec partii: wynik na konto (kille do rankingu, osiągnięcia). */
function wyslijWynikPartii(wynik) {
  K.wyslijWynik(wynik).then((w) => {
    if (w.status === 200) { konto = w.dane.konto; rysujProfil(); podpisOsiagniec = null; rysujOsiagnieciaLobby(); zaznaczAkcesorium(); }
  });
}

/* Powrót strony z pamięci podręcznej (np. „wstecz” na telefonie):
   pagehide wysłał już wyjście, więc zgłaszamy się od nowa. */
window.addEventListener('pageshow', (e) => {
  if (e.persisted && net) { net.start(); zglosSie(); }
});

/* Zamknięcie w trakcie własnej partii — przeglądarka zapyta, czy na pewno. */
window.addEventListener('beforeunload', (e) => {
  if (rg && !rg.obserwator && rg.state.phase !== 'over') {
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ---------- sieć ---------- */

function naBladSieci(wiadomosc) {
  const baner = el('baner-blad');
  baner.hidden = false;
  baner.textContent = net && net.brakKonfiguracji
    ? 'Nie ustawiono adresu serwera Areny. Gra online niedostępna.'
    : 'Problem z połączeniem: ' + wiadomosc;
  el('info-lobby').textContent = wiadomosc;
}

const polaczony = (id) => id === mojeId || net.zywi().has(id);

function naStanSieci() {
  pokoj = P.zloz(net.zdarzenia);
  if (net.polaczony) el('baner-blad').hidden = true;

  const zywa = P.partiaZywa(pokoj, net.czas(), polaczony);

  // W logu jest już inna partia niż ta, którą mam na ekranie.
  if (rg && pokoj.seed !== rg.seed) zakonczGre();

  // Partia umarła (wszyscy wyszli albo zamilkli), a my wciąż na planszy.
  if (rg && pokoj.faza === 'gra' && !zywa && rg.state.phase !== 'over') {
    zakonczGre();
    pokazInfoLobby('Partia została porzucona — wszyscy wyszli.');
  }

  if (!rg && pokoj.seed !== null && pokoj.faza === 'gra' && zywa && pokoj.seed !== opuszczonySeed) {
    zbudujGre();
  }
  odswiezLobby();
}

/* ---------- lobby ---------- */

/* Komunikat w lobby trzyma się kilka sekund — odswiezLobby() chodzi co
   pół sekundy i nadpisałby go od razu domyślnym tekstem. */
let infoLobby = { tekst: '', do: 0 };
function pokazInfoLobby(tekst) {
  infoLobby = { tekst, do: Date.now() + 6000 };
  el('info-lobby').textContent = tekst;
}

/* Lobby: tryb gry ustawia gospodarz (pierwszy obecny w kolejności wejścia),
   drużyny rozstawia P.rozstaw (to samo u wszystkich), start rusza, gdy
   wszyscy dadzą GOTOWY — wtedy 5 s odliczania. Wszystko idzie zdarzeniami
   w logu, więc każdy widzi to samo. */
let wybranyGracz = null;              // gospodarz: kogo przenosi (stuknięty gracz)
let bylemGospodarzem = false;
let bylemWyrzucony = false;
let ostatnieUstawienia = null;        // podpis ustawień z poprzedniego odświeżenia lobby
let ostatniaAutoDruzyna = 0;
let podpisLobby = '';
let rozstawienie = null;

function wyslijLobby(z) {
  if (net) net.wyslij(z);
}

function odswiezLobby() {
  if (!pokoj || !wLobby()) return;

  const zywi = net.zywi();
  const jest = (id) => zywi.has(id) || id === mojeId;
  const obecni = pokoj.wLobby.filter((g) => jest(g.id));

  // Samoleczenie: jeśli po resecie logu nie ma nas na liście, zgłaszamy się
  // ponownie — ale nie częściej niż raz na PONOW_PO. Wyrzucony przez
  // gospodarza wraca tylko sam, przyciskiem.
  const teraz = Date.now();
  const naLiscie = pokoj.wLobby.some((g) => g.id === mojeId);
  const wyrzucony = !naLiscie && pokoj.wyrzuceni.has(mojeId);
  if (!naLiscie && !wyrzucony && teraz - ostatnieZgloszenie > PONOW_PO) zglosSie();
  if (wyrzucony && !bylemWyrzucony) pokazInfoLobby('Gospodarz wyrzucił Cię z lobby. Możesz wrócić, kiedy chcesz.');
  bylemWyrzucony = wyrzucony;

  // Gospodarzem lobby jest ten z obecnych, kto dołączył najwcześniej —
  // kolejność zgłoszeń jest w logu taka sama u wszystkich.
  const gospId = obecni.length > 0 ? obecni[0].id : null;
  const gospodarz = gospId === mojeId;
  if (!gospodarz) wybranyGracz = null;
  if (gospodarz && !bylemGospodarzem) el('lobby-ustawienia').open = true;   // gospodarz od razu widzi ustawienia
  bylemGospodarzem = gospodarz;

  const roz = P.rozstaw(pokoj, jest);
  roz.gracze = rozdzielKolory(roz.gracze);
  rozstawienie = roz;
  if (wybranyGracz && !roz.gracze.some((g) => g.id === wybranyGracz)) wybranyGracz = null;   // wyszedł albo wyrzucony
  const ja = roz.gracze.find((g) => g.id === mojeId) || null;
  const czekam = !ja && roz.widzowie.some((g) => g.id === mojeId);

  // Mój przydział z rozstawienia (np. losowy po wejściu) utrwalamy w logu,
  // żeby nie skakał, gdy ktoś wejdzie albo wyjdzie.
  const zapis = pokoj.wLobby.find((g) => g.id === mojeId);
  if (roz.n && ja && zapis && zapis.druzyna !== ja.druzyna && teraz - ostatniaAutoDruzyna > 3000) {
    ostatniaAutoDruzyna = teraz;
    wyslijLobby({ t: 'druzyna', id: mojeId, kto: mojeId, d: ja.druzyna, auto: 1 });
  }

  const wToku = P.partiaZywa(pokoj, net.czas(), polaczony);
  const trwa = el('trwa-gra');
  trwa.hidden = !wToku || !!rg;
  if (wToku) {
    el('trwa-gra-gracze').textContent = pokoj.gracze
      .filter((g) => !pokoj.odeszli.has(g.id))
      .map((g) => g.name).join(', ');
  }

  const gotowych = roz.gracze.filter((g) => g.gotowy).length;
  el('lobby-podtytul').textContent = wToku
    ? 'Trwa partia — poczekaj albo oglądaj.'
    : roz.gracze.length + '/' + P.MAX_GRACZY + ' graczy · ' + nazwaTrybu(roz.n) +
      (roz.gracze.length >= 2 ? ' · gotowi ' + gotowych + '/' + roz.gracze.length : '');

  const steruje = gospodarz && !wToku;    // gospodarz nie zmienia niczego w trakcie cudzej partii
  rysujLobby(roz, gospId, steruje);
  odswiezUstawienia(steruje);

  // Gospodarz zmienił ustawienia — reszta dostaje krótką informację
  // (gotowość i tak się cofnęła, więc trzeba to zauważyć).
  const podpisUst = JSON.stringify(pokoj.ustawienia);
  if (ostatnieUstawienia !== null && podpisUst !== ostatnieUstawienia && !gospodarz && !wToku) {
    const zmiany = U.opisZmian(pokoj.ustawienia);
    pokazInfoLobby('Gospodarz zmienił ustawienia partii' + (zmiany.length ? ': ' + zmiany.join(' · ') : ' na standardowe') + '.');
  }
  ostatnieUstawienia = podpisUst;

  const btn = el('btn-gotowy');
  btn.hidden = !(ja || wyrzucony) || wToku;
  const jestemGotowy = !!(ja && ja.gotowy);
  btn.setAttribute('aria-pressed', jestemGotowy ? 'true' : 'false');
  btn.textContent = wyrzucony ? 'Wracam do lobby' : jestemGotowy ? 'GOTOWY ✓ (stuknij, żeby cofnąć)' : 'GOTOWY';

  // Termin startu żyje we wspólnym logu i w czasie SERWERA. Publikuje go
  // gospodarz, gdy wszyscy są gotowi; każda zmiana składu go kasuje.
  let termin = pokoj.odliczanieDo;
  if (termin !== null && net.czas() - termin > 60000) termin = null;   // termin z dawnej sesji
  // start gospodarza bez GOTOWY (4.9) liczy się jak „wszyscy gotowi”, póki skład na to pozwala
  const gotowi = P.gotowiDoStartu(roz) || (termin !== null && pokoj.odliczanieWymus && P.moznaWymusic(roz));
  const bw = el('btn-start-teraz');
  bw.hidden = !(gospodarz && !wToku && !gotowi && P.moznaWymusic(roz));
  if (gospodarz && !startWToku && !wToku && teraz - ostatnieOdliczanie > 1500) {
    if (gotowi && termin === null) {
      ostatnieOdliczanie = teraz;
      wyslijLobby({ t: 'odliczanie', do: net.czas() + P.ODLICZANIE_S * 1000, v: P.WERSJA });
    } else if (!gotowi && termin !== null) {
      ostatnieOdliczanie = teraz;
      wyslijLobby({ t: 'odliczanie', anuluj: true });
    }
  }

  const box = el('odliczanie');
  if (termin !== null && gotowi && !wToku) {
    box.hidden = false;
    const sek = Math.max(0, Math.ceil((termin - net.czas()) / 1000));
    el('odliczanie-sek').textContent = sek;
    // Partię zakłada gospodarz — ze swoim rozstawieniem i ustawieniami. Reszta
    // próbuje dopiero, gdy on milczy (np. właśnie zamknął kartę); kto faktycznie
    // zakłada partię, rozstrzyga zamek na serwerze.
    if (sek === 0 && (gospodarz || net.czas() - termin > 2500)) startPartii(roz);
  } else {
    box.hidden = true;
  }

  const stary = roz.gracze.some((g) => (g.v | 0) < P.WERSJA);
  el('info-lobby').textContent = Date.now() < infoLobby.do
    ? infoLobby.tekst
    : wToku ? ''
      : wyrzucony ? 'Gospodarz wyrzucił Cię z lobby. Możesz wrócić, kiedy chcesz.'
      : czekam ? 'Lobby pełne (8 graczy) — wejdziesz, gdy zwolni się miejsce. Możesz oglądać.'
        : stary ? 'Ktoś ma starą wersję gry — niech odświeży stronę, inaczej nie da GOTOWY.'
          : ja && ja.color !== mojKolor ? 'Ktoś był szybszy z Twoim kolorem — w tej partii grasz innym.'
            : roz.gracze.length < 2 ? 'Czekamy na drugiego gracza.'
              : roz.n && new Set(roz.gracze.map((g) => g.druzyna)).size < 2 ? 'Wszyscy są w jednej drużynie — ktoś musi przejść do innej.'
                : gotowi ? '' : 'Partia ruszy, gdy wszyscy dadzą GOTOWY.';
}

el('btn-start-teraz').addEventListener('click', () => {
  if (!pokoj || !net || !rozstawienie || !P.moznaWymusic(rozstawienie)) return;
  ostatnieOdliczanie = Date.now();
  wyslijLobby({ t: 'odliczanie', do: net.czas() + P.ODLICZANIE_S * 1000, v: P.WERSJA, wymus: 1 });
});

/* Rysowanie lobby tylko wtedy, gdy coś się zmieniło — odswiezLobby() chodzi
   co pół sekundy, a przebudowa listy pod palcem gubiłaby stuknięcia. */
function rysujLobby(roz, gospId, gospodarz) {
  const podpis = JSON.stringify([roz.n, roz.gracze.map((g) => [g.id, g.name, g.color, g.druzyna, g.gotowy, g.v | 0]),
    roz.widzowie.map((g) => g.name), gospId, gospodarz, wybranyGracz]);
  if (podpis === podpisLobby) return;
  podpisLobby = podpis;

  // tryb gry
  const tryb = el('lobby-tryb');
  tryb.replaceChildren();
  for (const n of TRYBY) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', n === roz.n ? 'true' : 'false');
    b.textContent = n ? n + ' drużyny' : 'Każdy na każdego';
    b.disabled = !gospodarz;
    b.addEventListener('click', () => {
      if (n === pokoj.tryb) return;
      wybranyGracz = null;
      wyslijLobby({ t: 'tryb', id: mojeId, druzyny: n });
    });
    tryb.append(b);
  }
  el('tryb-info').textContent = gospodarz
    ? (roz.n ? 'Jesteś gospodarzem 👑: stuknij gracza, potem wolne miejsce albo innego gracza, żeby go przenieść lub zamienić.'
      : 'Jesteś gospodarzem 👑: ustaw tryb i zasady. Stuknij gracza, żeby oddać mu koronę albo wyrzucić.')
    : (roz.n ? 'Tryb i zasady ustawia gospodarz 👑. Możesz przejść do drużyny, w której jest wolne miejsce.' : 'Tryb i zasady ustawia gospodarz 👑.');

  const kontener = el('lobby-druzyny');
  kontener.replaceChildren();
  kontener.classList.toggle('kilka', roz.n > 1);

  const wiersz = (g) => {
    const li = document.createElement('li');
    if (g.id === mojeId) li.classList.add('ja');
    const kropka = document.createElement('span');
    kropka.className = 'kropka';
    kropka.style.background = g.color;
    const imie = document.createElement('span');
    imie.className = 'imie';
    imie.textContent = g.name;
    imie.style.color = roz.n ? DRUZYNY[g.druzyna].kolor : g.color;
    const ptaszek = document.createElement('span');
    ptaszek.className = 'ptaszek' + (g.gotowy ? '' : ' nie');
    ptaszek.textContent = g.gotowy ? '✓' : '…';
    ptaszek.title = g.gotowy ? 'gotowy' : 'jeszcze nie gotowy';
    li.append(kropka, imie);
    if ((g.v | 0) < P.WERSJA) { const z = znacznik('STARA WERSJA'); z.classList.add('stara'); li.append(z); }
    if (g.id === gospId) {
      const k = document.createElement('span');
      k.className = 'korona';
      k.textContent = '👑';
      k.title = 'gospodarz lobby';
      imie.before(k);
    }
    // w wąskich kartach drużyn „TY” zjadałoby nick — tam wystarcza ramka wiersza
    if (g.id === mojeId && !roz.n) li.append(znacznik('TY'));
    li.append(ptaszek);
    if (gospodarz && (roz.n || g.id !== mojeId)) {
      li.classList.add('klikalny');
      li.setAttribute('role', 'button');
      li.tabIndex = 0;
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stuknietoGracza(g); } });
      if (g.id === wybranyGracz) li.classList.add('wybrany');
      li.addEventListener('click', () => stuknietoGracza(g));
    }
    return li;
  };

  if (!roz.n) {
    const ul = document.createElement('ul');
    ul.className = 'lista-graczy';
    for (const g of roz.gracze) ul.append(wiersz(g));
    kontener.append(ul);
  } else {
    for (let d = 0; d < roz.n; d++) {
      const info = DRUZYNY[d];
      const sklad = roz.gracze.filter((g) => g.druzyna === d);
      const box = document.createElement('section');
      box.className = 'druzyna';
      box.style.setProperty('--kolor-druzyny', info.kolor);
      const h = document.createElement('h3');
      const nazwa = document.createElement('span');
      nazwa.textContent = info.nazwa;
      const ile = document.createElement('small');
      ile.textContent = sklad.length + '/' + roz.pojemnosc;
      h.append(nazwa, ile);
      const ul = document.createElement('ul');
      ul.className = 'lista-graczy';
      for (const g of sklad) ul.append(wiersz(g));
      if (sklad.length < roz.pojemnosc) {
        const li = document.createElement('li');
        li.className = 'wolne';
        const mojaD = (roz.gracze.find((g) => g.id === mojeId) || {}).druzyna;
        const przenosze = gospodarz && wybranyGracz && roz.gracze.find((g) => g.id === wybranyGracz)?.druzyna !== d;
        const przechodze = !przenosze && mojaD !== undefined && mojaD !== d;
        li.textContent = przenosze ? 'Przenieś tutaj' : przechodze ? 'Przejdź tutaj' : 'wolne miejsce';
        if (przenosze || przechodze) {
          li.classList.add('klikalny');
          li.setAttribute('role', 'button');
          li.addEventListener('click', () => {
            const kto = przenosze ? wybranyGracz : mojeId;
            wybranyGracz = null;
            wyslijLobby({ t: 'druzyna', id: mojeId, kto, d });
          });
        }
        ul.append(li);
      }
      box.append(h, ul);
      kontener.append(box);
    }
  }

  const widz = el('lobby-widzowie');
  widz.hidden = !roz.widzowie.length;
  widz.textContent = roz.widzowie.length ? 'Czekają na miejsce: ' + roz.widzowie.map((g) => g.name).join(', ') : '';

  rysujAkcje(roz, gospodarz);
}

/* Pasek akcji gospodarza: co zrobić ze stukniętym graczem (oddać koronę,
   wyrzucić z lobby) i — w drużynach — losowanie składów. */
function rysujAkcje(roz, gospodarz) {
  const box = el('lobby-akcje');
  box.replaceChildren();
  const g = gospodarz && wybranyGracz ? roz.gracze.find((x) => x.id === wybranyGracz) : null;
  const przycisk = (tekst, fn, klasa) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = tekst;
    if (klasa) b.className = klasa;
    b.addEventListener('click', fn);
    box.append(b);
    return b;
  };
  if (g && g.id !== mojeId) {
    const kto = document.createElement('span');
    kto.className = 'kto';
    kto.textContent = 'Wybrany: ' + g.name + (roz.n ? ' — stuknij miejsce w innej drużynie albo:' : '');
    box.append(kto);
    przycisk('👑 Oddaj koronę', () => {
      wybranyGracz = null;
      wyslijLobby({ t: 'korona', id: mojeId, kto: g.id });
    });
    przycisk('Wyrzuć z lobby', () => {
      wybranyGracz = null;
      wyslijLobby({ t: 'wyrzuc', id: mojeId, kto: g.id });
      pokazInfoLobby(g.name + ' wyleciał z lobby. Może wrócić sam, gdy zechce.');
    }, 'grozny');
    przycisk('Anuluj', () => { wybranyGracz = null; podpisLobby = ''; odswiezLobby(); });
  } else if (gospodarz && roz.n && roz.gracze.length >= 2) {
    przycisk('🎲 Losuj drużyny', () => losujDruzyny(roz));
  }
  box.hidden = !box.children.length;
}

/* Losowe, wyrównane drużyny: tasujemy graczy i rozdajemy po kolei. */
function losujDruzyny(roz) {
  const gracze = roz.gracze.map((g) => g.id);
  for (let i = gracze.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [gracze[i], gracze[j]] = [gracze[j], gracze[i]];
  }
  // drużyny też w losowej kolejności, żeby nieparzysty nie trafiał zawsze do Czerwonych
  const kolej = Array.from({ length: roz.n }, (_, d) => d).sort(() => Math.random() - 0.5);
  const d = {};
  gracze.forEach((id, i) => { d[id] = kolej[i % roz.n]; });
  wybranyGracz = null;
  wyslijLobby({ t: 'sklad', id: mojeId, d });
}

/* ---------- ustawienia partii (gospodarz) ---------- */

/* Pola budujemy raz, potem tylko podmieniamy wartości — przebudowa
   zamykałaby rozwiniętą listę pod palcem gospodarza. */
const polaUstawien = new Map();
{
  const siatka = el('ustawienia-siatka');
  for (const o of U.USTAWIENIA) {
    const label = document.createElement('label');
    label.className = 'ustawienie';
    const nazwa = document.createElement('span');
    nazwa.textContent = o.nazwa;
    let sel;
    if (o.liczba) {
      // od 4.5: życie, czas tury i rundę lawy gospodarz wpisuje sam
      sel = document.createElement('input');
      sel.type = 'number';
      sel.inputMode = 'numeric';
      sel.min = String(o.liczba.min);
      sel.max = String(o.liczba.max);
      sel.step = '1';
      if (o.liczba.zero) sel.title = '0 = ' + o.liczba.zero;
      sel.addEventListener('change', () => {
        const w = U.zLiczby(o.klucz, sel.value);
        if (w === null || !pokoj) { sel.value = String(pokoj ? pokoj.ustawienia[o.klucz] : o.dom); return; }
        sel.value = String(w);
        wyslijLobby({ t: 'ustaw', id: mojeId, klucz: o.klucz, w });
      });
      sel.addEventListener('keydown', (e) => { if (e.key === 'Enter') sel.blur(); });
    } else {
      sel = document.createElement('select');
      for (const [w, tekst] of o.opcje) {
        const op = document.createElement('option');
        op.value = String(w);
        op.textContent = tekst;
        sel.append(op);
      }
      sel.addEventListener('change', () => {
        const w = o.opcje.find(([v]) => String(v) === sel.value);
        if (!w || !pokoj) return;
        wyslijLobby({ t: 'ustaw', id: mojeId, klucz: o.klucz, w: w[0] });
      });
    }
    if (o.liczba && o.liczba.zero) sel.placeholder = '0 = ' + o.liczba.zero;
    label.append(nazwa, sel);
    siatka.append(label);
    polaUstawien.set(o.klucz, { label, sel });
  }
  el('btn-ustawienia-reset').addEventListener('click', () => wyslijLobby({ t: 'ustaw', id: mojeId, domyslne: 1 }));
}

function odswiezUstawienia(gospodarz) {
  const u = pokoj.ustawienia;
  const d = U.domyslne();
  for (const [klucz, { label, sel }] of polaUstawien) {
    const w = String(u[klucz]);
    if (sel.value !== w && document.activeElement !== sel) sel.value = w;
    if (sel.disabled === gospodarz) sel.disabled = !gospodarz;
    label.classList.toggle('zmienione', u[klucz] !== d[klucz]);
  }
  const zmiany = U.opisZmian(u);
  const skrot = el('ustawienia-skrot');
  skrot.textContent = zmiany.length ? zmiany.join(' · ') : 'standardowe';
  skrot.classList.toggle('standard', !zmiany.length);
  el('btn-ustawienia-reset').hidden = !gospodarz || !zmiany.length;
}

/* Gospodarz: pierwsze stuknięcie wybiera gracza, drugie w innego gracza
   (z innej drużyny) zamienia ich miejscami, w tego samego — odznacza. */
function stuknietoGracza(g) {
  const roz = rozstawienie;
  if (!roz) return;
  if (!roz.n || !wybranyGracz || wybranyGracz === g.id) {
    wybranyGracz = wybranyGracz === g.id ? null : g.id;
  } else {
    const a = roz.gracze.find((x) => x.id === wybranyGracz);
    if (a && a.druzyna !== g.druzyna) {
      wyslijLobby({ t: 'zamien', id: mojeId, a: a.id, b: g.id, da: a.druzyna, db: g.druzyna });
      wybranyGracz = null;
    } else {
      wybranyGracz = g.id;
    }
  }
  podpisLobby = '';
  odswiezLobby();
}

el('btn-gotowy').addEventListener('click', () => {
  if (pokoj && !pokoj.wLobby.some((g) => g.id === mojeId)) {   // wyrzucony wraca
    zglosSie();
    pokazInfoLobby('Wracasz do lobby…');
    return;
  }
  const ja = rozstawienie && rozstawienie.gracze.find((g) => g.id === mojeId);
  if (!ja) return;
  wyslijLobby({ t: 'gotowy', id: mojeId, tak: !ja.gotowy });
});

function znacznik(tekst) {
  const z = document.createElement('span');
  z.className = 'znacznik';
  z.textContent = tekst;
  return z;
}

el('btn-ogladaj').addEventListener('click', () => {
  opuszczonySeed = null;
  if (pokoj && pokoj.faza === 'gra') zbudujGre();
});

async function startPartii(roz) {
  if (startWToku) return;
  startWToku = true;
  try {
    const ustawienia = U.normalizuj(pokoj.ustawienia);
    // Styl mapy wynika z seeda — przy wybranej mapie losujemy, aż wypadnie ten styl.
    let seed = (Math.random() * 0xffffffff) >>> 0;
    const zSeeda = ustawienia.mapa !== 'losowa' && ustawienia.mapa !== 'ekstremalna';   // ekstremalnej nie ma w losowaniu
    for (let i = 0; i < 400 && zSeeda && stylMapy(seed) !== ustawienia.mapa; i++) {
      seed = (Math.random() * 0xffffffff) >>> 0;
    }
    // Jeśli ktoś nas ubiegł, serwer odpowie { ok: false } i niczego nie założy.
    await net.wyslij({
      t: 'nowa',
      seed,
      druzyny: roz.n,
      ustawienia,
      v: P.WERSJA,
      gracze: roz.gracze.map((g) => ({ id: g.id, name: g.name, color: g.color, akc: g.akc || null, druzyna: g.druzyna }))
    });
  } finally {
    setTimeout(() => { startWToku = false; }, 4000);
  }
}

/* ---------- gra ---------- */

function zbudujGre() {
  if (!pokoj || pokoj.seed === null || !pokoj.gracze.length) return;

  rg = P.nowaRozgrywka(pokoj, mojeId);
  rg.ui.length = 0;       // teren i tak malujemy niżej w całości
  D.muzykaStart();
  pingi = [];
  ustawTrybPingu(false);

  if (!renderer) renderer = R.createRenderer(plotno);
  dopasujPlotno();
  R.buildTerrain(renderer, rg.state.terrain);
  kamera = R.createCamera();
  fx = createFx();
  zoomGracza = 1;
  podgladMapy = false;
  el('btn-mapa').setAttribute('aria-pressed', 'false');
  czekamOd = null;

  if (!sterowanie) {
    sterowanie = attachInput({
      getState: () => (rg ? rg.state : null),
      mogeGrac: () => !!rg && P.mogeGrac(rg, pokoj),
      mogeUciekac: () => !!rg && P.mogeUciekac(rg),
      plotno,
      przyciski: el('dotyk'),
      ekranNaSwiat: (sx, sy) => R.ekranNaSwiat(renderer, kamera, sx, sy),
      onBron: wybierzBron,
      onEkwipunek: () => ekwipunek.przelacz(),
      onEmotki: () => przelaczEmotki(),
      onObrot: () => obrocMost(),
      onMapa: () => przelaczPodgladMapy(),
      onPing: (x, y) => wyslijPing(x, y),
      trybPingu: () => trybPingu,
      onLina: () => {
        const wynik = S.linaPrzelacz(rg.state);
        if (wynik === 'pudlo') pokazInfo('Lina nie sięga — celuj w skałę bliżej (do ok. 400 px).');
        else if (wynik === 'brak') pokazInfo('Lina ninja się skończyła.');
      },
      zamknijEkwipunek: () => { ekwipunek.zamknij(); zamknijEmotki(); },
      onPodpowiedz: pokazInfo,
      onPrzesun: (dx, dy) => {
        kamera.tx -= dx / kamera.zoom;
        kamera.ty -= dy / kamera.zoom;
        kamera.x -= dx / kamera.zoom;
        kamera.y -= dy / kamera.zoom;
        recznaKameraDo = performance.now() + 4000;
      },
      onZoom: (f) => {
        zoomGracza = Math.max(minZoomGracza(), Math.min(2.2, zoomGracza * f));
        podgladMapy = false;
        el('btn-mapa').setAttribute('aria-pressed', 'false');
        // Zoom nie zabiera kamery robalowi — dawniej po oddaleniu przez 1,5 s nikt
        // nie był śledzony. Przedłużamy tylko ręczny tryb, jeśli ktoś przesuwał kamerę.
        const teraz = performance.now();
        if (teraz < recznaKameraDo) recznaKameraDo = Math.max(recznaKameraDo, teraz + 1500);
      }
    });
  }

  for (const e of EKRANY) el(e).hidden = true;
  el('nawigacja').hidden = true;
  hud.hidden = false;
  el('baner-obserwator').hidden = !rg.obserwator;
  el('baner-info').hidden = true;

  const w = S.activeWorm(rg.state);
  if (w) { kamera.x = kamera.tx = w.x; kamera.y = kamera.ty = w.y - 40; }
  kamera.zoom = kamera.tzoom = bazowyZoom();

  pokazTure();
  rysujBronie();
  odswiezPelnyEkran();
  pasy.pomiar = -1e9;
  pasy.swieze = true;
  tura = pustaTura();
  partia = pustaPartia();
  const zasady = U.opisZmian(rg.state.ust).filter((z) => !z.startsWith('mapa'));
  const opisMapy = (OPISY_MAP[rg.state.terrain.styl] || '') + (zasady.length ? ' Zasady: ' + zasady.join(' · ') + '.' : '');
  if (dotykowy() && window.innerHeight > window.innerWidth * 1.2) {
    pokazInfo('Obróć telefon poziomo — zobaczysz więcej areny.');
  } else if (opisMapy) {
    pokazInfo(opisMapy);
  }

  ostatniCzas = performance.now();
  if (!petlaDziala) { petlaDziala = true; requestAnimationFrame(petla); }
}

function zakonczGre() {
  D.muzykaStop();
  rg = null;
  sterowanie?.zwolnij();
  ekwipunek.zamknij();
  zamknijEmotki();
  hud.hidden = true;
  document.body.classList.remove('moja-tura');
  // po partii z powrotem na ekran Areny, w lobby tej samej areny
  otworzArene();
  if (net) {
    net.ustawTryb('lobby');
    zglosSie();
  }
}

/* Wyjście z partii przyciskiem. Uczestnik: najpierw oddaje turę (jeśli ją
   ma), potem 'wyjdz' — jego robal znika z areny na granicy tury, a reszta
   gra dalej bez czekania. Widz po prostu wraca do lobby. */
el('btn-opusc').addEventListener('click', async () => {
  if (!rg) return;
  const uczestnik = !rg.obserwator && rg.state.phase !== 'over';
  if (uczestnik && !window.confirm('Opuścić grę? Twój robal zniknie z areny, a reszta zagra dalej.')) return;
  const seed = rg.seed;
  if (uczestnik) {
    for (const z of P.opuszczam(rg, pokoj)) await net.wyslij(z);
    // partia się nie liczy, ale zdobyte w niej osiągnięcia zostają na koncie
    if (partia.nowe.length) wyslijWynikPartii({ partia: String(seed), tylkoOsiagniecia: true, osiagniecia: partia.nowe.map((o) => o.id) });
  }
  opuszczonySeed = seed;
  zakonczGre();
  pokazInfoLobby(uczestnik ? 'Wyszedłeś z partii.' : '');
});

el('btn-znowu').addEventListener('click', () => {
  opuszczonySeed = rg ? rg.seed : opuszczonySeed;
  zakonczGre();
});

function odswiezPelnyEkran() {
  const btn = el('btn-pelny');
  const da = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
  btn.hidden = !da || !dotykowy();
}
el('btn-pelny').addEventListener('click', () => {
  const d = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  } else {
    const f = d.requestFullscreen || d.webkitRequestFullscreen;
    f?.call(d, { navigationUI: 'hide' })?.catch?.(() => {});
    try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch { /* nie wszędzie */ }
  }
});

/* ---------- pętla ---------- */

function petla(teraz) {
  requestAnimationFrame(petla);
  if (!rg || !pokoj || !net) return;

  let dt = (teraz - ostatniCzas) / 1000;
  ostatniCzas = teraz;
  if (dt > 0.25) dt = 0.25;
  if (dt < 0) dt = 0;

  const st = rg.state;
  sterowanie.apply();
  P.klatka(rg, pokoj, {
    teraz: net.czas(),
    dt,
    obecnosc: net.obecnosc,
    obecnoscTeraz: net.obecnoscTeraz,
    obecnoscSwieza: net.obecnoscSwieza(),
    ruchCo: RUCH_CO
  });
  while (rg.doWyslania.length) net.wyslij(rg.doWyslania.shift());

  obsluzSygnaly();
  obsluzZdarzenia();
  const moge = P.mogeGrac(rg, pokoj);
  podgladNaZywo(dt, moge);

  if (st.phase === 'koniec' || (rg.mojaAkcja && !pokoj.akcje.has(st.turnNumber))) {
    net.ustawTryb('czekam');
    if (czekamOd === null) czekamOd = teraz;
  } else {
    czekamOd = null;
    net.ustawTryb(st.phase === 'over' ? 'lobby' : moge ? 'mojaTura' : 'cudzaTura');
  }

  for (const p of st.projectiles) {
    if (WEAPONS[p.weapon].kind === 'pocisk') emitTrail(fx, p.x, p.y);
  }

  pasyHud(teraz, dt);
  ustawKamere(teraz);
  R.updateCamera(kamera, dt, renderer.viewW, renderer.viewH, pasy.dol);
  trzymajWKadrze();
  stepFx(fx, dt);

  renderer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // trzęsienie po wybuchu: przesuwamy tylko obraz, kamera zostaje na miejscu
  const tx = wstrzas > 0.3 ? (Math.random() - 0.5) * wstrzas / kamera.zoom : 0;
  const ty = wstrzas > 0.3 ? (Math.random() - 0.5) * wstrzas / kamera.zoom : 0;
  kamera.x += tx; kamera.y += ty;
  R.draw(renderer, st, kamera, fx, dt, {
    mojeId,
    rozlaczeni: rozlaczeni(),
    celNalotu: celNalotu(moge),
    emotki: aktywneEmotki(),
    pingi: aktywnePingi(),
    akcesoria: akcesoriaPartii(),
    zebraneSkrzynki: podglad.nr === st.turnNumber ? podglad.skrzynki : null
  });
  kamera.x -= tx; kamera.y -= ty;
  wstrzas *= Math.max(0, 1 - dt * 7);
  odswiezHud(moge, teraz);
  rysujMinimape(st);
}

/* ---------- emotki, tańce i obserwatorzy (4.3.1) ---------- */

/* Emotka to zdarzenie w logu pokoju { t: 'emotka', id, e }. Pokazujemy tylko
   świeże (≤ 6 s wg zegara serwera) — po dołączeniu nie odtwarzamy starych. */
const emotkiGraczy = new Map();       // id robala → { def, od (ms, performance.now) }
let emotkiIndeks = 0;                 // do którego zdarzenia w net.zdarzenia już przejrzeliśmy
let ostatniaEmotka = -Infinity;

function czytajEmotki() {
  const zd = net.zdarzenia;
  if (emotkiIndeks > zd.length) emotkiIndeks = 0;     // nowa epoka — log od zera
  for (; emotkiIndeks < zd.length; emotkiIndeks++) {
    const z = zd[emotkiIndeks];
    if (z && z.t === 'ping' && typeof z.id === 'string') { dodajPing(z); continue; }
    if (!z || z.t !== 'emotka' || typeof z.id !== 'string') continue;
    const def = emotka(z.e);
    if (!def || net.czas() - (z.st || 0) > 6000) continue;
    emotkiGraczy.set(z.id, { def, od: performance.now() });
    D.graj('emotka');
  }
}

/* Pingi (4.9): { t: 'ping', id, x, y } w logu pokoju — znacznik na mapie widoczny dla
   wszystkich przez PING_S sekund. Jak emotki: protokół partii go nie zna, symulacja też nie. */
const PING_S = 5, PING_CO = 900;
let pingi = [];                        // { id, x, y, od, kolor, nick }
let ostatniPing = -Infinity, trybPingu = false;
function dodajPing(z) {
  if (typeof z.x !== 'number' || typeof z.y !== 'number' || net.czas() - (z.st || 0) > PING_S * 1000) return;
  const g = pokoj && (pokoj.gracze.find((x) => x.id === z.id) || pokoj.wLobby.find((x) => x.id === z.id));
  pingi = pingi.filter((p) => p.id !== z.id);       // jeden znacznik na gracza — nowy zastępuje stary
  pingi.push({ id: z.id, x: z.x, y: z.y, od: performance.now(), kolor: (g && g.color) || '#ffe9c8', nick: g ? g.name : '?' });
  if (pingi.length > 12) pingi.shift();
  D.graj('ping');
}
function aktywnePingi() {
  const teraz = performance.now();
  pingi = pingi.filter((p) => teraz - p.od < PING_S * 1000);
  return pingi.map((p) => ({ ...p, t: (teraz - p.od) / 1000, dl: PING_S }));
}
function wyslijPing(x, y) {
  ustawTrybPingu(false);
  if (!rg || !net) return;
  const teraz = performance.now();
  if (teraz - ostatniPing < PING_CO) return;
  ostatniPing = teraz;
  const { w, h } = R.rozmiarSwiata();
  net.wyslij({ t: 'ping', id: mojeId, x: Math.round(Math.max(0, Math.min(w, x))), y: Math.round(Math.max(-300, Math.min(h, y))) });
}
function ustawTrybPingu(tak) {
  trybPingu = !!tak;
  el('btn-ping').setAttribute('aria-pressed', trybPingu ? 'true' : 'false');
  document.body.classList.toggle('tryb-ping', trybPingu);
  if (trybPingu) pokazInfo('Stuknij miejsce na mapie (albo na minimapie) — zobaczą je wszyscy.');
}
el('btn-ping').addEventListener('click', (e) => {
  ustawTrybPingu(!trybPingu);
  if (e.detail > 0) e.currentTarget.blur();
});

/* Akcesoria robali w partii (z 'nowa.gracze') — mapa id → akcesorium dla render.js. */
let akcPodpis = null, akcMapa = new Map();
function akcesoriaPartii() {
  const gracze = pokoj && pokoj.gracze || [];
  if (gracze !== akcPodpis) {
    akcPodpis = gracze;
    akcMapa = new Map(gracze.filter((g) => g && g.akc).map((g) => [g.id, g.akc]));
  }
  return akcMapa;
}

function aktywneEmotki() {
  czytajEmotki();
  const teraz = performance.now();
  const wynik = new Map();
  for (const [id, { def, od }] of emotkiGraczy) {
    const dl = def.taniec ? TANIEC_S : EMOTKA_S;
    const t = (teraz - od) / 1000;
    if (t > dl) { emotkiGraczy.delete(id); continue; }
    wynik.set(id, { tekst: def.tekst, taniec: def.taniec || null, t, dl });
  }
  return wynik;
}

/* Emotki wysyła tylko żywy uczestnik partii — w swojej turze i w cudzej. */
function mogeEmotki() {
  if (!rg || rg.obserwator || rg.state.phase === 'over') return false;
  return rg.state.worms.some((w) => mojRobal(w) && w.alive && !w.odszedl);
}

/* Robal, którym steruję (od 4.8 gracz może mieć ich kilka: id, id#2, id#3). */
function mojRobal(w) {
  return !!w && S.wlasciciel(w) === mojeId;
}

const panelEmotek = el('emotki-panel');
for (const def of EMOTKI) {
  const b = document.createElement('button');
  b.type = 'button';
  b.title = def.nazwa;
  b.setAttribute('aria-label', def.nazwa);
  if (def.taniec) {
    b.className = 'taniec';
    const ik = document.createElement('span');
    ik.textContent = def.tekst;
    const n = document.createElement('span');
    n.textContent = def.nazwa;
    b.append(ik, n);
  } else {
    b.textContent = def.tekst;
  }
  b.addEventListener('click', () => wyslijEmotke(def.id));
  panelEmotek.append(b);
}
el('btn-emotki').addEventListener('click', (e) => {
  przelaczEmotki();
  if (e.detail > 0) e.currentTarget.blur();   // spacja (skok) nie ma „klikać” przycisku
});

function przelaczEmotki() {
  if (!panelEmotek.hidden) { zamknijEmotki(); return; }
  if (!mogeEmotki()) return;
  ekwipunek.zamknij();
  panelEmotek.hidden = false;
  // panel wisi tuż nad przyciskiem 💬 przy broni (na telefonie pionowo pasek broni jest wyżej)
  const r = el('btn-emotki').getBoundingClientRect();
  panelEmotek.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + 'px';
  el('btn-emotki').setAttribute('aria-expanded', 'true');
}
function zamknijEmotki() {
  panelEmotek.hidden = true;
  el('btn-emotki').setAttribute('aria-expanded', 'false');
}

function wyslijEmotke(id) {
  zamknijEmotki();
  if (!mogeEmotki()) return;
  const teraz = performance.now();
  if (teraz - ostatniaEmotka < EMOTKA_CO) { pokazInfo('Spokojnie z emotkami — chwila przerwy.'); return; }
  ostatniaEmotka = teraz;
  net.wyslij({ t: 'emotka', id: mojeId, e: id });
}

/* Most: R albo ⟳ obraca belkę co 22,5° (tylko w mojej turze, przed strzałem). */
function obrocMost() {
  if (!rg || !P.mogeGrac(rg, pokoj) || rg.state.weapon !== 'most') return;
  const k = S.obrocMost(rg.state);
  pokazInfo('Most: ' + (k * 22.5).toString().replace('.', ',') + '° — R albo ⟳ obraca dalej.');
}
el('btn-obrot').addEventListener('click', (e) => {
  obrocMost();
  if (e.detail > 0) e.currentTarget.blur();
});

/* Obserwatorzy: obecni w pokoju, którzy nie grają w tej partii (albo z niej wyszli). */
function liczObserwatorow() {
  if (!pokoj || !net) return 0;
  let n = 0;
  for (const id of net.zywi()) {
    const gra = pokoj.gracze.some((g) => g.id === id) && !pokoj.odeszli.has(id);
    if (!gra) n++;
  }
  if (rg && rg.obserwator && !net.zywi().has(mojeId)) n++;   // ja sam, zanim puls do mnie wróci
  return n;
}

/* Gracze, którzy od dłuższej chwili nie dają znaku życia (do podpisu). */
function rozlaczeni() {
  const zbior = new Set();
  if (!rg || !net.obecnoscSwieza()) return zbior;
  for (const w of rg.state.worms) {
    if (w.alive && P.rozlaczonyOd(rg, pokoj, netCtx(), w.id) >= P.ROZLACZONY_PAS * 1000) zbior.add(w.id);
  }
  return zbior;
}

function netCtx() {
  return { obecnosc: net.obecnosc, obecnoscTeraz: net.obecnoscTeraz, obecnoscSwieza: net.obecnoscSwieza() };
}

function celNalotu(moge) {
  const st = rg.state;
  if (st.phase !== 'aim') return null;
  if (moge) {
    if (!WEAPONS[st.weapon]?.celowany || !st.cel) return null;
    const most = st.weapon === 'most';
    const akt = S.activeWorm(st);
    return { ...st.cel, teleport: st.weapon === 'teleport', most, k: most ? st.mostObrot : 0,
      zle: most && !!akt && !!S.powodBrakuMostu(st, akt, st.cel) };
  }
  const akt = S.activeWorm(st);
  return akt && akt.widok && akt.widok.cel
    ? { ...akt.widok.cel, teleport: akt.widok.bron === 'teleport', most: akt.widok.bron === 'most', k: akt.widok.mostK || 0 }
    : null;
}

/* Cudza tura: pozycja i celownik z podglądu na żywo, wygładzone. Sama
   symulacja tego nie widzi — prawdziwy stan przychodzi w strzale. */
function podgladNaZywo(dt, moge) {
  const st = rg.state;
  const akt = S.activeWorm(st);
  const ruch = net.ruch;
  for (const w of st.worms) if (w !== akt) w.widok = null;
  if (!akt) return;
  if (podglad.nr !== st.turnNumber) podglad = { nr: st.turnNumber, efekt: 0, skrzynki: new Set() };
  const gracz = S.wlasciciel(akt);
  if (ruch && ruch.nr === st.turnNumber && ruch.id === gracz && ruch.id !== mojeId) pokazEfekty(ruch, akt);
  if (moge || st.phase !== 'aim' || !ruch || ruch.nr !== st.turnNumber || ruch.id !== gracz || ruch.id === mojeId) {
    akt.widok = null;
    return;
  }
  if (!akt.widok) akt.widok = { x: akt.x, y: akt.y, facing: akt.facing, angle: akt.angle, moc: 0, cel: null };
  const v = akt.widok;
  // przez własny serwer podgląd przychodzi co 0,1 s, więc może gonić szybciej
  const k = Math.min(1, dt * 16);   // podgląd przychodzi co RUCH_CO (0,1 s)
  v.x += (ruch.x - v.x) * k;
  v.y += (ruch.y - v.y) * k;
  v.facing = ruch.f;
  let dk = ruch.k - v.angle;
  while (dk > Math.PI) dk -= 2 * Math.PI;
  while (dk < -Math.PI) dk += 2 * Math.PI;
  v.angle += dk * k;
  v.moc = ruch.m || 0;
  v.bron = ruch.b;
  v.zapas = typeof ruch.z === 'number' ? ruch.z : undefined;
  v.amunicja = ruch.a && typeof ruch.a === 'object' ? ruch.a : null;
  if (typeof ruch.h === 'number') v.hp = ruch.h;
  v.cel = Array.isArray(ruch.c) ? { x: ruch.c[0], y: ruch.c[1] } : null;
  v.lina = Array.isArray(ruch.l) ? { x: ruch.l[0], y: ruch.l[1] } : null;
  v.mostK = Number.isInteger(ruch.o) ? ruch.o : 0;
}

/* Cudza tura przed strzałem: widz nie liczy cudzego chodzenia, więc upadek,
   zebraną skrzynkę i śmierć zna tylko z podglądu (ruch.e: [nr, rodzaj, x, y, …]).
   Pokazujemy każde zdarzenie raz — w podglądzie lecą ostatnie, z numerami. */
let podglad = { nr: -1, efekt: 0, skrzynki: new Set() };
function pokazEfekty(ruch, akt) {
  if (!Array.isArray(ruch.e)) return;
  for (const e of ruch.e) {
    if (!Array.isArray(e) || !(e[0] > podglad.efekt)) continue;
    podglad.efekt = e[0];
    const [, rodzaj, x, y, a, b] = e;
    if (rodzaj === 'o') {
      emitTekst(fx, x, y - 34, '-' + a, '#ff7a55');
    } else if (rodzaj === 'd') {
      emitTekst(fx, x, y - 50, a ? 'do lawy!' : 'RIP', '#ffd93b', 17);
    } else if (rodzaj === 's') {
      podglad.skrzynki.add(a);
      emitSpark(fx, x, y - 8, 16);
      const apteczka = typeof b === 'number';
      emitTekst(fx, x, y - 30, apteczka ? '+' + b + ' HP' : '+1 ' + (WEAPONS[b] ? WEAPONS[b].name : '?'),
        apteczka ? '#7dff9a' : '#ffd23b', 16);
      pokazInfo(akt.name + (apteczka ? ' zebrał apteczkę: +' + b + ' HP' : ' zebrał zaopatrzenie: +1 ' + (WEAPONS[b] ? WEAPONS[b].name : '?')));
    }
  }
}

/* Sygnały z protokołu: nowa tura, przebudowa terenu, wyrzucenie. */
function obsluzSygnaly() {
  for (const u of rg.ui) {
    // Teren przebudowany w całości (korekta albo przesymulowanie) — malujemy od nowa.
    if (u.przebudowa || u.typ === 'teren') R.buildTerrain(renderer, rg.state.terrain);
    if (u.typ === 'stan') {
      if (u.koniec) pokazKoniec(rg.state.winner);
      else pokazTure();
    }
    if (u.typ === 'wyrzucony') {
      el('baner-obserwator').hidden = false;
      el('baner-obserwator').textContent = 'Wypadłeś z gry — zbyt długo nie było połączenia. Oglądasz dalej.';
    }
  }
  rg.ui.length = 0;
}

function pokazTure() {
  const st = rg.state;
  if (st.phase !== 'aim') return;
  const akt = S.activeWorm(st);
  if (!akt) return;
  const moja = mojRobal(akt) && !rg.obserwator;
  napis(moja ? 'TWOJA TURA' : 'Tura: ' + akt.name, !moja);
  D.graj(moja ? 'mojaTura' : 'tura');
  if (tura.kto && tura.nr !== st.turnNumber) {
    const moja = mojRobal(tura.kto) && !rg.obserwator;
    if (tura.suma >= 50) {
      pokazInfo((moja ? 'Twój strzał' : 'Strzał ' + tura.kto.name) + ': ' + tura.suma + ' obrażeń' + (tura.suma >= 100 ? ' — MASAKRA!' : '!'));
      if (moja) {
        const staty = wczytajStaty();
        if (tura.suma > staty.rekordTury) { staty.rekordTury = tura.suma; zapisz('arena:staty', JSON.stringify(staty)); }
      }
    }
    tura = pustaTura();
  }
  if (partia.os.tura.nr !== -1 && partia.os.tura.nr !== st.turnNumber && !rg.obserwator) {
    const zywy = st.worms.some((x) => mojRobal(x) && x.alive);
    for (const id of koniecTuryOs(partia.os, { mojeId, jaZywy: zywy })) zdobadz(id);
  }
  recznaKameraDo = 0;
  if (moja) {
    // Ostatnio wybrana broń — o ile jest jeszcze amunicja.
    st.weapon = (akt.amunicja[mojaBron] ?? 1) > 0 ? mojaBron : 'bazooka';
    try { navigator.vibrate?.([70, 50, 70]); } catch { /* nie wszędzie */ }
  }
  rysujBronie();
}

let napisTimer = null;
function napis(tekst, cudza) {
  const n = el('napis-tury');
  n.textContent = tekst;
  n.classList.toggle('cudza', !!cudza);
  n.hidden = false;
  n.style.animation = 'none';
  void n.offsetWidth;
  n.style.animation = '';
  clearTimeout(napisTimer);
  napisTimer = setTimeout(() => { n.hidden = true; }, 1900);
}

let infoTimer = null;
function pokazInfo(tekst) {
  const b = el('baner-info');
  b.textContent = tekst;
  b.hidden = false;
  clearTimeout(infoTimer);
  infoTimer = setTimeout(() => { b.hidden = true; }, 3500);
}

function wybierzBron(id) {
  const w = WEAPONS[id];
  if (!w || w.ukryta) return;
  mojaBron = id;
  zapisz('arena:bron', id);
  if (rg && P.mogeGrac(rg, pokoj)) {
    const st = rg.state;
    const akt = S.activeWorm(st);
    if ((akt.amunicja[id] ?? 1) <= 0) {
      // ekwipunek zostaje otwarty — można od razu wybrać coś innego
      pokazInfo(id === 'kij' ? 'Kij tylko ze skrzynki z zaopatrzeniem!' : w.name + ': brak amunicji.');
      return;
    }
    if (st.charging) return;
    st.weapon = id;
    if (w.kind === 'lina') {
      pokazInfo(dotykowy() ? 'Celuj w skałę i stuknij OGNIA — hak się zaczepi. ◀ ▶ bujanie, ▲▼ lina, OGNIA/SKOK puszcza.'
        : 'Celuj w skałę i wciśnij F — hak się zaczepi. A/D bujanie, W/S lina, F albo spacja puszcza.');
    } else if (w.celowany) {
      const co = id === 'teleport' ? 'miejsce teleportu' : id === 'most' ? 'miejsce mostu (blisko robala)' : 'cel nalotu';
      pokazInfo(dotykowy() ? 'Dotknij mapy, żeby wskazać ' + co + ', potem OGNIA.' : 'Kliknij na mapie ' + co + ', potem przytrzymaj F.');
    }
  }
  ekwipunek.zamknij();
  rysujBronie();
}

/* Który pocisk śledzi kamera. Pamiętamy wybór (ten sam obiekt, dopóki leci)
   i zmieniamy go z opóźnieniem — inaczej przy wolno spadającym dynamicie albo
   odbijającym się granacie kamera skakała co klatkę między pociskiem a robalem. */
let sledzony = null;          // śledzony pocisk
let wolnyOd = 0;              // od kiedy ten pocisk jest wolny (ms), 0 = szybki
const SZYBKI = 150 * 150;     // (px/s)² — od tej prędkości pocisk przejmuje kamerę w czasie ucieczki
const WOLNY = 40 * 40;

function pociskDoKamery(teraz) {
  const st = rg.state;
  if (st.projectiles.length === 0) { sledzony = null; return null; }
  if (sledzony && !st.projectiles.includes(sledzony)) sledzony = null;
  const v2 = (p) => p.vx * p.vx + p.vy * p.vy;
  if (st.phase !== 'odwrot') {
    // lot po ucieczce: zawsze jakiś pocisk — trzymamy się tego samego
    if (!sledzony) sledzony = st.projectiles.find((p) => v2(p) > WOLNY) || st.projectiles[0];
    wolnyOd = 0;
    return sledzony;
  }
  // ucieczka: pocisk tylko, kiedy naprawdę leci; wolny odpuszczamy po chwili
  if (!sledzony) {
    const p = st.projectiles.find((q) => v2(q) > SZYBKI);
    if (p) { sledzony = p; wolnyOd = 0; }
    return sledzony;
  }
  if (v2(sledzony) > WOLNY) wolnyOd = 0;
  else if (!wolnyOd) wolnyOd = teraz;
  else if (teraz - wolnyOd > 600) { sledzony = null; wolnyOd = 0; }
  return sledzony;
}

/* Kamera za pociskiem (4.9): cel przed pociskiem (wyprzedzenie ~0,3 s lotu), przy dużej
   prędkości lekko się oddala i szybciej dojeżdża; po wybuchu chwilę zostaje na miejscu wybuchu. */
let kameraWybuch = null;          // { x, y, do (ms), oddal? }
function ustawKamere(teraz) {
  const st = rg.state;
  const z = bazowyZoom() * zoomGracza;
  kamera.tzoom = z;
  kamera.tempo = 4.2;
  const p = pociskDoKamery(teraz);
  if (p) {
    // Lecący pocisk zawsze wygrywa z ręcznym przesunięciem.
    const v = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const wyprzedz = Math.min(0.32, 160 / Math.max(1, v));
    const oddal = Math.max(0.72, 0.92 - v / 4000);
    R.focusCamera(kamera, p.x + p.vx * wyprzedz, p.y + p.vy * wyprzedz, z * oddal);
    kamera.tempo = 7.5;
    recznaKameraDo = 0;
    return;
  }
  if (kameraWybuch && performance.now() < kameraWybuch.do && st.phase !== 'aim') {
    R.focusCamera(kamera, kameraWybuch.x, kameraWybuch.y, z * (kameraWybuch.oddal || 0.95));
    kamera.tempo = 6;
    return;
  }
  if (teraz < recznaKameraDo) return;
  const w = S.activeWorm(st);
  if (w) {
    const v = w.widok || w;
    // Robal stoi w wolnym pasie między panelami a dolnym HUD-em, trochę
    // poniżej jego połowy — nad nim zostaje miejsce na tor lotu.
    const H = renderer.viewH;
    const celY = pasy.gora + (H - pasy.dol - pasy.gora) * 0.58;
    R.focusCamera(kamera, v.x, v.y - (celY - H / 2) / z, z);
  }
}

/* Twarde zabezpieczenie: kiedy kamera śledzi robala, ten nigdy nie wypada
   z wolnej części ekranu — przy szybkim spadaniu albo odrzucie wybuchem
   płynny dojazd nie nadąża, więc dociągamy kamerę od razu. */
function trzymajWKadrze() {
  const st = rg.state;
  if (performance.now() < recznaKameraDo || sledzony || (kameraWybuch && performance.now() < kameraWybuch.do && rg.state.phase !== 'aim')) return;
  const w = S.activeWorm(st);
  if (!w || !w.alive) return;
  const v = w.widok || w;
  const z = kamera.zoom, W = renderer.viewW, H = renderer.viewH;
  const sx = (v.x - kamera.x) * z + W / 2;
  const sy = (v.y - kamera.y) * z + H / 2;
  const bok = Math.max(Math.min(W * 0.2, 150), pasy.bok + 12);   // nie pod boczne przyciski
  const gora = pasy.gora + 34 * z;         // nad stopami robal ma jeszcze głowę i podpis
  const dol = H - pasy.dol - 6;
  if (sx < bok) kamera.x -= (bok - sx) / z;
  else if (sx > W - bok) kamera.x += (sx - (W - bok)) / z;
  if (gora < dol) {
    if (sy < gora) kamera.y -= (gora - sy) / z;
    else if (sy > dol) kamera.y += (sy - dol) / z;
  }
}

function obsluzZdarzenia() {
  const st = rg.state;
  for (const e of st.events) {
    if (!rg.obserwator && (e.type === 'strzal' || e.type === 'obrazenia' || e.type === 'smierc')) {
      const akt = S.activeWorm(st);
      const ctx = { nr: st.turnNumber, aktId: akt ? S.wlasciciel(akt) : null, mojeId, fragiWczesniej: wczytajStaty().fragi,
        gracz: (id) => S.wlasciciel(st.worms.find((x) => x.id === id)) };
      for (const id of zdarzenieOs(partia.os, e, ctx)) zdobadz(id);
    }
    switch (e.type) {
      case 'wybuch':
        D.graj(e.r >= 100 ? 'alleluja' : 'wybuch', { r: e.r });
        if (e.r >= 100) D.graj('wybuch', { r: e.r });
        emitExplosion(fx, e.x, e.y, e.r);
        kameraWybuch = { x: e.x, y: e.y, do: performance.now() + 900 };
        if (e.r >= 100) emitTekst(fx, e.x, e.y - e.r * 0.6, 'ALLELUJA! 🐐', '#ffe27a', 22);   // Święty GOAT
        wstrzas = Math.min(14, wstrzas + e.r * 0.16);
        R.repaintRect(renderer, st.terrain, { x0: e.x - e.r - 3, x1: e.x + e.r + 3 });
        break;
      case 'strzal': emitSpark(fx, e.x, e.y, 14); D.graj(e.weapon === 'strzelba' ? 'strzelba' : e.weapon === 'railgun' ? 'railgun' : 'strzal'); break;
      case 'skok': D.graj('skok'); break;
      case 'mina':
        emitTekst(fx, e.x, e.y - 24, 'MINA!', '#ff5a3a', 16);
        D.graj('mina');
        break;
      case 'beczka': emitTekst(fx, e.x, e.y - 30, 'BUM!', '#ffd23b', 18); break;
      case 'odbicie': emitSpark(fx, e.x, e.y, 5); D.graj('odbicie'); break;
      case 'uderzenie':
        emitSpark(fx, e.x, e.y, 12);
        emitTekst(fx, e.x, e.y - 20, 'BONK!', '#fff1c2', 16);
        D.graj('bonk');
        wstrzas = Math.min(14, wstrzas + 5);
        break;
      case 'teleport':
        D.graj('teleport');
        emitSpark(fx, e.x0, e.y0 - 10, 24);
        emitSpark(fx, e.x1, e.y1 - 10, 24);
        break;
      case 'plusk': emitSpark(fx, e.x, e.y, 18); D.graj('plusk'); break;
      case 'lina': emitSpark(fx, e.x, e.y, 8); D.graj('lina'); break;
      case 'wiercenie':
        emitSpark(fx, e.x, e.y, 3);
        D.graj('wiercenie');
        R.repaintRect(renderer, st.terrain, { x0: e.x - e.r - 3, x1: e.x + e.r + 3 });
        break;
      case 'zrzut':
        R.zrzutAnimacja(renderer, e.id);
        D.graj('zrzut');
        pokazInfo(e.typ === 'apteczka' ? 'Zrzut: apteczka! 🩹' : 'Zrzut: zaopatrzenie! 📦');
        break;
      case 'skrzynka':
        emitSpark(fx, e.x, e.y - 8, 16);
        D.graj(e.typ === 'apteczka' ? 'apteczka' : 'skrzynka');
        emitTekst(fx, e.x, e.y - 30, e.typ === 'apteczka' ? '+' + e.hp + ' HP' : '+1 ' + WEAPONS[e.bron].name,
          e.typ === 'apteczka' ? '#7dff9a' : '#ffd23b', 16);
        break;
      case 'most':
        emitSpark(fx, e.x, e.y, 10);
        D.graj('most');
        R.repaintRect(renderer, st.terrain, { x0: e.x0 - 2, x1: e.x1 + 2 });
        break;
      case 'skrzynkaRozbita': emitSpark(fx, e.x, e.y - 8, 10); break;
      case 'smuga': emitSmuga(fx, e.x0, e.y0, e.x1, e.y1); break;
      case 'railgun':
        emitLaser(fx, e.x0, e.y0, e.x1, e.y1);
        // kamera pokazuje promień: środek linii (w granicach mapy) przez chwilę
        kameraWybuch = { x: (e.x0 + Math.max(0, Math.min(R.rozmiarSwiata().w, e.x1))) / 2, y: (e.y0 + e.y1) / 2, do: performance.now() + 1100, oddal: 0.6 };
        wstrzas = Math.min(14, wstrzas + 8);
        if (e.trafieni >= 2) emitTekst(fx, e.x0, e.y0 - 30, e.trafieni + '× PRZESTRZELONY!', '#7fe3ff', 18);
        break;
      case 'obrazenia': {
        emitTekst(fx, e.x, e.y - 34, '-' + e.amount, '#ff7a55');
        D.graj('ala');
        const akt = S.activeWorm(st);
        if (akt && e.wormId !== akt.id) {
          turaDla(st, akt).suma += e.amount;
          if (mojRobal(akt) && !rg.obserwator) partia.obrazenia += e.amount;
        }
        break;
      }
      case 'smierc': {
        emitTekst(fx, e.x, e.y - 50, e.cause === 'lawa' ? 'do lawy!' : 'RIP', '#ffd93b', 17);
        D.graj('smierc');
        break;
      }
      case 'odszedl':
        emitSpark(fx, e.x, e.y - 10, 20);
        emitTekst(fx, e.x, e.y - 40, 'wyszedł', '#ffe9c8', 14);
        break;
      case 'lawa': pokazInfo('Nagła śmierć — lawa wzbiera!'); D.graj('lawa'); break;
    }
  }
  st.events.length = 0;
}

function pokazKoniec(winnerId) {
  const st = rg.state;
  const w = st.worms.find((x) => x.id === winnerId);
  const ja0 = st.worms.find((x) => x.id === mojeId);
  // w drużynach wygrywa cała drużyna zwycięzcy
  const druzyna = st.druzynowa && w ? DRUZYNY[w.druzyna] : null;
  const wygralem = !!w && (w.id === mojeId || (!!druzyna && !!ja0 && ja0.druzyna === w.druzyna));
  D.muzykaStop();
  D.graj(wygralem ? 'wygrana' : 'smierc');
  let opis;
  if (druzyna) {
    el('koniec-tytul').textContent = wygralem ? 'WYGRYWACIE!' : 'WYGRYWAJĄ ' + druzyna.nazwa.toUpperCase();
    const sklad = [...new Set(st.worms.filter((x) => x.druzyna === w.druzyna).map((x) => x.nick || x.name))];
    opis = druzyna.nazwa + ' (' + sklad.join(', ') + ') zostali sami na arenie.';
  } else {
    el('koniec-tytul').textContent = w ? (w.id === mojeId ? 'WYGRYWASZ!' : 'WYGRYWA ' + (w.nick || w.name).toUpperCase()) : 'REMIS';
    opis = w
      ? 'Ostatni GOAT na arenie. Reszta poszła z dymem.'
      : 'Nikt nie przeżył. Bywa.';
  }
  const gralem = rg.state.worms.some((x) => x.id === mojeId);
  if (gralem && !partia.liczona) {
    partia.liczona = true;
    const staty = wczytajStaty();
    staty.partie++;
    if (wygralem) staty.wygrane++;
    staty.obrazenia += partia.obrazenia;
    staty.fragi += partia.os.fragi;
    if (tura.kto && mojRobal(tura.kto) && tura.suma > staty.rekordTury) staty.rekordTury = tura.suma;
    zapisz('arena:staty', JSON.stringify(staty));
    opis += ' Ty w tej partii: ' + partia.obrazenia + ' obrażeń, ' + partia.os.fragi + ' fragów.';
    // przy kilku robalach liczy się najzdrowszy żywy
    const hp = rg.state.worms.reduce((m, x) => (mojRobal(x) && x.alive ? Math.max(m, x.hp) : m), 0);
    const ctx = { wygralem, hp, partie: staty.partie };
    if (!rg.obserwator) for (const id of koniecPartiiOs(partia.os, ctx)) zdobadz(id);
    wyslijWynikPartii({
      partia: String(rg.seed), kille: partia.os.fragi, obrazenia: partia.obrazenia, wygrana: wygralem,
      rekordTury: staty.rekordTury, osiagniecia: partia.nowe.map((o) => o.id)
    });
  }
  const nowe = el('koniec-osiagniecia');
  nowe.replaceChildren();
  for (const o of partia.nowe) {
    const li = document.createElement('li');
    const czapka = CZAPKI.find((c) => c.osiagniecie === o.id);
    li.textContent = o.ikona + ' ' + o.nazwa + (czapka ? ' → nowa czapka: ' + czapka.nazwa + ' ' + czapka.ikona : '');
    nowe.append(li);
  }
  // komplet osiągnięć właśnie w tej partii — Korona Króla GOATów
  if (partia.nowe.length && OSIAGNIECIA && ileZdobytych(OSIAGNIECIA.wczytaj()) === WSZYSTKIE.length) {
    const li = document.createElement('li');
    li.className = 'korona-odblokowana';
    li.textContent = '👑 Komplet osiągnięć! Odblokowana Korona Króla GOATów';
    nowe.append(li);
  }
  nowe.hidden = partia.nowe.length === 0;
  el('koniec-opis').textContent = opis;
  el('ekran-koniec').hidden = false;
  ekwipunek.zamknij();
  hud.hidden = true;
  document.body.classList.remove('moja-tura');
}

/* ---------- HUD ---------- */

/* Przycisk z aktualną bronią (otwiera ekwipunek) i sama siatka broni.
   Widz nie ma robala — pokazujemy mu startowe zapasy. */
function rysujBronie() {
  const st = rg ? rg.state : null;
  const moge = !!rg && P.mogeGrac(rg, pokoj);
  const ja = st ? st.worms.find((w) => w.id === mojeId) : null;
  const wybrana = moge ? st.weapon : mojaBron;
  const amunicja = ja ? ja.amunicja : startowaAmunicja(st ? st.ust.bronie : 'pelny');
  // Cudza tura: na dole widać broń, którą gracz z turą ma teraz w łapach (z podglądu
  // na żywo), a po strzale — tą, którą strzelił. Ekwipunek dalej pokazuje moje bronie.
  const cudza = cudzaBron(st);
  const pokazana = cudza ? cudza.bron : wybrana;
  const w = WEAPONS[pokazana] || WEAPONS.bazooka;
  // Gracz partii widzi u przeciwnika tylko broń w łapach; obserwator (spoza partii) także ile jej ma.
  const zapas = cudza ? (cudza.amunicja ? cudza.zapas : undefined) : amunicja[wybrana];
  el('bron-ikona').replaceChildren(ikonaBroni(w.id));
  el('bron-nazwa').textContent = w.name;
  el('bron-kto').textContent = cudza ? cudza.kto : 'Broń';
  el('btn-bron').classList.toggle('cudza', !!cudza);
  const z = el('bron-zapas');
  z.hidden = zapas === undefined;
  z.textContent = '×' + zapas;
  z.classList.toggle('zero', zapas !== undefined && zapas <= 0);
  el('btn-bron').classList.toggle('nieaktywna', !moge);
  // Obserwator: ekwipunek pokazuje zapasy gracza z turą (z podglądu na żywo).
  if (cudza && cudza.amunicja) ekwipunek.rysuj({ wybrana: cudza.bron, amunicja: cudza.amunicja, moge: false, kto: cudza.kto });
  else ekwipunek.rysuj({ wybrana, amunicja, moge, kto: null });
}

/* Broń gracza z turą, gdy to nie ja: { bron, zapas, kto, amunicja } albo null.
   `amunicja` (cały ekwipunek) tylko dla obserwatora spoza partii — gracz
   partii nie podgląda, co przeciwnik ma w plecaku. */
function cudzaBron(st) {
  if (!st || st.phase === 'over') return null;
  const akt = S.activeWorm(st);
  if (!akt || mojRobal(akt)) return null;
  const obs = !!rg && rg.obserwator;
  if (akt.widok && WEAPONS[akt.widok.bron]) {
    const am = obs ? { ...akt.amunicja, ...(akt.widok.amunicja || {}) } : null;
    if (am && akt.widok.zapas !== undefined) am[akt.widok.bron] = akt.widok.zapas;
    return { bron: akt.widok.bron, zapas: akt.widok.zapas, kto: akt.name, amunicja: am };
  }
  if (st.phase !== 'aim' && WEAPONS[st.weapon]) {
    return { bron: st.weapon, zapas: akt.amunicja[st.weapon], kto: akt.name, amunicja: obs ? akt.amunicja : null };
  }
  return null;
}

let wstrzas = 0;                 // siła trzęsienia ekranu po wybuchu (px), tylko grafika
let ostatniPodpisBroni = '', ostatniPodpisGraczy = '', bylaUcieczka = false;

/* Życie z podglądu na żywo (upadek, apteczka gracza z turą), inaczej ze stanu. */
function hpNaZywo(w) {
  return w.widok && typeof w.widok.hp === 'number' ? w.widok.hp : w.hp;
}

function odswiezHud(moge, teraz) {
  const st = rg.state;
  const akt = S.activeWorm(st);
  const rozl = rozlaczeni();

  const uciekam = P.mogeUciekac(rg);
  document.body.classList.toggle('moja-tura', moge || uciekam);
  document.body.classList.toggle('ucieczka', uciekam);
  el('dotyk').hidden = !((moge || uciekam) && dotykowy());
  if (uciekam && !bylaUcieczka) napis(st.weapon === 'dynamit' ? 'UCIEKAJ!' : 'RUCH!', false);
  bylaUcieczka = uciekam;
  // po strzale (ładowanie, ucieczka) ekwipunek nie ma już czego wybierać
  if (ekwipunek.otwarty && (uciekam || (moge && st.charging))) ekwipunek.zamknij();

  const ja = st.worms.find((w) => w.id === mojeId);
  const cb = cudzaBron(st);
  const podpisBroni = [moge, st.weapon, mojaBron, ja ? JSON.stringify(ja.amunicja) : '',
    cb ? cb.bron + cb.zapas + cb.kto + JSON.stringify(cb.amunicja) : ''].join('|');
  if (podpisBroni !== ostatniPodpisBroni) { ostatniPodpisBroni = podpisBroni; rysujBronie(); }

  const podpisGraczy = st.worms.map((w) => [w.id, w.alive, w.odszedl, rozl.has(S.wlasciciel(w))].join(':')).join('|');
  if (podpisGraczy !== ostatniPodpisGraczy) {
    ostatniPodpisGraczy = podpisGraczy;
    const panel = el('panel-gracze');
    panel.replaceChildren();
    // W drużynach: nagłówek drużyny z sumą życia, pod nim jej gracze.
    const kolejnosc = st.druzynowa
      ? st.worms.slice().sort((a, b) => a.druzyna - b.druzyna || st.worms.indexOf(a) - st.worms.indexOf(b))
      : st.worms;
    let ostatniaDruzyna = null;
    for (const w of kolejnosc) {
      if (st.druzynowa && w.druzyna !== ostatniaDruzyna && DRUZYNY[w.druzyna]) {
        ostatniaDruzyna = w.druzyna;
        const info = DRUZYNY[w.druzyna];
        const hd = document.createElement('div');
        hd.className = 'druzyna-hud';
        hd.dataset.druzyna = w.druzyna;
        hd.style.setProperty('--kolor-druzyny', info.kolor);
        const nazwa = document.createElement('span');
        nazwa.className = 'nazwa';
        nazwa.textContent = info.nazwa;
        const pasek = document.createElement('span');
        pasek.className = 'pasek';
        pasek.append(document.createElement('i'));
        const suma = document.createElement('span');
        suma.className = 'suma';
        hd.append(nazwa, pasek, suma);
        panel.append(hd);
      }
      const d = document.createElement('div');
      d.className = 'gracz';
      d.dataset.worm = w.id;
      if (w.odszedl) d.classList.add('wyszedl');
      else if (!w.alive) d.classList.add('trup');
      if (rozl.has(S.wlasciciel(w))) d.classList.add('rozlaczony');
      const kropka = document.createElement('span');
      kropka.className = 'kropka';
      kropka.style.background = w.color;
      const imie = document.createElement('span');
      imie.className = 'imie';
      imie.textContent = w.name + (mojRobal(w) ? ' (Ty)' : '');
      if (st.druzynowa && DRUZYNY[w.druzyna]) { imie.style.color = DRUZYNY[w.druzyna].kolor; d.classList.add('w-druzynie'); }
      const hp = document.createElement('span');
      hp.className = 'hp';
      d.append(kropka, imie, hp);
      if (w.odszedl) d.append(Object.assign(document.createElement('span'), { className: 'znak', textContent: 'wyszedł' }));
      else if (rozl.has(S.wlasciciel(w))) d.append(Object.assign(document.createElement('span'), { className: 'znak', textContent: 'brak sieci' }));
      panel.append(d);
    }
  }
  for (const row of el('panel-gracze').children) {
    if (row.dataset.druzyna !== undefined) {
      const sklad = st.worms.filter((x) => x.druzyna === +row.dataset.druzyna && !x.odszedl);
      const hp = sklad.reduce((a, x) => a + (x.alive ? hpNaZywo(x) : 0), 0);
      row.querySelector('.suma').textContent = hp;
      // pasek względem życia na start (ustawienia partii), nie sztywnych 100 HP
      row.querySelector('.pasek i').style.width = Math.min(100, sklad.length ? hp / (sklad.length * st.ust.hp) * 100 : 0) + '%';
      row.classList.toggle('pokonana', hp <= 0);
      continue;
    }
    const w = st.worms.find((x) => x.id === row.dataset.worm);
    if (!w) continue;
    row.querySelector('.hp').textContent = w.odszedl ? '' : hpNaZywo(w);
    row.classList.toggle('aktywny', !!akt && akt.id === w.id && st.phase !== 'over');
  }

  el('tura-kto').textContent = akt ? (moge ? 'TWOJA TURA' : akt.name) : '—';
  const zegar = el('tura-czas');
  const sek = Math.max(0, Math.ceil(st.turnTimeLeft));
  const synchronizacja = czekamOd !== null && teraz - czekamOd > 1500;
  zegar.classList.toggle('sync', synchronizacja);
  const ucieczka = st.phase === 'odwrot' ? Math.max(0, S.ODWROT_S - st.odwrotKrok * S.DT) : null;
  zegar.textContent = synchronizacja ? 'SYNC…' : ucieczka !== null ? ucieczka.toFixed(1) : st.phase !== 'aim' ? '–' : sek;
  zegar.classList.toggle('ucieczka', ucieczka !== null);
  zegar.classList.toggle('malo', !synchronizacja && st.phase === 'aim' && sek <= 5);

  const slup = el('wiatr-slup');
  const proc = Math.min(50, (Math.abs(st.wind) / 130) * 50);
  slup.style.left = st.wind >= 0 ? '50%' : (50 - proc) + '%';
  slup.style.width = proc + '%';
  el('wiatr-txt').textContent = (st.wind >= 0 ? '→ ' : '← ') + Math.abs(Math.round(st.wind));

  const moc = moge ? st.power : akt && akt.widok ? akt.widok.moc : 0;
  el('moc-wypelnienie').style.width = (moc * 100).toFixed(0) + '%';

  el('btn-opusc').textContent = rg.obserwator ? 'Wyjdź' : 'Opuść grę';

  el('btn-obrot').hidden = !(moge && st.weapon === 'most');
  const moznaEmotki = mogeEmotki();
  el('btn-emotki').hidden = !moznaEmotki;
  el('btn-ping').hidden = st.phase === 'over';
  if (!moznaEmotki && !panelEmotek.hidden) zamknijEmotki();
  const obs = liczObserwatorow();
  el('obserwatorzy').hidden = obs === 0;
  el('obserwatorzy-ile').textContent = obs;
  el('obserwatorzy').title = obs === 1 ? '1 obserwator ogląda partię' : obs + ' obserwatorów ogląda partię';
}

setInterval(() => { if (wLobby()) odswiezLobby(); }, 500);

/* Podgląd stanu do diagnostyki (konsola przeglądarki: __arena()).
   Tylko do odczytu — nic tu nie zmienia przebiegu gry. */
window.__arena = () => ({
  mojeId, obserwator: rg && rg.obserwator,
  konto: konto && konto.nick, pokojId: aktualnyPokoj && aktualnyPokoj.id,
  faza: pokoj && pokoj.faza,
  turaLogu: pokoj && pokoj.tura,
  turaLokalna: rg && rg.state.turnNumber,
  fazaLokalna: rg && rg.state.phase,
  aktywny: pokoj && pokoj.aktywny,
  pingi: pingi.map((p) => p.nick + '@' + p.x + ',' + p.y),
  robal: rg && (() => { const w = S.activeWorm(rg.state); return w ? w.id : null; })(),   // robal z turą (4.8: gracz może mieć kilka)
  odeszli: pokoj ? [...pokoj.odeszli.keys()] : null,
  gracze: pokoj ? pokoj.gracze.map((g) => g.name) : null,
  statystyki: rg && rg.statystyki,
  transport: net ? net.transport : null,
  kursor: net && net.kursor,
  epoka: net && net.epoka,
  obecnosc: net && Object.keys(net.obecnosc || {}),
  przesuniecieZegara: net && Math.round(net.przesuniecieZegara),
  hash: rg && S.stateHash(rg.state),
  odwrotKrok: rg && rg.state.odwrotKrok,
  lina: rg && (() => { const w = S.activeWorm(rg.state); return w ? (w.lina || (w.widok && w.widok.lina) || null) : null; })(),
  druzyny: rg ? (rg.state.druzynowa ? rg.state.worms.map((w) => w.name + ':' + w.druzyna) : null) : null,
  ustawienia: pokoj && pokoj.ustawienia,
  ustawieniaGry: rg && rg.state.ust,
  lobby: rozstawienie && { tryb: rozstawienie.n, gracze: rozstawienie.gracze.map((g) => ({ name: g.name, druzyna: g.druzyna, gotowy: g.gotowy })), widzowie: rozstawienie.widzowie.length },
  kamera: kamera && renderer && (() => {
    const w = rg && S.activeWorm(rg.state);
    const v = w && (w.widok || w);
    return {
      x: kamera.x, y: kamera.y, zoom: kamera.zoom, recznie: performance.now() < recznaKameraDo,
      // gdzie na ekranie (px CSS) jest robal, który ma turę
      robal: v ? { x: (v.x - kamera.x) * kamera.zoom + renderer.viewW / 2, y: (v.y - kamera.y) * kamera.zoom + renderer.viewH / 2 } : null,
      ekran: { w: renderer.viewW, h: renderer.viewH, gora: pasy.gora, dol: pasy.dol }
    };
  })()
});

start();
