/* Przejście między częściami strony (od 4.7.1): zrzutka (Fortnite / 0 A.D.) ↔ Arena.

   Na stronie zrzutki kategorie przełącza jej własna kurtyna (zrzutka/app.js). Tu jest
   kurtyna „między stronami”: link z atrybutem data-przejscie="fortnite|zeroad|arena"
   najpierw zasłania ekran kurtyną celu (koło rośnie od miejsca stuknięcia), potem
   przechodzi na nową stronę, a ta zaczyna od tej samej zasłoniętej kurtyny i ją odsłania.
   Cel zapamiętuje sessionStorage['przejscie'] (tylko na czas jednego przejścia).

   Klasyczny skrypt w <head> (bez defer): zanim strona się pokaże, <html> dostaje klasę
   przejscie-wejscie (treść schowana, tło w kolorze kurtyny), żeby nic nie mignęło.

   API: PRZEJSCIE.zaslon(cel) — pokaż zasłoniętą kurtynę (np. gdy Arena ładuje konto),
        PRZEJSCIE.odslon()    — odsłoń stronę (strona woła to sama, gdy ma dane; jeśli
                                 nie zawoła, kurtyna odsłania się sama po chwili). */
(function () {
  var KLUCZ = 'przejscie';
  var CELE = {
    fortnite: { napis: 'Fortnite', tlo: '#133a9f' },
    zeroad: { napis: '0 A.D.', tlo: '#22160b' },
    arena: { napis: 'Arena GOATów', tlo: '#1a0300' }
  };
  var ruch = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var IKONY = {
    fortnite: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="#072f7a"/><circle cx="32" cy="32" r="28" fill="#1a6fe0"/>' +
      '<circle cx="32" cy="32" r="23" fill="#35a4ff"/><ellipse cx="23" cy="19" rx="10" ry="4.5" fill="#fff" opacity="0.35"/>' +
      '<path d="M16 17h11.5L32 33l4.5-16H48L37.5 47h-11z" fill="#fff4b0" stroke="#0a47a6" stroke-width="2.6" stroke-linejoin="round"/></svg>',
    zeroad: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="#454d57"/><circle cx="32" cy="32" r="28" fill="#8a939e"/>' +
      '<circle cx="32" cy="32" r="23" fill="#b9c1ca"/><path d="M17 29C16 17 29 10 40 14l-1 3c-9-3-19 2-19 12z" fill="#6f7984"/>' +
      '<path d="M21 31c0-10 7-15 14-15c7 0 11 6 11 13v5l-4 1 1 9c-4 3-10 3-14 1l-2-7c-4-1-6-4-6-7z" fill="#838d98"/>' +
      '<path d="M35 28h10v3l-9 1z" fill="#4d5560"/><ellipse cx="24" cy="18" rx="9" ry="4" fill="#fff" opacity="0.4"/></svg>',
    arena: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="#5a1500"/><circle cx="32" cy="32" r="28" fill="#ff6a00"/>' +
      '<circle cx="32" cy="32" r="23.5" fill="#2a0a04"/><circle cx="32" cy="32" r="20.5" fill="none" stroke="#ff9a3c" stroke-width="1.4" stroke-dasharray="1.4 2.4"/>' +
      '<path d="M21 43L43 21M43 43L21 21" stroke="#ffe9c8" stroke-width="4.2" stroke-linecap="round"/>' +
      '<path d="M16.5 37.5l10 10M47.5 37.5l-10 10" stroke="#ffb347" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="16.5" cy="47.5" r="3.4" fill="#ffd93b"/><circle cx="47.5" cy="47.5" r="3.4" fill="#ffd93b"/>' +
      '<path d="M26 14c-3-4-8-4-10-1 3 0 5 2 6 5M38 14c3-4 8-4 10-1-3 0-5 2-6 5" fill="none" stroke="#ffd93b" stroke-width="2.4" stroke-linecap="round"/>' +
      '<ellipse cx="22" cy="17" rx="9" ry="3.6" fill="#fff" opacity="0.25"/></svg>'
  };

  function czytaj() { try { return sessionStorage.getItem(KLUCZ); } catch (e) { return null; } }
  function zapisz(v) { try { if (v) sessionStorage.setItem(KLUCZ, v); else sessionStorage.removeItem(KLUCZ); } catch (e) { /* tryb prywatny */ } }

  var html = document.documentElement;
  var wejscie = czytaj();
  if (!CELE[wejscie] || !ruch) wejscie = null;
  zapisz(null);
  if (wejscie) {
    html.classList.add('przejscie-wejscie');
    html.style.background = CELE[wejscie].tlo;
  }

  var kurtyna = null;
  function zbuduj(cel) {
    if (!kurtyna) {
      kurtyna = document.createElement('div');
      kurtyna.className = 'kurtyna-strony';
      kurtyna.setAttribute('aria-hidden', 'true');
      kurtyna.innerHTML = '<div class="kurtyna-strony-srodek"><div class="kurtyna-strony-ikona"></div><div class="kurtyna-strony-napis"></div></div>';
      document.body.appendChild(kurtyna);
    }
    kurtyna.setAttribute('data-cel', cel);
    kurtyna.querySelector('.kurtyna-strony-ikona').innerHTML = IKONY[cel];
    var napis = kurtyna.querySelector('.kurtyna-strony-napis');
    if (cel === 'arena') napis.innerHTML = 'ARENA <b>GOAT</b>ÓW';
    else napis.textContent = CELE[cel].napis;
    kurtyna.hidden = false;
    return kurtyna;
  }
  function zatrzymaj(el) { el.getAnimations().forEach(function (a) { a.cancel(); }); }

  /* Wyjście: kurtyna rośnie od punktu stuknięcia, potem przejście na nową stronę. */
  function wyjdz(cel, href, p) {
    if (!ruch || !document.body.animate) { location.href = href; return; }
    zapisz(cel);
    var k = zbuduj(cel);
    var srodek = k.querySelector('.kurtyna-strony-srodek');
    zatrzymaj(k); zatrzymaj(srodek);
    var r = Math.hypot(Math.max(p.x, innerWidth - p.x), Math.max(p.y, innerHeight - p.y)) + 20;
    var a = k.animate([
      { clipPath: 'circle(0px at ' + p.x + 'px ' + p.y + 'px)' },
      { clipPath: 'circle(' + r + 'px at ' + p.x + 'px ' + p.y + 'px)' }
    ], { duration: 560, easing: 'cubic-bezier(.7, 0, .3, 1)', fill: 'forwards' });
    srodek.animate([
      { opacity: 0, transform: 'scale(0.3) rotate(-160deg)' },
      { opacity: 1, transform: 'scale(1) rotate(0deg)' }
    ], { duration: 650, delay: 120, easing: 'cubic-bezier(.2, .9, .25, 1.3)', fill: 'both' });
    a.onfinish = function () { setTimeout(function () { location.href = href; }, 200); };
  }

  var odslonieta = true, awaryjnie = null;
  /* Zasłona bez animacji wejścia (strona dopiero wstaje albo ładuje dane). */
  function zaslon(cel) {
    if (!ruch) return;
    var k = zbuduj(cel);
    zatrzymaj(k); zatrzymaj(k.querySelector('.kurtyna-strony-srodek'));
    odslonieta = false;
    html.classList.remove('przejscie-wejscie');
    html.style.background = '';
    // strona, która nie odsłoni się sama (zrzutka), odsłania się po chwili
    clearTimeout(awaryjnie);
    awaryjnie = setTimeout(odslon, 4000);
  }
  function odslon() {
    clearTimeout(awaryjnie);
    if (odslonieta || !kurtyna) return;
    odslonieta = true;
    var k = kurtyna;
    var srodek = k.querySelector('.kurtyna-strony-srodek');
    srodek.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.85) translateY(-10px)' }
    ], { duration: 260, easing: 'ease-in', fill: 'forwards' });
    var a = k.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(1.06)' }
    ], { duration: 460, delay: 120, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = function () { k.hidden = true; zatrzymaj(k); zatrzymaj(srodek); };
  }

  window.PRZEJSCIE = { wejscie: wejscie, zaslon: zaslon, odslon: odslon, wyjdz: wyjdz };

  document.addEventListener('DOMContentLoaded', function () {
    if (wejscie && !kurtyna) {
      zaslon(wejscie);
      // strona może chcieć odsłonić się dopiero z danymi (Arena) — inne po krótkiej chwili
      if (!html.hasAttribute('data-przejscie-czeka')) setTimeout(odslon, 350);
    }
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-przejscie]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var cel = a.getAttribute('data-przejscie');
      if (!CELE[cel]) return;
      e.preventDefault();
      wyjdz(cel, a.href, { x: e.clientX || innerWidth / 2, y: e.clientY || 40 });
    });
  });

  // powrót „wstecz” z pamięci przeglądarki: kurtyna z wyjścia nie może zostać na ekranie
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && kurtyna) { kurtyna.hidden = true; zatrzymaj(kurtyna); odslonieta = true; }
  });
})();
