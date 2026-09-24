/* Reguły osiągnięć Areny — czyste funkcje, bez DOM i localStorage, żeby dało się
   je sprawdzić w Node na prawdziwej symulacji (gra/test/sim.test.mjs).

   Wejście to zdarzenia z sim.js ('strzal', 'obrazenia', 'smierc'), wyjście to
   lista id osiągnięć do odblokowania (lista i zapis: gra/osiagniecia.js).
   Eliminacja liczy się temu, czyja jest tura — tak jak w Worms. */

export function nowaPartiaOs() {
  return {
    zabici: new Set(),      // robal ginie raz na partię — przesymulowanie nie nabije fragów
    fragi: 0,
    ranny: false,           // czy mój robal oberwał w tej partii
    tura: nowaTura(-1, null)
  };
}

function nowaTura(nr, aktId) {
  return { nr, aktId, bron: null, zabite: 0, suma: 0, mojeRany: false };
}

function turaDla(p, nr, aktId) {
  if (p.tura.nr !== nr) p.tura = nowaTura(nr, aktId);
  return p.tura;
}

const ZABOJCZE_BRONIE = { nalot: 'nalot', dynamit: 'saper', strzelba: 'snajper', kasetowa: 'kasetowka', owca: 'owca' };

/* ctx: { nr, aktId, mojeId, fragiWczesniej } — fragiWczesniej to eliminacje
   z poprzednich partii (do progów 5 i 25). */
export function zdarzenieOs(p, e, ctx) {
  const t = turaDla(p, ctx.nr, ctx.aktId);
  const moja = ctx.aktId === ctx.mojeId;
  const out = [];

  if (e.type === 'strzal') {
    t.bron = e.weapon;
  } else if (e.type === 'obrazenia') {
    if (e.wormId === ctx.mojeId) { t.mojeRany = true; p.ranny = true; }
    if (moja && e.wormId !== ctx.mojeId) {
      t.suma += e.amount;
      if (t.suma >= 100) out.push('masakra');
    }
  } else if (e.type === 'smierc') {
    if (e.wormId === ctx.mojeId && moja) out.push('samoboja');
    if (moja && e.wormId !== ctx.mojeId && !p.zabici.has(e.wormId)) {
      p.zabici.add(e.wormId);
      p.fragi++;
      t.zabite++;
      const razem = (ctx.fragiWczesniej || 0) + p.fragi;
      out.push('pierwsza-krew');
      if (razem >= 5) out.push('piec-fragow');
      if (razem >= 25) out.push('rzeznik');
      if (t.zabite >= 2) out.push('dublet');
      if (e.cause === 'lawa') out.push('lawa');
      if (e.cause === 'lawa' && t.bron === 'kij') out.push('home-run');
      if (ZABOJCZE_BRONIE[t.bron]) out.push(ZABOJCZE_BRONIE[t.bron]);
    }
  }
  return out;
}

/* Wołane, gdy zaczyna się następna tura: podsumowanie poprzedniej. */
export function koniecTuryOs(p, ctx) {
  const t = p.tura;
  const out = [];
  if (t.aktId === ctx.mojeId && t.bron === 'dynamit' && !t.mojeRany && ctx.jaZywy) out.push('ucieczka');
  p.tura = nowaTura(-1, null);
  return out;
}

/* ctx: { wygralem, hp, partie } — partie już z tą policzoną. */
export function koniecPartiiOs(p, ctx) {
  const out = [];
  if (ctx.partie >= 10) out.push('weteran');
  if (ctx.wygralem) {
    out.push('zwyciestwo');
    if (ctx.hp <= 10) out.push('na-wlosku');
    if (ctx.hp >= 100 && !p.ranny) out.push('nietykalny');
  }
  return out;
}
