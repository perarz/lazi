/* Spięcie: tożsamość, lobby, pętla gry, HUD.

   Cała logika partii (czyja tura, co jest kanoniczne, kto wypadł, kiedy
   oddać turę za nieobecnego) siedzi w protokol.js i jest przetestowana
   w Node. Tutaj tylko podpinamy ją do sieci, sterowania i ekranu. */

import * as S from './sim.js';
import * as P from './protokol.js';
import * as R from './render.js';
import { createFx, stepFx, emitExplosion, emitTrail, emitSpark, emitTekst, emitSmuga } from './fx.js';
import { attachInput } from './input.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { createNet } from './net.js';

const KOLORY = ['#ff7a1e', '#4ea3ff', '#5ec26a', '#e04fd0', '#ffd93b', '#9b8cff'];

/* Kolor z hasha id bywa wspólny dla dwóch graczy — przy starcie partii
   (i na liście w lobby) każdy dostaje swój: pierwszy chętny zachowuje
   ulubiony, reszta bierze pierwszy wolny. Obowiązują kolory z `nowa`. */
function rozdzielKolory(gracze) {
  const zajete = new Set();
  return gracze.map((g) => {
    let color = g.color;
    if (!KOLORY.includes(color) || zajete.has(color)) color = KOLORY.find((k) => !zajete.has(k)) || color;
    zajete.add(color);
    return { id: g.id, name: g.name, color };
  });
}
const ODLICZANIE = 20;
const MAX_GRACZY = 6;
/* odswiezLobby() chodzi co 500 ms, a stan z sieci przychodzi co ~3 s.
   Bez tej blokady każda „samolecząca” wysyłka (zgłoszenie siebie,
   publikacja odliczania) powtarzałaby się kilkanaście razy. */
const PONOW_PO = 6000;

const el = (id) => document.getElementById(id);
const plotno = el('plotno');
const hud = el('hud');

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

function czytaj(k) { try { return localStorage.getItem(k); } catch { return null; } }
function zapisz(k, v) { try { localStorage.setItem(k, v); } catch { /* tryb prywatny */ } }

/* ---------- tożsamość ---------- */

function wczytajId() {
  let id = czytaj('arena:id');
  if (!id) {
    id = 'g' + Math.random().toString(36).slice(2, 10);
    zapisz('arena:id', id);
  }
  return id;
}

function hashTekstu(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
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

const bazowyZoom = () => Math.max(0.42, Math.min(1.5, Math.min(renderer.viewW / 1150, renderer.viewH / 560)));

/* Pasy ekranu zasłonięte przez HUD: u góry panele, u dołu bronie, moc
   i przyciski dotykowe. Kamera trzyma robala w wolnym pasie pomiędzy.
   Pomiar co pół sekundy (to odczyt układu strony), a wynik dochodzi
   płynnie, żeby świat nie skakał, gdy przyciski pojawiają się w turze. */
const pasy = { gora: 0, dol: 0, cel: { gora: 0, dol: 0 }, pomiar: -1e9, swieze: true };
function pasyHud(teraz, dt) {
  if (teraz - pasy.pomiar > 500) {
    pasy.pomiar = teraz;
    const H = renderer.viewH;
    let gora = H;
    for (const e of [el('dotyk'), hud.querySelector('.hud-dol')]) {
      if (!e || e.hidden) continue;
      const r = e.getBoundingClientRect();
      if (r.height > 0) gora = Math.min(gora, r.top);
    }
    pasy.cel.dol = Math.max(0, Math.min(H * 0.5, H - gora));
    const g = hud.querySelector('.hud-gora').getBoundingClientRect();
    pasy.cel.gora = Math.max(0, Math.min(H * 0.35, g.bottom));
  }
  if (pasy.swieze) {                     // pierwsza klatka partii: bez dojazdu
    pasy.swieze = false;
    pasy.gora = pasy.cel.gora;
    pasy.dol = pasy.cel.dol;
  } else {
    const k = Math.min(1, dt * 4);
    pasy.gora += (pasy.cel.gora - pasy.gora) * k;
    pasy.dol += (pasy.cel.dol - pasy.dol) * k;
  }
  return pasy;
}

/* ---------- ekran nazwy ---------- */

const inputNazwa = el('input-nazwa');
const btnWejdz = el('btn-wejdz');

{
  const zapisana = czytaj('arena:nazwa');
  if (zapisana) inputNazwa.value = zapisana;
}

function sprawdzNazwe() { btnWejdz.disabled = inputNazwa.value.trim().length < 2; }
inputNazwa.addEventListener('input', sprawdzNazwe);
inputNazwa.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !btnWejdz.disabled) wejdz(); });
btnWejdz.addEventListener('click', wejdz);
sprawdzNazwe();

function zglosSie() {
  ostatnieZgloszenie = Date.now();
  return net.wyslij({ t: 'dolacz', id: mojeId, name: mojaNazwa, color: mojKolor });
}

async function wejdz() {
  mojaNazwa = inputNazwa.value.trim().slice(0, 14);
  if (mojaNazwa.length < 2) return;
  zapisz('arena:nazwa', mojaNazwa);
  mojeId = wczytajId();
  mojKolor = KOLORY[Math.abs(hashTekstu(mojeId)) % KOLORY.length];

  btnWejdz.disabled = true;
  el('info-nazwa').textContent = 'Łączę z lobby…';

  net = createNet({
    id: mojeId,
    onStan: naStanSieci,
    onReset: () => { pokoj = null; },
    onBlad: naBladSieci
  });
  net.start();

  await zglosSie();
  await net.pobierz();

  el('ekran-nazwa').hidden = true;
  // Jeśli właśnie dołączyliśmy do trwającej partii, plansza już jest.
  if (!rg) el('ekran-lobby').hidden = false;
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
    ? 'Serwer lobby nie jest skonfigurowany (brak bazy Redis). Gra online niedostępna.'
    : 'Problem z połączeniem: ' + wiadomosc;
  el('info-nazwa').textContent = wiadomosc;
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

function odswiezLobby() {
  if (!pokoj || el('ekran-lobby').hidden) return;

  const zywi = net.zywi();
  const obecni = pokoj.wLobby.filter((g) => zywi.has(g.id) || g.id === mojeId);

  // Samoleczenie: jeśli po resecie logu nie ma nas na liście, zgłaszamy się
  // ponownie — ale nie częściej niż raz na PONOW_PO.
  const teraz = Date.now();
  if (!pokoj.wLobby.some((g) => g.id === mojeId) && teraz - ostatnieZgloszenie > PONOW_PO) zglosSie();

  // Gospodarzem lobby jest obecny gracz o najmniejszym id — bez uzgadniania.
  const idki = obecni.map((g) => g.id).sort();
  const gospodarz = idki.length > 0 && idki[0] === mojeId;

  const lista = el('lista-graczy');
  lista.replaceChildren();
  for (const g of rozdzielKolory(obecni)) {
    const li = document.createElement('li');
    if (g.id === mojeId) li.classList.add('ja');
    const kropka = document.createElement('span');
    kropka.className = 'kropka';
    kropka.style.background = g.color;
    const imie = document.createElement('span');
    imie.className = 'imie';
    imie.textContent = g.name;
    li.append(kropka, imie);
    if (g.id === idki[0]) li.append(znacznik('GOSPODARZ'));
    if (g.id === mojeId) li.append(znacznik('TY'));
    lista.append(li);
  }

  const wToku = P.partiaZywa(pokoj, net.czas(), polaczony);
  const trwa = el('trwa-gra');
  trwa.hidden = !wToku || !!rg;
  if (wToku) {
    el('trwa-gra-gracze').textContent = pokoj.gracze
      .filter((g) => !pokoj.odeszli.has(g.id))
      .map((g) => g.name).join(', ');
  }

  el('lobby-podtytul').textContent = wToku
    ? 'Trwa partia — poczekaj albo oglądaj.'
    : obecni.length < 2 ? 'Czekamy na drugiego gracza…' : obecni.length + ' graczy w lobby.';

  // Termin startu żyje we wspólnym logu i w czasie SERWERA.
  let termin = pokoj.odliczanieDo;
  if (termin !== null && net.czas() - termin > 60000) termin = null;   // termin z dawnej sesji
  if (gospodarz && !startWToku && !wToku && teraz - ostatnieOdliczanie > PONOW_PO) {
    if (obecni.length >= 2 && termin === null) {
      ostatnieOdliczanie = teraz;
      net.wyslij({ t: 'odliczanie', do: net.czas() + ODLICZANIE * 1000 });
    } else if (obecni.length < 2 && termin !== null) {
      ostatnieOdliczanie = teraz;
      net.wyslij({ t: 'odliczanie', anuluj: true });
    }
  }

  const box = el('odliczanie');
  if (termin !== null && obecni.length >= 2 && !wToku) {
    box.hidden = false;
    const sek = Math.max(0, Math.ceil((termin - net.czas()) / 1000));
    el('odliczanie-sek').textContent = sek;
    // Próbować może każdy — kto faktycznie zakłada partię, rozstrzyga zamek na serwerze.
    if (sek === 0) startPartii(obecni);
  } else {
    box.hidden = true;
  }

  el('btn-start').disabled = obecni.length < 2 || wToku;
  el('info-lobby').textContent = Date.now() < infoLobby.do
    ? infoLobby.tekst
    : wToku ? '' : 'Każdy może przyspieszyć start.';
}

function znacznik(tekst) {
  const z = document.createElement('span');
  z.className = 'znacznik';
  z.textContent = tekst;
  return z;
}

el('btn-start').addEventListener('click', async () => {
  el('btn-start').disabled = true;
  await net.wyslij({ t: 'odliczanie', do: net.czas() + 800 });
  odswiezLobby();
});

el('btn-ogladaj').addEventListener('click', () => {
  opuszczonySeed = null;
  if (pokoj && pokoj.faza === 'gra') zbudujGre();
});

async function startPartii(obecni) {
  if (startWToku) return;
  startWToku = true;
  try {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    // Jeśli ktoś nas ubiegł, serwer odpowie { ok: false } i niczego nie założy.
    await net.wyslij({
      t: 'nowa',
      seed,
      gracze: rozdzielKolory(obecni.slice(0, MAX_GRACZY))
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

  if (!renderer) renderer = R.createRenderer(plotno);
  dopasujPlotno();
  R.buildTerrain(renderer, rg.state.terrain);
  kamera = R.createCamera();
  fx = createFx();
  zoomGracza = 1;
  czekamOd = null;

  if (!sterowanie) {
    sterowanie = attachInput({
      getState: () => (rg ? rg.state : null),
      mogeGrac: () => !!rg && P.mogeGrac(rg, pokoj),
      plotno,
      przyciski: el('dotyk'),
      ekranNaSwiat: (sx, sy) => R.ekranNaSwiat(renderer, kamera, sx, sy),
      onBron: wybierzBron,
      onPodpowiedz: pokazInfo,
      onPrzesun: (dx, dy) => {
        kamera.tx -= dx / kamera.zoom;
        kamera.ty -= dy / kamera.zoom;
        kamera.x -= dx / kamera.zoom;
        kamera.y -= dy / kamera.zoom;
        recznaKameraDo = performance.now() + 4000;
      },
      onZoom: (f) => {
        zoomGracza = Math.max(0.55, Math.min(2.2, zoomGracza * f));
        recznaKameraDo = Math.max(recznaKameraDo, performance.now() + 1500);
      }
    });
  }

  el('ekran-nazwa').hidden = true;
  el('ekran-lobby').hidden = true;
  el('ekran-koniec').hidden = true;
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
  if (dotykowy() && window.innerHeight > window.innerWidth * 1.2) {
    pokazInfo('Obróć telefon poziomo — zobaczysz więcej areny.');
  }

  ostatniCzas = performance.now();
  if (!petlaDziala) { petlaDziala = true; requestAnimationFrame(petla); }
}

function zakonczGre() {
  rg = null;
  sterowanie?.zwolnij();
  hud.hidden = true;
  document.body.classList.remove('moja-tura');
  el('ekran-koniec').hidden = true;
  el('ekran-lobby').hidden = false;
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
    obecnoscSwieza: net.obecnoscSwieza()
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
  R.draw(renderer, st, kamera, fx, dt, {
    mojeId,
    rozlaczeni: rozlaczeni(),
    celNalotu: celNalotu(moge)
  });
  odswiezHud(moge, teraz);
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
  if (moge) return WEAPONS[st.weapon]?.celowany ? st.cel : null;
  const akt = S.activeWorm(st);
  return akt && akt.widok && akt.widok.cel ? akt.widok.cel : null;
}

/* Cudza tura: pozycja i celownik z podglądu na żywo, wygładzone. Sama
   symulacja tego nie widzi — prawdziwy stan przychodzi w strzale. */
function podgladNaZywo(dt, moge) {
  const st = rg.state;
  const akt = S.activeWorm(st);
  const ruch = net.ruch;
  for (const w of st.worms) if (w !== akt) w.widok = null;
  if (!akt) return;
  if (moge || st.phase !== 'aim' || !ruch || ruch.nr !== st.turnNumber || ruch.id !== akt.id || ruch.id === mojeId) {
    akt.widok = null;
    return;
  }
  if (!akt.widok) akt.widok = { x: akt.x, y: akt.y, facing: akt.facing, angle: akt.angle, moc: 0, cel: null };
  const v = akt.widok;
  const k = Math.min(1, dt * 7);
  v.x += (ruch.x - v.x) * k;
  v.y += (ruch.y - v.y) * k;
  v.facing = ruch.f;
  let dk = ruch.k - v.angle;
  while (dk > Math.PI) dk -= 2 * Math.PI;
  while (dk < -Math.PI) dk += 2 * Math.PI;
  v.angle += dk * k;
  v.moc = ruch.m || 0;
  v.bron = ruch.b;
  v.cel = Array.isArray(ruch.c) ? { x: ruch.c[0], y: ruch.c[1] } : null;
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
  const moja = akt.id === mojeId && !rg.obserwator;
  napis(moja ? 'TWOJA TURA' : 'Tura: ' + akt.name, !moja);
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
    if ((akt.amunicja[id] ?? 1) <= 0) { pokazInfo(w.name + ': brak amunicji.'); return; }
    if (st.charging) return;
    st.weapon = id;
    if (w.celowany) pokazInfo(dotykowy() ? 'Dotknij mapy, żeby wskazać cel nalotu, potem OGNIA.' : 'Kliknij na mapie cel nalotu, potem spacja.');
  }
  rysujBronie();
}

function ustawKamere(teraz) {
  const st = rg.state;
  const z = bazowyZoom() * zoomGracza;
  kamera.tzoom = z;
  if (st.projectiles.length > 0) {
    // Lecący pocisk zawsze wygrywa z ręcznym przesunięciem.
    const p = st.projectiles[0];
    R.focusCamera(kamera, p.x, p.y, z * 0.92);
    recznaKameraDo = 0;
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
  if (performance.now() < recznaKameraDo || st.projectiles.length > 0) return;
  const w = S.activeWorm(st);
  if (!w || !w.alive) return;
  const v = w.widok || w;
  const z = kamera.zoom, W = renderer.viewW, H = renderer.viewH;
  const sx = (v.x - kamera.x) * z + W / 2;
  const sy = (v.y - kamera.y) * z + H / 2;
  const bok = Math.min(W * 0.2, 150);
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
    switch (e.type) {
      case 'wybuch':
        emitExplosion(fx, e.x, e.y, e.r);
        R.repaintRect(renderer, st.terrain, { x0: e.x - e.r - 3, x1: e.x + e.r + 3 });
        break;
      case 'strzal': emitSpark(fx, e.x, e.y, 14); break;
      case 'odbicie': emitSpark(fx, e.x, e.y, 5); break;
      case 'plusk': emitSpark(fx, e.x, e.y, 18); break;
      case 'smuga': emitSmuga(fx, e.x0, e.y0, e.x1, e.y1); break;
      case 'obrazenia': emitTekst(fx, e.x, e.y - 34, '-' + e.amount, '#ff7a55'); break;
      case 'smierc': emitTekst(fx, e.x, e.y - 50, e.cause === 'lawa' ? 'do lawy!' : 'RIP', '#ffd93b', 17); break;
      case 'odszedl':
        emitSpark(fx, e.x, e.y - 10, 20);
        emitTekst(fx, e.x, e.y - 40, 'wyszedł', '#ffe9c8', 14);
        break;
      case 'lawa': pokazInfo('Nagła śmierć — lawa wzbiera!'); break;
    }
  }
  st.events.length = 0;
}

function pokazKoniec(winnerId) {
  const w = rg.state.worms.find((x) => x.id === winnerId);
  el('koniec-tytul').textContent = w ? (w.id === mojeId ? 'WYGRYWASZ!' : 'WYGRYWA ' + w.name.toUpperCase()) : 'REMIS';
  el('koniec-opis').textContent = w
    ? 'Ostatni GOAT na arenie. Reszta poszła z dymem.'
    : 'Nikt nie przeżył. Bywa.';
  el('ekran-koniec').hidden = false;
  hud.hidden = true;
  document.body.classList.remove('moja-tura');
}

/* ---------- HUD ---------- */

function rysujBronie() {
  const box = el('bronie');
  box.replaceChildren();
  const st = rg ? rg.state : null;
  const moge = !!rg && P.mogeGrac(rg, pokoj);
  const ja = st ? st.worms.find((w) => w.id === mojeId) : null;
  const wybrana = moge ? st.weapon : mojaBron;
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bron';
    const zapas = ja ? ja.amunicja[id] : undefined;
    if (id === wybrana) b.classList.add('wybrana');
    if (zapas !== undefined && zapas <= 0) b.classList.add('pusta');
    if (!moge) b.classList.add('nieaktywna');
    b.title = w.opis || w.name;
    const k = document.createElement('span');
    k.className = 'klawisz';
    k.textContent = w.key;
    const n = document.createElement('span');
    n.textContent = w.name;
    b.append(k, n);
    if (zapas !== undefined) {
      const z = document.createElement('span');
      z.className = 'zapas';
      z.textContent = '×' + zapas;
      b.append(z);
    }
    b.addEventListener('click', () => wybierzBron(id));
    box.append(b);
  }
}

let ostatniPodpisBroni = '', ostatniPodpisGraczy = '';

function odswiezHud(moge, teraz) {
  const st = rg.state;
  const akt = S.activeWorm(st);
  const rozl = rozlaczeni();

  document.body.classList.toggle('moja-tura', moge);
  el('dotyk').hidden = !(moge && dotykowy());

  const ja = st.worms.find((w) => w.id === mojeId);
  const podpisBroni = [moge, st.weapon, mojaBron, ja ? JSON.stringify(ja.amunicja) : ''].join('|');
  if (podpisBroni !== ostatniPodpisBroni) { ostatniPodpisBroni = podpisBroni; rysujBronie(); }

  const podpisGraczy = st.worms.map((w) => [w.id, w.alive, w.odszedl, rozl.has(w.id)].join(':')).join('|');
  if (podpisGraczy !== ostatniPodpisGraczy) {
    ostatniPodpisGraczy = podpisGraczy;
    const panel = el('panel-gracze');
    panel.replaceChildren();
    for (const w of st.worms) {
      const d = document.createElement('div');
      d.className = 'gracz';
      d.dataset.worm = w.id;
      if (w.odszedl) d.classList.add('wyszedl');
      else if (!w.alive) d.classList.add('trup');
      if (rozl.has(w.id)) d.classList.add('rozlaczony');
      const kropka = document.createElement('span');
      kropka.className = 'kropka';
      kropka.style.background = w.color;
      const imie = document.createElement('span');
      imie.className = 'imie';
      imie.textContent = w.name + (w.id === mojeId ? ' (Ty)' : '');
      const hp = document.createElement('span');
      hp.className = 'hp';
      d.append(kropka, imie, hp);
      if (w.odszedl) d.append(Object.assign(document.createElement('span'), { className: 'znak', textContent: 'wyszedł' }));
      else if (rozl.has(w.id)) d.append(Object.assign(document.createElement('span'), { className: 'znak', textContent: 'brak sieci' }));
      panel.append(d);
    }
  }
  for (const row of el('panel-gracze').children) {
    const w = st.worms.find((x) => x.id === row.dataset.worm);
    if (!w) continue;
    row.querySelector('.hp').textContent = w.odszedl ? '' : w.hp;
    row.classList.toggle('aktywny', !!akt && akt.id === w.id && st.phase !== 'over');
  }

  el('tura-kto').textContent = akt ? (moge ? 'TWOJA TURA' : akt.name) : '—';
  const zegar = el('tura-czas');
  const sek = Math.max(0, Math.ceil(st.turnTimeLeft));
  const synchronizacja = czekamOd !== null && teraz - czekamOd > 1500;
  zegar.classList.toggle('sync', synchronizacja);
  zegar.textContent = synchronizacja ? 'SYNC…' : st.phase !== 'aim' ? '–' : sek;
  zegar.classList.toggle('malo', !synchronizacja && st.phase === 'aim' && sek <= 5);

  const slup = el('wiatr-slup');
  const proc = Math.min(50, (Math.abs(st.wind) / 130) * 50);
  slup.style.left = st.wind >= 0 ? '50%' : (50 - proc) + '%';
  slup.style.width = proc + '%';
  el('wiatr-txt').textContent = (st.wind >= 0 ? '→ ' : '← ') + Math.abs(Math.round(st.wind));

  const moc = moge ? st.power : akt && akt.widok ? akt.widok.moc : 0;
  el('moc-wypelnienie').style.width = (moc * 100).toFixed(0) + '%';

  el('btn-opusc').textContent = rg.obserwator ? 'Wyjdź' : 'Opuść grę';
}

setInterval(() => { if (!el('ekran-lobby').hidden) odswiezLobby(); }, 500);

/* Podgląd stanu do diagnostyki (konsola przeglądarki: __arena()).
   Tylko do odczytu — nic tu nie zmienia przebiegu gry. */
window.__arena = () => ({
  mojeId, obserwator: rg && rg.obserwator,
  faza: pokoj && pokoj.faza,
  turaLogu: pokoj && pokoj.tura,
  turaLokalna: rg && rg.state.turnNumber,
  fazaLokalna: rg && rg.state.phase,
  aktywny: pokoj && pokoj.aktywny,
  odeszli: pokoj ? [...pokoj.odeszli.keys()] : null,
  gracze: pokoj ? pokoj.gracze.map((g) => g.name) : null,
  statystyki: rg && rg.statystyki,
  kursor: net && net.kursor,
  epoka: net && net.epoka,
  obecnosc: net && Object.keys(net.obecnosc || {}),
  przesuniecieZegara: net && Math.round(net.przesuniecieZegara),
  hash: rg && S.stateHash(rg.state),
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
