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
- **Serwer na VPS** właściciela (`serwer/`, sekcja 3): Arena (`wss://96-62-223-169.sslip.io/ws`) i zrzutka
  (`https://96-62-223-169.sslip.io/api/zrzutka` + na żywo `/zrzutka/ws`), dane zrzutki w pliku na VPS.
  Vercel serwuje tylko pliki (bez funkcji `api/`). **Redisa (Upstash) już nie ma** — usunięty w 4.1.1.
- Bez bundlera, bez `package.json` i bez zależności npm. Zwykłe pliki HTML/CSS/JS, gra jako moduły ES,
  zrzutka jako klasyczne skrypty.

Obecna wersja: **4.10 „Płonąca ropa, 7 utworów w tle i areny, które nie zarastają”** (`wersja.js`).

---

## 0. Pierwsze 5 minut

1. Przeczytaj sekcje 1–3. Zasady i działanie serwera są ważniejsze niż cokolwiek innego.
2. Ustaw gałąź. **Nazwę gałęzi podaje sesja** (instrukcje środowiska; ostatnio `claude/epic-rubin-ejixox` (4.10),
   wcześniej `claude/fervent-babbage-dxyp1c`). Niżej `GAŁĄŹ` = ta nazwa:
   `git fetch origin && git switch GAŁĄŹ && git merge --ff-only origin/master`.
   - Gdy ostatni PR z gałęzi jest scalony, master ją zawiera, więc to zwykłe przewinięcie. Jeśli PR jest
     jeszcze otwarty (przewinięcie się nie uda), pracuj dalej na gałęzi i dopisuj do tej samej wersji.
   - W świeżym klonie `git switch` sam założy lokalną gałąź śledzącą `origin/GAŁĄŹ`.
   - **Nie używaj** `git checkout -B GAŁĄŹ origin/master`: ustawia śledzenie mastera,
     więc gołe `git push` poszłoby prosto na produkcję. Pushuj zawsze jawnie: `git push -u origin GAŁĄŹ`.
   - Hook sesji po każdej odpowiedzi prosi o commit i push. **Commit lokalny jest OK** (chroni pracę przed utratą
     kontenera), ale push dopiero na prośbę użytkownika (sekcja 1, zasada 5) — powiedz mu wtedy krótko, że commit czeka.
3. Przed pushem uruchom testy Areny (sekcja 9), nawet przy zmianach tylko w zrzutce. Są szybkie i łapią regresje.
4. Każdą zmianę widoczną dla gracza sprawdź zrzutem na telefonie (Playwright, sekcja 9).
5. Dopisz wpis w `wersja.js` (sekcja 8) i uzupełnij ten plik, jeśli zmieniło się coś, co warto wiedzieć.
6. Prośba o rozwój Areny? Zacznij od „Plan rozwoju” w sekcji 7: są tam uzgodnione pomysły, uwagi techniczne
   i otwarte pytania. Zrobione punkty przenoś z planu do właściwych opisów i wykreślaj z listy.

---

## 1. Najważniejsze zasady

1. **Serwer to jeden mały VPS.** Dane osobiste trzymaj w przeglądarce (`localStorage`), na serwer idzie
   tylko to, co naprawdę wspólne (sekcja 3). Zmiana w `serwer/` działa dopiero po `arena-aktualizuj` na VPS.
2. **Determinizm Areny.** Żadnego `Math.random/sin/cos/atan2` w symulacji (sekcja 7).
3. **Testy przed pushem**: `node gra/test/sim.test.mjs` i `node gra/test/protokol.test.mjs`, do tego
   `node --check` na zmienionych plikach JS.
4. **Wpis w logu zmian** (`wersja.js`) przy każdej zmianie widocznej dla użytkownika.
5. **Na GitHuba (push, PR, merge) i na `master` tylko na wyraźną prośbę** („wrzuć”, „daj na main”,
   „wrzuć na maina”, „wrzuć to na github do main”). Merge do `master` to wdrożenie na produkcję.
6. **Po polsku**: odpowiedzi, teksty na stronie, komentarze, nazwy zmiennych i commity.
7. **Sprawdzaj wizualnie** zrzutami Playwrightem, na desktopie i na telefonie. Użytkownik gra głównie z telefonu.
8. **Trudność minigierek kalibruj botem**, nie na oko (sekcja 5.4).
9. **Nie zgaduj stanu produkcji.** Z tego środowiska zwykle nie ma dostępu do prawdziwej strony ani VPS.
   Wszystko testuj na lokalnym serwerze (sekcja 9).

---

## 2. Komunikacja i sposób pracy

- Nad stroną pracuje właściciel repo (`perarz`) i **Nolli** (konto `NolliDs`, Windows, repo w `D:\Nolli\Games\lazi`).
  Nolli jest też jedną z postaci na stronie (0 A.D., „podstępny ekonomista”). Kto pisze, zobaczysz w `gh auth status`
  (w chmurowej sesji `gh` nie ma — GitHub idzie przez narzędzia MCP `mcp__github__*`).
- Właściciel pracuje z Maca i telefonu (Claude app). Do VPS łączy się sesją „SSH connection” w aplikacji
  desktopowej (klucz `~/.ssh/vps_arena.key`, host `root@96.62.223.169`). **Z telefonu nie ma klucza SSH** —
  wtedy używa konsoli w panelu dostawcy VPS: daj mu **pojedyncze komendy do wklejenia** (każda w osobnym bloku,
  z tym, co ma wyjść), a nie prompt dla sesji Claude (wzór w sekcji 3).
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
  - Rozwijaj na gałęzi podanej przez sesję (sekcja 0).
  - **Nic nie wysyłaj na GitHuba, dopóki użytkownik nie poprosi** („nie wrzucaj na githuba nic, dopóki ci
    nie powiem”). Skończoną pracę zostaw w katalogu roboczym, pokaż zrzuty i zapytaj, czy wrzucić.
  - Na prośbę o wdrożenie:
    1. testy i `node --check` (sekcja 9);
    2. commit po polsku (w stylu „4.1: …”, z listą zmian);
    3. `git push -u origin GAŁĄŹ`;
    4. PR do `master` z opisem po polsku (co się zmieniło dla gracza + co sprawdzone);
    5. merge metodą „merge” (`gh pr merge N --merge` albo `mcp__github__merge_pull_request`). Jeśli jest już
       otwarty PR z tej gałęzi, zaktualizuj jego tytuł i opis zamiast zakładać nowy. W trybie auto aplikacja
       może zablokować merge jako „Merge Without Review” — nie obchodź tego. Powiedz użytkownikowi, że PR
       czeka, i scal dopiero po jego wyraźnym „scal” (albo niech kliknie Merge sam).
    6. **Zmiany w `serwer/`** nie wdrażają się same: daj użytkownikowi gotowy prompt dla sesji SSH na VPS
       albo komendy do konsoli dostawcy (`arena-aktualizuj`, a po zmianie `instaluj.sh` ponowne puszczenie skryptu instalacji; sekcja 3).
       Zmiana protokołu Arena ↔ serwer musi działać także ze starą wersją drugiej strony przez te kilka minut.
  - Po merge: `git fetch origin`, przewiń gałąź i lokalny master (`git merge --ff-only origin/master`,
    `git fetch origin master:master`). Tryb auto potrafi zablokować i to („Merge Without Review”) — wtedy
    zostaw, zrobisz to na początku następnej pracy (sekcja 0, krok 2).
  - Po wdrożeniu przypomnij, że trzeba odświeżyć stronę, a kto ma otwartą Arenę, musi ją przeładować.
- Humor strony: jajcarski, ale życzliwy. Śmiejemy się z grania, nie z ludzi.
  - Pochodzenie graczy podajemy tylko tak, jak podał je właściciel (etykieta w profilu).
  - Żadnych stereotypów w rysunkach.
- Szczegóły techniczne (np. dlaczego coś jest wolniejsze albo kosztuje) wyjaśniaj prosto, bez kodu.

---

## 3. Serwer na VPS (od 4.1.1)

Do 4.1 wspólne dane szły przez funkcje `api/` na Vercelu i **Upstash Redis** (darmowy plan z limitem
komend — godzina Areny zjadała dziesiątki tysięcy). W 4.1.1 wszystko przeszło na własny serwer, a `api/`
i Redis zostały usunięte (dane zrzutki przeniesione skryptem `serwer/migruj-zrzutke.mjs`).

**Zasady**
- Wspólne jest tylko to, co musi: log Areny, obecność, sumy i ostatnie wpłaty zrzutki, **od 4.6 konta Areny**
  (statystyki i osiągnięcia gracza — sekcja 3.1). Ustawienia, wybrana broń, blokady minigier, odznaki
  zrzutki — `localStorage`.
- Nowe dane „online” doklejaj do tego, co już idzie (pole w `ruch`, `dolacz`, strzale, stanie zrzutki),
  zamiast nowego kanału. Serwer i tak rozsyła zmiany sam, więc klient nie odpytuje w pętli.
- Karta w tle nie wysyła pulsów (`document.hidden`); zrzutka odświeża co 10 s tylko, gdy gniazdo leży.
- Serwer waliduje wszystko sam (sekcja 10) i ma limity na IP — gracze za jednym Wi-Fi mają wspólne IP.
- Restart serwera urywa trwające partie Areny (pokoje są w pamięci). Zrzutka przeżywa (plik).

**Szczegóły.** Właściciel ma VPS (2 vCPU Ryzen 9 5950X, 4 GB, NVMe, Ubuntu 24.04,
PL, IP 96.62.223.169). Katalog `serwer/` to serwer: Node + WebSocket (`ws`).
- **Arena** (`pokoj.js`): log zdarzeń w pamięci, rozsyłany od razu; wiele pokoi (`?pokoj=`), epoki,
  obecność, zamek startu 8 s, log max 20 000 zdarzeń (potem nowa epoka; do 4.1.1 było 4000), zdarzenie ≤ 24 KB.
- **Zrzutka** (`zrzutka.js`, lista graczy/sezon/limity w `gracze.js`): dane w `/var/lib/arena/zrzutka.json`
  (zapis przez plik tymczasowy + dzienne kopie z 14 dni). `GET/POST /api/zrzutka`, po każdej wpłacie stan
  leci do wszystkich na `/zrzutka/ws`. Limity: 30 wpłat / 60 s na IP, lista 60 ostatnich wpłat, kwota 1–2000.
- Za serwerem stoi Caddy (HTTPS, adres
**sslip.io** z IP serwera, bez kupowania domeny). Instrukcja: `serwer/INSTALACJA.md`, skrypt `serwer/instaluj.sh`.
- Adres serwera jest w **czterech miejscach**: `gra/src/konfig.js`, `zrzutka/app.js` i CSP `connect-src`
  w `gra/index.html` oraz `index.html` (`wss://… https://…`).
- Lokalnie oba adresy nadpisuje parametr (tylko na localhost): gra `?serwer=ws://127.0.0.1:8787/ws`,
  zrzutka `?serwer=http://127.0.0.1:8787` (puste `?serwer=` = bez serwera, sam `localStorage`).
- Gdy serwer leży: Arena pokazuje błąd połączenia i próbuje dalej; zrzutka działa lokalnie (wpłaty
  tylko w tej przeglądarce), liczniki wspólne wracają, gdy serwer wstanie.
- Serwer sprawdza `Origin` (wolno `*.vercel.app`, localhost i `ARENA_ORIGINS` — na VPS ustawione
  `https://kacperlazarz.pl,https://www.kacperlazarz.pl`), limity: 60 wiadomości/s
  na połączenie, 30 połączeń na IP, zdarzenie ≤ 24 KB (większe zamykają tylko to połączenie).
- Z tej chmurowej sesji nie ma SSH do VPS. Instaluje i aktualizuje go **sesja Claude uruchomiona przez SSH
  w aplikacji desktopowej** (repo prywatne → deploy key tylko do odczytu). Na VPS: `arena-aktualizuj`
  (robi `git pull` w `/opt/lazi` na gałęzi, na której stoi klon — **stoi na `master`**, sprawdzone 2026-09-28;
  gdyby stał na innej, przełącz: `git checkout master && git pull --ff-only`).
  Zmiana w `instaluj.sh` wymaga ponownego puszczenia skryptu instalacji
  (`bash serwer/instaluj.sh 96-62-223-169.sslip.io https://kacperlazarz.pl,https://www.kacperlazarz.pl`).
- Na VPS: użytkownik systemowy `arena`, usługa systemd `arena` (Node, port 127.0.0.1:8787, `MemoryMax=1G`,
  zapis tylko do `/var/lib/arena`), Caddy z certyfikatem Let's Encrypt, ufw (22/80/443), fail2ban,
  automatyczne aktualizacje. Diagnostyka: `systemctl status arena`, `journalctl -u arena|caddy`,
  `curl -s http://127.0.0.1:8787/zdrowie`. Kopie zrzutki: `ls /var/lib/arena/` (plus kopie dostawcy VPS).
- Zadania dla VPS dawaj użytkownikowi jako **gotowy prompt do wklejenia** w sesję SSH (co zrobić, co pokazać,
  „nie rób git push ani zmian w repo”). Sekrety (tokeny) tylko w jednej komendzie, nigdy w plikach.
- **Wdrożenie serwera z konsoli dostawcy** (telefon, bez SSH) — komendy po kolei, każda osobno:
  1. `git -C /opt/lazi status -sb | head -1` → `## master...origin/master`;
  2. `arena-aktualizuj` (restart = urwane partie, najlepiej gdy nikt nie gra);
  3. `git -C /opt/lazi log --oneline -1` → commit merge'a z GitHuba;
  4. `systemctl is-active arena` → `active`; `curl -s http://127.0.0.1:8787/zdrowie` → `{"ok":true,…}`;
  5. przy kłopotach `journalctl -u arena -n 30 --no-pager`. Z telefonu działa też `https://96-62-223-169.sslip.io/zdrowie`.
- Panel dostawcy ma **własną zaporę** (polityka DROP): SSH tylko z adresów na „Whitelist IP” (zmiana IP
  w domu = `Operation timed out`), porty 80 i 443 otwarte dla wszystkich (certyfikat i gracze).
  **Filtr AntyDDoS na regule 443 ma być „HTTPS (TLS)”**, nie „HTTP” — „HTTP” psuł połączenia TLS
  (certyfikat przez port 443 i `/zdrowie` z zewnątrz nie odpowiadały). Na porcie 80 filtr „HTTP” jest OK.
- Z tej chmurowej sesji nie da się połączyć z serwerem (proxy odrzuca adres) — stan VPS sprawdza użytkownik
  albo sesja SSH.
- `.vercelignore` wyklucza `serwer/` z publikacji na Vercelu.

### 3.1 Konta Areny i pokoje (od 4.6)
- **Arena jest tylko dla zalogowanych.** `serwer/konta.js`: nick (3–14 znaków, unikalny bez względu na wielkość
  liter) + hasło (min. 4), bez maila. Hasło tylko jako skrót `crypto.scrypt` z solą, token sesji = losowe 32 bajty,
  ważny 60 dni (użycie przedłuża), do 10 sesji na konto. Plik `KONTA_PLIK`, a bez niego obok zrzutki
  (`/var/lib/arena/konta.json`, prawa 600, codzienna kopia `konta-RRRR-MM-DD.json`, 14 dni). Bez żadnego
  z tych plików (testy) — tylko w pamięci.
- API (token zawsze w treści POST): `POST /api/konto/rejestracja|logowanie|ja|wyloguj|wyglad|wynik`
  (`wyglad` = `{kolor?, akcesorium?}`, od 4.7; `/kolor` zostaje jako alias),
  `GET /api/ranking` (top 50 po killach), `GET /api/pokoje`, `POST /api/pokoje` (nowy, opcjonalnie hasło),
  `POST /api/pokoje/wejdz` (hasło → `klucz`). Limity: 12 prób logowania/rejestracji na IP na minutę,
  6 nowych kont na IP na godzinę, 3 pokoje na konto, 40 pokoi z panelu.
- WebSocket Areny: `/ws?pokoj=ID&token=…[&klucz=…]` — bez ważnego tokenu 401, pokój na hasło bez klucza 403.
  Beacon `wyjdz` tak samo (`/api/arena?pokoj&token&klucz`). **Serwer wpisuje w każde zdarzenie z polem `id`
  id gracza z konta (`k-` + nick małymi, spacje → `_`) i nick w `dolacz`** (`przypnijKonto`) — nie da się
  grać za kogoś. `id` w zdarzeniach zawsze znaczy „nadawca”; nowe zdarzenie z innym znaczeniem `id` by się zepsuło.
- **Wynik partii** zgłasza przeglądarka (`/api/konto/wynik`: seed partii, kille ≤ 7, obrażenia, wygrana, rekord
  tury, nowe osiągnięcia); jedna partia (seed) liczy się raz, serwer pamięta 40 ostatnich. Wyjście w trakcie =
  `tylkoOsiagniecia`. Da się oszukać konsolą — przy żartobliwej stronie akceptujemy (jak minigierki).
- **Pokoje z panelu** (`opisy` w `serwer.js`) są w pamięci jak partie: nazwa, kto założył, skrót hasła, klucz.
  **Pusty znika po 30 s** (`PUSTY_POKOJ_MS`, `sprzatajPuste` co 5 s; od 4.10, dawniej 10 minut — lista zarastała, a puste
  liczyły się do limitu 3 aren na konto). Zniknięte id z panelu (`p-` + 8 hex) nie wraca jako pokój bez nazwy: WebSocket
  i `/api/pokoje/wejdz` dają 404. Klient przy błędzie sieci (`naBladSieci` → `sprawdzCzyArenaJest`) sprawdza arenę
  i przy 404 wraca do listy z komunikatem `#info-zniknela` (np. stary link, telefon wybudzony po dłuższej przerwie).
  Restart serwera kasuje wszystkie. **Od 4.7 nie ma domyślnej areny** (`glowny` nie
  jest już na liście) — gra się tylko w arenie, którą ktoś założył. Pokój bez opisu (`?pokoj=` z testów) jest
  publiczny i pojawia się na liście tylko, gdy ktoś w nim jest.
- **Akcesoria** (4.7; w 4.9 `lama` i `kilof` zastąpione przez `okulary` i `buzka` — nieznane id z konta serwer oddaje jako `null`): lista id w `AKCESORIA` w `serwer/konta.js` **i** w `gra/src/akcesoria.js` (test serwera
  pilnuje, że są równe). Konto trzyma `akcesorium`, `dolacz` niesie `akc` (serwer usuwa nieznane), ranking też.
  **Czapki za osiągnięcia** (4.7.1): `CZAPKI` (czapka → osiągnięcie albo `'*'`) w `konta.js` = `gra/src/czapki.js`,
  a `WSZYSTKIE_OSIAGNIECIA` w `konta.js` = lista z `gra/osiagniecia.js` (test pilnuje obu). `wolnoNosic(konto, id)`
  — bez osiągnięcia (dla korony: bez kompletu) serwer nie zapisze czapki i wytnie ją z `dolacz`. Użytkownik chciał
  jedną czapkę za wszystkie osiągnięcia; trzy dodatkowe zostały z odrzuconej wersji „czapka za każde”. Lista liczy graczy po połączeniach (nicki z kont), „trwa partia” = log od `nowa` i strzał/pas/stan
  w ostatnich 2 min.
- **Reset hasła** (nie ma maila): na VPS `cd /opt/lazi/serwer && node konto-haslo.mjs NICK 'NOWE_HASLO'`
  (jako root sam zatrzymuje i wznawia usługę — to urywa trwające partie).
- Wdrożenie zmian w kontach: strona (Vercel) i serwer (`arena-aktualizuj`) muszą wejść razem — nowa strona
  ze starym serwerem nie zaloguje (404), stara karta z nowym serwerem nie połączy się (401, trzeba przeładować).

**Otwarte sprawy po przenosinach (wdrożenie 4.1.1 = PR #20; stan na 2026-09-28)**
- Klon na VPS stoi na `master` (potwierdzone przy wdrożeniu 4.9). Druga migracja zrzutki („dogonienie” wpłat
  z chwili przełączenia) — prompt dostał użytkownik; nie wiadomo, czy zrobiona, zapytaj przy okazji.
- **Usunięcie Upstasha z Vercela** (Storage/Integrations + baza w panelu Upstash) — robi użytkownik.
  Adres bazy i token *tylko do odczytu* padły w czacie; po usunięciu bazy są martwe.
- Opcjonalnie ładniejszy adres serwera `arena.kacperlazarz.pl`: rekord DNS A → 96.62.223.169, ponowne
  `instaluj.sh` z nowym adresem, potem adres w czterech miejscach (wyżej) i wdrożenie.
- Ostatnie wdrożenia: 4.8 = PR #28 (bez zmian serwera), 4.9 = PR #29 + `arena-aktualizuj` 2026-09-28 (konsola dostawcy).
  **4.10 zmienia serwer** (puste areny po 30 s) — po merge'u potrzebne `arena-aktualizuj`.

---

## 4. Struktura repo

| Ścieżka | Co to jest |
|---|---|
| `index.html` | Strona główna: zrzutka. **Karty graczy z awatarami SVG i opisami są tu**, plus sprite z symbolami (`#vbuck`, `#srebrnik`, `#scutum`, `#obywatelka`, ikony surowców, `#battle-bus`, `#panorama`) i wspólnymi gradientami. Są tu też okno wpłaty (`#okno`), okno sezonu (`#okno-sezon`) i ekran zdobycia celu |
| `zrzutka/dane.js` | Kategorie (limity, teksty, `walcz`), gracze (cele, reakcje, zaczepki), odznaki (19), rangi — dane dla `app.js` |
| `zrzutka/app.js` | Logika strony: kategorie `#fortnite` / `#0ad`, suwak kwoty, wpłaty, liczniki, odznaki, profil, osiągnięcia z Areny, synchronizacja z serwerem (`SERWER`, na żywo przez `/zrzutka/ws`), sezony, Hall of Fame |
| `zrzutka/minigry.js`, `minigry.css` | Minigierki przed wpłatą: ramka i 4 gry (sekcja 5.3) |
| `zrzutka/sezon.css` | Plakietka „S2”, naklejka „Sezon 2” przy tytule, okno Hall of Fame |
| `zrzutka/baza.css`, `fortnite.css`, `zeroad.css`, `motyw.js` | Szkielet, dwa motywy (zmienne CSS `--c-*`, `--f-*`), ustawienie motywu przed malowaniem |
| `gra/` | **Arena GOATów** (sekcja 7) |
| `gra/osiagniecia.js` | Lista osiągnięć Areny (18) — klasyczny skrypt, czyta go gra i strona główna (zdobyte od 4.6 trzyma konto na serwerze) |
| `wersja.js` | Numer wersji + historia zmian (jedno źródło); znaczek `vX.Y` w rogu stron |
| `przejscie.js`, `przejscie.css` | Kurtyna **między stronami** zrzutka ↔ Arena (4.7.1): link z `data-przejscie="fortnite|zeroad|arena"` zasłania ekran jak kurtyna kategorii, cel leci w `sessionStorage['przejscie']`, nowa strona startuje zasłonięta i odsłania się (`PRZEJSCIE.zaslon/odslon`). Strona z `<html data-przejscie-czeka>` (Arena) odsłania się sama, gdy ma dane; inne po 0,35 s. Klasyczny skrypt w `<head>` obu stron |
| `zmiany/` | Strona „Co nowego” (rysuje historię z `wersja.js`) |
| `goat/` | Stara, ukryta strona „ŁAZI TO GOAT” — nie ruszać |
| `serwer/` | Serwer na VPS: `pokoj.js` (Arena), `zrzutka.js` (zrzutka w pliku), `konta.js` (konta Areny, 3.1), `gracze.js` (**lista graczy `GRACZE`, `SEZON`, limity wpłat**), `serwer.js` (HTTP + WebSocket, pokoje z panelu), `konto-haslo.mjs` (reset hasła), `migruj-zrzutke.mjs` (jednorazowo z Redisa), `test.mjs`, `instaluj.sh`, `INSTALACJA.md`; ma własne `package.json` (zależność `ws`) — to jedyne miejsce z npm |
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
| `arena:token` | Token sesji konta Areny (od 4.6) |
| `arena:akcesorium` | Akcesorium robala (4.7, kopia z konta; pusty napis = bez) |
| `arena:dzwiek`, `arena:muzyka` | `'0'` = wyciszone efekty / muzyka w Arenie (4.9) |
| `arena:nazwa`, `arena:kolor`, `arena:bron`, `arena:staty`, `arena:osiagniecia` | Arena. Od 4.6 `staty` i `osiagniecia` to **kopia z konta** (nadpisywana po zalogowaniu i po każdym wyniku, czyszczona przy wylogowaniu) — czytają je reguły osiągnięć i profil na zrzutce |
| `arena:stare-przeniesione` | `'1'` = dane sprzed kont już poszły do konta (tylko pierwsza rejestracja w przeglądarce je zabiera). `arena:id` z dawnych wersji nie jest już używane |

---

## 5. Zrzutka (strona główna)

### 5.1 Ogólnie
- Dwie kategorie: **Fortnite** (V-dolce) i **0 A.D.** (srebrniki), przełączane hashem `#fortnite` / `#0ad`
  z animacją kurtyny. Trzecia zakładka „Arena” to link do `gra/` z `data-przejscie="arena"` — ta sama kurtyna,
  tylko między stronami (`przejscie.js`); w pasku Areny Fortnite / 0 A.D. wracają tak samo.
- Motyw zmienia cały wygląd:
  - Fortnite: niebieski, żółte skośne przyciski, font Anton.
  - 0 A.D.: pergamin, pieczęcie, font Cinzel.
  - Nowe elementy stylujesz **zmiennymi motywu** (`--c-popup`, `--c-akcent`, `--c-kat-aktywna`,
    `--c-okno-tekst`, `--f-display`…), a nie kolorami na sztywno.
- Sumy są wspólne (serwer na VPS, nowe wpłaty przychodzą na żywo przez WebSocket; bez gniazda odświeżanie
  co 10 s). Odznaki, tytuły i profil są lokalne.
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
- Limit 2000 na wpłatę jest w **dwóch miejscach**: `maks` w `dane.js` i `GRACZE[kat].maks` w `serwer/gracze.js`.

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
- `serwer/gracze.js` ma `SEZON`. W pliku danych każdy sezon to osobny wpis (`sezony["1"]`, `sezony["2"]`);
  wpłaty idą do bieżącego, starsze zostają jako archiwum.
- `GET /api/zrzutka?sezon=1` oddaje archiwum z `Cache-Control: public, max-age=86400`.
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
  1. `serwer/gracze.js`: `SEZON = 3`, potem `arena-aktualizuj` na VPS (inaczej serwer zostanie w sezonie 2).
  2. `app.js`: ustaw `SEZON = 3`. Okno ma teraz na sztywno „sezon 1” (`KLUCZ_SEZON1`, `?sezon=1`,
     `KLUCZ_INTRO`, teksty w `index.html`), więc uogólnij je na „poprzedni sezon” i ustaw nowy klucz intro.
  3. Podmień teksty „Sezon 2” / „S2” / „Sezon II” w `index.html` (plakietki, naklejki, logo, okno).
  4. Wpis w `wersja.js` jako duża wersja (`x+1.0`).
  5. Test na lokalnym serwerze (`ZRZUTKA_PLIK` z danymi sezonu 2): nowy sezon od zera, okno pokazuje się raz.

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
  3. Id w `GRACZE` w `serwer/gracze.js`, inaczej serwer odrzuci wpłaty — i `arena-aktualizuj` na VPS.
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
| `src/sim.js` | Symulacja (bez DOM): robale (1–3 na gracza), fizyka, bronie, tury, skrzynki, miny i beczki, snapshoty, hash stanu |
| `src/terrain.js` | Generator mapy (seed → maska pikseli, szerokość 1536–4096, wysokość 1024 albo 1792 dla ekstremalnej, lawa od `h − 144`), kratery i mosty, punkty startu |
| `src/weapons.js` | Tabela broni (liczby, bez logiki) i kolejność na pasku |
| `src/rng.js` | `mulberry32`, szum, `hashNumbers`, `hashTekstu` |
| `src/protokol.js` | Protokół sieciowy (bez DOM) — kto ma turę, co jest kanoniczne, kto wyrzuca nieobecnych |
| `src/net.js` | WebSocket do serwera na VPS: log zdarzeń, ponowne łączenie z kursorem, obecność, zegar serwera, `sendBeacon` przy zamknięciu karty (POST `/api/arena` na VPS); `RUCH_CO` — podgląd ruchu co 100 ms |
| `src/konfig.js` | `SERWER_WS` — adres serwera Areny; lokalnie `?serwer=ws://127.0.0.1:8787/ws` do testów; `adresApi()` = HTTP tego serwera |
| `src/konto.js` | Konto (4.6): logowanie, rejestracja, `ja`, wygląd (`ustawWyglad`), wynik partii, pokoje, ranking (HTTP), kopia statystyk do `localStorage`, opisy błędów |
| `src/akcesoria.js` | Akcesoria robala (4.7, od 4.9: korona, okulary, buźka, hełm, wieniec): `PODSTAWOWE` (5, dla każdego) + `CZAPKI` = `AKCESORIA` (id, nazwa, gra, ikona, `rysuj(ctx, cx, cy, f, t)`, `tyl`, `zaGlowa`, `wys`), `odblokowane(a, zdobyte)`; sama grafika |
| `src/czapki.js` | Czapki za osiągnięcia (4.7.1): Korona Króla GOATów (`krol`, `osiagniecie: '*'` = wszystkie) i 3 czapki za pojedyncze (`irokez` ← masakra, `wulkan` ← lawa, `rogi` ← owca); pola `wys` (o ile podnieść pasek życia i nick) i opcjonalnie `zaGlowa` (część za ciałem, np. promienie korony) |
| `src/main.js` | Logowanie, ekran ładowania, ekran Areny (profil, wygląd, ranking, osiągnięcia + areny/lobby), lobby (tryb, drużyny, GOTOWY), HUD, kamera, pętla gry, zdarzenia → efekty, statystyki, osiągnięcia (UI) |
| `src/druzyny.js` | Nazwy i kolory drużyn (`DRUZYNY`), tryby lobby (`TRYBY`) |
| `src/ustawienia.js` | Ustawienia partii z lobby (`USTAWIENIA`: czas, hp, robale, mapa, rozmiar, bronie, zrzuty, pulapki, wiatr, lawaOd, lawaTempo; pozycje z `opcje` = lista, z `liczba` = wpisywane), `normalizuj`, `zLiczby`, `opisZmian` |
| `src/emotki.js` | Emotki i tańce (`EMOTKI`: 5 emotek + 7 tańców), czasy i limit wysyłania |
| `src/dzwieki.js` | Dźwięki i muzyka (4.9, muzyka od 4.10): Web Audio bez plików, `graj(nazwa, opcje)` pod zdarzenia w `obsluzZdarzenia`; instrumenty muzyki `BRZMIENIA` (fale, filtr, obwiednia, vibrato) i `PERKUSJA`; `muzykaStart/Stop` gra utwory z `muzyka.js` po kolei (losowa kolejność bez powtórki pod rząd, 1,5 s ciszy między nimi, nuty planowane 0,3 s do przodu), `przyZmianieUtworu` (nazwa w banerze i w tytule 🎵), ponowne włączenie muzyki = następny utwór; wyciszanie `arena:dzwiek` / `arena:muzyka`; kontekst budzi pierwszy gest, karta w tle go usypia; `_renderujOffline(id, sek)` tylko do testów (szczyt i RMS) |
| `src/muzyka.js` | Muzyka (4.10): 7 utworów „zapisanych nutami” w `UTWORY` (tonacja, tempo, styl, części z akordami co pół taktu, forma np. W A A* B A C B* K). `zbudujUtwor` składa z tego kroki szesnastkowe `[instrument, midi, długość, głośność]`: melodia z motywem, który wraca (m), odpowiedzią (o), kadencją (k) i wypełnieniem (p), wariant `X*` = nowe odpowiedzi + drugi głos tercję niżej; bas, akompaniament, arpeggio i bębny ze wzorów stylu (`STYLE`, `BASY`, `AKOMP`, `BEBNY`). Stały seed, bez Web Audio (testowalne w Node) |
| `src/ekwipunek.js` | Ekwipunek broni jak w Worms Armageddon: rzędy (`GRUPY`), ikony SVG broni, otwieranie/zamykanie |
| `src/input.js` | Klawiatura, przyciski dotykowe, przeciąganie/szczypanie (dwa palce = zoom + przesuwanie), PPM/Q = ekwipunek, E emotki, R obrót mostu, M cała mapa, P / środkowy przycisk = ping |
| `src/render.js`, `src/fx.js` | Grafika (tu wolno trygonometrię i `Math.random`); w `render.js` też kamera, minimapa, pingi, nagrobki, miny i beczki, skrzynki, podgląd robala (`rysujPodgladRobala`, `mini` = kafelek akcesorium) i scena ekranu ładowania (`rysujSceneLadowania`) |
| `src/osiagniecia-reguly.js` | Reguły osiągnięć — czyste funkcje |
| `test/sim.test.mjs`, `test/protokol.test.mjs` | Testy w Node (95 i 23) |

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
  - Od 4.3 mapy „szalone”: relief do 660 px (szczyty nie wyżej niż y=110), szum dużej skali `n3` (wielkie nawisy),
    2–7 **pięter** (długie, pochylone i poszarpane jaskinie jedna nad drugą), **kominy** (pionowe szyby między
    piętrami), 1–3 wielkie hale, więcej wiszących skał. Generowanie ok. 250 ms (raz na partię, potem kopia).
    Testy broni, które zależą od kształtu mapy, czyszczą teren (`polka`, `otworzNiebo` w `sim.test.mjs`).
  - Kopia bazowej maski jest cache'owana (klucz: seed + szerokość + styl ekstremalny).
  - **Od 4.5 szerokość świata jest zmienna**: `createTerrain(seed, { szer, styl })`, teren niesie `t.w` i `t.opcje`
    (do `rebuild(seed, kratery, t.opcje)`). `SZEROKOSCI` = mala 1536 / normalna 2048 / duza 3072 / ogromna 4096;
    wysokość zostaje 1024 (poza ekstremalną, niżej). Wszędzie `t.w` / `state.terrain.w` zamiast `WORLD_W` (to tylko domyślna szerokość);
    render bierze szerokość z `buildTerrain` (`swiatW` dla kamery i lawy). Na szerszej mapie profil jest
    rozciągnięty, a liczba pięter/komór/skał rośnie proporcjonalnie (`ile`).
  - **Styl `ekstremalna`** (4.5) nie jest w losowaniu z seeda (`stylMapy` zwraca tylko 4 style) — przychodzi
    z ustawień (`ust.mapa`) przez `createGame` → `createTerrain(…, { styl })`. Wysoka bryła od brzegu do brzegu,
    9–12 wąskich pięter, 6–8 kominów i 7–10 ukośnych tuneli. Od 4.5.1 profil łączy wszystkie style: strefy
    (`strefy`, szum 1D) mieszają góry i masyw, do tego `iglice` (prawie pod sufit, powierzchnia min. y=45),
    `wawozy` do lawy i `przerwy` jak w archipelagu (z wiszącą skałą nad każdą); pas y < 36 jest zawsze pusty
    (przerzut górą). Losowania tych elementów są tylko w gałęzi ekstremalnej — zwykłe mapy z seeda się nie zmieniły.
  - **Od 4.8 wysokość też jest zmienna**: ekstremalna ma `WYS_EKSTREMALNA` = 1792 (×1,75), zwykłe 1024. Teren niesie
    `t.h` i `t.lava0` (poziom lawy na start = `h − 144`); wszędzie `t.h` / `t.lava0` zamiast `WORLD_H` / `LAVA_Y`
    (w `render.js` `swiatH`, `swiatLawa`, `rozmiarSwiata()`). Liczba pięter, kominów i tuneli i wysokość reliefu rosną z `h`.
- `spawnPoints` nigdy nie stawia robala w powietrzu. Gdy w wycinku gracza nie ma gruntu (przerwa
  między wyspami), szuka gruntu na całej mapie (`zapasowyStart`). Test sprawdza to na wielu seedach.

### Wejście do Areny (4.6, układ od 4.7)
- Ekrany (`EKRANY`, `pokazEkran` w `main.js`): `#ekran-logowanie` (zakładki Zaloguj/Załóż konto; pierwszy raz
  w przeglądarce otwiera się na zakładaniu) → `#ekran-ladowanie` → `#ekran-arena` (+ `#ekran-koniec` po partii).
  Od 4.7.1 z zapamiętanym tokenem **nie ma ekranu ładowania**: `start()` trzyma kurtynę Areny (`przejscie.js`,
  także przy wejściu prosto z adresu — min. 0,7 s), pobiera konto, areny i ranking, potem ją odsłania.
  Scena ładowania jest tylko po zalogowaniu formularzem. 401 = logowanie, brak sieci = scena z komunikatem
  i „Spróbuj jeszcze raz” (`pokazBladStartu`).
- **Pasek `#nawigacja`** (Fortnite → `/#fortnite`, 0 A.D. → `/#0ad`, Arena) jest jeden: `pokazEkran` wkłada go
  na początek ekranu logowania albo Areny (sticky), w trakcie partii i na ładowaniu jest schowany. Po prawej
  kropka w kolorze robala, nick i „Wyloguj”.
- **Ekran ładowania**: pełnoekranowe płótno `#ladowanie-scena` (`R.rysujSceneLadowania`: wyspy nad lawą, robal
  gracza z akcesorium strzela z bazooki, skrzynka na spadochronie), pasek z procentami, żarty (`TEKSTY_LADOWANIA`)
  i losowa porada (`PORADY`). `ladowanie(zadanie, nad)` trwa min. 1,8 s.
- **Ekran Areny** (`.arena-uklad`): lewa kolumna `.kolumna-lewa` (~65%) = profil (robal, nick, ranga z `RANGI`,
  6 statystyk), wygląd (paleta kolorów i 6 kafelków akcesoriów — zawsze widoczne, `zmienWyglad` zapisuje na koncie
  i ponawia `dolacz`, gdy jestem w lobby), ranking killi i osiągnięcia obok siebie; prawa `.karta-prawa` (~35%,
  sticky) = `#widok-pokoje` (lista aren, pusty stan, formularz nowej areny) albo `#widok-lobby` (dawne lobby,
  te same id elementów). `pokazWidok(lobby)`, `wLobby()` = lobby na ekranie (z tego korzystają `odswiezLobby`
  i interwał). Poniżej 900 px jedna kolumna: `.kolumna-lewa { display: contents }` + `order` (profil, areny/lobby,
  wygląd, ranking, osiągnięcia).
- `polaczZPokojem(id, klucz, nazwa)` tworzy `createNet({ pokoj, token, klucz })` i ustawia `?pokoj=` w adresie
  (odświeżenie strony wraca do areny, link działa jak zaproszenie; arena na hasło otwiera pole hasła na liście).
  „← Areny” w lobby = `opuscPokoj()` (`wyjdz`, `net.stop()`, zerowanie stanu lobby). `mojeId` = id konta.
  Po partii „Wracam do lobby” → `otworzArene()` z lobby tej samej areny.
- **Akcesoria w grze**: `nowa.gracze[].akc` → `akcesoriaPartii()` (mapa id → akcesorium) → `R.draw(…, { akcesoria })`
  → `drawWorm` (`o.akc`; `tyl` rysuje przed ciałem, reszta po oczach; pasek HP i nick 5 px wyżej). Poza symulacją
  i hashem, więc nie rusza determinizmu ani `WERSJA`.
- Koniec partii: `wyslijWynikPartii` (kille = `partia.os.fragi`), odpowiedź nadpisuje kopię w `localStorage`.

### Protokół tury
- Wspólny log zdarzeń na serwerze (pokój). Pierwszy `strzal`/`pas` danej tury jest **kanoniczny**.
- Strzał niesie pełny stan robali, kratery, skrzynki i (od 4.9) miny i beczki z chwili strzału oraz wektor startowy.
  Pas niesie robale, kratery, skrzynki i pułapki.
- Po **każdym** strzale jest faza `odwrot`: **5 s ruchu** (`ODWROT_S`, `ODWROT_KROKI` = 600 kroków).
  - **Od 4.2 na żywo**: strzał idzie do sieci od razu (`releaseFire` wkłada akcję do `akcjeDoWyslania`),
    a strzelec nagrywa wciśnięcia (`odwrotNagranie`) i co `ODWROT_CO` (120 ms) wysyła paczkę
    `{t:'odwrot', nr, id, od, b: RLE, koniec?}` (`wyslijOdwrot` w `protokol.js`).
  - `zloz` składa paczki w `p.odwroty.get(nr)` ciągiem po `od` (paczka z przyszłości czeka w `czeka`,
    paczka przed strzałem w `paczkiPrzed`, duplikaty odpadają). Paczki przyjmuje też dla tury już zamkniętej
    stanem — odbiorca może jeszcze grać jej ucieczkę.
  - Odbiorca (`klatka`) dopisuje kroki do `odwrotPlan` (`S.dopiszOdwrot`) i robi krok tylko wtedy, gdy zna
    wciśnięcie (`S.czekaNaOdwrot`). Trzyma zapas `ODWROT_BUFOR` (14 kroków ≈ 0,12 s), przy dużym zapasie
    gra ×1,25. W E2E widzowie są ok. 0,15 s za strzelcem (test „ucieczka na żywo” pilnuje < 0,8 s).
  - Strzelec wysyła od potwierdzonego w logu miejsca; brak postępu przez `ODWROT_PONOW` (1,5 s) = powtórka.
  - Strzelec zniknie w trakcie (4 s bez paczki, wyszedł, brak sieci) → jego **zastępca** (najmniejsze id
    bez autora, `jestemGospodarzem(…, bez)`) domyka ucieczkę `{t:'odwrot', za, koniec}`: reszta kroków = stoi.
    Autor, który wróci, przesymulowuje turę z kanonem. Ten sam zastępca publikuje stan zastępczy.
  - Log rośnie o ~40 paczek na turę, dlatego serwer ma `MAX_ZDARZEN` = 20 000.
- Turę zamyka `stan` (snapshot) policzony z kanonicznej akcji. Wszyscy, autor też, go przyjmują.
- Gospodarz gry (najmniejsze id wśród połączonych uczestników):
  - oddaje tury nieobecnych (odszedł / brak sieci 15 s / czas);
  - publikuje stan zastępczy.
  - Po ~90 s bez sieci gracz wylatuje.
- **Lobby (od 4.2, `WERSJA` = 2 w `protokol.js`)**:
  - Do `MAX_GRACZY` = 8 obecnych (kolejność wejścia) gra, reszta czeka (`widzowie`).
  - **Gospodarz lobby** (👑) to obecny gracz, który dołączył najwcześniej. Ustawia **tryb**: `{t:'tryb', druzyny}`
    z `TRYBY` = 0 (każdy na każdego), 2, 3, 4 (`druzyny.js`: nazwy i kolory drużyn).
  - Pojemność drużyny = ⌈8 / liczba drużyn⌉ (2→4, 3→3, 4→2). `P.rozstaw(p, jest)` liczy układ z obecnych:
    każdy trzyma zapisaną drużynę, jeśli jest w niej miejsce (pierwszeństwo: wcześniejszy `druzynaNr` =
    pozycja zdarzenia w logu), reszta do najmniej licznej (remis → z hasha id, tak samo u wszystkich).
    Klient utrwala swój przydział `{t:'druzyna', kto, d, auto:1}`.
  - Przejście do wolnego miejsca / przeniesienie przez gospodarza: `{t:'druzyna', kto, d}`; zamiana:
    `{t:'zamien', a, b, da, db}` (drużyny z ekranu gospodarza).
  - **Start**: każdy `{t:'gotowy', tak}`; gdy `gotowiDoStartu` (2+ graczy, wszyscy gotowi, w drużynach
    2+ niepuste drużyny), gospodarz publikuje `odliczanie` (`ODLICZANIE_S` = 5 s, z `v: 2` — wpisy bez
    wersji są pomijane). Zmiana trybu/drużyn cofa gotowość wszystkich, nowy gracz i wyjście kasują odliczanie.
  - `nowa` niesie `gracze` z polem `druzyna` i `druzyny` (tryb); po partii lobby pamięta drużyny.
  - Lobby rysuje się tylko przy zmianie (`podpisLobby`), bo przebudowa co 0,5 s gubiła stuknięcia.
  - Gracz ze starą wersją (`v` < `WERSJA`) ma w lobby znaczek „STARA WERSJA” i **blokuje start**
    (`gotowiDoStartu` wymaga `v >= WERSJA`), bo nie zna ustawień partii i rozjechałby się.
  - Partię (`nowa`) zakłada gospodarz lobby; inni próbują dopiero 2,5 s po terminie (gdy gospodarz zniknął).
  - **Start bez GOTOWY (4.9, `WERSJA` = 7)**: gospodarz ma `#btn-start-teraz`, gdy `P.moznaWymusic(roz)` (jak `gotowiDoStartu`, tylko bez gotowości) — publikuje `odliczanie` z `wymus: 1`, `zloz` ustawia `p.odliczanieWymus` (cofnięcie gotowości go nie kasuje, nowy gracz i wyjście tak). W `odswiezLobby` `gotowi` = gotowi albo wymuszone odliczanie.
- **Lobby od 4.3 (`WERSJA` = 3)** — gospodarz dodatkowo:
  - **Ustawienia partii** `{t:'ustaw', klucz, w}` / `{t:'ustaw', domyslne:1}` (tabela w `ustawienia.js`,
    walidacja `poprawna`), cofają gotowość. `p.ustawienia` = lobby, `nowa.ustawienia` → `p.ustawieniaGry`
    i `p.czasTury` (termin tury, pas „za czas”, porzucenie partii liczą się z niego, nie z `S.TURN_TIME`).
    Symulacja dostaje je jako `createGame(…, { ustawienia })` → `state.ust` (stałe przez partię, kopiowane
    w `stanPoTurze`); brak = standard, więc stare partie i testy grają jak dawniej.
  - **Mapa** nie leci osobno: gospodarz losuje seed, aż `stylMapy(seed)` (`terrain.js`) da wybrany styl.
  - **Bronie** (od 4.3.1 tylko dwa zestawy): `startowaAmunicja(zestaw)` — `pelny` (normalne limity, kij 0)
    albo `szalony` (pusta amunicja = wszystko bez limitu, kij też), wtedy zrzuty to same apteczki (`zapasyDla`).
    Stare wartości (`klasyka`, `podwojny`) `normalizuj` zamienia na `pelny`.
  - **Lawa**: od 4.5 `lawaOd` = od której rundy (wpisywane, 0 = nigdy, standard 6; w 4.4 był klucz `lawa`),
    `lawaTempo` = px na turę (6/12/24/40).
  - **Wpisywane liczby (4.5, `WERSJA` = 5)**: `czas` 10–120 s, `hp` 10–500, `lawaOd` 0–99 — `<input type=number>`,
    wartość przycina `U.zLiczby`, serwer i `zloz` przyjmują tylko liczby całkowite z zakresu (`poprawna`).
    Dalej: `mapa` (+ `ekstremalna`), `rozmiar` (mala/normalna/duza/ogromna). `LAWA_MIN` = 40 (dawniej 260 — na wysokich mapach
    lawa nie dochodziła do szczytów).
  - **Wyrzuć** `{t:'wyrzuc', kto}` (trafia do `p.wyrzuceni`, nie zgłasza się sam, wraca przyciskiem
    „Wracam do lobby” = `dolacz`), **oddaj koronę** `{t:'korona', kto}` (gracz na początek `wLobby`),
    **losuj drużyny** `{t:'sklad', d:{id: drużyna}}`. W UI: stuknięcie gracza → pasek `#lobby-akcje`.
  - Pola ustawień (`<select>`) buduje się raz i tylko podmienia wartości — przebudowa zamykałaby listę pod palcem.
  - W trakcie trwającej partii gospodarz niczego nie zmienia (`steruje` w `odswiezLobby`).
- **Podgląd na żywo (`ruch`, co `RUCH_CO`)** niesie od 4.3 oprócz pozycji/celownika/mocy/broni (`b`) także
  życie `h`, zapas wybranej broni `z` i ostatnie ≤ 4 zdarzenia tury `e: [[nr, 'o'|'d'|'s', x, y, …]]`
  (upadek, śmierć, skrzynka z `id`) — `zbierzEfekty` w `protokol.js`, tylko przed strzałem, bo ucieczkę widz
  symuluje sam. Świeże zdarzenie wysyła podgląd bez czekania na odstęp. Widz (`pokazEfekty` w `main.js`) pokazuje
  każde raz (po numerze), trzyma `widok.hp`/`widok.zapas`, chowa zebrane skrzynki (`zebraneSkrzynki` w `R.draw`),
  a przycisk broni na dole pokazuje broń gracza z turą i jego nick (`cudzaBron`). Limit `ruch` na serwerze: 600 B.
  Gracz partii widzi u przeciwnika tylko broń (bez zapasu); **obserwator** (`rg.obserwator`) także zapas i w ekwipunku
  cały plecak gracza z turą (`ruch.a` = amunicja, tytuł „Ekwipunek: nick”).
- **Emotki i tańce (4.4, `emotki.js`)**: zdarzenie w logu `{t:'emotka', id, e}` — `zloz` go nie zna, więc nie
  rusza protokołu ani symulacji. Wysyła żywy uczestnik partii (chmurka `#btn-emotki` albo klawisz E, także
  w cudzej turze), najwyżej co `EMOTKA_CO` (2,5 s). `main.js` czyta log od `emotkiIndeks`, pokazuje tylko
  świeże (≤ 6 s zegara serwera), `R.draw` dostaje `emotki` (dymek nad głową, taniec = przesunięcie i obrót
  rysunku w `drawWorm`). Panel `#emotki-panel` ma `pointer-events: auto` (HUD ma `none`). Od 4.5 przycisk 💬
  stoi obok broni na dole (`.rzad-broni` z `#btn-bron`, `#btn-obrot`, `#btn-emotki`), panel wisi tuż nad nim.
- **Pingi (4.9)**: `{t:'ping', id, x, y}` w logu — jak emotka, `zloz` go nie zna. Wysyła każdy z partią na ekranie (także obserwator): przycisk 📍 `#btn-ping` włącza `trybPingu` (następne stuknięcie w planszę albo minimapę), klawisz **P** (pozycja myszy) i środkowy przycisk myszy (`onPing`/`trybPingu` w `input.js`), najwyżej co 0,9 s. `czytajEmotki` czyta też pingi (`dodajPing`, świeże ≤ 5 s, jeden na gracza), `R.draw` dostaje `pingi` (pinezka w kolorze gracza, rozmiar niezależny od zoomu, strzałka przy krawędzi, gdy poza kadrem), minimapa też.
- **Obserwatorzy**: oczko 👁 z liczbą w HUD (`#obserwatorzy`) = obecni w pokoju spoza partii (albo po wyjściu).
- **Kolory**: gracz wybiera kolor robala w panelu Areny (`PALETA`/`KOLORY` w `main.js`, 12 kolorów, zapis na koncie
  i w `arena:kolor`), kolor leci w `dolacz`. Przy kolizji `rozdzielKolory` zostawia go temu, kto dołączył wcześniej, reszta
  dostaje pierwszy wolny (lobby mówi o tym graczowi). Nick nad robalem jest w kolorze robala, a w drużynach
  w kolorze drużyny (`kolorNicku` w `render.js`).
- Zamknięcie karty wysyła `sendBeacon` z `wyjdz` (text/plain). Przycisk „Opuść grę” robi to samo.

### Rozgrywka
- **Sterowanie**:
  - **A/D** ruch, **Spacja** skok, **W/S** lub mysz celowanie, **F/Enter** (przytrzymaj) strzał.
  - **1–0**, **-**, **=**, **[**, **]**, **\\** wybierają broń (kolejność `WEAPON_ORDER`).
  - **E** emotki, **R** obrót mostu, **M** cała mapa, **P** albo środkowy przycisk myszy = ping.
  - **Ekwipunek** (`ekwipunek.js`): przycisk z aktualną bronią na dole HUD-u, **Q** albo **prawy przycisk
    myszy** otwiera siatkę broni w rzędach (Rakiety, Granaty, Na wroga, Sprzęt; nowa broń bez rzędu trafia
    do „Inne”). Wybór albo stuknięcie obok (`#ekw-tlo`) zamyka; Escape też. Widz może wybrać broń na swoją turę.
  - Na telefonie: przyciski dotykowe, celowanie palcem, szczypanie = zoom. Lewa grupa to ◀ ▶, prawa to
    celownik ▲▼ i **SKOK nad OGNIA**. W czasie ucieczki (`body.ucieczka`) znika celownik i OGNIA, skok zostaje.
- W powietrzu da się skręcać (`POWIETRZE_*` w `sim.js`), ale nie da się przebić odrzutu.
- Skok: `JUMP_VY` = −195 (od 4.3.1, dawniej −235 — ok. 70% wysokości), `JUMP_VX` = 118.
- **Drużyny** (`createGame(…, { druzyny: true })`, robal ma `druzyna`; bez trybu drużyna = numer gracza):
  - `swoj(state, w, ownerId)`: kolega z drużyny działającego (albo właściciela pocisku) — wybuch, kij
    i strzelba go nie ranią i nie odrzucają, pociski/owca/wiertło przez niego przelatują. Siebie ranisz.
  - `nextTurn`: na zmianę drużynami (kolejność drużyn i graczy z potasowanej `order`), w drużynie kolejny
    żywy po `state.ostatni[druzyna]` (jest w snapshocie). W trybie każdy na każdego = dawne „następny żywy”.
  - Koniec, gdy żyje jedna drużyna; `winner` = któryś żywy z niej. HUD: nagłówki drużyn z paskiem
    życia (`.druzyna-hud`), ekran końca „WYGRYWACIE!” / „WYGRYWAJĄ …”; osiągnięcia liczą wygraną drużyny.
- **Kilka robali na gracza (4.8, ustawienie `robale` 1–3, `WERSJA` = 6)**: robal ma `gracz` (id gracza) i `nick`;
  pierwszy robal ma id gracza, kolejne `id#2`, `id#3`, `name` = „Nick 2”. `kolejnoscRobali` = gracze potasowani jak
  `kolejnoscTur`, potem fala pierwszych robali, drugich… (przy 1 robalu dokładnie dawna kolejka i dawne punkty startu).
  `nextTurn` bez zmian: drużyny na zmianę, w drużynie następny żywy z kolejki, czyli gracze na zmianę, każdy kolejnym robalem.
  **Protokół zna tylko graczy**: `snapshot.aktywny`, `winner`, `pokoj.aktywny` = id gracza (`S.wlasciciel(w)`),
  `usunGraczy` usuwa wszystkie robale gracza. Amunicja wspólna (`wspolnaAmunicja` kopiuje po strzale i skrzynce).
  W UI „mój robal” = `mojRobal(w)` w `main.js`; akcesoria, emotki i „brak sieci” w `render.js` po `w.gracz`.
  Reguły osiągnięć dostają `ctx.gracz(idRobala)`.
- Tura trwa domyślnie 30 s (`TURN_TIME`), lawa podnosi się po 6 rundach (`LAWA_PO_RUNDACH`, nagła śmierć) —
  w partii obowiązuje `state.ust` (ustawienia gospodarza: czas, hp, zrzuty %, wiatr ×0/1/1,7, lawa albo nigdy).

**Bronie** (`weapons.js`, kolejność = klawisze)
| Klawisz | Broń | Rodzaj | Amunicja | Uwagi |
|---|---|---|---|---|
| 1 | Bazooka | pocisk | ∞ | wiatr, wybuch przy kontakcie (4.3: prędkość 882, zasięg ×1,5; wiatr ×1,35 u wszystkich) |
| 2 | Granat | odbijany | ∞ | lont; 4.5: prędkość 820 (kasetówka 790, Święty GOAT 720) |
| 3 | Strzelba | hitscan | ∞ | |
| 4 | Kasetówka | odbijany | 2 | rozpada się na odłamki |
| 5 | Dynamit | podkładany | 2 | lont 6 s, ucieczka |
| 6 | Nalot | celowany | 1 | rakiety z nieba; od 4.8 start rakiety przesunięty o dryf policzony z wysokości celu (lot ukośny + wiatr, tylko `sqrt`), więc trafia też wysoko; od 4.9 start z wysokości 1,5× mapy (`y0 = −h/2 − 40 − 22·i`) |
| 7 | Koza (id `owca`) | owca | 1 | biega, przeskakuje przeszkody, wybucha przy wrogu; od 4.3.1 rysowana jako koza (render + ikona), id zostaje |
| 8 | Kij | kij | **0** | tylko ze skrzynek (co 3. „zapas”), dmg 15, odrzut 360 |
| 9 | Teleport | celowany | 1 | |
| 0 | Blitzkrieg | salwa | 2 | 3 rakietki wachlarzem |
| - | Wiertło | wiertło | 2 | jedzie prosto bez grawitacji, co 8 kroków `carve` → tunel (zdarzenie `wiercenie` przemalowuje teren), na końcu mały wybuch |
| = | Most | celowany | 3 | belka 90×7 px, do 260 px od robala, nie na robalu (`powodBrakuMostu`) |
| [ | Święty GOAT | odbijany | 1 | jak granat, lont 3,5 s, promień 118 (największy), dmg 90, odrzut 480; napis „ALLELUJA!” przy wybuchu r ≥ 100 |
| \\ | Railgun | railgun | 1 | 4.9: `strzalRailgun` — laser po prostej od `start` (wektor od strzelca) aż za mapę, co 2 px; przebija skałę (terenu nie rusza) i każdego robala (poza swoimi w drużynie), 75 obrażeń każdemu raz, odrzut 150; zdarzenie `railgun` (x0,y0,x1,y1,trafieni) → `emitLaser` w `fx.js` |
| ] | Lina ninja | lina (`narzedzie`) | 5 | nie strzał: `linaPrzelacz` (OGNIA/F zaczepia i puszcza, SKOK puszcza), `krokLiny` = wahadło (tylko sqrt) |

- **Lina ninja (4.4)**: stan `w.lina = {x, y, dl}` tylko u gracza z turą, jak chodzenie — nie ma go w `stanRobali`,
  `ustawRobale`/`applyPas`/`rozpocznijTure`/`releaseFire` go zerują, więc w strzale i pasie lina jest puszczona.
  Hak szuka skały od 26 px do `zasieg` (420) po celowniku (trygonometria u gracza z turą, jak `obliczStart`).
  `mozeStrzelic` odrzuca `narzedzie`, więc lina nigdy nie jest akcją `strzal`; w `input.js` OGNIA z liną woła `onLina`.
  Widzowie dostają hak w podglądzie `ruch.l` i rysują linę (`widok.lina`). Bot testów i test „odbiorca odtwarza
  strzał” pomijają narzędzia. Klawisze `[` `]` = 13. i 14. broń; rzędy ekwipunku mają 4 kolumny.

- **Obrót mostu (4.5)**: R albo ⟳ (`#btn-obrot`) → `S.obrocMost` (`state.mostObrot` 0–7, co 22,5°, tylko lokalnie);
  w akcji leci `cel.k`, w kraterach `r = -1 - k`. Kierunki to stała tabela `MOST_KIERUNKI` (bez trygonometrii),
  `wMoscie` sprawdza punkt w belce (też kolizja z robalem w `powodBrakuMostu`). k = 0 to dawny poziomy most
  (górna krawędź w punkcie celu), obrócony ma środek w punkcie celu. Podgląd `ruch.o`.
- **Most w terenie**: siedzi na liście kraterów jako `{x, y, r: -1}` (`carve` z ujemnym r uruchamia `zbudujMost`),
  więc `rebuild()` odtwarza go w tej samej kolejności co wybuchy. W masce ma wartość **2** (`solidAt`
  sprawdza `!== 0`, render maluje 2 jako stalowy dźwigar). **Nie zakładaj, że maska ma tylko 0/1.**
- **Miny i beczki (4.9)** (`state.pulapki`: `{id, typ: 'mina'|'beczka', x, y, lont}`, `lont` = −1 spokój, inaczej kroki do wybuchu):
  - Rozstawia je `rozstawPulapki` w `createGame` z seeda (ustawienie `pulapki` 0/1/2 → `PULAPKI_ILE`, liczba rośnie z szerokością mapy),
    na gruncie, ≥ 80 px od robali. Są w snapshocie, `stanPoTurze`, strzale i pasie (`stanPulapek`/`ustawPulapki`, pole `l` = lont),
    bo gracz z turą może odpalić minę chodząc, a odbiorca nie symuluje jego chodzenia.
  - `stepPulapki`: spadają jak skrzynki, toną w lawie; mina łapie żywego robala w pobliżu (`MINA_LONT` 1,1 s, zdarzenie `mina`),
    `explode` i railgun ustawiają lont beczkom (`BECZKA_LONT`) i minom — **bez rekurencji**, więc łańcuch idzie krok po kroku.
    Faza `settle` czeka, aż żaden lont się nie pali.
  - Rysunek `drawPulapka` (dioda miny miga, beczka drży przed wybuchem).
- **Płonąca ropa (4.10)** (`state.ogien`: `{x, y, vx, vy, t, zycie, wyp, grunt}`), jak napalm w Worms:
  - Wybuch beczki (`stepPulapki` → `rozlejOgien`) wyrzuca 14 kropli: prędkości ze stałej tabeli `OGIEN_KROPLE`
    + rozrzut z `Math.imul` id beczki (bez trygonometrii i `Math.random`), życie 2,5–3,25 s, najwyżej `OGIEN_MAX` = 56.
  - `stepOgien`: kropla leci (grawitacja, ¼ wiatru), ląduje (`y = floor − 1`, zostaje połowa `vx`) i płynie po ziemi
    (`findGround` 3 w górę / 6 w dół, tarcie 0,985, z krawędzi spada). Co `OGIEN_CO` (30 kroków) parzy robale obok
    (3 HP raz na krok, nie za każdą kroplę; `swoj` jak przy wybuchu) z podskokiem od ognia, `cause: 'ogien'`,
    i podpala beczkę obok. Co `OGIEN_WYPAL` (48 kroków) leżąca kropla wycina krater r = 6 (najwyżej 3 razy) —
    zwykły krater na liście, więc `rebuild` i sieć go znają; zdarzenie `wypalenie` → sadza w `render.js`.
  - Ogień żyje **tylko w bieżącej turze**: jest w strzale i w pasie (`stanOgnia` = tablice po 8 liczb, `ustawOgien`
    filtruje śmieci), w `stateHash`, ale nie w `snapshot`/`stanPoTurze`; `rozpocznijTure` i `zastosujSnapshot` go
    czyszczą. Faza `settle` czeka, aż zgaśnie (limit `SETTLE_MAX` zostaje). `WERSJA` = 8.
  - Grafika: `drawPlomien` (dwa języki ognia z poświatą, w locie mniejszy płomyk), iskry i dym `emitPlomien` w `fx.js`,
    okopcenie `dodajSadze`/`malujSadze` (osobna lista w rendererze, malowana `source-atop` po każdym przemalowaniu
    kolumn, czyszczona przy nowej mapie). Dźwięki `ogien` (zapłon przy beczce), `parzy`, `trzask` (co ≥ 140 ms).
- **Nagrobki (4.9)**: `drawNagrobek` w `render.js` dla `!alive && !odszedl`, pozycja tylko graficzna (`nagrobkiY`, opada do gruntu),
  bez nagrobka w lawie. Stan gry o nich nie wie.
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
  - **Od 4.8**: minimapa `#minimapa` (`R.rysujMinimape`, co 2. klatkę; stuknięcie/przeciągnięcie = kamera tam na 5 s),
    przycisk 🗺️ `#btn-mapa` i klawisz **M** = cała mapa (`przelaczPodgladMapy`), minimalny zoom = cała mapa między
    pasami HUD-u (`minZoomGracza`), dwa palce przesuwają widok także w mojej turze (`onPrzesun` w `input.js`).
  - **Od 4.9 kamera za pociskiem** (`ustawKamere`): cel = pozycja + prędkość × do 0,32 s (wyprzedzenie), zoom ×0,72–0,92
    zależnie od prędkości, `kamera.tempo` 7,5 (`updateCamera` używa `cam.tempo`, domyślnie 4,2). Po wybuchu `kameraWybuch`
    trzyma kadr 0,9 s (railgun: środek promienia, oddalenie 0,6), `trzymajWKadrze` wtedy nie ciągnie do robala.
  - `pasyHud` mierzy grupy przycisków dotykowych osobno: boczne (telefon poziomo) nie zabierają środka
    ekranu, tylko pilnują marginesu z boku (`pasy.bok`).
- Statystyki i osiągnięcia (18) od 4.6 są **na koncie** (serwer, `/api/konto/wynik`), `localStorage` ma tylko ich kopię.

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
  4. Id także w `WSZYSTKIE_OSIAGNIECIA` w `serwer/konta.js` (korona wymaga kompletu) + `arena-aktualizuj`.
- **Coś w stanie gry** (np. nowy obiekt jak skrzynki):
  1. Pole w `createGame`.
  2. Kopia w `snapshot` / `zastosujSnapshot` / `stanPoTurze`.
  3. W akcjach `strzal`/`pas`, jeśli gracz może to zmienić przed strzałem.
  4. Test „odbiorca = strzelec”.

### Wygląd Areny (stan 4.10)
- **Wygląd od 4.9**: robal bez ogonka, skrzynki (`drawSkrzynka`: wojskowa skrzynka z pasem i nabojami, apteczka z uchwytem i plusikami, poświata, spadochron w pasy), lawa z poświatą i bąblami, w tle (`drawTlo`) krwawy księżyc i łuna wulkanu. Tańce z obrotem (`obrot` w `drawWorm`) rysują nick i pasek osobno (`tylkoNapis`).
- Dźwięki i muzyka: `dzwieki.js` i `muzyka.js` (tabela plików wyżej). **Plików z muzyką nie ma**: z chmurowej sesji
  serwisy z darmową muzyką (freepd, opengameart, incompetech, archive.org, pixabay, FMA, bensound…) są zablokowane
  przez politykę sieci środowiska (proxy 403 — nie obchodzić). Gdyby właściciel chciał prawdziwe nagrania: dozwolone
  domeny w ustawieniach sieci środowiska albo pliki wrzucone przez niego do repo; potem odtwarzanie przez `<audio>`/
  `decodeAudioData` i CSP `media-src 'self'` w `gra/index.html`.
- **Nowy utwór**: wpis w `UTWORY` (`muzyka.js`) — styl z `STYLE`, akordy części, `forma`; nowy instrument = wpis w
  `BRZMIENIA` albo `PERKUSJA` (`dzwieki.js`), test sprawdza, że każdy użyty instrument ma brzmienie. Poziom głośności
  porównuj `_renderujOffline` (Playwright, `--autoplay-policy=no-user-gesture-required`): utwory mają RMS ok. 0,012–0,026.
- **Rogi prawdziwego GOATa** (4.10): `rogKozy` (oś Béziera, obrys = oś ± grubość, prążki, połysk) i `uchoKozy` w `czapki.js`;
  dwa rogi z czubka głowy zagięte do tyłu (dalszy ciemniejszy), `wys: 9`. Id `rogi` i osiągnięcie `owca` bez zmian.

### Plan rozwoju (stan na 2026-09-28)
Pierwotny plan „bliżej Worms Armageddon” z 2026-09-25 jest w większości zrobiony: dźwięki i muzyka, nagrobki,
drużyny, 1–3 robale na gracza, ustawienia partii, lista aren, ranking killi, emotki i tańce, miny i beczki,
lina ninja, Święty GOAT, railgun, płonąca ropa z beczek (4.10). Użytkownik (2026-09-28) powiedział, że kończą mu się pomysły — przy prośbie
„co jeszcze” proponuj z listy niżej (pokazana mu 2026-09-28), z rekomendacją i numerami do wyboru.
Każda większa rzecz to osobna wersja z testami i zrzutami; nowe dane „online” doklejaj do istniejących zdarzeń.

**Małe i efektowne (bez zmian zasad gry)**
- **Podsumowanie partii** na ekranie końca: najlepszy strzał, MVP, „Kamikaze”, „Pacyfista”, ile kto wpadł do lawy —
  liczone lokalnie ze zdarzeń (`obsluzZdarzenia` już zbiera obrażenia na turę).
- **Teksty robali** w dymkach przy trafieniu, śmierci i lawie (`emitTekst` w `fx.js`); z czapką postaci — teksty z `dane.js`.
- **Rewanż jednym przyciskiem** po partii (te same drużyny i ustawienia).
- **Powtórka najlepszego strzału** w zwolnionym tempie: `poczatekSnap` + kanoniczna akcja, przeliczone lokalnie.
- **Szybki czat** z gotowymi tekstami (jak emotki: zdarzenie w logu, `zloz` go nie zna). Slow-mo przy zabiciu.
- Podgląd wybuchu miny u widzów w czasie cudzej tury (dziś widać go dopiero przy strzale albo pasie) — np. nowy typ w `ruch.e`.
- **Czapki postaci ze zrzutki** jako akcesoria (rogi Kozaka, opaska PowPowa, karp, kapelusz Nolliego, galea Qubera…) —
  lista id w `AKCESORIA` klienta i serwera (3.1).

**Zawartość (zmienia symulację — test „odbiorca = strzelec”, podbicie `WERSJA`)**
- **Lont granatu 1–5 s** (wybór w ekwipunku, wartość w akcji `strzal`, `spawnProjectile` zamiast `weapon.fuse`).
- **Bronie ekipy**: Babcia Nolliego (wolna „owca”), Spartańskie kopnięcie („THIS IS SPARTA”, wariant kija),
  Szarża słoni Kozaka (trzy duże kozy), Full box PowPowa (4 belki wokół robala — pionowy wariant `zbudujMost`).
- **Klasyki WA**: bananowa bomba, rakieta samonaprowadzająca (skręt wektorem i `sqrt`, bez trygonometrii),
  moździerz, Uzi, trzęsienie ziemi, Armagedon (deszcz meteorów jak nalot).
- **Plecak odrzutowy, spadochron** (ruch lokalny przed strzałem jak lina; w ucieczce nie, bo nagranie RLE tego nie umie).
- **Skrzynka-pułapka** i skrzynka z losową super bronią. Broń „wybór robala” przy kilku robalach.
- **Nowe motywy map** (lód, pustynia, rzymskie ruiny, woda zamiast lawy): palety w `render.js`, kształty w `terrain.js`.
- Przy kolejnych broniach: F1–F4 przełączają broń w rzędzie ekwipunku (`GRUPY`); klawisze cyfr już się kończą.

**Większe**
- **Boty** (użytkownik pytał 2026-09-28, czy się da i czy to ciężkie; dostał odpowiedź z dwoma wariantami, czeka na wybór):
  - **trening offline** (`createGame(…, { sieciowa: false })`, bot liczy kilka strzałów na kopii stanu i wybiera
    najlepszy; poziomy: „bot Krayo” pudłuje, „bot Kozak” trafia) — średnio trudne, zero kosztu serwera;
  - **boty w lobby online** — trudniejsze: bot musi „mieszkać” u gospodarza (strzał bota publikuje gospodarz jako `za`,
    jak zastępca), a przy zmianie gospodarza przejąć go ktoś inny; do tego miejsce w lobby, drużyny i wynik bez konta.
- **Historia partii** w profilu (serwer, konto). Znajomi i zaproszenia.
- **Zrzutka ↔ Arena**: wygrana w Arenie daje odznakę albo bonus w minigierce, ranking killi na stronie zrzutki.
- **Nowe minigierki** (np. „Drop z Battle Busa”, „Oblężenie z taranem”) — kalibracja botem (5.4). Wydarzenie sezonu.
- **Szlif techniczny**: adres `arena.kacperlazarz.pl` (DNS + `instaluj.sh`), wydajność na słabych telefonach przy
  ogromnej mapie ekstremalnej, favicon i podgląd linku (Open Graph).

### Konta i panel Areny — co zostało z planu (2026-09-27)
Zrobione: konta, ekran ładowania, lista aren z hasłem albo bez, ranking killi, statystyki i osiągnięcia na koncie
(4.6), pasek nawigacji, panel + lobby na jednym ekranie, bez domyślnej areny, akcesoria (4.7). Konto jest tylko
dla Areny (zrzutka bez zmian, goście nie grają). Zostaje do decyzji: znajomi i zaproszenia, historia partii,
więcej akcesoriów (np. czapki postaci ze zrzutki), ewentualnie konto także w zrzutce i logowanie Google.

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
  - **4.1.1** Arena i zrzutka na własnym serwerze (VPS, WebSocket), koniec Redisa i `api/`
  - **4.2** ucieczka po strzale na żywo, lobby do 8 graczy, drużyny (tryb, GOTOWY, przenoszenie, zamiana)
  - **4.3** ustawienia partii u gospodarza, wyrzucanie, oddawanie korony, losowanie drużyn, szalone mapy, podgląd na żywo
  - **4.4** lina ninja, Święty GOAT, emotki i tańce, licznik obserwatorów, lawa od tury i jej tempo, dwa zestawy broni, koza zamiast owcy, niższy skok
  - **4.5** mapa ekstremalna, rozmiar mapy, wpisywane życie/czas/lawa, obracany most (R), dalszy rzut granatów
  - **4.5.1** ekstremalna = wszystkie style naraz, iglice pod niebo
  - **4.6** konta Areny (logowanie, statystyki i osiągnięcia na koncie), ekran ładowania, panel z GRAJ, pokoje na hasło, ranking killi
  - **4.7** pasek Fortnite/0 A.D./Arena w grze, panel + lobby na jednym ekranie, bez domyślnej areny, 5 akcesoriów robala, nowy ekran ładowania
  - **4.7.1** kurtyna przy przejściu zrzutka ↔ Arena, wejście na Arenę bez ekranu ładowania, Korona Króla GOATów za wszystkie osiągnięcia + 3 czapki
  - **4.8** 1–3 robale na gracza, wyższa mapa ekstremalna, celny nalot, minimapa i podgląd całej mapy
  - **4.9** railgun, miny i beczki, nagrobki, kamera za pociskiem, pingi, dźwięki i muzyczka, 5 nowych tańców, okulary i buźka zamiast lamy i kilofa, bez ogonków, nowe skrzynki i tło, start gospodarza bez GOTOWY
  - **4.10** płonąca ropa z beczek (parzy i wypala ziemię), 7 utworów muzyki zamiast jednej pętli, pusta arena znika po 30 s, nowe rogi GOATa

---

## 9. Testy i sprawdzanie

```
node gra/test/sim.test.mjs        # symulacja, bronie, determinizm, drużyny, ustawienia, skrzynki, spawny, osiągnięcia, kamera, lina, most obracany, rozmiar mapy, kilka robali, railgun, miny i beczki, ogień, muzyka (95)
node gra/test/protokol.test.mjs   # protokół: lag, rozłączenia, ucieczka na żywo, lobby, ustawienia, partie 2v2, z własnymi zasadami i z kilkoma robalami, start bez GOTOWY (23, ~35 s)
cd serwer && npm install && node test.mjs   # serwer na VPS: Arena (10) + konta, pokoje, akcesoria, czapki, puste areny (11) + zrzutka (7)
```
Obie muszą przejść przed pushem. Dodatkowo `node --check` na zmienionych plikach JS.
Test protokołu gra losowe partie. Zmiana listy broni zmienia ich przebieg — i każda zmiana symulacji też
(w 4.9 wyższy nalot skrócił partie i dwa testy dostały seed 17). Sprawdzanie przyczyny: tymczasowo cofnij zmianę
i puść test; do szukania seeda skopiuj test do pliku tymczasowego z filtrem nazw (`TYLKO`) i seedem z env, potem go usuń. Jeśli padnie test zależny od
długości partii (np. „za mało strzałów”), sprawdź przyczynę, zanim zmienisz seed. Rozjazd stanu to zawsze błąd.
Każda dodatkowa wiadomość klienta (np. więcej podglądów `ruch`) zużywa losowanie opóźnienia w atrapie i zmienia
przebieg partii. Test przerywany na numerze tury musi potem dać klientom chwilę (`dogon`), bo partia mogła
skończyć się właśnie wtedy — inaczej „różny stan” to tylko nieprzyjęty ostatni stan.

**E2E i zrzuty**
- Robimy je Playwrightem. Chromium jest w `/opt/pw-browsers`, moduł ładujesz przez
  `require(execSync('npm root -g') + '/playwright')`.
  - Na Windowsie (komputer Nolliego) nie ma tego środowiska: wystarczy `npm install playwright-core`
    w scratchpadzie i `chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })`
    — bez pobierania przeglądarek. Wbudowana przeglądarka aplikacji psuje zrzuty przewiniętej strony przy
    emulowanym rozmiarze ekranu, więc do zrzutów używaj Playwrighta.
  - Kilku graczy Areny = kilka kontekstów przeglądarki (osobny `localStorage`, więc osobne `arena:id`).
- Skrypty trzymaj w scratchpadzie, nie w repo.

- **Lokalny serwer zamiast atrapy**: prawdziwy `serwer/serwer.js` (po `npm install` w `serwer/`). Bez
  `ZRZUTKA_PLIK` trzyma zrzutkę w pamięci — restart = czysto. Dane do testów (np. sezon 1 do Hall of Fame)
  wstaw plikiem: `ZRZUTKA_PLIK=/tmp/z.json` z `{"sezony":{"1":{"sumy":{"fortnite:krayo":5400},"wplaty":[]}}}`.
- **Arena przez serwer WebSocket**: `ARENA_PORT=8787 node serwer/serwer.js` + `python3 -m http.server 8765`,
  gra pod `http://localhost:8765/gra/?serwer=ws://127.0.0.1:8787/ws&pokoj=test1` (dla każdego przebiegu nowy
  pokój — bez duchów w lobby). **Od 4.6 najpierw konto**: w świeżym kontekście otwiera się `#ekran-logowanie`
  na zakładce zakładania — `#input-nick`, `#input-haslo`, `#input-haslo2`, klik `#btn-konto`; z `?pokoj=` po
  ładowaniu od razu lobby, bez niego `#ekran-arena` z listą aren — arenę zakłada się formularzem
  (`#input-pokoj-nazwa`, `#input-pokoj-haslo`, `#btn-pokoj`), drugi gracz wchodzi z `#lista-pokoi` (lista odświeża
  się co 5 s). Lobby jest w `#widok-lobby`, powrót `#btn-panel`. Serwer bez `KONTA_PLIK`/`ZRZUTKA_PLIK` trzyma
  konta w pamięci (restart = nicki wolne). Konto przez API: `POST /api/konto/rejestracja`, a token włóż do
  `localStorage['arena:token']` przez `addInitScript`. Id gracza to `k-nick`. Partia rusza, gdy wszyscy klikną `#btn-gotowy` (+5 s). `__arena().transport` = `ws`
  (gdy gracz jest w lobby; przed wpisaniem nicku `null`). `__arena().lobby` = tryb i drużyny w lobby,
  `druzyny` = drużyny w partii, `ustawienia` / `ustawieniaGry` = zasady w lobby / w partii, `odwrotKrok` = krok ucieczki (do pomiaru opóźnienia widzów).
- **Konta w testach E2E**: serwer pozwala na 6 nowych kont na IP na godzinę — przy kilku przebiegach zrestartuj
  lokalny serwer (konta są w pamięci). Wejście przez `?pokoj=ID` z tokenem w `addInitScript` od razu otwiera lobby
  (do 4.8 adres się czyścił — naprawione w 4.8). Gospodarz może wystartować bez GOTOWY (`#btn-start-teraz`).
- **Zrzuty samej grafiki bez serwera**: strona `gra/?serwer=`, w `evaluate` import `render.js`, `sim.js`, `fx.js`,
  własne płótno, `S.createGame`, ręcznie ustawione robale/skrzynki/pułapki/emotki/pingi i `R.draw(…)` z kamerą
  o zadanym zoomie (tak robiono zrzuty skrzynek, akcesoriów i tańców w 4.9). Błąd „reading 'hidden'” z `main.js`
  po wyczyszczeniu `body` jest w tym trybie nieszkodliwy.
- **Scenariusz Areny**: 2 przeglądarki desktop + telefon („iPhone 13 landscape”), porównanie
  `window.__arena().hash` na granicy każdej tury.
  - Start: wszyscy zakładają konto (wyżej), gospodarz (pierwszy) klika tryb (`#lobby-tryb button:nth-child(2)` = 2 drużyny),
    można sprawdzić zamianę (klik w gracza, potem w gracza z innej drużyny), potem każdy `#btn-gotowy`.
    Kto ma turę: `__arena().aktywny === __arena().mojeId`.
  - Ucieczka na żywo: po strzale trzymaj `a` i co 100 ms porównuj `odwrotKrok` strzelca i widzów.
  - Tura telefonu: desktop strzela (przytrzymaj F ~0,35 s) i czekasz, aż `aktywny` zmieni się na telefon.
  - Długie przytrzymanie OGNIA na dotyku: CDP `Input.dispatchTouchEvent` (`touchStart`, pauza, `touchEnd`).
    `tap()` Playwrighta jest za krótki — odpala słaby strzał od razu.
  - Kamera przy zoomie: sztuczne `WheelEvent` na `#plotno` i pomiar `__arena().kamera` co klatkę
    (`robal` = pozycja robala na ekranie, `recznie` = czy kamera przestała śledzić). Skok > kilku px to błąd.
- **Zrzutka przez serwer**: `ARENA_PORT=8787 node serwer/serwer.js` + `python3 -m http.server 8765`, strona pod
  `http://localhost:8765/?serwer=http://127.0.0.1:8787#fortnite` w dwóch kontekstach; wpłata w jednym ma
  pokazać powiadomienie w drugim w ułamku sekundy. Bez `ZRZUTKA_PLIK` serwer trzyma zrzutkę tylko w pamięci.
- **Scenariusz zrzutki**:
  1. `addInitScript` z zapisem „starego sezonu” w `localStorage`.
  2. Sprawdź, czy okno sezonu otwiera się samo raz, czy liczniki są na zero, a odznaki zostały.
  3. Ustaw suwak przez `evaluate` (`value` + `dispatchEvent(new Event('input'))`).
  4. Zagraj botem przez `window.__minigra().d` i sprawdź sumę po wygranej. Poczekaj ~7 s na animację licznika.
  5. Sprawdź przegraną: blokada i przycisk „Rewanż”.
  - Do testu samych poziomów i kart można pominąć minigierkę: `delete window.ZRZUTKA_MINIGRY` przed wysłaniem
    (wpłata idzie wtedy od razu). Sprawdź `[data-cel-etap]`, klasy `.cel-poziomy li` i ekran zdobycia celu.
  - Hall of Fame: dane sezonu 1 z pliku (wyżej), okno otwórz plakietką sezonu (`click({ force: true })`).
- Do samych zrzutów strony wystarczy `python3 -m http.server` i `?serwer=` (bez serwera strona działa lokalnie).
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
- Lokalny serwer trzyma sumy zrzutki między przebiegami. Restartuj go, gdy test sprawdza konkretne liczby.
- `pkill -f wzorzec` potrafi zabić własną powłokę, jeśli ta sama komenda zawiera wzorzec. Zabijaj
  serwery osobną komendą i wzorcem typu `"http[.]server"` albo `"serwer-zrzutka[.]js"`.
- Na nierównych mapach testy stawiają „półkę” (czyszczą teren wokół robala), zanim sprawdzą broń.
- Z tego środowiska zwykle **nie ma sieci do produkcji** (`*.vercel.app`, kacperlazarz.pl, VPS). Nie planuj pracy, która wymaga
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
- Serwer (`ws`): bez `ws.on('error')` za duża wiadomość (`maxPayload`) wywracała **cały proces**. Każde nowe
  gniazdo musi mieć obsługę `error`. Przy `systemctl stop/restart` serwer zapisuje zrzutkę (SIGTERM).
- Z chmurowej sesji `curl` do VPS kończy się `CONNECT tunnel failed, 403` — to proxy środowiska, nie serwer.
  Stan VPS sprawdza użytkownik (np. `https://96-62-223-169.sslip.io/zdrowie` w przeglądarce) albo sesja SSH.
- `applyPas` ustawia `settleTime = SETTLE_MAX`, więc po pasie tura kończy się w następnym kroku, bez czekania na
  lonty i ogień. Test, który sprawdza osiadanie (np. ogień), ustawia `phase = 'settle'` i `settleTime = 0`.
- Stary link do areny z panelu, która zniknęła: `polaczZPokojem` musi sprawdzać, czy `net` to wciąż to samo połączenie
  po każdym `await` — błąd sieci (404) w międzyczasie woła `opuscPokoj()` i `net` jest już `null`.
- `tap()` w Playwrightcie trafia w środek elementu. Tło ekwipunku (`#ekw-tlo`) w środku zasłania panel —
  stukaj w róg (`position: { x: 12, y: 12 }`).

**Diagnostyka w przeglądarce**:
- `window.__arena()`: hash stanu, tura (`turaLogu`, `turaLokalna`), faza, `aktywny` (gracz z turą), `robal` (id robala
  z turą), `pingi`, kamera, statystyki sieci.
- `window.__minigra()`: stan ramki, trudność, `debug()` gry.

---

## 10. Bezpieczeństwo

- Sekretów w repo nie ma i nie będzie: dostęp do VPS to klucz SSH użytkownika, repo na VPS czyta deploy key
  tylko do odczytu. Klucza prywatnego nie wklejamy nigdzie. `.gitignore` blokuje `.env*` i `.vercel`.
- Serwer zwraca do przeglądarki tylko kody błędów (`{ blad: '...' }`), szczegóły idą do `journalctl -u arena`.
- Serwer przyjmuje połączenia tylko ze stron z listy (`Origin`: kacperlazarz.pl, `*.vercel.app`, localhost).
- Klucza prywatnego SSH użytkownika nigdy nie prosimy o wklejenie ani nie wysyłamy (wystarczy ścieżka do pliku).
  Tokenów (np. do migracji) nie zapisujemy w plikach, repo ani commitach — tylko w jednej komendzie na VPS.
- Ścisłe CSP (`script-src 'self'`, style tylko z plików i Google Fonts): żadnych inline `<script>`,
  `<style>` ani atrybutów `style=` w HTML. `el.style.x = …` z JS jest dozwolone.
- Tekst od użytkowników (nicki, wiadomości) wstawiaj przez `textContent`, nigdy `innerHTML`.
  Dotyczy to też Hall of Fame (nicki sponsorów z archiwum).
- Serwer waliduje wszystko, co przychodzi (typy, długości, dozwolone id graczy, kwota 1–2000, numer sezonu,
  rozmiar wiadomości) i sam stempluje czas.
- Konta (4.6): hasła tylko jako skrót scrypt z solą (porównanie `timingSafeEqual`, przy złym nicku też liczymy
  skrót), token sesji tylko w treści POST i w adresie WebSocket (Caddy nie loguje zapytań), plik kont z prawami 600.
  Hasła pokoi to osobny, prostszy skrót — to nie są hasła do kont. Nigdy nie loguj haseł ani tokenów.
