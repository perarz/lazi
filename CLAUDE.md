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
- Dwie funkcje serwerowe w `api/`.
- Wspólne dane w **Upstash Redis** (REST, darmowy plan).
- Bez bundlera, bez `package.json` i bez zależności npm. Zwykłe pliki HTML/CSS/JS, gra jako moduły ES,
  zrzutka jako klasyczne skrypty.

Obecna wersja: **4.0 „Sezon 2”** (`wersja.js`).

---

## 0. Pierwsze 5 minut

1. Przeczytaj sekcje 1–3. Zasady i budżet Redisa są ważniejsze niż cokolwiek innego.
2. Ustaw gałąź. Jeśli PR z `claude/epic-rubin-ejixox` jest już scalony:
   `git fetch origin master && git checkout -B claude/epic-rubin-ejixox origin/master`.
3. Przed pushem uruchom testy Areny (sekcja 9), nawet przy zmianach tylko w zrzutce. Są szybkie i łapią regresje.
4. Każdą zmianę widoczną dla gracza sprawdź zrzutem na telefonie (Playwright, sekcja 9).
5. Dopisz wpis w `wersja.js` (sekcja 8) i uzupełnij ten plik, jeśli zmieniło się coś, co warto wiedzieć.

---

## 1. Najważniejsze zasady

1. **Oszczędzaj Redisa.** Działamy na darmowym planie Upstasha z limitem komend (sekcja 3).
   Każdą nową funkcję zaczynaj w przeglądarce (`localStorage`), serwer dodawaj tylko wtedy, gdy musi.
2. **Determinizm Areny.** Żadnego `Math.random/sin/cos/atan2` w symulacji (sekcja 7).
3. **Testy przed pushem**: `node gra/test/sim.test.mjs` i `node gra/test/protokol.test.mjs`, do tego
   `node --check` na zmienionych plikach JS.
4. **Wpis w logu zmian** (`wersja.js`) przy każdej zmianie widocznej dla użytkownika.
5. **Na `master` tylko na prośbę** („daj na main”, „wrzuć na maina”, „wrzuć”). To jest wdrożenie na produkcję.
6. **Po polsku**: odpowiedzi, teksty na stronie, komentarze, nazwy zmiennych i commity.
7. **Sprawdzaj wizualnie** zrzutami Playwrightem, na desktopie i na telefonie. Użytkownik gra głównie z telefonu.
8. **Trudność minigierek kalibruj botem**, nie na oko (sekcja 5.4).
9. **Nie zgaduj stanu produkcji.** Z tego środowiska zwykle nie ma dostępu do prawdziwej strony ani Redisa.
   Wszystko testuj na atrapie (sekcja 9).

---

## 2. Komunikacja i sposób pracy

- Użytkownik pisze po polsku, często bez polskich znaków, zwykle z telefonu.
  - Odpowiadaj po polsku, konkretnie i bez żargonu: co się zmieniło z punktu widzenia gracza.
  - Na końcu podaj krótko, co sprawdziłeś (testy, zrzuty, bot).
- Gdy prośba jest niejasna, przyjmij rozsądną interpretację i powiedz, jak ją zrozumiałeś.
  - Pytaj tylko o to, czego nie da się sensownie założyć (wygląd prawdziwej osoby, zakres resetu danych itp.).
  - Pytania zadawaj zbiorczo, najlepiej z propozycją domyślną.
- Użytkownik lubi dostać **najpierw plan albo pomysły**, a implementację potem. Gdy sam o to prosi
  („najpierw daj pomysły”), nie koduj od razu.
- Duże rzeczy dziel na etapy, jeśli użytkownik tak chce (np. „etap 1 → sprawdzam → etap 2”).
- **Gałąź i wdrożenie**:
  - Rozwijaj na `claude/epic-rubin-ejixox`, pushuj po każdej skończonej rzeczy.
  - Na prośbę o wdrożenie: PR `claude/epic-rubin-ejixox` → `master` z opisem po polsku, potem merge metodą „merge”.
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

**Przyszłość: VPS.** Rozmawialiśmy o przejściu na VPS (~5 zł/mies., Node + WebSocket).
- Zrzutkę przeniesie się łatwo.
- W Arenie wystarczy przepisać `net.js`, `protokol.js` zostaje.
- Nie zaczynaj tego bez wyraźnej prośby.

---

## 4. Struktura repo

| Ścieżka | Co to jest |
|---|---|
| `index.html` | Strona główna: zrzutka. **Karty graczy z awatarami SVG i opisami są tu**, plus sprite z symbolami (`#vbuck`, `#srebrnik`, `#scutum`, `#obywatelka`, ikony surowców) i wspólnymi gradientami. Są tu też okno wpłaty (`#okno`), okno sezonu (`#okno-sezon`) i ekran zdobycia celu |
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
| `api/arena.js` | Serwer gry: log zdarzeń, obecność, zamek startu partii |
| `vercel.json` | Nagłówki bezpieczeństwa |

**Klucze `localStorage`**
| Klucz | Zawartość |
|---|---|
| `zrzutka-v2` | Sumy (kopia), „moje” wpłaty (od nich zależą tytuły), ostatnie wpłaty, odznaki, zaczepki, `sezon`. Zapis z innego sezonu zostawia tylko odznaki i zaczepki |
| `zrzutka-nick`, `zrzutka-dzwiek` | Nick sponsora, dźwięk wł./wył. |
| `zrzutka:minigra-blokada` | Czas końca 10-sekundowej blokady po przegranej |
| `zrzutka:sezon1` | Archiwum sezonu 1 (pobrane raz) |
| `zrzutka:sezon2-intro` | `'1'` = okno sezonu już się samo pokazało |
| `arena:id`, `arena:nazwa`, `arena:bron`, `arena:staty`, `arena:osiagniecia` | Arena |

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
  1. Karta w `index.html`: awatar SVG 160×160, opis, staty, cele.
  2. Wpis w `zrzutka/dane.js` w tej samej kategorii.
  3. Id w `GRACZE` w `api/zrzutka.js`, inaczej serwer odrzuci wpłaty.
  4. Ewentualnie odznaka.
  5. Popraw teksty z liczbą wojowników i licznik odznak.
- **Nowa minigierka**:
  1. Obiekt gry według API z 5.3.
  2. Wpis w `GRY[kat]`.
  3. Pole `debug()` z `id` obiektów.
  4. Kalibracja botem (5.4).
  5. Zrzuty z telefonu.
  6. Kategoria bez gier działa jak dawniej, czyli wpłata bez minigierki.

---

## 6. Wygląd i UX: zasady, które się sprawdziły
- Mobile first. Sprawdzaj iPhone 13 w pionie (390×844) i poziomie oraz desktop 1280.
  Żadnego poziomego przewijania strony.
- Duże cele dotyku (≥ 44 px). Na telefonie bez klawiatury: suwaki, przyciski −/+, stuknięcia.
- Portrety graczy to rozbudowane SVG w `index.html`. Przy zmianach uważaj na pułapkę z `transform-box` (sekcja 9).
- Animacje respektują `prefers-reduced-motion`.

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
| `src/net.js` | Polling `/api/arena`, obecność, zegar serwera, `sendBeacon` przy zamknięciu karty |
| `src/main.js` | Lobby, HUD, kamera, pętla gry, zdarzenia → efekty, statystyki, osiągnięcia (UI) |
| `src/input.js` | Klawiatura, przyciski dotykowe, przeciąganie/szczypanie |
| `src/render.js`, `src/fx.js` | Grafika (tu wolno trygonometrię i `Math.random`) |
| `src/osiagniecia-reguly.js` | Reguły osiągnięć — czyste funkcje |
| `test/sim.test.mjs`, `test/protokol.test.mjs` | Testy w Node (63 i 10) |

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
- Zamknięcie karty wysyła `sendBeacon` z `wyjdz` (text/plain). Przycisk „Opuść grę” robi to samo.

### Rozgrywka
- **Sterowanie**:
  - **A/D** ruch, **Spacja** skok, **W/S** lub mysz celowanie, **F/Enter** (przytrzymaj) strzał.
  - **1–0**, **-** i **=** wybierają broń.
  - Na telefonie: przyciski dotykowe, celowanie palcem, szczypanie = zoom.
  - Pasek broni w poziomie ma siatkę 6×2.
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
- **Kamera** (`main.js`):
  - `pociskDoKamery` pamięta śledzony pocisk i puszcza go dopiero po 0,6 s powolności. Bez tego wolny dynamit
    albo odbijający się granat powodował trzęsienie, bo kamera skakała między pociskiem a robalem.
  - Kamera może wyjechać trochę za mapę i trzyma robala w wolnym pasie między panelami a dolnym HUD-em.
- Statystyki i osiągnięcia (18) są tylko w `localStorage`, bez serwera.

### Jak dodać…
- **Broń**:
  1. Wpis w `WEAPONS` i `WEAPON_ORDER`.
  2. Obsługa w `sim.js` (`obliczStart`, `applyFire`, ewentualnie `stepProjectiles`).
  3. Rysowanie w `render.js`, także broń w łapach.
  4. Klawisz w `input.js`.
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

---

## 9. Testy i sprawdzanie

```
node gra/test/sim.test.mjs        # symulacja, bronie, determinizm, skrzynki, spawny, osiągnięcia (63)
node gra/test/protokol.test.mjs   # protokół z atrapą serwera, lagiem, rozłączeniami (10, trwa ~1–2 min)
```
Obie muszą przejść przed pushem. Dodatkowo `node --check` na zmienionych plikach JS.
Test protokołu gra losowe partie. Zmiana listy broni zmienia ich przebieg. Jeśli padnie test zależny od
długości partii (np. „za mało strzałów”), sprawdź przyczynę, zanim zmienisz seed. Rozjazd stanu to zawsze błąd.

**E2E i zrzuty**
- Robimy je Playwrightem. Chromium jest w `/opt/pw-browsers`, moduł ładujesz przez
  `require(execSync('npm root -g') + '/playwright')`.
- Skrypty trzymaj w scratchpadzie, nie w repo.

- **Atrapa serwera** (Node, ~60 linii):
  - serwuje pliki repo;
  - uruchamia prawdziwe `api/arena.js` i `api/zrzutka.js` z `req.query`, `res.status().json()` i `res.setHeader`;
  - ma atrapę Upstasha w pamięci na drugim porcie (`/pipeline`, lista komend → `[{result}]`).
    Obsługiwane komendy: `LRANGE/RPUSH/LPUSH/LTRIM/DEL/EXPIRE/INCR/SET NX EX/HSET/HGETALL/HINCRBY/HDEL`;
  - dostaje `UPSTASH_REDIS_REST_URL=http://localhost:PORT+1` i dowolny token w env **przed** `require` API.
  - Do testów sezonów wstaw dane pod `zrzutka:sumy` / `zrzutka:wplaty` (sezon 1) przy starcie.
- **Scenariusz Areny**: 2 przeglądarki desktop + telefon („iPhone 13 landscape”), porównanie
  `window.__arena().hash` na granicy każdej tury.
- **Scenariusz zrzutki**:
  1. `addInitScript` z zapisem „starego sezonu” w `localStorage`.
  2. Sprawdź, czy okno sezonu otwiera się samo raz, czy liczniki są na zero, a odznaki zostały.
  3. Ustaw suwak przez `evaluate` (`value` + `dispatchEvent(new Event('input'))`).
  4. Zagraj botem przez `window.__minigra().d` i sprawdź sumę po wygranej. Poczekaj ~7 s na animację licznika.
  5. Sprawdź przegraną: blokada i przycisk „Rewanż”.
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
