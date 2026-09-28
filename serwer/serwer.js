/* Serwer Areny GOATów i zrzutki na VPS — (dawniej api/ na Vercelu + Redis).

   WebSocket (/ws?pokoj=nazwa) zamiast odpytywania: klient dostaje każdą
   zmianę pokoju od razu, w tym samym kształcie co dawne GET /api/arena
   ({ od, zdarzenia, epoka, obecnosc, ruch, teraz }), więc protokol.js
   niczego nie musi wiedzieć o transporcie.

   Wiadomości klient → serwer:
     { typ: 'hej', od, epoka }        — subskrypcja; serwer odsyła log od `od`
                                         (albo od zera, gdy epoka się nie zgadza)
     { typ: 'zd', nr, zdarzenie }     — zdarzenie; odpowiedź { typ: 'odp', nr, dane }
     { typ: 'czas', t0 }              — pomiar zegara; odpowiedź { typ: 'czas', t0, teraz }
   Serwer → klient:
     { typ: 'stan', od, zdarzenia, epoka, obecnosc, ruch, teraz }

   HTTP:
     GET  /zdrowie                    — czy żyje (dla Caddy / diagnostyki)
     POST /api/arena[?pokoj=]         — to samo co 'zd', dla sendBeacon przy zamknięciu karty
     GET  /api/zrzutka[?sezon=N]      — sumy i ostatnie wpłaty (jak dawne api/zrzutka.js)
     POST /api/zrzutka                — wpłata

   Konta i pokoje (od 4.6, token sesji zawsze w treści POST, nigdy w adresie GET):
     POST /api/konto/rejestracja      { nick, haslo, stare? } → { token, konto }
     POST /api/konto/logowanie        { nick, haslo } → { token, konto }
     POST /api/konto/ja               { token } → { konto }
     POST /api/konto/wyloguj          { token }
     POST /api/konto/wyglad           { token, kolor?, akcesorium? }  (dawniej /kolor — zostaje jako alias)
     POST /api/konto/wynik            { token, partia, kille, obrazenia, wygrana, rekordTury, osiagniecia }
     GET  /api/ranking                — top 50 po killach
     GET  /api/pokoje                 — lista pokoi (nazwa, hasło tak/nie, gracze, czy trwa partia)
     POST /api/pokoje                 { token, nazwa, haslo? } → { id, klucz }
     POST /api/pokoje/wejdz           { token, id, haslo } → { klucz }
   WebSocket Areny wymaga zalogowania: /ws?pokoj=ID&token=…[&klucz=…] (klucz = pokój na hasło).
   Serwer sam wpisuje w zdarzenia id gracza z konta (i nick w 'dolacz') — nikt nie gra za kogoś.

   Zrzutka na żywo: WebSocket /zrzutka/ws — po połączeniu i po każdej wpłacie
   serwer wysyła { typ: 'zrzutka', sumy, wplaty, teraz, sezon }.

   Konfiguracja przez zmienne środowiskowe (patrz serwer/INSTALACJA.md):
     ARENA_PORT      (8787)  — port lokalny; z zewnątrz ruch idzie przez Caddy (HTTPS)
     ARENA_ORIGINS           — dodatkowe dozwolone strony, po przecinku
                               (zawsze wolno *.vercel.app i localhost)
     ZRZUTKA_PLIK            — plik z danymi zrzutki (brak = tylko w pamięci, do testów)
     KONTA_PLIK              — plik z kontami graczy (brak = tylko w pamięci, do testów) */

'use strict';

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Pokoj, MAX_ZDARZENIE } = require('./pokoj');
const { Zrzutka, SEZON } = require('./zrzutka');
const { Konta, wolnoNosic } = require('./konta');
const { czystyTekst } = require('./gracze');

const PORT = Number(process.env.ARENA_PORT) || 8787;
const DODATKOWE_ORIGINS = String(process.env.ARENA_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const MAX_POKOI = 200;
const MAX_POLACZEN_NA_IP = 30;
const LIMIT_WIADOMOSCI = 60;         // na sekundę na połączenie (ruch co 0,1 s + zdarzenia z zapasem)
const HEARTBEAT_MS = 4000;           // świeża obecność dla klientów (protokol.js ufa jej ~6 s)
const PING_MS = 25000;               // wykrywanie martwych połączeń
const POKOJ_PORZUCONY_MS = 6 * 3600 * 1000;

const zrzutka = new Zrzutka(process.env.ZRZUTKA_PLIK || null);
const widzowieZrzutki = new Set();   // połączenia /zrzutka/ws
const MAX_WPLATA_BAJTY = 2048;

// Bez KONTA_PLIK konta leżą obok zrzutki (na VPS /var/lib/arena/konta.json) — bez zmian w usłudze systemd.
const konta = new Konta(process.env.KONTA_PLIK ||
  (process.env.ZRZUTKA_PLIK ? require('path').join(require('path').dirname(process.env.ZRZUTKA_PLIK), 'konta.json') : null));
const MAX_KONTO_BAJTY = 4096;

/* Pokoje założone w panelu (od 4.6): id → { nazwa, zalozyl, sol, hasloHash, klucz, pustyOd, byl }.
   Pokój bez wpisu (np. 'glowny' albo ?pokoj= z testów) jest publiczny. */
const opisy = new Map();
const MAX_WLASNYCH_POKOI = 40;
const POKOI_NA_KONTO = 3;
/* Arena, w której nie ma nikogo, od razu znika z listy i nie liczy się do limitu aren na konto
   (od 4.10; do 4.9 wisiała pusta 10 minut). Skasowana jest po PUSTY_POKOJ_MS — do tego czasu
   wraca do niej odświeżona strona, telefon po krótkiej utracie zasięgu albo znajomy z linku. */
const PUSTY_POKOJ_MS = 30 * 1000;
const SPRZATANIE_MS = 5000;
const ID_Z_PANELU = /^p-[0-9a-f]{8}$/;
const skrotHasla = (haslo, sol) => crypto.createHash('sha256').update(sol + ':' + haslo).digest('hex');

const pokoje = new Map();            // nazwa → Pokoj
const polaczenia = new Map();        // nazwa pokoju → Set<ws>
const polaczeniaNaIp = new Map();

function nazwaPokoju(surowa) {
  const n = String(surowa || 'glowny').toLowerCase();
  return /^[a-z0-9-]{1,24}$/.test(n) ? n : null;
}

function pokoj(nazwa) {
  let p = pokoje.get(nazwa);
  if (!p) {
    if (pokoje.size >= MAX_POKOI) return null;
    p = new Pokoj(nazwa);
    pokoje.set(nazwa, p);
  }
  return p;
}

/* Czy wolno wejść do pokoju: publiczny albo z właściwym kluczem (dostaje się go za hasło). */
function wstepDoPokoju(nazwa, klucz) {
  const o = opisy.get(nazwa);
  if (!o || !o.hasloHash) return true;
  return typeof klucz === 'string' && klucz.length === o.klucz.length &&
    crypto.timingSafeEqual(Buffer.from(klucz), Buffer.from(o.klucz));
}

/* Zdarzenie od zalogowanego gracza: id (i nick przy dołączeniu) bierzemy z konta. */
function przypnijKonto(z, konto) {
  if (!z || typeof z !== 'object' || Array.isArray(z) || !konto) return z;
  const wynik = { ...z };
  if ('id' in wynik) wynik.id = konto.id;
  if (wynik.t === 'dolacz') {
    wynik.name = konto.nick.slice(0, 14);
    if (wynik.akc != null && !wolnoNosic(konto, wynik.akc)) delete wynik.akc;
  }
  return wynik;
}

/* Od 4.7 nie ma domyślnej areny: grać można tylko w pokoju, który ktoś założył
   (pokój bez opisu — np. z testów — pojawia się na liście tylko, gdy ktoś w nim jest). */
function listaPokoi(teraz = Date.now()) {
  const wynik = [];
  const nazwy = new Set([...opisy.keys(), ...polaczenia.keys()]);
  for (const id of nazwy) {
    const o = opisy.get(id);
    const p = pokoje.get(id);
    const nicki = new Set();
    for (const ws of polaczenia.get(id) || []) if (ws.konto) nicki.add(ws.konto.nick);
    if (!nicki.size) continue;          // pusta arena znika z listy od razu
    // partia trwa, jeśli log zaczyna się od 'nowa' i ktoś ostatnio strzelił albo spasował
    let partia = false;
    if (p && p.log.length && p.log[0].t === 'nowa') {
      for (let i = p.log.length - 1; i >= 0 && i >= p.log.length - 400; i--) {
        const z = p.log[i];
        if ((z.t === 'strzal' || z.t === 'pas' || z.t === 'stan' || z.t === 'nowa') && teraz - z.st < 120000) { partia = true; break; }
      }
    }
    wynik.push({
      id,
      nazwa: o ? o.nazwa : id,
      haslo: !!(o && o.hasloHash),
      zalozyl: o ? o.zalozyl : null,
      gracze: [...nicki].slice(0, 12),
      ile: nicki.size,
      partia
    });
  }
  // najpełniejsze na górze, potem po nazwie
  wynik.sort((a, b) => b.ile - a.ile || a.nazwa.localeCompare(b.nazwa));
  return { pokoje: wynik.slice(0, 60) };
}

function nowyPokoj(konto, body) {
  const nazwa = czystyTekst(body.nazwa, 24);
  const haslo = typeof body.haslo === 'string' ? body.haslo.slice(0, 40) : '';
  if (nazwa.length < 3) return { status: 400, dane: { blad: 'zla-nazwa' } };
  if (haslo && haslo.length < 3) return { status: 400, dane: { blad: 'zle-haslo' } };
  if (opisy.size >= MAX_WLASNYCH_POKOI) return { status: 503, dane: { blad: 'za-duzo-pokoi' } };
  // do limitu liczą się areny, w których ktoś jest, i świeżo założone (założyciel jeszcze do nich wchodzi)
  const teraz = Date.now();
  const moje = [...opisy].filter(([id, o]) => o.zalozyl === konto.nick &&
    (polaczenia.has(id) || (!o.byl && teraz - o.pustyOd < PUSTY_POKOJ_MS)));
  if (moje.length >= POKOI_NA_KONTO) return { status: 429, dane: { blad: 'masz-za-duzo-pokoi' } };
  let id;
  do { id = 'p-' + crypto.randomBytes(4).toString('hex'); } while (opisy.has(id) || pokoje.has(id));
  const sol = crypto.randomBytes(8).toString('hex');
  const klucz = crypto.randomBytes(12).toString('hex');
  opisy.set(id, { nazwa, zalozyl: konto.nick, sol, hasloHash: haslo ? skrotHasla(haslo, sol) : null, klucz, pustyOd: teraz, byl: false });
  return { status: 200, dane: { id, klucz: haslo ? klucz : null } };
}

/* Wejście do areny (też z linku, gdy pusta nie jest na liście) — z nazwą, żeby było co pokazać. */
function wejdzDoPokoju(body) {
  const o = opisy.get(body.id);
  if (!o) return { status: 404, dane: { blad: 'nie-ma-pokoju' } };
  if (!o.hasloHash) return { status: 200, dane: { klucz: null, nazwa: o.nazwa } };
  const haslo = typeof body.haslo === 'string' ? body.haslo.slice(0, 40) : '';
  if (skrotHasla(haslo, o.sol) !== o.hasloHash) return { status: 403, dane: { blad: 'zle-haslo', nazwa: o.nazwa } };
  return { status: 200, dane: { klucz: o.klucz, nazwa: o.nazwa } };
}

function dozwolonyOrigin(origin) {
  if (!origin) return true;          // nie-przeglądarka (curl, testy) — i tak bez ciasteczek
  if (DODATKOWE_ORIGINS.includes(origin)) return true;
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ||
         /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function ipKlienta(req) {
  const f = req.headers['x-forwarded-for'];
  return (Array.isArray(f) ? f[0] : (f || '')).split(',')[0].trim() || req.socket.remoteAddress || 'nieznane';
}

function wyslij(ws, obiekt) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obiekt));
}

/* Rozesłanie zmian: każdy klient dostaje to, czego jeszcze nie ma
   (serwer pamięta jego kursor i epokę). */
function rozeslij(nazwa) {
  const p = pokoje.get(nazwa);
  const zbior = polaczenia.get(nazwa);
  if (!p || !zbior) return;
  const teraz = Date.now();
  for (const ws of zbior) {
    if (!ws.zasubskrybowany) continue;
    const od = ws.epoka === p.epoka ? Math.min(ws.kursor, p.log.length) : 0;
    wyslij(ws, { typ: 'stan', ...p.stan(od, teraz) });
    ws.kursor = p.log.length;
    ws.epoka = p.epoka;
  }
}

function obsluzZdarzenie(nazwa, zdarzenie) {
  const p = pokoj(nazwa);
  if (!p) return { blad: 'za-duzo-pokoi' };
  const wynik = p.przyjmij(zdarzenie, Date.now());
  if (wynik.zmiana) rozeslij(nazwa);
  return wynik;
}

function rozeslijZrzutke() {
  if (!widzowieZrzutki.size) return;
  const tekst = JSON.stringify({ typ: 'zrzutka', ...zrzutka.stan() });
  for (const ws of widzowieZrzutki) if (ws.readyState === ws.OPEN) ws.send(tekst);
}

function czytajCialo(req, max, gotowe) {
  let body = '';
  let zaDuzo = false;
  req.on('data', (c) => {
    if (zaDuzo) return;
    body += c;
    if (body.length > max) { zaDuzo = true; req.destroy(); }
  });
  req.on('end', () => { if (!zaDuzo) gotowe(body); });
}

function json(res, status, obiekt) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obiekt));
}

/* ---------- HTTP ---------- */

const serwer = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const origin = req.headers.origin;
  if (origin && dozwolonyOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET' && u.pathname === '/zdrowie') {
    let n = 0;
    for (const z of polaczenia.values()) n += z.size;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, pokoje: pokoje.size, polaczenia: n, teraz: Date.now() }));
  }

  if (req.method === 'OPTIONS' && (u.pathname === '/api/arena' || u.pathname === '/api/zrzutka' ||
      u.pathname.startsWith('/api/konto/') || u.pathname.startsWith('/api/pokoje') || u.pathname === '/api/ranking')) {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    return res.end();
  }

  // sendBeacon przy zamknięciu karty (text/plain, bez preflightu)
  if (req.method === 'POST' && u.pathname === '/api/arena') {
    if (origin && !dozwolonyOrigin(origin)) { res.statusCode = 403; return res.end(); }
    const nazwa = nazwaPokoju(u.searchParams.get('pokoj'));
    if (!nazwa) { res.statusCode = 400; return res.end(); }
    const konto = konta.zTokenu(u.searchParams.get('token'));
    if (!konto) { res.statusCode = 401; return res.end(); }
    if (!wstepDoPokoju(nazwa, u.searchParams.get('klucz'))) { res.statusCode = 403; return res.end(); }
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > MAX_ZDARZENIE + 1024) req.destroy();
    });
    req.on('end', () => {
      let dane;
      try { dane = JSON.parse(body || '{}'); } catch { res.statusCode = 400; return res.end(); }
      const wynik = obsluzZdarzenie(nazwa, przypnijKonto(dane && dane.zdarzenie, konto));
      res.setHeader('Content-Type', 'application/json');
      if (wynik.blad) res.statusCode = 400;
      res.end(JSON.stringify(wynik.blad ? { blad: wynik.blad } : wynik.odp));
    });
    return;
  }

  if (req.method === 'GET' && u.pathname === '/api/zrzutka') {
    const q = u.searchParams.has('sezon') ? Number(u.searchParams.get('sezon')) : SEZON;
    if (!zrzutka.jestSezon(q)) return json(res, 404, { blad: 'nie-ma-sezonu' });
    // archiwum się nie zmienia — przeglądarka może je trzymać dobę
    if (q !== SEZON) res.setHeader('Cache-Control', 'public, max-age=86400');
    return json(res, 200, zrzutka.stan(q));
  }

  if (req.method === 'POST' && u.pathname === '/api/zrzutka') {
    if (origin && !dozwolonyOrigin(origin)) return json(res, 403, { blad: 'obca-strona' });
    return czytajCialo(req, MAX_WPLATA_BAJTY, (body) => {
      let dane;
      try { dane = JSON.parse(body || '{}'); } catch { return json(res, 400, { blad: 'zly-json' }); }
      const wynik = zrzutka.wplac(dane, ipKlienta(req));
      json(res, wynik.status, wynik.dane);
      if (wynik.status === 200) rozeslijZrzutke();
    });
  }

  if (req.method === 'GET' && u.pathname === '/api/ranking') return json(res, 200, konta.ranking());
  if (req.method === 'GET' && u.pathname === '/api/pokoje') return json(res, 200, listaPokoi());

  if (req.method === 'POST' && (u.pathname.startsWith('/api/konto/') || u.pathname.startsWith('/api/pokoje'))) {
    if (origin && !dozwolonyOrigin(origin)) return json(res, 403, { blad: 'obca-strona' });
    return czytajCialo(req, MAX_KONTO_BAJTY, async (body) => {
      let dane;
      try { dane = JSON.parse(body || '{}'); } catch { return json(res, 400, { blad: 'zly-json' }); }
      if (!dane || typeof dane !== 'object') return json(res, 400, { blad: 'zly-json' });
      try {
        const ip = ipKlienta(req);
        let w;
        if (u.pathname === '/api/konto/rejestracja') w = await konta.rejestracja(dane, ip);
        else if (u.pathname === '/api/konto/logowanie') w = await konta.logowanie(dane, ip);
        else if (u.pathname === '/api/konto/wyloguj') w = konta.wyloguj(dane.token);
        else {
          const k = konta.zTokenu(dane.token);
          if (!k) return json(res, 401, { blad: 'zaloguj-sie' });
          if (u.pathname === '/api/konto/ja') w = { status: 200, dane: { konto: konta.widok(k) } };
          else if (u.pathname === '/api/konto/wyglad' || u.pathname === '/api/konto/kolor') w = konta.ustawWyglad(k, dane);
          else if (u.pathname === '/api/konto/wynik') w = konta.wynik(k, dane);
          else if (u.pathname === '/api/pokoje') w = nowyPokoj(k, dane);
          else if (u.pathname === '/api/pokoje/wejdz') w = wejdzDoPokoju(dane);
          else w = { status: 404, dane: { blad: 'nie-ma' } };
        }
        json(res, w.status, w.dane);
      } catch (e) {
        console.error('konta:', e);
        json(res, 500, { blad: 'serwer' });
      }
    });
  }

  res.statusCode = 404;
  res.end();
});

/* ---------- WebSocket ---------- */

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_ZDARZENIE + 1024 });

serwer.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url, 'http://x');
  const nazwa = nazwaPokoju(u.searchParams.get('pokoj'));
  const ip = ipKlienta(req);
  const odmow = (kod) => { socket.write('HTTP/1.1 ' + kod + '\r\n\r\n'); socket.destroy(); };
  const doZrzutki = u.pathname === '/zrzutka/ws';
  if (!doZrzutki && (u.pathname !== '/ws' || !nazwa)) return odmow('404 Not Found');
  if (!dozwolonyOrigin(req.headers.origin)) {
    console.warn('odrzucony origin:', req.headers.origin);
    return odmow('403 Forbidden');
  }
  if ((polaczeniaNaIp.get(ip) || 0) >= MAX_POLACZEN_NA_IP) return odmow('429 Too Many Requests');
  // Arena tylko dla zalogowanych; pokój na hasło tylko z kluczem
  const konto = doZrzutki ? null : konta.zTokenu(u.searchParams.get('token'));
  if (!doZrzutki && !konto) return odmow('401 Unauthorized');
  if (!doZrzutki && !wstepDoPokoju(nazwa, u.searchParams.get('klucz'))) return odmow('403 Forbidden');
  // arena z panelu, która już zniknęła (była pusta) — nie wskrzeszamy jej jako pokoju bez nazwy
  if (!doZrzutki && ID_Z_PANELU.test(nazwa) && !opisy.has(nazwa)) return odmow('404 Not Found');
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.konto = konto;
    ws.pokoj = doZrzutki ? null : nazwa;
    ws.zrzutka = doZrzutki;
    ws.ip = ip;
    wss.emit('connection', ws);
  });
});

wss.on('connection', (ws) => {
  if (ws.zrzutka) return polaczZrzutke(ws);
  const nazwa = ws.pokoj;
  if (!pokoj(nazwa)) { ws.close(1013, 'za-duzo-pokoi'); return; }
  const opis = opisy.get(nazwa);
  if (opis) opis.byl = true;
  if (!polaczenia.has(nazwa)) polaczenia.set(nazwa, new Set());
  polaczenia.get(nazwa).add(ws);
  polaczeniaNaIp.set(ws.ip, (polaczeniaNaIp.get(ws.ip) || 0) + 1);
  ws.kursor = 0;
  ws.epoka = null;
  ws.zasubskrybowany = false;
  ws.zyje = true;
  ws.okno = { od: Date.now(), ile: 0 };

  ws.on('pong', () => { ws.zyje = true; });
  // Błąd jednego połączenia (np. za duża wiadomość) zamyka tylko to połączenie —
  // bez tej obsługi nieobsłużony 'error' wywróciłby cały proces serwera.
  ws.on('error', (e) => { console.warn('błąd połączenia:', e.code || e.message); });

  ws.on('message', (surowe) => {
    const teraz = Date.now();
    if (teraz - ws.okno.od >= 1000) ws.okno = { od: teraz, ile: 0 };
    if (++ws.okno.ile > LIMIT_WIADOMOSCI) return;       // nadmiar po cichu gubimy

    let m;
    try { m = JSON.parse(surowe); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.typ === 'czas') {
      wyslij(ws, { typ: 'czas', t0: m.t0, teraz });
    } else if (m.typ === 'hej') {
      const p = pokoje.get(nazwa);
      const od = p && m.epoka === p.epoka ? Math.max(0, Math.min(Number(m.od) || 0, p.log.length)) : 0;
      ws.zasubskrybowany = true;
      wyslij(ws, { typ: 'stan', ...p.stan(od, teraz) });
      ws.kursor = p.log.length;
      ws.epoka = p.epoka;
    } else if (m.typ === 'zd') {
      const wynik = obsluzZdarzenie(nazwa, przypnijKonto(m.zdarzenie, ws.konto));
      wyslij(ws, { typ: 'odp', nr: m.nr, dane: wynik.blad ? { blad: wynik.blad } : wynik.odp });
    }
  });

  ws.on('close', () => {
    const zbior = polaczenia.get(nazwa);
    if (zbior) {
      zbior.delete(ws);
      if (!zbior.size) {
        polaczenia.delete(nazwa);
        const o = opisy.get(nazwa);
        if (o) o.pustyOd = Date.now();     // z listy znika od razu, skasowana po PUSTY_POKOJ_MS
      }
    }
    const n = (polaczeniaNaIp.get(ws.ip) || 1) - 1;
    if (n > 0) polaczeniaNaIp.set(ws.ip, n); else polaczeniaNaIp.delete(ws.ip);
  });
});

/* Widz zrzutki tylko słucha: dostaje stan od razu i po każdej wpłacie. */
function polaczZrzutke(ws) {
  widzowieZrzutki.add(ws);
  polaczeniaNaIp.set(ws.ip, (polaczeniaNaIp.get(ws.ip) || 0) + 1);
  ws.zyje = true;
  ws.on('pong', () => { ws.zyje = true; });
  ws.on('error', (e) => { console.warn('błąd połączenia zrzutki:', e.code || e.message); });
  ws.on('close', () => {
    widzowieZrzutki.delete(ws);
    const n = (polaczeniaNaIp.get(ws.ip) || 1) - 1;
    if (n > 0) polaczeniaNaIp.set(ws.ip, n); else polaczeniaNaIp.delete(ws.ip);
  });
  ws.send(JSON.stringify({ typ: 'zrzutka', ...zrzutka.stan() }));
}

/* Świeża obecność i zegar dla wszystkich pokoi z graczami. */
setInterval(() => { for (const nazwa of polaczenia.keys()) rozeslij(nazwa); }, HEARTBEAT_MS).unref();

/* Martwe połączenia (telefon zgubił zasięg bez zamknięcia) i porzucone pokoje. */
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.zyje) { ws.terminate(); continue; }
    ws.zyje = false;
    try { ws.ping(); } catch { /* już zamknięte */ }
  }
  const teraz = Date.now();
  for (const [nazwa, p] of pokoje) {
    if (!polaczenia.has(nazwa) && teraz - p.ostatniaZmiana > POKOJ_PORZUCONY_MS) pokoje.delete(nazwa);
  }
}, PING_MS).unref();

/* Arena z panelu, w której nikogo nie ma, jest kasowana po PUSTY_POKOJ_MS (z listy znika od razu). */
function sprzatajPuste(teraz = Date.now()) {
  for (const [id, o] of opisy) {
    if (polaczenia.has(id)) { o.pustyOd = teraz; continue; }
    if (teraz - o.pustyOd > PUSTY_POKOJ_MS) { opisy.delete(id); pokoje.delete(id); }
  }
}
setInterval(() => sprzatajPuste(), SPRZATANIE_MS).unref();

process.on('uncaughtException', (e) => { console.error('nieobsłużony wyjątek:', e); });

/* systemctl restart/stop: wpłaty czekające na zapis lądują na dysku. */
for (const sygnal of ['SIGTERM', 'SIGINT']) {
  process.on(sygnal, () => { zrzutka.zapiszTeraz(); konta.zapiszTeraz(); process.exit(0); });
}

if (require.main === module) {
  serwer.listen(PORT, '127.0.0.1', () => console.log('Arena nasłuchuje na 127.0.0.1:' + PORT));
}

module.exports = { serwer, pokoje, zrzutka, konta, opisy, dozwolonyOrigin, sprzatajPuste, PUSTY_POKOJ_MS };
