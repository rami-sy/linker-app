#!/usr/bin/env bash
# Run ON the VPS as root after Namecheap DNS A records point to this server.
#
# Usage:
#   sudo bash /opt/linker/deploy/scripts/setup-linker-domain.sh
#   sudo DOMAIN=linker.land PUBLIC_IP=143.198.117.84 bash setup-linker-domain.sh
#
set -euo pipefail

DOMAIN="${DOMAIN:-linker.land}"
WWW="${WWW:-www.${DOMAIN}}"
PUBLIC_IP="${PUBLIC_IP:-143.198.117.84}"
REPO_DIR="${REPO_DIR:-/opt/linker}"
ENV_FILE="${ENV_FILE:-/etc/linker/linker.env}"
NGINX_SITE="/etc/nginx/sites-available/linker.conf"

log() { echo "[$(date -Is)] $*"; }

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Run as root (sudo)." >&2
    exit 1
  fi
}

check_dns() {
  local resolved=""
  if command -v dig >/dev/null 2>&1; then
    resolved="$(dig +short "${DOMAIN}" A | head -1 | tr -d '\r')"
  elif command -v host >/dev/null 2>&1; then
    resolved="$(host -t A "${DOMAIN}" 2>/dev/null | awk '/has address/ {print $4; exit}')"
  fi
  if [[ -z "${resolved}" ]]; then
    log "WARN: ${DOMAIN} has no A record yet (DNS not propagated)."
    log "Add in Namecheap Advanced DNS:"
    log "  A @ -> ${PUBLIC_IP}"
    log "  A www -> ${PUBLIC_IP}"
    if [[ "${SKIP_DNS_CHECK:-0}" != "1" ]]; then
      echo "Set SKIP_DNS_CHECK=1 to continue without DNS." >&2
      exit 1
    fi
  elif [[ "${resolved}" != "${PUBLIC_IP}" ]]; then
    log "WARN: ${DOMAIN} resolves to ${resolved}, expected ${PUBLIC_IP}"
    if [[ "${SKIP_DNS_CHECK:-0}" != "1" ]]; then
      exit 1
    fi
  else
    log "DNS OK: ${DOMAIN} -> ${resolved}"
  fi
}

patch_env() {
  mkdir -p "$(dirname "${ENV_FILE}")"
  if [[ ! -f "${ENV_FILE}" ]]; then
    cp "${REPO_DIR}/deploy/env/linker.env.example" "${ENV_FILE}"
    log "Created ${ENV_FILE} from example — fill MONGO_URI and JWT_SECRET if empty."
  fi
  local cors="https://${DOMAIN},https://${WWW}"
  if grep -q '^CORS_ORIGIN=' "${ENV_FILE}"; then
    sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=${cors}|" "${ENV_FILE}"
  else
    echo "CORS_ORIGIN=${cors}" >> "${ENV_FILE}"
  fi
  if grep -q '^MEDIASOUP_ANNOUNCED_IP=' "${ENV_FILE}"; then
    sed -i "s|^MEDIASOUP_ANNOUNCED_IP=.*|MEDIASOUP_ANNOUNCED_IP=${PUBLIC_IP}|" "${ENV_FILE}"
  else
    echo "MEDIASOUP_ANNOUNCED_IP=${PUBLIC_IP}" >> "${ENV_FILE}"
  fi
  if grep -q '^TRUST_PROXY=' "${ENV_FILE}"; then
    sed -i 's|^TRUST_PROXY=.*|TRUST_PROXY=true|' "${ENV_FILE}"
  else
    echo "TRUST_PROXY=true" >> "${ENV_FILE}"
  fi
  log "Updated ${ENV_FILE} (CORS + MEDIASOUP_ANNOUNCED_IP)"
}

setup_nginx_http() {
  cp "${REPO_DIR}/deploy/nginx/linker.conf" "${NGINX_SITE}"
  ln -sf "${NGINX_SITE}" /etc/nginx/sites-enabled/linker.conf
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t
  systemctl reload nginx
  log "Nginx HTTP config for ${DOMAIN} + ${WWW}"
}

setup_ssl() {
  if [[ -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
    log "Certificate already exists for ${DOMAIN}"
    return 0
  fi
  apt-get update -qq
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "${DOMAIN}" -d "${WWW}" \
    --non-interactive --agree-tos \
    ${CERTBOT_EMAIL:+--email "${CERTBOT_EMAIL}"} \
    ${CERTBOT_EMAIL:---register-unsafely-without-email} || {
    log "Certbot failed. Ensure DNS A records point to ${PUBLIC_IP} and port 80 is open."
    exit 1
  }
  log "SSL installed"
}

deploy_app() {
  if [[ -x /root/linker-deploy.sh ]]; then
    DOMAIN="${DOMAIN}" API_ORIGIN="https://${DOMAIN}" /root/linker-deploy.sh
  elif [[ -x "${REPO_DIR}/deploy/scripts/linker-deploy.sh" ]]; then
    DOMAIN="${DOMAIN}" API_ORIGIN="https://${DOMAIN}" bash "${REPO_DIR}/deploy/scripts/linker-deploy.sh"
  else
    log "Deploy script not found — run linker-deploy manually."
  fi
}

verify() {
  curl -fsS "https://${DOMAIN}/health" | head -c 200
  echo
  log "OK: https://${DOMAIN}/health"
}

require_root
check_dns
patch_env
setup_nginx_http
setup_ssl
deploy_app
verify
log "Done. Open https://${DOMAIN} and add PWA from mobile."
