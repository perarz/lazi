/* Osiągnięcia z Areny — jedna lista dla gry (gra/) i dla profilu na stronie zrzutki.

   Zdobyte trzyma przeglądarka: localStorage['arena:osiagniecia'] = { id: czas zdobycia }.
   Warunki sprawdza gra (gra/src/main.js) na podstawie zdarzeń symulacji — zero zapytań
   do serwera. Klasyczny skrypt (nie moduł), żeby wczytała go i gra, i strona główna.

   ukryta: true — do zdobycia nazwa i opis są schowane. */
(function () {
  var KLUCZ = 'arena:osiagniecia';

  var lista = [
    { id: 'pierwsza-krew', ikona: '🩸', nazwa: 'Pierwsza krew', opis: 'Wyeliminuj pierwszego przeciwnika.' },
    { id: 'piec-fragow', ikona: '💀', nazwa: 'Seryjny GOAT', opis: '5 eliminacji łącznie.' },
    { id: 'rzeznik', ikona: '☠️', nazwa: 'Rzeźnik Areny', opis: '25 eliminacji łącznie.' },
    { id: 'lawa', ikona: '🌋', nazwa: 'Kąpiel w lawie', opis: 'Wrzuć przeciwnika do lawy.' },
    { id: 'nalot', ikona: '✈️', nazwa: 'Nalot dywanowy', opis: 'Wyeliminuj kogoś nalotem.' },
    { id: 'saper', ikona: '🧨', nazwa: 'Saper', opis: 'Wyeliminuj kogoś dynamitem.' },
    { id: 'snajper', ikona: '🎯', nazwa: 'Śrut w plecy', opis: 'Wyeliminuj kogoś ze strzelby.' },
    { id: 'kasetowka', ikona: '🎆', nazwa: 'Deszcz odłamków', opis: 'Wyeliminuj kogoś kasetówką.' },
    { id: 'owca', ikona: '🐑', nazwa: 'Wilk w owczej skórze', opis: 'Wyeliminuj kogoś owcą.' },
    { id: 'home-run', ikona: '⚾', nazwa: 'Home run', opis: 'Wybij kogoś kijem prosto do lawy.' },
    { id: 'dublet', ikona: '⚡', nazwa: 'Dublet', opis: 'Dwie eliminacje w jednej turze.' },
    { id: 'masakra', ikona: '💥', nazwa: 'Masakra', opis: '100 albo więcej obrażeń w jednej turze.' },
    { id: 'ucieczka', ikona: '🏃', nazwa: 'Wielka ucieczka', opis: 'Podłóż dynamit, ucieknij i nie oberwij.' },
    { id: 'zwyciestwo', ikona: '🏆', nazwa: 'Ostatni GOAT', opis: 'Wygraj partię.' },
    { id: 'na-wlosku', ikona: '😰', nazwa: 'Na włosku', opis: 'Wygraj, mając 10 HP albo mniej.' },
    { id: 'nietykalny', ikona: '🛡️', nazwa: 'Nietykalny', opis: 'Wygraj bez utraty choćby jednego HP.' },
    { id: 'weteran', ikona: '🎖️', nazwa: 'Weteran Areny', opis: 'Zagraj 10 partii.' },
    { id: 'samoboja', ikona: '🤡', nazwa: 'Samobója', opis: 'Zgiń we własnej turze.', ukryta: true }
  ];

  function wczytaj() {
    try {
      var z = JSON.parse(localStorage.getItem(KLUCZ));
      return z && typeof z === 'object' ? z : {};
    } catch (e) {
      return {};
    }
  }

  /* Zwraca opis osiągnięcia, jeśli właśnie zostało zdobyte, albo null. */
  function odblokuj(id) {
    var o = null;
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) o = lista[i];
    if (!o) return null;
    var zdobyte = wczytaj();
    if (zdobyte[id]) return null;
    zdobyte[id] = Date.now();
    try { localStorage.setItem(KLUCZ, JSON.stringify(zdobyte)); } catch (e) { /* tryb prywatny */ }
    return o;
  }

  window.ARENA_OSIAGNIECIA = { klucz: KLUCZ, lista: lista, wczytaj: wczytaj, odblokuj: odblokuj };
})();
