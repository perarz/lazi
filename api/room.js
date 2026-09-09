/* Wspólne lobby Areny GOATów.
 *
 * Pokój to dopisywalny log zdarzeń w Redisie. Klienci tylko dokładają
 * (RPUSH) i czytają przyrostowo (LRANGE) — dzięki temu nie ma wyścigów
 * przy jednoczesnym dołączaniu i wychodzeniu graczy, i nie trzeba
 * compare-and-swap.
 *
 * Token Upstasha nigdy nie trafia do przeglądarki: ta funkcja jest
 * jedynym miejscem, które go zna.
 *
 * CommonJS celowo — bez package.json projekt zostaje czysto statyczny
 * z punktu widzenia Vercela, a runtime Node ma globalny fetch.
 */

/* Integracje Vercela nadaja zmiennym rozne nazwy zaleznie od tego, ktora
   baze podepniesz i jaki prefiks wpiszesz w kreatorze. Zamiast wymuszac
   jedna konkretna, znajdujemy pasujaca pare sami. */
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

const KLUCZ_LOG = 'arena:log';
const KLUCZ_OBECNI = 'arena:obecni';
const KLUCZ_ZAMEK = 'arena:zamek-startu';
const MAX_ZDARZEN = 3000;        // po tylu log jest kasowany razem z partią
const MAX_BODY = 8 * 1024;
const OKNO_LIMITU = 10;          // sekund
/* Limit jest na IP, a gracze siedzacy przy jednym WiFi maja wspolny adres
   publiczny — stad zapas. Jeden klient wysyla ~2-3 POST-y na 10 s (puls plus
   zdarzenia tury), wiec 150 obsluzy kilkunastu graczy za jednym NAT-em,
   a i tak zatrzyma zalew. */
const LIMIT_NA_OKNO = 150;

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

/* Prosty limit na IP — wspólne lobby jest publiczne, więc ktoś musi
   pilnować, żeby jeden klient nie zasypał logu. */
async function przekroczonyLimit(req) {
  const klucz = 'arena:limit:' + ip(req);
  const [licznik] = await pipeline([['INCR', klucz]]);
  if (licznik === 1) await pipeline([['EXPIRE', klucz, String(OKNO_LIMITU)]]);
  return licznik > LIMIT_NA_OKNO;
}

function czysteZdarzenie(z) {
  if (!z || typeof z !== 'object' || typeof z.t !== 'string') return null;
  if (z.t.length > 24) return null;
  // Znacznik czasu stawia serwer, nie klient — inaczej odliczanie liczone
  // z lokalnego Date.now() rozjezdza sie miedzy graczami.
  const s = JSON.stringify({ ...z, st: Date.now() });
  if (s.length > MAX_BODY) return null;
  return s;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const od = Math.max(0, parseInt(req.query.od, 10) || 0);
      const [dlugosc, surowe, obecni] = await pipeline([
        ['LLEN', KLUCZ_LOG],
        ['LRANGE', KLUCZ_LOG, String(od), '-1'],
        ['HGETALL', KLUCZ_OBECNI]
      ]);

      const zdarzenia = [];
      for (const s of surowe || []) {
        try { zdarzenia.push(JSON.parse(s)); } catch { /* pomijamy uszkodzony wpis */ }
      }

      // HGETALL wraca jako płaska lista [pole, wartosc, ...]
      const obecnosc = {};
      const plaska = obecni || [];
      for (let i = 0; i + 1 < plaska.length; i += 2) obecnosc[plaska[i]] = Number(plaska[i + 1]) || 0;

      return res.status(200).json({ od, dlugosc: dlugosc || 0, zdarzenia, obecnosc, teraz: Date.now() });
    }

    if (req.method === 'POST') {
      if (await przekroczonyLimit(req)) {
        return res.status(429).json({ blad: 'za-duzo-zapytan' });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const zdarzenie = body && body.zdarzenie;
      const serializowane = czysteZdarzenie(zdarzenie);
      if (!serializowane) return res.status(400).json({ blad: 'zle-zdarzenie' });

      // Puls trzymamy poza logiem — inaczej bicie serca zalałoby historię.
      if (zdarzenie.t === 'puls') {
        if (!zdarzenie.id) return res.status(400).json({ blad: 'brak-id' });
        await pipeline([
          ['HSET', KLUCZ_OBECNI, String(zdarzenie.id), String(Date.now())],
          ['EXPIRE', KLUCZ_OBECNI, '3600']
        ]);
        return res.status(200).json({ ok: true });
      }

      // Nowa partia zaczyna log od zera; klienci wykryją to po skróceniu
      // długości i przewiną swój kursor.
      if (zdarzenie.t === 'nowa') {
        const [zamek] = await pipeline([
          ['SET', KLUCZ_ZAMEK, String(Date.now()), 'NX', 'EX', '8']
        ]);
        if (zamek === null) {
          // Ktos inny wlasnie startuje partie — nie robimy drugiej.
          return res.status(200).json({ ok: false, powod: 'juz-startuje' });
        }
        const [, dlugosc] = await pipeline([
          ['DEL', KLUCZ_LOG],
          ['RPUSH', KLUCZ_LOG, serializowane]
        ]);
        return res.status(200).json({ ok: true, dlugosc });
      }

      // Wyjscie gracza kasuje go tez z listy obecnych, zeby lobby
      // odswiezalo sie od razu, a nie dopiero po wygasnieciu pulsu.
      if (zdarzenie.t === 'wyjdz' && zdarzenie.id) {
        await pipeline([['HDEL', KLUCZ_OBECNI, String(zdarzenie.id)]]);
      }

      const [dlugosc] = await pipeline([['RPUSH', KLUCZ_LOG, serializowane]]);
      if (dlugosc > MAX_ZDARZEN) {
        // Log spuchł (zawieszona partia) — zaczynamy od czysta.
        await pipeline([['DEL', KLUCZ_LOG]]);
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
        // same nazwy, zeby dalo sie zdiagnozowac literowke w prefiksie —
        // wartosci nie wychodza nigdy poza serwer
        widzianeZmienne: nazwyPodobnychZmiennych()
      });
    }
    return res.status(500).json({ blad: 'serwer', opis: String((e && e.message) || e).slice(0, 200) });
  }
};
