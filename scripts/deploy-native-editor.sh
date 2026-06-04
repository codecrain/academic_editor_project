#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '[editor:deploy] %s\n' "$*"
}

die() {
  printf '[editor:deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_linux() {
  [ "$(uname -s)" = "Linux" ] || die "native deployment must run on Ubuntu/Linux."
}

ensure_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required. Install it or run EDITOR_NATIVE_AUTO_DEPS=true $0."
}

load_node_runtime() {
  if [ -s "${HOME:-}/.nvm/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "${HOME}/.nvm/nvm.sh"
    if [ -n "${EDITOR_NODE_VERSION:-}" ]; then
      nvm use "$EDITOR_NODE_VERSION" >/dev/null 2>&1 || nvm install "$EDITOR_NODE_VERSION"
    elif ! command -v node >/dev/null 2>&1; then
      nvm use default >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true
    fi
  fi
}

sync_repo() {
  truthy "${EDITOR_REPO_SYNC:-false}" || return 0
  ensure_command git

  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  [ "$branch" != "HEAD" ] || die "repository is detached. Set EDITOR_REPO_SYNC=false or check out a branch."

  log "syncing repository branch ${branch}"
  git fetch --tags --prune
  git pull --ff-only
}

apply_runtime_defaults() {
  export EDITOR_RUNTIME_MODE="${EDITOR_RUNTIME_MODE:-native}"
  export EDITOR_DEPLOY_ENV="${EDITOR_DEPLOY_ENV:-server}"
  export EDITOR_NATIVE_PM2_NAME="${EDITOR_NATIVE_PM2_NAME:-academic-editor-native}"
  export EDITOR_HOST_PORT="${EDITOR_HOST_PORT:-9980}"
  export EDITOR_INTERNAL_SERVER_URL="${EDITOR_INTERNAL_SERVER_URL:-http://127.0.0.1:${EDITOR_HOST_PORT}}"
  export EDITOR_DISCOVERY_SERVER_URL="${EDITOR_DISCOVERY_SERVER_URL:-${EDITOR_INTERNAL_SERVER_URL}}"
  export EDITOR_RECREATE="${EDITOR_RECREATE:-true}"
  export EDITOR_ALLOWED_DOMAIN="${EDITOR_ALLOWED_DOMAIN:-.*}"
  export EDITOR_NATIVE_AUTO_DEPS="${EDITOR_NATIVE_AUTO_DEPS:-false}"
  export EDITOR_NATIVE_AUTO_LATEST="${EDITOR_NATIVE_AUTO_LATEST:-false}"
  export EDITOR_NATIVE_INSTALL_ALWAYS="${EDITOR_NATIVE_INSTALL_ALWAYS:-false}"
  export EDITOR_NATIVE_INSTALL_ON_ARTIFACT_SOURCE="${EDITOR_NATIVE_INSTALL_ON_ARTIFACT_SOURCE:-true}"
  export EDITOR_CLEAN_ARTIFACT_CACHE="${EDITOR_CLEAN_ARTIFACT_CACHE:-true}"
  export EDITOR_VERIFY_PUBLIC="${EDITOR_VERIFY_PUBLIC:-true}"
  export EDITOR_AUDIT_NATIVE="${EDITOR_AUDIT_NATIVE:-true}"
  export EDITOR_SOURCE_OFFER="${EDITOR_SOURCE_OFFER:-true}"
  export EDITOR_SMOKE="${EDITOR_SMOKE:-true}"
  export EDITOR_PM2_SAVE="${EDITOR_PM2_SAVE:-true}"

  if [ -z "${EDITOR_PUBLIC_URL:-}" ] && [ -n "${EDITOR_DOCUMENT_SERVER_URL:-}" ]; then
    export EDITOR_PUBLIC_URL="$EDITOR_DOCUMENT_SERVER_URL"
  fi
  if [ -n "${EDITOR_PUBLIC_URL:-}" ] && [ -z "${EDITOR_DOCUMENT_SERVER_URL:-}" ]; then
    export EDITOR_DOCUMENT_SERVER_URL="$EDITOR_PUBLIC_URL"
  fi

  if truthy "${EDITOR_REQUIRE_PUBLIC_URL:-false}" && [ -z "${EDITOR_PUBLIC_URL:-}" ]; then
    die "set EDITOR_PUBLIC_URL=https://your-service-domain before running production sh.start."
  fi
}

native_installed() {
  [ -x "${EDITOR_NATIVE_COOLWSD_BIN:-/usr/bin/coolwsd}" ]
}

artifact_configured() {
  [ -n "${EDITOR_NATIVE_ARTIFACT:-}" ] ||
    [ -n "${EDITOR_NATIVE_ARTIFACT_URL:-}" ] ||
    [ -n "${EDITOR_NATIVE_RELEASE_TAG:-}" ]
}

resolve_latest_release_tag() {
  ensure_command curl
  ensure_command node

  local repo="${EDITOR_NATIVE_RELEASE_REPOSITORY:-codecrain/academic_editor_project}"
  local api="https://api.github.com/repos/${repo}/releases/latest"
  local tag
  log "resolving latest native release from ${repo}"
  tag="$(curl -fsSL "$api" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); if(!j.tag_name) process.exit(1); console.log(j.tag_name);})")" ||
    die "could not resolve latest release tag from ${api}."
  export EDITOR_NATIVE_RELEASE_TAG="$tag"
  log "using EDITOR_NATIVE_RELEASE_TAG=${EDITOR_NATIVE_RELEASE_TAG}"
}

install_deps_if_requested() {
  truthy "$EDITOR_NATIVE_AUTO_DEPS" || return 0
  log "installing native dependencies"
  npm run deps:native
}

should_install_artifact() {
  if truthy "$EDITOR_NATIVE_INSTALL_ALWAYS"; then
    return 0
  fi
  if ! native_installed; then
    return 0
  fi
  truthy "$EDITOR_NATIVE_INSTALL_ON_ARTIFACT_SOURCE" && artifact_configured
}

safe_remove_build_path() {
  local target="$1"
  case "$target" in
    "$ROOT_DIR/.build/"*) rm -rf -- "$target" ;;
    *) die "refusing to remove path outside .build: ${target}" ;;
  esac
}

clean_artifact_cache() {
  truthy "$EDITOR_CLEAN_ARTIFACT_CACHE" || return 0
  safe_remove_build_path "$ROOT_DIR/.build/native-editor-artifact"
  safe_remove_build_path "$ROOT_DIR/.build/artifacts"
}

install_artifact_if_needed() {
  if ! should_install_artifact; then
    log "native runtime already installed; skipping artifact install"
    return 0
  fi

  if ! artifact_configured && truthy "$EDITOR_NATIVE_AUTO_LATEST"; then
    resolve_latest_release_tag
  fi

  artifact_configured ||
    die "native runtime is not installed. Set EDITOR_NATIVE_RELEASE_TAG=native-YYYYMMDD, EDITOR_NATIVE_ARTIFACT_URL, or EDITOR_NATIVE_ARTIFACT."

  log "installing native artifact"
  npm run install:native:artifact
  clean_artifact_cache
}

run_optional_checks() {
  if truthy "$EDITOR_VERIFY_PUBLIC"; then
    npm run verify:public
  fi

  npm run doctor:native
  npm run start:native
  npm run doctor:native -- --require-installed

  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

  if truthy "$EDITOR_AUDIT_NATIVE"; then
    mkdir -p "$ROOT_DIR/.build/audits"
    if [ -z "${EDITOR_AUDIT_OUTPUT:-}" ]; then
      export EDITOR_AUDIT_OUTPUT="$ROOT_DIR/.build/audits/native-runtime-audit-${EDITOR_DEPLOY_ENV}-${timestamp}.json"
    fi
    npm run audit:native -- --output "$EDITOR_AUDIT_OUTPUT"
  fi

  if truthy "$EDITOR_SOURCE_OFFER"; then
    mkdir -p "$ROOT_DIR/.build/source-offers"
    if [ -z "${EDITOR_SOURCE_OFFER_OUTPUT:-}" ]; then
      export EDITOR_SOURCE_OFFER_OUTPUT="$ROOT_DIR/.build/source-offers/document-editor-source-offer-${EDITOR_DEPLOY_ENV}-${timestamp}.txt"
    fi
    npm run source-offer -- --output "$EDITOR_SOURCE_OFFER_OUTPUT"
  fi

  if truthy "$EDITOR_SMOKE"; then
    npm run smoke
  fi
}

save_pm2_state() {
  truthy "$EDITOR_PM2_SAVE" || return 0
  ensure_command pm2
  pm2 save
  pm2 status
}

main() {
  ensure_linux
  load_node_runtime
  ensure_command node
  ensure_command npm
  apply_runtime_defaults
  sync_repo
  install_deps_if_requested
  ensure_command pm2
  install_artifact_if_needed
  run_optional_checks
  save_pm2_state

  log "done"
  log "pm2 process: ${EDITOR_NATIVE_PM2_NAME}"
  log "port: ${EDITOR_HOST_PORT}"
  log "internal discovery: ${EDITOR_DISCOVERY_SERVER_URL}/hosting/discovery"
  if [ -n "${EDITOR_PUBLIC_URL:-}" ]; then
    log "public url: ${EDITOR_PUBLIC_URL}"
  fi
}

main "$@"
