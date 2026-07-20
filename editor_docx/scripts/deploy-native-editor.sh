#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '[editor:deploy] %s\n' "$*"
}

die() {
  printf '[editor:deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

load_secret_env() {
  local secret_file="${EDITOR_SECRET_ENV_FILE:-${HOME:-}/.config/academic-editor/mcp.env}"
  [ -f "$secret_file" ] || return 0
  set -a
  # shellcheck source=/dev/null
  . "$secret_file"
  set +a
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
  fi
}

sync_repo() {
  truthy "${EDITOR_REPO_SYNC:-false}" || return 0
  ensure_command git

  local branch before_head after_head reexec_count
  branch="$(git rev-parse --abbrev-ref HEAD)"
  [ "$branch" != "HEAD" ] || die "repository is detached. Set EDITOR_REPO_SYNC=false or check out a branch."
  before_head="$(git rev-parse HEAD)"

  log "syncing repository branch ${branch}"
  git fetch --tags --prune
  git pull --ff-only
  after_head="$(git rev-parse HEAD)"

  if [ "$before_head" != "$after_head" ]; then
    reexec_count="${EDITOR_DEPLOY_REEXEC_COUNT:-0}"
    [ "$reexec_count" -lt 2 ] || die "repository kept changing during deployment; run the deploy command again."
    export EDITOR_DEPLOY_REEXEC_COUNT="$((reexec_count + 1))"
    log "repository updated; restarting deployment with the latest script"
    exec bash "$0" "$@"
  fi
}

apply_runtime_defaults() {
  export EDITOR_RUNTIME_MODE="${EDITOR_RUNTIME_MODE:-native}"
  export EDITOR_DEPLOY_ENV="${EDITOR_DEPLOY_ENV:-server}"
  export EDITOR_NATIVE_PM2_NAME="${EDITOR_NATIVE_PM2_NAME:-academic-editor-native}"
  export EDITOR_NATIVE_RUNTIME_DIR="${EDITOR_NATIVE_RUNTIME_DIR:-/var/lib/academic-editor}"
  export EDITOR_NATIVE_OFFICE_DIR="${EDITOR_NATIVE_OFFICE_DIR:-/opt/collaboraoffice}"
  export EDITOR_NATIVE_ACADEMIC_FONT_DIR="${EDITOR_NATIVE_ACADEMIC_FONT_DIR:-/usr/local/share/fonts/tlooto-academic}"
  export EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE="${EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE:-$ROOT_DIR/editor_docx/assets/dictionaries/tlooto-academic-en-US.dic}"
  export EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET="${EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET:-$EDITOR_NATIVE_OFFICE_DIR/share/wordbook/standard.dic}"
  export EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_SOURCE="${EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_SOURCE:-$ROOT_DIR/editor_docx/assets/dictionaries/tlooto-academic-en-US.owner}"
  export EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_TARGET="${EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_TARGET:-$EDITOR_NATIVE_OFFICE_DIR/share/wordbook/standard.dic.tlooto-owner}"
  export EDITOR_HOST_PORT="${EDITOR_HOST_PORT:-9980}"
  export EDITOR_SERVICE_ROOT="${EDITOR_SERVICE_ROOT:-/docx}"
  export EDITOR_SERVICE_ROOT="/${EDITOR_SERVICE_ROOT#/}"
  export EDITOR_SERVICE_ROOT="${EDITOR_SERVICE_ROOT%/}"
  if [ "$EDITOR_SERVICE_ROOT" = "/" ]; then
    export EDITOR_SERVICE_ROOT=""
  fi
  export EDITOR_GATEWAY_HOST="${EDITOR_GATEWAY_HOST:-127.0.0.1}"
  export EDITOR_GATEWAY_PORT="${EDITOR_GATEWAY_PORT:-11004}"
  export EDITOR_GATEWAY_PM2_NAME="${EDITOR_GATEWAY_PM2_NAME:-academic-editor-gateway-${EDITOR_DEPLOY_ENV}}"
  export RHWP_ENABLED="${RHWP_ENABLED:-true}"
  export RHWP_STUDIO_PM2_NAME="${RHWP_STUDIO_PM2_NAME:-rhwp-studio-${EDITOR_DEPLOY_ENV}}"
  export RHWP_STUDIO_BASE_PATH="${RHWP_STUDIO_BASE_PATH:-/hwpx/}"
  export EDITOR_GATEWAY_HWPX_STATIC_ROOT="${EDITOR_GATEWAY_HWPX_STATIC_ROOT:-$ROOT_DIR/editor_hwpx/rhwp-studio/dist}"
  export EDITOR_GATEWAY_PUBLIC_ORIGIN="${EDITOR_GATEWAY_PUBLIC_ORIGIN:-http://${EDITOR_GATEWAY_HOST}:${EDITOR_GATEWAY_PORT}}"
  export EDITOR_GATEWAY_WOPI_BASE_URL="${EDITOR_GATEWAY_WOPI_BASE_URL:-http://127.0.0.1:${EDITOR_GATEWAY_PORT}}"
  export EDITOR_GATEWAY_DOCX_ORIGIN="${EDITOR_GATEWAY_DOCX_ORIGIN:-http://127.0.0.1:${EDITOR_HOST_PORT}}"
  export EDITOR_RUNTIME_INTERNAL_SERVER_URL="${EDITOR_RUNTIME_INTERNAL_SERVER_URL:-http://127.0.0.1:${EDITOR_HOST_PORT}${EDITOR_SERVICE_ROOT}}"
  export EDITOR_RUNTIME_DISCOVERY_SERVER_URL="${EDITOR_RUNTIME_DISCOVERY_SERVER_URL:-${EDITOR_RUNTIME_INTERNAL_SERVER_URL}}"
  export EDITOR_RUNTIME_INTERNAL_SERVER_URL="$(ensure_runtime_url_uses_service_root "${EDITOR_RUNTIME_INTERNAL_SERVER_URL}")"
  export EDITOR_RUNTIME_DISCOVERY_SERVER_URL="$(ensure_runtime_url_uses_service_root "${EDITOR_RUNTIME_DISCOVERY_SERVER_URL}")"
  export EDITOR_INTERNAL_SERVER_URL="${EDITOR_INTERNAL_SERVER_URL:-http://127.0.0.1:${EDITOR_GATEWAY_PORT}${EDITOR_SERVICE_ROOT}}"
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

font_tree_signature() {
  local font_dir="$1"
  [ -d "$font_dir" ] || return 0
  (
    cd "$font_dir"
    find . -type f \( -iname '*.ttf' -o -iname '*.ttc' -o -iname '*.otf' \) \
      -printf '%P|%s\n' | LC_ALL=C sort | sha256sum | awk '{print $1}'
  )
}

native_systemplate_fonts_synced() {
  local source_dir="$EDITOR_NATIVE_ACADEMIC_FONT_DIR"
  local target_dir="${EDITOR_NATIVE_RUNTIME_DIR}/systemplate${source_dir}"
  local source_signature target_signature

  [ -d "$source_dir" ] || return 0
  source_signature="$(font_tree_signature "$source_dir")"
  target_signature="$(font_tree_signature "$target_dir")"
  [ -n "$source_signature" ] && [ "$source_signature" = "$target_signature" ]
}

native_academic_dictionary_installed() {
  [ -f "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE" ] &&
    [ -f "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_SOURCE" ] &&
    [ -f "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET" ] &&
    [ -f "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_TARGET" ] &&
    cmp -s "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE" "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET" &&
    cmp -s "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_SOURCE" "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_TARGET"
}

native_systemplate_dictionary_synced() {
  local target="${EDITOR_NATIVE_RUNTIME_DIR}/systemplate${EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET}"
  [ -f "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE" ] &&
    [ -f "$target" ] &&
    cmp -s "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE" "$target"
}

sync_native_systemplate_dictionary() {
  native_systemplate_dictionary_synced && return 0

  local target target_dir
  target="${EDITOR_NATIVE_RUNTIME_DIR}/systemplate${EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET}"
  target_dir="$(dirname "$target")"
  log "syncing supplemental academic dictionary into native systemplate"

  if { [ -d "$target_dir" ] && [ -w "$target_dir" ]; } ||
      { [ ! -e "$target_dir" ] && [ -w "${EDITOR_NATIVE_RUNTIME_DIR}/systemplate" ]; }; then
    install -D -m 0644 "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE" "$target"
  elif [ -t 0 ]; then
    ensure_command sudo
    sudo install -D -m 0644 "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE" "$target"
  else
    ensure_command sudo
    sudo -n install -D -m 0644 \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE" "$target" || die \
      "systemplate dictionary synchronization requires elevated permissions: ${target}"
  fi

  native_systemplate_dictionary_synced || die \
    "academic dictionary was not copied into native systemplate: ${target}"
}

sync_native_academic_dictionary() {
  node "$ROOT_DIR/editor_docx/scripts/academic-dictionary.mjs" \
    "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE" >/dev/null
  [ -f "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_SOURCE" ] || die \
    "academic dictionary ownership marker is missing: ${EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_SOURCE}"

  native_academic_dictionary_installed && {
    log "native academic dictionary is current"
    return 0
  }

  if [ -e "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET" ] &&
      ! cmp -s "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE" "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET" &&
      { [ ! -e "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_TARGET" ] ||
        ! cmp -s "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_SOURCE" "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_TARGET"; }; then
    die "refusing to replace unmanaged shared wordbook: ${EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET}"
  fi

  local target_dir
  target_dir="$(dirname "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET")"
  log "installing supplemental academic dictionary"
  if [ -d "$target_dir" ] && [ -w "$target_dir" ]; then
    install -D -m 0644 \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_SOURCE" \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_TARGET"
    install -D -m 0644 \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE" \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET"
  elif [ -t 0 ]; then
    ensure_command sudo
    sudo install -D -m 0644 \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_SOURCE" \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_TARGET"
    sudo install -D -m 0644 \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE" \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET"
  else
    ensure_command sudo
    sudo -n install -D -m 0644 \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_SOURCE" \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_TARGET" || die \
      "academic dictionary ownership marker requires elevated permissions: ${EDITOR_NATIVE_ACADEMIC_DICTIONARY_OWNER_TARGET}"
    sudo -n install -D -m 0644 \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_SOURCE" \
      "$EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET" || die \
      "academic dictionary installation requires elevated permissions: ${EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET}"
  fi

  native_academic_dictionary_installed || die \
    "academic dictionary was not installed exactly: ${EDITOR_NATIVE_ACADEMIC_DICTIONARY_TARGET}"
}

native_systemplate_content_synced() {
  native_systemplate_fonts_synced && native_systemplate_dictionary_synced
}

sync_native_systemplate() {
  native_systemplate_content_synced && {
    log "native systemplate academic assets are current"
    return 0
  }

  local systemplate_dir="${EDITOR_NATIVE_RUNTIME_DIR}/systemplate"
  if [ ! -d "$systemplate_dir" ] || ! native_systemplate_fonts_synced; then
    ensure_command coolwsd-systemplate-setup
    local setup=(coolwsd-systemplate-setup "$systemplate_dir" "$EDITOR_NATIVE_OFFICE_DIR")

    log "syncing native systemplate and academic fonts"
    if [ -w "$systemplate_dir" ] || { [ ! -e "$systemplate_dir" ] && [ -w "$EDITOR_NATIVE_RUNTIME_DIR" ]; }; then
      "${setup[@]}"
    elif [ -t 0 ]; then
      ensure_command sudo
      sudo "${setup[@]}"
    else
      ensure_command sudo
      sudo -n "${setup[@]}" || die \
        "systemplate fonts are stale and require elevated permissions. Run: sudo ${setup[*]}"
    fi
  else
    log "native systemplate academic fonts are current"
  fi

  sync_native_systemplate_dictionary
  native_systemplate_content_synced || die \
    "academic fonts or dictionary were not copied into ${systemplate_dir}."
}

ensure_runtime_url_uses_service_root() {
  local value="${1%/}"
  if [ -z "${EDITOR_SERVICE_ROOT}" ] || [ -z "${value}" ]; then
    printf '%s\n' "${value}"
    return 0
  fi

  case "${value}" in
    *"${EDITOR_SERVICE_ROOT}"|*"${EDITOR_SERVICE_ROOT}/"*)
      printf '%s\n' "${value}"
      return 0
      ;;
    */hosting/discovery)
      printf '%s%s/hosting/discovery\n' "${value%/hosting/discovery}" "${EDITOR_SERVICE_ROOT}"
      return 0
      ;;
  esac

  if [[ "${value}" =~ ^https?://[^/]+$ ]]; then
    printf '%s%s\n' "${value}" "${EDITOR_SERVICE_ROOT}"
    return 0
  fi

  printf '%s\n' "${value}"
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

wait_for_url() {
  local url="$1"
  local label="$2"
  local timeout_seconds="${3:-90}"
  local deadline=$((SECONDS + timeout_seconds))

  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      log "${label} ready: ${url}"
      return 0
    fi
    sleep 2
  done

  die "${label} did not become ready at ${url}"
}

run_docx_runtime_npm() {
  EDITOR_INTERNAL_SERVER_URL="$EDITOR_RUNTIME_INTERNAL_SERVER_URL" \
  EDITOR_DISCOVERY_SERVER_URL="$EDITOR_RUNTIME_DISCOVERY_SERVER_URL" \
  EDITOR_WOPI_BASE_URL="${EDITOR_WOPI_BASE_URL:-$EDITOR_GATEWAY_WOPI_BASE_URL}" \
  EDITOR_WOPI_ALIASES="${EDITOR_WOPI_ALIASES:-$EDITOR_GATEWAY_PUBLIC_ORIGIN}" \
  npm run "$@"
}

prepare_rhwp_static_assets() {
  truthy "$RHWP_ENABLED" || {
    log "HWPX editor skipped because RHWP_ENABLED=${RHWP_ENABLED}"
    return 0
  }

  [ -f "$ROOT_DIR/editor_hwpx/package.json" ] || die "RHWP runtime package was not found: $ROOT_DIR/editor_hwpx"

  log "building HWPX editor static assets"
  RHWP_STUDIO_BASE_PATH="$RHWP_STUDIO_BASE_PATH" \
  npm --prefix "$ROOT_DIR/editor_hwpx" run build

  [ -f "$EDITOR_GATEWAY_HWPX_STATIC_ROOT/index.html" ] ||
    die "HWPX editor static build was not found: $EDITOR_GATEWAY_HWPX_STATIC_ROOT"

  pm2 delete "$RHWP_STUDIO_PM2_NAME" >/dev/null 2>&1 || true
  log "HWPX static assets ready: ${EDITOR_GATEWAY_HWPX_STATIC_ROOT}"
}

start_editor_gateway() {
  local gateway_script="$ROOT_DIR/editor_docx/scripts/editor-gateway.mjs"
  [ -f "$gateway_script" ] || die "editor gateway script was not found: $gateway_script"

  local gateway_name
  for gateway_name in \
    "$EDITOR_GATEWAY_PM2_NAME" \
    academic-editor-gateway \
    academic-editor-gateway-dev \
    academic-editor-gateway-prod
  do
    pm2 delete "$gateway_name" >/dev/null 2>&1 || true
  done
  log "starting editor gateway pm2 process ${EDITOR_GATEWAY_PM2_NAME}"
  EDITOR_GATEWAY_HOST="$EDITOR_GATEWAY_HOST" \
  EDITOR_GATEWAY_PORT="$EDITOR_GATEWAY_PORT" \
  EDITOR_GATEWAY_PUBLIC_ORIGIN="$EDITOR_GATEWAY_PUBLIC_ORIGIN" \
  EDITOR_GATEWAY_WOPI_BASE_URL="$EDITOR_GATEWAY_WOPI_BASE_URL" \
  EDITOR_GATEWAY_DOCX_ORIGIN="$EDITOR_GATEWAY_DOCX_ORIGIN" \
  EDITOR_GATEWAY_HWPX_STATIC_ROOT="$EDITOR_GATEWAY_HWPX_STATIC_ROOT" \
  EDITOR_SERVICE_ROOT="$EDITOR_SERVICE_ROOT" \
  RHWP_STUDIO_BASE_PATH="$RHWP_STUDIO_BASE_PATH" \
  pm2 start "$(command -v node)" --name "$EDITOR_GATEWAY_PM2_NAME" -- "$gateway_script"

  wait_for_url "${EDITOR_INTERNAL_SERVER_URL}/" "DOCX gateway"
  if truthy "$RHWP_ENABLED"; then
    wait_for_url "http://127.0.0.1:${EDITOR_GATEWAY_PORT}${RHWP_STUDIO_BASE_PATH}" "HWPX gateway"
  fi
}

run_optional_checks() {
  if truthy "$EDITOR_VERIFY_PUBLIC"; then
    npm run verify:public
  fi

  run_docx_runtime_npm doctor:native
  run_docx_runtime_npm start:native
  run_docx_runtime_npm doctor:native -- --require-installed
  prepare_rhwp_static_assets
  start_editor_gateway

  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

  if truthy "$EDITOR_AUDIT_NATIVE"; then
    mkdir -p "$ROOT_DIR/.build/audits"
    if [ -z "${EDITOR_AUDIT_OUTPUT:-}" ]; then
      export EDITOR_AUDIT_OUTPUT="$ROOT_DIR/.build/audits/native-runtime-audit-${EDITOR_DEPLOY_ENV}-${timestamp}.json"
    fi
    run_docx_runtime_npm audit:native -- --output "$EDITOR_AUDIT_OUTPUT"
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
  load_secret_env
  load_node_runtime
  ensure_command node
  ensure_command npm
  ensure_command curl
  apply_runtime_defaults
  sync_repo "$@"
  install_deps_if_requested
  ensure_command pm2
  install_artifact_if_needed
  sync_native_academic_dictionary
  sync_native_systemplate
  run_optional_checks
  save_pm2_state

  log "done"
  log "pm2 process: ${EDITOR_NATIVE_PM2_NAME}"
  log "gateway pm2 process: ${EDITOR_GATEWAY_PM2_NAME}"
  log "DOCX internal port: ${EDITOR_HOST_PORT}"
  log "gateway port: ${EDITOR_GATEWAY_PORT}"
  log "HWPX static root: ${EDITOR_GATEWAY_HWPX_STATIC_ROOT}"
  log "DOCX path: ${EDITOR_GATEWAY_PUBLIC_ORIGIN}${EDITOR_SERVICE_ROOT}/"
  log "HWPX path: ${EDITOR_GATEWAY_PUBLIC_ORIGIN}${RHWP_STUDIO_BASE_PATH}"
  log "internal discovery: ${EDITOR_DISCOVERY_SERVER_URL}/hosting/discovery"
  if [ -n "${EDITOR_PUBLIC_URL:-}" ]; then
    log "public url: ${EDITOR_PUBLIC_URL}"
  fi
}

main "$@"
