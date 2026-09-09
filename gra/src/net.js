/* Klient wspólnego lobby.

   Pokój to dopisywalny log zdarzeń po stronie serwera; tutaj tylko
   dokładamy do niego wpisy i czytamy przyrostowo, składając z nich stan.

   Odpytywanie jest adaptacyjne i zatrzymuje się, gdy karta jest w tle —
   darmowy Upstash to 500 tys. komend miesięcznie, a jedna zapomniana
   otwarta karta odpytująca co sekundę zjadłaby ~86 tys. na dobę. */

const ADRES = '/api/room';

const INTERWAL = {
  lobby: 3000,
  cudzaTura: 1200,
  mojaTura: 6000,     // jesteśmy źródłem prawdy, wystarczy pilnować dołączeń
  bezczynne: 15000
};
const PULS_CO = 8000;
const MARTWY_PO = 20000;   // brak pulsu dłużej niż tyle = gracz wypadł

export function createNet(opts = {}) {
  const net = {
    id: opts.id,
    kursor: 0,
    dlugosc: 0,
    obecnosc: {},
    zdarzenia: [],
    polaczony: false,
    przesuniecieZegara: 0,   // ile dodac do Date.now(), zeby dostac czas serwera
    ostatniBlad: null,
    brakKonfiguracji: false,
    _timer: null,
    _pulsTimer: null,
    _tryb: 'lobby',
    _ostatniaAktywnosc: Date.now(),
    _wTrakcie: false
  };

  async function zapytaj(sciezka, opcje) {
    const odp = await fetch(sciezka, opcje);
    let dane = null;
    try { dane = await odp.json(); } catch { /* pusta albo nie-JSON odpowiedź */ }

    if (odp.status === 503 && dane && dane.blad === 'brak-konfiguracji') {
      net.brakKonfiguracji = true;
      throw new Error(dane.opis || 'brak konfiguracji Redisa');
    }
    if (!odp.ok) throw new Error((dane && (dane.opis || dane.blad)) || ('HTTP ' + odp.status));
    return dane;
  }

  net.wyslij = async function (zdarzenie) {
    try {
      const dane = await zapytaj(ADRES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zdarzenie })
      });
      net.ostatniBlad = null;
      net._ostatniaAktywnosc = Date.now();
      return dane;
    } catch (e) {
      net.ostatniBlad = e.message;
      opts.onBlad?.(e.message);
      return null;
    }
  };

  net.pobierz = async function () {
    if (net._wTrakcie) return;
    net._wTrakcie = true;
    try {
      const dane = await zapytaj(ADRES + '?od=' + net.kursor);
      if (!dane) return;

      // Log skrócony = zaczęła się nowa partia. Przewijamy kursor na początek
      // i składamy stan od zera.
      if (dane.dlugosc < net.kursor) {
        net.kursor = 0;
        net.zdarzenia.length = 0;
        opts.onReset?.();
        net._wTrakcie = false;
        return net.pobierz();
      }

      if (typeof dane.teraz === 'number') {
        net.przesuniecieZegara = dane.teraz - Date.now();
      }
      net.obecnosc = dane.obecnosc || {};
      net.polaczony = true;
      net.ostatniBlad = null;
      net.dlugosc = dane.dlugosc;

      if (dane.zdarzenia.length) {
        net.kursor += dane.zdarzenia.length;
        net._ostatniaAktywnosc = Date.now();
        for (const z of dane.zdarzenia) {
          net.zdarzenia.push(z);
          opts.onZdarzenie?.(z);
        }
      }
      opts.onStan?.(net);
    } catch (e) {
      net.polaczony = false;
      net.ostatniBlad = e.message;
      opts.onBlad?.(e.message);
    } finally {
      net._wTrakcie = false;
    }
  };

  function interwal() {
    if (Date.now() - net._ostatniaAktywnosc > 120000) return INTERWAL.bezczynne;
    return INTERWAL[net._tryb] ?? INTERWAL.lobby;
  }

  function zaplanuj() {
    clearTimeout(net._timer);
    if (document.hidden) return;         // karta w tle nie pali budżetu zapytań
    net._timer = setTimeout(async () => {
      await net.pobierz();
      zaplanuj();
    }, interwal());
  }

  net.ustawTryb = function (tryb) {
    if (net._tryb === tryb) return;
    net._tryb = tryb;
    zaplanuj();
  };

  net.obudz = function () {
    net._ostatniaAktywnosc = Date.now();
    zaplanuj();
  };

  net.start = function () {
    net.pobierz();
    zaplanuj();
    clearInterval(net._pulsTimer);
    net._pulsTimer = setInterval(() => {
      if (!document.hidden) net.wyslij({ t: 'puls', id: net.id });
    }, PULS_CO);
    net.wyslij({ t: 'puls', id: net.id });
  };

  net.stop = function () {
    clearTimeout(net._timer);
    clearInterval(net._pulsTimer);
  };

  /* Wspolny zegar: to samo odliczanie u kazdego, niezaleznie od tego,
     jak ustawiony jest zegar systemowy gracza. */
  net.czas = function () {
    return Date.now() + net.przesuniecieZegara;
  };

  /* Zamkniecie karty. sendBeacon dowozi zadanie nawet przy zamykaniu,
     kiedy zwykly fetch bywa anulowany. */
  net.opusc = function () {
    const tresc = JSON.stringify({ zdarzenie: { t: 'wyjdz', id: net.id } });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ADRES, new Blob([tresc], { type: 'application/json' }));
        return;
      }
    } catch { /* spadamy do fetch */ }
    fetch(ADRES, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                   body: tresc, keepalive: true }).catch(() => {});
  };

  window.addEventListener('pagehide', net.opusc);

  net.zywi = function () {
    const teraz = Date.now();
    const zbior = new Set();
    for (const [id, ts] of Object.entries(net.obecnosc)) {
      if (teraz - ts < MARTWY_PO) zbior.add(id);
    }
    return zbior;
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(net._timer);
    else { net.pobierz(); zaplanuj(); }
  });

  return net;
}

/* Składa log zdarzeń w stan pokoju. Czysta funkcja — ta sama lista
   zdarzeń u każdego klienta daje ten sam wynik. */
export function zloz(zdarzenia) {
  const pokoj = {
    faza: 'lobby',
    seed: null,
    gracze: [],          // uczestnicy bieżącej partii
    wLobby: [],          // zgłoszeni, czekają na start
    tury: new Map(),     // nr tury -> { strzal, pas, stan }
    odliczanieDo: null,     // termin startu w czasie SERWERA
    ostatniaAktywnosc: 0,   // czas serwera ostatniego zdarzenia partii
    zwyciezca: null
  };

  for (const z of zdarzenia) {
    switch (z.t) {
      case 'dolacz':
        if (!pokoj.wLobby.some((g) => g.id === z.id)) {
          pokoj.wLobby.push({ id: z.id, name: z.name, color: z.color });
        }
        break;

      case 'wyjdz':
        pokoj.wLobby = pokoj.wLobby.filter((g) => g.id !== z.id);
        break;

      case 'odliczanie':
        // Wygrywa OSTATNI opublikowany termin. Wariant "najwczesniejszy
        // wygrywa" wygladal bezpieczniej, ale zakleszczal sie: przeterminowany
        // wpis z poprzedniej sesji zostawal w logu na zawsze i zadnego
        // nowszego terminu nie dalo sie juz wstawic.
        if (z.anuluj) pokoj.odliczanieDo = null;
        else if (typeof z.do === 'number') pokoj.odliczanieDo = z.do;
        break;

      case 'nowa':
        pokoj.faza = 'gra';
        pokoj.odliczanieDo = null;
        pokoj.ostatniaAktywnosc = z.st || 0;
        pokoj.seed = z.seed;
        pokoj.gracze = z.gracze || [];
        pokoj.tury = new Map();
        pokoj.zwyciezca = null;
        break;

      case 'strzal': {
        pokoj.ostatniaAktywnosc = Math.max(pokoj.ostatniaAktywnosc, z.st || 0);
        const t = pokoj.tury.get(z.nr) || {};
        if (!t.strzal) t.strzal = z;      // pierwszy wpis dla danej tury wygrywa
        pokoj.tury.set(z.nr, t);
        break;
      }

      case 'pas': {
        pokoj.ostatniaAktywnosc = Math.max(pokoj.ostatniaAktywnosc, z.st || 0);
        const t = pokoj.tury.get(z.nr) || {};
        if (!t.strzal && !t.pas) t.pas = z;
        pokoj.tury.set(z.nr, t);
        break;
      }

      case 'stan': {
        pokoj.ostatniaAktywnosc = Math.max(pokoj.ostatniaAktywnosc, z.st || 0);
        const t = pokoj.tury.get(z.nr) || {};
        t.stan = z.snap;
        pokoj.tury.set(z.nr, t);
        break;
      }

      case 'koniec':
        pokoj.faza = 'koniec';
        pokoj.zwyciezca = z.winner;
        break;
    }
  }

  return pokoj;
}
