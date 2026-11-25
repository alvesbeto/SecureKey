#!/usr/bin/env bash
set -euo pipefail

# Verify Node.js and npm versions, then install @zeppos/zeus-cli if missing.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "[SecureKey] Check Node.js installation..."
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Install Node.js v20 or later before you run this script." >&2
  exit 1
fi

NODE_VERSION="$(node -v)"
NPM_VERSION="$(npm -v)"
echo "[SecureKey] Found Node.js ${NODE_VERSION} and npm ${NPM_VERSION}."

echo "[SecureKey] Check @zeppos/zeus-cli installation..."
if ! command -v zeus >/dev/null 2>&1; then
  echo "[SecureKey] Install @zeppos/zeus-cli globally..."
  npm install -g @zeppos/zeus-cli
fi

ZEUS_VERSION="$(zeus -v)"
echo "[SecureKey] Found zeus CLI ${ZEUS_VERSION}."

if [ -f "${PROJECT_ROOT}/package.json" ]; then
  echo "[SecureKey] Install project npm dependencies..."
  cd "${PROJECT_ROOT}"
  npm install
else
  echo "[SecureKey] Skip npm install because package.json does not exist yet."
fi

echo "[SecureKey] Check zeus login and simulator status..."
zeus status || true
echo "[SecureKey] Environment setup complete."
