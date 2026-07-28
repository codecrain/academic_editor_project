#!/usr/bin/env bash
set -euo pipefail

ENGINE_ROOT="${1:?pass the extracted engine root}"
POCO_VERSION="${EDITOR_POCO_VERSION:-1.14.2}"
POCO_ARCHIVE_URL="${EDITOR_POCO_ARCHIVE_URL:-https://github.com/pocoproject/poco/archive/refs/tags/poco-${POCO_VERSION}-release.tar.gz}"
POCO_ARCHIVE_SHA256="${EDITOR_POCO_ARCHIVE_SHA256:-47394ea7ddb7b0a40e1a5be896f8f5dc77cfdc4f561d2e7131ecf582df5a0c3a}"
POCO_SOURCE_DIR="$ENGINE_ROOT/workdir/UnpackedTarball/poco"
POCO_LIBRARY_DIR="$ENGINE_ROOT/workdir/LinkTarget/StaticLibrary"
POCO_BUILD_DIR="$ENGINE_ROOT/workdir/AcademicEditorPocoBuild"
POCO_ARCHIVE="$ENGINE_ROOT/workdir/poco-${POCO_VERSION}.tar.gz"
REQUIRED_LIBRARIES=(Foundation XML JSON Util Net Crypto NetSSL)

poco_is_ready() {
  [ -f "$POCO_SOURCE_DIR/include/Poco/Net/WebSocket.h" ] || return 1
  local library
  for library in "${REQUIRED_LIBRARIES[@]}"; do
    [ -f "$POCO_LIBRARY_DIR/libPoco${library}.a" ] || return 1
  done
}

if poco_is_ready; then
  echo "[editor] engine POCO workdir is ready"
  exit 0
fi

command -v cmake >/dev/null 2>&1 || {
  echo "[editor] cmake is required to prepare the pinned POCO workdir" >&2
  exit 1
}

echo "[editor] preparing pinned POCO ${POCO_VERSION} for the engine workdir"
rm -rf "$POCO_SOURCE_DIR" "$POCO_BUILD_DIR"
mkdir -p "$POCO_SOURCE_DIR" "$POCO_LIBRARY_DIR"
trap 'rm -f "$POCO_ARCHIVE"' EXIT

curl -fL --retry 3 --retry-delay 2 -o "$POCO_ARCHIVE" "$POCO_ARCHIVE_URL"
printf '%s  %s\n' "$POCO_ARCHIVE_SHA256" "$POCO_ARCHIVE" | sha256sum -c -
tar -xzf "$POCO_ARCHIVE" --strip-components=1 -C "$POCO_SOURCE_DIR"

cmake -S "$POCO_SOURCE_DIR" -B "$POCO_BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
  -DBUILD_SHARED_LIBS=OFF \
  -DPOCO_UNBUNDLED=OFF \
  -DENABLE_TESTS=OFF \
  -DENABLE_SAMPLES=OFF \
  -DENABLE_ENCODINGS=OFF \
  -DENABLE_MONGODB=OFF \
  -DENABLE_DATA=OFF \
  -DENABLE_DATA_SQLITE=OFF \
  -DENABLE_REDIS=OFF \
  -DENABLE_PROMETHEUS=OFF \
  -DENABLE_ZIP=OFF \
  -DENABLE_PAGECOMPILER=OFF \
  -DENABLE_PAGECOMPILER_FILE2PAGE=OFF \
  -DENABLE_ACTIVERECORD=OFF \
  -DENABLE_ACTIVERECORD_COMPILER=OFF \
  -DENABLE_JWT=OFF
cmake --build "$POCO_BUILD_DIR" --parallel "$(nproc)"

for library in "${REQUIRED_LIBRARIES[@]}"; do
  built_library="$POCO_BUILD_DIR/lib/libPoco${library}.a"
  [ -f "$built_library" ] || {
    echo "[editor] pinned POCO build is missing $built_library" >&2
    exit 1
  }
  cp "$built_library" "$POCO_LIBRARY_DIR/"
done

poco_is_ready || {
  echo "[editor] pinned POCO workdir verification failed" >&2
  exit 1
}
echo "[editor] pinned POCO ${POCO_VERSION} workdir is ready"
