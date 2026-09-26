/* Przeniesienie zrzutki z Upstash Redis do pliku na VPS. Jednorazowo (albo dwa razy).

   Na VPS jako root, z adresem i tokenem Upstasha (panel Vercela → Settings →
   Environment Variables, albo panel Upstash → REST API). Tokenu nie zapisuj w repo
   ani w plikach — podaj go tylko w tej jednej komendzie:

     cd /opt/lazi/serwer
     UPSTASH_URL='https://….upstash.io' UPSTASH_TOKEN='…' \
       node migruj-zrzutke.mjs /var/lib/arena/zrzutka.json

   Pusty plik → kopia 1:1 wszystkich sezonów. Istniejący plik → „dogonienie”: dopisuje
   tylko wpłaty z Redisa, których na VPS jeszcze nie ma (po id). Dzięki temu można
   puścić skrypt drugi raz zaraz po wdrożeniu strony i nic nie zginie ani się nie zdubluje.
   Serwer (systemctl) trzeba na ten czas zatrzymać — skrypt pilnuje tego sam. */

import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { Zrzutka } = require('./zrzutka.js');
const { KLUCZE, MAX_WPLAT } = require('../api/zrzutka.js');

const plik = process.argv[2];
const url = (process.env.UPSTASH_URL || '').replace(/\/+$/, '');
const token = process.env.UPSTASH_TOKEN || '';
if (!plik || !url || !token) {
  console.error('Użycie: UPSTASH_URL=… UPSTASH_TOKEN=… node migruj-zrzutke.mjs /var/lib/arena/zrzutka.json');
  process.exit(1);
}

async function pipeline(komendy) {
  const odp = await fetch(url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(komendy)
  });
  if (!odp.ok) throw new Error('Upstash odpowiedział ' + odp.status);
  return (await odp.json()).map((r) => r.result);
}

const zRedisa = {};
for (const [n, k] of Object.entries(KLUCZE)) {
  const [plaska, surowe] = await pipeline([['HGETALL', k.sumy], ['LRANGE', k.wplaty, '0', String(MAX_WPLAT - 1)]]);
  const sumy = {};
  for (let i = 0; i + 1 < (plaska || []).length; i += 2) sumy[plaska[i]] = Math.max(0, Number(plaska[i + 1]) || 0);
  const wplaty = [];
  for (const s of surowe || []) { try { wplaty.push(JSON.parse(s)); } catch { /* uszkodzony wpis */ } }
  zRedisa[n] = { sumy, wplaty };
  const razem = Object.values(sumy).reduce((a, b) => a + b, 0);
  console.log('Sezon ' + n + ': ' + Object.keys(sumy).length + ' graczy, razem ' + razem + ', ' + wplaty.length + ' wpłat na liście');
}

let dzialal = false;
try { dzialal = execSync('systemctl is-active arena', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === 'active'; } catch { /* nie działa albo brak systemd */ }
if (dzialal) execSync('systemctl stop arena');
try {
  const z = new Zrzutka(plik);
  const raport = z.przyjmijZRedisa(zRedisa);
  for (const [n, r] of Object.entries(raport)) console.log('Sezon ' + n + ': ' + r);
  try { execSync('chown arena:arena ' + JSON.stringify(plik)); } catch { /* lokalnie bez użytkownika arena */ }
} finally {
  if (dzialal) execSync('systemctl start arena');
}
console.log('Gotowe: ' + plik);
