# CLAUDE.md — kontekst projektu (przeczytaj całość przed pierwszą zmianą)

Żartobliwa strona dla ekipy znajomych. Ma trzy części:
- **Zrzutka**: zbiórka wirtualnych V-dolców (Fortnite) i srebrników (0 A.D.) dla konkretnych graczy.
  Każdą wpłatę trzeba najpierw wywalczyć w minigierce. Liczniki są podzielone na sezony, teraz trwa **sezon 2**.
- **Arena GOATów**: turowa strzelanka w stylu Worms, grana online przez całą ekipę.
- **„Co nowego”**: log zmian.

Wszystko powstawało iteracyjnie z właścicielem repo. Ten plik opisuje, **jak ma to działać, czego
pilnować i jak robić typowe rzeczy**, żeby kolejne zmiany szły w tę samą stronę.

Stos technologiczny:
- Statyczny hosting na **Vercelu**: produkcja to gałąź `master`, wdraża się sama w 1–2 minuty.
  Strona ma własną domenę **kacperlazarz.pl** (i `www.`).
- Dwie funkcje serwerowe w `api/`.
- Serwer Areny (WebSocket) na VPS właściciela: `wss://96-62-223-169.sslip.io/ws` (sekcja 3).
- Wspólne dane w **Upstash Redis** (REST, darmowy plan).
- Bez bundlera, bez `package.json` i bez zależności npm. Zwykłe pliki HTML/CSS/JS, gra jako moduły ES,
  zrzutka jako klasyczne skrypty.

Obecna wersja: **4.1.1 „Arena na własnym serwerze”** (`wersja.js`).

---

## 0. Pierwsze 5 minut

1. Przeczytaj sekcje 1–3. Zasady i budżet Redisa są ważniejsze niż cokolwiek innego.
2. Ustaw gałąź: `git fetch origin && git switch claude/epic-rubin-ejixox && git merge --ff-only origin/master`.
   - Gdy ostatni PR z gałęzi jest scalony, master ją zawiera, więc to zwykłe przewinięcie. Jeśli PR jest
     jeszcze otwarty (przewinięcie się nie uda), pracuj dalej na gałęzi i dopisuj do tej samej wersji.
   - W świeżym klonie `git switch` sam założy lokalną gałąź śledzącą `origin/claude/epic-rubin-ejixox`.
   - **Nie używaj** `git checkout -B claude/epic-rubin-ejixox origin/master`: ustawia śledzenie mastera,
     więc gołe `git push` poszłoby prosto na produkcję. Pushuj zawsze jawnie: `git push -u origin claude/epic-rubin-ejixox`.
3. Przed pushem uruchom testy Areny (sekcja 9), nawet przy zmianach tylko w zrzutce. Są szybkie i łapią regresje.
4. Każdą zmianę widoczną dla gracza sprawdź zrzutem na telefonie (Playwright, sekcja 9).
5. Dopisz wpis w `wersja.js` (sekcja 8) i uzupełnij ten plik, jeśli zmieniło się coś, co warto wiedzieć.
6. Prośba o rozwój Areny? Zacznij od „Plan rozwoju” w sekcji 7: są tam uzgodnione pomysły, uwagi techniczne
   i otwarte pytania. Zrobione punkty przenoś z planu do właściwych opisów i wykreślaj z listy.

---

## 1. Najważniejsze zasady

1. **Oszczędzaj Redisa.** Działamy na darmowym planie Upstasha z limitem komend (sekcja 3).
   Każdą nową funkcję zaczynaj w przeglądarce (`localStorage`), serwer dodawaj tylko wtedy, gdy musi.
2. **Determinizm Areny.** Żadnego `Math.random/sin/cos/atan2` w symulacji (sekcja 7).
3. **Testy przed pushem**: `node gra/test/sim.test.mjs` i `node gra/test/protokol.test.mjs`, do tego
   `node --check` na zmienionych plikach JS.
4. **Wpis w logu zmian** (`wersja.js`) przy każdej zmianie widocznej dla użytkownika.
5. **Na GitHuba (push, PR, merge) i na `master` tylko na wyraźną prośbę** („wrzuć”, „daj na main”,
   „wrzuć na maina”, „wrzuć to na github do main”). Merge do `master` to wdrożenie na produkcję.
6. **Po polsku**: odpowiedzi, teksty na stronie, komentarze, nazwy zmiennych i commity.
7. **Sprawdzaj wizualnie** zrzutami Playwrightem, na desktopie i na telefonie. Użytkownik gra głównie z telefonu.
8. **Trudność minigierek kalibruj botem**, nie na oko (sekcja 5.4).
9. **Nie zgaduj stanu produkcji.** Z tego środowiska zwykle nie ma dostępu do prawdziwej strony ani Redisa.
   Wszystko testuj na atrapie (sekcja 9).

---

## 2. Komunikacja i sposób pracy

- Nad stroną pracuje właściciel repo (`perarz`) i **Nolli** (konto `NolliDs`, Windows, repo w `D:\Nolli\Games\lazi`).
  Nolli jest też jedną z postaci na stronie (0 A.D., „podstępny ekonomista”). Kto pisze, zobaczysz w `gh auth status`.
- Użytkownik pisze po polsku, często bez polskich znaków, zwykle z telefonu.
  - Odpowiadaj po polsku, konkretnie i bez żargonu: co się zmieniło z punktu widzenia gracza.
  - Na końcu podaj krótko, co sprawdziłeś (testy, zrzuty, bot).
  - Duże paczki zmian przychodzą jako „UPDATE x.y” z listą punktów (zrzutka + Arena) i prośbą, żeby najpierw
    poznać cały kontekst i styl strony. Wtedy numer wersji w `wersja.js` to właśnie x.y.
- Gdy prośba jest niejasna, przyjmij rozsądną interpretację i powiedz, jak ją zrozumiałeś.
  - Pytaj tylko o to, czego nie da się sensownie założyć (wygląd prawdziwej osoby, zakres resetu danych itp.).
  - Pytania zadawaj zbiorczo, najlepiej z propozycją domyślną.
- Użytkownik lubi dostać **najpierw plan albo pomysły**, a implementację potem. Gdy sam o to prosi
  („najpierw daj pomysły”), nie koduj od razu.
- Duże rzeczy dziel na etapy, jeśli użytkownik tak chce (np. „etap 1 → sprawdzam → etap 2”).
- **Gałąź i wdrożenie**:
  - Rozwijaj na `claude/epic-rubin-ejixox` (ustawienie gałęzi: sekcja 0).
  - **Nic nie wysyłaj na GitHuba, dopóki użytkownik nie poprosi** („nie wrzucaj na githuba nic, dopóki ci
    nie powiem”). Skończoną pracę zostaw w katalogu roboczym, pokaż zrzuty i zapytaj, czy wrzucić.
  - Na prośbę o wdrożenie:
    1. testy i `node --check` (sekcja 9);
    2. commit po polsku (w stylu „4.1: …”, z listą zmian);
    3. `git push -u origin claude/epic-rubin-ejixox`;
    4. PR do `master` z opisem po polsku (co się zmieniło dla gracza + co sprawdzone);
    5. merge metodą „merge” (`gh pr merge N --merge`). W trybie auto aplikacja może zablokować merge jako
       „Merge Without Review” — nie obchodź tego. Powiedz użytkownikowi, że PR czeka, i scal dopiero po jego
       wyraźnym „scal” (albo niech kliknie Merge sam).
  - Po merge: `git fetch origin`, przewiń gałąź i lokalny master (`git merge --ff-only origin/master`,
    `git fetch origin master:master`).
  - Po wdrożeniu przypomnij, że trzeba odświeżyć stronę, a kto ma otwartą Arenę, musi ją przeładować.
- Humor strony: jajcarski, ale życzliwy. Śmiejemy się z grania, nie z ludzi.
  - Pochodzenie graczy podajemy tylko tak, jak podał je właściciel (etykieta w profilu).
  - Żadnych stereotypów w rysunkach.
- Szczegóły techniczne (np. dlaczego coś jest wolniejsze albo kosztuje) wyjaśniaj prosto, bez kodu.

---

## 3. Redis / Upstash: budżet zapytań (BARDZO WAŻNE)

Baza to **Upstash Redis na darmowym planie**: ok. 500 tys. komend miesięcznie (dokładny limit jest w panelu
Upstash). Każde zapytanie HTTP do `api/` to kilka komend. Przekroczenie limitu oznacza, że strona i gra
przestają działać dla wszystkich. Użytkownik pilnuje licznika (np. „mam 100k/500k”).

**Zasady**
- **Nie dodawaj nowych cyklicznych zapytań** (setInterval z fetch) bez wyraźnej potrzeby i zgody.
  Jeśli coś musi być wspólne, doklejaj dane do zapytań, które i tak idą (pole w `ruch`, w `dolacz`,
  w zdarzeniu strzału), zamiast robić nowy endpoint albo nowy polling.
- **Dane osobiste trzymaj w `localStorage`**: statystyki, osiągnięcia, ustawienia, wybraną broń, blokady minigier.
- Wiele komend naraz wysyłaj jednym `pipeline` (jedno zapytanie HTTP do Upstasha).
- Karta w tle nie odpytuje (`document.hidden`). Utrzymuj to przy każdej zmianie w `net.js` i `app.js`.
- Klucze dostają TTL, żeby porzucone dane same znikały. Listy są przycinane (`LTRIM`, limit logu).
- Dane, które się nie zmieniają (archiwum sezonu), oddawaj z nagłówkiem cache Vercela
  (`s-maxage`) i zapamiętuj w `localStorage`. Wtedy kosztują zero.
- Zanim dodasz funkcję „online”, policz, ile komend dziennie zje przy 5–6 graczach.

**Ile to kosztuje dziś (orientacyjnie)**
- **Arena** (`net.js`): odczyt to 1 zapytanie i 2 komendy (`LRANGE` + `HGETALL`).
  - Interwały: lobby 3 s, cudza tura 1 s, moja tura 2,5 s, czekanie na stan 0,45 s, bezczynność 15 s.
  - Puls obecności idzie co 8 s. Podgląd ruchu (`ruch`) idzie co ≥ 0,45 s, tylko gdy aktywny gracz się rusza.
  - Każdy zapis (`POST`) to limit (`INCR`, czasem `EXPIRE`) plus właściwe komendy.
  - **Godzina gry we 3 to kilkadziesiąt tysięcy komend.** To największy zjadacz budżetu.
- **Zrzutka** (`zrzutka/app.js`):
  - Odczyt sum idzie co 10 s na każdą otwartą, widoczną kartę (~720 zapytań/h/kartę, po 2 komendy).
  - Wpłata to jedno zapytanie. Minigierki nie kosztują nic, bo działają w przeglądarce.
- **Hall of Fame sezonu 1**: jedno zapytanie na przeglądarkę na zawsze. Cache Vercela trzyma je 7 dni,
  więc Redis widzi je najwyżej raz na tydzień.

**Limity po stronie API** (chronią budżet przed spamem)
- `api/arena.js`:
  - 200 zapisów / 10 s na IP. Gracze za jednym Wi-Fi mają wspólne IP!
  - Log ma max 4000 zdarzeń, potem jest reset i nowa „epoka”.
  - Ciało zapytania ≤ 24 KB, TTL 6 h.
- `api/zrzutka.js`:
  - 30 wpłat / 60 s na IP, lista ostatnich 60 wpłat.
  - Jedna wpłata to 1–2000 (`maks` w `GRACZE`).

**Arena na VPS (od 4.1.1).** Właściciel ma VPS (2 vCPU Ryzen 9 5950X, 4 GB, NVMe, Ubuntu 24.04,
PL, IP 96.62.223.169). Katalog `serwer/` to serwer Areny: Node + WebSocket (`ws`), logika pokoju jak w `api/arena.js`, ale
w pamięci i z natychmiastowym rozsyłaniem; wiele pokoi (`?pokoj=`). Za nim stoi Caddy (HTTPS, adres
**sslip.io** z IP serwera, bez kupowania domeny). Instrukcja: `serwer/INSTALACJA.md`, skrypt `serwer/instaluj.sh`.
- Gra wybiera transport w `gra/src/konfig.js`: `SERWER_WS = 'wss://…/ws'` → WebSocket, `null` → stary tryb
  przez `/api/arena` (Redis). **Powrót do Redisa = jedna linijka.** Po przełączeniu Arena nie zużywa Redisa.
- Adres serwera jest też w CSP `connect-src` w `gra/index.html` (`wss://… https://…`) — przy zmianie adresu
  popraw oba miejsca.
- Serwer sprawdza `Origin` (wolno `*.vercel.app`, localhost i `ARENA_ORIGINS` — na VPS ustawione
  `https://kacperlazarz.pl,https://www.kacperlazarz.pl`), limity: 60 wiadomości/s
  na połączenie, 30 połączeń na IP, zdarzenie ≤ 24 KB (większe zamykają tylko to połączenie).
- Z tej chmurowej sesji nie ma SSH do VPS. Instaluje i aktualizuje go **sesja Claude uruchomiona przez SSH
  w aplikacji desktopowej** (repo prywatne → deploy key tylko do odczytu). Na VPS: `arena-aktualizuj`
  (robi `git pull` w `/opt/lazi`; klon był z gałęzi `claude/epic-rubin-ejixox` — po wdrożeniu na `master`
  warto przełączyć go na `master`). Restart serwera urywa trwające partie.
- Panel dostawcy ma **własną zaporę** (polityka DROP): SSH tylko z adresów na „Whitelist IP” (zmiana IP
  w domu = `Operation timed out`), porty 80 i 443 otwarte dla wszystkich (certyfikat i gracze).
- Z tej chmurowej sesji nie da się połączyć z serwerem (proxy odrzuca adres) — stan VPS sprawdza użytkownik
  albo sesja SSH.
- `.vercelignore` wyklucza `serwer/` z publikacji na Vercelu.

---

## 4. Struktura repo

| Ścieżka | Co to jest |
|---|---|
| `index.html` | Strona główna: zrzutka. **Karty graczy z awatarami SVG i opisami są tu**, plus sprite z symbolami (`#vbuck`, `#srebrnik`, `#scutum`, `#obywatelka`, ikony surowców, `#battle-bus`, `#panorama`) i wspólnymi gradientami. Są tu też okno wpłaty (`#okno`), okno sezonu (`#okno-sezon`) i ekran zdobycia celu |
| `zrzutka/dane.js` | Kategorie (limity, teksty, `walcz`), gracze (cele, reakcje, zaczepki), odznaki (19), rangi — dane dla `app.js` |
| `zrzutka/app.js` | Logika strony: kategorie `#fortnite` / `#0ad`, suwak kwoty, wpłaty, liczniki, odznaki, profil, osiągnięcia z Areny, synchronizacja z API, sezony, Hall of Fame |
| `zrzutka/minigry.js`, `minigry.css` | Minigierki przed wpłatą: ramka i 4 gry (sekcja 5.3) |
| `zrzutka/sezon.css` | Plakietka „S2”, naklejka „Sezon 2” przy tytule, okno Hall of Fame |
| `zrzutka/baza.css`, `fortnite.css`, `zeroad.css`, `motyw.js` | Szkielet, dwa motywy (zmienne CSS `--c-*`, `--f-*`), ustawienie motywu przed malowaniem |
| `gra/` | **Arena GOATów** (sekcja 7) |
| `gra/osiagniecia.js` | Lista osiągnięć Areny (18) — klasyczny skrypt, czyta go gra i strona główna |
| `wersja.js` | Numer wersji + historia zmian (jedno źródło); znaczek `vX.Y` w rogu stron |
| `zmiany/` | Strona „Co nowego” (rysuje historię z `wersja.js`) |
| `goat/` | Stara, ukryta strona „ŁAZI TO GOAT” — nie ruszać |
| `api/zrzutka.js` | Wspólne sumy zrzutki, sezony (`SEZON`, `KLUCZE`), lista dozwolonych graczy `GRACZE` |
| `api/arena.js` | Serwer gry (stary tryb, Redis): log zdarzeń, obecność, zamek startu partii |
| `serwer/` | Serwer Areny na VPS: `pokoj.js` (logika), `serwer.js` (HTTP + WebSocket), `test.mjs`, `instaluj.sh`, `INSTALACJA.md`; ma własne `package.json` (zależność `ws`) — to jedyne miejsce z npm |
| `.vercelignore` | Nie publikuj `serwer/` na Vercelu |
| `vercel.json` | Nagłówki bezpieczeństwa |

**Klucze `localStorage`**
| Klucz | Zawartość |
|---|---|
| `zrzutka-v2` | Sumy (kopia), „moje” wpłaty (od nich zależą tytuły), ostatnie wpłaty, odznaki, zaczepki, `sezon`. Zapis z innego sezonu zostawia tylko odznaki i zaczepki |
| `zrzutka-nick`, `zrzutka-dzwiek` | Nick sponsora, dźwięk wł./wył. |
| `zrzutka:minigra-blokada` | Czas końca 10-sekundowej blokady po przegranej |
| `zrzutka:sezon1` | Archiwum sezonu 1 (pobrane raz) |
| `zrzutka:sezon2-intro` | `'1'` = okno sezonu już się samo pokazało |
| `arena:id`, `arena:nazwa`, `arena:kolor`, `arena:bron`, `arena:staty`, `arena:osiagniecia` | Arena (`arena:kolor` = kolor robala wybrany przy wejściu) |

---

## 5. Zrzutka (strona główna)

### 5.1 Ogólnie
- Dwie kategorie: **Fortnite** (V-dolce) i **0 A.D.** (srebrniki), przełączane hashem `#fortnite` / `#0ad`
  z animacją kurtyny. Trzecia zakładka „Arena” to zwykły link do `gra/`.
- Motyw zmienia cały wygląd:
  - Fortnite: niebieski, żółte skośne przyciski, font Anton.
  - 0 A.D.: pergamin, pieczęcie, font Cinzel.
  - Nowe elementy stylujesz **zmiennymi motywu** (`--c-popup`, `--c-akcent`, `--c-kat-aktywna`,
    `--c-okno-tekst`, `--f-display`…), a nie kolorami na sztywno.
- Sumy są wspólne (Redis, odświeżane co 10 s). Odznaki, tytuły i profil są lokalne.
- Nowe cudze wpłaty pokazują się jako krótkie powiadomienia: raz na wpłatę, najwyżej 2 naraz, tylko świeże (≤ 2 min).
- Bez serwera (plik otwarty lokalnie albo `python3 -m http.server`) strona działa na samym `localStorage`.

### 5.2 Okno wpłaty
- **Kwota z suwaka** `#suwak` (1–2000) z przyciskami −/+.
  - Przyciski idą po 1 do 50, potem po 10. Przytrzymanie przyspiesza.
  - Ukryte pole `#pole-ile` zostaje źródłem wartości. `ustawKwote(ile)` synchronizuje suwak, liczbę,
    kafelki stref, podgląd celu i wskaźnik gry.
- Nad suwakiem są **kafelki stref gier** z `ZRZUTKA_MINIGRY.strefy(kat)`. Tor suwaka jest zielono-żółty do 1000
  i pomarańczowo-czerwony powyżej. Pod suwakiem jest wskaźnik: ikona gry, nazwa i poziom trudności.
- Przycisk ma tekst `teksty.walcz`, gdy kategoria ma minigierki:
  - Fortnite: „Zawalcz o V-dolce”.
  - 0 A.D.: „Stań do bitwy o srebrniki”.
- Przebieg: `submit` otwiera minigierkę, **wygrana** wywołuje `wplac()` (animacja monet + POST),
  a **rezygnacja** wraca do okna z tą samą kwotą.
- Limit 2000 na wpłatę jest w **dwóch miejscach**: `maks` w `dane.js` i `GRACZE[kat].maks` w `api/zrzutka.js`.

### 5.3 Minigierki (`zrzutka/minigry.js`)
- Kwota 1–1000 daje grę łatwą, 1001–2000 trudną. Trudność `t = 0…1` rośnie liniowo z kwotą w przedziale.
  Nazwy poziomów: Luz → Spoko → Konkret → Pot na czole, oraz Trudno → Ciężko → Bardzo ciężko → KOSZMAR.
- Po przegranej jest **10 s blokady** („Rewanż za X s”), zapamiętanej w `localStorage`, więc odświeżenie nie pomaga.
- Wszystko dzieje się w przeglądarce, bez zapytań. Uparty gracz może to obejść konsolą, ale przy żartobliwej
  zrzutce to akceptujemy.
- **API modułu** (`window.ZRZUTKA_MINIGRY`):
  - `graj(opcje)`, `dlaKwoty(kat, ile)`, `strefy(kat)`, `nazwaTrudnosci`, `pozostalaBlokada`.
  - `_gry` służy tylko testom.
- **Gra** to `{ nazwa, ikona, opis[], start(env) }`.
  - `env = { W, H, u (1% krótszego boku), t, wygrana(), przegrana(powod) }`.
  - `start` zwraca `{ krok(dt), rysuj(g), wcisniete(p), ruch(p), puszczone(p, stukniecie), najazd?(p),
    klawisz(k, wdol), podpowiedz?(), debug?() }`.
  - Rejestr: `GRY[kat] = [łatwa, trudna]`.
- **Ramka** (`graj`) robi:
  - nagłówek ze stawką, ekran startu z paskiem trudności i odliczanie 3-2-1;
  - pętlę na `requestAnimationFrame` (dt ≤ 0,05);
  - konfetti i „Victory Royale!” / „Zwycięstwo!” po wygranej, „Wyeliminowany” / „Klęska” po przegranej, blokadę;
  - teksty per kategoria (`TEKSTY_RAMKI`);
  - zamykanie Escape;
  - `window.__minigra()` do testów.
  - Obrót ekranu restartuje grę. Samo chowanie paska adresu na telefonie jej nie restartuje.
- Wspólne pomocniki: `czasteczki()` (iskry, drzazgi, konfetti), `napisy()` (wyskakujące „+1”, „HEADSHOT!”),
  `zaokr`, `napis`, `napisSerif`, `pergaminHud` (HUD w stylu 0 A.D.).
- W minigierkach wolno `Math.random` i trygonometrię, bo to nie Arena.

**Gry**
| Kategoria | Gra | Zasady | Co rośnie z `t` |
|---|---|---|---|
| Fortnite, łatwa | 🎯 **Snajper z Tilted** | Wrogowie wychylają się z okien i dachów, stuknięcie = strzał; głowa = HEADSHOT; niebieski znacznik = swój (−1) | Cel 5→9, krótsza widoczność, więcej naraz, więcej swoich, biegający po dachach, mniej zapasowej amunicji |
| Fortnite, trudna | 🔨 **Build fight w burzy** | Przeciągaj = bieg; wróg przed serią celuje laserem „!”; **stuknięcie = ściana w stronę stukniętego punktu**, BUDUJ/spacja = w stronę ostatniego ruchu (`ostatniKier`), bez ruchu = najbliższy wróg; zbieraj drewno; przetrwaj kurczącą się burzę | 1→2 wrogów, dłuższe serie, szybsze kule, częstsze serie, mniejszy krąg i przesunięty środek, mniej drewna, dłuższy czas |
| 0 A.D., łatwa | 🌾 **Ekonomia Nolliego** | Stukaj zasoby, zanim znikną (jagody/drewno 1, kamień 2, złoto 3); wilk = −3 | Cel 16→40, krótszy czas życia zasobów, więcej wilków, mniej czasu |
| 0 A.D., trudna | 🛡️ **Żółw Qubera** | Stuknij stronę ekranu / strzałki, żeby obrócić tarcze; świecący łucznik zaraz strzeli; szarżę konnicy też przyjmij frontem (−2) | Więcej salw, krótsze ostrzeżenie i lot, zmyłki, **salwy bez ostrzeżenia** (`cicha`, lecą ×1,7 dłużej), **podwójne salwy** (odstęp ≥ 0,46 s), szarże, mniej legionistów |

### 5.4 Kalibracja trudności (boty w Node)
Gry ładuje się w Node (`globalThis.window = {}` + `import('zrzutka/minigry.js')`), a boty grają przez
`_gry[kat][i].start(env)` i `debug()`. Obecne wyniki (to wzorzec do utrzymania):
- **Snajper**: „ludzki” bot (reakcja 0,45–0,6 s, 20% pudeł w ścianę, 15% pomyłek przy swoich)
  wygrywa ~100% przy t=0 i ~80–90% przy t=1.
- **Build fight**: bot z pełną wiedzą (widzi kule, robi uniki, stuka w stronę celującego wroga)
  wygrywa ~100% przy t=0 i ~15–20% przy t=1.
- **Ekonomia**: bot 2,2 stuknięcia/s, reakcja 0,5–0,65 s, wygrywa ~75% przy t=1.
- **Żółw**: bot z **opóźnionym widzeniem**. Decyduje na podstawie stanu sprzed 0,4 lub 0,5 s,
  a między stuknięciami potrzebuje 0,2 s. Wyniki (szybki / przeciętny):
  - t=0,5: ~95%
  - t=0,75: ~85% / ~25%
  - t=1: ~30% / ~0%

Lekcje z kalibracji:
- Bot musi rozpoznawać cele **po `id`**, nie po pozycji ani po obiekcie z `debug()`, który co klatkę jest nowy.
- „Pomyłkę” losuj **raz na cel**, nie co klatkę.
- Odstęp krótszy niż ludzka reakcja (~0,45 s) to zgadywanie, a nie trudność.
- Łatwa gra przy 1000 ma być wyraźnie łatwiejsza niż trudna przy 1001.

### 5.5 Sezony i Hall of Fame
- `api/zrzutka.js` ma `SEZON` i `KLUCZE`:
  - sezon 1: `zrzutka:sumy`, `zrzutka:wplaty` (archiwum);
  - sezon 2: `zrzutka:s2:sumy`, `zrzutka:s2:wplaty`.
- `GET /api/zrzutka?sezon=1` oddaje archiwum z `Cache-Control: public, max-age=86400, s-maxage=604800`.
  Nieistniejący sezon daje 404 `{ blad: 'nie-ma-sezonu' }`. Zwykły GET zwraca też pole `sezon`.
- Klient (`app.js`, stała `SEZON`) przy wczytaniu zapisu z innego sezonu zeruje sumy, „moje” wpłaty
  (tytuły liczą się od nowa) i listę wpłat. **Odznaki zostają.**
- **Hall of Fame** (`#okno-sezon`):
  - podium 2·1·3 z portretami klonowanymi z kart (`karty[kat + ':' + id]`) i dalsze miejsca;
  - „najhojniejsze wpłaty końcówki sezonu” z ostatnich 60 wpłat, bo tyle trzymał serwer;
  - otwiera się samo **raz** (`zrzutka:sezon2-intro`) i tylko wtedy, gdy archiwum się pobrało;
  - w każdej chwili otwiera je plakietka „S2 · Sezon 2 trwa” nad tytułem albo naklejka „SEZON 2” / „Sezon II”
    przy słowie V-DOLCE / SREBRNIKI (`.h1-sezon`, `<span role="button">` z obsługą Enter/spacji);
  - w nagłówku przy logo jest znaczek `S2`, ukryty na wąskich telefonach razem z logo.
- **Nowy sezon, krok po kroku**:
  1. `api/zrzutka.js`: dopisz `3: { sumy: 'zrzutka:s3:sumy', wplaty: 'zrzutka:s3:wplaty' }` i ustaw `SEZON = 3`.
  2. `app.js`: ustaw `SEZON = 3`. Okno ma teraz na sztywno „sezon 1” (`KLUCZ_SEZON1`, `?sezon=1`,
     `KLUCZ_INTRO`, teksty w `index.html`), więc uogólnij je na „poprzedni sezon” i ustaw nowy klucz intro.
  3. Podmień teksty „Sezon 2” / „S2” / „Sezon II” w `index.html` (plakietki, naklejki, logo, okno).
  4. Wpis w `wersja.js` jako duża wersja (`x+1.0`).
  5. Test na atrapie: stare dane pod starymi kluczami, nowy sezon od zera, okno pokazuje się raz.

### 5.6 Gracze, odznaki, jak dodać…
- **Gracze** (opisy w kartach w `index.html`, trzymaj się tego charakteru):
  - **Fortnite** (4):
    - **PowPow**: aka Konradek, full box, ambicje.
    - **Krayo**: noob, nie umie grać.
    - **Śliski Karp**: dziadek Piotr.
    - **Apollo**: grinduje, blisko earningsów, niszczy lobby.
  - **0 A.D.** (7):
    - **Kozak**: GOAT z Izraela, spokojny, ale wkurzony nie do zatrzymania.
    - **Lazi**: emeryt, weteran, blitzkrieg i do lobby.
    - **Stozhinio**: spokojny do czasu, tylko Spartanie.
    - **Nolli**: podstępny ekonomista, atakuje jak babcia.
    - **Apollo**: masa obywatelek i jedzenia, armia po 20. minucie, całkiem dobry.
    - **Froxy**: zawsze Hanowie, początkujący, okulary.
    - **Quber aka Kapuś**: Rzymianie, żółw z włóczników, 8/10.
  - Apollo jest w obu kategoriach. Kartę zawsze wybieraj w obrębie sekcji
    `[data-kategoria="…"]` albo przez `karty['kat:id']`.
- **Odznak jest 19** (`dane.js`), m.in. „Hojny mecenas” (2000 naraz w Fortnite / 1000 w 0 A.D.) i
  „Combo” (3 wpłaty w 2 minuty, bo każdą trzeba wygrać). Progi odznak pilnuj względem limitu 2000.
- **Nowy gracz**:
  1. Karta w `index.html` według budowy z 5.7: awatar SVG 160×160, opis, staty, cele.
  2. Wpis w `zrzutka/dane.js` w tej samej kategorii — **6 celów** (sekcja 5.7).
  3. Id w `GRACZE` w `api/zrzutka.js`, inaczej serwer odrzuci wpłaty.
  4. Ewentualnie odznaka.
  5. Popraw teksty z liczbą wojowników i licznik odznak.

### 5.7 Karty graczy i poziomy celów (od 4.1)
- **Poziomy**: każdy gracz ma 6 celów w `dane.js` (pierwsze trzy do ~3 tys., potem 10 000, 20 000, 50 000).
  Nazwy etapów są w `kategorie[kat].etapy`:
  - Fortnite: rangi z rankedów `Brąz, Srebro, Złoto, Diament, Champion, Unreal`; `etapNumerowany: true`
    daje na karcie „Cel 3/6 · Złoto”;
  - 0 A.D.: `Faza miasteczka, Faza miasta, Cud świata, Zdobycie relikwii, Królobójstwo, Podbój świata`
    (fazy i warunki zwycięstwa z gry), na karcie sama nazwa.
  - Nazwy celów są żartobliwe i trzymają się charakteru postaci, z nawiązaniami do prawdziwych gier
    (Karnet Bojowy, FNCS, World Cup / agoge, reformy Mariusza, Ministerstwo Hanów, słonie przez Alpy).
  - Ścieżkę poziomów pod paskiem (`ol.cel-poziomy`, kropki/medaliony z rzymską cyfrą) buduje `app.js`
    (`zbudujPoziomy`, `rysujPoziomy`) — w HTML jej nie ma.
  - `etapy` mają mieć tyle nazw, ile celów (przy braku bierze się ostatnią). Pasek celu liczy od zera do kwoty
    bieżącego celu, więc przy zmianie progów w trakcie sezonu karta sama pokaże nowy etap.
  - Startowe teksty celu w HTML (`data-cel-etap`, `data-cel-kwota`, `data-cel-nazwa`) trzymaj zgodne
    z pierwszym celem — `app.js` i tak je nadpisuje, ale bez JS widać właśnie je.
- **Budowa karty** (`index.html`, wszystkie karty tak samo):
  - `.karta-obraz`: `.promienie`, `svg.awatar`, `.ranga`, `.korona`, `.dymek`. Portret ma proporcje 16/10.
  - `.karta-tresc`: `header.karta-glowa` (`h2.nick` + `p.aka`), zaraz po nim `p.haslo`, potem `ul.metryka`,
    `div.opis`, `ul.staty` (4 statystyki, siatka 2×2), `div.zbiorka`.
  - Fortnite: `.karta-glowa` leży na dole portretu jak nazwa na kafelku w sklepie (ujemny margines,
    `pointer-events: none`, więc stuknięcie dalej zaczepia portret); rzadkość w lewym górnym rogu.
    0 A.D.: nagłówek wyśrodkowany pod łukowym oknem, portret powiększony (103%), wstęga z rangą na dole okna.
  - Opis z więcej niż jednym akapitem `app.js` sam zwija (`zwijanyOpis`): widać pierwszy akapit
    i przycisk „Czytaj dalej” / „Czytaj kronikę dalej”. Nie dopisuj przycisku w HTML.
  - Karta jest kontenerem (`container-type: inline-size`) — rozmiar nicku zależy od szerokości karty (`cqw`).
- **Portrety**: na ramionach jest poświata w kolorze rzadkości (`path.obrys` tuż po ścieżce z `url(#cien-ciala)`).
  Tła postaci (autobus, fotel, słoń, góry, markiza, zboże, pagoda, sztandar) mają klasę `tlo-postaci`
  i są ukryte w małych portretach (okno wpłaty, Hall of Fame). Rekwizyty przed postacią (kilof, krzak,
  laska, konewka, ping) zostają. Tło może wychodzić poza viewBox: na karcie widać mniej więcej x od −56 do 216.
- Nagłówki: `.hero-niebo` z przelatującym Battle Busem (Fortnite, symbol `#battle-bus`) i `.hero-panorama`
  z budowlami (0 A.D., symbol `#panorama`). Nad kartami jest `.sekcja-tytul`.
- **Nowa minigierka**:
  1. Obiekt gry według API z 5.3.
  2. Wpis w `GRY[kat]`.
  3. Pole `debug()` z `id` obiektów.
  4. Kalibracja botem (5.4).
  5. Zrzuty z telefonu.
  6. Kategoria bez gier działa jak dawniej, czyli wpłata bez minigierki.

---

## 6. Wygląd i UX: zasady, które się sprawdziły
- Mobile first. Sprawdzaj iPhone 13 w pionie (390×844) i poziomie oraz desktop 1280 (Fortnite ma 4 kolumny
  od 1500 px — sprawdź też 1600). Żadnego poziomego przewijania strony: na telefonie
  `document.documentElement.scrollWidth` ma być równe `clientWidth`.
- Duże cele dotyku (≥ 44 px). Na telefonie bez klawiatury: suwaki, przyciski −/+, stuknięcia.
- **Karty graczy mają być zwarte** (w 4.1 użytkownik prosił o ściśnięcie w pionie bez wycinania treści).
  Nowe rzeczy w karcie dokładaj tak, żeby jej nie wydłużać: siatka zamiast listy, długi tekst pod „Czytaj dalej”.
  Obecnie na telefonie karta ma ok. 800 px (Fortnite) i 870–970 px (0 A.D.) — pilnuj, żeby nie urosła.
- W Arenie na telefonie najczęstsze akcje są pod prawym kciukiem (celownik, SKOK, OGNIA), lewy tylko chodzi.
- Portrety graczy to rozbudowane SVG w `index.html`. Przy zmianach uważaj na pułapkę z `transform-box` (sekcja 9).
  Portret podrasowuje się rekwizytem albo tłem, które pasuje do żartu o postaci (5.7), bez zmieniania twarzy.
- Animacje respektują `prefers-reduced-motion` — nową animację dopisz do listy wyjątków na końcu `baza.css`.

---

## 7. Arena GOATów (`gra/`)

### Pliki
| Plik | Rola |
|---|---|
| `src/sim.js` | Symulacja (bez DOM): robale, fizyka, bronie, tury, skrzynki, snapshoty, hash stanu |
| `src/terrain.js` | Generator mapy (seed → maska pikseli 2048×1024, lawa od y=880), kratery i mosty, punkty startu |
| `src/weapons.js` | Tabela broni (liczby, bez logiki) i kolejność na pasku |
| `src/rng.js` | `mulberry32`, szum, `hashNumbers`, `hashTekstu` |
| `src/protokol.js` | Protokół sieciowy (bez DOM) — kto ma turę, co jest kanoniczne, kto wyrzuca nieobecnych |
| `src/net.js` | Dwa transporty z tym samym interfejsem: WebSocket do serwera na VPS albo polling `/api/arena` (Redis); obecność, zegar serwera, `sendBeacon` przy zamknięciu karty; `RUCH_CO` — podgląd ruchu co 100 ms (WS) / 450 ms (Redis) |
| `src/konfig.js` | `SERWER_WS` — adres serwera Areny albo `null`; lokalnie `?serwer=ws://127.0.0.1:8787/ws` do testów |
| `src/main.js` | Lobby (kolory graczy), HUD, kamera, pętla gry, zdarzenia → efekty, statystyki, osiągnięcia (UI) |
| `src/ekwipunek.js` | Ekwipunek broni jak w Worms Armageddon: rzędy (`GRUPY`), ikony SVG broni, otwieranie/zamykanie |
| `src/input.js` | Klawiatura, przyciski dotykowe, przeciąganie/szczypanie, PPM/Q = ekwipunek |
| `src/render.js`, `src/fx.js` | Grafika (tu wolno trygonometrię i `Math.random`); w `render.js` też kamera i podgląd robala na ekranie wejścia |
| `src/osiagniecia-reguly.js` | Reguły osiągnięć — czyste funkcje |
| `test/sim.test.mjs`, `test/protokol.test.mjs` | Testy w Node (64 i 11) |

### Determinizm (święta zasada)
- Symulacja (`sim.js`, `terrain.js`) używa tylko:
  - `+ - * /`, `Math.sqrt`, `Math.floor/round/abs/min/max`, `Math.imul`;
  - seedowanego `mulberry32` i szumu z `rng.js`.
- **Zero `Math.sin/cos/atan2/random`**, bo różne przeglądarki dają inne bity i gra się rozjeżdża (desync).
- Trygonometria jest tylko u strzelającego: `obliczStart()` liczy wektor(y) startowe, które lecą w zdarzeniu
  (`start`, np. wachlarz salwy `start.salwa`). Odbiorca nic nie przelicza.
- `-0` normalizujemy (`x + 0`), bo JSON zamienia `-0` na `0`.
- Mapa nie leci przez sieć, tylko seed + lista kraterów.
  - Generator 2D robi nawisy, komory, pływające skały i czasem wielką jaskinię (zamiast dawnych cienkich tuneli).
  - 4 style z seeda: góry, archipelag, kaniony, jaskinie.
  - Kopia bazowej maski jest cache'owana.
- `spawnPoints` nigdy nie stawia robala w powietrzu. Gdy w wycinku gracza nie ma gruntu (przerwa
  między wyspami), szuka gruntu na całej mapie (`zapasowyStart`). Test sprawdza to na wielu seedach.

### Protokół tury
- Wspólny log zdarzeń w Redisie. Pierwszy `strzal`/`pas` danej tury jest **kanoniczny**.
- Strzał niesie pełny stan robali, kratery i skrzynki z chwili strzału oraz wektor startowy.
  Pas niesie robale, kratery i skrzynki.
- Po **każdym** strzale jest faza `odwrot`: **5 s ruchu** (`ODWROT_S`).
  - Wciśnięcia są nagrywane (RLE) i dołączane do strzału.
  - Strzał wychodzi do sieci dopiero po tych 5 s, a odbiorca odtwarza wszystko krok w krok.
  - Koszt: inni widzą strzał z ~5 s opóźnieniem. Dlatego `GRACE_PAS` = 12 s.
- Turę zamyka `stan` (snapshot) policzony z kanonicznej akcji. Wszyscy, autor też, go przyjmują.
- Gospodarz gry (najmniejsze id wśród połączonych uczestników):
  - oddaje tury nieobecnych (odszedł / brak sieci 15 s / czas);
  - publikuje stan zastępczy.
  - Po ~90 s bez sieci gracz wylatuje.
- **Gospodarz lobby** to obecny gracz, który dołączył najwcześniej (kolejność `dolacz`). Lista lobby
  przeżywa nową partię (jest seedowana z `gracze` w zdarzeniu `nowa`).
- **Start partii** (od 4.1): gospodarz publikuje odliczanie `ODLICZANIE_S` (20 s, `protokol.js`) i ono zawsze
  leci do końca — nie ma przycisku „Zaczynamy”. `zloz` pomija termin krótszy niż 15 s od stempla serwera
  (wpis ze starej, nieodświeżonej karty).
- **Kolory**: gracz wybiera kolor robala przy wejściu (`PALETA` w `main.js`, 12 kolorów, `arena:kolor`),
  kolor leci w `dolacz`. Przy kolizji `rozdzielKolory` zostawia go temu, kto dołączył wcześniej, reszta
  dostaje pierwszy wolny (lobby mówi o tym graczowi). Nick nad robalem jest rysowany w jego kolorze.
- Zamknięcie karty wysyła `sendBeacon` z `wyjdz` (text/plain). Przycisk „Opuść grę” robi to samo.

### Rozgrywka
- **Sterowanie**:
  - **A/D** ruch, **Spacja** skok, **W/S** lub mysz celowanie, **F/Enter** (przytrzymaj) strzał.
  - **1–0**, **-** i **=** wybierają broń.
  - **Ekwipunek** (`ekwipunek.js`): przycisk z aktualną bronią na dole HUD-u, **Q** albo **prawy przycisk
    myszy** otwiera siatkę broni w rzędach (Rakiety, Granaty, Na wroga, Sprzęt; nowa broń bez rzędu trafia
    do „Inne”). Wybór albo stuknięcie obok (`#ekw-tlo`) zamyka; Escape też. Widz może wybrać broń na swoją turę.
  - Na telefonie: przyciski dotykowe, celowanie palcem, szczypanie = zoom. Lewa grupa to ◀ ▶, prawa to
    celownik ▲▼ i **SKOK nad OGNIA**. W czasie ucieczki (`body.ucieczka`) znika celownik i OGNIA, skok zostaje.
- W powietrzu da się skręcać (`POWIETRZE_*` w `sim.js`), ale nie da się przebić odrzutu.
- Tura trwa 30 s (`TURN_TIME`). Lawa podnosi się po 6 rundach (`LAWA_PO_RUNDACH`, nagła śmierć).

**Bronie** (`weapons.js`, kolejność = klawisze)
| Klawisz | Broń | Rodzaj | Amunicja | Uwagi |
|---|---|---|---|---|
| 1 | Bazooka | pocisk | ∞ | wiatr, wybuch przy kontakcie |
| 2 | Granat | odbijany | ∞ | lont |
| 3 | Strzelba | hitscan | ∞ | |
| 4 | Kasetówka | odbijany | 2 | rozpada się na odłamki |
| 5 | Dynamit | podkładany | 2 | lont 6 s, ucieczka |
| 6 | Nalot | celowany | 1 | rakiety z nieba |
| 7 | Owca | owca | 1 | biega, przeskakuje przeszkody, wybucha przy wrogu |
| 8 | Kij | kij | **0** | tylko ze skrzynek (co 3. „zapas”), dmg 15, odrzut 360 |
| 9 | Teleport | celowany | 1 | |
| 0 | Blitzkrieg | salwa | 2 | 3 rakietki wachlarzem |
| - | Wiertło | wiertło | 2 | jedzie prosto bez grawitacji, co 8 kroków `carve` → tunel (zdarzenie `wiercenie` przemalowuje teren), na końcu mały wybuch |
| = | Most | celowany | 3 | belka 90×7 px, do 260 px od robala, nie na robalu (`powodBrakuMostu`) |

- **Most w terenie**: siedzi na liście kraterów jako `{x, y, r: -1}` (`carve` z ujemnym r uruchamia `zbudujMost`),
  więc `rebuild()` odtwarza go w tej samej kolejności co wybuchy. W masce ma wartość **2** (`solidAt`
  sprawdza `!== 0`, render maluje 2 jako stalowy dźwigar). **Nie zakładaj, że maska ma tylko 0/1.**
- **Zrzuty** (`state.skrzynki`):
  - Pojawiają się na starcie tury od 2. rundy, z szansą 40%, najwyżej 3 naraz.
  - Wszystko wynika z seeda i numeru tury w `nextTurn` (`zrzutZaopatrzenia`), więc nie ma dodatkowego ruchu w sieci.
  - Skrzynka leży od razu na gruncie. Spadochron to tylko animacja w `render.js`.
  - Apteczka daje +35 HP (max 150), zapas daje +1 do broni z limitem.
  - Wybuch niszczy skrzynki.
  - Skrzynki lecą w snapshocie, w strzale i w pasie, bo robal może zebrać skrzynkę przed strzałem,
    a odbiorca nie symuluje jego chodzenia.
- **Kamera** (`main.js`, granice w `render.js`):
  - `pociskDoKamery` pamięta śledzony pocisk i puszcza go dopiero po 0,6 s powolności. Bez tego wolny dynamit
    albo odbijający się granat powodował trzęsienie, bo kamera skakała między pociskiem a robalem.
  - Kamera może wyjechać trochę za mapę i trzyma robala w wolnym pasie między panelami a dolnym HUD-em.
  - `ograniczKamere` liczy granice w sposób ciągły: przy oddalaniu zakres się zwęża, aż przy całej mapie
    w kadrze zostaje środek. Dawniej po przekroczeniu szerokości mapy kamera w jednej klatce skakała na środek
    (test „oddalanie nie rzuca kamera…”). Zoom (kółko, szczypanie) nie wyłącza śledzenia robala; kółko
    zoomuje proporcjonalnie do `deltaY`, bo touchpad sypie dziesiątkami zdarzeń.
  - `pasyHud` mierzy grupy przycisków dotykowych osobno: boczne (telefon poziomo) nie zabierają środka
    ekranu, tylko pilnują marginesu z boku (`pasy.bok`).
- Statystyki i osiągnięcia (18) są tylko w `localStorage`, bez serwera.

### Jak dodać…
- **Broń**:
  1. Wpis w `WEAPONS` i `WEAPON_ORDER`.
  2. Obsługa w `sim.js` (`obliczStart`, `applyFire`, ewentualnie `stepProjectiles`).
  3. Rysowanie w `render.js`, także broń w łapach.
  4. Klawisz w `input.js`, ikona w `IKONY` i miejsce w `GRUPY` w `ekwipunek.js` (bez tego broń trafi
     do rzędu „Inne” z ikoną bazooki).
  5. Test działania. Broń dopisze się sama do testu „odbiorca odtwarza strzał co do bitu” (pętla po `WEAPON_ORDER`).
     Broń z `amunicja: 0` albo celowana wymaga ustawień w tym teście.
- **Osiągnięcie**:
  1. Wpis w `gra/osiagniecia.js`.
  2. Reguła w `osiagniecia-reguly.js`.
  3. Test, który pilnuje, że każde id z reguł jest na liście, i sprawdza liczbę osiągnięć.
- **Coś w stanie gry** (np. nowy obiekt jak skrzynki):
  1. Pole w `createGame`.
  2. Kopia w `snapshot` / `zastosujSnapshot` / `stanPoTurze`.
  3. W akcjach `strzal`/`pas`, jeśli gracz może to zmienić przed strzałem.
  4. Test „odbiorca = strzelec”.

### Plan rozwoju: bliżej Worms Armageddon (propozycja po 4.1, czeka na decyzję)
Plan przedstawiony użytkownikowi 2026-09-25. **Nic z tego jeszcze nie jest zrobione.** Użytkownik nie wybrał
kolejności — zapytaj, zanim zaczniesz. Każdy etap to osobna wersja z testami i zrzutami. Etapy 1–3 nie dodają
żadnych cyklicznych zapytań (dane doklejone do `dolacz`, `nowa`, strzału).

**Etap 1 — klimat Wormsów (wersja 4.2, małe ryzyko)**
- **Dźwięki**: Arena jest dziś całkiem niema. Syntezowane Web Audio jak `dzwieki` w `zrzutka/app.js`
  (bez plików): wybuch, wystrzał, odbicie granatu, owca, lont, plusk lawy, zrzut, dżingiel tury, „ała”.
  Podpięte pod zdarzenia w `obsluzZdarzenia`; wyciszenie w `localStorage` (np. `arena:dzwiek`).
- **Nagrobki**: tylko `render.js` — martwy robal (`!alive && !odszedl`) ma w stanie swoje x, y.
- **Dymki z tekstami** przy trafieniu, eliminacji i wpadnięciu do lawy; lokalnie, jak `emitTekst` w `fx.js`.
- **Czapki postaci ze zrzutki** wybierane przy wejściu obok koloru (rogi Kozaka, hełm Stozhinia, opaska
  PowPowa, karp, kapelusz Nolliego, okulary Froxy'ego, galea Qubera, wieniec Apolla, „?” Krayo). Lecą
  w `dolacz` i w `nowa.gracze` jak kolor, rysuje je `drawWorm`. Z czapką robal mówi teksty postaci z `dane.js`.
- **Lont granatu 1–5 s** (jak w WA): wybór w ekwipunku, wartość w akcji `strzal`, `spawnProjectile`
  bierze ją zamiast `weapon.fuse`. Deterministyczne, bo leci gotowa liczba.
- **Podsumowanie partii** na ekranie końca: obrażenia, fragi, najlepszy strzał — liczone lokalnie ze zdarzeń.

**Etap 2 — drużyny (wersja 5.0, największa zmiana)**
- **2–4 robale na gracza**, tury drużyn na zmianę, w drużynie kolejny żywy robal, paski HP drużyn,
  broń „wybór robala”. Dotyka protokołu: dziś `aktywny` (w `snapshot` i `zloz`) to id robala = id gracza,
  a `mogeGrac` porównuje `w.id === r.mojeId`. Przy drużynach trzeba rozdzielić „gracz z turą” (do
  `mozeDzialac`) i „aktywny robal”, dać robalom id właściciela, `kolejnoscTur` po drużynach, więcej
  punktów w `spawnPoints`. Testy protokołu do przerobienia. Stan tury przy 6×4 robalach to ok. 5 KB (limit 24 KB).
- **Ustawienia partii u gospodarza lobby**: liczba robali, czas tury, HP startowe, zestaw broni, styl mapy,
  początek nagłej śmierci. Jadą w `nowa`; podgląd w lobby przez rzadkie zdarzenie w logu (kilka zapisów na partię).
- **Miny i beczki** od startu, rozmieszczone z seeda; stan jak skrzynki (przepis „Coś w stanie gry”).
  Mina wybucha po zbliżeniu robala, beczka od wybuchu obok (reakcje łańcuchowe).
- **Skrzynki**: pułapka (wybucha po otwarciu) i skrzynka z narzędziami.

**Etap 3 — ruch i nowe bronie (5.1+)**
- **Plecak odrzutowy, spadochron, potem lina ninja.** Przed strzałem to zwykły ruch lokalny, jak chodzenie:
  odbiorca dostaje stan robali w `strzal`/`pas`, więc protokół się nie zmienia. W podglądzie `ruch` można
  dokleić punkt zaczepienia liny. W ucieczce (`odwrot`) na razie niedostępne, bo nagranie RLE tego nie umie.
- **Klasyki WA**: Święty granat, bananowa bomba, rakieta samonaprowadzająca (skręt przez wektor i `sqrt`,
  bez trygonometrii), moździerz, Uzi, trzęsienie ziemi, Armagedon (deszcz meteorów jak nalot).
- **Bronie ekipy**: Babcia Nolliego (wolna „owca”, „atakuje jak babcia”), Spartańskie kopnięcie („THIS IS
  SPARTA”, wariant kija), Szarża słoni Kozaka (trzy duże „owce”), Full box PowPowa (4 belki wokół robala —
  potrzebny pionowy wariant `zbudujMost`). Blitzkrieg Laziego już jest.
- Przy ponad 12 broniach: klawisze F1–F4 przełączają broń w rzędzie ekwipunku (`GRUPY`), jak w WA.

**Etap 4 — większe, do osobnej decyzji**
- **Trening z botem offline** (`createGame(…, { sieciowa: false })` i lokalna pętla): bot przelicza kilka
  strzałów na kopii stanu i wybiera najlepszy; poziomy np. „bot Krayo” i „bot Kozak”. Zero kosztu serwera.
- **Powtórka najlepszego strzału** w zwolnionym tempie: `poczatekSnap` + kanoniczna akcja, przeliczone lokalnie.
- **Nowe motywy map** (lód, pustynia, rzymskie ruiny, woda zamiast lawy): palety w `render.js`, kształty w `terrain.js`.
- **Wspólny ranking Areny** na stronie zrzutki: jeden zapis na koniec partii jest tani, ale odczyt dołożony
  do odświeżania zrzutki co 10 s kosztuje — czytać tylko na żądanie. Najpierw policz budżet (sekcja 3).
- **Emotki w grze** („gg”, „ez”, „lag!”): każda to zapis do serwera, więc z limitem (np. 1 na 10 s na gracza).

**Rekomendacja z planu**: najpierw Etap 1 (dźwięki robią największą różnicę), potem drużyny; bronie z Etapu 3
dorzucać po kilka w wersji. **Otwarte pytania do użytkownika**: od czego zaczynamy; ile robali domyślnie
w drużynie (2 czy 3); czy robimy czapki i bronie z postaci ekipy; czy wspólny ranking jest wart kosztu Redisa.

---

## 8. Wersje i log zmian

- Przy każdej zmianie widocznej dla użytkownika dopisz wpis **na początku** `historia` w `wersja.js`
  (`{ wersja, data, tytul, zmiany[] }`).
  - Poprawki i drobiazgi: `x.y+1`, np. 3.10.1. Trzy człony są OK.
  - Duże rzeczy: `x+1.0`.
- Jeśli poprzednia wersja nie weszła jeszcze na `master` albo użytkownik mówi „daj to dalej jako X”,
  dopisz punkty do jej wpisu zamiast podbijać numer.
- Zmiany opisuj językiem gracza, nie programisty.
- Kamienie milowe:
  - 1.0 ŁAZI TO GOAT
  - 2.x zrzutka i wspólne sumy
  - 3.0 Arena bez desynców
  - 3.2 mapy
  - 3.5 osiągnięcia
  - 3.7 ruch po strzale i nowe bronie
  - 3.9 wiertło i zrzuty
  - 3.10 most
  - 3.10.1–3.10.2 minigierki i suwak
  - **4.0 sezon 2** + minigierki 0 A.D.
  - **4.1** 6 poziomów celów (do 50 000), zwarte karty i podrasowane portrety, ekwipunek i kolory w Arenie
  - **4.1.1** Arena na własnym serwerze (VPS, WebSocket) zamiast Redisa

---

## 9. Testy i sprawdzanie

```
node gra/test/sim.test.mjs        # symulacja, bronie, determinizm, skrzynki, spawny, osiągnięcia, kamera (64)
node gra/test/protokol.test.mjs   # protokół z atrapą serwera, lagiem, rozłączeniami, odliczanie (11, trwa ~1–2 min)
cd serwer && npm install && node test.mjs   # serwer Areny na VPS: rozsyłanie, epoki, zamek, pokoje, limity (10)
```
Obie muszą przejść przed pushem. Dodatkowo `node --check` na zmienionych plikach JS.
Test protokołu gra losowe partie. Zmiana listy broni zmienia ich przebieg. Jeśli padnie test zależny od
długości partii (np. „za mało strzałów”), sprawdź przyczynę, zanim zmienisz seed. Rozjazd stanu to zawsze błąd.

**E2E i zrzuty**
- Robimy je Playwrightem. Chromium jest w `/opt/pw-browsers`, moduł ładujesz przez
  `require(execSync('npm root -g') + '/playwright')`.
  - Na Windowsie (komputer Nolliego) nie ma tego środowiska: wystarczy `npm install playwright-core`
    w scratchpadzie i `chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })`
    — bez pobierania przeglądarek. Wbudowana przeglądarka aplikacji psuje zrzuty przewiniętej strony przy
    emulowanym rozmiarze ekranu, więc do zrzutów używaj Playwrighta.
  - Kilku graczy Areny = kilka kontekstów przeglądarki (osobny `localStorage`, więc osobne `arena:id`).
- Skrypty trzymaj w scratchpadzie, nie w repo.

- **Atrapa serwera** (Node, ~60 linii):
  - serwuje pliki repo;
  - uruchamia prawdziwe `api/arena.js` i `api/zrzutka.js` z `req.query`, `res.status().json()` i `res.setHeader`;
  - ma atrapę Upstasha w pamięci na drugim porcie (`/pipeline`, lista komend → `[{result}]`).
    Obsługiwane komendy: `LRANGE/RPUSH/LPUSH/LTRIM/DEL/EXPIRE/INCR/SET NX EX/HSET/HGETALL/HINCRBY/HDEL`;
  - dostaje `UPSTASH_REDIS_REST_URL=http://localhost:PORT+1` i dowolny token w env **przed** `require` API.
  - Wariant z 4.1: atrapa Redisa na tym samym porcie pod `/__redis` (URL `http://127.0.0.1:PORT/__redis`)
    i `GET /__reset`, który czyści bazę między przebiegami (znikają też „duchy” z lobby).
  - Do testów sezonów wstaw dane pod `zrzutka:sumy` / `zrzutka:wplaty` (sezon 1) przy starcie.
- **Arena przez serwer WebSocket**: `ARENA_PORT=8787 node serwer/serwer.js` + `python3 -m http.server 8765`,
  gra pod `http://localhost:8765/gra/?serwer=ws://127.0.0.1:8787/ws&pokoj=test1` (dla każdego przebiegu nowy
  pokój — bez duchów w lobby). Partia startuje sama po 20 s odliczania. `__arena().transport` = `ws`/`http`.
- **Scenariusz Areny**: 2 przeglądarki desktop + telefon („iPhone 13 landscape”), porównanie
  `window.__arena().hash` na granicy każdej tury.
  - Start: obaj wpisują nick i wybierają kolor (drugi ten sam co pierwszy, żeby sprawdzić kolizję), potem
    ok. 20 s odliczania. Kto ma turę: `__arena().aktywny === __arena().mojeId`.
  - Tura telefonu: desktop strzela (przytrzymaj F ~0,35 s) i czekasz, aż `aktywny` zmieni się na telefon.
  - Długie przytrzymanie OGNIA na dotyku: CDP `Input.dispatchTouchEvent` (`touchStart`, pauza, `touchEnd`).
    `tap()` Playwrighta jest za krótki — odpala słaby strzał od razu.
  - Kamera przy zoomie: sztuczne `WheelEvent` na `#plotno` i pomiar `__arena().kamera` co klatkę
    (`robal` = pozycja robala na ekranie, `recznie` = czy kamera przestała śledzić). Skok > kilku px to błąd.
- **Scenariusz zrzutki**:
  1. `addInitScript` z zapisem „starego sezonu” w `localStorage`.
  2. Sprawdź, czy okno sezonu otwiera się samo raz, czy liczniki są na zero, a odznaki zostały.
  3. Ustaw suwak przez `evaluate` (`value` + `dispatchEvent(new Event('input'))`).
  4. Zagraj botem przez `window.__minigra().d` i sprawdź sumę po wygranej. Poczekaj ~7 s na animację licznika.
  5. Sprawdź przegraną: blokada i przycisk „Rewanż”.
  - Do testu samych poziomów i kart można pominąć minigierkę: `delete window.ZRZUTKA_MINIGRY` przed wysłaniem
    (wpłata idzie wtedy od razu). Sprawdź `[data-cel-etap]`, klasy `.cel-poziomy li` i ekran zdobycia celu.
  - Hall of Fame: wstaw dane sezonu 1 do atrapy (`HSET zrzutka:sumy fortnite:krayo 5400 …` przez `/pipeline`)
    i otwórz okno plakietką sezonu (`click({ force: true })`).
- Do samych zrzutów strony wystarczy `python3 -m http.server` (bez API strona działa lokalnie).
- **Kalibracja minigier**: boty w Node (sekcja 5.4). Uruchamiaj 60–100 partii na każdy poziom `t`.

**Pułapki, na które już wpadliśmy**
- W awatarach CSS ma `.awatar g/path/circle/ellipse { transform-box: fill-box }`, więc atrybut
  `transform="rotate(a x y)"` obraca wokół złego punktu. Takim elementom dawaj klasę `bez-pudla`.
- Zrzut może złapać mrugnięcie (animacja `.oko`) albo przejście kurtyny między kategoriami.
  Przy dziwnym wyniku zrób drugi zrzut później.
- Playwright nie klika elementów w ciągłej animacji („element is not stable”), np. pulsującej naklejki
  sezonu. Użyj `click({ force: true })`.
- Minigierka zaczyna się od odliczania. W teście czekaj na `__minigra().stan === 'gra'`, zanim zaczniesz grać.
- Canvas: pełny okrąg rysowany „pod prąd” to `arc(x, y, r, 2π, 0, true)`, bo `arc(…, 0, 2π, true)` daje okrąg
  zerowej długości. Przez to burza zasłaniała kiedyś całą planszę.
- Rozmiar sceny mierz `offsetWidth/offsetHeight`. `getBoundingClientRect` łapie animację wejścia (scale).
- Płótno w elemencie flex ustaw `position: absolute; inset: 0`, inaczej rozpycha rodzica.
- `display: flex` w CSS nadpisuje atrybut `hidden`. Dopisz `[hidden] { display: none }`.
- Testy E2E Areny puszczaj jeden po drugim. Gracze z poprzedniego przebiegu są „obecni” jeszcze ~20 s
  (duchy w lobby), więc odczekaj albo zrestartuj atrapę. `page.close()` w Playwrightcie nie zawsze wysyła beacon.
- Atrapa zrzutki trzyma sumy między przebiegami. Restartuj ją, gdy test sprawdza konkretne liczby.
- `pkill -f wzorzec` potrafi zabić własną powłokę, jeśli ta sama komenda zawiera wzorzec. Zabijaj
  serwery osobną komendą i wzorcem typu `"http[.]server"` albo `"serwer-zrzutka[.]js"`.
- Na nierównych mapach testy stawiają „półkę” (czyszczą teren wokół robala), zanim sprawdzą broń.
- Z tego środowiska zwykle **nie ma sieci do produkcji** (`*.vercel.app`). Nie planuj pracy, która wymaga
  odczytu prawdziwych danych. Dane produkcyjne czyta dopiero wdrożony kod (np. archiwum sezonu).
- Zrzut pojedynczej karty łapie przyklejony pasek nawigacji. Na zrzutach wstrzyknij
  `.pasek { position: static }` (`addStyleTag` działa tylko z `bypassCSP: true` w kontekście).
- Zmiana samego hasha w otwartej stronie (`#fortnite` → `#0ad`) odpala kurtynę. Do zrzutów drugiej kategorii
  ładuj nowy adres, np. `/?x=1#0ad`.
- Obracający się element przy brzegu (moneta w nagłówku) poszerza stronę o parę pikseli, bo transform liczy się
  do obszaru przewijania. Dlatego `.hero` ma `overflow-x: clip`.
- W SVG portretów atrybut prezentacji nie przyjmie `var(--…)`, a `style=` blokuje CSP. Kolor z motywu dawaj
  przez klasę i CSS (np. `.awatar .obrys { stroke: var(--r1) }`).
- Ozdoby `position: absolute` w nagłówku malują się nad zwykłym tekstem. Tła nagłówka mają `z-index: -1`,
  a `.hero` ma `isolation: isolate`.
- Git na Windowsie ma `core.autocrlf=true`, więc kopia robocza jest w CRLF. Skrypt, który przepisuje `index.html`,
  ma zostawić CRLF (inaczej wyjdą mieszane końce linii — git i tak je znormalizuje przy commicie).
- W konsoli widać 404 na `favicon.ico` — strona nie ma ikonki, to nie błąd.
- `tap()` w Playwrightcie trafia w środek elementu. Tło ekwipunku (`#ekw-tlo`) w środku zasłania panel —
  stukaj w róg (`position: { x: 12, y: 12 }`).

**Diagnostyka w przeglądarce**:
- `window.__arena()`: hash stanu, tura, faza, kamera, statystyki sieci.
- `window.__minigra()`: stan ramki, trudność, `debug()` gry.

---

## 10. Bezpieczeństwo

- Klucze Redisa są **tylko** w zmiennych środowiskowych Vercela (`UPSTASH_REDIS_REST_URL/TOKEN`,
  `KV_REST_API_*` albo dowolny prefiks `*_REST_API_URL/TOKEN`). Nigdy w kodzie, commitach ani
  odpowiedziach API. `.gitignore` blokuje `.env*` i `.vercel`.
- API zwraca do przeglądarki tylko kody błędów (`{ blad: '...' }`). Szczegóły idą do `console.error`
  (logi Vercela).
- Ścisłe CSP (`script-src 'self'`, style tylko z plików i Google Fonts): żadnych inline `<script>`,
  `<style>` ani atrybutów `style=` w HTML. `el.style.x = …` z JS jest dozwolone.
- Tekst od użytkowników (nicki, wiadomości) wstawiaj przez `textContent`, nigdy `innerHTML`.
  Dotyczy to też Hall of Fame (nicki sponsorów z archiwum).
- Serwer waliduje wszystko, co przychodzi (typy, długości, dozwolone id graczy, kwota 1–2000, numer sezonu)
  i sam stempluje czas.
