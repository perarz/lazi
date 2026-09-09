/* Definicje broni. Czysty opis liczbowy, bez logiki i bez DOM —
   sim.js czyta stąd parametry, render.js kolory i nazwy. */

export const WEAPONS = {
  bazooka: {
    id: 'bazooka',
    name: 'Bazooka',
    key: '1',
    kind: 'pocisk',        // leci i wybucha przy pierwszym kontakcie
    speed: 720,            // px/s przy pełnej mocy
    gravityFactor: 1,
    windFactor: 1,         // najbardziej czuła na wiatr
    radius: 52,
    damage: 48,
    knockback: 260,
    fuse: null,
    aimed: true
  },
  granat: {
    id: 'granat',
    name: 'Granat',
    key: '2',
    kind: 'odbijany',      // odbija się od terenu, wybucha po zapalniku
    speed: 560,
    gravityFactor: 1,
    windFactor: 0.25,
    restitution: 0.55,
    radius: 46,
    damage: 42,
    knockback: 240,
    fuse: 3,
    aimed: true
  },
  dynamit: {
    id: 'dynamit',
    name: 'Dynamit',
    key: '3',
    kind: 'podkladany',    // ląduje pod nogami, długi zapalnik, duży wybuch
    speed: 0,
    gravityFactor: 1,
    windFactor: 0,
    restitution: 0.2,
    radius: 78,
    damage: 72,
    knockback: 380,
    fuse: 4,
    aimed: false
  }
};

export const WEAPON_ORDER = ['bazooka', 'granat', 'dynamit'];
