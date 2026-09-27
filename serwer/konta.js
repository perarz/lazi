/* Konta graczy Areny (od 4.6): nick + hasło, bez maila.

   Plik (KONTA_PLIK, na VPS /var/lib/arena/konta.json):
     { konta: { "<nick małymi>": { nick, id, sol, hash, utworzono, kolor,
                                   staty: { partie, wygrane, kille, obrazenia, rekordTury },
                                   osiagniecia: { id: czas }, partie: [klucze ostatnich wyników] } },
       sesje: { "<token>": { login, do } } }
   Hasło trzymamy tylko jako skrót scrypt z solą — nie da się go odczytać.
   Token sesji to losowe 32 bajty; ważny 60 dni, każde użycie przedłuża.
   Zapis jak w zrzutce: plik tymczasowy + rename, codzienna kopia (14 dni).

   Serwer nie widzi partii (liczą ją przeglądarki), więc wynik partii zgłasza
   gracz — z limitami (max kille, jeden wynik na partię). Na żartobliwą
   stronę to wystarczy. */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { czystyTekst } = require('./gracze');

const KOPII = 14;
const SESJA_MS = 60 * 24 * 3600 * 1000;
const MAX_SESJI_NA_KONTO = 10;
const LIMIT_PROB = 12;                // prób logowania / rejestracji na IP na minutę
const LIMIT_REJESTRACJI = 6;          // nowych kont z jednego IP na godzinę
const MAX_KONT = 5000;
const PAMIETANE_PARTIE = 40;
const RANKING_ILE = 50;

const NICK = /^[\p{L}\p{N}_. -]{3,14}$/u;
// akcesoria robala (od 4.7) — ta sama lista jest w gra/src/akcesoria.js
const AKCESORIA = ['korona', 'lama', 'kilof', 'helm', 'wieniec'];

const skrot = (haslo, sol) => new Promise((ok, zle) =>
  crypto.scrypt(haslo, sol, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? zle(e) : ok(k.toString('hex')))));

function login(nick) { return nick.toLowerCase(); }
function idKonta(nick) { return 'k-' + login(nick).replace(/\s+/g, '_'); }

class Konta {
  constructor(plik) {
    this.plik = plik;
    this.dane = { konta: {}, sesje: {} };
    this.proby = new Map();           // ip → { od, ile }
    this.rejestracje = new Map();     // ip → { od, ile }
    this.zapisCzeka = null;
    if (plik) this.wczytaj();
  }

  wczytaj() {
    try {
      const d = JSON.parse(fs.readFileSync(this.plik, 'utf8'));
      if (d && d.konta && typeof d.konta === 'object') this.dane = { konta: d.konta, sesje: d.sesje || {} };
    } catch (e) {
      if (e.code !== 'ENOENT') {
        const bok = this.plik + '.zepsuty-' + Date.now();
        try { fs.renameSync(this.plik, bok); } catch { /* trudno */ }
        console.error('konta: nie da się odczytać pliku, odłożony jako', bok, e.message);
      }
    }
  }

  limit(mapa, ip, ile, oknoMs, teraz) {
    let l = mapa.get(ip);
    if (!l || teraz - l.od >= oknoMs) { l = { od: teraz, ile: 0 }; mapa.set(ip, l); }
    if (mapa.size > 5000) for (const [k, v] of mapa) if (teraz - v.od >= oknoMs) mapa.delete(k);
    return ++l.ile > ile;
  }

  /* Publiczny widok konta (bez hasła i soli). */
  widok(k) {
    return { nick: k.nick, id: k.id, kolor: k.kolor || null, akcesorium: k.akcesorium || null, staty: { ...k.staty }, osiagniecia: { ...k.osiagniecia } };
  }

  nowaSesja(k, teraz) {
    const token = crypto.randomBytes(32).toString('hex');
    this.dane.sesje[token] = { login: login(k.nick), do: teraz + SESJA_MS };
    // stare sesje tego konta (np. z wielu telefonów) — trzymamy kilka najnowszych
    const moje = Object.entries(this.dane.sesje).filter(([, s]) => s.login === login(k.nick)).sort((a, b) => b[1].do - a[1].do);
    for (const [t] of moje.slice(MAX_SESJI_NA_KONTO)) delete this.dane.sesje[t];
    return token;
  }

  /* { status, dane } jak odpowiedź API. */
  async rejestracja(body, ip, teraz = Date.now()) {
    body = body && typeof body === 'object' ? body : {};
    if (this.limit(this.proby, ip, LIMIT_PROB, 60000, teraz)) return { status: 429, dane: { blad: 'za-duzo-prob' } };
    const nick = czystyTekst(body.nick, 20);
    const haslo = typeof body.haslo === 'string' ? body.haslo : '';
    if (!NICK.test(nick)) return { status: 400, dane: { blad: 'zly-nick' } };
    if (haslo.length < 4 || haslo.length > 72) return { status: 400, dane: { blad: 'zle-haslo' } };
    if (this.dane.konta[login(nick)]) return { status: 409, dane: { blad: 'nick-zajety' } };
    if (Object.keys(this.dane.konta).length >= MAX_KONT) return { status: 503, dane: { blad: 'za-duzo-kont' } };
    if (this.limit(this.rejestracje, ip, LIMIT_REJESTRACJI, 3600000, teraz)) return { status: 429, dane: { blad: 'za-duzo-kont-z-ip' } };
    const sol = crypto.randomBytes(16).toString('hex');
    const hash = await skrot(haslo, sol);
    if (this.dane.konta[login(nick)]) return { status: 409, dane: { blad: 'nick-zajety' } };   // ktoś był szybszy
    const k = {
      nick, id: idKonta(nick), sol, hash, utworzono: teraz, kolor: null,
      staty: { partie: 0, wygrane: 0, kille: 0, obrazenia: 0, rekordTury: 0 },
      osiagniecia: {}, partie: []
    };
    // Dotychczasowe osiągnięcia i statystyki z tej przeglądarki (sprzed kont) przechodzą na nowe konto.
    this.wlejStare(k, body.stare);
    this.dane.konta[login(nick)] = k;
    const token = this.nowaSesja(k, teraz);
    this.zapiszPozniej();
    return { status: 200, dane: { token, konto: this.widok(k) } };
  }

  wlejStare(k, stare) {
    if (!stare || typeof stare !== 'object') return;
    const s = stare.staty && typeof stare.staty === 'object' ? stare.staty : {};
    const liczba = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v)) || 0));
    k.staty.partie = liczba(s.partie, 5000);
    k.staty.wygrane = Math.min(k.staty.partie, liczba(s.wygrane, 5000));
    k.staty.kille = liczba(s.fragi, 20000);
    k.staty.obrazenia = liczba(s.obrazenia, 2000000);
    k.staty.rekordTury = liczba(s.rekordTury, 5000);
    this.dodajOsiagniecia(k, stare.osiagniecia);
  }

  dodajOsiagniecia(k, lista, teraz = Date.now()) {
    if (!lista || typeof lista !== 'object') return;
    const ids = Array.isArray(lista) ? lista : Object.keys(lista);
    for (const id of ids.slice(0, 60)) {
      if (typeof id !== 'string' || !/^[a-z0-9-]{1,24}$/.test(id)) continue;
      if (Object.keys(k.osiagniecia).length >= 60) break;
      if (!k.osiagniecia[id]) k.osiagniecia[id] = Array.isArray(lista) ? teraz : (Number(lista[id]) || teraz);
    }
  }

  async logowanie(body, ip, teraz = Date.now()) {
    body = body && typeof body === 'object' ? body : {};
    if (this.limit(this.proby, ip, LIMIT_PROB, 60000, teraz)) return { status: 429, dane: { blad: 'za-duzo-prob' } };
    const nick = czystyTekst(body.nick, 20);
    const haslo = typeof body.haslo === 'string' ? body.haslo.slice(0, 72) : '';
    const k = this.dane.konta[login(nick)];
    // skrót liczymy zawsze — czas odpowiedzi nie zdradza, czy konto istnieje
    const hash = await skrot(haslo, k ? k.sol : 'brak-konta');
    if (!k || !crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(k.hash, 'hex'))) {
      return { status: 401, dane: { blad: 'zle-dane' } };
    }
    const token = this.nowaSesja(k, teraz);
    this.zapiszPozniej();
    return { status: 200, dane: { token, konto: this.widok(k) } };
  }

  /* Konto po tokenie (albo null). Użycie przedłuża sesję. */
  zTokenu(token, teraz = Date.now()) {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
    const s = this.dane.sesje[token];
    if (!s) return null;
    if (s.do < teraz) { delete this.dane.sesje[token]; return null; }
    const k = this.dane.konta[s.login];
    if (!k) return null;
    if (s.do - teraz < SESJA_MS - 24 * 3600 * 1000) { s.do = teraz + SESJA_MS; this.zapiszPozniej(); }
    return k;
  }

  wyloguj(token) {
    if (typeof token === 'string' && this.dane.sesje[token]) { delete this.dane.sesje[token]; this.zapiszPozniej(); }
    return { status: 200, dane: { ok: true } };
  }

  /* Wygląd robala: kolor i akcesorium (null = bez). Pole pominięte zostaje bez zmian. */
  ustawWyglad(k, body) {
    body = body && typeof body === 'object' ? body : {};
    if (typeof body.kolor === 'string' && /^#[0-9a-f]{6}$/i.test(body.kolor)) k.kolor = body.kolor;
    if (body.akcesorium === null || AKCESORIA.includes(body.akcesorium)) k.akcesorium = body.akcesorium;
    this.zapiszPozniej();
    return { status: 200, dane: { konto: this.widok(k) } };
  }

  /* Wynik jednej partii: { partia (seed), kille, obrazenia, wygrana, rekordTury, osiagniecia: [id], tylkoOsiagniecia? }. */
  wynik(k, body) {
    body = body && typeof body === 'object' ? body : {};
    const partia = String(body.partia || '').slice(0, 40);
    if (!partia) return { status: 400, dane: { blad: 'brak-partii' } };
    const liczba = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v)) || 0));
    // tylkoOsiagniecia: gracz wyszedł w trakcie — zdobyte osiągnięcia zostają, partia się nie liczy
    if (!body.tylkoOsiagniecia && !k.partie.includes(partia)) {
      k.partie.push(partia);
      if (k.partie.length > PAMIETANE_PARTIE) k.partie.shift();
      k.staty.partie++;
      if (body.wygrana === true) k.staty.wygrane++;
      k.staty.kille += liczba(body.kille, 7);                 // w partii jest najwyżej 7 przeciwników
      k.staty.obrazenia += liczba(body.obrazenia, 8000);
      k.staty.rekordTury = Math.max(k.staty.rekordTury, liczba(body.rekordTury, 5000));
    }
    this.dodajOsiagniecia(k, Array.isArray(body.osiagniecia) ? body.osiagniecia : []);
    this.zapiszPozniej();
    return { status: 200, dane: { konto: this.widok(k) } };
  }

  ranking() {
    const lista = Object.values(this.dane.konta)
      .filter((k) => k.staty.partie > 0)
      .sort((a, b) => b.staty.kille - a.staty.kille || b.staty.wygrane - a.staty.wygrane || a.utworzono - b.utworzono)
      .slice(0, RANKING_ILE)
      .map((k) => ({ nick: k.nick, kolor: k.kolor, akcesorium: k.akcesorium || null, kille: k.staty.kille, wygrane: k.staty.wygrane, partie: k.staty.partie }));
    return { ranking: lista };
  }

  /* Reset hasła przez właściciela na VPS (node konta-reset.mjs NICK NOWE_HASLO). */
  async ustawHaslo(nick, haslo) {
    const k = this.dane.konta[login(nick)];
    if (!k) return false;
    k.sol = crypto.randomBytes(16).toString('hex');
    k.hash = await skrot(haslo, k.sol);
    for (const [t, s] of Object.entries(this.dane.sesje)) if (s.login === login(nick)) delete this.dane.sesje[t];
    this.zapiszTeraz();
    return true;
  }

  zapiszPozniej() {
    if (!this.plik || this.zapisCzeka) return;
    this.zapisCzeka = setTimeout(() => { this.zapisCzeka = null; this.zapiszTeraz(); }, 500);
  }

  zapiszTeraz() {
    if (!this.plik) return;
    if (this.zapisCzeka) { clearTimeout(this.zapisCzeka); this.zapisCzeka = null; }
    try {
      const teraz = Date.now();
      for (const [t, s] of Object.entries(this.dane.sesje)) if (s.do < teraz) delete this.dane.sesje[t];
      const tmp = this.plik + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.dane), { mode: 0o600 });
      fs.renameSync(tmp, this.plik);
      this.kopiaDzienna();
    } catch (e) {
      console.error('konta: zapis nieudany', e.message);
    }
  }

  kopiaDzienna() {
    const katalog = path.dirname(this.plik);
    const dzien = new Date().toISOString().slice(0, 10);
    const kopia = path.join(katalog, 'konta-' + dzien + '.json');
    if (fs.existsSync(kopia)) return;
    fs.copyFileSync(this.plik, kopia);
    fs.chmodSync(kopia, 0o600);
    const stare = fs.readdirSync(katalog).filter((f) => /^konta-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of stare.slice(0, Math.max(0, stare.length - KOPII))) fs.unlinkSync(path.join(katalog, f));
  }
}

module.exports = { Konta, idKonta, NICK, AKCESORIA };
