#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-}"
if [ -z "${ROOT_DIR}" ] || [ ! -d "${ROOT_DIR}" ]; then
  echo "[debrand] usage: debrand-online.sh /path/to/online/source" >&2
  exit 2
fi

PYTHON_BIN="${PYTHON_BIN:-}"
if [ -z "${PYTHON_BIN}" ]; then
  PYTHON_BIN="$(command -v python3 || command -v python || true)"
fi
if [ -z "${PYTHON_BIN}" ]; then
  echo "[debrand] python3 or python is required" >&2
  exit 2
fi

# This patch is intentionally narrow. It changes user-facing browser/server
# product strings and visible logo references before compilation, while leaving
# licensing and copyright notices intact. Legal notices must stay available
# through the OSS notice page.
"${PYTHON_BIN}" - "${ROOT_DIR}" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
target_dirs = [root / "browser", root / "wsd"]
target_suffixes = {
    ".css",
    ".cxx",
    ".cc",
    ".cpp",
    ".h",
    ".html",
    ".hpp",
    ".js",
    ".json",
    ".m4",
    ".po",
    ".pot",
    ".ts",
    ".tsx",
    ".txt",
    ".ui",
    ".xml",
}

replacements = {
    "Collabora Online Development Edition (unbranded)": "Document Editor",
    "Collabora Online Development Edition": "Document Editor",
    "Collabora Online Welcome": "Document Editor Welcome",
    "Collabora Online": "Document Editor",
    "Collabora Office": "Document Engine",
    "https://collaboraonline.github.io/": "https://tlooto.com/",
    "https://collaboraonline.github.io": "https://tlooto.com",
    "https://www.collaboraonline.com/": "https://tlooto.com/",
    "https://www.collaboraonline.com": "https://tlooto.com",
    "https://sdk.collaboraonline.com/": "https://tlooto.com/",
    "https://sdk.collaboraonline.com": "https://tlooto.com",
    "https://github.com/CollaboraOnline/online/commits/": "https://tlooto.com/",
    "https://github.com/CollaboraOnline/online/issues": "https://tlooto.com/",
    "https://github.com/CollaboraOnline/online.git": "https://tlooto.com/",
    "https://github.com/CollaboraOnline/online": "https://tlooto.com/",
    "https://gerrit.collaboraoffice.com/plugins/gitiles/core/+log/": "https://tlooto.com/",
    "github.com/CollaboraOnline/online": "tlooto.com",
    "CollaboraOnline": "DocumentEditor",
    "collaboraonline.github.io": "tlooto.com",
    "collaboraonline.com": "tlooto.com",
    "collaboraoffice.com": "tlooto.com",
    "collaboraonline": "document-editor",
    "collaboraoffice": "document-engine",
    "images/collabora-office-white.svg": "images/document-editor-white.svg",
    "collabora-office-white.svg": "document-editor-white.svg",
}

def patch_text(text: str) -> str:
    patched_lines = []
    for line in text.splitlines(keepends=True):
        if "Copyright the Collabora Online contributors" in line:
            patched_lines.append(line)
            continue
        for old, new in replacements.items():
            line = line.replace(old, new)
        patched_lines.append(line)
    return "".join(patched_lines)

changed = 0
for target_dir in target_dirs:
    if not target_dir.exists():
        continue
    for path in target_dir.rglob("*"):
        if not path.is_file() or path.suffix not in target_suffixes:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        patched = patch_text(text)
        if patched != text:
            path.write_text(patched, encoding="utf-8", newline="\n")
            changed += 1

images_dir = root / "browser" / "images"
if images_dir.exists():
    (images_dir / "document-editor-white.svg").write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="Document Editor">
  <path fill="#fff" d="M6 2h8l5 5v15H6z" opacity=".95"/>
  <path fill="#1f2937" d="M13 3.5V8h4.5z"/>
  <path fill="#1f2937" d="M8 12h8v1.4H8zm0 3h8v1.4H8zm0 3h5v1.4H8z"/>
</svg>
""",
        encoding="utf-8",
        newline="\n",
    )

print(f"[debrand] patched {changed} source files")
PY

# Build compatibility patch for upstream main as checked on 2026-06-03:
# some compilers treat streaming std::chrono::hours as ambiguous because the
# source has overloads for minutes/seconds/milliseconds/microseconds but not
# hours. Keep this source patch public with the debranding history so the native
# runtime remains reproducible and MPL source obligations are traceable.
"${PYTHON_BIN}" - "${ROOT_DIR}" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
util = root / "common" / "Util.hpp"
if util.exists():
    text = util.read_text(encoding="utf-8", errors="ignore")
    if "const std::chrono::hours&" not in text:
        marker = "inline std::ostream& operator<<(std::ostream& os, const std::chrono::minutes& s)"
        patch = """inline std::ostream& operator<<(std::ostream& os, const std::chrono::hours& h)
{
    os << h.count() << \"h\";
    return os;
}

"""
        if marker not in text:
            raise SystemExit("[debrand] cannot find chrono stream overload insertion point")
        util.write_text(text.replace(marker, patch + marker), encoding="utf-8", newline="\n")
        print("[debrand] patched chrono hours stream overload")
PY

if grep -RIn --exclude-dir=.git --exclude='*.md' --exclude='COPYING*' --exclude='LICENSE*' \
  -E 'Collabora Online Development Edition|Collabora Online Welcome|Collabora Office|Oops, there is a problem connecting to Collabora Online|Your Collabora Online server needs updating|collabora-office-white\.svg|CollaboraOnline|collaboraonline|collaboraoffice' \
  "${ROOT_DIR}/browser" "${ROOT_DIR}/wsd" >/tmp/academic-editor-branding-scan.txt 2>/dev/null; then
  echo "[debrand] user-facing trademark strings remain in browser/wsd sources:" >&2
  cat /tmp/academic-editor-branding-scan.txt >&2
  exit 1
fi

echo "[debrand] user-facing editor branding patch applied."
