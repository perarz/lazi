/* Ustawienia partii wybierane przez gospodarza lobby (od 4.3).

   Czysta tabela i walidacja, bez DOM-u — czyta ją lobby (main.js),
   protokół (czas tury) i symulacja (życie, lawa, zrzuty, wiatr, bronie, mapa).
   Ustawienia lecą w zdarzeniu 'nowa', więc każdy klient tworzy partię
   z tymi samymi liczbami. Dopisując nowe: pozycja tutaj, obsługa w sim.js
   i — jeśli zmienia coś, czego nie ma w snapshocie — nic więcej.

   Pozycja ma albo `opcje` (lista do wyboru), albo `liczba` (od 4.5 gospodarz
   wpisuje wartość sam): { min, max, jednostka?, zero? } — `zero` to napis
   dla wartości 0 (np. „nigdy”). */

export const USTAWIENIA = [
  {
    klucz: 'czas', nazwa: 'Czas tury (s)', dom: 30,
    liczba: { min: 10, max: 120, jednostka: 's' }
  },
  {
    klucz: 'hp', nazwa: 'Życie na start', dom: 100,
    liczba: { min: 10, max: 500, jednostka: 'HP' }
  },
  {
    klucz: 'mapa', nazwa: 'Mapa', dom: 'losowa',
    opcje: [['losowa', 'Losowa'], ['gory', 'Góry'], ['archipelag', 'Archipelag'], ['kaniony', 'Kaniony'],
      ['jaskinie', 'Jaskinie'], ['ekstremalna', 'Ekstremalna']]
  },
  {
    klucz: 'rozmiar', nazwa: 'Rozmiar mapy', dom: 'normalna',
    opcje: [['mala', 'Mała'], ['normalna', 'Normalna'], ['duza', 'Duża'], ['ogromna', 'Ogromna']]
  },
  {
    klucz: 'bronie', nazwa: 'Bronie', dom: 'pelny',
    opcje: [['pelny', 'Normalne limity'], ['szalony', 'Szał (bez limitu)']]
  },
  {
    klucz: 'zrzuty', nazwa: 'Zrzuty skrzynek', dom: 40,
    opcje: [[0, 'Wyłączone'], [20, 'Rzadko'], [40, 'Normalnie'], [70, 'Często']]
  },
  {
    klucz: 'wiatr', nazwa: 'Wiatr', dom: 1,
    opcje: [[0, 'Bez wiatru'], [1, 'Normalny'], [2, 'Huragan']]
  },
  {
    // od której rundy (pełnego kółka graczy) lawa rośnie; 0 = nigdy
    klucz: 'lawaOd', nazwa: 'Lawa od rundy (0=nie)', dom: 6,
    liczba: { min: 0, max: 99, zero: 'nigdy' }
  },
  {
    klucz: 'lawaTempo', nazwa: 'Tempo lawy', dom: 12,
    opcje: [[6, 'Wolno'], [12, 'Normalnie'], [24, 'Szybko'], [40, 'Błyskawicznie']]
  }
];

/* Siła wiatru dla opcji 'wiatr' (mnożnik bazowego wiatru). */
export const WIATR_MNOZNIK = [0, 1, 1.7];

export function domyslne() {
  const u = {};
  for (const o of USTAWIENIA) u[o.klucz] = o.dom;
  return u;
}

export function poprawna(klucz, w) {
  const o = USTAWIENIA.find((x) => x.klucz === klucz);
  if (!o) return false;
  if (o.liczba) return Number.isInteger(w) && w >= o.liczba.min && w <= o.liczba.max;
  return o.opcje.some(([v]) => v === w);
}

/* Wpisana liczba → poprawna wartość (przycięta do zakresu) albo null. */
export function zLiczby(klucz, tekst) {
  const o = USTAWIENIA.find((x) => x.klucz === klucz);
  if (!o || !o.liczba) return null;
  const n = Math.round(Number(String(tekst).replace(',', '.')));
  if (!Number.isFinite(n)) return null;
  return Math.max(o.liczba.min, Math.min(o.liczba.max, n));
}

/* Z dowolnego obiektu (np. z sieci) — pełne, poprawne ustawienia.
   Nieznane i błędne pola dostają wartość domyślną. */
export function normalizuj(u) {
  const wynik = domyslne();
  if (!u || typeof u !== 'object') return wynik;
  for (const o of USTAWIENIA) if (poprawna(o.klucz, u[o.klucz])) wynik[o.klucz] = u[o.klucz];
  return wynik;
}

export function etykieta(klucz, w) {
  const o = USTAWIENIA.find((x) => x.klucz === klucz);
  if (o && o.liczba) return w === 0 && o.liczba.zero ? o.liczba.zero : w + (o.liczba.jednostka ? ' ' + o.liczba.jednostka : '');
  const op = o && o.opcje.find(([v]) => v === w);
  return op ? op[1] : String(w);
}

/* Krótki opis tego, co różni się od standardu (do lobby i ekranu startu). */
export function opisZmian(u) {
  const d = domyslne();
  return USTAWIENIA.filter((o) => u[o.klucz] !== d[o.klucz]).map((o) => {
    const e = etykieta(o.klucz, u[o.klucz]);
    if (o.klucz === 'zrzuty') return 'zrzuty: ' + e.toLowerCase();
    if (o.klucz === 'lawaOd') return u.lawaOd === 0 ? 'bez lawy' : 'lawa od ' + u.lawaOd + '. rundy';
    if (o.klucz === 'lawaTempo') return 'lawa: ' + e.toLowerCase();
    if (o.klucz === 'mapa') return 'mapa: ' + e;
    if (o.klucz === 'rozmiar') return 'rozmiar: ' + e.toLowerCase();
    return e;
  });
}
