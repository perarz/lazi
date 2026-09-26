/* Serwer Areny GOATów na VPS — zastępuje api/arena.js + Redis.

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

   Konfiguracja przez zmienne środowiskowe (patrz serwer/INSTALACJA.md):
     ARENA_PORT      (8787)  — port lokalny; z zewnątrz ruch idzie przez Caddy (HTTPS)
     ARENA_ORIGINS           — dodatkowe dozwolone strony, po przecinku
                               (zawsze wolno *.vercel.app i localhost) */

'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const { Pokoj, MAX_ZDARZENIE } = require('./pokoj');

const PORT = Number(process.env.ARENA_PORT) || 8787;
const DODATKOWE_ORIGINS = String(process.env.ARENA_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const MAX_POKOI = 200;
const MAX_POLACZEN_NA_IP = 30;
const LIMIT_WIADOMOSCI = 60;         // na sekundę na połączenie (ruch co 0,1 s + zdarzenia z zapasem)
const HEARTBEAT_MS = 4000;           // świeża obecność dla klientów (protokol.js ufa jej ~6 s)
const PING_MS = 25000;               // wykrywanie martwych połączeń
const POKOJ_PORZUCONY_MS = 6 * 3600 * 1000;

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

  if (req.method === 'OPTIONS' && u.pathname === '/api/arena') {
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    return res.end();
  }

  // sendBeacon przy zamknięciu karty (text/plain, bez preflightu)
  if (req.method === 'POST' && u.pathname === '/api/arena') {
    if (origin && !dozwolonyOrigin(origin)) { res.statusCode = 403; return res.end(); }
    const nazwa = nazwaPokoju(u.searchParams.get('pokoj'));
    if (!nazwa) { res.statusCode = 400; return res.end(); }
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > MAX_ZDARZENIE + 1024) req.destroy();
    });
    req.on('end', () => {
      let dane;
      try { dane = JSON.parse(body || '{}'); } catch { res.statusCode = 400; return res.end(); }
      const wynik = obsluzZdarzenie(nazwa, dane && dane.zdarzenie);
      res.setHeader('Content-Type', 'application/json');
      if (wynik.blad) res.statusCode = 400;
      res.end(JSON.stringify(wynik.blad ? { blad: wynik.blad } : wynik.odp));
    });
    return;
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
  if (u.pathname !== '/ws' || !nazwa) return odmow('404 Not Found');
  if (!dozwolonyOrigin(req.headers.origin)) {
    console.warn('odrzucony origin:', req.headers.origin);
    return odmow('403 Forbidden');
  }
  if ((polaczeniaNaIp.get(ip) || 0) >= MAX_POLACZEN_NA_IP) return odmow('429 Too Many Requests');
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.pokoj = nazwa;
    ws.ip = ip;
    wss.emit('connection', ws);
  });
});

wss.on('connection', (ws) => {
  const nazwa = ws.pokoj;
  if (!pokoj(nazwa)) { ws.close(1013, 'za-duzo-pokoi'); return; }
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
      const wynik = obsluzZdarzenie(nazwa, m.zdarzenie);
      wyslij(ws, { typ: 'odp', nr: m.nr, dane: wynik.blad ? { blad: wynik.blad } : wynik.odp });
    }
  });

  ws.on('close', () => {
    const zbior = polaczenia.get(nazwa);
    if (zbior) {
      zbior.delete(ws);
      if (!zbior.size) polaczenia.delete(nazwa);
    }
    const n = (polaczeniaNaIp.get(ws.ip) || 1) - 1;
    if (n > 0) polaczeniaNaIp.set(ws.ip, n); else polaczeniaNaIp.delete(ws.ip);
  });
});

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

process.on('uncaughtException', (e) => { console.error('nieobsłużony wyjątek:', e); });

if (require.main === module) {
  serwer.listen(PORT, '127.0.0.1', () => console.log('Arena nasłuchuje na 127.0.0.1:' + PORT));
}

module.exports = { serwer, pokoje, dozwolonyOrigin };
