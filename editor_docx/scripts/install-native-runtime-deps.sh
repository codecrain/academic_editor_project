#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "[editor] native runtime dependencies can only be installed on Linux." >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "[editor] sudo is required to install native runtime dependencies." >&2
  exit 1
fi

# A production deploy consumes a prebuilt native runtime. Do not install the
# source-build toolchain here: its development packages can conflict with a
# server that has mixed Ubuntu package versions.
sudo apt-get update
DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC sudo apt-get -y install \
  ca-certificates curl poppler-utils

if [ "${EDITOR_NATIVE_SKIP_PM2:-false}" != "true" ] && ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

echo "[editor] native runtime dependencies are installed."