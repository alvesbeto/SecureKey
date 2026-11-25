#!/usr/bin/env bash
set -euo pipefail

# Build the SecureKey .zab package or launch interactive QR preview.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PREVIEW_TARGET="${2:-gtr4new}"
MODE="${1:-build}"

cd "${PROJECT_ROOT}"

APP_NAME="$(node -e "const a=require('./app.json').app; process.stdout.write(a.appName+' '+a.version.name+' (code '+a.version.code+', appId '+a.appId+')')")"
echo "[SecureKey] Projeto: ${APP_NAME}"
echo "[SecureKey] Run TOTP cryptography and parser unit tests..."
node .agents/scripts/verify-totp.js

build_package() {
  echo "[SecureKey] Limpar pacotes .zab anteriores em dist/..."
  mkdir -p "${PROJECT_ROOT}/dist"
  # Remove any pre-existing installer / intermediate packages before rebuild.
  find "${PROJECT_ROOT}/dist" -maxdepth 1 \( -name '*.zab' -o -name '*.zpk' \) -type f -delete 2>/dev/null || true
  rm -f "${PROJECT_ROOT}/dist/"*.zab "${PROJECT_ROOT}/dist/"*.zpk 2>/dev/null || true

  # Clear local Zeus compile cache so preview cannot serve a stale settings bundle.
  if [ -d "${HOME}/.zepp/.zeus" ]; then
    echo "[SecureKey] Limpar cache local ~/.zepp/.zeus ..."
    find "${HOME}/.zepp/.zeus" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
  fi

  echo "[SecureKey] Build production .zab package for gtr4new and gtr4..."
  # zeus rejects a single quoted CSV target in some versions; pass both explicitly.
  zeus build -t gtr4new -t gtr4
  echo "[SecureKey] Build output:"
  ls -lt "${PROJECT_ROOT}/dist/"*.zab 2>/dev/null | head -5 || ls -lh "${PROJECT_ROOT}/dist/"
  echo "[SecureKey] Verifique no iPhone o titulo: SecureKey 1.2.2 / appId 20421"
  echo "[SecureKey] Se ainda aparecer UI antiga, desinstalle TODO SecureKey e reinstale pelo QR."
}

if [ "${MODE}" = "preview" ]; then
  # Always rebuild first so iPhone install is not an old cached package.
  build_package
  echo "[SecureKey] Launch zeus preview QR for target=${PREVIEW_TARGET}..."
  echo "[SecureKey] IMPORTANTE no iPhone:"
  echo "  1) Force-close do Zepp App"
  echo "  2) Desinstale o SecureKey antigo no Zepp (mesmo appId ${APP_NAME})"
  echo "  3) Escaneie o QR abaixo e reinstale"
  echo "  4) Abra SecureKey > Configuracoes e confira a secao PIN DO SMARTWATCH"
  echo "  (O WebView de Settings no iOS costuma cachear o JS se so reinstalar por cima.)"
  zeus preview -t "${PREVIEW_TARGET}"
elif [ "${MODE}" = "bridge" ]; then
  build_package
  echo "[SecureKey] Launch zeus bridge for direct iOS Zepp App install..."
  echo "[SecureKey] No prompt: connect  ->  install -t ${PREVIEW_TARGET}"
  zeus bridge
elif [ "${MODE}" = "dev" ]; then
  echo "[SecureKey] Launch zeus dev simulator mode for target=${PREVIEW_TARGET}..."
  zeus dev -t "${PREVIEW_TARGET}"
else
  build_package
fi
