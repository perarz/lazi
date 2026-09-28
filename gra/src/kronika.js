/* Kronika partii (4.11): kto komu ile zadał i kto kogo wyeliminował. Liczona ze zdarzeń
   symulacji, takich samych u każdego gracza i widza, więc podsumowanie na końcu partii
   wszyscy widzą takie samo. Czyste funkcje, bez DOM — sprawdza je gra/test/sim.test.mjs.

   Jak w osiągnięciach: zasługa (i wina) należy do gracza, który ma turę. */

/* gracze: [{ id, nick, kolor, druzyna }] — id gracza (nie robala). */
export function nowaKronika(gracze) {
  const k = { gracze: new Map(), zabici: new Set(), tura: nowaTura(-1, null), najlepszy: null };
  for (const g of gracze) {
    if (k.gracze.has(g.id)) continue;
    k.gracze.set(g.id, { ...g, kille: 0, zgony: 0, obrazenia: 0, wlasne: 0, lawa: 0, najlepszaTura: 0 });
  }
  return k;
}

function nowaTura(nr, kto) {
  return { nr, kto, bron: null, zabite: 0, suma: 0 };
}

/* ctx: { nr (numer tury), aktId (gracz z turą), gracz(idRobala) → id gracza }.
   Zwraca opis eliminacji (do kroniki na ekranie) albo null. */
export function zdarzenieKroniki(k, e, ctx) {
  if (k.tura.nr !== ctx.nr) k.tura = nowaTura(ctx.nr, ctx.aktId);
  const t = k.tura;
  const kto = ctx.aktId ? k.gracze.get(ctx.aktId) || null : null;
  if (e.type === 'strzal') {
    t.bron = e.weapon;
    return null;
  }
  if (e.type === 'obrazenia') {
    if (!kto) return null;
    if (ctx.gracz(e.wormId) === ctx.aktId) { kto.wlasne += e.amount; return null; }
    kto.obrazenia += e.amount;
    t.suma += e.amount;
    if (t.suma > kto.najlepszaTura) kto.najlepszaTura = t.suma;
    if (!k.najlepszy || t.suma > k.najlepszy.suma) k.najlepszy = { id: ctx.aktId, suma: t.suma, bron: t.bron };
    return null;
  }
  if (e.type === 'smierc') {
    if (k.zabici.has(e.wormId)) return null;       // przesymulowana tura nie liczy drugi raz
    k.zabici.add(e.wormId);
    const idOfiary = ctx.gracz(e.wormId);
    const ofiara = k.gracze.get(idOfiary);
    if (ofiara) {
      ofiara.zgony++;
      if (e.cause === 'lawa') ofiara.lawa++;
    }
    const sam = ctx.aktId === idOfiary;
    const zabojca = kto && !sam ? kto : null;
    if (zabojca) {
      zabojca.kille++;
      t.zabite++;
    }
    return {
      zabojca: zabojca ? zabojca.id : null, ofiara: idOfiary, robal: e.wormId, sam,
      przyczyna: e.cause, bron: t.bron, seria: zabojca ? t.zabite : 0, x: e.x, y: e.y
    };
  }
  return null;
}

function najwiecej(lista, pole, prog) {
  let best = null;
  for (const g of lista) if (g[pole] >= prog && (!best || g[pole] > best[pole])) best = g;
  return best;
}

/* Gracze od najlepszego (eliminacje, potem obrażenia, potem mniej zgonów) i wyróżnienia. */
export function podsumowanie(k) {
  const lista = [...k.gracze.values()].sort((a, b) =>
    b.kille - a.kille || b.obrazenia - a.obrazenia || a.zgony - b.zgony);
  const wyr = [];
  const mvp = lista[0] && (lista[0].kille > 0 || lista[0].obrazenia > 0) ? lista[0] : null;
  if (mvp) wyr.push({ typ: 'mvp', id: mvp.id, ikona: '👑', nazwa: 'MVP', opis: mvp.kille + ' elim. · ' + mvp.obrazenia + ' obrażeń' });
  if (k.najlepszy && k.najlepszy.suma >= 30) {
    wyr.push({ typ: 'strzal', id: k.najlepszy.id, ikona: '🎯', nazwa: 'Strzał partii', opis: k.najlepszy.suma + ' obrażeń w jednej turze', bron: k.najlepszy.bron });
  }
  const kamikaze = najwiecej(lista, 'wlasne', 20);
  if (kamikaze) wyr.push({ typ: 'kamikaze', id: kamikaze.id, ikona: '🤡', nazwa: 'Kamikaze', opis: kamikaze.wlasne + ' obrażeń samemu sobie' });
  const plywak = najwiecej(lista, 'lawa', 1);
  if (plywak) wyr.push({ typ: 'lawa', id: plywak.id, ikona: '🌋', nazwa: 'Pływak', opis: plywak.lawa + '× do lawy' });
  if (lista.length >= 2 && mvp) {
    const pacyfista = lista.find((g) => g.obrazenia === 0 && g.kille === 0);
    if (pacyfista) wyr.push({ typ: 'pacyfista', id: pacyfista.id, ikona: '🕊️', nazwa: 'Pacyfista', opis: 'nikogo nawet nie drasnął' });
  }
  return { lista, wyr };
}
