# CLAUDE.md — kontekst projektu

Żartobliwa strona dla ekipy znajomych. Statyczny hosting na **Vercelu**, kilka funkcji
serwerowych w `api/`, dane współdzielone w **Upstash Redis** (REST). Bez bundlera,
bez `package.json`, bez zależności npm.

## Komunikacja

- Użytkownik pisze po polsku (często bez polskich znaków), zwykle z telefonu. Odpowiadaj po polsku.
- Teksty na stronie, komentarze w kodzie, nazwy zmiennych i commity są po polsku.
- Rozwijaj na gałęzi `claude/epic-rubin-ejixox`, a na `master` wchodź PR-em tylko wtedy,
  gdy użytkownik o to poprosi (np. „daj na main”). Push na `master` = wdrożenie na produkcję.

## Struktura

| Ścieżka | Co to jest |
|---|---|
| `index.html` + `zrzutka/` | Strona główna: „zrzutka” V-dolców (Fortnite) i srebrników (0 A.D.) dla graczy z ekipy |
| `zrzutka/dane.js` | Gracze, cele, reakcje, zaczepki, odznaki (opisy graczy i awatary SVG są w `index.html`) |
| `zrzutka/app.js` | Logika strony (przełączanie kategorii przez `#fortnite` / `#0ad`, wpłaty, odznaki) |
| `zrzutka/baza.css`, `fortnite.css`, `zeroad.css` | Wspólny szkielet i dwa motywy |
| `gra/` | **Arena GOATów** — turowa strzelanka w stylu Worms, multiplayer online |
| `goat/` | Stara, ukryta strona „ŁAZI TO GOAT” |
| `zmiany/` | Log zmian (czyta `wersja.js`) |
| `wersja.js` | **Numer wersji i historia zmian** — jedno źródło; znaczek `vX.Y` w rogu stron |
| `api/zrzutka.js` | Wspólne sumy zrzutki (lista dozwolonych graczy `GRACZE` — dopisz nowego gracza!) |
| `api/arena.js` | Serwer gry: log zdarzeń + obecność graczy w Redisie |

## Przy każdej zmianie widocznej dla użytkownika

1. Dopisz nowy wpis **na początku** `historia` w `wersja.js` (podbij wersję: poprawki → `x.y+1`, duże rzeczy → `x+1.0`).
2. Nowy gracz zrzutki = karta w `index.html` + wpis w `zrzutka/dane.js` + `api/zrzutka.js` (`GRACZE`).

## Arena (`gra/`) — ważne zasady

- **Determinizm**: symulacja (`sim.js`, `terrain.js`) używa tylko `+ - * /`, `Math.sqrt`, `Math.floor`,
  `Math.imul` i seedowanego `mulberry32`. **Żadnego `Math.sin/cos/atan2/random`** w ścieżce wspólnej —
  różne przeglądarki dają różne bity i gra się rozjeżdża. Trygonometria tylko u strzelającego
  (wektor startowy leci w zdarzeniu) i w `render.js` (grafika).
- Mapa nie leci przez sieć: seed + lista kraterów. `terrain.js` generuje ją deterministycznie
  (4 style: góry, archipelag, kaniony, jaskinie).
- Protokół (`protokol.js`, bez DOM): pierwszy `strzal`/`pas` tury jest kanoniczny, a turę zamyka `stan`
  policzony z tej akcji. Gospodarz (najmniejsze id) przekazuje tury nieobecnych.
- Sieć (`net.js`): polling `/api/arena`. **Serwer jest słaby** — nowe funkcje mają być po stronie
  klienta (localStorage), bez dodatkowych zapytań.
- `window.__arena()` w konsoli = diagnostyka (hash stanu, kamera, statystyki).

## Testy

```
node gra/test/sim.test.mjs        # symulacja, bronie, determinizm
node gra/test/protokol.test.mjs   # protokół z atrapą serwera, lagiem, rozłączeniami
```

Obie muszą przejść przed pushem. E2E robiłem Playwrightem (Chromium jest w `/opt/pw-browsers`)
z atrapą Upstasha, która uruchamia prawdziwe `api/arena.js`. Skrypty są poza repo, w scratchpadzie.

## Bezpieczeństwo

- Klucze Redisa są **tylko** w zmiennych środowiskowych Vercela (`UPSTASH_REDIS_REST_URL/TOKEN`,
  `KV_REST_API_*` albo dowolny prefiks `*_REST_API_URL/TOKEN`). Nigdy w kodzie ani w odpowiedziach API.
- API zwraca do przeglądarki tylko kody błędów (`{ blad: '...' }`), szczegóły idą do `console.error`, czyli do logów Vercela.
- `.gitignore` blokuje `.env*` i `.vercel`.
- Strony mają ścisłe CSP (`script-src 'self'`, style tylko z plików i Google Fonts), więc nie ma
  inline `<script>`/`<style>` ani atrybutów `style=` w HTML. Style ustawiane z JS przez `el.style` są dozwolone.
- Tekst od użytkowników wstawiaj przez `textContent`, nigdy przez `innerHTML`.
