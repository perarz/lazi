/* Pokój Areny w pamięci serwera — to samo, co api/arena.js robi w Redisie,
   tylko bez odpytywania: każda zmiana od razu idzie do wszystkich w pokoju.

   Pokój = dopisywalny log zdarzeń + rzeczy ulotne:
     epoka    — rośnie przy każdej nowej partii (klient z inną epoką czyta log od zera)
     obecnosc — id gracza → czas ostatniego pulsu (ms, zegar serwera)
     ruch     — podgląd na żywo gracza z turą
   Kolejność w logu jest jedna dla wszystkich i to ona rozstrzyga spory
   (patrz gra/src/protokol.js). Ten plik nie zna sieci — testuje się go w Node. */

'use strict';

const MAX_ZDARZEN = 4000;          // po tylu log jest zerowany (nowa epoka), jak w api/arena.js
const MAX_ZDARZENIE = 24 * 1024;   // stan tury z kraterami mieści się z zapasem
const MAX_RUCH = 600;
const ZAMEK_STARTU_MS = 8000;
const OBECNOSC_TTL_MS = 6 * 3600 * 1000;

const poprawneId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 32;

/* Znacznik czasu stawia serwer, nie klient — wspólny zegar dla wszystkich. */
function stempluj(z, max, teraz) {
  if (!z || typeof z !== 'object' || Array.isArray(z) || typeof z.t !== 'string' || z.t.length > 24) return null;
  const obiekt = { ...z, st: teraz };
  const s = JSON.stringify(obiekt);
  return s.length > max ? null : obiekt;
}

class Pokoj {
  constructor(nazwa) {
    this.nazwa = nazwa;
    this.log = [];
    this.epoka = 0;
    this.obecnosc = {};
    this.ruch = null;
    this.zamekDo = 0;
    this.ostatniaZmiana = Date.now();
  }

  /* Wszystko od pozycji `od` — ten sam kształt co GET /api/arena. */
  stan(od, teraz) {
    return {
      od,
      zdarzenia: this.log.slice(od),
      epoka: this.epoka,
      obecnosc: { ...this.obecnosc },
      ruch: this.ruch,
      teraz
    };
  }

  /* Przyjmuje zdarzenie od klienta. Zwraca { blad } albo { odp, zmiana },
     gdzie odp idzie do nadawcy (ten sam kształt co odpowiedź POST w api/arena.js),
     a zmiana mówi, czy rozesłać stan reszcie pokoju. */
  przyjmij(z, teraz) {
    if (!z || typeof z !== 'object' || typeof z.t !== 'string') return { blad: 'zle-zdarzenie' };
    this.ostatniaZmiana = teraz;
    this.sprzataj(teraz);

    // Puls i podgląd ruchu nie idą do logu — są ulotne.
    if (z.t === 'puls') {
      if (!poprawneId(z.id)) return { blad: 'brak-id' };
      this.obecnosc[z.id] = teraz;
      return { odp: { ok: true }, zmiana: true };
    }
    if (z.t === 'ruch') {
      const o = stempluj(z, MAX_RUCH, teraz);
      if (!o || !poprawneId(z.id)) return { blad: 'zly-ruch' };
      this.ruch = o;
      return { odp: { ok: true }, zmiana: true };
    }

    const o = stempluj(z, MAX_ZDARZENIE, teraz);
    if (!o) return { blad: 'zle-zdarzenie' };

    // Nowa partia: log od zera i nowa epoka. Zamek rozstrzyga, kto ją
    // faktycznie zakłada, gdy kilku klientów próbuje naraz.
    if (z.t === 'nowa') {
      if (teraz < this.zamekDo) return { odp: { ok: false, powod: 'juz-startuje' }, zmiana: false };
      this.zamekDo = teraz + ZAMEK_STARTU_MS;
      this.log = [o];
      this.epoka++;
      this.ruch = null;
      return { odp: { ok: true, epoka: this.epoka }, zmiana: true };
    }

    this.log.push(o);
    // Wyjście od razu zdejmuje gracza z obecnych — inni nie czekają na przeterminowanie pulsu.
    if (z.t === 'wyjdz' && poprawneId(z.id)) delete this.obecnosc[z.id];
    const dlugosc = this.log.length;
    if (dlugosc > MAX_ZDARZEN) {
      // Log spuchł — zaczynamy od czysta w nowej epoce (klienci przeczytają od zera).
      this.log = [];
      this.epoka++;
    }
    return { odp: { ok: true, dlugosc }, zmiana: true };
  }

  sprzataj(teraz) {
    for (const [id, ts] of Object.entries(this.obecnosc)) {
      if (teraz - ts > OBECNOSC_TTL_MS) delete this.obecnosc[id];
    }
  }
}

module.exports = { Pokoj, poprawneId, MAX_ZDARZEN, MAX_ZDARZENIE };
