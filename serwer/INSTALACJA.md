# Serwer Areny na VPS — instalacja i obsługa

Strona (pliki HTML/JS) zostaje na **Vercelu**. Na VPS działa **serwer Areny i zrzutki**
(`serwer/serwer.js`, Node + WebSocket) za **Caddy** (HTTPS). Redis (Upstash) nie jest
już potrzebny — `api/` na Vercelu zostaje tylko jako zapas (powrót = zmiana adresu w kodzie).

Dane zrzutki leżą w pliku `/var/lib/arena/zrzutka.json` (zapis przez plik tymczasowy,
codzienna kopia `zrzutka-RRRR-MM-DD.json`, 14 ostatnich dni). Dane Areny są tylko w pamięci.

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

## 3. Przełączenie strony na serwer (w repo, nie na VPS)
- `gra/src/konfig.js`: `SERWER_WS = 'wss://ADRES/ws'`; `zrzutka/app.js`: `SERWER = 'https://ADRES'`
- CSP `connect-src` w `gra/index.html` i `index.html`: `wss://ADRES https://ADRES`
- wdrożenie na `master` (Vercel). Powrót do Redisa = `SERWER_WS = null` i `SERWER = null`
  (uwaga: wpłaty złożone na VPS nie wrócą same do Redisa).

## 4. Przeniesienie zrzutki z Redisa (raz)
Potrzebny adres i token REST Upstasha — najlepiej **Read-Only Token** (panel Upstash →
baza → REST API; skrypt tylko czyta). Tokenu nie zapisuj w plikach ani w repo.
```
cd /opt/lazi/serwer
UPSTASH_URL='https://….upstash.io' UPSTASH_TOKEN='…' node migruj-zrzutke.mjs /var/lib/arena/zrzutka.json
```
Kolejność: (1) skrypt przed wdrożeniem strony — kopia 1:1, (2) wdrożenie na `master`,
(3) ten sam skrypt ~2 min po wdrożeniu — dopisze tylko wpłaty, które w międzyczasie
poszły jeszcze do Redisa (po id, bez dubli). Skrypt sam zatrzymuje i wznawia usługę.

## Obsługa na co dzień
| Co | Komenda |
|---|---|
| Aktualizacja serwera po zmianach w repo | `arena-aktualizuj` |
| Stan usługi | `systemctl status arena` |
| Logi serwera | `journalctl -u arena -n 100 --no-pager` (na żywo: `-f`) |
| Logi HTTPS | `journalctl -u caddy -n 50 --no-pager` |
| Czy żyje | `curl -s http://127.0.0.1:8787/zdrowie` |
| Restart | `systemctl restart arena` |
| Sumy zrzutki | `curl -s http://127.0.0.1:8787/api/zrzutka` |
| Kopie zrzutki | `ls /var/lib/arena/` |

Restart serwera czyści pokoje w pamięci (trwające partie się urwą) — aktualizuj,
gdy nikt nie gra. Zrzutka przeżywa restart (plik). Po zmianie `instaluj.sh` (usługa, Caddy)
samo `arena-aktualizuj` nie wystarczy — puść skrypt instalacji jeszcze raz z tymi samymi argumentami.

## Testy serwera (lokalnie albo na VPS)
```
cd serwer && npm install && node test.mjs
```
