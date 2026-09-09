/* Klawiatura. Trzyma tylko stan wciśniętych klawiszy i przekłada go na
   state.input — sama nie dotyka fizyki. */

import * as S from './sim.js';
import { WEAPON_ORDER } from './weapons.js';

const MAPA = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyW: 'aimUp', ArrowUp: 'aimUp',
  KeyS: 'aimDown', ArrowDown: 'aimDown'
};

export function attachInput(getState, opts = {}) {
  const wcisniete = new Set();

  function czyMojaTura(state) {
    if (!state || state.phase !== 'aim') return false;
    if (!opts.mojeId) return true;          // hot-seat: sterujesz każdym
    const w = S.activeWorm(state);
    return !!w && w.id === opts.mojeId;
  }

  function onDown(e) {
    const state = getState();
    if (!state) return;

    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      if (czyMojaTura(state)) S.startCharging(state);
      return;
    }
    if (wcisniete.has(e.code)) return;
    wcisniete.add(e.code);

    if (e.code === 'Enter') {
      if (czyMojaTura(state)) S.jump(state);
      return;
    }
    const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (idx >= 0 && idx < WEAPON_ORDER.length) {
      if (czyMojaTura(state) && !state.firedThisTurn) {
        state.weapon = WEAPON_ORDER[idx];
        opts.onWeaponChange?.(state.weapon);
      }
      return;
    }
    if (MAPA[e.code]) e.preventDefault();
  }

  function onUp(e) {
    const state = getState();
    wcisniete.delete(e.code);
    if (!state) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (czyMojaTura(state)) {
        const akcja = S.releaseFire(state);
        if (akcja) opts.onFire?.(akcja);
      }
    }
  }

  function onBlur() {
    wcisniete.clear();
    const state = getState();
    if (state) state.input = { left: false, right: false, aimUp: false, aimDown: false };
  }

  /* Wołane co klatkę: przepisuje wciśnięte klawisze do stanu symulacji. */
  function apply() {
    const state = getState();
    if (!state) return;
    const mozna = czyMojaTura(state);
    for (const k of ['left', 'right', 'aimUp', 'aimDown']) state.input[k] = false;
    if (!mozna) return;
    for (const code of wcisniete) {
      const akcja = MAPA[code];
      if (akcja) state.input[akcja] = true;
    }
  }

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  return { apply, destroy() {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onBlur);
  } };
}
