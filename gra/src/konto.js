/* Konto gracza Areny (od 4.6): logowanie, rejestracja, wyniki, pokoje, ranking.

   Wszystko po HTTP do serwera na VPS (serwer/konta.js). Token sesji leży
   w localStorage ('arena:token'); serwer z niego wie, kto gra — nick i id
   w lobby bierze z konta, więc nie da się podszyć pod kogoś innego.

   Statystyki i osiągnięcia są na koncie; po zalogowaniu kopiujemy je do
   localStorage ('arena:staty', 'arena:osiagniecia'), bo z nich czytają reguły
   osiągnięć w grze i profil na stronie zrzutki. */

import { adresApi } from './konfig.js';

const KLUCZ_TOKENU = 'arena:token';
const KLUCZ_PRZENIESIONE = 'arena:stare-przeniesione';

function czytaj(k) { try { return localStorage.getItem(k); } catch { return null; } }
function zapisz(k, v) { try { localStorage.setItem(k, v); } catch { /* tryb prywatny */ } }
function usun(k) { try { localStorage.removeItem(k); } catch { /* tryb prywatny */ } }

export const token = () => czytaj(KLUCZ_TOKENU);

/* { status, dane } — status 0 = brak połączenia z serwerem. */
async function zapytanie(sciezka, body) {
  const baza = adresApi();
  if (!baza) return { status: 0, dane: { blad: 'brak-serwera' } };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(baza + sciezka, body === undefined ? { signal: ctrl.signal } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal
    });
    let dane = {};
    try { dane = await r.json(); } catch { /* pusta odpowiedź */ }
    return { status: r.status, dane };
  } catch {
    return { status: 0, dane: { blad: 'siec' } };
  } finally {
    clearTimeout(t);
  }
}

const OPISY_BLEDOW = {
  'zly-nick': 'Nick: 3–14 znaków (litery, cyfry, spacja, _ . -).',
  'zle-haslo': 'Hasło: co najmniej 4 znaki.',
  'nick-zajety': 'Ten nick jest już zajęty. Masz konto? Zaloguj się.',
  'zle-dane': 'Zły nick albo hasło.',
  'za-duzo-prob': 'Za dużo prób — odczekaj minutę.',
  'za-duzo-kont-z-ip': 'Z tej sieci założono już dużo kont. Spróbuj za godzinę.',
  'za-duzo-kont': 'Serwer ma komplet kont.',
  'zaloguj-sie': 'Sesja wygasła — zaloguj się jeszcze raz.',
  'zla-nazwa': 'Nazwa pokoju: co najmniej 3 znaki.',
  'za-duzo-pokoi': 'Serwer ma już komplet pokoi. Wejdź do któregoś z listy.',
  'masz-za-duzo-pokoi': 'Masz już 3 pokoje — puste znikają same po pół minucie.',
  'nie-ma-pokoju': 'Tego pokoju już nie ma.',
  siec: 'Brak połączenia z serwerem Areny.',
  'brak-serwera': 'Nie ustawiono adresu serwera Areny.',
  serwer: 'Serwer Areny się zakrztusił. Spróbuj za chwilę.'
};
export function opisBledu(dane, zapas = 'Coś poszło nie tak.') {
  return OPISY_BLEDOW[dane && dane.blad] || zapas;
}

/* Dane z konta → localStorage (dla gry i profilu na zrzutce). */
export function zapiszLokalnie(konto) {
  if (!konto) return;
  const s = konto.staty || {};
  zapisz('arena:staty', JSON.stringify({
    partie: s.partie || 0, wygrane: s.wygrane || 0, fragi: s.kille || 0,
    obrazenia: s.obrazenia || 0, rekordTury: s.rekordTury || 0
  }));
  zapisz('arena:osiagniecia', JSON.stringify(konto.osiagniecia || {}));
  zapisz('arena:nazwa', konto.nick);
  if (konto.kolor) zapisz('arena:kolor', konto.kolor);
  zapisz('arena:akcesorium', konto.akcesorium || '');
}

/* To, co ta przeglądarka uzbierała przed kontami — raz, do pierwszego nowego konta. */
function stareDane() {
  if (czytaj(KLUCZ_PRZENIESIONE)) return null;
  try {
    const staty = JSON.parse(czytaj('arena:staty') || 'null');
    const osiagniecia = JSON.parse(czytaj('arena:osiagniecia') || 'null');
    if (!staty && !osiagniecia) return null;
    return { staty, osiagniecia };
  } catch { return null; }
}

async function wejscie(sciezka, body) {
  const w = await zapytanie(sciezka, body);
  if (w.status === 200 && w.dane.token) {
    zapisz(KLUCZ_TOKENU, w.dane.token);
    zapisz(KLUCZ_PRZENIESIONE, '1');
    zapiszLokalnie(w.dane.konto);
  }
  return w;
}

export const logowanie = (nick, haslo) => wejscie('/api/konto/logowanie', { nick, haslo });
export const rejestracja = (nick, haslo) => wejscie('/api/konto/rejestracja', { nick, haslo, stare: stareDane() || undefined });

export async function ja() {
  const t = token();
  if (!t) return { status: 401, dane: { blad: 'zaloguj-sie' } };
  const w = await zapytanie('/api/konto/ja', { token: t });
  if (w.status === 200) zapiszLokalnie(w.dane.konto);
  if (w.status === 401) wylogujLokalnie();
  return w;
}

function wylogujLokalnie() {
  usun(KLUCZ_TOKENU);
  // statystyki i osiągnięcia są na koncie — następna osoba na tym telefonie zaczyna od zera
  usun('arena:staty');
  usun('arena:osiagniecia');
}

export async function wyloguj() {
  const t = token();
  wylogujLokalnie();
  if (t) await zapytanie('/api/konto/wyloguj', { token: t });
}

/* Wygląd robala na koncie: { kolor?, akcesorium? } (akcesorium null = bez). */
export const ustawWyglad = (wyglad) => zapytanie('/api/konto/wyglad', { token: token(), ...wyglad });

export async function wyslijWynik(wynik) {
  const w = await zapytanie('/api/konto/wynik', { token: token(), ...wynik });
  if (w.status === 200) zapiszLokalnie(w.dane.konto);
  return w;
}

export const ranking = () => zapytanie('/api/ranking');
export const pokoje = () => zapytanie('/api/pokoje');
export const nowyPokoj = (nazwa, haslo) => zapytanie('/api/pokoje', { token: token(), nazwa, haslo });
export const wejdzDoPokoju = (id, haslo) => zapytanie('/api/pokoje/wejdz', { token: token(), id, haslo });
