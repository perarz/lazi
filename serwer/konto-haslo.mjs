/* Reset hasła konta Areny (robi właściciel na VPS — bez maila nie ma innej drogi).

   cd /opt/lazi/serwer && node konto-haslo.mjs NICK 'NOWE_HASLO' [/var/lib/arena/konta.json]

   Jako root skrypt sam zatrzymuje usługę na czas zmiany (serwer trzyma konta w pamięci
   i nadpisałby plik przy następnym zapisie), a potem oddaje plik użytkownikowi arena. */

import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { Konta } = require('./konta.js');

const [nick, haslo, plik = '/var/lib/arena/konta.json'] = process.argv.slice(2);
if (!nick || !haslo || haslo.length < 4) {
  console.error("Użycie: node konto-haslo.mjs NICK 'NOWE_HASLO' [plik]  (hasło min. 4 znaki)");
  process.exit(1);
}
const root = process.getuid && process.getuid() === 0;
if (root) execSync('systemctl stop arena');
try {
  const k = new Konta(plik);
  const ok = await k.ustawHaslo(nick, haslo);
  console.log(ok ? 'Hasło zmienione, stare sesje wylogowane: ' + nick : 'Nie ma konta: ' + nick);
  if (root) execSync('chown arena:arena ' + JSON.stringify(plik));
} finally {
  if (root) execSync('systemctl start arena');
}
