#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/linker}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-master}"
DOMAIN="${DOMAIN:-linker.land}"
API_ORIGIN="${API_ORIGIN:-https://${DOMAIN}}"
PM2_APP_NAME="${PM2_APP_NAME:-linker}"

# If your working tree has local changes to tracked files (e.g. manual edits on server),
# deploy will abort. Set DIRTY_OK=1 to proceed anyway.
DIRTY_OK="${DIRTY_OK:-0}"

HEALTH_PATH="${HEALTH_PATH:-/health}"
HEALTH_MAX_WAIT_SEC="${HEALTH_MAX_WAIT_SEC:-60}"

LOCK_FILE="/tmp/linker-deploy.lock"

log() { echo "[$(date -Is)] $*"; }

debug_on_fail() {
  rc=$?
  if [[ $rc -ne 0 ]]; then
    echo
    echo "=== DEPLOY FAILED (exit ${rc}) ===" >&2
    echo "--- git status ---" >&2
    (cd "${REPO_DIR}" && git status -sb) || true
    echo "--- pm2 list ---" >&2
    pm2 list || true
    echo "--- pm2 logs (tail) ---" >&2
    pm2 logs "${PM2_APP_NAME}" --lines 120 --nostream || true
  fi
  exit $rc
}
trap debug_on_fail EXIT

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another deploy is running." >&2
  exit 1
fi

log "Deploy starting"

command -v git >/dev/null
command -v node >/dev/null
command -v npm >/dev/null
command -v pm2 >/dev/null
command -v flock >/dev/null

cd "${REPO_DIR}"

log "Git sync: ${REMOTE}/${BRANCH}"
git fetch "${REMOTE}" --prune

# Ensure we are on the correct branch
git checkout "${BRANCH}"

if [[ "${DIRTY_OK}" != "1" ]]; then
  # Ignore untracked files (e.g. local .env files)
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "Working tree has local tracked changes. Commit/push, or rerun with DIRTY_OK=1." >&2
    git status -sb >&2
    exit 2
  fi
fi

# Fast-forward only (no merge commits)
git pull --ff-only "${REMOTE}" "${BRANCH}"

echo "Deployed commit: $(git rev-parse --short HEAD)"

log "Ensure services up (best effort)"
systemctl start redis-server >/dev/null 2>&1 || true
systemctl start nginx >/dev/null 2>&1 || true
systemctl start pm2-root >/dev/null 2>&1 || true

log "Install server deps (skip puppeteer download)"
PUPPETEER_SKIP_DOWNLOAD=1 npm ci --prefix server --omit=dev

log "Install client deps"
npm ci --prefix client

log "Write client build env (.env)"
cat > "${REPO_DIR}/client/.env" <<ENVEOF
EXPO_PUBLIC_API_URL=${API_ORIGIN}
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:-294472116144-bgcqhr85smtcs7cck4roergenedchocd.apps.googleusercontent.com}
EXPO_PUBLIC_FACEBOOK_APP_ID=${EXPO_PUBLIC_FACEBOOK_APP_ID:-1366405595301808}
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:-AIzaSyB-10rZy3Bd9idrctZsjknHsq9sdwrxf8U}
ENVEOF

log "Build client web -> server/dist"
npm run build-web --prefix client

log "Restart app via PM2"
pm2 restart "${PM2_APP_NAME}" --update-env
pm2 save

log "Reload nginx (if needed)"
nginx -t && systemctl reload nginx

log "Health check"
deadline=$((SECONDS + HEALTH_MAX_WAIT_SEC))
while true; do
  if out="$(curl -fsS "${API_ORIGIN}${HEALTH_PATH}" 2>/dev/null)"; then
    echo "${out}" | sed -n '1,5p'
    break
  fi
  if (( SECONDS >= deadline )); then
    echo "Health check failed after ${HEALTH_MAX_WAIT_SEC}s: ${API_ORIGIN}${HEALTH_PATH}" >&2
    curl -sS -m 5 "${API_ORIGIN}${HEALTH_PATH}" || true
    exit 22
  fi
  sleep 2
done

if [[ -x "${REPO_DIR}/deploy/checks/verify.sh" ]]; then
  DOMAIN="${DOMAIN}" "${REPO_DIR}/deploy/checks/verify.sh" || true
fi

log "Deploy finished"

