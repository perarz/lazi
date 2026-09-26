/* Drużyny: nazwy i kolory (nick gracza w grze i nagłówek w lobby).
   Kolor robala zostaje własny — z drużyny jest tylko kolor nicku. */

export const DRUZYNY = [
  { nazwa: 'Czerwoni', kolor: '#ff5a64' },
  { nazwa: 'Niebiescy', kolor: '#4ea3ff' },
  { nazwa: 'Zieloni', kolor: '#5ec26a' },
  { nazwa: 'Żółci', kolor: '#ffd93b' }
];

/* Tryby w lobby: 0 = każdy na każdego, n = tyle drużyn. */
export const TRYBY = [0, 2, 3, 4];

export function nazwaTrybu(n) {
  return n ? n + ' drużyny' : 'Każdy na każdego';
}
