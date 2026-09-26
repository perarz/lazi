# Serwer Areny na VPS — instalacja i obsługa

Strona (zrzutka, gra jako pliki) zostaje na **Vercelu**. Na VPS działa tylko
**serwer Areny** (`serwer/serwer.js`, Node + WebSocket) za **Caddy** (HTTPS).
Redis nie jest już potrzebny dla Areny (zrzutka dalej go używa).

Adres serwera: darmowa nazwa **sslip.io** z IP serwera — np. IP `185.1.2.3` →
`185-1-2-3.sslip.io`. Caddy sam weźmie certyfikat Let's Encrypt.

## 0. Zapora w panelu dostawcy VPS
Panel ma własną zaporę przed serwerem (Input policy **DROP**), niezależną od `ufw`.
Bez reguł ruch nie dochodzi w ogóle i `ssh` kończy się `Operation timed out`.
- **SSH (22)**: domyślnie wpuszcza tylko adresy z zakładki **Whitelist IP** — dopisz tam
  swoje publiczne IP (`curl -4 ifconfig.me` na swoim komputerze). Po zmianie IP w domu
  (router, telefon jako hotspot) trzeba je dopisać ponownie.
- **HTTP (80) i HTTPS (443), TCP, źródło: wszyscy** — dwie reguły ACCEPT. Bez 80 Caddy
  nie dostanie certyfikatu, bez 443 gracze się nie połączą.

## 1. Dostęp do prywatnego repo (deploy key, tylko do odczytu)

Na VPS jako root:
```
ssh-keygen -t ed25519 -f /root/.ssh/lazi_deploy -N "" -C "vps-arena"
cat >> /root/.ssh/config <<'EOF'
Host github.com
  IdentityFile /root/.ssh/lazi_deploy
  IdentitiesOnly yes
EOF
cat /root/.ssh/lazi_deploy.pub
```
Wypisany klucz publiczny właściciel repo wkleja na GitHubie:
**perarz/lazi → Settings → Deploy keys → Add deploy key** (tytuł np. „VPS Arena”,
**bez** zaznaczania „Allow write access”). Potem:
```
ssh -o StrictHostKeyChecking=accept-new -T git@github.com   # ma przywitać „You've successfully authenticated”
git clone git@github.com:perarz/lazi.git /opt/lazi
```

## 2. Instalacja (jedna komenda)
```
cd /opt/lazi && bash serwer/instaluj.sh 185-1-2-3.sslip.io
```
Skrypt:
- instaluje Node 22, Caddy, zaporę (ufw: tylko 22/80/443), fail2ban i automatyczne aktualizacje;
- zakłada użytkownika `arena`, usługę `arena` (systemd, restart po awarii) i Caddy z HTTPS;
- instaluje komendę `arena-aktualizuj`;
- na końcu sprawdza `https://ADRES/zdrowie`.

Jeśli strona na Vercelu ma własną domenę (nie `*.vercel.app`), dopisz ją jako drugi argument:
`bash serwer/instaluj.sh ADRES https://moja-domena.pl` — inaczej serwer odrzuci połączenia (403).

## 3. Przełączenie gry na serwer (w repo, nie na VPS)
- `gra/src/konfig.js`: `SERWER_WS = 'wss://ADRES/ws'`
- `gra/index.html`, CSP `connect-src`: dopisać `wss://ADRES https://ADRES`
- wdrożenie na `master` (Vercel). Powrót do Redisa = `SERWER_WS = null`.

## Obsługa na co dzień
| Co | Komenda |
|---|---|
| Aktualizacja serwera po zmianach w repo | `arena-aktualizuj` |
| Stan usługi | `systemctl status arena` |
| Logi serwera | `journalctl -u arena -n 100 --no-pager` (na żywo: `-f`) |
| Logi HTTPS | `journalctl -u caddy -n 50 --no-pager` |
| Czy żyje | `curl -s http://127.0.0.1:8787/zdrowie` |
| Restart | `systemctl restart arena` |

Restart serwera czyści pokoje w pamięci (trwające partie się urwą) — aktualizuj,
gdy nikt nie gra.

## Testy serwera (lokalnie albo na VPS)
```
cd serwer && npm install && node test.mjs
```
