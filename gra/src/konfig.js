/* Gdzie gra łączy się z serwerem.

   SERWER_WS = adres serwera Areny na VPS (WebSocket). Ten sam adres jest
   w zrzutka/app.js i w CSP obu stron (index.html, gra/index.html).

   Lokalnie (localhost) można podać serwer w adresie strony: ?serwer=ws://localhost:8787/ws
   — do testów E2E; na produkcji ten parametr jest ignorowany. */

export const SERWER_WS = 'wss://96-62-223-169.sslip.io/ws';

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
