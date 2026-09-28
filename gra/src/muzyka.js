/* Muzyka Areny (4.10): siedem utworów zamiast jednej 9-sekundowej pętli.

   Plików z muzyką nie ma (z sesji, w której to powstało, serwisy z darmową muzyką były
   zablokowane), więc utwory są „zapisane nutami”: każdy ma tonację, tempo, akordy części
   i formę (np. wstęp, A, A*, B, A, C, B, A, koniec). Melodie, bas, akompaniament i bębny
   składa z tego ten plik — melodia z motywem, który wraca, odpowiedzią i kadencją,
   a „A*” to ta sama część z odmienioną drugą połową i drugim głosem tercję niżej.
   Losowanie ma stały seed, więc utwór brzmi zawsze tak samo.

   Czyste dane, bez Web Audio (gra je dzwieki.js) — da się to sprawdzić w Node.
   Utwór = kroki szesnastkowe; w kroku lista nut [instrument, midi, długość w krokach, głośność]. */

import { mulberry32 } from './rng.js';

const LITERY = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const RODZAJE = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6], sus: [0, 5, 7] };
const SKALE = {
  moll: [0, 2, 3, 5, 7, 8, 10],
  harm: [0, 2, 3, 5, 7, 8, 11],          // moll harmoniczna — marsz i western
  dur: [0, 2, 4, 5, 7, 9, 11],
  blues: [0, 3, 4, 5, 7, 9, 10]          // pentatonika z tercją wielką i sekstą — do bluesa na septymach
};

/* ---------- style: rytmy melodii, bas, akompaniament, bębny ---------- */

// Rytmy dwutaktowych fraz: [krok, długość]; m = motyw, o = odpowiedź, k = kadencja, p = wypełnienie.
const STYLE = {
  marsz: {
    rytm: {
      m: [[[0, 6], [6, 2], [8, 4], [12, 4], [16, 6], [22, 2], [24, 8]], [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4], [16, 4], [20, 4], [24, 8]]],
      o: [[[0, 4], [4, 4], [8, 2], [10, 2], [12, 4], [16, 8], [24, 4], [28, 4]], [[0, 2], [2, 2], [4, 4], [8, 4], [12, 4], [16, 6], [22, 2], [24, 8]]],
      k: [[[0, 4], [4, 4], [8, 8], [16, 16]], [[0, 6], [6, 2], [8, 8], [16, 16]]],
      p: [[[24, 4], [28, 4]], [[28, 2], [30, 2]]]
    },
    artykulacja: 0.82, bas: 'marsz', akomp: 'stab', bebny: 'marsz'
  },
  blues: {
    rytm: {
      m: [[[0, 2], [2, 4], [6, 2], [8, 6], [16, 4], [20, 2], [22, 4]], [[2, 2], [4, 2], [6, 4], [10, 2], [12, 8], [22, 2], [24, 4]]],
      o: [[[0, 2], [2, 2], [4, 2], [6, 4], [10, 2], [12, 4], [16, 8], [24, 4], [28, 2]], [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2], [12, 6], [18, 2], [20, 8]]],
      k: [[[0, 4], [4, 2], [6, 2], [8, 8], [16, 14]], [[0, 2], [2, 2], [4, 4], [8, 4], [12, 4], [16, 14]]],
      p: [[[26, 2], [28, 2]], [[24, 2], [26, 2], [28, 4]]]
    },
    artykulacja: 0.9, bas: 'walking', akomp: 'charleston', bebny: 'blues'
  },
  chip: {
    rytm: {
      m: [[[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4], [16, 2], [18, 2], [20, 2], [22, 2], [24, 8]],
        [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2], [16, 4], [20, 4], [24, 4], [28, 4]]],
      o: [[[0, 3], [3, 3], [6, 2], [8, 4], [12, 4], [16, 3], [19, 3], [22, 2], [24, 4], [28, 4]],
        [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4], [16, 2], [18, 2], [20, 4], [24, 8]]],
      k: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 8], [16, 16]], [[0, 4], [4, 4], [8, 4], [12, 4], [16, 16]]],
      p: [[[28, 2], [30, 2]], [[24, 2], [26, 2], [28, 2], [30, 2]]]
    },
    artykulacja: 0.75, bas: 'chip', akomp: 'arp16', bebny: 'chip'
  },
  western: {
    rytm: {
      m: [[[0, 8], [8, 4], [12, 4], [16, 12], [28, 4]], [[0, 6], [6, 2], [8, 8], [16, 8], [24, 4], [28, 4]]],
      o: [[[0, 4], [4, 4], [8, 8], [16, 4], [20, 4], [24, 8]], [[0, 2], [2, 2], [4, 4], [8, 8], [16, 12], [28, 4]]],
      k: [[[0, 8], [8, 8], [16, 16]], [[0, 4], [4, 4], [8, 8], [16, 16]]],
      p: [[[28, 4]], [[24, 4], [28, 4]]]
    },
    artykulacja: 0.95, bas: 'galop', akomp: null, bebny: 'western'
  },
  polka: {
    rytm: {
      m: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 4], [16, 2], [18, 2], [20, 2], [22, 2], [24, 8]],
        [[0, 4], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2], [16, 4], [20, 4], [24, 8]]],
      o: [[[0, 4], [4, 2], [6, 2], [8, 4], [12, 4], [16, 4], [20, 4], [24, 4], [28, 4]],
        [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4], [16, 4], [20, 4], [24, 8]]],
      k: [[[0, 2], [2, 2], [4, 4], [8, 4], [12, 4], [16, 8]], [[0, 4], [4, 4], [8, 4], [12, 4], [16, 8]]],
      p: [[[28, 2], [30, 2]], [[26, 2], [28, 2], [30, 2]]]
    },
    artykulacja: 0.6, bas: 'polka', akomp: 'stab', bebny: 'polka'
  },
  wolny: {
    rytm: {
      m: [[[0, 12], [12, 4], [16, 16]], [[0, 8], [8, 8], [16, 12], [28, 4]]],
      o: [[[0, 8], [8, 8], [16, 8], [24, 8]], [[4, 4], [8, 8], [16, 16]]],
      k: [[[0, 16], [16, 16]], [[0, 8], [8, 8], [16, 16]]],
      p: [[], [[24, 8]]]
    },
    artykulacja: 1, bas: 'dlugi', akomp: 'pad', bebny: 'wolny'
  },
  synth: {
    rytm: {
      m: [[[0, 4], [4, 2], [6, 6], [12, 4], [16, 4], [20, 4], [24, 8]], [[0, 6], [6, 6], [12, 4], [16, 6], [22, 2], [24, 8]]],
      o: [[[0, 2], [2, 2], [4, 4], [8, 4], [12, 4], [16, 6], [22, 2], [24, 8]], [[0, 4], [4, 4], [8, 8], [16, 4], [20, 4], [24, 8]]],
      k: [[[0, 6], [6, 6], [12, 4], [16, 16]], [[0, 4], [4, 4], [8, 8], [16, 16]]],
      p: [[[28, 4]], [[24, 2], [26, 2], [28, 4]]]
    },
    artykulacja: 0.9, bas: 'puls', akomp: 'pad', bebny: 'synth'
  }
};

// Bas: [krok, co, długość]; r = pryma, q = kwinta, o = oktawa, t = tercja, x = dojście do następnego akordu.
const BASY = {
  marsz: [[0, 'r', 3], [4, 'q', 3], [8, 'r', 3], [12, 'q', 3]],
  walking: [[0, 'r', 4], [4, 't', 4], [8, 'q', 4], [12, 'x', 4]],
  galop: [[0, 'r', 2], [3, 'r', 1], [4, 'q', 3], [8, 'r', 2], [11, 'r', 1], [12, 'q', 3]],
  polka: [[0, 'r', 3], [8, 'q', 3]],
  dlugi: [[0, 'r', 16]],
  puls: [[0, 'r', 2], [2, 'r', 2], [4, 'r', 2], [6, 'r', 2], [8, 'r', 2], [10, 'r', 2], [12, 'r', 2], [14, 'o', 2]],
  chip: [[0, 'r', 2], [2, 'o', 2], [4, 'r', 2], [6, 'o', 2], [8, 'r', 2], [10, 'o', 2], [12, 'q', 2], [14, 'o', 2]]
};

// Akompaniament: kroki akordu [krok, długość].
const AKOMP = {
  stab: [[4, 2], [12, 2]],
  charleston: [[0, 3], [6, 2], [8, 3], [14, 2]],
  pad: [[0, 16]]
};

// Bębny: 16 kroków na takt; „przejscie” podmienia ostatni takt części.
const BEBNY = {
  marsz: { stopa: 'x.......x.......', werbel: '....x.......x...', hihat: 'x.x.x.x.x.x.x.x.', przejscie: { werbel: '....x...x.x.xxxx' } },
  blues: { stopa: 'x.......x.......', werbel: '....x.......x...', hihat: 'x.x.x.x.x.x.x.x.', przejscie: { werbel: '....x.....x.x.x.' } },
  chip: { stopa: 'x.....x.x.......', szum: '....x.......x...', hihat: 'x.x.x.x.x.x.x.x.', przejscie: { szum: '....x...x.x.xxxx' } },
  western: { stopa: 'x.......x.......', klapak: 'x..x..x.x..x..x.', hihat: '....x.......x...', przejscie: { tom: '........x.x.x.x.' } },
  polka: { stopa: 'x.......x.......', werbel: '....x.......x...', hihat: '..x...x...x...x.', przejscie: { werbel: '....x...x.x.x.x.' } },
  wolny: { stopa: 'x.........x.....', hihat: '........x.......', przejscie: { tom: '..........x.x.xx' } },
  synth: { stopa: 'x...x...x...x...', werbelDuzy: '....x.......x...', hihat: '..x...x...x...x.', przejscie: { werbelDuzy: '....x...x.x.xxxx' } }
};
const LEKKIE = ['hihat', 'klapak'];     // perkusja „lekka”: tylko to + stopa na raz

/* ---------- utwory ---------- */

export const UTWORY = [
  {
    id: 'marsz', nazwa: 'Marsz GOATów', bpm: 112, ton: 2, skala: 'harm', styl: 'marsz', srodek: 69,
    brzmienie: { melodia: 'trabka', bas: 'bas', akomp: 'stab', arp: 'arp' },
    czesci: {
      W: { akordy: ['Dm', 'Dm'], melodia: false, akomp: false, perkusja: 'wstep' },
      A: { akordy: ['Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'Gm A7', 'Dm'], temat: 'a' },
      B: { akordy: ['F', 'C', 'Dm', 'A7', 'F', 'C', 'Bb A7', 'Dm'], temat: 'b' },
      C: { akordy: ['Gm', 'Dm', 'Gm', 'A7', 'Gm', 'Dm', 'Bb', 'A7'], temat: 'c', melodia: 'dzwonek', oktawa: 12, perkusja: 'lekka', akomp: false, arp: 'arp8' },
      K: { akordy: ['Dm'], koniec: true }
    },
    forma: ['W', 'A', 'A*', 'B', 'A', 'C', 'B*', 'A*', 'K']
  },
  {
    id: 'blues', nazwa: 'Blues z lawy', bpm: 92, swing: 0.66, ton: 4, skala: 'blues', styl: 'blues', srodek: 67,
    brzmienie: { melodia: 'organy', bas: 'bas', akomp: 'organyAkord' },
    czesci: {
      W: { akordy: ['B7', 'A7', 'E7', 'B7'], melodia: false },
      A: { akordy: ['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7'], temat: 'a', frazy: ['m', 'p', 'm', 'p', 'o', 'k'] },
      S: { akordy: ['E7', 'A7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7'], temat: 's', frazy: ['o', 'o', 'o', 'o', 'o', 'k'], melodia: 'gitara' },
      K: { akordy: ['E7'], koniec: true }
    },
    forma: ['W', 'A', 'A*', 'S', 'S*', 'A', 'K']
  },
  {
    id: 'chip', nazwa: '8-bitowa rzeźnia', bpm: 150, ton: 9, skala: 'moll', styl: 'chip', srodek: 76,
    brzmienie: { melodia: 'kwadrat', bas: 'bas8', arp: 'arp8bit' },
    czesci: {
      W: { akordy: ['Am', 'F', 'C', 'G'], melodia: false, perkusja: 'lekka' },
      A: { akordy: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'E'], temat: 'a' },
      B: { akordy: ['Dm', 'Am', 'E', 'Am', 'Dm', 'G', 'C', 'E'], temat: 'b' },
      C: { akordy: ['F', 'G', 'Am', 'Am', 'F', 'G', 'E', 'E'], melodia: false, perkusja: 'lekka' },
      K: { akordy: ['Am'], koniec: true }
    },
    forma: ['W', 'A', 'A*', 'B', 'C', 'A', 'B*', 'A*', 'K']
  },
  {
    id: 'western', nazwa: 'Pojedynek w kraterze', bpm: 98, ton: 4, skala: 'harm', styl: 'western', srodek: 74,
    brzmienie: { melodia: 'gwizd', bas: 'bas', arp: 'twang' },
    czesci: {
      W: { akordy: ['Em', 'Em'], melodia: false, perkusja: 'lekka' },
      A: { akordy: ['Em', 'Em', 'Am', 'Em', 'C', 'B7', 'Em', 'Em'], temat: 'a' },
      B: { akordy: ['G', 'D', 'Em', 'Em', 'C', 'D', 'B7', 'B7'], temat: 'b', melodia: 'twang', oktawa: -5 },
      C: { akordy: ['Am', 'Em', 'Am', 'B7', 'Am', 'Em', 'C B7', 'Em'], temat: 'c', perkusja: 'lekka', arp: 'twang' },
      K: { akordy: ['Em'], koniec: true }
    },
    forma: ['W', 'A', 'B', 'A*', 'C', 'B*', 'A', 'K']
  },
  {
    id: 'polka', nazwa: 'Polka nad lawą', bpm: 128, ton: 0, skala: 'dur', styl: 'polka', srodek: 76,
    brzmienie: { melodia: 'akordeon', bas: 'tuba', akomp: 'stab' },
    czesci: {
      W: { akordy: ['G7', 'G7'], melodia: false },
      A: { akordy: ['C', 'G7', 'G7', 'C', 'C', 'G7', 'G7', 'C'], temat: 'a' },
      B: { akordy: ['F', 'C', 'G7', 'C', 'F', 'C', 'G7', 'C'], temat: 'b' },
      T: { akordy: ['F', 'F', 'C7', 'F', 'Bb', 'F', 'C7', 'F'], temat: 't', skala: 5 },     // trio w F-dur
      K: { akordy: ['C'], koniec: true }
    },
    forma: ['W', 'A', 'A*', 'B', 'A', 'T', 'T*', 'A*', 'K']
  },
  {
    id: 'cisza', nazwa: 'Cisza przed nalotem', bpm: 76, ton: 0, skala: 'moll', styl: 'wolny', srodek: 76,
    brzmienie: { melodia: 'dzwonek', bas: 'basSaw', akomp: 'pad', arp: 'arp' },
    czesci: {
      W: { akordy: ['Cm', 'Cm', 'Ab', 'G'], melodia: false, perkusja: 'lekka' },
      A: { akordy: ['Cm', 'Cm', 'Ab', 'Ab', 'Fm', 'Fm', 'G', 'G'], temat: 'a' },
      B: { akordy: ['Cm', 'Eb', 'Bb', 'Ab', 'Fm', 'Ab', 'Gsus', 'G'], temat: 'b', arp: 'arp8' },
      C: { akordy: ['Ab', 'Bb', 'Cm', 'Cm', 'Ab', 'Bb', 'G', 'G'], temat: 'c', melodia: 'leadSaw', oktawa: -12, arp: 'arp16' },
      K: { akordy: ['Cm'], koniec: true }
    },
    forma: ['W', 'A', 'B', 'A*', 'C', 'B*', 'K']
  },
  {
    id: 'neon', nazwa: 'Neonowa lawa', bpm: 104, ton: 5, skala: 'moll', styl: 'synth', srodek: 72,
    brzmienie: { melodia: 'leadSaw', bas: 'basSaw', akomp: 'pad', arp: 'arp' },
    czesci: {
      W: { akordy: ['Fm', 'Db', 'Ab', 'Eb'], melodia: false, perkusja: 'lekka', arp: 'arp16' },
      A: { akordy: ['Fm', 'Db', 'Ab', 'Eb', 'Fm', 'Db', 'Ab', 'Eb'], temat: 'a' },
      B: { akordy: ['Bbm', 'Fm', 'Db', 'Eb', 'Bbm', 'Fm', 'Db', 'C'], temat: 'b', arp: 'arp16' },
      C: { akordy: ['Db', 'Eb', 'Fm', 'Fm', 'Db', 'Eb', 'C', 'C'], melodia: false, perkusja: 'lekka', arp: 'arp16' },
      K: { akordy: ['Fm'], koniec: true }
    },
    forma: ['W', 'A', 'A*', 'B', 'C', 'A', 'B*', 'K']
  }
];

/* ---------- składanie ---------- */

function akord(nazwa) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(nazwa);
  if (!m || !RODZAJE[m[3]]) throw new Error('nieznany akord: ' + nazwa);
  const pc = (LITERY[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { pc, tony: RODZAJE[m[3]].map((i) => (pc + i) % 12), nazwa };
}

function ziarno(tekst) {
  let h = 0x811c9dc5;
  for (let i = 0; i < tekst.length; i++) { h ^= tekst.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// najbliższa nuta z danych klas (pc) do punktu `blisko`; przy remisie ta w stronę `kier`
function najblizsza(pcs, blisko, kier = 1) {
  for (let d = 0; d < 12; d++) {
    for (const s of kier >= 0 ? [d, -d] : [-d, d]) {
      const n = blisko + s;
      if (pcs.includes(((n % 12) + 12) % 12)) return n;
    }
  }
  return blisko;
}

// nuty skali w zakresie — do chodzenia po stopniach
function drabina(skalaPc, od, do_) {
  const d = [];
  for (let n = od; n <= do_; n++) if (skalaPc.includes(n % 12)) d.push(n);
  return d;
}

/* Melodia części: frazy po dwa takty. Pierwszy motyw zapamiętany wraca w kolejnych „m”
   (dopasowany do akordów), „o” odpowiada nowym przebiegiem, „k” kończy na prymie akordu. */
function melodiaCzesci(rng, akordW, takty, skalaPc, srodek, style, frazy, zostawMotyw) {
  const nuty = [];
  const dr = drabina(skalaPc, srodek - 14, srodek + 16);
  const idx = (n) => { let b = 0; for (let i = 0; i < dr.length; i++) if (Math.abs(dr[i] - n) < Math.abs(dr[b] - n)) b = i; return b; };
  let prev = najblizsza(akordW(0).tony, srodek);
  let motyw = zostawMotyw ? zostawMotyw.motyw : null;
  const rytmy = {};
  for (const r of ['m', 'o', 'k', 'p']) rytmy[r] = style.rytm[r][Math.floor(rng() * style.rytm[r].length)];
  if (zostawMotyw) Object.assign(rytmy, zostawMotyw.rytmy);
  for (let f = 0; f < frazy.length && f * 2 < takty; f++) {
    const rola = frazy[f];
    const start = f * 32;
    if (rola === '-') continue;
    if (rola === 'm' && motyw) {
      // motyw wraca: te same rytmy i kontur, mocne części taktu poprawione do akordu
      for (const [k, n, dl] of motyw) {
        const a = akordW(start + k);
        const nn = k % 8 === 0 ? najblizsza(a.tony, n) : najblizsza(skalaPc, n);
        nuty.push([start + k, nn, dl]);
        prev = nn;
      }
      continue;
    }
    const rytm = rytmy[rola];
    const fraza = [];
    for (let i = 0; i < rytm.length; i++) {
      const [k, dl] = rytm[i];
      if (start + k >= takty * 16) break;
      const a = akordW(start + k);
      let n;
      const ostatnia = rola === 'k' && i === rytm.length - 1;
      if (ostatnia) {
        n = najblizsza([a.pc], Math.round((prev + srodek) / 2));   // kadencja: pryma między ostatnią nutą a środkiem
      } else {
        // chodzenie po stopniach skali: częściej krok, czasem skok, powrót do środka
        const los = rng();
        let o = los < 0.06 ? 0 : los < 0.55 ? 1 : los < 0.85 ? 2 : los < 0.95 ? 3 : 4;
        const wGore = prev > srodek + 5 ? rng() < 0.28 : prev < srodek - 5 ? rng() < 0.72 : rng() < 0.5;
        if (!wGore) o = -o;
        const j = Math.max(0, Math.min(dr.length - 1, idx(prev) + o));
        n = dr[j];
        if (k % 8 === 0) {
          // mocna część taktu: dźwięk akordu; gdy wyszłoby „w miejscu”, następny w stronę ruchu
          n = najblizsza(a.tony, n, o);
          if (n === prev && o !== 0) n = najblizsza(a.tony, prev + Math.sign(o) * 2, o);
        }
      }
      fraza.push([k, n, dl]);
      prev = n;
    }
    for (const [k, n, dl] of fraza) nuty.push([start + k, n, dl]);
    if (rola === 'm' && !motyw) motyw = fraza;
  }
  return { nuty, motyw, rytmy };
}

// drugi głos: tercja niżej po skali
function tercja(skalaPc, n) {
  const dr = drabina(skalaPc, n - 10, n);
  return dr.length >= 3 ? dr[dr.length - 3] : n - 3;
}

function wLosach(tekst) { return mulberry32(ziarno(tekst)); }

/* Cały utwór jako lista kroków. */
export function zbudujUtwor(def) {
  const style = STYLE[def.styl];
  const kroki = [];
  const dodaj = (k, instr, midi, dl, gl) => { (kroki[k] || (kroki[k] = [])).push([instr, midi, dl, gl]); };
  const tematy = new Map();        // temat → { motyw, rytmy } z pierwszego wystąpienia
  const melodie = new Map();       // część (z gwiazdką) → gotowe nuty: powtórka brzmi tak samo
  let k0 = 0;
  const forma = def.forma;
  for (let fi = 0; fi < forma.length; fi++) {
    const nazwa = forma[fi].replace('*', '');
    const wariant = forma[fi].endsWith('*');
    const cz = def.czesci[nazwa];
    const takty = cz.akordy.length;
    // akordy co pół taktu
    const polowy = [];
    for (const t of cz.akordy) {
      const [a, b] = t.split(' ');
      polowy.push(akord(a), akord(b || a));
    }
    const akordW = (k) => polowy[Math.min(polowy.length - 1, Math.floor(k / 8))];
    const tonika = cz.skala !== undefined ? cz.skala : def.ton;
    const skalaPc = SKALE[def.skala].map((i) => (i + tonika) % 12);
    const bez = (co) => cz[co] === false;

    if (cz.koniec) {
      // koniec: akord trzymany cały takt, talerz i cisza na wybrzmienie
      const a = akordW(0);
      const r = najblizsza([a.pc], 45);
      dodaj(k0, def.brzmienie.bas, r, 16, 1);
      for (const n of a.tony.slice(0, 3)) dodaj(k0, 'pad', najblizsza([n], 62), 16, 0.7);
      dodaj(k0, def.brzmienie.melodia, najblizsza([a.pc], def.srodek), 16, 0.9);
      dodaj(k0, 'stopa', 0, 1, 1);
      dodaj(k0, 'talerz', 0, 1, 0.9);
      k0 += 32;
      continue;
    }

    // melodia
    const glos = cz.melodia === false ? null : (typeof cz.melodia === 'string' ? cz.melodia : def.brzmienie.melodia);
    if (glos && cz.temat) {
      const frazy = cz.frazy || (takty >= 8 ? ['m', 'o', 'm', 'k'] : ['m', 'k']);
      const pierwszy = tematy.get(cz.temat);
      const klucz = forma[fi];
      // wariant (A*): ten sam motyw, nowe odpowiedzi i kadencja
      const m = melodie.get(klucz) || melodiaCzesci(wLosach(def.id + ':' + klucz), akordW, takty, skalaPc,
        def.srodek + (cz.oktawa || 0), style, frazy, pierwszy);
      melodie.set(klucz, m);
      if (!pierwszy) tematy.set(cz.temat, { motyw: m.motyw, rytmy: m.rytmy });
      const art = style.artykulacja;
      for (const [k, n, dl] of m.nuty) {
        const akcent = k % 16 === 0 ? 1 : k % 4 === 0 ? 0.85 : 0.7;
        dodaj(k0 + k, glos, n, Math.max(1, dl * art), akcent);
        if (wariant) dodaj(k0 + k, glos, tercja(skalaPc, n), Math.max(1, dl * art), akcent * 0.5);
      }
    }

    // bas
    const wzor = BASY[style.bas];
    for (let t = 0; t < takty; t++) {
      for (const [k, co, dl] of wzor) {
        const kk = t * 16 + k;
        const a = akordW(kk);
        const r = najblizsza([a.pc], 45);
        let n = r;
        if (co === 'q') n = r + 7 > 52 ? r - 5 : r + 7;
        else if (co === 'o') n = r + 12;
        else if (co === 't') n = najblizsza([a.tony[1]], r + 4, 1);
        else if (co === 'x') {
          const nast = najblizsza([akordW(Math.min(takty * 16 - 1, (t + 1) * 16)).pc], 45);
          n = t + 1 < takty ? (nast > r ? nast - 1 : nast + 1) : r + 7;
        }
        // „dlugi”: zmiana akordu w połowie taktu = nowa nuta basu
        const dlu = style.bas === 'dlugi' && akordW(kk + 8) !== a ? 8 : dl;
        dodaj(k0 + kk, def.brzmienie.bas, n, dlu, k === 0 ? 1 : 0.8);
        if (style.bas === 'dlugi' && dlu === 8) dodaj(k0 + kk + 8, def.brzmienie.bas, najblizsza([akordW(kk + 8).pc], 45), 8, 0.8);
      }
    }

    // akompaniament: akordy albo pad
    const akomp = cz.akomp === false || !AKOMP[style.akomp] || !def.brzmienie.akomp ? null : style.akomp;
    if (akomp) {
      for (let t = 0; t < takty; t++) {
        for (const [k, dl] of AKOMP[akomp]) {
          const kk = t * 16 + k;
          const a = akordW(kk);
          const dluga = akomp === 'pad' && akordW(kk + 8) !== a ? 8 : dl;
          for (const pc of a.tony) dodaj(k0 + kk, def.brzmienie.akomp, najblizsza([pc], 60, 1), dluga, 0.55);
          if (akomp === 'pad' && dluga === 8) for (const pc of akordW(kk + 8).tony) dodaj(k0 + kk + 8, def.brzmienie.akomp, najblizsza([pc], 60, 1), 8, 0.55);
        }
      }
    }

    // arpeggio (szesnastki albo ósemki po dźwiękach akordu, w górę i w dół)
    const arp = cz.arp || (style.akomp && style.akomp.startsWith('arp') ? style.akomp : null);
    if (arp && def.brzmienie.arp) {
      const co = arp === 'arp8' ? 2 : 1;
      const instr = arp === 'twang' ? 'twang' : def.brzmienie.arp;
      const krok = arp === 'twang' ? 4 : co;
      for (let kk = 0; kk < takty * 16; kk += krok) {
        const a = akordW(kk);
        const sek = [0, 1, 2, 3, 2, 1];
        const i = sek[(kk / krok) % sek.length];
        const pc = a.tony[i % a.tony.length];
        const n = najblizsza([pc], (arp === 'twang' ? 55 : 64) + (i >= a.tony.length ? 12 : 0) + i * 2, 1);
        dodaj(k0 + kk, instr, n, krok, kk % 8 === 0 ? 0.8 : 0.55);
      }
    }

    // bębny; w ostatnim takcie części przejście, na początku części talerz
    const perk = cz.perkusja || 'pelna';
    const bb = BEBNY[style.bebny];
    if (perk !== 'brak') {
      for (let t = 0; t < takty; t++) {
        const przejscie = t === takty - 1 && fi + 1 < forma.length && (perk === 'pelna' || perk === 'wstep');
        const wzory = { ...bb, ...(przejscie ? bb.przejscie : {}) };
        delete wzory.przejscie;
        for (const [instr, wz] of Object.entries(wzory)) {
          if (perk === 'lekka' && instr !== 'stopa' && !LEKKIE.includes(instr)) continue;
          if (perk === 'wstep' && instr !== 'werbel') continue;
          for (let k = 0; k < 16; k++) {
            if (wz[k] !== 'x') continue;
            if (perk === 'lekka' && instr === 'stopa' && k !== 0) continue;
            dodaj(k0 + t * 16 + k, instr, 0, 1, k === 0 ? 1 : k % 4 === 0 ? 0.85 : 0.6);
          }
        }
      }
      if (nazwa !== 'W' && perk === 'pelna') dodaj(k0, 'talerz', 0, 1, 0.7);
    }
    k0 += takty * 16;
  }
  return { id: def.id, nazwa: def.nazwa, bpm: def.bpm, swing: def.swing || 0, dlugosc: k0, kroki };
}

/* Długość utworu w sekundach (do testów i napisu). */
export const czasUtworu = (u) => u.dlugosc * 60 / u.bpm / 4;

const gotowe = new Map();
export function utwor(id) {
  if (!gotowe.has(id)) gotowe.set(id, zbudujUtwor(UTWORY.find((u) => u.id === id)));
  return gotowe.get(id);
}
