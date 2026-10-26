#!/usr/bin/env bash
# Idempotent Oracle Linux / Ubuntu bootstrap for WYZ analytics pilot.
# Does NOT create Oracle cloud resources. Does NOT write secrets.
set -euo pipefail

APP_DIR="${WYZ_APP_DIR:-/opt/wyz}"
DATA_DIR="${WYZ_HOST_WORK_DIR:-/data/wyz-analytics-work}"
DEPLOY_USER="${WYZ_DEPLOY_USER:-wyz}"

echo "==> WYZ pilot bootstrap"
echo "    APP_DIR=$APP_DIR"
echo "    DATA_DIR=$DATA_DIR"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg git ufw
  if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
  fi
  apt-get install -y docker-compose-plugin || true
elif command -v dnf >/dev/null 2>&1; then
  dnf -y update
  dnf -y install curl git firewalld
  if ! command -v docker >/dev/null 2>&1; then
    dnf -y install dnf-plugins-core
    dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo || true
    dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin || {
      echo "Install Docker Engine manually for this Oracle Linux version." >&2
      exit 1
    }
  fi
  systemctl enable --now docker || true
else
  echo "Unsupported package manager. Install Docker Engine + Compose plugin manually." >&2
  exit 1
fi

systemctl enable --now docker

id -u "$DEPLOY_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER" || true

mkdir -p "$APP_DIR" "$DATA_DIR" "$APP_DIR/frontend-dist"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DATA_DIR"
chmod 750 "$APP_DIR"
chmod 750 "$DATA_DIR"

# Host firewall baseline (does not replace Oracle Security List / NSG).
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH || ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable || true
  ufw status || true
elif command -v firewall-cmd >/dev/null 2>&1; then
  systemctl enable --now firewalld || true
  firewall-cmd --permanent --add-service=ssh || true
  firewall-cmd --permanent --add-service=http || true
  firewall-cmd --permanent --add-service=https || true
  firewall-cmd --reload || true
fi

echo "==> Bootstrap complete."
echo "Next:"
echo "  1. Clone/copy release into $APP_DIR"
echo "  2. Create $APP_DIR/.env.pilot (chmod 600) from .env.pilot.example — real secrets only on VM"
echo "  3. Build frontend: npm ci && npm run build && rsync dist/ $APP_DIR/frontend-dist/"
echo "  4. Run scripts/deploy-pilot.sh"
echo "Do NOT open TCP 8788 in Oracle Security List / NSG."
