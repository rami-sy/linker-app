#!/usr/bin/env bash
set -euo pipefail

# Safe defaults: do NOT lock yourself out.
# If you use a non-standard SSH port, adjust BEFORE enabling UFW.

RTP_MIN_PORT="${RTP_MIN_PORT:-40000}"
RTP_MAX_PORT="${RTP_MAX_PORT:-49999}"

echo "Configuring UFW for Linker"
echo "- Allowing OpenSSH"
echo "- Allowing HTTP/HTTPS"
echo "- Allowing mediasoup RTP range: ${RTP_MIN_PORT}-${RTP_MAX_PORT} (UDP + TCP)"

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

sudo ufw allow "${RTP_MIN_PORT}:${RTP_MAX_PORT}/udp"
sudo ufw allow "${RTP_MIN_PORT}:${RTP_MAX_PORT}/tcp"

sudo ufw --force enable
sudo ufw status verbose

