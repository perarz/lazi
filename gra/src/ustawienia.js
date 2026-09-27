/* Ustawienia partii wybierane przez gospodarza lobby (od 4.3).

   Czysta tabela i walidacja, bez DOM-u — czyta ją lobby (main.js),
   protokół (czas tury) i symulacja (życie, lawa, zrzuty, wiatr, bronie).
   Ustawienia lecą w zdarzeniu 'nowa', więc każdy klient tworzy partię
   z tymi samymi liczbami. Dopisując nowe: pozycja tutaj, obsługa w sim.js
   i — jeśli zmienia coś, czego nie ma w snapshocie — nic więcej. */

export const USTAWIENIA = [
  {
    klucz: 'czas', nazwa: 'Czas tury', dom: 30,
    opcje: [[15, '15 s'], [20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '60 s']]
  },
  {
    klucz: 'hp', nazwa: 'Życie na start', dom: 100,
    opcje: [[50, '50 HP'], [100, '100 HP'], [150, '150 HP'], [200, '200 HP']]
  },
  {
    klucz: 'mapa', nazwa: 'Mapa', dom: 'losowa',
    opcje: [['losowa', 'Losowa'], ['gory', 'Góry'], ['archipelag', 'Archipelag'], ['kaniony', 'Kaniony'], ['jaskinie', 'Jaskinie']]
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
    // ujemne = po tylu pełnych rundach (dawny standard), dodatnie = od tej tury, 0 = nigdy
    klucz: 'lawa', nazwa: 'Lawa rośnie od', dom: -6,
    opcje: [[-6, '6. rundy'], [10, '10. tury'], [20, '20. tury'], [30, '30. tury'], [45, '45. tury'], [0, 'Nigdy']]
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
  return !!o && o.opcje.some(([v]) => v === w);
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
  const op = o && o.opcje.find(([v]) => v === w);
  return op ? op[1] : String(w);
}

/* Krótki opis tego, co różni się od standardu (do lobby i ekranu startu). */
export function opisZmian(u) {
  const d = domyslne();
  return USTAWIENIA.filter((o) => u[o.klucz] !== d[o.klucz]).map((o) => {
    const e = etykieta(o.klucz, u[o.klucz]);
    if (o.klucz === 'zrzuty') return 'zrzuty: ' + e.toLowerCase();
    if (o.klucz === 'lawa') return u.lawa === 0 ? 'bez lawy' : 'lawa od ' + e.toLowerCase();
    if (o.klucz === 'lawaTempo') return 'lawa: ' + e.toLowerCase();
    if (o.klucz === 'mapa') return 'mapa: ' + e;
    return e;
  });
}
