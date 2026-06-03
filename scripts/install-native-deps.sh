#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "[editor] native dependencies can only be installed on Linux." >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "[editor] sudo is required to install native build dependencies." >&2
  exit 1
fi

sudo apt-get update

CHROMIUM_PACKAGE="chromium-browser"
if [ -r /etc/os-release ]; then
  . /etc/os-release
  case "${ID:-}" in
    debian)
      CHROMIUM_PACKAGE="chromium"
      ;;
  esac
fi

DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC sudo apt-get -y install \
  libpng16-16 fontconfig adduser cpio tzdata \
  findutils nano libcap2-bin openssl openssh-client \
  libxcb-shm0 libxcb-render0 libxrender1 libxext6 \
  fonts-wqy-zenhei fonts-wqy-microhei fonts-droid-fallback fonts-noto-cjk \
  ca-certificates libnss-wrapper \
  libpoco-dev python3-polib libcap-dev npm \
  libpam-dev libzstd-dev wget git build-essential libtool \
  python3-lxml libpng-dev libcppunit-dev pkg-config snapd "${CHROMIUM_PACKAGE}" \
  rsync curl zip ccache autoconf gperf nasm xsltproc flex bison uuid-dev meson ninja-build \
  libpixman-1-dev

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -Eq '^v20\.'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/academic-editor-nodesource-setup.sh
  sudo bash /tmp/academic-editor-nodesource-setup.sh
  sudo apt-get -y install nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

echo "[editor] native build/runtime dependencies are installed."
