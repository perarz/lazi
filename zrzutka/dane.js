/* ============================================================
   Dane zrzutki: kategorie, gracze, cele, teksty reakcji, odznaki.
   Opisy graczy są w index.html — tutaj tylko to, czego używa JS.

   Reakcja może być tekstem albo obiektem { tekst, furia: true } —
   wtedy portret na chwilę wpada w złość (Kozak, Stozhinio).
   ============================================================ */

window.ZRZUTKA_DANE = {

  kategorie: {

    /* ---------------------------- FORTNITE ---------------------------- */
    fortnite: {
      nazwa: 'Fortnite',
      ikona: 'vbuck',
      formy: ['V-dolec', 'V-dolce', 'V-dolców'],   // 1 / 2-4 / 5+
      szybkie: [50, 100, 250, 500, 1000, 2000],
      maks: 2000,
      hojnie: 2000,
      etapy: null,                                 // cele numerowane zwykle: „Cel 1/3”
      teksty: {
        oknoNad: 'Dofinansowanie dla',
        ile: 'Ile V-dolców?',
        nick: 'Twój nick',
        nickPusty: 'Anonimowy sponsor',
        wiadomosc: 'Wiadomość dla gracza',
        wyslij: 'Wyślij V-dolce',
        walcz: 'Zawalcz o V-dolce',
        brakKwoty: 'Wpisz, ile V-dolców chcesz wrzucić.',
        ujemna: 'Nie można zabierać V-dolców biednym graczom!',
        zero: 'Zero V-dolców? Tak to Krayo gra, a nie wpłaca.',
        zaDuzo: 'Ej, tyle V-dolców nie ma nawet Epic.',
        hojnie: 'Ale hojność! Ktoś tu chyba wygrał World Cup.',
        grosz: 'Każdy V-dolec się liczy. Nawet ten jeden.',
        zwNumer: '#1',
        zwTytul: 'Cel zdobyty!',
        zwOpis: '{nick} zdobywa: {cele}',
        kurtyna: 'Fortnite'
      },
      rangi: [
        [0, 'Bot'],
        [1, 'Nowicjusz'],
        [1000, 'Sponsor z autobusu'],
        [5000, 'Właściciel Karnetu'],
        [20000, 'Wieloryb'],
        [100000, 'Epic Games w przebraniu']
      ],
      gracze: {
        powpow: {
          nick: 'PowPow',
          cele: [
            { kwota: 950, nazwa: 'Karnet Bojowy' },
            { kwota: 2800, nazwa: 'Legendarna skórka do full boxa' },
            { kwota: 13500, nazwa: 'Bilet na Fortnite World Cup (w marzeniach)' }
          ],
          reakcje: [
            'Z radości postawiłem full boxa. Na środku pustego pola.',
            'Dzięki byku, od jutra gram rankedy na serio!',
            'Robię z wdzięczności trzy dziewięćdziesiątki. Nikt nie strzela.',
            'Te V-dolce zwrócą się w pierwszym turnieju. Obiecuję.',
            'Spokojnie, mam boxa. Teraz też na V-dolce.'
          ],
          zaczepki: [
            'Spokojnie, mam boxa.',
            'Widziałeś tę dziewięćdziesiątkę?',
            'Od jutra rankedy. Serio.',
            'Nie klikaj, bo postawię ścianę.',
            'World Cup, zapamiętaj moje słowa.'
          ]
        },
        krayo: {
          nick: 'Krayo',
          cele: [
            { kwota: 800, nazwa: 'Jakakolwiek skórka, żeby nie brali go za bota' },
            { kwota: 2000, nazwa: 'Myszka, która „nie laguje”' },
            { kwota: 5000, nazwa: 'Korepetycje z budowania u PowPowa' }
          ],
          reakcje: [
            'Kupiłem skórkę i zginąłem, zanim wyskoczyłem z autobusu. Dzięki!',
            'No, teraz to już na pewno nie będzie lagować.',
            'Z wrażenia wypadłem poza mapę. Ale doceniam.',
            'Dalej nie umiem grać, ale od teraz nie umiem w stylu.',
            'Chciałem podziękować, ale postawiłem ścianę tyłem.'
          ],
          zaczepki: [
            'Lagowało mi.',
            'Który przycisk to strzał?',
            'Ten duży pistolet jest mój!',
            'Czemu wszyscy do mnie strzelają?',
            'Nie jestem botem! Chyba.'
          ]
        },
        karp: {
          nick: 'Śliski Karp',
          cele: [
            { kwota: 950, nazwa: 'Karnet Bojowy (wnuczek pomoże kliknąć)' },
            { kwota: 3000, nazwa: 'Nowe okulary do celowania' },
            { kwota: 10000, nazwa: 'Fotel gamingowy z podparciem na krzyż' }
          ],
          reakcje: [
            'Dziękuję, synku. Tylko gdzie się to klika?',
            'Za moich czasów V-dolce to były złotówki.',
            'Wydrukuję potwierdzenie i przykleję na lodówkę.',
            'Schowam te V-dolce w krzaku. Nikt ich nie znajdzie.',
            'Dziękuję, synku. Mówię tak do wszystkich.'
          ],
          zaczepki: [
            'Synku, gdzie tu się kuca?',
            'Za moich czasów nie było budowania.',
            'Ciszej, siedzę w krzaku.',
            'Wnuczek, podgłośnij!',
            'Śliski jestem, nie złapiesz.'
          ]
        },
        apollo: {
          nick: 'Apollo',
          cele: [
            { kwota: 1000, nazwa: 'Zapas energetyków na tydzień grindu' },
            { kwota: 5000, nazwa: 'Wpisowe na cash cupa' },
            { kwota: 20000, nazwa: 'Pierwsze earningsy (już prawie!)' }
          ],
          reakcje: [
            'Dzięki. Wracam na grind.',
            'To idzie na wpisowe. Earningsy już blisko.',
            'gg, nawet nie poczułem, kiedy wpadły.',
            'Za każdego V-dolca jedna eliminacja. PowPow, uważaj.',
            'Zapisuję cię na listę podziękowań do pierwszej wygranej.'
          ],
          zaczepki: [
            'Nie teraz, gram cash cupa.',
            'Jeszcze jeden turniej i earningsy.',
            'Edytuję szybciej, niż ty klikasz.',
            'Śpię, jak skończę grinda. Czyli nigdy.',
            'Krayo, wyjdź z lobby, psujesz mi statystyki.'
          ]
        }
      }
    },

    /* ----------------------------- 0 A.D. ----------------------------- */
    zeroad: {
      nazwa: '0 A.D.',
      ikona: 'srebrnik',
      formy: ['srebrnik', 'srebrniki', 'srebrników'],
      szybkie: [10, 50, 100, 500, 1000, 2000],
      maks: 2000,
      hojnie: 1000,
      // w 0 A.D. rośnie się fazami — cele to kolejne awanse
      etapy: ['Faza miasteczka', 'Faza miasta', 'Cud świata'],
      teksty: {
        oknoNad: 'Akt darowizny dla',
        ile: 'Ile srebrników?',
        nick: 'Twoje imię i przydomek',
        nickPusty: 'Anonimowy mecenas',
        wiadomosc: 'Słowo do wojownika',
        wyslij: 'Przypieczętuj darowiznę',
        walcz: 'Stań do bitwy o srebrniki',
        brakKwoty: 'Wpisz, ile srebrników chcesz przekazać.',
        ujemna: 'Grabież? W tej fundacji? Nigdy!',
        zero: 'Zero srebrników? Nawet Nolli daje więcej, a on wszystko chowa.',
        zaDuzo: 'Tyle metalu nie ma nawet cały skarbiec Kartaginy.',
        hojnie: 'Skarbiec pęka w szwach! Wznieście posąg mecenasa!',
        grosz: 'Jeden srebrnik. Nawet obywatelka przy farmie daje więcej.',
        zwNumer: '',
        zwTytul: 'Zwycięstwo!',
        zwOpis: '{nick} osiąga: {cele}',
        kurtyna: '0 A.D.'
      },
      rangi: [
        [0, 'Obywatelka przy farmie'],
        [1, 'Kmieć'],
        [100, 'Kupiec'],
        [500, 'Hoplita'],
        [2000, 'Bohater'],
        [10000, 'Cesarz']
      ],
      gracze: {
        kozak: {
          nick: 'Kozak',
          cele: [
            { kwota: 250, nazwa: 'Melisa na uspokojenie (dla przeciwników)' },
            { kwota: 800, nazwa: 'Słoń bojowy, żeby dosiadać go na spokojnie' },
            { kwota: 2500, nazwa: 'Cud świata z jego posągiem' }
          ],
          reakcje: [
            'Przyjmuję. Twoja wioska może spać spokojnie.',
            'gg wp.',
            '*kiwa głową* To dużo jak na mnie.',
            'Haracz przyjęty. Możesz dalej ekonomić w spokoju.'
          ],
          // za mała wpłata go wkurza
          malo: 20,
          reakcjeMalo: [
            'Tylko tyle? …Nie wkurzaj mnie.',
            'Za tyle nawet obywatelki nie wyślę. UWAŻAJ.'
          ],
          zaczepki: [
            'gg.',
            '…',
            'Spokojnie. Na razie.',
            'Nie denerwuj mnie.',
            'Klikaj dalej, zobaczysz, co będzie.'
          ],
          progZlosci: 4,
          wsciekly: [
            'WKURZYŁEŚ MNIE. TERAZ NIKT MNIE NIE ZATRZYMA.',
            'Ostatni, kto mnie wkurzył, gra teraz w Fortnite.',
            'SŁONIE, NAPRZÓD. WSZYSTKIE.'
          ]
        },
        lazi: {
          nick: 'Lazi',
          cele: [
            { kwota: 150, nazwa: 'Laska do podpierania się w lobby' },
            { kwota: 500, nazwa: 'Emerytura kombatancka z Alphy 23' },
            { kwota: 1500, nazwa: 'Wehikuł czasu do czasów świetności' }
          ],
          reakcje: [
            'Jak za dawnych lat! …dobra, idę do lobby.',
            'Kupię za to konnicę i zrobię cavalry rush. Znowu.',
            'Weteran salutuje. Trochę krzywo, ale salutuje.',
            'Emerytura rośnie! Starczy na jeszcze jeden atak w 5. minucie.'
          ],
          zaczepki: [
            'Za moich czasów brałem mapę w 10 minut.',
            'Blitzkrieg! …dobra, idę do lobby.',
            'Pamiętam jeszcze Alphę 23.',
            'Kiedyś byłem GOAT-em. Serio.'
          ],
          // po tylu zaczepkach pokazuje dowód z czasów świetności
          dowod: 5
        },
        stozhinio: {
          nick: 'Stozhinio',
          cele: [
            { kwota: 300, nazwa: '300 Spartan (po srebrniku za sztukę)' },
            { kwota: 900, nazwa: 'Syssition i nowe czerwone peleryny' },
            { kwota: 2500, nazwa: 'Własne Termopile' }
          ],
          reakcje: [
            'Dziękuję, spokojnie przeznaczę na farmy.',
            { tekst: 'THIS IS SPARTA! …przepraszam, poniosło mnie.', furia: true },
            'Przyjmuję ze spokojem. Na razie.',
            'Za to wyszkolę 300 Spartiatów. Po jednym srebrniku.'
          ],
          zaczepki: [
            'Spokojnie, spokojnie…',
            'Miłej gry wszystkim :)',
            'Farma przy farmie, jak na działce.',
            'Nie prowokuj, bo mi stanie.'
          ],
          progZlosci: 4,
          wsciekly: [
            'NO I STANĘŁO. THIS. IS. SPARTA!',
            'Mówiłem, żeby nie prowokować! Hoplici, do broni!'
          ]
        },
        nolli: {
          nick: 'Nolli',
          cele: [
            { kwota: 250, nazwa: 'Kurs ataku dla początkujących babć' },
            { kwota: 700, nazwa: 'Szósty targ (pięć to za mało)' },
            { kwota: 2000, nazwa: 'Armia, której nie będzie się bał użyć' }
          ],
          reakcje: [
            'Do skarbca. Na razie.',
            'Przeliczyłem trzy razy. Zgadza się.',
            'Dzięki! Już planuję atak. Na przyszły tydzień.',
            'Ciii… nikomu nie mów, ile już mam.'
          ],
          zaczepki: [
            'Mam 200 obywatelek przy farmach. A ty?',
            'Atak? Może jutro.',
            'Ciii… buduję piąty targ.',
            'Idę, idę… powoli.',
            'Babcia też kiedyś wygrała. Chyba.'
          ]
        },
        apollo: {
          nick: 'Apollo',
          cele: [
            { kwota: 200, nazwa: 'Kolejne 50 obywatelek (przecież to za mało)' },
            { kwota: 700, nazwa: 'Spichlerz tak wielki, że widać go z drugiego końca mapy' },
            { kwota: 2000, nazwa: 'Armia z 20. minuty — tym razem już w 12.' }
          ],
          reakcje: [
            'Dzięki! Wyszkolę za to jeszcze dziesięć obywatelek.',
            'Do spichlerza. Armia będzie… później.',
            'Jedzenia mam dość, metal zawsze się przyda.',
            'Poczekaj do dwudziestej minuty. Zobaczysz.'
          ],
          zaczepki: [
            'Jeszcze tylko dziesięć obywatelek.',
            'Atak? W dwudziestej minucie.',
            'Ile mam kobiet? Tak.',
            'Jedzenia starczy do końca gry. I na następną.',
            'Nie budź armii, jeszcze śpi w koszarach.'
          ],
          // po tylu zaczepkach z koszar wychodzi wreszcie armia
          armiaPo: 6
        },
        froxy: {
          nick: 'Froxy',
          cele: [
            { kwota: 100, nazwa: 'Poradnik 0 A.D. — wydanie dla Hanów' },
            { kwota: 400, nazwa: 'Lekcje mikro u Kozaka (jeśli go nie wkurzy)' },
            { kwota: 1200, nazwa: 'Wielki Mur wokół bazy, żeby zdążyć wszystko ogarnąć' }
          ],
          reakcje: [
            'Dzięki! Wydam na… o, to już faza miasta? Super!',
            'Kupiłem za to kuszników. Stoją w lesie, ale są.',
            'Zapisałem w poradniku: srebrniki = dobrze.',
            'Dziękuję! A który budynek robi metal?'
          ],
          zaczepki: [
            'Który budynek robi kuszników?',
            'Czemu moje farmy są tak daleko?',
            'Hanowie. Zawsze Hanowie.',
            'Chwila, gdzie moja armia?',
            'Uczę się! Serio.'
          ]
        },
        quber: {
          nick: 'Quber',
          cele: [
            { kwota: 250, nazwa: 'Nowe scutum dla każdego włócznika' },
            { kwota: 800, nazwa: 'Legion w pełnym składzie (ani jednej dziury w żółwiu)' },
            { kwota: 2500, nazwa: 'Triumf w Rzymie z przejazdem przez bazę wroga' }
          ],
          reakcje: [
            'Tarcze w górę! Dzięki.',
            'Żółw rośnie. Za każdego srebrnika jedna tarcza.',
            'Ave, mecenasie!',
            'Zanotowałem. W sumie notuję wszystko.'
          ],
          zaczepki: [
            'Tarcza przy tarczy.',
            'Testudo! Formować szyk!',
            'Nie przejdziesz. Serio, spróbuj.',
            'Krok. Krok. Krok.',
            'Wszystko widziałem. I zapisałem.'
          ]
        }
      }
    }
  },

  /* Odznaki sponsora — warunki sprawdza app.js po id. */
  odznaki: [
    { id: 'pierwsza', ikona: '🪙', nazwa: 'Pierwsza wpłata', opis: 'Wrzuć cokolwiek komukolwiek.' },
    { id: 'grosz', ikona: '🥉', nazwa: 'Groszowy sponsor', opis: 'Wpłać dokładnie 1 V-dolca albo 1 srebrnika.' },
    { id: 'hojny', ikona: '💎', nazwa: 'Hojny mecenas', opis: 'Jednorazowo 2000 V-dolców albo 1000 srebrników.' },
    { id: 'krayo', ikona: '🤡', nazwa: 'Litość dla Krayo', opis: 'Wesprzyj gracza, który nie umie grać.' },
    { id: 'mecenas-fn', ikona: '🎮', nazwa: 'Mecenas noobów', opis: 'Wesprzyj wszystkich graczy Fortnite.' },
    { id: 'wieloryb', ikona: '🐋', nazwa: 'Wieloryb', opis: 'Łącznie 50 000 V-dolców.' },
    { id: 'earningsy', ikona: '💸', nazwa: 'Inwestor w earningsy', opis: 'Wesprzyj grind Apolla w Fortnite.' },
    { id: 'haracz', ikona: '⚔️', nazwa: 'Haracz dla Kozaka', opis: 'Zapłać Kozakowi za święty spokój.' },
    { id: 'testudo', ikona: '🐢', nazwa: 'Tarcza dla żółwia', opis: 'Wesprzyj Qubera i jego Rzymian.' },
    { id: 'nauczyciel', ikona: '📜', nazwa: 'Nauczyciel Hanów', opis: 'Wesprzyj Froxy\'ego w nauce 0 A.D.' },
    { id: 'spichlerz', ikona: '🌾', nazwa: 'Pełny spichlerz', opis: 'Wesprzyj boom Apolla w 0 A.D.' },
    { id: 'weteran', ikona: '🎖️', nazwa: 'Emerytura dla weterana', opis: 'Wesprzyj Laziego.' },
    { id: 'sparta', ikona: '🛡️', nazwa: 'This is Sparta', opis: 'Wpłać Stozhiniowi bardzo spartańską kwotę.', ukryta: true },
    { id: 'skarbnik', ikona: '👑', nazwa: 'Królewski skarbnik', opis: 'Wesprzyj wszystkich wojowników 0 A.D.' },
    { id: 'dwa-swiaty', ikona: '🌍', nazwa: 'Dwa światy', opis: 'Wpłać w obu kategoriach.' },
    { id: 'combo', ikona: '⚡', nazwa: 'Combo', opis: 'Trzy wpłaty w 2 minuty.' },
    { id: 'zaczepialski', ikona: '👉', nazwa: 'Zaczepialski', opis: 'Zaczep graczy 15 razy (klikaj w portrety).' },
    { id: 'wkurzyciel', ikona: '😡', nazwa: 'Wkurzyłeś Kozaka', opis: 'Doprowadź Kozaka do furii. Odważnie.' },
    { id: 'archeolog', ikona: '🏺', nazwa: 'Archeolog', opis: 'Odkryj dowód z czasów świetności Laziego.', ukryta: true }
  ]
};
