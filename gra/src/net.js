/* Klient serwera Areny na VPS (serwer/serwer.js), przez WebSocket.

   Pokój to dopisywalny log zdarzeń po stronie serwera; tutaj tylko
   dokładamy do niego wpisy i czytamy przyrostowo. Co z nich wynika,
   liczy protokol.js — ten plik zna wyłącznie transport.

   Serwer sam przysyła każdą zmianę (bez odpytywania). Po zerwaniu
   połączenia łączymy się ponownie i dociągamy log od swojego kursora. */

import { adresSerwera, adresHttp } from './konfig.js';

const PULS_CO = 8000;
export const ZYWY_PO = 20000;   // brak pulsu dłużej niż tyle = gracz nie odpowiada

/* Co ile ms gracz z turą wysyła podgląd ruchu. */
export const RUCH_CO = 100;

export function createNet(opts = {}) {
  return createNetWs(adresSerwera(), opts);
}

const POKOJ = (() => {
  try {
    const p = new URLSearchParams(location.search).get('pokoj');
    return p && /^[a-z0-9-]{1,24}$/i.test(p) ? p.toLowerCase() : 'glowny';
  } catch { return 'glowny'; }
})();

function createNetWs(adres, opts = {}) {
  const url = adres ? adres + (adres.includes('?') ? '&' : '?') + 'pokoj=' + POKOJ : null;
  const net = {
    id: opts.id,
    kursor: 0,
    epoka: null,
    zdarzenia: [],
    obecnosc: {},
    obecnoscTeraz: 0,
    odczytano: 0,
    ruch: null,
    polaczony: false,
    przesuniecieZegara: 0,
    ostatniBlad: null,
    brakKonfiguracji: !adres,
    transport: 'ws',
    _ws: null,
    _nr: 0,
    _czekajace: new Map(),     // nr → { resolve, timer }
    _naStan: [],               // resolve'y czekające na najbliższy stan (pobierz())
    _pulsTimer: null,
    _czasTimer: null,
    _ponownie: null,
    _proba: 0,
    _zegarProbki: 0,
    _zatrzymany: true
  };

  function blad(tekst) {
    net.ostatniBlad = tekst;
    opts.onBlad?.(tekst);
  }

  function przyjmijStan(dane) {
    // Inna epoka = na serwerze zaczęła się nowa partia (log od zera).
    if (net.epoka !== null && dane.epoka !== net.epoka) {
      net.kursor = 0;
      net.zdarzenia.length = 0;
      opts.onReset?.();
      if (dane.od !== 0) { net.epoka = dane.epoka; hej(); return; }
    }
    net.epoka = dane.epoka;
    if (dane.od !== net.kursor) { hej(); return; }        // dziura w logu — prosimy o resztę

    if (typeof dane.teraz === 'number') net.obecnoscTeraz = dane.teraz;
    net.obecnosc = dane.obecnosc || {};
    net.ruch = dane.ruch || null;
    net.odczytano = Date.now();
    net.polaczony = true;
    net.ostatniBlad = null;
    const nowe = Array.isArray(dane.zdarzenia) ? dane.zdarzenia : [];
    net.kursor += nowe.length;
    for (const z of nowe) if (z) net.zdarzenia.push(z);
    opts.onStan?.(net);
    const czekajace = net._naStan.splice(0);
    for (const r of czekajace) r();
  }

  function pomiarCzasu(m) {
    const t1 = Date.now();
    const pomiar = m.teraz - (m.t0 + t1) / 2;
    net.przesuniecieZegara = net._zegarProbki === 0 ? pomiar : net.przesuniecieZegara * 0.8 + pomiar * 0.2;
    net._zegarProbki++;
  }

  function surowo(obiekt) {
    if (net._ws && net._ws.readyState === 1) { net._ws.send(JSON.stringify(obiekt)); return true; }
    return false;
  }

  function hej() { surowo({ typ: 'hej', od: net.kursor, epoka: net.epoka }); }

  function polacz() {
    if (net._zatrzymany) return;
    if (!url) return blad('brak adresu serwera');
    clearTimeout(net._ponownie);
    let ws;
    try { ws = new WebSocket(url); } catch (e) { blad('nie mogę połączyć z serwerem Areny'); return zaplanujPonownie(); }
    net._ws = ws;
    ws.onopen = () => {
      net._proba = 0;
      hej();
      surowo({ typ: 'czas', t0: Date.now() });
      net.puls();
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.typ === 'stan') przyjmijStan(m);
      else if (m.typ === 'czas') pomiarCzasu(m);
      else if (m.typ === 'odp') {
        const c = net._czekajace.get(m.nr);
        if (c) { clearTimeout(c.timer); net._czekajace.delete(m.nr); c.resolve(m.dane); }
      }
    };
    ws.onclose = () => {
      if (net._ws !== ws) return;
      net.polaczony = false;
      net._ws = null;
      // niedoręczone odpowiedzi kończymy od razu — protokół i tak powtarza, co trzeba
      for (const [nr, c] of net._czekajace) { clearTimeout(c.timer); c.resolve(null); net._czekajace.delete(nr); }
      if (!net._zatrzymany) {
        blad('zerwane połączenie z serwerem Areny — łączę ponownie…');
        zaplanujPonownie();
      }
    };
    ws.onerror = () => { /* onclose zrobi resztę */ };
  }

  function zaplanujPonownie() {
    clearTimeout(net._ponownie);
    const za = [500, 1000, 2000, 4000][Math.min(net._proba, 3)];
    net._proba++;
    net._ponownie = setTimeout(polacz, za);
  }

  function czekajNaPolaczenie(ms) {
    if (net._ws && net._ws.readyState === 1) return Promise.resolve(true);
    return new Promise((ok) => {
      const t0 = Date.now();
      const sprawdz = () => {
        if (net._ws && net._ws.readyState === 1) return ok(true);
        if (Date.now() - t0 > ms) return ok(false);
        setTimeout(sprawdz, 50);
      };
      sprawdz();
    });
  }

  /* Zdarzenie do logu (albo puls / podgląd ruchu). Zwraca odpowiedź serwera
     ({ ok, … }) albo null, gdy się nie udało — jak wersja HTTP. */
  net.wyslij = async function (zdarzenie) {
    if (!(await czekajNaPolaczenie(4000))) { blad('brak połączenia z serwerem Areny'); return null; }
    const nr = ++net._nr;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { net._czekajace.delete(nr); blad('serwer Areny nie odpowiada'); resolve(null); }, 8000);
      net._czekajace.set(nr, { resolve, timer });
      if (!surowo({ typ: 'zd', nr, zdarzenie })) { clearTimeout(timer); net._czekajace.delete(nr); resolve(null); }
    });
  };

  /* Dociągnięcie stanu — przy WebSocket stan i tak przychodzi sam; tu tylko
     prosimy o świeży i czekamy na niego (max ~3 s). */
  net.pobierz = function () {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      net._naStan.push(() => { clearTimeout(timer); resolve(); });
      if (!surowo({ typ: 'hej', od: net.kursor, epoka: net.epoka })) { /* dociągnie się po połączeniu */ }
    });
  };
  net.pobierzZaraz = function () { hej(); };
  net.ustawTryb = function () { /* bez odpytywania nie ma czego przyspieszać */ };
  net.obudz = function () {};

  net.puls = function () {
    if (!document.hidden) surowo({ typ: 'zd', nr: 0, zdarzenie: { t: 'puls', id: net.id } });
  };

  net.start = function () {
    net._zatrzymany = false;
    if (!net._ws) polacz();
    clearInterval(net._pulsTimer);
    net._pulsTimer = setInterval(net.puls, PULS_CO);
    clearInterval(net._czasTimer);
    net._czasTimer = setInterval(() => surowo({ typ: 'czas', t0: Date.now() }), 15000);
  };

  net.stop = function () {
    net._zatrzymany = true;
    clearInterval(net._pulsTimer);
    clearInterval(net._czasTimer);
    clearTimeout(net._ponownie);
    if (net._ws) { const w = net._ws; net._ws = null; try { w.close(); } catch { /* już zamknięte */ } }
  };

  net.czas = function () { return Date.now() + net.przesuniecieZegara; };
  net.obecnoscSwieza = function () { return Date.now() - net.odczytano < 6000; };
  net.zywi = function () {
    const zbior = new Set();
    for (const [id, ts] of Object.entries(net.obecnosc)) {
      if (net.obecnoscTeraz - ts < ZYWY_PO) zbior.add(id);
    }
    return zbior;
  };

  /* Zamknięcie karty: przez otwarte połączenie, a na wszelki wypadek też
     sendBeacon na HTTP tego samego serwera (dochodzi nawet przy zamykaniu). */
  net.opusc = function () {
    const zdarzenie = { t: 'wyjdz', id: net.id };
    surowo({ typ: 'zd', nr: 0, zdarzenie });
    const tresc = JSON.stringify({ zdarzenie });
    try { navigator.sendBeacon?.(adresHttp(adres) + '?pokoj=' + POKOJ, new Blob([tresc], { type: 'text/plain;charset=UTF-8' })); }
    catch { /* trudno — serwer i tak zauważy brak pulsu */ }
  };

  window.addEventListener('pagehide', () => { if (opts.naWyjscie?.() !== false) net.opusc(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    // po powrocie z tła: puls i świeży stan (połączenie mogło paść w tle)
    if (!net._ws && !net._zatrzymany) polacz();
    net.puls();
    hej();
  });

  return net;
}
