/* Wersja strony i historia zmian — jedno źródło prawdy.
   Nowa wersja: dopisz wpis NA POCZĄTKU listy `historia`.
   Skrypt sam dokłada znaczek z numerem wersji: w elementach [data-wersja]
   (np. w karcie lobby gry), a jeśli ich nie ma — w lewym dolnym rogu. */
(function () {
  var historia = [
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
