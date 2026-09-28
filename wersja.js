/* Wersja strony i historia zmian — jedno źródło prawdy.
   Nowa wersja: dopisz wpis NA POCZĄTKU listy `historia`.
   Skrypt sam dokłada znaczek z numerem wersji: w elementach [data-wersja]
   (np. w karcie lobby gry), a jeśli ich nie ma — w lewym dolnym rogu. */
(function () {
  var historia = [
    {
      wersja: '4.10', data: '2026-09-28', tytul: 'Płonąca ropa, 7 utworów w tle i areny, które nie zarastają',
      zmiany: [
        'Beczka po wybuchu rozlewa płonącą ropę jak w Wormsach: krople ognia rozlatują się, spadają, rozpływają po ziemi i palą się kilka sekund. Robal w ogniu traci po 3 HP co ćwierć sekundy i podskakuje z bólu, a ogień wypala w ziemi dołki i okopca skałę. Beczka stojąca w ogniu też wybucha — łańcuchy beczek robią się naprawdę gorące. Tura czeka, aż ogień zgaśnie.',
        'Muzyka: zamiast jednej krótkiej pętli jest 7 utworów po 1,5–3 minuty, każdy w innym stylu: Marsz GOATów, Blues z lawy, 8-bitowa rzeźnia, Pojedynek w kraterze (western), Polka nad lawą, Cisza przed nalotem i Neonowa lawa. Mają wstęp, zwrotki, refren i zakończenie, a lecą po kolei w losowej kolejności. Każda partia zaczyna od kolejnego utworu, a wyłączenie i ponowne włączenie muzyki 🎵 przeskakuje do następnego.',
        'Pusta arena znika od razu: gdy wyjdzie z niej ostatnia osoba, nie ma jej już na liście i nie liczy się do limitu 3 aren na konto (dawniej wisiała pusta 10 minut). Przez pół minuty da się do niej jeszcze wrócić tym samym linkiem (np. po odświeżeniu strony albo zaniku zasięgu), potem kasuje się całkiem. Kto wejdzie starym linkiem do skasowanej areny, dostaje komunikat i listę aren.',
        'Nowe rogi prawdziwego GOATa: dwa kozie rogi z prążkami wyrastają z czubka głowy i zaginają się do tyłu, do tego kozie ucho (dawniej wyglądały jak dwa haczyki na karku).'
      ]
    },
    {
      wersja: '4.9', data: '2026-09-28', tytul: 'Railgun, miny i beczki, pingi, dźwięki i muzyczka',
      zmiany: [
        'Nowa broń: Railgun (klawisz \\ albo ekwipunek, 1 sztuka na partię) — jeden laser przez całą mapę, przebija skały i każdego robala na linii, 75 obrażeń każdemu.',
        'Pingi: przycisk 📍 (albo P, albo środkowy przycisk myszy), a potem stuknięcie w mapę albo minimapę — pinezka w Twoim kolorze i z nickiem, którą widzą wszyscy. Gdy jest poza ekranem, przy krawędzi pokazuje się strzałka.',
        'Arena gra: wybuchy, strzały, laser, skoki, odbicia, skrzynki, plusk lawy, początek tury i koniec partii, a w tle muzyczka. Dźwięki 🔊 i muzykę 🎵 wyłączysz osobno w rogu ekranu.',
        'Nalot spada z dużo wyżej (z wysokości 1,5× mapy) i dalej trafia tam, gdzie wskażesz.',
        '5 nowych tańców: Breakdance, Floss, Helikopter, Disco i Kozi taniec.',
        'Robale nie mają już ogonków z tyłu. Zamiast czapki lamy i kilofa są okulary przeciwsłoneczne i szeroki uśmiech.',
        'Ładniejsza arena: skrzynki z amunicją jak wojskowe (pas ostrzegawczy, naboje), apteczki z połyskiem i unoszącymi się plusikami, obie świecą z daleka, spadochrony w pasy. Na niebie krwawy księżyc i łuna wulkanu, lawa bąbluje i świeci.',
        'Gospodarz może ruszyć partię bez czekania na GOTOWY wszystkich (przycisk „▶ START bez czekania”, start za 5 s).',
        'Miny i beczki na mapie od startu (w ustawieniach: wyłączone, trochę albo dużo). Mina odpala się, gdy ktoś podejdzie — miga na czerwono i po sekundzie wybucha. Beczka wybucha od każdego wybuchu obok albo railguna, więc beczki potrafią pójść łańcuchem.',
        'Kamera za pociskiem: wyprzedza go, przy szybkim locie lekko się oddala, a po wybuchu chwilę zostaje na miejscu wybuchu. Przy railgunie pokazuje cały promień.',
        'Nagrobki: po poległym robalu zostaje kamień z kozimi rogami i „RIP nick” — spada, gdy wybuch wytnie spod niego grunt.'
      ]
    },
    {
      wersja: '4.8', data: '2026-09-27', tytul: 'Kilka robali na gracza, wyższe mapy i lepsza kamera',
      zmiany: [
        'Jak w Wormsach: gospodarz ustawia w lobby 1, 2 albo 3 robale na gracza. Tury idą drużynami na zmianę (drużyna 1 → drużyna 2 → drużyna 1…), w drużynie gracze na zmianę, a każdy za każdym razem kolejnym swoim robalem. Robale jednego gracza mają wspólny plecak z bronią.',
        'Mapa ekstremalna jest o ok. 75% wyższa: więcej pięter, wyższe iglice i kominy, dłuższa droga do lawy.',
        'Nalot trafia tam, gdzie wskażesz — także w kogoś stojącego wysoko na szczycie i przy mocnym wietrze (dawniej rakiety potrafiły spaść obok).',
        'Kamera: minimapa w rogu (stuknij albo przeciągnij po niej, żeby tam spojrzeć), przycisk 🗺️ i klawisz M pokazują całą mapę naraz, oddalić można dalej niż dotąd (aż do całej mapy), a na telefonie dwa palce przesuwają widok także w Twojej turze.',
        'Poprawka: link do areny i odświeżenie strony w lobby znowu wracają prosto do tej areny.'
      ]
    },
    {
      wersja: '4.7.1', data: '2026-09-27', tytul: 'Kurtyna, czapki za osiągnięcia i poprawki',
      zmiany: [
        'Korona Króla GOATów za zdobycie WSZYSTKICH osiągnięć Areny: złota korona z wielkimi rogami kozła, pulsującym rubinem, krążącymi iskrami i promieniami chwały za głową. Do tego trzy czapki za pojedyncze osiągnięcia: płonący irokez (Masakra), korona z lawy (Kąpiel w lawie) i rogi prawdziwego GOATa (Kozi róg).',
        'Zablokowaną czapkę widać jako ciemną sylwetkę z kłódką; przy koronie jest licznik zdobytych osiągnięć. Nową czapkę pokazuje też ekran końca partii.',
        'Hełm spartański obrócony: twarz jest z przodu, osłona karku z tyłu.',
        'W profilu zamiast niejasnego „rekord tury” jest „max obrażeń w turze”.',
        'Przejście na Arenę i z Areny na Fortnite albo 0 A.D. ma teraz tę samą kurtynę co przełączanie Fortnite ↔ 0 A.D.: koło rośnie od miejsca stuknięcia, na środku moneta i nazwa, a nowa strona odsłania się spod kurtyny.',
        'Wejście na Arenę z zapamiętanym kontem to już tylko kurtyna Areny (płonąca moneta ze skrzyżowanymi mieczami) — bez ekranu ładowania. Scena z robalem i paskiem zostaje tylko po zalogowaniu.'
      ]
    },
    {
      wersja: '4.7', data: '2026-09-27', tytul: 'Nowy panel Areny i akcesoria robala',
      zmiany: [
        'Na górze Areny jest znowu pasek Fortnite / 0 A.D. / Arena, jak na stronie zrzutki — jednym stuknięciem wracasz do zbiórki.',
        'Panel i lobby na jednym ekranie: po lewej Twój profil, wygląd robala, ranking killi i osiągnięcia, po prawej lista aren albo lobby areny, w której jesteś. Na telefonie wszystko jedno pod drugim.',
        'Nie ma już domyślnej areny ani przycisku GRAJ: żeby zagrać, ktoś zakłada arenę (otwartą albo na hasło 🔒), a reszta wchodzi z listy. Przy arenie widać, kto w niej siedzi, kto ją założył i czy trwa partia.',
        'Kolor robala zmienisz w każdej chwili — paleta jest zawsze na wierzchu, także gdy czekasz w lobby.',
        '5 akcesoriów dla robala: z Fortnite korona Victory Royale, czapka lamy z łupami i kilof na plecach, z 0 A.D. hełm spartański i wieniec laurowy. Widać je w grze, w lobby i w rankingu.',
        'Nowy ekran ładowania: Twój robal w akcesorium strzela z bazooki nad lawą, spada skrzynka, pasek pokazuje procenty, a do tego porady do gry.',
        'Profil podrasowany: ranga za kille (od „Świeżaka areny” do „GOATa areny”), procent wygranych i rekord tury.'
      ]
    },
    {
      wersja: '4.6', data: '2026-09-27', tytul: 'Konta i panel Areny',
      zmiany: [
        'Arena ma konta: przy wejściu logujesz się albo zakładasz konto (nick + hasło, bez maila). Nikt już nie zagra pod Twoim nickiem.',
        'Kille, wygrane, partie i osiągnięcia zapisują się na koncie — zalogujesz się na innym telefonie i wszystko jest. Statystyki i osiągnięcia zebrane wcześniej w tej przeglądarce przechodzą na pierwsze założone konto.',
        'Po zalogowaniu ekran ładowania z robalem i paskiem, a potem panel Areny: wielki przycisk GRAJ (Arena główna), Twoje statystyki, kolor robala i wszystkie osiągnięcia na dole.',
        'Pokoje: w panelu widać listę aren z graczami w środku i znaczkiem „trwa partia”. Możesz założyć własny pokój — otwarty albo na hasło 🔒. Pusty pokój znika po 10 minutach.',
        'Ranking killi: zakładka w panelu z listą najlepszych zabójców Areny.',
        'Z lobby wracasz do panelu przyciskiem „← Panel”.'
      ]
    },
    {
      wersja: '4.5.1', data: '2026-09-27', tytul: 'Ekstremalna jeszcze wyżej',
      zmiany: [
        'Mapa „Ekstremalna” to teraz wszystkie mapy w jednej: pasma ostrych gór, grube masywy z piętrami jaskiń, wąwozy aż do lawy, przerwy jak w archipelagu (z wiszącymi kamieniami nad lawą) i wielkie hale.',
        'Dużo bardziej w górę: skalne iglice sięgają prawie pod niebo, a nad nimi zostaje wąski pas powietrza na przerzut pocisku.'
      ]
    },
    {
      wersja: '4.5', data: '2026-09-27', tytul: 'Mapy na zamówienie i obracane mosty',
      zmiany: [
        'Nowa mapa „Ekstremalna”: jedna wielka góra-mrowisko od brzegu do brzegu — piętra, kominy i ukośne tunele połączone w jedną sieć. Lina ninja obowiązkowa.',
        'Rozmiar mapy w ustawieniach partii: mała, normalna, duża albo ogromna (dwa razy szersza). Na większych mapach jest odpowiednio więcej jaskiń, pięter i skał.',
        'Życie na start, czas tury i rundę, od której rośnie lawa, gospodarz wpisuje teraz sam (np. 237 HP, 75 s, lawa od 3. rundy, 0 = bez lawy) zamiast wybierać z listy.',
        'Most da się obracać: klawisz R albo przycisk ⟳ przy broni obraca belkę co 22,5° — skosy i pionowe ściany. Podgląd pokazuje, jak stanie.',
        'Granaty, kasetówki i Święty GOAT lecą jeszcze dalej (ok. 1,4 raza).',
        'Chmurka z emotkami 💬 przeniesiona na dół, obok broni — pod kciukiem.'
      ]
    },
    {
      wersja: '4.4', data: '2026-09-27', tytul: 'Lina ninja, Święty GOAT, emotki i tańce',
      zmiany: [
        'Nowość: Lina ninja (klawisz ], ekwipunek → Sprzęt, 5 sztuk). Celuj w skałę i stuknij OGNIA — hak się zaczepia. ◀ ▶ bujanie, ▲▼ skracanie i wydłużanie liny, OGNIA albo SKOK puszcza. Nie kończy tury, więc można przebujać się między piętrami jaskiń i dopiero strzelić. Inni widzą linę na żywo.',
        'Nowość: Święty GOAT (klawisz [, ekwipunek → Granaty, 1 sztuka). Złota kula z rogami i aureolą, odbija się jak granat i po 3,5 s robi największy wybuch w grze. ALLELUJA!',
        'Emotki w Arenie: stuknij chmurkę 💬 w rogu (albo klawisz E) — w swojej turze i w cudzej — i wybierz GG, 😄, EZ, 😂 albo 😱. Nad robalem wyskakuje dymek. Do tego dwa tańce: taniec szczęścia (podskoki) i taniec robaczka (wężyk).',
        'Oczko 👁 z liczbą w rogu ekranu pokazuje, ile osób ogląda partię z boku.',
        'Bronie w ustawieniach partii: już tylko dwa zestawy — normalne limity (kij tylko ze skrzynek) albo Szał, gdzie wszystko jest bez limitu.',
        'Owca przeszła na kozę — w końcu to Arena GOATów. Szarżuje tak samo, tylko z rogami i bródką. Osiągnięcie za nią nazywa się teraz „Kozi róg”.',
        'Robale skaczą niżej (ok. 70% dawnej wysokości) — skok to teraz przeskok, a nie lot na szczyt.',
        'Lawa w ustawieniach: od kiedy rośnie (od 6. rundy jak dotąd, od 10., 20., 30. albo 45. tury, albo wcale) i jak szybko (wolno, normalnie, szybko, błyskawicznie). Na wysokich mapach lawa sięga teraz aż pod szczyty.'
      ]
    },
    {
      wersja: '4.3', data: '2026-09-27', tytul: 'Lobby gospodarza: własne zasady partii',
      zmiany: [
        'Nowe, szalone mapy: dużo wyższe góry, kilka pięter jaskiń jedna nad drugą, wielkie hale, pionowe kominy między poziomami i więcej wiszących skał.',
        'Bazooka, granat i kasetówka lecą 1,5 raza dalej, a wiatr mocniej znosi wszystkie pociski (bazooki, granaty, naloty, blitzkrieg, odłamki).',
        'Oglądasz cudzą turę jako gracz partii? Na dole widać, jaką broń przeciwnik ma w łapach (ale nie ile jej ma). Obserwator spoza partii widzi też zapas, a w ekwipunku — cały plecak gracza z turą. Nad robalem — obrażenia od upadku, zebraną apteczkę (+HP) albo zaopatrzenie (+1 broń) i wpadnięcie do lawy. Życie w panelu i nad robalem zmienia się od razu, a zebrana skrzynka od razu znika.',
        'Gospodarz (👑) ustawia zasady partii: czas tury (15–60 s), życie na start (50–200 HP), mapę (losowa albo konkretny styl), bronie (pełny arsenał, podwójna amunicja, Klasyka albo Szał bez limitów), zrzuty skrzynek, wiatr (aż po huragan) i nagłą śmierć (albo bez lawy).',
        'Reszta widzi zasady w lobby (zmienione są podświetlone) i dostaje komunikat, gdy gospodarz coś zmieni — gotowość wtedy się cofa, żeby nikt nie wszedł w partię, na którą się nie pisał. Na starcie partii baner przypomina zasady.',
        'Gospodarz może stuknąć gracza i oddać mu koronę albo wyrzucić go z lobby (np. gdy ktoś poszedł zrobić herbatę i blokuje start). Wyrzucony wraca, kiedy chce, przyciskiem.',
        'W drużynach gospodarz ma przycisk „Losuj drużyny” — wyrównane, losowe składy jednym stuknięciem.',
        'Poprawki: partię zakłada gospodarz (reszta tylko, gdy on zniknie), więc start nie łapie już czyjegoś nieaktualnego widoku lobby; gracz ze starą wersją strony naprawdę blokuje start, dopóki nie odświeży; pasek życia drużyny liczy się od życia na start; gospodarz nie przestawia lobby w trakcie trwającej partii.'
      ]
    },
    {
      wersja: '4.2', data: '2026-09-26', tytul: 'Drużyny i Arena bez opóźnień',
      zmiany: [
        'Arena: strzał i ucieczkę po nim widać u wszystkich na żywo (ok. 0,15 s za strzelcem) — koniec z zamarzniętym robalem i 5-sekundowym opóźnieniem.',
        'Nowe lobby: do 8 graczy. Gospodarz (👑) wybiera tryb: każdy na każdego albo 2, 3 lub 4 drużyny.',
        'Po wejściu trafiasz losowo do drużyny z najmniejszą liczbą graczy; możesz przejść tam, gdzie jest wolne miejsce. Gospodarz przenosi graczy i zamienia ich miejscami.',
        'Start: każdy daje GOTOWY, potem 5 s odliczania. Zmiana drużyn albo nowy gracz cofa gotowość.',
        'W drużynie nick ma kolor drużyny (robal zostaje w swoim), koledzy nie zadają sobie obrażeń ani odrzutu, a pociski przez nich przelatują.',
        'Tury idą na zmianę drużynami, w panelu są paski życia drużyn, wygrywa ostatnia drużyna na arenie.'
      ]
    },
    {
      wersja: '4.1.1', data: '2026-09-26', tytul: 'Arena i zrzutka na własnym serwerze',
      zmiany: [
        'Arena działa teraz na własnym serwerze zamiast przez bazę danych: ruchy i strzały innych graczy widać od razu, a nie z sekundowym opóźnieniem.',
        'Ruch robala gracza z turą jest płynniejszy — podgląd przychodzi kilka razy częściej.',
        'Zrzutka też jest na naszym serwerze: cudze wpłaty i liczniki zmieniają się na żywo, w ułamku sekundy, a nie co 10 sekund.',
        'Koniec z limitem darmowej bazy danych — stara baza poszła na emeryturę, można grać i wpłacać bez oglądania się na licznik.'
      ]
    },
    {
      wersja: '4.1', data: '2026-09-25', tytul: 'Nowe poziomy, zwarte karty i ekwipunek w Arenie',
      zmiany: [
        'Każdy gracz ma teraz 6 celów: po dotychczasowych dochodzą progi 10 000, 20 000 i 50 000. W Fortnite poziomy to rangi (Brąz → Unreal), w 0 A.D. — od fazy miasteczka przez relikwię i królobójstwo po podbój świata.',
        'Nowe, niższe karty graczy: nick na portrecie jak w sklepie Fortnite, statystyki 2×2, dłuższy opis pod „Czytaj dalej” i ścieżka poziomów pod paskiem celu.',
        'Podrasowane portrety: kilof PowPowa, Battle Bus i „999 ms” u Krayo, krzak Karpia, fotel gamingowy Apolla, słoń Kozaka, laska Laziego, konewka Stozhinia, stragan Nolliego, pole zboża Apolla, pagoda Froxy\'ego i sztandar SPQR Qubera.',
        'Odświeżone nagłówki: nad Fortnite przelatuje Battle Bus, pod nagłówkiem 0 A.D. stoi panorama starożytnych budowli.',
        'Arena: broń wybierasz z rozwijanego ekwipunku jak w Worms Armageddon (przycisk z bronią, Q albo prawy przycisk myszy) zamiast z długiego paska.',
        'Arena na telefonie: przycisk skoku stoi teraz nad OGNIA i działa też w czasie ucieczki po strzale.',
        'Arena: kamera przy oddalaniu nie gubi już gracza i nie przeskakuje na środek mapy. Kółko myszy i touchpad zoomują płynnie.',
        'Arena: przy wejściu wybierasz kolor robala — w tym kolorze jest też Twój nick. Startu partii nie da się już przyspieszyć, odliczanie leci do końca.'
      ]
    },
    {
      wersja: '4.0', data: '2026-09-25', tytul: 'Sezon 2',
      zmiany: [
        'Startuje sezon 2! Wszystkie liczniki wyzerowane — odznaki zostają.',
        'Hall of Fame sezonu 1: podium w obu kategoriach i największe wpłaty (plakietka „Sezon 2” nad tytułem).',
        'Srebrniki też trzeba wywalczyć: „Ekonomia Nolliego” do 1000 — zbieraj zasoby, omijaj wilki.',
        'Powyżej 1000: „Żółw Qubera” — obracaj tarcze w stronę salw i szarż. Czasem strzelają bez ostrzeżenia albo dwie salwy tuż po sobie.',
        'Build fight: ściana staje tam, gdzie stukniesz (na PC spacja/BUDUJ — w stronę, w którą biegłeś).',
        'Duża naklejka „Sezon 2” przy tytule — kliknij, żeby zobaczyć zwycięzców sezonu 1.',
        'Przycisk w 0 A.D.: „Stań do bitwy o srebrniki”.'
      ]
    },
    {
      wersja: '3.10.2', data: '2026-09-25', tytul: 'Suwak, Snajper z Tilted i ładniejsze gry',
      zmiany: [
        'Nowe okno wpłaty: kwotę wybierasz suwakiem, a nad nim widać, która gra czeka (🎯 do 1000, 🔨 powyżej). Przycisk to teraz „Zawalcz o V-dolce”.',
        'Nowa łatwa gra: Snajper z Tilted — zdejmuj wrogów z okien i dachów, nie strzelaj do swoich.',
        'Build fight w burzy dostał nową grafikę: postacie, drewniane ściany, laser przed serią, przycisk BUDUJ.',
        'Odliczanie 3-2-1 przed grą i konfetti po wygranej.',
        'Naprawione: burza zasłaniała całą planszę.'
      ]
    },
    {
      wersja: '3.10.1', data: '2026-09-25', tytul: 'Minigierki przed wpłatą (Fortnite)',
      zmiany: [
        'V-dolce trzeba teraz wygrać! Wpłata do 1000: „Skok z Battle Busa” — wyląduj w podświetlonym miejscu.',
        'Wpłata 1001–2000: „Build fight w burzy” — przetrwaj burzę i ostrzał, stawiając ściany.',
        'Im większa kwota, tym trudniej. Po przegranej 10 s przerwy.',
        'Jedna wpłata to teraz najwyżej 2000 (w obu kategoriach). Odznaki „Hojny mecenas” i „Combo” dostosowane.'
      ]
    },
    {
      wersja: '3.10', data: '2026-09-25', tytul: 'Most i kij ze zrzutu',
      zmiany: [
        'Nowa broń: Most (klawisz „=”, 3 sztuki) — wskaż miejsce blisko robala i postaw stalową belkę. Można po niej chodzić, a wybuch ją przetnie.',
        'Kij bejsbolowy jest teraz tylko w skrzynkach z zaopatrzeniem (mniej więcej co trzecia go ma).',
        'Kij osłabiony: mniejszy odrzut i trochę mniej obrażeń.'
      ]
    },
    {
      wersja: '3.9', data: '2026-09-25', tytul: 'Wiertło, zrzuty i wielkie jaskinie',
      zmiany: [
        'Nowa broń: Wiertło (klawisz „-”) — drąży tunel w stronę celownika i wybucha na końcu.',
        'Zrzuty z nieba: apteczka (+35 HP) i skrzynka z amunicją — wejdź w nią, żeby zebrać. Wybuch ją niszczy.',
        'Zamiast cienkich tuneli mapy mają czasem wielkie jaskinie.',
        'Naprawione: gracze nie startują już w powietrzu nad lawą.',
        'Naprawione: kamera nie trzęsie się przy dynamicie i odbijającym się granacie.'
      ]
    },
    {
      wersja: '3.8', data: '2026-09-25', tytul: 'Skręcanie w locie i żwawsza owca',
      zmiany: [
        'Po skoku możesz skręcać w powietrzu (A/D albo strzałki).',
        'Owca biega szybciej, przeskakuje przeszkody i nie zacina się na stromiznach.'
      ]
    },
    {
      wersja: '3.7', data: '2026-09-24', tytul: 'Ruch po strzale i nowe bronie',
      zmiany: [
        'Po każdym strzale masz 5 s na ruch — schowaj się albo odskocz od wybuchu.',
        'Owca (7): biegnie po terenie, zawraca na ścianach i wybucha przy wrogu.',
        'Kij bejsbolowy (8): mało obrażeń, ogromny odrzut — idealny do wybijania w lawę.',
        'Teleport (9): wskaż miejsce na mapie i przenieś się tam.',
        'Blitzkrieg (0): trzy rakiety naraz, wachlarzem.',
        'Nowe osiągnięcia: Wilk w owczej skórze i Home run.'
      ]
    },
    {
      wersja: '3.6', data: '2026-09-24', tytul: 'Lepsze portrety',
      zmiany: [
        'Hełmy Stozhinia (koryncki), Qubera, Kozaka i Laziego zakrywają czoło — z osłonami nosa i policzków.',
        'Wszystkie postacie: cieniowanie twarzy i ubrań, obrys twarzy, cień pod brodą, uszy, odblaski w oczach, nosy tam, gdzie ich brakowało.',
        'Większe oczy z tęczówkami (Stozhinio, PowPow, Quber, Apollo), refleksy na włosach.',
        'Froxy nosi okulary.'
      ]
    },
    {
      wersja: '3.5', data: '2026-09-24', tytul: 'Osiągnięcia z Areny',
      zmiany: [
        '16 osiągnięć do zdobycia w Arenie: 5 i 25 eliminacji, zabójstwo nalotem, dynamitem, ze strzelby i kasetówką, wrzucenie do lawy, dublet, masakra, wielka ucieczka, wygrane i jedno tajne.',
        'Zdobyte osiągnięcie wyskakuje w trakcie gry, a na ekranie końca widać, co wpadło w tej partii.',
        'Lista osiągnięć w lobby Areny i w profilu na stronie głównej. Zapisują się w przeglądarce, bez obciążania serwera.'
      ]
    },
    {
      wersja: '3.4', data: '2026-09-24', tytul: 'Ucieczka po dynamicie i Quber',
      zmiany: [
        'Po podłożeniu dynamitu masz 3,5 s na ucieczkę (odliczanie nad laską i na zegarze).',
        'Spacja to teraz skok. Strzał: przytrzymaj F albo Enter.',
        'Robal nie przechodzi już przez strome ściany.',
        'Gospodarz lobby zostaje gospodarzem, gdy ktoś nowy dołączy.',
        'Nowa grafika robali, trzęsienie ekranu po wybuchach.',
        'Nowy wojownik 0 A.D.: Quber aka Kapuś i jego rzymski żółw.',
        'Powiadomienia o wpłatach znikają szybciej i nie powtarzają starych wpłat.'
      ]
    },
    {
      wersja: '3.3', data: '2026-09-24', tytul: 'Log zmian i porządki',
      zmiany: [
        'Numer wersji w rogu strony i ta strona z historią zmian.',
        'API nie zdradza już szczegółów błędów bazy — trafiają tylko do logów serwera.'
      ]
    },
    {
      wersja: '3.2', data: '2026-09-24', tytul: 'Nowe mapy Areny',
      zmiany: [
        'Nieregularne mapy: nawisy, skalne łuki, tunele, komory i pływające skały.',
        'Cztery style map losowane co partię: Góry, Archipelag, Kaniony, Jaskinie.',
        'Nowa grafika: palety skał, warstwy, świecące krawędzie, tło z górami i popiołem.',
        'Zakładka „Arena” w nawigacji strony.',
        '„Strzał tury” przy 50+ obrażeniach i twoje statystyki (partie, wygrane, fragi).'
      ]
    },
    {
      wersja: '3.1', data: '2026-09-23', tytul: 'Apollo, Froxy i kamera',
      zmiany: [
        'Nowy gracz Apollo — w Fortnite i w 0 A.D.',
        'Nowy wojownik Froxy (zawsze Hanowie).',
        'Nowy awatar Nolliego.',
        'Kamera w Arenie trzyma gracza, także przy krawędzi mapy i na telefonie.'
      ]
    },
    {
      wersja: '3.0', data: '2026-09-23', tytul: 'Arena bez desynców',
      zmiany: [
        'Nowy protokół sieciowy — koniec rozjeżdżania się stanu gry.',
        'Granie na telefonie: przyciski dotykowe, celowanie palcem, zoom.',
        'Przycisk „Opuść grę”; zamknięcie karty wyrzuca z partii.',
        'Nowe bronie: strzelba, kasetówka, dynamit, nalot. Lawa rośnie po kilku rundach.'
      ]
    },
    {
      wersja: '2.2', data: '2026-09-23', tytul: 'Wspólne sumy',
      zmiany: ['Zebrane V-dolce i srebrniki są wspólne dla wszystkich odwiedzających.']
    },
    {
      wersja: '2.1', data: '2026-09-23', tytul: 'Skarbiec 0 A.D.',
      zmiany: [
        'Kategoria 0 A.D. ze srebrnikami: Kozak, Lazi, Stozhinio, Nolli.',
        'Odznaki, rangi sponsora, zaczepki po kliknięciu w portret.'
      ]
    },
    {
      wersja: '2.0', data: '2026-09-23', tytul: 'Zrzutka V-dolców',
      zmiany: ['Fundacja pomocy początkującym graczom Fortnite: PowPow, Krayo, Śliski Karp.']
    },
    {
      wersja: '1.0', data: '2026-06-11', tytul: 'ŁAZI TO GOAT',
      zmiany: ['Pierwsza wersja strony.']
    }
  ];

  window.WERSJA_STRONY = { numer: historia[0].wersja, data: historia[0].data, historia: historia };

  function znaczek(el) {
    el.textContent = 'v' + historia[0].wersja;
    el.title = 'Co nowego — ' + historia[0].tytul;
    if (el.tagName === 'A' && !el.getAttribute('href')) el.href = '/zmiany/';
  }

  function wstaw() {
    var miejsca = document.querySelectorAll('[data-wersja]');
    if (miejsca.length) { for (var i = 0; i < miejsca.length; i++) znaczek(miejsca[i]); return; }
    if (document.body.hasAttribute('data-bez-znaczka')) return;
    var a = document.createElement('a');
    znaczek(a);
    a.href = '/zmiany/';
    a.className = 'wersja-rog';
    var s = a.style;
    s.position = 'fixed'; s.left = 'calc(10px + env(safe-area-inset-left, 0px))';
    s.bottom = 'calc(10px + env(safe-area-inset-bottom, 0px))'; s.zIndex = '15';
    s.padding = '4px 9px'; s.borderRadius = '999px'; s.font = '600 11px/1.2 system-ui, sans-serif';
    s.letterSpacing = '0.04em'; s.color = '#fff'; s.textDecoration = 'none';
    s.background = 'rgba(0, 0, 0, 0.55)'; s.border = '1px solid rgba(255, 255, 255, 0.25)';
    s.opacity = '0.75'; s.backdropFilter = 'blur(4px)';
    a.addEventListener('mouseenter', function () { s.opacity = '1'; });
    a.addEventListener('mouseleave', function () { s.opacity = '0.75'; });
    document.body.appendChild(a);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wstaw);
  else wstaw();
})();
