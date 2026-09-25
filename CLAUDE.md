# CLAUDE.md — kontekst projektu (przeczytaj całość przed pierwszą zmianą)

Żartobliwa strona dla ekipy znajomych: „zrzutka” wirtualnych V-dolców i srebrników dla graczy
Fortnite i 0 A.D. oraz **Arena GOATów** — turowa strzelanka w stylu Worms, grana online.
Wszystko to robiliśmy iteracyjnie z właścicielem repo. Ten plik opisuje, **jak ma to działać
i czego pilnować**, żeby kolejne zmiany szły w tę samą stronę.

Technicznie: statyczny hosting na **Vercelu** (produkcja = gałąź `master`), dwie funkcje
serwerowe w `api/`, wspólne dane w **Upstash Redis** (REST). Bez bundlera, bez `package.json`,
bez zależności npm — zwykłe pliki HTML/CSS/JS, gra jako moduły ES.

---

## 1. Najważniejsze zasady (w skrócie)

1. **Oszczędzaj Redisa.** Działamy na darmowym planie Upstasha z limitem komend — patrz sekcja 3.
   Każda nowa funkcja najpierw po stronie przeglądarki (`localStorage`), serwer tylko gdy musi.
2. **Determinizm Areny** — żadnego `Math.random/sin/cos/atan2` w symulacji (sekcja 5).
3. **Testy przed pushem**: `node gra/test/sim.test.mjs` i `node gra/test/protokol.test.mjs`.
4. **Wpis w logu zmian** (`wersja.js`) przy każdej zmianie widocznej dla użytkownika.
5. **Na `master` tylko na prośbę** („daj na main”, „wrzuć na maina”) — to jest wdrożenie na produkcję.
6. **Po polsku**: odpowiedzi, teksty na stronie, komentarze, nazwy zmiennych i commity.
7. **Sprawdzaj wizualnie** (zrzuty Playwrightem, desktop i telefon) — użytkownik gra głównie z telefonu.

---

## 2. Komunikacja i sposób pracy

- Użytkownik pisze po polsku, często bez polskich znaków, zwykle z telefonu. Odpowiadaj po polsku,
  konkretnie, bez technicznego żargonu — co się zmieniło z punktu widzenia gracza.
- Gdy prośba jest niejasna (np. literówka w imieniu), zrób rozsądną interpretację i powiedz, jak
  zrozumiałeś; pytaj tylko o rzeczy, których nie da się sensownie założyć (wygląd prawdziwej osoby itp.).
- Rozwijaj na gałęzi `claude/epic-rubin-ejixox` (jeśli poprzedni PR z niej jest już scalony — zacznij
  ją od nowa od `origin/master`). Push na gałąź po każdej skończonej rzeczy.
- Na prośbę o wdrożenie: PR `claude/epic-rubin-ejixox` → `master`, merge (metoda „merge”).
  Vercel wdraża `master` sam w ~1–2 min. Przypominaj, że kto ma otwartą Arenę, musi odświeżyć stronę.
- Humor strony: jajcarski, ale życzliwy — śmiejemy się z grania, nie z ludzi. Pochodzenie graczy
  podajemy tylko tak, jak podał je właściciel (etykieta w profilu), bez stereotypów w rysunkach.

---

## 3. Redis / Upstash — budżet zapytań (BARDZO WAŻNE)

Baza to **Upstash Redis na darmowym planie** — ma limit komend (miesięczny, sprawdzisz go w panelu
Upstash) i ograniczoną przepustowość. Każde zapytanie HTTP do `api/` to kilka komend Redisa.
Przekroczenie limitu = strona i gra przestają działać dla wszystkich. Dlatego:

**Zasady**
- **Nie dodawaj nowych cyklicznych zapytań** (setInterval z fetch) bez wyraźnej potrzeby i zgody.
  Jeśli coś musi być wspólne — doklejaj dane do zapytań, które i tak idą (np. pole w `ruch`,
  w `dolacz`, w zdarzeniu strzału), zamiast robić nowy endpoint albo nowy polling.
- **Dane osobiste trzymaj w `localStorage`** (statystyki, osiągnięcia, ustawienia, wybrana broń).
- Wiele komend naraz → jeden `pipeline` (jedno zapytanie HTTP do Upstasha).
- Karta w tle nie odpytuje (`document.hidden`) — utrzymuj to przy każdej zmianie w `net.js`.
- Klucze z TTL, żeby porzucone dane same znikały. Listy przycinane (`LTRIM`, limit logu).
- Zanim dodasz funkcję „online”, policz, ile komend dziennie zje przy 5–6 graczach.

**Ile to kosztuje dziś (orientacyjnie)**
- Arena (`net.js`): odczyt = 1 zapytanie = 2 komendy (`LRANGE` + `HGETALL`). Interwały:
  lobby 3 s, cudza tura 1 s, moja tura 2,5 s, czekanie na stan 0,45 s, bezczynność 15 s;
  puls obecności co 8 s; podgląd ruchu (`ruch`) co ≥ 0,45 s tylko gdy aktywny gracz się rusza.
  Każdy zapis (`POST`) = limit (`INCR`, czasem `EXPIRE`) + właściwe komendy.
  **Godzina gry we 3 ≈ kilkadziesiąt tysięcy komend.**
- Zrzutka (`zrzutka/app.js`): odczyt sum co 10 s na każdą otwartą, widoczną kartę (~720 zapytań/h/kartę).
  Wpłata = jedno zapytanie.

**Limity po stronie API** (chronią budżet przed spamem)
- `api/arena.js`: 200 zapisów / 10 s na IP (gracze za jednym Wi-Fi mają wspólne IP!), log max 4000
  zdarzeń (potem reset i nowa „epoka”), ciało ≤ 24 KB, TTL 6 h.
- `api/zrzutka.js`: 30 wpłat / 60 s na IP, lista ostatnich 60 wpłat.
- **Sezony zrzutki**: `SEZON` i `KLUCZE` w `api/zrzutka.js`. Bieżący sezon pisze do własnych kluczy
  (sezon 2: `zrzutka:s2:sumy`, `zrzutka:s2:wplaty`), stare zostają jako archiwum. `GET ?sezon=N` oddaje
  archiwum z `Cache-Control: s-maxage=604800` (cache Vercela), a klient trzyma je w `localStorage` na
  zawsze — Hall of Fame praktycznie nie kosztuje komend. Nowy sezon = nowy wpis w `KLUCZE`, podbicie
  `SEZON` w API i w `app.js` (+ ewentualnie nowe okno z wynikami).

---

## 4. Struktura repo

| Ścieżka | Co to jest |
|---|---|
| `index.html` | Strona główna: zrzutka. **Karty graczy z awatarami SVG i opisami są tu**, plus sprite z symbolami (`#vbuck`, `#srebrnik`, `#scutum`, `#obywatelka`) i wspólnymi gradientami |
| `zrzutka/dane.js` | Gracze (cele, reakcje, zaczepki), odznaki, rangi — dane dla `app.js` |
| `zrzutka/minigry.js`, `minigry.css` | Minigierki przed wpłatą (sekcja 6) |
| `zrzutka/sezon.css` | Plakietki sezonu i okno Hall of Fame |
| `zrzutka/app.js` | Logika strony: kategorie `#fortnite` / `#0ad`, wpłaty, liczniki, odznaki, profil, sekcja osiągnięć z Areny |
| `zrzutka/baza.css`, `fortnite.css`, `zeroad.css`, `motyw.js` | Szkielet, dwa motywy, ustawienie motywu przed malowaniem |
| `gra/` | **Arena GOATów** (sekcja 5) |
| `gra/osiagniecia.js` | Lista osiągnięć Areny — klasyczny skrypt, czyta go gra i strona główna |
| `wersja.js` | Numer wersji + historia zmian (jedno źródło); znaczek `vX.Y` w rogu stron |
| `zmiany/` | Strona „Co nowego” (rysuje historię z `wersja.js`) |
| `goat/` | Stara, ukryta strona „ŁAZI TO GOAT” — nie ruszać |
| `api/zrzutka.js` | Wspólne sumy zrzutki — lista dozwolonych graczy `GRACZE` |
| `api/arena.js` | Serwer gry: log zdarzeń, obecność, zamek startu partii |
| `vercel.json` | Nagłówki bezpieczeństwa |

**Klucze `localStorage`**: `zrzutka-v2` (wpłaty, odznaki; pole `sezon` — zapis z innego sezonu zostawia
tylko odznaki i zaczepki), `zrzutka:minigra-blokada`, `zrzutka:sezon1` (archiwum sezonu 1, pobrane raz),
`zrzutka:sezon2-intro`, `arena:id`, `arena:nazwa`, `arena:bron`, `arena:staty`, `arena:osiagniecia`.

---

## 5. Arena GOATów (`gra/`)

### Pliki
| Plik | Rola |
|---|---|
| `src/sim.js` | Symulacja (bez DOM): robale, fizyka, bronie, tury, snapshoty, hash stanu |
| `src/terrain.js` | Generator mapy (seed → maska pikseli), kratery, punkty startu |
| `src/weapons.js` | Tabela broni (liczby, bez logiki) i kolejność na pasku |
| `src/protokol.js` | Protokół sieciowy (bez DOM) — kto ma turę, co jest kanoniczne, kto wyrzuca nieobecnych |
| `src/net.js` | Polling `/api/arena`, obecność, zegar serwera, `sendBeacon` przy zamknięciu karty |
| `src/main.js` | Lobby, HUD, kamera, pętla gry, statystyki, osiągnięcia (UI) |
| `src/input.js` | Klawiatura, przyciski dotykowe, przeciąganie/szczypanie |
| `src/render.js`, `src/fx.js` | Grafika (tu wolno trygonometrię i `Math.random`) |
| `src/osiagniecia-reguly.js` | Reguły osiągnięć — czyste funkcje |
| `test/sim.test.mjs`, `test/protokol.test.mjs` | Testy w Node |

### Determinizm (święta zasada)
- Symulacja (`sim.js`, `terrain.js`) używa tylko `+ - * /`, `Math.sqrt`, `Math.floor/round/abs/min/max`,
  `Math.imul` i seedowanego `mulberry32` / szumu z `rng.js`. **Zero `Math.sin/cos/atan2/random`** —
  różne przeglądarki dają inne bity i gra się rozjeżdża (desync).
- Trygonometria tylko u strzelającego: `obliczStart()` liczy wektor(y) startowe, które lecą w zdarzeniu
  (`start`, np. wachlarz salwy `start.salwa`). Odbiorca nic nie przelicza.
- `-0` normalizujemy (`x + 0`) — JSON zamienia `-0` na `0`.
- Mapa nie leci przez sieć: seed + lista kraterów. Generator 2D (nawisy, czasem wielka jaskinia, komory, pływające skały),
  4 style z seeda: góry, archipelag, kaniony, jaskinie. Kopia bazowej maski jest cache'owana.
- `spawnPoints` nigdy nie stawia robala w powietrzu: gdy w wycinku gracza nie ma gruntu (przerwa
  między wyspami), szuka gruntu na całej mapie (`zapasowyStart`). Test sprawdza to na wielu seedach.

### Protokół tury
- Wspólny log zdarzeń w Redisie. Pierwszy `strzal`/`pas` danej tury jest **kanoniczny**.
- Strzał niesie pełny stan robali i kratery z chwili strzału + wektor startowy.
- Po **każdym** strzale jest faza `odwrot`: **5 s ruchu** (`ODWROT_S`). Wciśnięcia są nagrywane
  (RLE) i dołączane do strzału, a strzał wychodzi do sieci dopiero po tych 5 s — odbiorca odtwarza
  wszystko krok w krok. Koszt: inni widzą strzał z ~5 s opóźnieniem. Dlatego `GRACE_PAS` = 12 s.
- Turę zamyka `stan` (snapshot) policzony z kanonicznej akcji; wszyscy (autor też) go przyjmują.
- Gospodarz gry (najmniejsze id wśród połączonych uczestników) oddaje tury nieobecnych
  (odszedł / brak sieci 15 s / czas) i publikuje stan zastępczy. Po ~90 s bez sieci gracz wylatuje.
- **Gospodarz lobby** to obecny gracz, który dołączył najwcześniej (kolejność `dolacz`); lista lobby
  przeżywa nową partię (seedowana z `gracze` w zdarzeniu `nowa`).
- Zamknięcie karty → `sendBeacon` z `wyjdz` (text/plain). Przycisk „Opuść grę” robi to samo.

### Rozgrywka
- Sterowanie: **A/D** ruch, **Spacja** skok, **W/S** lub mysz celowanie, **F/Enter** (przytrzymaj) strzał,
  **1–0**, **-** i **=** broń. Na telefonie przyciski dotykowe + celowanie palcem, szczypanie = zoom.
- W powietrzu da się skręcać (sterowanie w locie, `POWIETRZE_*` w `sim.js`), ale nie przebić odrzutu.
- Bronie (`weapons.js`, kolejność = klawisze 1–0, potem - i =): bazooka, granat, strzelba, kasetówka, dynamit
  (lont 6 s), nalot (celowany), owca (biega, przeskakuje przeszkody, wybucha przy wrogu), kij
  (odrzut; `amunicja: 0` — tylko ze skrzynek, co trzecia skrzynka „zapas” go daje), teleport (celowany), salwa „Blitzkrieg” (3 rakietki), wiertło (jedzie prosto bez grawitacji, co 8 kroków `carve` → tunel,
  zdarzenie `wiercenie` przemalowuje teren), most (celowany, belka 90×7 px, do 260 px od robala,
  nie na robalu — `powodBrakuMostu`). Część ma limit amunicji.
- **Most w terenie**: siedzi na liście kraterów jako `{x, y, r: -1}` (`carve` z ujemnym r → `zbudujMost`),
  więc `rebuild()` odtwarza go w tej samej kolejności co wybuchy. W masce ma wartość **2** (`solidAt`
  sprawdza `!== 0`, render maluje 2 jako stalowy dźwigar). Nie zakładaj, że maska ma tylko 0/1.
- **Zrzuty** (`state.skrzynki`): na starcie tury od 2. rundy, 40% szans, max 3 naraz — wszystko z seeda
  i numeru tury w `nextTurn` (`zrzutZaopatrzenia`), więc zero dodatkowego ruchu w sieci. Skrzynka leży
  od razu na gruncie (spadochron to tylko animacja w `render.js`). Apteczka +35 HP (max 150), zapas +1
  do broni z limitem. Skrzynki lecą w snapshocie, w strzale i w pasie (robal może zebrać skrzynkę
  przed strzałem, a odbiorca nie symuluje jego chodzenia).
- Lawa podnosi się po kilku rundach (nagła śmierć). Kamera może wyjechać trochę za mapę i trzyma
  robala w wolnym pasie między panelami a dolnym HUD-em.
- Statystyki i osiągnięcia tylko w `localStorage` (bez serwera). Osiągnięć jest 18.

- Kamera (`main.js`, `pociskDoKamery`) pamięta śledzony pocisk i puszcza go dopiero po 0,6 s
  powolności — bez tego wolny dynamit/odbijający się granat powodował trzęsienie (skakanie pocisk↔robal).

### Jak dodać…
- **Broń**: wpis w `WEAPONS` + `WEAPON_ORDER` → obsługa w `sim.js` (`obliczStart`, `applyFire`,
  ewentualnie `stepProjectiles`) → rysowanie w `render.js` → test działania + dopisze się sam do
  testu „odbiorca odtwarza strzał co do bitu” (pętla po `WEAPON_ORDER`).
- **Osiągnięcie**: wpis w `gra/osiagniecia.js` + reguła w `osiagniecia-reguly.js` + test
  (test pilnuje, że każde id z reguł jest na liście i ile ich jest).

---

## 6. Zrzutka (strona główna)

- Dwie kategorie: **Fortnite** (V-dolce) i **0 A.D.** (srebrniki), przełączane hashem `#fortnite` / `#0ad`.
  Trzecia zakładka „Arena” to zwykły link do `gra/`.
- Sumy są wspólne (Redis), odznaki/tytuły/profil lokalne. Nowe cudze wpłaty pokazują się jako krótkie
  powiadomienia (raz na wpłatę, najwyżej 2 naraz).
- **Gracze** (opisy w kartach w `index.html` — trzymaj się tego charakteru):
  - Fortnite: **PowPow** (aka Konradek, full box, ambicje), **Krayo** (noob, nie umie grać),
    **Śliski Karp** (dziadek Piotr), **Apollo** (grinduje, blisko earningsów, niszczy lobby).
  - 0 A.D.: **Kozak** (GOAT z Izraela, spokojny, ale wkurzony nie do zatrzymania), **Lazi** (emeryt,
    weteran, blitzkrieg i do lobby), **Stozhinio** (spokojny do czasu, tylko Spartanie), **Nolli**
    (podstępny ekonomista, atakuje jak babcia), **Apollo** (masa obywatelek i jedzenia, armia po
    20. minucie, całkiem dobry), **Froxy** (zawsze Hanowie, początkujący, okulary), **Quber aka Kapuś**
    (Rzymianie, żółw z włóczników, 8/10).
- **Minigierki przed wpłatą** (`zrzutka/minigry.js` + `minigry.css`, klasyczny skrypt przed `app.js`):
  kwota 1–1000 → łatwa gra, 1001–2000 → trudna; trudność `t = 0…1` rośnie z kwotą w przedziale.
  Wpłata (`wplac`) idzie dopiero po wygranej — zero dodatkowych zapytań. Po przegranej 10 s blokady
  (`localStorage['zrzutka:minigra-blokada']`). Limit jednej wpłaty: 2000 (`maks` w `dane.js` i w `api/zrzutka.js`).
  Gry: `GRY[kat] = [łatwa, trudna]`; gra = `{ nazwa, opis[], start(env) }` → `{ krok, rysuj, wcisniete,
  ruch, puszczone(p, stukniecie), najazd?, klawisz, podpowiedz, debug }`, gra ma też `ikona`. Fortnite:
  „Snajper z Tilted” (łatwa) i „Build fight w burzy” (trudna); 0 A.D.: „Ekonomia Nolliego” (łatwa: stukanie
  zasobów, wilki = −3) i „Żółw Qubera” (trudna: obracanie tarcz na 4 strony, salwy, zmyłki, podwójne salwy,
  szarże). Teksty ramki per kategoria: `TEKSTY_RAMKI`. Ramka robi ekran startu, odliczanie 3-2-1,
  konfetti i blokadę. Kalibracja botami w Node (`_gry` + `debug()`): Build fight — bot z pełną wiedzą ~100%
  przy t=0 i ~15–20% przy t=1; Snajper — „ludzki” bot (reakcja 0,45–0,6 s, 20% pudeł) ~100% przy t=0
  i ~80–90% przy t=1; Ekonomia — bot 2,2 stuknięcia/s ~75% przy t=1; Żółw — bot z opóźnionym widzeniem
  (reakcja 0,4–0,5 s, 0,2 s między stuknięciami) ~95% przy t=0,5, przy t=0,75 ~85% / ~25%, przy t=1
  ~30% (szybki) / ~0% (przeciętny). Żółw ma salwy bez ostrzeżenia (`cicha`, dłuższy lot) i podwójne
  (odstęp ≥ 0,46 s — krócej niż reakcja człowieka byłoby zgadywaniem). Build fight: ściana w stronę
  stukniętego punktu, BUDUJ/spacja — w stronę ostatniego ruchu (`ostatniKier`), bez ruchu — najbliższy wróg.
  Tu wolno `Math.random` (to nie Arena).
  Pułapki: pełny okrąg „pod prąd” w canvasie to `arc(x, y, r, 2π, 0, true)` (od 0 do 2π daje zero);
  rozmiar sceny mierz `offsetWidth` (getBoundingClientRect łapie animację scale).
- **Okno wpłaty**: kwota z suwaka `#suwak` (pole `#pole-ile` i szybkie kwoty są ukryte, ale zostają źródłem
  wartości — `ustawKwote()` synchronizuje wszystko). Nad suwakiem strefy gier z `ZRZUTKA_MINIGRY.strefy(kat)`,
  pod nim wskaźnik gry i trudności. Tekst przycisku: `teksty.walcz`, gdy kategoria ma minigierki.
- **Sezon 2 / Hall of Fame**: plakietka `.sezon-pill` w obu nagłówkach i `S2` przy logo (`zrzutka/sezon.css`),
  okno `#okno-sezon` — podium (portrety klonowane z kart), reszta rankingu, największe wpłaty z ostatnich 60.
  Przy pierwszej wizycie otwiera się samo (raz, tylko gdy archiwum się pobrało).
- **Nowy gracz** = karta w `index.html` (awatar SVG 160×160, opis, staty, cele) + wpis w
  `zrzutka/dane.js` (w tej samej kategorii) + id w `GRACZE` w `api/zrzutka.js` (inaczej serwer odrzuci
  wpłaty) + ewentualnie odznaka. Zaktualizuj teksty z liczbą wojowników i licznik odznak.

---

## 7. Wersje i log zmian

- Przy każdej zmianie widocznej dla użytkownika dopisz wpis **na początku** `historia` w `wersja.js`
  (poprawki/drobne → `x.y+1`, duże rzeczy → `x+1.0`). Jeśli poprzednia wersja nie weszła jeszcze na
  `master`, można dopisać punkty do jej wpisu zamiast podbijać numer.
- Zmiany opisuj językiem gracza, nie programisty.

---

## 8. Testy i sprawdzanie

```
node gra/test/sim.test.mjs        # symulacja, bronie, determinizm, osiągnięcia
node gra/test/protokol.test.mjs   # protokół z atrapą serwera, lagiem, rozłączeniami (trwa ~1–2 min)
```
Obie muszą przejść przed pushem. Dodatkowo `node --check` na zmienionych plikach JS.

**E2E / zrzuty** (robione Playwrightem, Chromium jest w `/opt/pw-browsers`; skrypty trzymaj w scratchpadzie,
nie w repo): mały serwer Node, który serwuje pliki i uruchamia prawdziwe `api/arena.js` na atrapie
Upstasha w pamięci (obsługa `LRANGE/RPUSH/DEL/EXPIRE/INCR/SET NX EX/HSET/HGETALL/HINCRBY/HDEL`
przez endpoint `/pipeline`). Scenariusz: 2 przeglądarki desktop + telefon (np. „iPhone 13 landscape”),
porównanie `window.__arena().hash` na granicy każdej tury. Do zrzutów strony wystarczy `python3 -m http.server`.

**Pułapki, na które już wpadliśmy**
- W awatarach CSS ma `.awatar g/path/circle/ellipse { transform-box: fill-box }` — atrybut
  `transform="rotate(a x y)"` obraca wtedy wokół złego punktu. Takim elementom dawaj klasę `bez-pudla`.
- Zrzut może złapać mrugnięcie (animacja `.oko`) — przy „zamkniętych oczach” zrób drugi zrzut.
- Testy E2E jeden po drugim: gracze z poprzedniego przebiegu są „obecni” jeszcze ~20 s (duchy w lobby)
  — odczekaj albo zrestartuj atrapę. `page.close()` w Playwrightcie nie zawsze wysyła beacon.
- `pkill -f wzorzec` potrafi zabić własną powłokę, jeśli ta sama komenda zawiera wzorzec — zabijaj
  serwery osobną komendą i wzorcem typu `"http[.]server"`.
- Na nierównych mapach testy stawiają „półkę” (czyszczą teren wokół robala), zanim sprawdzą broń.

**Diagnostyka w przeglądarce**: `window.__arena()` — hash stanu, tura, faza, kamera, statystyki sieci.

---

## 9. Bezpieczeństwo

- Klucze Redisa są **tylko** w zmiennych środowiskowych Vercela (`UPSTASH_REDIS_REST_URL/TOKEN`,
  `KV_REST_API_*` albo dowolny prefiks `*_REST_API_URL/TOKEN`). Nigdy w kodzie, commitach ani
  odpowiedziach API. `.gitignore` blokuje `.env*` i `.vercel`.
- API zwraca do przeglądarki tylko kody błędów (`{ blad: '...' }`); szczegóły idą do `console.error`
  (logi Vercela).
- Ścisłe CSP (`script-src 'self'`, style tylko z plików i Google Fonts): żadnych inline `<script>`,
  `<style>` ani atrybutów `style=` w HTML. `el.style.x = …` z JS jest dozwolone.
- Tekst od użytkowników (nicki, wiadomości) wstawiaj przez `textContent`, nigdy `innerHTML`.
- Serwer waliduje wszystko, co przychodzi (typy, długości, dozwolone id graczy) i stempluje czas sam.
