/* Zrzutka na VPS — to samo, co api/zrzutka.js robi w Redisie, tylko w pliku
   JSON na dysku serwera. Lista graczy, sezony i limity pochodzą z api/zrzutka.js
   (jedno źródło), więc przy nowym graczu albo sezonie zmienia się tylko tamten plik.

   Plik (ZRZUTKA_PLIK, na VPS /var/lib/arena/zrzutka.json):
     { sezony: { "1": { sumy: { "fortnite:krayo": 5400, … }, wplaty: [ … ] }, "2": { … } } }
   Zapis: najpierw plik tymczasowy, potem rename — prąd może paść w połowie,
   a stary plik zostaje cały. Raz na dzień kopia zrzutka-RRRR-MM-DD.json (14 ostatnich). */

'use strict';

const fs = require('fs');
const path = require('path');
const api = require('../api/zrzutka.js');

const { GRACZE, SEZON, KLUCZE, MAX_WPLAT, LIMIT_NA_OKNO, OKNO_LIMITU, czystyTekst } = api;
const KOPII = 14;

class Zrzutka {
  constructor(plik) {
    this.plik = plik;
    this.dane = { sezony: {} };
    this.limity = new Map();          // ip → { od, ile }
    this.zapisCzeka = null;
    if (plik) this.wczytaj();
  }

  wczytaj() {
    try {
      const d = JSON.parse(fs.readFileSync(this.plik, 'utf8'));
      if (d && d.sezony && typeof d.sezony === 'object') this.dane = d;
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // Uszkodzony plik — nie nadpisujemy go pustym stanem, odkładamy na bok.
        const bok = this.plik + '.zepsuty-' + Date.now();
        try { fs.renameSync(this.plik, bok); } catch { /* trudno */ }
        console.error('zrzutka: nie da się odczytać pliku, odłożony jako', bok, e.message);
      }
    }
  }

  sezon(n) {
    const k = String(n);
    if (!this.dane.sezony[k]) this.dane.sezony[k] = { sumy: {}, wplaty: [] };
    return this.dane.sezony[k];
  }

  /* Ten sam kształt co GET /api/zrzutka: { sumy, wplaty, teraz, sezon }. */
  stan(n = SEZON, teraz = Date.now()) {
    const s = this.dane.sezony[String(n)] || { sumy: {}, wplaty: [] };
    const sumy = {};
    for (const kat of Object.keys(GRACZE)) {
      sumy[kat] = {};
      for (const id of GRACZE[kat].gracze) sumy[kat][id] = Math.max(0, Number(s.sumy[kat + ':' + id]) || 0);
    }
    return { sumy, wplaty: s.wplaty.slice(0, MAX_WPLAT), teraz, sezon: n };
  }

  /* Czy wolno pytać o ten sezon (bieżący albo archiwum). */
  jestSezon(n) {
    return Number.isInteger(n) && !!KLUCZE[n] && n <= SEZON;
  }

  /* Wpłata. Zwraca { status, dane } — jak odpowiedź API. */
  wplac(body, ip, teraz = Date.now()) {
    body = body && typeof body === 'object' ? body : {};
    const kat = body.kat;
    const komu = body.komu;
    const ile = Math.floor(Number(body.ile));
    if (!GRACZE[kat] || !GRACZE[kat].gracze.includes(komu)) return { status: 400, dane: { blad: 'zly-gracz' } };
    if (!Number.isFinite(ile) || ile < 1 || ile > GRACZE[kat].maks) return { status: 400, dane: { blad: 'zla-kwota' } };

    let l = this.limity.get(ip);
    if (!l || teraz - l.od >= OKNO_LIMITU * 1000) { l = { od: teraz, ile: 0 }; this.limity.set(ip, l); }
    if (++l.ile > LIMIT_NA_OKNO) return { status: 429, dane: { blad: 'za-duzo-wplat' } };
    if (this.limity.size > 5000) {
      for (const [k, v] of this.limity) if (teraz - v.od >= OKNO_LIMITU * 1000) this.limity.delete(k);
    }

    const wpis = {
      kat, komu, ile,
      kto: czystyTekst(body.kto, 24) || 'Anonim',
      t: teraz,
      id: czystyTekst(body.id, 32) || Math.random().toString(36).slice(2, 12)
    };
    const msg = czystyTekst(body.msg, 60);
    if (msg) wpis.msg = msg;

    const s = this.sezon(SEZON);
    s.sumy[kat + ':' + komu] = (Number(s.sumy[kat + ':' + komu]) || 0) + ile;
    s.wplaty.unshift(wpis);
    s.wplaty.length = Math.min(s.wplaty.length, MAX_WPLAT);
    this.zapiszPozniej();
    return { status: 200, dane: this.stan(SEZON, teraz) };
  }

  /* Zapis zbiorczy: kilka wpłat w jednej chwili = jeden zapis na dysk. */
  zapiszPozniej() {
    if (!this.plik || this.zapisCzeka) return;
    this.zapisCzeka = setTimeout(() => { this.zapisCzeka = null; this.zapiszTeraz(); }, 200);
  }

  zapiszTeraz() {
    if (!this.plik) return;
    if (this.zapisCzeka) { clearTimeout(this.zapisCzeka); this.zapisCzeka = null; }
    try {
      const tmp = this.plik + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.dane));
      fs.renameSync(tmp, this.plik);
      this.kopiaDzienna();
    } catch (e) {
      console.error('zrzutka: zapis nieudany', e.message);
    }
  }

  kopiaDzienna() {
    const katalog = path.dirname(this.plik);
    const dzien = new Date().toISOString().slice(0, 10);
    const kopia = path.join(katalog, 'zrzutka-' + dzien + '.json');
    if (fs.existsSync(kopia)) return;
    fs.copyFileSync(this.plik, kopia);
    const stare = fs.readdirSync(katalog).filter((f) => /^zrzutka-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of stare.slice(0, Math.max(0, stare.length - KOPII))) fs.unlinkSync(path.join(katalog, f));
  }

  /* Przeniesienie z Redisa (serwer/migruj-zrzutke.mjs). `zRedisa` to
     { [sezon]: { sumy: {pole: liczba}, wplaty: [...] } }.
     Pusty plik → kopia 1:1. Niepusty → „dogonienie”: wpłaty z Redisa, których tu
     nie ma (po id), są dopisywane razem z kwotą — na wypadek wpłat złożonych
     jeszcze przez Vercel w chwili przełączania. */
  przyjmijZRedisa(zRedisa) {
    const raport = {};
    for (const [n, r] of Object.entries(zRedisa)) {
      const pusty = !this.dane.sezony[n] ||
        (!this.dane.sezony[n].wplaty.length && !Object.keys(this.dane.sezony[n].sumy).length);
      const s = this.sezon(n);
      if (pusty) {
        s.sumy = { ...r.sumy };
        s.wplaty = r.wplaty.slice(0, MAX_WPLAT);
        raport[n] = 'skopiowany (' + r.wplaty.length + ' wpłat na liście)';
        continue;
      }
      const znane = new Set(s.wplaty.map((w) => w.id));
      const nowe = r.wplaty.filter((w) => w && w.id && !znane.has(w.id));
      for (const w of nowe) s.sumy[w.kat + ':' + w.komu] = (Number(s.sumy[w.kat + ':' + w.komu]) || 0) + (Number(w.ile) || 0);
      s.wplaty = s.wplaty.concat(nowe).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, MAX_WPLAT);
      raport[n] = 'dogoniony: +' + nowe.length + ' wpłat';
    }
    this.zapiszTeraz();
    return raport;
  }
}

module.exports = { Zrzutka, SEZON };
