/* Dźwięki i muzyka Areny (od 4.9) — wszystko syntezowane Web Audio, bez plików.

   Czysta grafika dla uszu: nic z tego nie wchodzi do symulacji. Przeglądarki
   pozwalają grać dopiero po geście użytkownika, więc kontekst budzimy przy
   pierwszym stuknięciu albo klawiszu. Wyciszenie w localStorage:
   'arena:dzwiek' i 'arena:muzyka' ('0' = wyłączone). */

import { UTWORY, utwor } from './muzyka.js';

const czytaj = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const zapisz = (k, v) => { try { localStorage.setItem(k, v); } catch { /* prywatne okno */ } };

let ctx = null, glowny = null, efekty = null, muzykaBus = null, szum = null;
let dzwiekWl = czytaj('arena:dzwiek') !== '0';
let muzykaWl = czytaj('arena:muzyka') !== '0';
let muzykaGra = false, muzykaTimer = null, nastepnaNuta = 0;

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
  if (tak && !muzykaWl) utworTeraz = null;      // ponowne włączenie = następny utwór
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
  smierc() { ton('sawtooth', 500, 90, 0.6, 0.18, { filtr: ['lowpass', 1400] }); },
  ala() { ton('square', 700, 380, 0.14, 0.1, { filtr: ['lowpass', 1800] }); },
  teleport() { ton('sine', 300, 2400, 0.3, 0.2); ton('sine', 2400, 300, 0.3, 0.15, { opoz: 0.25 }); },
  lina() { ton('square', 900, 1400, 0.06, 0.12, { filtr: ['lowpass', 3000] }); },
  most() { ton('square', 120, 120, 0.08, 0.25, { filtr: ['lowpass', 700] }); ton('square', 150, 150, 0.08, 0.25, { opoz: 0.1, filtr: ['lowpass', 700] }); },
  wiercenie() { szumik(0.08, 0.12, 1500, 900, { typ: 'bandpass', q: 3 }); },
  lawa() { ton('sawtooth', 60, 45, 1.2, 0.2, { filtr: ['lowpass', 300] }); },
  alleluja() { [523, 659, 784].forEach((f) => ton('sine', f, f, 1.4, 0.12)); },
  wygrana() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => ton('triangle', f, f, 0.22, 0.2, { opoz: i * 0.13 })); },
  emotka() { ton('sine', 880, 1100, 0.1, 0.1); },
  mina() { [0, 0.18, 0.36, 0.54].forEach((o) => ton('square', 1500, 1500, 0.07, 0.12, { opoz: o, filtr: ['lowpass', 3000] })); },
  // płonąca ropa (4.10): „wuuusz” zapłonu i trzask ognia, parzenie = krótkie skwierczenie
  ogien() {
    szumik(1.4, 0.45, 300, 2600, { typ: 'bandpass', q: 0.9, opoz: 0.05 });
    szumik(1.8, 0.25, 700, 200, { opoz: 0.3 });
    for (let i = 0; i < 6; i++) szumik(0.04, 0.2, 5000, 2500, { typ: 'highpass', opoz: 0.35 + i * 0.17 + Math.random() * 0.1 });
  },
  parzy() { szumik(0.25, 0.22, 6000, 2500, { typ: 'highpass' }); ton('square', 520, 300, 0.12, 0.05, { filtr: ['lowpass', 1400] }); },
  trzask() { szumik(0.05, 0.14, 4000, 1800, { typ: 'bandpass', q: 2 }); },
  // ostatnie sekundy tury (4.11): tyknięcie, dwie ostatnie wyżej i głośniej
  tik({ ostatnie = false } = {}) { ton('square', ostatnie ? 1500 : 1000, ostatnie ? 1500 : 1000, 0.05, ostatnie ? 0.14 : 0.08, { filtr: ['lowpass', 3000] }); }
};

export function graj(nazwa, opcje) {
  if (!dzwiekWl || !kontekst() || ctx.state !== 'running') return;
  const f = EFEKTY[nazwa];
  if (f) { try { f(opcje); } catch { /* stara przeglądarka bez jakiejś funkcji — cisza */ } }
}

/* ---------- muzyka ----------
   Od 4.10 siedem utworów (muzyka.js: nuty, forma, style), grane po kolei w losowej
   kolejności, bez powtórki pod rząd, z chwilą ciszy między nimi. Każda partia zaczyna
   od kolejnego utworu, a wyłączenie i włączenie muzyki przeskakuje do następnego.
   Nuty planujemy 0,3 s do przodu co 100 ms — rytm się nie sypie, gdy klatki gubią tempo. */
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// fale okresowe (tworzone raz): prostokąt 25% i 12,5% jak w 8-bitowcach, organy
let fale = {};
function fala(nazwa) {
  if (fale[nazwa]) return fale[nazwa];
  const N = 32, re = new Float32Array(N), im = new Float32Array(N);
  if (nazwa === 'organy') [0, 1, 0.75, 0.55, 0.35, 0, 0.22, 0, 0.14].forEach((v, i) => { im[i] = v; });
  else {
    const wyp = nazwa === 'puls12' ? 0.125 : 0.25;
    for (let n = 1; n < N; n++) re[n] = 2 / (n * Math.PI) * Math.sin(n * Math.PI * wyp);
  }
  fale[nazwa] = ctx.createPeriodicWave(re, im);
  return fale[nazwa];
}

function adsr(g, t, a, d, s, dl, r, szczyt) {
  const pod = Math.max(0.0001, szczyt * s);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(szczyt, t + a);
  g.gain.exponentialRampToValueAtTime(pod, t + a + d);
  const koniec = t + Math.max(a + d, dl);
  g.gain.setValueAtTime(pod, koniec);
  g.gain.exponentialRampToValueAtTime(0.0001, koniec + r);
  return koniec + r;
}

/* Instrument = fale (typ, mnożnik częstotliwości, rozstrojenie w centach, głośność),
   filtr [typ, od Hz, do Hz, Q, czas], obwiednia [atak, opadanie, podtrzymanie, wybrzmienie],
   vibrato [Hz, centy, po ilu s], głośność. */
const BRZMIENIA = {
  trabka: { fale: [['sawtooth', 1, 0, 1], ['sawtooth', 1, 8, 0.7]], filtr: ['lowpass', 700, 2400, 2, 0.08], env: [0.03, 0.25, 0.65, 0.12], vib: [5.5, 12, 0.3], gl: 0.15 },
  dzwonek: { fale: [['sine', 1, 0, 1], ['sine', 2.76, 0, 0.3], ['sine', 5.4, 0, 0.1]], env: [0.003, 1.3, 0.02, 0.3], gl: 0.2 },
  organy: { fale: [['organy', 1, 0, 1]], filtr: ['lowpass', 3400], env: [0.01, 0.1, 0.85, 0.08], vib: [6.2, 8, 0], gl: 0.13 },
  organyAkord: { fale: [['organy', 1, 0, 1]], filtr: ['lowpass', 2400], env: [0.01, 0.12, 0.6, 0.06], gl: 0.04 },
  gitara: { fale: [['sawtooth', 1, 0, 1], ['square', 1, 5, 0.4]], filtr: ['lowpass', 3000, 900, 1.5, 0.4], env: [0.005, 0.5, 0.35, 0.15], vib: [5, 18, 0.2], gl: 0.12 },
  kwadrat: { fale: [['puls25', 1, 0, 1]], env: [0.005, 0.08, 0.7, 0.05], vib: [6, 10, 0.18], gl: 0.09 },
  arp8bit: { fale: [['puls12', 1, 0, 1]], env: [0.003, 0.05, 0.4, 0.03], gl: 0.05 },
  bas8: { fale: [['triangle', 1, 0, 1]], env: [0.003, 0.05, 0.9, 0.03], gl: 0.34 },
  gwizd: { fale: [['sine', 1, 0, 1], ['sine', 2, 0, 0.08]], env: [0.05, 0.1, 0.8, 0.12], vib: [5.5, 22, 0.25], gl: 0.19 },
  twang: { fale: [['square', 1, 0, 1], ['sawtooth', 1, -6, 0.6]], filtr: ['lowpass', 3500, 700, 3, 0.35], env: [0.002, 0.35, 0.2, 0.2], vib: [6, 25, 0.05], gl: 0.09 },
  akordeon: { fale: [['sawtooth', 1, -9, 1], ['sawtooth', 1, 9, 1], ['square', 0.5, 0, 0.3]], filtr: ['lowpass', 2200], env: [0.02, 0.1, 0.8, 0.06], vib: [5.5, 5, 0], gl: 0.065 },
  tuba: { fale: [['triangle', 1, 0, 1], ['sine', 1, 0, 0.8]], filtr: ['lowpass', 700], env: [0.02, 0.15, 0.5, 0.08], gl: 0.34 },
  bas: { fale: [['triangle', 1, 0, 1], ['square', 1, 0, 0.12]], filtr: ['lowpass', 1100], env: [0.005, 0.2, 0.6, 0.08], gl: 0.3 },
  basSaw: { fale: [['sawtooth', 1, 0, 1], ['sawtooth', 1, -8, 0.6]], filtr: ['lowpass', 1400, 380, 4, 0.18], env: [0.005, 0.2, 0.55, 0.08], gl: 0.18 },
  stab: { fale: [['square', 1, 0, 1]], filtr: ['lowpass', 1800], env: [0.004, 0.08, 0.3, 0.05], gl: 0.045 },
  pad: { fale: [['sawtooth', 1, -10, 1], ['sawtooth', 1, 10, 1], ['triangle', 2, 0, 0.4]], filtr: ['lowpass', 900, 1400, 1, 1.2], env: [0.35, 0.5, 0.7, 0.6], gl: 0.032 },
  arp: { fale: [['square', 1, 0, 1]], filtr: ['lowpass', 2600, 900, 2, 0.12], env: [0.003, 0.1, 0.3, 0.05], gl: 0.045 },
  leadSaw: { fale: [['sawtooth', 1, -6, 1], ['sawtooth', 1, 6, 1]], filtr: ['lowpass', 2800], env: [0.01, 0.2, 0.7, 0.15], vib: [5.5, 10, 0.3], gl: 0.07 }
};

function nuta(b, t, midi, dl, gl) {
  const f = hz(midi);
  const g = ctx.createGain();
  const [a, d, s, r] = b.env;
  const koniec = adsr(g, t, a, d, s, dl, r, b.gl * gl);
  g.connect(muzykaBus);
  let wej = g;
  if (b.filtr) {
    const [typ, f0, f1, q, czas] = b.filtr;
    const fl = ctx.createBiquadFilter();
    fl.type = typ;
    fl.Q.value = q || 0.7;
    fl.frequency.setValueAtTime(f0, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + (czas || 0.2));
    fl.connect(g);
    wej = fl;
  }
  let lfo = null, lfoGl = null;
  if (b.vib) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = b.vib[0];
    lfoGl = ctx.createGain();
    lfoGl.gain.setValueAtTime(0, t);
    lfoGl.gain.linearRampToValueAtTime(b.vib[1], t + b.vib[2] + 0.05);
    lfo.connect(lfoGl);
    lfo.start(t);
    lfo.stop(koniec + 0.05);
  }
  for (const [typ, mn, det, glosnosc] of b.fale) {
    const o = ctx.createOscillator();
    if (typ === 'organy' || typ === 'puls25' || typ === 'puls12') o.setPeriodicWave(fala(typ));
    else o.type = typ;
    o.frequency.setValueAtTime(f * mn, t);
    if (det) o.detune.setValueAtTime(det, t);
    if (lfoGl) lfoGl.connect(o.detune);
    if (glosnosc !== 1) { const og = ctx.createGain(); og.gain.value = glosnosc; o.connect(og).connect(wej); } else o.connect(wej);
    o.start(t);
    o.stop(koniec + 0.05);
  }
}

function szumMuzyki(t, dl, gl, typ, f, q = 0.8) {
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = szum;
  fl.type = typ;
  fl.frequency.value = f;
  fl.Q.value = q;
  g.gain.setValueAtTime(gl, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dl);
  s.connect(fl).connect(g).connect(muzykaBus);
  s.start(t, Math.random() * 0.2);
  s.stop(t + dl + 0.02);
}

function tonMuzyki(t, f0, f1, dl, gl, typ = 'sine') {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = typ;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dl * 0.6);
  g.gain.setValueAtTime(gl, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dl);
  o.connect(g).connect(muzykaBus);
  o.start(t);
  o.stop(t + dl + 0.02);
}

const PERKUSJA = {
  stopa: (t, gl) => tonMuzyki(t, 150, 42, 0.24, 0.9 * gl),
  werbel: (t, gl) => { szumMuzyki(t, 0.14, 0.32 * gl, 'bandpass', 1900); tonMuzyki(t, 200, 150, 0.07, 0.2 * gl, 'triangle'); },
  werbelDuzy: (t, gl) => { szumMuzyki(t, 0.3, 0.42 * gl, 'highpass', 1200, 0.5); tonMuzyki(t, 190, 140, 0.1, 0.25 * gl, 'triangle'); },
  szum: (t, gl) => szumMuzyki(t, 0.1, 0.3 * gl, 'highpass', 1000, 0.5),
  hihat: (t, gl) => szumMuzyki(t, 0.045, 0.13 * gl, 'highpass', 7500),
  talerz: (t, gl) => szumMuzyki(t, 1.3, 0.16 * gl, 'highpass', 5000, 0.5),
  klapak: (t, gl) => { tonMuzyki(t, 1250, 1180, 0.05, 0.2 * gl); tonMuzyki(t, 1900, 1850, 0.03, 0.1 * gl); },
  tom: (t, gl) => tonMuzyki(t, 210, 105, 0.3, 0.5 * gl)
};

let utworTeraz = null, krokUtworu = 0, kolejkaUtworow = [], ostatniUtwor = null, naUtwor = null;

/* main.js pokazuje nazwę utworu, gdy się zaczyna. */
export function przyZmianieUtworu(fn) { naUtwor = fn; }
export const obecnyUtwor = () => (utworTeraz ? utworTeraz.nazwa : null);

function kolejnyUtwor() {
  if (!kolejkaUtworow.length) {
    kolejkaUtworow = UTWORY.map((u) => u.id);
    for (let i = kolejkaUtworow.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [kolejkaUtworow[i], kolejkaUtworow[j]] = [kolejkaUtworow[j], kolejkaUtworow[i]];
    }
    if (kolejkaUtworow[0] === ostatniUtwor) kolejkaUtworow.push(kolejkaUtworow.shift());
  }
  ostatniUtwor = kolejkaUtworow.shift();
  utworTeraz = utwor(ostatniUtwor);
  krokUtworu = 0;
  if (naUtwor && muzykaWl) { try { naUtwor(utworTeraz.nazwa); } catch { /* napis to tylko dodatek */ } }
}

function zagraj(instr, t, midi, dl, gl) {
  const p = PERKUSJA[instr];
  if (p) return p(t, gl);
  const b = BRZMIENIA[instr];
  if (b) nuta(b, t, midi, dl, gl);
}

function tik() {
  if (!ctx || ctx.state !== 'running') return;
  if (nastepnaNuta < ctx.currentTime) nastepnaNuta = ctx.currentTime + 0.05;
  while (nastepnaNuta < ctx.currentTime + 0.3) {
    if (!utworTeraz) kolejnyUtwor();
    const u = utworTeraz;
    const s16 = 60 / u.bpm / 4;
    if (krokUtworu >= u.dlugosc) {             // koniec utworu: chwila ciszy i następny
      utworTeraz = null;
      nastepnaNuta += 1.5;
      continue;
    }
    const nuty = muzykaWl && u.kroki[krokUtworu];
    if (nuty) {
      // swing (blues): druga ósemka każdej ćwierćnuty trochę później
      const t = nastepnaNuta + (u.swing && krokUtworu % 4 === 2 ? u.swing * s16 : 0);
      for (const [instr, midi, dl, gl] of nuty) {
        try { zagraj(instr, t, midi, dl * s16, gl); } catch { /* stara przeglądarka — cisza zamiast błędu */ }
      }
    }
    krokUtworu++;
    nastepnaNuta += s16;
  }
}

export function muzykaStart() {
  if (muzykaGra) return;
  muzykaGra = true;
  kontekst();
  utworTeraz = null;               // każda partia od kolejnego utworu
  nastepnaNuta = 0;
  muzykaTimer = setInterval(tik, 100);
}
export function muzykaStop() {
  muzykaGra = false;
  clearInterval(muzykaTimer);
  muzykaTimer = null;
}

/* Tylko do testów i strojenia: pierwsze `sek` sekund utworu wyrenderowane offline
   (bez głośników) — zwraca szczyt i średnią głośność (RMS) nagrania. */
export async function _renderujOffline(id, sek = 12) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const zapas = { ctx, muzykaBus, szum, fale };
  const oc = new OAC(1, Math.round(44100 * sek), 44100);
  try {
    ctx = oc;
    fale = {};
    const komp = oc.createDynamicsCompressor();
    komp.threshold.value = -14;
    komp.ratio.value = 6;
    const gl = oc.createGain();
    gl.gain.value = 0.9;
    gl.connect(komp).connect(oc.destination);
    muzykaBus = oc.createGain();
    muzykaBus.gain.value = 0.16;
    muzykaBus.connect(gl);
    szum = oc.createBuffer(1, oc.sampleRate * 1.5, oc.sampleRate);
    const d = szum.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const u = utwor(id);
    const s16 = 60 / u.bpm / 4;
    for (let k = 0; k < u.dlugosc && k * s16 < sek - 0.5; k++) {
      const t = k * s16 + (u.swing && k % 4 === 2 ? u.swing * s16 : 0) + 0.01;
      for (const [instr, midi, dl, g] of u.kroki[k] || []) zagraj(instr, t, midi, dl * s16, g);
    }
    const buf = await oc.startRendering();
    const x = buf.getChannelData(0);
    let szczyt = 0, suma = 0;
    for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > szczyt) szczyt = v; suma += x[i] * x[i]; }
    return { szczyt, rms: Math.sqrt(suma / x.length) };
  } finally {
    ({ ctx, muzykaBus, szum, fale } = zapas);
  }
}
