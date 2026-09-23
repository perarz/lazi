/* Wspólne lobby i partie Areny GOATów (protokół v2).

   Pokój to dopisywalny log zdarzeń w Redisie. Klienci tylko dokładają
   (RPUSH) i czytają przyrostowo (LRANGE) — kolejność w logu jest jedna
   dla wszystkich i to ona rozstrzyga spory (patrz gra/src/protokol.js).

   Poza logiem, w jednym haszu, trzymamy rzeczy ulotne:
     epoka   — rośnie przy każdej nowej partii; klient, który zobaczy
               inną epokę niż znał, czyta log od zera (sam spadek długości
               logu nie wystarczał: nowa partia mogła go już odrosnąć)
     p:<id>  — ostatni puls gracza (obecność)
     ruch    — podgląd na żywo gracza z turą (pozycja, celownik, moc)

   Token Upstasha nigdy nie trafia do przeglądarki.
   CommonJS celowo — bez package.json projekt zostaje czysto statyczny
   z punktu widzenia Vercela, a runtime Node ma globalny fetch.

   Stary adres /api/room zniknął razem ze starym protokołem: karta
   z nieodświeżoną starą wersją gry dostanie 404, zamiast mieszać
   zdarzenia w nowej partii. */

function znajdzKonfiguracje() {
  const env = process.env;

  const znaneParty = [
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['REDIS_REST_URL', 'REDIS_REST_TOKEN']
  ];
  for (const [u, t] of znaneParty) {
    if (env[u] && env[t]) return { url: env[u], token: env[t], para: u + ' + ' + t };
  }

  // Dowolny wlasny prefiks: <COS>_REST_API_URL / _TOKEN albo <COS>_REDIS_REST_URL / _TOKEN
  const koncowki = [
    ['_REST_API_URL', '_REST_API_TOKEN'],
    ['_REDIS_REST_URL', '_REDIS_REST_TOKEN']
  ];
  for (const klucz of Object.keys(env)) {
    for (const [konU, konT] of koncowki) {
      if (!klucz.endsWith(konU)) continue;
      const klucztokenu = klucz.slice(0, -konU.length) + konT;
      if (env[klucz] && env[klucztokenu]) {
        return { url: env[klucz], token: env[klucztokenu], para: klucz + ' + ' + klucztokenu };
      }
    }
  }
  return null;
}

/* Do komunikatu diagnostycznego: same NAZWY zmiennych, nigdy wartosci. */
function nazwyPodobnychZmiennych() {
  return Object.keys(process.env)
    .filter((k) => /REDIS|UPSTASH|\bKV_|_REST_API_/i.test(k))
    .sort();
}

const KLUCZ_LOG = 'arena2:log';
const KLUCZ_STAN = 'arena2:stan';
const KLUCZ_ZAMEK = 'arena2:zamek-startu';
const MAX_ZDARZEN = 4000;        // po tylu log jest zerowany (nowa epoka)
const MAX_BODY = 24 * 1024;      // stan tury z kraterami mieści się z zapasem
const MAX_RUCH = 600;
const TTL = 6 * 3600;            // porzucony pokój sam się sprząta
const OKNO_LIMITU = 10;          // sekund
/* Limit jest na IP, a gracze przy jednym WiFi mają wspólny adres publiczny.
   Klient wysyła ~3 zapytania na 10 s (puls, zdarzenia) plus podgląd ruchu
   co ~0,5 s w swojej turze — 200 obsłuży kilku graczy za jednym NAT-em. */
const LIMIT_NA_OKNO = 200;

async function pipeline(komendy) {
  const cfg = znajdzKonfiguracje();
  if (!cfg) {
    const e = new Error('brak-konfiguracji');
    e.brakKonfiguracji = true;
    throw e;
  }
  const odp = await fetch(cfg.url.replace(/\/+$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(komendy)
  });
  if (!odp.ok) throw new Error('redis ' + odp.status + ' ' + (await odp.text()).slice(0, 200));
  const wynik = await odp.json();
  return wynik.map((r) => r.result);
}

function ip(req) {
  const f = req.headers['x-forwarded-for'];
  return (Array.isArray(f) ? f[0] : (f || '')).split(',')[0].trim() || 'nieznane';
}

async function przekroczonyLimit(req) {
  const klucz = 'arena2:limit:' + ip(req);
  const [licznik] = await pipeline([['INCR', klucz]]);
  if (licznik === 1) await pipeline([['EXPIRE', klucz, String(OKNO_LIMITU)]]);
  return licznik > LIMIT_NA_OKNO;
}

const poprawneId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 32;

/* Znacznik czasu stawia serwer, nie klient — wspólny zegar dla wszystkich. */
function serializuj(z, max) {
  if (!z || typeof z !== 'object' || typeof z.t !== 'string' || z.t.length > 24) return null;
  const s = JSON.stringify({ ...z, st: Date.now() });
  return s.length > max ? null : s;
}

function czytajHasz(plaska) {
  const wynik = { epoka: 0, obecnosc: {}, ruch: null };
  const p = plaska || [];
  for (let i = 0; i + 1 < p.length; i += 2) {
    const k = p[i], v = p[i + 1];
    if (k === 'epoka') wynik.epoka = Number(v) || 0;
    else if (k === 'ruch') { try { wynik.ruch = JSON.parse(v); } catch { /* uszkodzony */ } }
    else if (k.startsWith('p:')) wynik.obecnosc[k.slice(2)] = Number(v) || 0;
  }
  return wynik;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const od = Math.max(0, parseInt(req.query.od, 10) || 0);
      const [surowe, hasz] = await pipeline([
        ['LRANGE', KLUCZ_LOG, String(od), '-1'],
        ['HGETALL', KLUCZ_STAN]
      ]);
      const zdarzenia = [];
      for (const s of surowe || []) {
        try { zdarzenia.push(JSON.parse(s)); } catch { zdarzenia.push(null); }   // null trzyma numerację
      }
      const h = czytajHasz(hasz);
      return res.status(200).json({ od, zdarzenia, epoka: h.epoka, obecnosc: h.obecnosc, ruch: h.ruch, teraz: Date.now() });
    }

    if (req.method === 'POST') {
      if (await przekroczonyLimit(req)) {
        return res.status(429).json({ blad: 'za-duzo-zapytan' });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const z = body.zdarzenie;
      if (!z || typeof z !== 'object' || typeof z.t !== 'string') {
        return res.status(400).json({ blad: 'zle-zdarzenie' });
      }

      // Puls i podgląd ruchu nie idą do logu — są ulotne.
      if (z.t === 'puls') {
        if (!poprawneId(z.id)) return res.status(400).json({ blad: 'brak-id' });
        await pipeline([
          ['HSET', KLUCZ_STAN, 'p:' + z.id, String(Date.now())],
          ['EXPIRE', KLUCZ_STAN, String(TTL)]
        ]);
        return res.status(200).json({ ok: true });
      }
      if (z.t === 'ruch') {
        const s = serializuj(z, MAX_RUCH);
        if (!s || !poprawneId(z.id)) return res.status(400).json({ blad: 'zly-ruch' });
        await pipeline([['HSET', KLUCZ_STAN, 'ruch', s], ['EXPIRE', KLUCZ_STAN, String(TTL)]]);
        return res.status(200).json({ ok: true });
      }

      const s = serializuj(z, MAX_BODY);
      if (!s) return res.status(400).json({ blad: 'zle-zdarzenie' });

      // Nowa partia: log od zera i nowa epoka. Zamek rozstrzyga, kto ją
      // faktycznie zakłada, gdy kilku klientów próbuje naraz.
      if (z.t === 'nowa') {
        const [zamek] = await pipeline([['SET', KLUCZ_ZAMEK, String(Date.now()), 'NX', 'EX', '8']]);
        if (zamek === null) return res.status(200).json({ ok: false, powod: 'juz-startuje' });
        const [, , epoka] = await pipeline([
          ['DEL', KLUCZ_LOG],
          ['RPUSH', KLUCZ_LOG, s],
          ['HINCRBY', KLUCZ_STAN, 'epoka', '1'],
          ['HDEL', KLUCZ_STAN, 'ruch'],
          ['EXPIRE', KLUCZ_LOG, String(TTL)],
          ['EXPIRE', KLUCZ_STAN, String(TTL)]
        ]);
        return res.status(200).json({ ok: true, epoka });
      }

      const komendy = [['RPUSH', KLUCZ_LOG, s], ['EXPIRE', KLUCZ_LOG, String(TTL)]];
      // Wyjście od razu zdejmuje gracza z obecnych — inni nie czekają na przeterminowanie pulsu.
      if (z.t === 'wyjdz' && poprawneId(z.id)) komendy.push(['HDEL', KLUCZ_STAN, 'p:' + z.id]);
      const [dlugosc] = await pipeline(komendy);
      if (dlugosc > MAX_ZDARZEN) {
        // Log spuchł — zaczynamy od czysta w nowej epoce (klienci przeczytają od zera).
        await pipeline([['DEL', KLUCZ_LOG], ['HINCRBY', KLUCZ_STAN, 'epoka', '1']]);
      }
      return res.status(200).json({ ok: true, dlugosc });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ blad: 'zla-metoda' });
  } catch (e) {
    if (e && e.brakKonfiguracji) {
      return res.status(503).json({
        blad: 'brak-konfiguracji',
        opis: 'Nie znaleziono pary zmiennych z adresem i tokenem Redisa. ' +
              'Podepnij bazę z Vercel Marketplace do tego projektu (Production + Preview).',
        // same nazwy, żeby dało się zdiagnozować literówkę w prefiksie —
        // wartości nie wychodzą nigdy poza serwer
        widzianeZmienne: nazwyPodobnychZmiennych()
      });
    }
    if (e instanceof SyntaxError) return res.status(400).json({ blad: 'zly-json' });
    return res.status(500).json({ blad: 'serwer', opis: String((e && e.message) || e).slice(0, 200) });
  }
};
