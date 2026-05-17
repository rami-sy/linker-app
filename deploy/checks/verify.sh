#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-linker.land}"
OPS_TOKEN="${OPS_TOKEN:-}"

echo "== Basic HTTP checks =="
curl -fsS "https://${DOMAIN}/health" | sed -n '1,10p' || true

if [[ -n "${OPS_TOKEN}" ]]; then
  echo
  echo "== Ready / Metrics (OPS_TOKEN provided) =="
  curl -fsS -H "x-ops-token: ${OPS_TOKEN}" "https://${DOMAIN}/ready" | sed -n '1,50p' || true
  curl -fsS -H "x-ops-token: ${OPS_TOKEN}" "https://${DOMAIN}/metrics" | sed -n '1,50p' || true
else
  echo
  echo "OPS_TOKEN not set. Skipping /ready and /metrics."
  echo "Run with: OPS_TOKEN=... DOMAIN=${DOMAIN} ./deploy/checks/verify.sh"
fi

