/* Wspólne sumy zrzutki (V-dolce i srebrniki).
 *
 * Ta sama baza Redis co Arena (api/arena.js), osobne klucze:
 *   zrzutka:sumy    — hash "kategoria:gracz" -> suma (HINCRBY, bez wyścigów)
 *   zrzutka:wplaty  — lista ostatnich wpłat (LPUSH + LTRIM)
 *
 * Odznaki, zaczepki i tytuły sponsora zostają w przeglądarce — wspólne
 * są tylko pieniądze, których i tak nie ma.
 *
 * CommonJS i brak package.json celowo, tak jak w api/arena.js.
 */

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

/* Gracze i limity muszą się zgadzać z zrzutka/dane.js — serwer nie ufa
   klientowi, więc trzyma własną, krótką listę. */
const GRACZE = {
  fortnite: { maks: 2000, gracze: ['powpow', 'krayo', 'karp', 'apollo'] },
  zeroad: { maks: 2000, gracze: ['kozak', 'lazi', 'stozhinio', 'nolli', 'apollo', 'froxy', 'quber'] }
};

const KLUCZ_SUMY = 'zrzutka:sumy';
const KLUCZ_WPLATY = 'zrzutka:wplaty';
const MAX_WPLAT = 60;
const OKNO_LIMITU = 60;       // sekund
const LIMIT_NA_OKNO = 30;     // wpłat na IP w oknie — dla beki wystarczy

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

// tekst od użytkownika: bez znaków sterujących, bez nadmiaru spacji, przycięty
function czystyTekst(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function stan() {
  const [sumyPlaskie, surowe] = await pipeline([
    ['HGETALL', KLUCZ_SUMY],
    ['LRANGE', KLUCZ_WPLATY, '0', String(MAX_WPLAT - 1)]
  ]);

  const sumy = {};
  for (const kat of Object.keys(GRACZE)) {
    sumy[kat] = {};
    for (const id of GRACZE[kat].gracze) sumy[kat][id] = 0;
  }
  // HGETALL wraca jako płaska lista [pole, wartosc, ...]
  const plaska = sumyPlaskie || [];
  for (let i = 0; i + 1 < plaska.length; i += 2) {
    const [kat, id] = String(plaska[i]).split(':');
    if (sumy[kat] && id in sumy[kat]) sumy[kat][id] = Math.max(0, Number(plaska[i + 1]) || 0);
  }

  const wplaty = [];
  for (const s of surowe || []) {
    try { wplaty.push(JSON.parse(s)); } catch { /* pomijamy uszkodzony wpis */ }
  }
  return { sumy, wplaty, teraz: Date.now() };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await stan());
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const kat = body.kat;
      const komu = body.komu;
      const ile = Math.floor(Number(body.ile));

      if (!GRACZE[kat] || !GRACZE[kat].gracze.includes(komu)) {
        return res.status(400).json({ blad: 'zly-gracz' });
      }
      if (!Number.isFinite(ile) || ile < 1 || ile > GRACZE[kat].maks) {
        return res.status(400).json({ blad: 'zla-kwota' });
      }

      const kluczLimitu = 'zrzutka:limit:' + ip(req);
      const [licznik] = await pipeline([['INCR', kluczLimitu]]);
      if (licznik === 1) await pipeline([['EXPIRE', kluczLimitu, String(OKNO_LIMITU)]]);
      if (licznik > LIMIT_NA_OKNO) return res.status(429).json({ blad: 'za-duzo-wplat' });

      const wpis = {
        kat,
        komu,
        ile,
        kto: czystyTekst(body.kto, 24) || 'Anonim',
        t: Date.now(),
        // losowy identyfikator, żeby klient poznał własną wpłatę na liście
        id: czystyTekst(body.id, 32) || Math.random().toString(36).slice(2, 12)
      };
      const msg = czystyTekst(body.msg, 60);
      if (msg) wpis.msg = msg;

      await pipeline([
        ['HINCRBY', KLUCZ_SUMY, kat + ':' + komu, String(ile)],
        ['LPUSH', KLUCZ_WPLATY, JSON.stringify(wpis)],
        ['LTRIM', KLUCZ_WPLATY, '0', String(MAX_WPLAT - 1)]
      ]);
      return res.status(200).json(await stan());
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ blad: 'zla-metoda' });
  } catch (e) {
    if (e && e.brakKonfiguracji) return res.status(503).json({ blad: 'brak-konfiguracji' });
    if (e instanceof SyntaxError) return res.status(400).json({ blad: 'zly-json' });
    // Szczegóły tylko do logów Vercela — komunikat z Redisa czy fetcha
    // może zawierać adres bazy, więc do przeglądarki idzie sam kod błędu.
    console.error('[' + (req.url || 'api') + ']', e);
    return res.status(500).json({ blad: 'serwer' });
  }
};
