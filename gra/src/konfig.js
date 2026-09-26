/* Gdzie gra łączy się z serwerem.

   SERWER_WS = adres serwera Areny na VPS (WebSocket, np. 'wss://1-2-3-4.sslip.io/ws').
   null = stary tryb: odpytywanie /api/arena na Vercelu (Redis). Powrót do
   starego trybu w razie awarii VPS to zmiana tej jednej linijki.

   Lokalnie (localhost) można podać serwer w adresie strony: ?serwer=ws://localhost:8787/ws
   — do testów E2E; na produkcji ten parametr jest ignorowany. */

export const SERWER_WS = null;

export function adresSerwera() {
  try {
    const lokalnie = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    const z = new URLSearchParams(location.search).get('serwer');
    if (lokalnie && z && /^wss?:\/\//.test(z)) return z;
  } catch { /* poza przeglądarką */ }
  return SERWER_WS;
}

/* Adres HTTP tego samego serwera (dla sendBeacon przy zamknięciu karty). */
export function adresHttp(ws) {
  return ws.replace(/^ws/, 'http').replace(/\/ws(\?.*)?$/, '/api/arena');
}
