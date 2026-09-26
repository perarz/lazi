/* Lista graczy i zasady zrzutki po stronie serwera. Serwer nie ufa przeglądarce,
   więc trzyma własną, krótką listę — musi się zgadzać z zrzutka/dane.js
   (id graczy i `maks`). Nowy gracz albo sezon: zmiana tutaj + `arena-aktualizuj` na VPS. */

'use strict';

const GRACZE = {
  fortnite: { maks: 2000, gracze: ['powpow', 'krayo', 'karp', 'apollo'] },
  zeroad: { maks: 2000, gracze: ['kozak', 'lazi', 'stozhinio', 'nolli', 'apollo', 'froxy', 'quber'] }
};

/* Bieżący sezon; poprzednie zostają w pliku jako archiwum (GET ?sezon=N). */
const SEZON = 2;

const MAX_WPLAT = 60;        // tyle ostatnich wpłat pamięta serwer
const OKNO_LIMITU = 60;      // sekund
const LIMIT_NA_OKNO = 30;    // wpłat na IP w oknie — dla beki wystarczy

// tekst od użytkownika: bez znaków sterujących, bez nadmiaru spacji, przycięty
function czystyTekst(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

module.exports = { GRACZE, SEZON, MAX_WPLAT, OKNO_LIMITU, LIMIT_NA_OKNO, czystyTekst };
