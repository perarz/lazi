/* Deterministyczny generator liczb — jedyne źródło losowości w symulacji.
   W sim.js i terrain.js nie ma ani jednego Math.random(): dzięki temu
   ten sam seed zawsze daje tę samą mapę i tę samą kolejność tur. */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/* Szum wartościowy 1D. Interpolacja smoothstepem, a nie cosinusem —
   smoothstep to wielomian, więc daje bit w bit ten sam wynik w każdym
   silniku JS, w przeciwieństwie do Math.cos. */
export function valueNoise1D(rng, size) {
  const v = new Float64Array(size);
  for (let i = 0; i < size; i++) v[i] = rng();

  return function (x) {
    const xi = Math.floor(x);
    const f = x - xi;
    const a = v[((xi % size) + size) % size];
    const b = v[((((xi + 1) % size) + size) % size)];
    return a + (b - a) * (f * f * (3 - 2 * f));
  };
}

export function smoothstep(edge0, edge1, x) {
  let t = (x - edge0) / (edge1 - edge0);
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return t * t * (3 - 2 * t);
}

/* Tani hash stanu — służy do wykrycia rozjazdu symulacji między klientami. */
export function hashNumbers(values) {
  let h = 0x811c9dc5;
  for (let i = 0; i < values.length; i++) {
    const n = Math.round(values[i]) | 0;   // pełne piksele: świat to maska
    h ^= n & 0xff;         h = Math.imul(h, 0x01000193);
    h ^= (n >>> 8) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (n >>> 16) & 0xff; h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
