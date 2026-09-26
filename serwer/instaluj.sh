#!/usr/bin/env bash
# Instalacja serwera Areny na świeżym VPS (Ubuntu 24.04 / Debian 12+), jako root.
#
#   bash serwer/instaluj.sh ADRES [DODATKOWE_ORIGINS]
#
#   ADRES             — nazwa, pod którą serwer ma HTTPS, np. 1-2-3-4.sslip.io
#   DODATKOWE_ORIGINS — opcjonalnie strony (poza *.vercel.app), które mogą się łączyć,
#                       po przecinku, np. https://moja-domena.pl
#
# Uruchamiaj z katalogu sklonowanego repo (np. /opt/lazi). Skrypt można puścić
# ponownie — nic nie psuje, tylko dociąga to, czego brakuje.
set -euo pipefail

ADRES="${1:-}"
ORIGINS="${2:-}"
if [[ -z "$ADRES" ]]; then echo "Użycie: bash serwer/instaluj.sh ADRES [ORIGINS]"; exit 1; fi
if [[ $EUID -ne 0 ]]; then echo "Uruchom jako root."; exit 1; fi

REPO="$(cd "$(dirname "$0")/.." && pwd)"
echo "==> Repo: $REPO, adres: $ADRES"

echo "==> Pakiety systemowe"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y git curl ufw fail2ban unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https ca-certificates gnupg

echo "==> Node.js 22"
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> Caddy (HTTPS od Let's Encrypt automatycznie)"
if ! command -v caddy >/dev/null; then
  apt-get install -y caddy || {
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y && apt-get install -y caddy
  }
fi

echo "==> Użytkownik systemowy 'arena' (serwer nie chodzi jako root)"
id arena >/dev/null 2>&1 || useradd --system --home /nonexistent --shell /usr/sbin/nologin arena

echo "==> Zależności serwera"
cd "$REPO/serwer"
npm ci --omit=dev --no-audit --no-fund
chown -R root:root "$REPO"
chmod -R a+rX "$REPO"

echo "==> Usługa systemd 'arena'"
cat > /etc/systemd/system/arena.service <<EOF
[Unit]
Description=Arena GOATow i zrzutka (WebSocket + API)
After=network.target

[Service]
User=arena
WorkingDirectory=$REPO/serwer
ExecStart=/usr/bin/node serwer.js
Environment=ARENA_PORT=8787
Environment=ARENA_ORIGINS=$ORIGINS
Environment=ZRZUTKA_PLIK=/var/lib/arena/zrzutka.json
StateDirectory=arena
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
MemoryMax=1G

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now arena
systemctl restart arena

echo "==> Caddy: $ADRES → 127.0.0.1:8787 (WebSocket przechodzi sam)"
cat > /etc/caddy/Caddyfile <<EOF
$ADRES {
	reverse_proxy 127.0.0.1:8787
	log {
		output file /var/log/caddy/arena.log {
			roll_size 10mb
			roll_keep 3
		}
	}
}
EOF
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy || true
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

echo "==> Zapora: tylko SSH, 80, 443"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Automatyczne aktualizacje bezpieczeństwa i fail2ban"
dpkg-reconfigure -f noninteractive unattended-upgrades || true
systemctl enable --now fail2ban

echo "==> Komenda aktualizacji: arena-aktualizuj"
cat > /usr/local/bin/arena-aktualizuj <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO"
git pull --ff-only
cd serwer && npm ci --omit=dev --no-audit --no-fund
systemctl restart arena
sleep 1
curl -fsS http://127.0.0.1:8787/zdrowie && echo
EOF
chmod +x /usr/local/bin/arena-aktualizuj

echo "==> Sprawdzenie"
sleep 2
systemctl is-active arena
curl -fsS http://127.0.0.1:8787/zdrowie && echo
echo "Czekam na certyfikat HTTPS (do ~30 s)…"
for i in $(seq 1 15); do
  if curl -fsS "https://$ADRES/zdrowie" >/dev/null 2>&1; then
    curl -fsS "https://$ADRES/zdrowie" && echo
    echo "GOTOWE: https://$ADRES/zdrowie działa. Adres dla gry: wss://$ADRES/ws"
    exit 0
  fi
  sleep 2
done
echo "UWAGA: HTTPS jeszcze nie odpowiada. Sprawdź: journalctl -u caddy -n 50 --no-pager"
exit 1
