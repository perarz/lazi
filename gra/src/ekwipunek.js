/* Ekwipunek: siatka broni jak w Worms Armageddon, zamiast długiego paska.
   Otwiera się przyciskiem z aktualną bronią, prawym przyciskiem myszy albo Q,
   zamyka po wyborze, stuknięciem obok albo Escape.

   Tylko interfejs — o wyborze broni decyduje main.js (onWybierz), a sama
   symulacja (sim.js) nic o tym panelu nie wie. */

import { WEAPONS, WEAPON_ORDER } from './weapons.js';

const NS = 'http://www.w3.org/2000/svg';

/* Rzędy jak klawisze F1–F12 w Wormsach. Broń spoza listy (np. nowa)
   sama trafia do rzędu „Inne”, więc nic nie zniknie z ekwipunku. */
const GRUPY = [
  { nazwa: 'Rakiety', bronie: ['bazooka', 'salwa', 'nalot', 'napalm'] },
  { nazwa: 'Granaty', bronie: ['granat', 'banan', 'dynamit', 'swiety'] },
  { nazwa: 'Na wroga', bronie: ['strzelba', 'railgun', 'owca', 'kij'] },
  { nazwa: 'Sprzęt', bronie: ['teleport', 'wiertlo', 'most', 'lina'] }
];

/* Ikony broni (viewBox 32×32) — stałe rysunki z kodu, nigdy tekst od graczy. */
const IKONY = {
  railgun:   // railgun (4.9): szyny i błękitny promień
    '<g transform="rotate(-20 16 16)">' +
    '<rect x="2" y="13" width="9" height="7" rx="1.6" fill="#39414d" stroke="#161a20" stroke-width="1"/>' +
    '<rect x="9" y="12" width="17" height="2.4" rx=".8" fill="#9aa7b6" stroke="#2f353a" stroke-width=".7"/>' +
    '<rect x="9" y="18.6" width="17" height="2.4" rx=".8" fill="#9aa7b6" stroke="#2f353a" stroke-width=".7"/>' +
    '<rect x="10" y="14.8" width="16" height="3.4" fill="#6fe0ff"/>' +
    '<path d="M26 16.5h6" stroke="#dff8ff" stroke-width="2.4" stroke-linecap="round"/>' +
    '<circle cx="26.5" cy="16.5" r="2.6" fill="#ffffff" opacity=".9"/></g>',
  bazooka:
    '<g transform="rotate(-28 16 17)">' +
    '<rect x="2.5" y="13" width="21" height="7.5" rx="2.2" fill="#71804f" stroke="#262c19" stroke-width="1.3"/>' +
    '<rect x="2.5" y="13" width="3.4" height="7.5" rx="1" fill="#454f2f"/>' +
    '<rect x="8" y="20" width="3" height="5" rx="1" fill="#3d4529"/><rect x="14" y="20" width="2.6" height="3.6" rx="1" fill="#3d4529"/>' +
    '<rect x="9" y="11" width="6" height="2.4" rx="1" fill="#454f2f"/>' +
    '<path d="M23.5 14.2h3.2l3.4 2.6-3.4 2.6h-3.2z" fill="#ff5a1f" stroke="#7a1d05" stroke-width="1"/>' +
    '<path d="M5 15h16" stroke="#a9b684" stroke-width="1.2" stroke-linecap="round" opacity=".7"/></g>',
  salwa:
    '<g fill="#e3cf94" stroke="#5a4418" stroke-width="1">' +
    '<path d="M6 27l7-12 2.4 1.4-7 12z"/><path d="M13.6 28.2l3-13.4 2.7.6-3 13.4z"/><path d="M21 28.6l-.4-13.8 2.8-.1.4 13.8z"/></g>' +
    '<g fill="#ff4a14" stroke="#7a1d05" stroke-width=".9">' +
    '<path d="M13 15l1.3-4.4 1.2 5.8z"/><path d="M16.6 14.8l2.3-4 .4 5.9z"/><path d="M20.6 14.8l1.5-4.2 1.3 4.2z"/></g>' +
    '<g fill="#ffd23b"><circle cx="7" cy="28.6" r="1.6"/><circle cx="15" cy="29.6" r="1.6"/><circle cx="22.4" cy="29.8" r="1.6"/></g>',
  nalot:
    '<path d="M3 9.5l8-.6 5.5-5.2 2.4.3-3.2 5.6 8-.4 2.8-3 1.8.3-1.5 4.4 1.5 4.3-1.8.3-2.8-3-8-.3 3.2 5.6-2.4.3-5.5-5.2-8-.7z" fill="#c9cfd6" stroke="#3a4250" stroke-width="1.1" stroke-linejoin="round"/>' +
    '<g fill="#3b3a40" stroke="#16151a" stroke-width=".8">' +
    '<ellipse cx="10" cy="20" rx="1.9" ry="3" transform="rotate(-18 10 20)"/><ellipse cx="16.5" cy="24" rx="1.9" ry="3" transform="rotate(-18 16.5 24)"/><ellipse cx="23" cy="27.5" rx="1.9" ry="3" transform="rotate(-18 23 27.5)"/></g>' +
    '<path d="M8.5 16l.8-1.8M15 20l.8-1.8M21.5 23.5l.8-1.8" stroke="#ff8a3a" stroke-width="1.4" stroke-linecap="round"/>',
  napalm:   // nalot ogniowy (4.14.1): samolot i deszcz płonących kropli
    '<path d="M3 8.5l7-.5 5-4.6 2.2.3-2.9 4.9 7.2-.3 2.5-2.7 1.6.3-1.3 3.9 1.3 3.8-1.6.3-2.5-2.7-7.2-.3 2.9 4.9-2.2.3-5-4.6-7-.6z" fill="#c9cfd6" stroke="#3a4250" stroke-width="1" stroke-linejoin="round"/>' +
    '<g fill="#ff8a1e" stroke="#c4231a" stroke-width=".7">' +
    '<path d="M8 16c-1.6 2-1 4 0 4.5 1.2-.6 1.8-2.6 0-4.5z"/><path d="M14 19c-1.6 2-1 4 0 4.5 1.2-.6 1.8-2.6 0-4.5z"/>' +
    '<path d="M20 16.5c-1.6 2-1 4 0 4.5 1.2-.6 1.8-2.6 0-4.5z"/><path d="M11 24c-1.6 2-1 4 0 4.5 1.2-.6 1.8-2.6 0-4.5z"/>' +
    '<path d="M17.5 25c-1.6 2-1 4 0 4.5 1.2-.6 1.8-2.6 0-4.5z"/><path d="M24 22c-1.6 2-1 4 0 4.5 1.2-.6 1.8-2.6 0-4.5z"/></g>' +
    '<g fill="#ffd23b"><circle cx="8" cy="19" r=".9"/><circle cx="14" cy="22" r=".9"/><circle cx="20" cy="19.5" r=".9"/><circle cx="11" cy="27" r=".9"/><circle cx="17.5" cy="28" r=".9"/><circle cx="24" cy="25" r=".9"/></g>',
  granat:
    '<ellipse cx="15" cy="19.5" rx="8.4" ry="9.2" fill="#56733d" stroke="#1d2a14" stroke-width="1.4"/>' +
    '<path d="M7.6 16.5h14.8M7.6 22.5h14.8M11 11.6v15.8M19 11.6v15.8" stroke="#2f421f" stroke-width="1.1" opacity=".75"/>' +
    '<ellipse cx="12" cy="15.5" rx="2.4" ry="3.2" fill="#9cc47a" opacity=".5"/>' +
    '<rect x="11.5" y="7" width="7" height="4.6" rx="1.2" fill="#a7afb4" stroke="#3a4146" stroke-width="1"/>' +
    '<path d="M18 8.2l7.4-3.2 1 2-7.2 3.4z" fill="#cdd3d7" stroke="#3a4146" stroke-width=".9"/>' +
    '<circle cx="9.5" cy="7.8" r="2.6" fill="none" stroke="#ffd23b" stroke-width="1.5"/>',
  banan:   // bananowa bomba (4.13): żółty banan z brązowymi końcami, lont i małe banany obok
    '<path d="M5 12c1 9 8 15 17 13 3-.6 4.6-2 5.6-4-4 1.6-9 1.4-12.6-1.6C12 16.6 9.6 13 9 9.2z" fill="#ffd84a" stroke="#6b4a10" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<path d="M8 13.4c1.6 5.4 6.4 9.4 13 9.6" fill="none" stroke="#fff3a8" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>' +
    '<path d="M6.8 8.6l2.2-.8.6 1.6-2.2.8z" fill="#5a3a10"/><circle cx="27.6" cy="21" r="1.4" fill="#5a3a10"/>' +
    '<path d="M8 8.4c-1-3 1-4.6 3.4-4.8" fill="none" stroke="#3a2a1a" stroke-width="1.4" stroke-linecap="round"/>' +
    '<circle cx="11.6" cy="3.6" r="1.8" fill="#ffd23b"/>' +
    '<g fill="#ffd84a" stroke="#6b4a10" stroke-width=".8"><path d="M22 6c.4 3 2.6 4.6 5.4 4.4-1.4 1.8-5.2 1.4-6.2-1.6z"/><path d="M25.4 13c.8 1.8 2.4 2.6 4.2 2.2-.8 1.4-3.6 1.2-4.6-.6z"/></g>',
  dynamit:
    '<g stroke="#5a0e08" stroke-width="1.1">' +
    '<rect x="6" y="11" width="6" height="17" rx="1.4" fill="#c62b1a"/><rect x="13" y="10" width="6" height="18" rx="1.4" fill="#d9361f"/><rect x="20" y="11" width="6" height="17" rx="1.4" fill="#c62b1a"/></g>' +
    '<rect x="5.4" y="17" width="21.2" height="3.4" fill="#2b1a10"/>' +
    '<path d="M7.4 12v14M14.4 11v15M21.4 12v14" stroke="#ff9a7a" stroke-width="1.1" opacity=".55"/>' +
    '<path d="M16 10c0-3 3-3.4 2-6.4" fill="none" stroke="#3a2a1a" stroke-width="1.6" stroke-linecap="round"/>' +
    '<g fill="#ffd23b"><circle cx="18.6" cy="3.4" r="1.8"/><path d="M18.6 1l.6 1.6 1.7-.4-1 1.4 1.2 1.2-1.7.1-.3 1.7-.9-1.5-1.6.6.8-1.5-1.2-1.1 1.7-.2z"/></g>',
  strzelba:
    '<path d="M1.5 18.4l8.6-3.5h3.6v4.6H9.8L6.4 24H2.2z" fill="#7a5230" stroke="#2e1d0e" stroke-width="1.1" stroke-linejoin="round"/>' +
    '<rect x="11" y="13.6" width="19.5" height="2.8" rx=".8" fill="#8e979f" stroke="#2f353a" stroke-width="1"/>' +
    '<rect x="15.5" y="16.4" width="7.5" height="2.8" rx="1" fill="#5d3e22" stroke="#2e1d0e" stroke-width=".9"/>' +
    '<path d="M12.6 19.4q.4 2.6 2.6 2.6" fill="none" stroke="#2f353a" stroke-width="1.2"/>' +
    '<g fill="#ffd23b" opacity=".9"><circle cx="31" cy="11.6" r="1"/><circle cx="31.2" cy="15" r="1.1"/><circle cx="30.8" cy="18.4" r="1"/></g>',
  swiety:   // Święty GOAT (4.4): złota kula z rogami i aureolą
    '<ellipse cx="16" cy="5.4" rx="7" ry="2.2" fill="none" stroke="#ffe27a" stroke-width="1.6"/>' +
    '<circle cx="16" cy="19" r="9.5" fill="#e8b72a" stroke="#8a6a1a" stroke-width="1.3"/>' +
    '<circle cx="13" cy="15.6" r="3" fill="#fff6c4" opacity=".7"/>' +
    '<path d="M11.5 11.4q-5-5.4-8.6-2M20.5 11.4q5-5.4 8.6-2" fill="none" stroke="#8a6a1a" stroke-width="2" stroke-linecap="round"/>' +
    '<rect x="11.6" y="18" width="2" height="2" fill="#3a2a10"/><rect x="18.4" y="18" width="2" height="2" fill="#3a2a10"/>' +
    '<path d="M14 23.6q2 1.4 4 0" fill="none" stroke="#3a2a10" stroke-width="1.2" stroke-linecap="round"/>',
  lina:   // lina ninja (4.4): hak i zwinięta lina
    '<path d="M22 3.5v6.5" stroke="#8e979f" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M22 10q-6 1.5-5 6M22 10q6 1.5 5 6M22 10v5" fill="none" stroke="#8e979f" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M22 15c-2 6-10 3-12 8s6 7 10 4-6-6-11-2" fill="none" stroke="#d8c7a0" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="8.5" cy="27.5" r="2.4" fill="#6b4423"/>',
  owca:   // od 4.3.1 koza (GOAT) — id broni zostaje
    '<g stroke="#3b2a1c" stroke-width="1.7" stroke-linecap="round"><path d="M7 21v7M11 22v6M17 22v6M21 21v7"/></g>' +
    '<ellipse cx="3.6" cy="15" rx="1.4" ry="2.6" fill="#e9e1d2" transform="rotate(-25 3.6 15)"/>' +
    '<ellipse cx="14" cy="18" rx="10" ry="5.4" fill="#efe7d8" stroke="#9c8f7a" stroke-width=".9"/>' +
    '<ellipse cx="10.5" cy="16.6" rx="3.4" ry="2.3" fill="#b89a78"/>' +
    '<path d="M20 15l4-7 4 2-3.4 7z" fill="#efe7d8"/>' +
    '<ellipse cx="27" cy="10" rx="3.8" ry="2.8" fill="#efe7d8" stroke="#9c8f7a" stroke-width=".8" transform="rotate(20 27 10)"/>' +
    '<path d="M25.6 7.6q-2.6-5-6-3.4M27.2 7.4q-1.4-5.8-5-5.4" fill="none" stroke="#6b5a45" stroke-width="1.7" stroke-linecap="round"/>' +
    '<rect x="27.4" y="8.6" width="1.4" height="1.4" fill="#1a1210"/>' +
    '<path d="M28.4 12.2l1.6 4.6-2.6-3.4z" fill="#d8ccb6"/>',
  kij:
    '<g transform="rotate(40 16 16)">' +
    '<path d="M13.4 1.8c2.2-.7 5-.7 6.6.2l-1 20.5h-4.6z" fill="#d9a466" stroke="#6b4423" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<rect x="14.2" y="22.3" width="4.6" height="7" rx="1.2" fill="#6b4423"/>' +
    '<ellipse cx="16.5" cy="29.6" rx="3.3" ry="1.4" fill="#4a2e17"/>' +
    '<path d="M15.4 3.8l-.6 15.6" stroke="#f6d6a6" stroke-width="1.4" stroke-linecap="round" opacity=".8"/></g>' +
    '<g stroke="#ffd23b" stroke-width="1.6" stroke-linecap="round"><path d="M4 6l3 2.4M3 12h3.6M8 2.6l1.4 3"/></g>',
  teleport:
    '<ellipse cx="16" cy="18" rx="11.5" ry="12" fill="none" stroke="#9b5cff" stroke-width="2.2" stroke-dasharray="14 5"/>' +
    '<ellipse cx="16" cy="18" rx="7.6" ry="8" fill="none" stroke="#c9a0ff" stroke-width="2" stroke-dasharray="9 4"/>' +
    '<ellipse cx="16" cy="18" rx="3.6" ry="3.8" fill="#e8d8ff"/>' +
    '<g fill="#fff3a8"><circle cx="5" cy="7" r="1.3"/><circle cx="27" cy="6" r="1"/><circle cx="28" cy="27" r="1.3"/><circle cx="4" cy="28" r="1"/></g>',
  wiertlo:
    '<g transform="rotate(-35 16 16)">' +
    '<rect x="2" y="11.5" width="11" height="9" rx="2" fill="#6d7680" stroke="#2a3036" stroke-width="1.2"/>' +
    '<rect x="4" y="13.5" width="2.2" height="5" rx=".8" fill="#ffb347"/>' +
    '<path d="M13 12l17 4-17 4z" fill="#c3ccd4" stroke="#39414a" stroke-width="1.1" stroke-linejoin="round"/>' +
    '<path d="M16 12.8l1.6 6.6M19.4 13.6l1.4 5M22.8 14.4l1.2 3.4M26 15.2l.8 1.6" stroke="#4a525a" stroke-width="1.2"/></g>' +
    '<g fill="#8a6a44"><circle cx="27" cy="7" r="1.6"/><circle cx="29.5" cy="11" r="1.1"/><circle cx="24" cy="4" r="1.1"/></g>',
  most:
    '<path d="M2 11h28v4H2zM2 20h28v4H2z" fill="#c45c26" stroke="#4a1e08" stroke-width="1.1"/>' +
    '<path d="M3 15l5 5 5-5 5 5 5-5 5 5 2-2" fill="none" stroke="#e08a4a" stroke-width="1.8" stroke-linejoin="round"/>' +
    '<g fill="#ffd8a8"><circle cx="5" cy="13" r=".9"/><circle cx="11" cy="13" r=".9"/><circle cx="17" cy="13" r=".9"/><circle cx="23" cy="13" r=".9"/><circle cx="29" cy="13" r=".9"/>' +
    '<circle cx="5" cy="22" r=".9"/><circle cx="11" cy="22" r=".9"/><circle cx="17" cy="22" r=".9"/><circle cx="23" cy="22" r=".9"/><circle cx="29" cy="22" r=".9"/></g>' +
    '<path d="M1 28h30" stroke="#7a5230" stroke-width="2" stroke-linecap="round" opacity=".6"/>'
};

export function ikonaBroni(id) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = IKONY[id] || IKONY.bazooka;
  return svg;
}

function el(tag, klasa, tekst) {
  const e = document.createElement(tag);
  if (klasa) e.className = klasa;
  if (tekst != null) e.textContent = tekst;
  return e;
}

/* Rzędy z GRUP plus wszystko, czego w nich nie ma — kolejność z WEAPON_ORDER. */
function rzedy() {
  const znane = new Set(GRUPY.flatMap((g) => g.bronie));
  const wynik = GRUPY.map((g) => ({ nazwa: g.nazwa, bronie: g.bronie.filter((id) => WEAPONS[id] && WEAPON_ORDER.includes(id)) }));
  const inne = WEAPON_ORDER.filter((id) => !znane.has(id) && !WEAPONS[id].ukryta);
  if (inne.length) wynik.push({ nazwa: 'Inne', bronie: inne });
  return wynik.filter((r) => r.bronie.length);
}

/* opts: { panel, tlo, siatka, opis, przycisk, zamknij, onWybierz(id) } — elementy z index.html. */
export function createEkwipunek(opts) {
  let otwarty = false;
  let stan = { wybrana: 'bazooka', amunicja: {}, moge: false, kto: null };
  const kafelki = new Map();

  for (const r of rzedy()) {
    const rzad = el('div', 'ekw-rzad');
    rzad.append(el('span', 'ekw-grupa', r.nazwa));
    for (const id of r.bronie) {
      const w = WEAPONS[id];
      const b = el('button', 'ekw-bron');
      b.type = 'button';
      b.dataset.bron = id;
      b.title = w.opis || w.name;
      const ik = el('span', 'ekw-ikona');
      ik.append(ikonaBroni(id));
      const nazwa = el('span', 'ekw-nazwa', w.name);
      const zapas = el('span', 'ekw-zapas');
      const klawisz = el('span', 'ekw-klawisz', w.key || '');
      b.append(ik, nazwa, zapas, klawisz);
      b.addEventListener('click', () => opts.onWybierz(id));
      b.addEventListener('pointerenter', () => pokazOpis(id));
      b.addEventListener('focus', () => pokazOpis(id));
      b.addEventListener('pointerleave', () => pokazOpis(stan.wybrana));
      rzad.append(b);
      kafelki.set(id, { b, zapas });
    }
    opts.siatka.append(rzad);
  }

  function pokazOpis(id) {
    const w = WEAPONS[id];
    if (!w || !opts.opis) return;
    const zapas = stan.amunicja ? stan.amunicja[id] : undefined;
    opts.opis.textContent = w.name + ' — ' + (id === 'kij' && !(zapas > 0) ? 'tylko ze zrzutu zaopatrzenia' : w.opis || '');
  }

  function rysuj(nowy) {
    stan = { ...stan, ...nowy };
    for (const [id, k] of kafelki) {
      const zapas = stan.amunicja ? stan.amunicja[id] : undefined;
      const pusta = zapas !== undefined && zapas <= 0;
      k.b.classList.toggle('wybrana', id === stan.wybrana);
      k.b.classList.toggle('pusta', pusta);
      k.b.classList.toggle('nieaktywna', !stan.moge);
      k.b.setAttribute('aria-pressed', id === stan.wybrana ? 'true' : 'false');
      k.zapas.textContent = zapas === undefined ? '∞' : id === 'kij' && pusta ? 'zrzut' : '×' + zapas;
      k.zapas.classList.toggle('bez-limitu', zapas === undefined);
    }
    // obserwator ogląda ekwipunek gracza z turą — tytuł mówi czyj
    if (opts.tytul) opts.tytul.textContent = stan.kto ? 'Ekwipunek: ' + stan.kto : 'Ekwipunek';
    if (otwarty) pokazOpis(stan.wybrana);
  }

  function otworz() {
    if (otwarty) return;
    otwarty = true;
    opts.panel.hidden = false;
    if (opts.tlo) opts.tlo.hidden = false;
    opts.przycisk?.setAttribute('aria-expanded', 'true');
    opts.przycisk?.classList.add('otwarty');
    pokazOpis(stan.wybrana);
    // na komputerze fokus na wybranej broni — strzałki i Enter działają od razu
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) kafelki.get(stan.wybrana)?.b.focus({ preventScroll: true });
  }

  function zamknij() {
    if (!otwarty) return false;
    otwarty = false;
    opts.panel.hidden = true;
    if (opts.tlo) opts.tlo.hidden = true;
    opts.przycisk?.setAttribute('aria-expanded', 'false');
    opts.przycisk?.classList.remove('otwarty');
    if (document.activeElement && opts.panel.contains(document.activeElement)) document.activeElement.blur();
    return true;
  }

  function przelacz() { if (otwarty) zamknij(); else otworz(); }

  opts.przycisk?.addEventListener('click', (e) => {
    przelacz();
    // po kliknięciu myszą/palcem fokus nie zostaje na przycisku — inaczej
    // spacja (skok) „klikałaby” go przy puszczeniu i otwierała ekwipunek
    if (e.detail > 0) opts.przycisk.blur();
  });
  opts.zamknij?.addEventListener('click', zamknij);
  // stuknięcie obok panelu zamyka go i nie trafia w planszę (nie zmienia celownika)
  if (opts.tlo) {
    opts.tlo.addEventListener('pointerdown', (e) => { e.preventDefault(); zamknij(); });
    opts.tlo.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  opts.panel.addEventListener('contextmenu', (e) => { e.preventDefault(); zamknij(); });

  return { rysuj, otworz, zamknij, przelacz, get otwarty() { return otwarty; } };
}
