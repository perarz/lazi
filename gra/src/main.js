/* Spięcie: tożsamość, lobby, pętla gry, HUD.

   Cała logika partii (czyja tura, co jest kanoniczne, kto wypadł, kiedy
   oddać turę za nieobecnego) siedzi w protokol.js i jest przetestowana
   w Node. Tutaj tylko podpinamy ją do sieci, sterowania i ekranu. */

import * as S from './sim.js';
import * as P from './protokol.js';
import * as R from './render.js';
import { createFx, stepFx, emitExplosion, emitTrail, emitSpark, emitTekst, emitSmuga } from './fx.js';
import { attachInput } from './input.js';
import { WEAPONS, startowaAmunicja } from './weapons.js';
import { createNet } from './net.js';
import { nowaPartiaOs, zdarzenieOs, koniecTuryOs, koniecPartiiOs } from './osiagniecia-reguly.js';
import { createEkwipunek, ikonaBroni } from './ekwipunek.js';

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
    return { id: g.id, name: g.name, color };
  });
}
const MAX_GRACZY = 6;
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
  jaskinie: 'Mapa: Jaskinie — wielkie groty, nawisy i pływające skały. Granat się przyda.'
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
function opisStatow() {
  const s = wczytajStaty();
  if (!s.partie) return '';
  return 'Twoje statystyki: ' + s.partie + ' partii, ' + s.wygrane + ' wygranych, ' +
    s.fragi + ' fragów, ' + s.obrazenia + ' obrażeń (rekord tury: ' + s.rekordTury + ').';
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
    li.append(ik, tekst);
    lista.append(li);
  }
  el('osiagniecia-licznik').textContent = ile + '/' + OSIAGNIECIA.lista.length;
}

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

/* Kolor robala wybiera się tylko tutaj, przy wejściu. Zapamiętany w
   localStorage; za pierwszym razem — kolor z hasha id, jak dawniej. */
mojKolor = (() => {
  const z = czytaj('arena:kolor');
  return KOLORY.includes(z) ? z : KOLORY[Math.abs(hashTekstu(wczytajId())) % KOLORY.length];
})();

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
  b.addEventListener('click', () => {
    mojKolor = kolor;
    zapisz('arena:kolor', kolor);
    zaznaczKolor();
  });
  boxKolorow.append(b);
}
function zaznaczKolor() {
  for (const b of boxKolorow.children) {
    const tak = b.dataset.kolor === mojKolor;
    b.setAttribute('aria-checked', tak ? 'true' : 'false');
    b.tabIndex = tak ? 0 : -1;
  }
}
zaznaczKolor();
// strzałki przesuwają wybór jak w zwykłej grupie radiowej
boxKolorow.addEventListener('keydown', (e) => {
  const kier = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!kier) return;
  e.preventDefault();
  const i = (KOLORY.indexOf(mojKolor) + kier + KOLORY.length) % KOLORY.length;
  boxKolorow.children[i].click();
  boxKolorow.children[i].focus();
});

/* Podgląd robala w wybranym kolorze — rysowany tym samym kodem co w grze. */
const podgladRobala = el('podglad-robala');
function petlaPodgladu(t) {
  if (el('ekran-nazwa').hidden) return;
  R.rysujPodgladRobala(podgladRobala, { kolor: mojKolor, nazwa: inputNazwa.value.trim() || 'Ty', czas: t / 1000 });
  requestAnimationFrame(petlaPodgladu);
}
requestAnimationFrame(petlaPodgladu);

function zglosSie() {
  ostatnieZgloszenie = Date.now();
  return net.wyslij({ t: 'dolacz', id: mojeId, name: mojaNazwa, color: mojKolor });
}

async function wejdz() {
  mojaNazwa = inputNazwa.value.trim().slice(0, 14);
  if (mojaNazwa.length < 2) return;
  zapisz('arena:nazwa', mojaNazwa);
  zapisz('arena:kolor', mojKolor);
  mojeId = wczytajId();

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

  // Gospodarzem lobby jest ten z obecnych, kto dołączył najwcześniej —
  // kolejność zgłoszeń jest w logu taka sama u wszystkich. Nowy gracz nie
  // przejmuje więc roli (wcześniej wygrywało najmniejsze losowe id).
  const gospId = obecni.length > 0 ? obecni[0].id : null;
  const gospodarz = gospId === mojeId;

  const lista = el('lista-graczy');
  lista.replaceChildren();
  let mojKolorZajety = false;
  for (const g of rozdzielKolory(obecni)) {
    const li = document.createElement('li');
    if (g.id === mojeId) {
      li.classList.add('ja');
      mojKolorZajety = g.color !== mojKolor;
    }
    const kropka = document.createElement('span');
    kropka.className = 'kropka';
    kropka.style.background = g.color;
    const imie = document.createElement('span');
    imie.className = 'imie';
    imie.textContent = g.name;
    imie.style.color = g.color;
    li.append(kropka, imie);
    if (g.id === gospId) li.append(znacznik('GOSPODARZ'));
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
      net.wyslij({ t: 'odliczanie', do: net.czas() + P.ODLICZANIE_S * 1000 });
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

  el('moje-staty').textContent = opisStatow();
  rysujOsiagnieciaLobby();
  // Startu nie da się przyspieszyć — odliczanie leci zawsze do końca.
  el('info-lobby').textContent = Date.now() < infoLobby.do
    ? infoLobby.tekst
    : wToku ? ''
      : mojKolorZajety ? 'Ktoś był szybszy z Twoim kolorem — w tej partii grasz innym.'
        : obecni.length < 2 ? 'Partia ruszy sama, gdy w lobby będą co najmniej dwie osoby.'
          : 'Partia ruszy sama po odliczaniu.';
}

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
      mogeUciekac: () => !!rg && P.mogeUciekac(rg),
      plotno,
      przyciski: el('dotyk'),
      ekranNaSwiat: (sx, sy) => R.ekranNaSwiat(renderer, kamera, sx, sy),
      onBron: wybierzBron,
      onEkwipunek: () => ekwipunek.przelacz(),
      zamknijEkwipunek: () => ekwipunek.zamknij(),
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
        // Zoom nie zabiera kamery robalowi — dawniej po oddaleniu przez 1,5 s nikt
        // nie był śledzony. Przedłużamy tylko ręczny tryb, jeśli ktoś przesuwał kamerę.
        const teraz = performance.now();
        if (teraz < recznaKameraDo) recznaKameraDo = Math.max(recznaKameraDo, teraz + 1500);
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
  tura = pustaTura();
  partia = pustaPartia();
  const opisMapy = OPISY_MAP[rg.state.terrain.styl];
  if (dotykowy() && window.innerHeight > window.innerWidth * 1.2) {
    pokazInfo('Obróć telefon poziomo — zobaczysz więcej areny.');
  } else if (opisMapy) {
    pokazInfo(opisMapy);
  }

  ostatniCzas = performance.now();
  if (!petlaDziala) { petlaDziala = true; requestAnimationFrame(petla); }
}

function zakonczGre() {
  rg = null;
  sterowanie?.zwolnij();
  ekwipunek.zamknij();
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
  // trzęsienie po wybuchu: przesuwamy tylko obraz, kamera zostaje na miejscu
  const tx = wstrzas > 0.3 ? (Math.random() - 0.5) * wstrzas / kamera.zoom : 0;
  const ty = wstrzas > 0.3 ? (Math.random() - 0.5) * wstrzas / kamera.zoom : 0;
  kamera.x += tx; kamera.y += ty;
  R.draw(renderer, st, kamera, fx, dt, {
    mojeId,
    rozlaczeni: rozlaczeni(),
    celNalotu: celNalotu(moge)
  });
  kamera.x -= tx; kamera.y -= ty;
  wstrzas *= Math.max(0, 1 - dt * 7);
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
  if (moge) {
    if (!WEAPONS[st.weapon]?.celowany || !st.cel) return null;
    const most = st.weapon === 'most';
    const akt = S.activeWorm(st);
    return { ...st.cel, teleport: st.weapon === 'teleport', most, zle: most && !!akt && !!S.powodBrakuMostu(st, akt, st.cel) };
  }
  const akt = S.activeWorm(st);
  return akt && akt.widok && akt.widok.cel ? { ...akt.widok.cel, teleport: akt.widok.bron === 'teleport', most: akt.widok.bron === 'most' } : null;
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
  if (tura.kto && tura.nr !== st.turnNumber) {
    const moja = tura.kto.id === mojeId && !rg.obserwator;
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
    const ja = st.worms.find((x) => x.id === mojeId);
    for (const id of koniecTuryOs(partia.os, { mojeId, jaZywy: !!ja && ja.alive })) zdobadz(id);
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
    if (w.celowany) {
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

function ustawKamere(teraz) {
  const st = rg.state;
  const z = bazowyZoom() * zoomGracza;
  kamera.tzoom = z;
  const p = pociskDoKamery(teraz);
  if (p) {
    // Lecący pocisk zawsze wygrywa z ręcznym przesunięciem.
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
  if (performance.now() < recznaKameraDo || sledzony) return;
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
      const ctx = { nr: st.turnNumber, aktId: akt ? akt.id : null, mojeId, fragiWczesniej: wczytajStaty().fragi };
      for (const id of zdarzenieOs(partia.os, e, ctx)) zdobadz(id);
    }
    switch (e.type) {
      case 'wybuch':
        emitExplosion(fx, e.x, e.y, e.r);
        wstrzas = Math.min(14, wstrzas + e.r * 0.16);
        R.repaintRect(renderer, st.terrain, { x0: e.x - e.r - 3, x1: e.x + e.r + 3 });
        break;
      case 'strzal': emitSpark(fx, e.x, e.y, 14); break;
      case 'odbicie': emitSpark(fx, e.x, e.y, 5); break;
      case 'uderzenie':
        emitSpark(fx, e.x, e.y, 12);
        emitTekst(fx, e.x, e.y - 20, 'BONK!', '#fff1c2', 16);
        wstrzas = Math.min(14, wstrzas + 5);
        break;
      case 'teleport':
        emitSpark(fx, e.x0, e.y0 - 10, 24);
        emitSpark(fx, e.x1, e.y1 - 10, 24);
        break;
      case 'plusk': emitSpark(fx, e.x, e.y, 18); break;
      case 'wiercenie':
        emitSpark(fx, e.x, e.y, 3);
        R.repaintRect(renderer, st.terrain, { x0: e.x - e.r - 3, x1: e.x + e.r + 3 });
        break;
      case 'zrzut':
        R.zrzutAnimacja(renderer, e.id);
        pokazInfo(e.typ === 'apteczka' ? 'Zrzut: apteczka! 🩹' : 'Zrzut: zaopatrzenie! 📦');
        break;
      case 'skrzynka':
        emitSpark(fx, e.x, e.y - 8, 16);
        emitTekst(fx, e.x, e.y - 30, e.typ === 'apteczka' ? '+' + e.hp + ' HP' : '+1 ' + WEAPONS[e.bron].name,
          e.typ === 'apteczka' ? '#7dff9a' : '#ffd23b', 16);
        break;
      case 'most':
        emitSpark(fx, e.x, e.y, 10);
        R.repaintRect(renderer, st.terrain, { x0: e.x0 - 2, x1: e.x1 + 2 });
        break;
      case 'skrzynkaRozbita': emitSpark(fx, e.x, e.y - 8, 10); break;
      case 'smuga': emitSmuga(fx, e.x0, e.y0, e.x1, e.y1); break;
      case 'obrazenia': {
        emitTekst(fx, e.x, e.y - 34, '-' + e.amount, '#ff7a55');
        const akt = S.activeWorm(st);
        if (akt && e.wormId !== akt.id) {
          turaDla(st, akt).suma += e.amount;
          if (akt.id === mojeId && !rg.obserwator) partia.obrazenia += e.amount;
        }
        break;
      }
      case 'smierc': {
        emitTekst(fx, e.x, e.y - 50, e.cause === 'lawa' ? 'do lawy!' : 'RIP', '#ffd93b', 17);
        break;
      }
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
  let opis = w
    ? 'Ostatni GOAT na arenie. Reszta poszła z dymem.'
    : 'Nikt nie przeżył. Bywa.';
  const gralem = rg.state.worms.some((x) => x.id === mojeId);
  if (gralem && !partia.liczona) {
    partia.liczona = true;
    const staty = wczytajStaty();
    staty.partie++;
    if (w && w.id === mojeId) staty.wygrane++;
    staty.obrazenia += partia.obrazenia;
    staty.fragi += partia.os.fragi;
    if (tura.kto && tura.kto.id === mojeId && tura.suma > staty.rekordTury) staty.rekordTury = tura.suma;
    zapisz('arena:staty', JSON.stringify(staty));
    opis += ' Ty w tej partii: ' + partia.obrazenia + ' obrażeń, ' + partia.os.fragi + ' fragów.';
    const ja = rg.state.worms.find((x) => x.id === mojeId);
    const ctx = { wygralem: !!w && w.id === mojeId, hp: ja ? ja.hp : 0, partie: staty.partie };
    if (!rg.obserwator) for (const id of koniecPartiiOs(partia.os, ctx)) zdobadz(id);
  }
  const nowe = el('koniec-osiagniecia');
  nowe.replaceChildren();
  for (const o of partia.nowe) {
    const li = document.createElement('li');
    li.textContent = o.ikona + ' ' + o.nazwa;
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
  const w = WEAPONS[wybrana] || WEAPONS.bazooka;
  const amunicja = ja ? ja.amunicja : startowaAmunicja();
  const zapas = amunicja[wybrana];
  el('bron-ikona').replaceChildren(ikonaBroni(w.id));
  el('bron-nazwa').textContent = w.name;
  const z = el('bron-zapas');
  z.hidden = zapas === undefined;
  z.textContent = '×' + zapas;
  z.classList.toggle('zero', zapas !== undefined && zapas <= 0);
  el('btn-bron').classList.toggle('nieaktywna', !moge);
  ekwipunek.rysuj({ wybrana, amunicja, moge });
}

let wstrzas = 0;                 // siła trzęsienia ekranu po wybuchu (px), tylko grafika
let ostatniPodpisBroni = '', ostatniPodpisGraczy = '', bylaUcieczka = false;

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
