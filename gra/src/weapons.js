/* Definicje broni. Czysty opis liczbowy, bez logiki i bez DOM —
   sim.js czyta stąd parametry, render.js kolory i nazwy.

   amunicja: ile sztuk ma każdy robal na całą partię (brak pola = bez limitu).
   ukryta: pocisk pomocniczy (odłamek, rakieta nalotu) — nie da się go wybrać. */

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
    opis: 'Ładuj moc, uważaj na wiatr'
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
    opis: 'Odbija się, wybucha po 3 s'
  },
  strzelba: {
    id: 'strzelba',
    name: 'Strzelba',
    key: '3',
    kind: 'hitscan',       // trafia od razu po prostej, bez wiatru i grawitacji
    zasieg: 460,
    bezposrednie: 24,      // obrażenia przy trafieniu prosto w robala
    radius: 14,
    damage: 14,
    knockback: 130,
    fuse: null,
    bezMocy: true,
    opis: 'Strzał po prostej, bez ładowania'
  },
  kasetowa: {
    id: 'kasetowa',
    name: 'Kasetówka',
    key: '4',
    kind: 'odbijany',
    speed: 540,
    gravityFactor: 1,
    windFactor: 0.3,
    restitution: 0.5,
    radius: 30,
    damage: 22,
    knockback: 170,
    fuse: 2.4,
    odlamki: true,         // po wybuchu rozsypuje pięć odłamków
    amunicja: 2,
    opis: 'Granat, który rozsypuje odłamki'
  },
  dynamit: {
    id: 'dynamit',
    name: 'Dynamit',
    key: '5',
    kind: 'podkladany',    // ląduje pod nogami, długi zapalnik, duży wybuch
    speed: 0,
    gravityFactor: 1,
    windFactor: 0,
    restitution: 0.2,
    radius: 78,
    damage: 72,
    knockback: 380,
    fuse: 5,              // 3,5 s ucieczki + chwila na odbiegnięcie
    bezMocy: true,
    amunicja: 2,
    opis: 'Podłóż i uciekaj — 4 s'
  },
  nalot: {
    id: 'nalot',
    name: 'Nalot',
    key: '6',
    kind: 'nalot',         // pięć rakiet spada z nieba na wskazany punkt
    rakiety: 5,
    rozstaw: 30,
    radius: 0,
    damage: 0,
    knockback: 0,
    fuse: null,
    bezMocy: true,
    celowany: true,        // wymaga wskazania celu na mapie
    amunicja: 1,
    opis: 'Kliknij cel na mapie, potem strzał'
  },

  /* --- pociski pomocnicze --- */
  odlamek: {
    id: 'odlamek',
    name: 'Odłamek',
    kind: 'pocisk',
    speed: 0,
    gravityFactor: 1,
    windFactor: 0.4,
    radius: 24,
    damage: 20,
    knockback: 150,
    fuse: null,
    ukryta: true
  },
  rakieta: {
    id: 'rakieta',
    name: 'Rakieta',
    kind: 'pocisk',
    speed: 0,
    gravityFactor: 0.6,
    windFactor: 0.35,
    radius: 36,
    damage: 28,
    knockback: 200,
    fuse: null,
    ukryta: true
  }
};

export const WEAPON_ORDER = ['bazooka', 'granat', 'strzelba', 'kasetowa', 'dynamit', 'nalot'];

/* Startowy zapas dla broni z limitem — ta sama wartość u każdego klienta. */
export function startowaAmunicja() {
  const a = {};
  for (const id of WEAPON_ORDER) {
    if (WEAPONS[id].amunicja !== undefined) a[id] = WEAPONS[id].amunicja;
  }
  return a;
}
