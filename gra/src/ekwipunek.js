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
  { nazwa: 'Rakiety', bronie: ['bazooka', 'salwa', 'nalot'] },
  { nazwa: 'Granaty', bronie: ['granat', 'kasetowa', 'dynamit'] },
  { nazwa: 'Na wroga', bronie: ['strzelba', 'owca', 'kij'] },
  { nazwa: 'Sprzęt', bronie: ['teleport', 'wiertlo', 'most'] }
];

/* Ikony broni (viewBox 32×32) — stałe rysunki z kodu, nigdy tekst od graczy. */
const IKONY = {
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
  granat:
    '<ellipse cx="15" cy="19.5" rx="8.4" ry="9.2" fill="#56733d" stroke="#1d2a14" stroke-width="1.4"/>' +
    '<path d="M7.6 16.5h14.8M7.6 22.5h14.8M11 11.6v15.8M19 11.6v15.8" stroke="#2f421f" stroke-width="1.1" opacity=".75"/>' +
    '<ellipse cx="12" cy="15.5" rx="2.4" ry="3.2" fill="#9cc47a" opacity=".5"/>' +
    '<rect x="11.5" y="7" width="7" height="4.6" rx="1.2" fill="#a7afb4" stroke="#3a4146" stroke-width="1"/>' +
    '<path d="M18 8.2l7.4-3.2 1 2-7.2 3.4z" fill="#cdd3d7" stroke="#3a4146" stroke-width=".9"/>' +
    '<circle cx="9.5" cy="7.8" r="2.6" fill="none" stroke="#ffd23b" stroke-width="1.5"/>',
  kasetowa:
    '<ellipse cx="14" cy="18.5" rx="8" ry="8.8" fill="#5b4a8a" stroke="#221a3a" stroke-width="1.4"/>' +
    '<circle cx="14" cy="18.5" r="4" fill="none" stroke="#ffd93b" stroke-width="1.6"/>' +
    '<ellipse cx="11" cy="14.6" rx="2.2" ry="2.8" fill="#a894e0" opacity=".45"/>' +
    '<rect x="10.8" y="6.6" width="6.4" height="4.2" rx="1.1" fill="#a7afb4" stroke="#3a4146" stroke-width="1"/>' +
    '<g fill="#2d2a26" stroke="#ffb347" stroke-width=".8"><circle cx="25" cy="10" r="2.2"/><circle cx="27" cy="18" r="2"/><circle cx="24.5" cy="26" r="2.2"/></g>',
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
  owca:
    '<g stroke="#222" stroke-width="1.6" stroke-linecap="round"><path d="M9 22v5M13 23v5M19 23v5M23 22v5"/></g>' +
    '<g fill="#f4f1ea" stroke="#9c958a" stroke-width=".9">' +
    '<circle cx="9" cy="17" r="5"/><circle cx="14" cy="13.6" r="5.4"/><circle cx="20" cy="14.4" r="5.2"/><circle cx="13" cy="20" r="4.8"/><circle cx="19.5" cy="20" r="4.6"/></g>' +
    '<ellipse cx="25.6" cy="15" rx="4.2" ry="3.4" fill="#222"/>' +
    '<circle cx="26.8" cy="14" r="1" fill="#fff"/><path d="M23.4 12l-1.4-2" stroke="#222" stroke-width="1.6" stroke-linecap="round"/>' +
    '<circle cx="16" cy="4.6" r="2" fill="#ff3b23"/><path d="M16 6.6v2.4" stroke="#3a2a1a" stroke-width="1.2"/>',
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
  let stan = { wybrana: 'bazooka', amunicja: {}, moge: false };
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
