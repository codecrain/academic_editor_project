#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-}"
if [ -z "${ROOT_DIR}" ] || [ ! -d "${ROOT_DIR}" ]; then
  echo "[debrand] usage: debrand-online.sh /path/to/online/source" >&2
  exit 2
fi

# This patch is intentionally narrow. It changes user-facing browser/server
# product strings before compilation, while leaving licensing and copyright
# notices intact. Legal notices must stay available through the OSS notice page.
TARGET_DIRS=(
  "browser"
  "wsd"
)

TARGET_EXTENSIONS=(
  "*.css"
  "*.html"
  "*.js"
  "*.json"
  "*.po"
  "*.pot"
  "*.ts"
  "*.tsx"
  "*.ui"
  "*.xml"
)

replace_in_file() {
  local file="$1"
  python3 - "$file" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8", errors="ignore")
original = text

replacements = {
    "Collabora Online Development Edition": "Document Editor",
    "Collabora Online": "Document Editor",
    "Collabora Office": "Document Engine",
    "Collabora": "Document Engine",
}

for old, new in replacements.items():
    text = text.replace(old, new)

if text != original:
    path.write_text(text, encoding="utf-8")
PY
}

for dir in "${TARGET_DIRS[@]}"; do
  full_dir="${ROOT_DIR}/${dir}"
  [ -d "${full_dir}" ] || continue
  for ext in "${TARGET_EXTENSIONS[@]}"; do
    while IFS= read -r -d '' file; do
      replace_in_file "${file}"
    done < <(find "${full_dir}" -type f -name "${ext}" -print0)
  done
done

if grep -RIn --exclude-dir=.git --exclude='*.md' --exclude='COPYING*' --exclude='LICENSE*' \
  -E 'Collabora Online|Collabora Office|Collabora Online Development Edition' \
  "${ROOT_DIR}/browser" "${ROOT_DIR}/wsd" >/tmp/academic-editor-branding-scan.txt 2>/dev/null; then
  echo "[debrand] user-facing trademark strings remain in browser/wsd sources:" >&2
  cat /tmp/academic-editor-branding-scan.txt >&2
  exit 1
fi

echo "[debrand] user-facing editor branding patch applied."
