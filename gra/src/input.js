/* Sterowanie: klawiatura, przyciski dotykowe i wskaźnik (mysz albo palec).

   Samo niczego nie liczy: przepisuje wciśnięcia do state.input i woła
   funkcje z sim.js wyłącznie wtedy, gdy gracz faktycznie ma turę
   (opts.mogeGrac()). Strzał wychodzi do sieci przez state.akcjeDoWyslania,
   którą zbiera protokół — tu nie ma żadnej wysyłki.

   Na planszy:
   - w swojej turze przeciągnięcie celuje (albo wskazuje cel nalotu),
   - poza nią przesuwa kamerę; dwa palce albo kółko myszy — zoom. */

import * as S from './sim.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';

const MAPA = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyW: 'aimUp', ArrowUp: 'aimUp',
  KeyS: 'aimDown', ArrowDown: 'aimDown'
};
const RUCHY = ['left', 'right', 'aimUp', 'aimDown'];

export function attachInput(opts) {
  const wcisniete = new Set();     // kody klawiszy
  const trzymane = new Set();      // akcje trzymanych przycisków dotykowych
  let spust = false;               // spust wciśnięty (F, Enter albo przycisk)

  const stan = () => opts.getState();

  function nacisnijSpust() {
    const st = stan();
    if (!st || spust || !opts.mogeGrac()) return;
    if (!S.startCharging(st)) {
      const w = S.activeWorm(st);
      const bron = WEAPONS[st.weapon];
      if (bron && bron.celowany && !st.cel) opts.onPodpowiedz?.('Najpierw wskaż cel nalotu na mapie.');
      else if (w && (w.amunicja[st.weapon] ?? 1) <= 0) opts.onPodpowiedz?.('Ta broń się skończyła.');
      return;
    }
    spust = true;
  }

  function pusscSpust() {
    if (!spust) return;
    spust = false;
    const st = stan();
    if (st) S.releaseFire(st);   // bez ładowania (koniec tury, pełna moc) nic nie robi
  }

  const mogeChodzic = () => opts.mogeGrac() || !!opts.mogeUciekac?.();

  function skok() {
    const st = stan();
    if (st && mogeChodzic()) S.jump(st);
  }

  /* ---------- klawiatura ---------- */

  function onDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!stan()) return;

    // Strzał: przytrzymaj F albo Enter. Spacja to skok — tak jak w innych grach,
    // wcześniejsze „spacja = strzał” myliło graczy.
    if (e.code === 'KeyF' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (!e.repeat) nacisnijSpust();
      return;
    }
    if (wcisniete.has(e.code)) return;
    wcisniete.add(e.code);

    if (e.code === 'Space' || e.code === 'KeyJ') { e.preventDefault(); skok(); return; }

    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'].indexOf(e.code);
    if (idx >= 0 && idx < WEAPON_ORDER.length) {
      opts.onBron?.(WEAPON_ORDER[idx]);
      return;
    }
    if (MAPA[e.code]) e.preventDefault();
  }

  function onUp(e) {
    wcisniete.delete(e.code);
    if (e.code === 'KeyF' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      pusscSpust();
    }
  }

  function onBlur() {
    wcisniete.clear();
    trzymane.clear();
    pusscSpust();
  }

  /* ---------- przyciski dotykowe ---------- */

  function podepnijPrzycisk(btn) {
    const akcja = btn.dataset.akcja;
    const puszczony = (e) => {
      if (e && e.pointerId !== undefined && btn.hasPointerCapture?.(e.pointerId)) {
        btn.releasePointerCapture(e.pointerId);
      }
      btn.classList.remove('wcisniety');
      if (RUCHY.includes(akcja)) trzymane.delete(akcja);
      else if (akcja === 'fire') pusscSpust();
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch { /* stare przeglądarki */ }
      btn.classList.add('wcisniety');
      if (RUCHY.includes(akcja)) trzymane.add(akcja);
      else if (akcja === 'jump') skok();
      else if (akcja === 'fire') nacisnijSpust();
    });
    btn.addEventListener('pointerup', puszczony);
    btn.addEventListener('pointercancel', puszczony);
    btn.addEventListener('lostpointercapture', puszczony);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  if (opts.przyciski) {
    for (const btn of opts.przyciski.querySelectorAll('[data-akcja]')) podepnijPrzycisk(btn);
  }

  /* ---------- plansza: celowanie, kamera, zoom ---------- */

  const plotno = opts.plotno;
  const wskazniki = new Map();       // pointerId -> {x, y}
  let tryb = null;                    // 'celuj' | 'kamera' | 'szczypanie'
  let szczypanieOd = 0;
  // Zwykłe stuknięcie nie może przejmować kamery — przesuwamy dopiero,
  // gdy palec (albo mysz) odjedzie kawałek od miejsca dotknięcia.
  const PROG_PRZESUNIECIA = 10;
  let startKamery = null;             // {x, y} dotknięcia; null = już przesuwamy

  function punkt(e) {
    const r = plotno.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function celuj(p) {
    const st = stan();
    if (!st || !opts.mogeGrac()) return;
    const swiat = opts.ekranNaSwiat(p.x, p.y);
    if (WEAPONS[st.weapon] && WEAPONS[st.weapon].celowany) {
      S.ustawCel(st, swiat.x, swiat.y);
      return;
    }
    const w = S.activeWorm(st);
    if (!w) return;
    const oy = w.y - S.WORM_H * 0.55;
    if (Math.abs(swiat.x - w.x) + Math.abs(swiat.y - oy) < 6) return;   // za blisko, kąt skakałby
    S.ustawCelownik(st, Math.atan2(swiat.y - oy, swiat.x - w.x));
  }

  function odleglosc() {
    const [a, b] = [...wskazniki.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  plotno.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { plotno.setPointerCapture(e.pointerId); } catch { /* nic */ }
    const p = punkt(e);
    wskazniki.set(e.pointerId, p);
    if (wskazniki.size === 2) {
      tryb = 'szczypanie';
      szczypanieOd = odleglosc();
      return;
    }
    if (wskazniki.size > 2) return;
    if (opts.mogeGrac()) { tryb = 'celuj'; celuj(p); }
    else { tryb = 'kamera'; startKamery = p; }
  });

  plotno.addEventListener('pointermove', (e) => {
    if (!wskazniki.has(e.pointerId)) return;
    const p = punkt(e);
    const poprz = wskazniki.get(e.pointerId);
    wskazniki.set(e.pointerId, p);
    if (tryb === 'szczypanie' && wskazniki.size === 2) {
      const d = odleglosc();
      if (szczypanieOd > 10) opts.onZoom?.(d / szczypanieOd);
      szczypanieOd = d;
    } else if (tryb === 'celuj') {
      celuj(p);
    } else if (tryb === 'kamera') {
      if (startKamery) {
        if (Math.hypot(p.x - startKamery.x, p.y - startKamery.y) < PROG_PRZESUNIECIA) return;
        opts.onPrzesun?.(p.x - startKamery.x, p.y - startKamery.y);
        startKamery = null;
      } else {
        opts.onPrzesun?.(p.x - poprz.x, p.y - poprz.y);
      }
    }
  });

  const koniecWskaznika = (e) => {
    wskazniki.delete(e.pointerId);
    if (wskazniki.size === 0) tryb = null;
    else if (tryb === 'szczypanie') { tryb = 'kamera'; startKamery = [...wskazniki.values()][0]; }
  };
  plotno.addEventListener('pointerup', koniecWskaznika);
  plotno.addEventListener('pointercancel', koniecWskaznika);
  plotno.addEventListener('contextmenu', (e) => e.preventDefault());

  plotno.addEventListener('wheel', (e) => {
    e.preventDefault();
    opts.onZoom?.(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  /* Wołane co klatkę: przepisuje wciśnięte klawisze i przyciski do stanu. */
  function apply() {
    const st = stan();
    if (!st) return;
    for (const k of RUCHY) st.input[k] = false;
    if (!opts.mogeGrac()) {
      if (spust && !st.charging) spust = false;
      if (!opts.mogeUciekac?.()) return;
      // ucieczka po dynamicie: tylko chodzenie
      for (const code of wcisniete) { const a = MAPA[code]; if (a === 'left' || a === 'right') st.input[a] = true; }
      for (const a of trzymane) if (a === 'left' || a === 'right') st.input[a] = true;
      return;
    }
    for (const code of wcisniete) {
      const akcja = MAPA[code];
      if (akcja) st.input[akcja] = true;
    }
    for (const akcja of trzymane) st.input[akcja] = true;
  }

  return { apply, zwolnij: onBlur };
}
