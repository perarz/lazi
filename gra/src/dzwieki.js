/* Dźwięki i muzyczka Areny (od 4.9) — wszystko syntezowane Web Audio, bez plików.

   Czysta grafika dla uszu: nic z tego nie wchodzi do symulacji. Przeglądarki
   pozwalają grać dopiero po geście użytkownika, więc kontekst budzimy przy
   pierwszym stuknięciu albo klawiszu. Wyciszenie w localStorage:
   'arena:dzwiek' i 'arena:muzyka' ('0' = wyłączone). */

const czytaj = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const zapisz = (k, v) => { try { localStorage.setItem(k, v); } catch { /* prywatne okno */ } };

let ctx = null, glowny = null, efekty = null, muzykaBus = null, szum = null;
let dzwiekWl = czytaj('arena:dzwiek') !== '0';
let muzykaWl = czytaj('arena:muzyka') !== '0';
let muzykaGra = false, muzykaTimer = null, nastepnaNuta = 0, krok = 0;

function kontekst() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  glowny = ctx.createGain();
  glowny.gain.value = 0.9;
  // lekka kompresja — kilka wybuchów naraz nie przesteruje
  const komp = ctx.createDynamicsCompressor();
  komp.threshold.value = -14;
  komp.ratio.value = 6;
  glowny.connect(komp).connect(ctx.destination);
  efekty = ctx.createGain();
  efekty.gain.value = dzwiekWl ? 0.7 : 0;
  efekty.connect(glowny);
  muzykaBus = ctx.createGain();
  muzykaBus.gain.value = muzykaWl ? 0.16 : 0;
  muzykaBus.connect(glowny);
  // bufor białego szumu (wybuchy, plusk, werbel)
  szum = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = szum.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/* Budzenie kontekstu po pierwszym geście. */
export function odblokuj() {
  const c = kontekst();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
for (const typ of ['pointerdown', 'keydown']) window.addEventListener(typ, odblokuj, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else ctx.resume().catch(() => {});
});

export const dzwiekWlaczony = () => dzwiekWl;
export const muzykaWlaczona = () => muzykaWl;
export function ustawDzwiek(tak) {
  dzwiekWl = !!tak;
  zapisz('arena:dzwiek', dzwiekWl ? '1' : '0');
  if (efekty) efekty.gain.setTargetAtTime(dzwiekWl ? 0.7 : 0, ctx.currentTime, 0.05);
}
export function ustawMuzyke(tak) {
  muzykaWl = !!tak;
  zapisz('arena:muzyka', muzykaWl ? '1' : '0');
  if (muzykaBus) muzykaBus.gain.setTargetAtTime(muzykaWl ? 0.16 : 0, ctx.currentTime, 0.2);
}

/* ---------- klocki ---------- */

function ton(typ, f0, f1, dl, glosnosc, { opoz = 0, cel = efekty, filtr = null } = {}) {
  const t = ctx.currentTime + opoz;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = typ;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dl);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(glosnosc, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dl);
  let wyj = o;
  if (filtr) { const f = ctx.createBiquadFilter(); f.type = filtr[0]; f.frequency.value = filtr[1]; o.connect(f); wyj = f; }
  wyj.connect(g).connect(cel);
  o.start(t);
  o.stop(t + dl + 0.05);
}

function szumik(dl, glosnosc, f0, f1, { opoz = 0, typ = 'lowpass', cel = efekty, q = 0.7 } = {}) {
  const t = ctx.currentTime + opoz;
  const s = ctx.createBufferSource();
  s.buffer = szum;
  const f = ctx.createBiquadFilter();
  f.type = typ;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dl);
  const g = ctx.createGain();
  g.gain.setValueAtTime(glosnosc, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dl);
  s.connect(f).connect(g).connect(cel);
  s.start(t, Math.random() * 0.4);
  s.stop(t + dl + 0.05);
}

/* ---------- efekty ---------- */

const EFEKTY = {
  wybuch({ r = 50 } = {}) {
    const k = Math.min(1.6, r / 50);
    szumik(0.5 + k * 0.5, 0.9 * Math.min(1, k), 1800, 60);
    ton('sine', 120, 30, 0.45 + k * 0.3, 0.8 * Math.min(1, k));
    ton('triangle', 70, 25, 0.8, 0.4);
  },
  strzal() { szumik(0.12, 0.35, 3000, 400, { typ: 'bandpass', q: 1.2 }); ton('square', 220, 90, 0.1, 0.12); },
  strzelba() { szumik(0.22, 0.7, 4000, 300); ton('square', 160, 50, 0.12, 0.25); },
  railgun() {
    ton('sawtooth', 180, 1800, 0.35, 0.18);                              // ładowanie
    ton('sine', 2400, 120, 0.5, 0.35, { opoz: 0.08 });                  // „pew”
    szumik(0.6, 0.5, 9000, 800, { opoz: 0.08, typ: 'highpass' });
    ton('square', 90, 40, 0.5, 0.2, { opoz: 0.08, filtr: ['lowpass', 600] });
  },
  skok() { ton('sine', 300, 620, 0.12, 0.18); },
  odbicie() { ton('triangle', 520, 380, 0.07, 0.12); },
  bonk() { ton('square', 180, 90, 0.12, 0.3, { filtr: ['lowpass', 900] }); szumik(0.08, 0.3, 2000, 500); },
  plusk() { szumik(0.7, 0.5, 900, 120); ton('sine', 200, 60, 0.4, 0.25); },
  zrzut() { ton('triangle', 660, 660, 0.1, 0.15); ton('triangle', 880, 880, 0.14, 0.15, { opoz: 0.1 }); },
  skrzynka() { [523, 659, 784, 1047].forEach((f, i) => ton('square', f, f, 0.1, 0.1, { opoz: i * 0.06, filtr: ['lowpass', 2500] })); },
  apteczka() { [392, 523, 659].forEach((f, i) => ton('sine', f, f * 1.01, 0.18, 0.18, { opoz: i * 0.08 })); },
  mojaTura() { [392, 523, 659, 784].forEach((f, i) => ton('triangle', f, f, 0.16, 0.2, { opoz: i * 0.09 })); },
  tura() { ton('triangle', 440, 440, 0.12, 0.1); ton('triangle', 330, 330, 0.16, 0.1, { opoz: 0.1 }); },
  ping() { ton('sine', 1320, 1320, 0.12, 0.2); ton('sine', 1760, 1760, 0.2, 0.18, { opoz: 0.1 }); },
  smierc() { ton('sawtooth', 500, 90, 0.6, 0.18, { filtr: ['lowpass', 1400] }); },
  ala() { ton('square', 700, 380, 0.14, 0.1, { filtr: ['lowpass', 1800] }); },
  teleport() { ton('sine', 300, 2400, 0.3, 0.2); ton('sine', 2400, 300, 0.3, 0.15, { opoz: 0.25 }); },
  lina() { ton('square', 900, 1400, 0.06, 0.12, { filtr: ['lowpass', 3000] }); },
  most() { ton('square', 120, 120, 0.08, 0.25, { filtr: ['lowpass', 700] }); ton('square', 150, 150, 0.08, 0.25, { opoz: 0.1, filtr: ['lowpass', 700] }); },
  wiercenie() { szumik(0.08, 0.12, 1500, 900, { typ: 'bandpass', q: 3 }); },
  lawa() { ton('sawtooth', 60, 45, 1.2, 0.2, { filtr: ['lowpass', 300] }); },
  alleluja() { [523, 659, 784].forEach((f) => ton('sine', f, f, 1.4, 0.12)); },
  wygrana() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => ton('triangle', f, f, 0.22, 0.2, { opoz: i * 0.13 })); },
  emotka() { ton('sine', 880, 1100, 0.1, 0.1); }
};

export function graj(nazwa, opcje) {
  if (!dzwiekWl || !kontekst() || ctx.state !== 'running') return;
  const f = EFEKTY[nazwa];
  if (f) { try { f(opcje); } catch { /* stara przeglądarka bez jakiejś funkcji — cisza */ } }
}

/* ---------- muzyczka ----------
   Krótka pętla w mollu (a-moll → F → C → G), 104 BPM: bas, arpeggio, stopa i hi-hat.
   Planowana 0,3 s do przodu co 100 ms — nie gubi rytmu, gdy klatki się sypią. */
const BPM = 104, SZESNASTKA = 60 / BPM / 4;
const AKORDY = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // A-moll, F, C, G (MIDI)
const MELODIA = [0, 2, 1, 2, 0, 1, 2, 1];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function zaplanuj(nr, t) {
  const takt = Math.floor(nr / 16) % AKORDY.length;
  const akord = AKORDY[takt];
  const w16 = nr % 16;
  const nuta = (typ, f, dl, gl, filtr) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = typ;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gl, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dl);
    let wyj = o;
    if (filtr) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filtr; o.connect(fl); wyj = fl; }
    wyj.connect(g).connect(muzykaBus);
    o.start(t);
    o.stop(t + dl + 0.05);
  };
  if (w16 % 4 === 0) nuta('triangle', hz(akord[0] - 24), SZESNASTKA * 3.5, 0.9);                         // bas na ćwierćnuty
  if (w16 % 2 === 0) nuta('square', hz(akord[MELODIA[(w16 / 2) % 8]] + 12), SZESNASTKA * 1.6, 0.18, 2200); // arpeggio
  if (w16 === 0 || w16 === 8 || w16 === 10) {                                                            // stopa
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(muzykaBus);
    o.start(t);
    o.stop(t + 0.2);
  }
  if (w16 % 2 === 1) {                                                                                  // hi-hat
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = szum;
    f.type = 'highpass';
    f.frequency.value = 7000;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(muzykaBus);
    s.start(t, Math.random());
    s.stop(t + 0.06);
  }
  if (w16 === 4 || w16 === 12) {                                                                        // werbel
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = szum;
    f.type = 'bandpass';
    f.frequency.value = 1800;
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    s.connect(f).connect(g).connect(muzykaBus);
    s.start(t, Math.random());
    s.stop(t + 0.15);
  }
}

function tik() {
  if (!ctx || ctx.state !== 'running') return;
  if (nastepnaNuta < ctx.currentTime) nastepnaNuta = ctx.currentTime + 0.05;
  while (nastepnaNuta < ctx.currentTime + 0.3) {
    if (muzykaWl) zaplanuj(krok, nastepnaNuta);
    krok++;
    nastepnaNuta += SZESNASTKA;
  }
}

export function muzykaStart() {
  if (muzykaGra) return;
  muzykaGra = true;
  kontekst();
  krok = 0;
  nastepnaNuta = 0;
  muzykaTimer = setInterval(tik, 100);
}
export function muzykaStop() {
  muzykaGra = false;
  clearInterval(muzykaTimer);
  muzykaTimer = null;
}
