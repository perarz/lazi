/* Testy serwera Areny: node serwer/test.mjs (po `npm install` w serwer/).
   Stawiają prawdziwy serwer na losowym porcie i łączą się jak przeglądarki. */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { serwer, dozwolonyOrigin } = require('./serwer.js');
const { Zrzutka } = require('./zrzutka.js');
import fs from 'fs';
import os from 'os';
import path from 'path';
const { WebSocket } = require('ws');

let ok = 0, zle = 0;
async function test(nazwa, fn) {
  try { await fn(); ok++; console.log('  \x1b[32mOK\x1b[0m  ' + nazwa); }
  catch (e) { zle++; console.log('  \x1b[31mBLAD\x1b[0m ' + nazwa + '\n       ' + e.message); }
}
function assert(w, msg) { if (!w) throw new Error(msg || 'oczekiwano prawdy'); }

await new Promise((r) => serwer.listen(0, '127.0.0.1', r));
const port = serwer.address().port;
const WS = (pokoj = 'glowny', origin = 'https://lazi.vercel.app') =>
  new WebSocket(`ws://127.0.0.1:${port}/ws?pokoj=${pokoj}`, { headers: { origin } });

/* Klient testowy: zbiera wiadomości, pozwala czekać na konkretną. */
function klient(pokoj, origin) {
  const ws = WS(pokoj, origin);
  const k = { ws, wiad: [], czekaja: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    k.wiad.push(m);
    for (const c of k.czekaja.splice(0)) if (!c.warunek(m)) k.czekaja.push(c); else c.ok(m);
  });
  k.otwarty = new Promise((ok, zle) => { ws.on('open', ok); ws.on('error', zle); ws.on('unexpected-response', (_, res) => zle(new Error('HTTP ' + res.statusCode))); });
  k.czekaj = (warunek, ms = 2000) => {
    const juz = k.wiad.find(warunek);
    if (juz) { k.wiad.splice(k.wiad.indexOf(juz), 1); return Promise.resolve(juz); }
    return new Promise((ok, zle) => {
      const t = setTimeout(() => zle(new Error('nie doczekałem się wiadomości')), ms);
      k.czekaja.push({ warunek, ok: (m) => { clearTimeout(t); k.wiad.splice(k.wiad.indexOf(m), 1); ok(m); } });
    });
  };
  k.wyslij = (o) => ws.send(JSON.stringify(o));
  let nr = 100;
  k.zd = async (zdarzenie) => {
    const n = ++nr;
    k.wyslij({ typ: 'zd', nr: n, zdarzenie });
    return (await k.czekaj((m) => m.typ === 'odp' && m.nr === n)).dane;
  };
  return k;
}

console.log('\nSERWER ARENY');

await test('hej zwraca stan pokoju w kształcie dawnego GET /api/arena', async () => {
  const a = klient('t1');
  await a.otwarty;
  a.wyslij({ typ: 'hej', od: 0, epoka: null });
  const s = await a.czekaj((m) => m.typ === 'stan');
  for (const pole of ['od', 'zdarzenia', 'epoka', 'obecnosc', 'ruch', 'teraz']) assert(pole in s, 'brak pola ' + pole);
  assert(s.od === 0 && Array.isArray(s.zdarzenia), 'zły stan');
  a.ws.close();
});

await test('zdarzenie od jednego gracza dochodzi od razu do drugiego, ze stemplem serwera', async () => {
  const a = klient('t2'), b = klient('t2');
  await Promise.all([a.otwarty, b.otwarty]);
  a.wyslij({ typ: 'hej', od: 0, epoka: null });
  b.wyslij({ typ: 'hej', od: 0, epoka: null });
  await a.czekaj((m) => m.typ === 'stan');
  await b.czekaj((m) => m.typ === 'stan');
  const t0 = Date.now();
  const odp = await a.zd({ t: 'dolacz', id: 'ala', name: 'Ala' });
  assert(odp.ok && odp.dlugosc === 1, 'odpowiedź: ' + JSON.stringify(odp));
  const s = await b.czekaj((m) => m.typ === 'stan' && m.zdarzenia.length);
  assert(s.zdarzenia[0].t === 'dolacz' && s.zdarzenia[0].id === 'ala', 'zdarzenie nie doszło');
  assert(typeof s.zdarzenia[0].st === 'number' && s.zdarzenia[0].st >= t0, 'brak stempla serwera');
  assert(Date.now() - t0 < 200, 'za wolno: ' + (Date.now() - t0) + ' ms');
  a.ws.close(); b.ws.close();
});

await test('nowa partia: nowa epoka, log od zera, drugi start w 8 s odrzucony', async () => {
  const a = klient('t3'), b = klient('t3');
  await Promise.all([a.otwarty, b.otwarty]);
  b.wyslij({ typ: 'hej', od: 0, epoka: null });
  await b.czekaj((m) => m.typ === 'stan');
  await a.zd({ t: 'dolacz', id: 'ala' });
  const n1 = await a.zd({ t: 'nowa', seed: 1, gracze: [] });
  assert(n1.ok && n1.epoka === 1, 'pierwszy start: ' + JSON.stringify(n1));
  const n2 = await b.zd({ t: 'nowa', seed: 2, gracze: [] });
  assert(n2.ok === false && n2.powod === 'juz-startuje', 'drugi start: ' + JSON.stringify(n2));
  const s = await b.czekaj((m) => m.typ === 'stan' && m.epoka === 1);
  assert(s.od === 0 && s.zdarzenia.length === 1 && s.zdarzenia[0].t === 'nowa', 'log po starcie: ' + JSON.stringify(s.zdarzenia.map((z) => z.t)));
  a.ws.close(); b.ws.close();
});

await test('hej ze starą epoką dostaje log od zera', async () => {
  const a = klient('t3');
  await a.otwarty;
  a.wyslij({ typ: 'hej', od: 5, epoka: 0 });
  const s = await a.czekaj((m) => m.typ === 'stan');
  assert(s.od === 0 && s.epoka === 1, 'od=' + s.od + ' epoka=' + s.epoka);
  a.ws.close();
});

await test('puls widać w obecności, wyjście przez POST (sendBeacon) ją zdejmuje', async () => {
  const a = klient('t4'), b = klient('t4');
  await Promise.all([a.otwarty, b.otwarty]);
  b.wyslij({ typ: 'hej', od: 0, epoka: null });
  await b.czekaj((m) => m.typ === 'stan');
  await a.zd({ t: 'puls', id: 'ala' });
  const s1 = await b.czekaj((m) => m.typ === 'stan' && m.obecnosc.ala);
  assert(s1.obecnosc.ala > 0, 'brak obecności');
  const odp = await fetch(`http://127.0.0.1:${port}/api/arena?pokoj=t4`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain', origin: 'https://lazi.vercel.app' },
    body: JSON.stringify({ zdarzenie: { t: 'wyjdz', id: 'ala' } })
  });
  assert(odp.ok, 'POST ' + odp.status);
  const s2 = await b.czekaj((m) => m.typ === 'stan' && !m.obecnosc.ala && m.zdarzenia.some((z) => z.t === 'wyjdz'));
  assert(!s2.obecnosc.ala, 'obecność nie zdjęta');
  a.ws.close(); b.ws.close();
});

await test('podgląd ruchu nie trafia do logu, ale dochodzi do innych', async () => {
  const a = klient('t5'), b = klient('t5');
  await Promise.all([a.otwarty, b.otwarty]);
  b.wyslij({ typ: 'hej', od: 0, epoka: null });
  await b.czekaj((m) => m.typ === 'stan');
  await a.zd({ t: 'ruch', nr: 3, id: 'ala', x: 10, y: 20 });
  const s = await b.czekaj((m) => m.typ === 'stan' && m.ruch);
  assert(s.ruch.x === 10 && s.zdarzenia.length === 0, 'ruch w logu albo brak ruchu');
  a.ws.close(); b.ws.close();
});

await test('pokoje są od siebie oddzielone', async () => {
  const a = klient('pokoj-a'), b = klient('pokoj-b');
  await Promise.all([a.otwarty, b.otwarty]);
  b.wyslij({ typ: 'hej', od: 0, epoka: null });
  await b.czekaj((m) => m.typ === 'stan');
  await a.zd({ t: 'dolacz', id: 'ala' });
  let przeciek = false;
  try { await b.czekaj((m) => m.typ === 'stan' && m.zdarzenia.length, 300); przeciek = true; } catch { /* dobrze */ }
  assert(!przeciek, 'zdarzenie przeciekło do innego pokoju');
  a.ws.close(); b.ws.close();
});

await test('obca strona i zła nazwa pokoju są odrzucane', async () => {
  let odrzucony = false;
  try { await klient('t6', 'https://zlosliwa.example').otwarty; } catch { odrzucony = true; }
  assert(odrzucony, 'obcy origin wpuszczony');
  odrzucony = false;
  try { await klient('ZŁA NAZWA!').otwarty; } catch { odrzucony = true; }
  assert(odrzucony, 'zła nazwa pokoju wpuszczona');
  assert(dozwolonyOrigin('http://localhost:8765') && dozwolonyOrigin('https://moja-strona.vercel.app'), 'dozwolone odrzucone');
});

await test('czas serwera: odpowiedź z t0 i teraz', async () => {
  const a = klient('t7');
  await a.otwarty;
  a.wyslij({ typ: 'czas', t0: 123 });
  const m = await a.czekaj((x) => x.typ === 'czas');
  assert(m.t0 === 123 && Math.abs(m.teraz - Date.now()) < 1000, JSON.stringify(m));
  a.ws.close();
});

await test('za duże zdarzenie zamyka tylko to połączenie, serwer żyje dalej', async () => {
  const a = klient('t8');
  await a.otwarty;
  const zamkniecie = new Promise((ok) => a.ws.on('close', (kod) => ok(kod)));
  a.ws.on('error', () => {});
  a.wyslij({ typ: 'zd', nr: 1, zdarzenie: { t: 'strzal', dane: 'x'.repeat(30 * 1024) } });
  const kod = await zamkniecie;
  assert(kod === 1009, 'oczekiwano zamknięcia 1009, jest ' + kod);
  // serwer dalej działa dla innych
  const b = klient('t8');
  await b.otwarty;
  assert((await b.zd({ t: 'dolacz', id: 'bolek' })).ok, 'serwer nie przeżył');
  b.ws.close();
  const z = await (await fetch(`http://127.0.0.1:${port}/zdrowie`)).json();
  assert(z.ok === true, 'zdrowie');
});

console.log('\nZRZUTKA');

const ZR = () => `http://127.0.0.1:${port}/api/zrzutka`;
const wplac = (body, { origin = 'https://kacperlazarz.pl', ip = '10.0.0.1' } = {}) => fetch(ZR(), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', origin, 'x-forwarded-for': ip },
  body: JSON.stringify(body)
});

await test('GET zwraca sumy wszystkich graczy (zero) i bieżący sezon', async () => {
  const d = await (await fetch(ZR())).json();
  assert(d.sezon === 2 && d.sumy.fortnite.krayo === 0 && d.sumy.zeroad.nolli === 0 && Array.isArray(d.wplaty), JSON.stringify(d).slice(0, 200));
});

await test('wpłata podbija sumę i od razu dochodzi do widzów przez /zrzutka/ws', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/zrzutka/ws`, { headers: { origin: 'https://lazi.vercel.app' } });
  const wiad = [];
  let czekam = null;
  ws.on('message', (m) => { const d = JSON.parse(m); wiad.push(d); if (czekam && czekam.w(d)) czekam.ok(d); });
  await new Promise((ok, zle) => { ws.on('open', ok); ws.on('error', zle); });
  const naPowitanie = new Promise((ok) => { if (wiad.length) ok(); else czekam = { w: () => true, ok }; });
  await naPowitanie;
  assert(wiad[0].typ === 'zrzutka' && wiad[0].sumy, 'brak stanu na powitanie');
  const naWplate = new Promise((ok, zle) => {
    czekam = { w: (d) => d.sumy.fortnite.krayo === 150, ok };
    setTimeout(() => zle(new Error('wpłata nie doszła do widza')), 1500);
  });
  const odp = await wplac({ kat: 'fortnite', komu: 'krayo', ile: 150, kto: 'Ala', msg: 'na skilla', id: 'w1' }, { origin: 'https://lazi.vercel.app' });
  assert(odp.status === 200, 'status ' + odp.status);
  const d = await odp.json();
  assert(d.sumy.fortnite.krayo === 150 && d.wplaty[0].id === 'w1' && d.wplaty[0].msg === 'na skilla', JSON.stringify(d.wplaty[0]));
  await naWplate;
  ws.close();
});

await test('zły gracz, zła kwota, obca strona, zły JSON są odrzucane', async () => {
  const o = { origin: 'https://lazi.vercel.app', ip: '10.0.0.2' };
  assert((await wplac({ kat: 'fortnite', komu: 'kozak', ile: 5 }, o)).status === 400, 'gracz z innej kategorii');
  assert((await wplac({ kat: 'fortnite', komu: 'krayo', ile: 2001 }, o)).status === 400, 'kwota > 2000');
  assert((await wplac({ kat: 'fortnite', komu: 'krayo', ile: 0 }, o)).status === 400, 'kwota 0');
  assert((await wplac({ kat: 'fortnite', komu: 'krayo', ile: 5 }, { origin: 'https://zlosliwa.example' })).status === 403, 'obca strona');
  const zly = await fetch(ZR(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nie json' });
  assert(zly.status === 400, 'zły JSON ' + zly.status);
});

await test('limit 30 wpłat na minutę z jednego IP', async () => {
  const o = { origin: 'https://lazi.vercel.app', ip: '10.9.9.9' };
  for (let i = 0; i < 30; i++) assert((await wplac({ kat: 'zeroad', komu: 'nolli', ile: 1 }, o)).status === 200, 'wpłata ' + i);
  assert((await wplac({ kat: 'zeroad', komu: 'nolli', ile: 1 }, o)).status === 429, '31. wpłata przeszła');
  assert((await wplac({ kat: 'zeroad', komu: 'nolli', ile: 1 }, { ...o, ip: '10.9.9.8' })).status === 200, 'inne IP zablokowane');
});

await test('archiwum sezonu 1 z cache, nieistniejący sezon 404, preflight CORS', async () => {
  const s1 = await fetch(ZR() + '?sezon=1');
  assert(s1.status === 200 && /max-age=86400/.test(s1.headers.get('cache-control')), 'sezon 1: ' + s1.status);
  assert((await fetch(ZR() + '?sezon=3')).status === 404, 'sezon 3');
  const pre = await fetch(ZR(), { method: 'OPTIONS', headers: { origin: 'https://lazi.vercel.app' } });
  assert(pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://lazi.vercel.app', 'preflight');
});

await test('plik: zapis przeżywa restart, uszkodzony plik nie jest nadpisywany', async () => {
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'zrzutka-'));
  const plik = path.join(kat, 'zrzutka.json');
  const a = new Zrzutka(plik);
  a.wplac({ kat: 'zeroad', komu: 'quber', ile: 700, id: 'x1' }, '1.1.1.1');
  a.zapiszTeraz();
  const b = new Zrzutka(plik);
  assert(b.stan().sumy.zeroad.quber === 700 && b.stan().wplaty[0].id === 'x1', 'po restarcie');
  assert(fs.readdirSync(kat).some((f) => /^zrzutka-\d{4}-\d{2}-\d{2}\.json$/.test(f)), 'brak kopii dziennej');
  fs.writeFileSync(plik, '{zepsuty');
  const c = new Zrzutka(plik);
  assert(c.stan().sumy.zeroad.quber === 0 && fs.readdirSync(kat).some((f) => f.includes('.zepsuty-')), 'zepsuty plik');
  fs.rmSync(kat, { recursive: true });
});

await test('migracja z Redisa: kopia 1:1, potem dogonienie bez dubli', async () => {
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'zrzutka-'));
  const z = new Zrzutka(path.join(kat, 'zrzutka.json'));
  const w1 = { kat: 'fortnite', komu: 'karp', ile: 100, kto: 'A', t: 1000, id: 'r1' };
  const w2 = { kat: 'fortnite', komu: 'karp', ile: 50, kto: 'B', t: 2000, id: 'r2' };
  z.przyjmijZRedisa({ 1: { sumy: { 'fortnite:krayo': 5400 }, wplaty: [] }, 2: { sumy: { 'fortnite:karp': 100 }, wplaty: [w1] } });
  assert(z.stan(1).sumy.fortnite.krayo === 5400 && z.stan(2).sumy.fortnite.karp === 100, 'kopia');
  z.wplac({ kat: 'fortnite', komu: 'karp', ile: 7, id: 'v1' }, '1.1.1.1');       // już na VPS
  const r = z.przyjmijZRedisa({ 2: { sumy: { 'fortnite:karp': 150 }, wplaty: [w2, w1] } });  // w2 przyszła jeszcze przez Vercel
  assert(z.stan(2).sumy.fortnite.karp === 157, 'suma po dogonieniu: ' + z.stan(2).sumy.fortnite.karp + ' ' + JSON.stringify(r));
  const drugi = z.przyjmijZRedisa({ 2: { sumy: {}, wplaty: [w2, w1] } });
  assert(z.stan(2).sumy.fortnite.karp === 157 && /\+0/.test(drugi[2]), 'powtórka zdublowała');
  fs.rmSync(kat, { recursive: true });
});

serwer.close();
console.log('\n' + (zle ? '\x1b[31m' + zle + ' bledow, ' + ok + ' ok\x1b[0m' : '\x1b[32mWszystkie testy przeszly (' + ok + ')\x1b[0m') + '\n');
process.exit(zle ? 1 : 0);
