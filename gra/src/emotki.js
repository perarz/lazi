/* Emotki i tańce w Arenie (od 4.3.1). Czysta tabela, bez DOM-u.
   Emotka to zdarzenie w logu pokoju { t: 'emotka', id, e } — protokół partii
   jej nie zna (zloz pomija nieznane typy), rysuje ją tylko main.js/render.js,
   więc nie wpływa na symulację ani determinizm. */

export const EMOTKI = [
  { id: 'gg', tekst: 'GG', nazwa: 'GG' },
  { id: 'usmiech', tekst: '😄', nazwa: 'Uśmiech' },
  { id: 'ez', tekst: 'EZ', nazwa: 'EZ' },
  { id: 'smiech', tekst: '😂', nazwa: 'Śmiech' },
  { id: 'szok', tekst: '😱', nazwa: 'Szok' },
  { id: 'szczescie', taniec: 'szczescie', tekst: '🎉', nazwa: 'Taniec szczęścia' },
  { id: 'robak', taniec: 'robak', tekst: '🕺', nazwa: 'Taniec robaczka' }
];

export const EMOTKA_S = 3;          // s — tyle trwa dymek
export const TANIEC_S = 3.5;        // s — tyle trwa taniec
export const EMOTKA_CO = 2500;      // ms — najwyżej jedna emotka na tyle od gracza (bez spamu w logu)

export function emotka(id) {
  return EMOTKI.find((e) => e.id === id) || null;
}
