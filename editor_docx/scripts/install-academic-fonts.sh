#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "[fonts] Linux is required." >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "[fonts] Run this installer with sudo." >&2
  exit 1
fi

FONT_ROOT="/usr/local/share/fonts/tlooto-academic"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBSTITUTIONS_FILE="$SCRIPT_DIR/../assets/fonts/tlooto-academic-substitutions.conf"
WORK_DIR="$(mktemp -d /tmp/tlooto-academic-fonts.XXXXXX)"
MANIFEST_TMP="$FONT_ROOT/.INSTALL-MANIFEST.txt.$$"
trap 'rm -f "$MANIFEST_TMP"; rm -rf "$WORK_DIR"' EXIT

if [ "${ACCEPT_MICROSOFT_CORE_FONTS_EULA:-}" != "yes" ]; then
  echo "[fonts] Set ACCEPT_MICROSOFT_CORE_FONTS_EULA=yes after reviewing the Microsoft Core Fonts EULA." >&2
  exit 1
fi

for command in apt-get dpkg-deb find install ldd mv sha256sum sort xargs wget fc-cache fc-match; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "[fonts] missing required command: $command" >&2
    exit 1
  fi
done

OPEN_FONT_PACKAGES=(
  fonts-noto-cjk
  fonts-noto-cjk-extra
  fonts-nanum
  fonts-nanum-extra
  fonts-unfonts-core
  fonts-unfonts-extra
  fonts-baekmuk
  fonts-naver-d2coding
  fonts-liberation2
  fonts-crosextra-carlito
  fonts-crosextra-caladea
  fonts-texgyre
  fonts-lmodern
  fonts-cmu
  fonts-stix
  fonts-dejavu
  fonts-dejavu-extra
  fonts-freefont-ttf
  fonts-urw-base35
  fonts-ebgaramond
  fonts-linuxlibertine
  fonts-sil-charis
  fonts-sil-gentiumplus
  fonts-sil-andika
  fonts-symbola
  fonts-firacode
)

mkdir -p "$WORK_DIR/packages" "$WORK_DIR/extracted" "$WORK_DIR/corefonts" "$FONT_ROOT"
rm -f "$FONT_ROOT/INSTALL-MANIFEST.txt" "$MANIFEST_TMP"
: > "$WORK_DIR/package-versions.txt"
: > "$WORK_DIR/font-matches.txt"
cd "$WORK_DIR/packages"

echo "[fonts] downloading Ubuntu font packages..."
for package in "${OPEN_FONT_PACKAGES[@]}"; do
  apt-get download "$package" >/dev/null
done

echo "[fonts] extracting open academic and Korean fonts..."
for deb in ./*.deb; do
  package="$(dpkg-deb -f "$deb" Package)"
  version="$(dpkg-deb -f "$deb" Version)"
  package_root="$WORK_DIR/extracted/$package"
  install_root="$FONT_ROOT/$package"
  rm -rf "$install_root"
  mkdir -p "$package_root" "$install_root"
  printf '%s=%s\n' "$package" "$version" >> "$WORK_DIR/package-versions.txt"
  dpkg-deb -x "$deb" "$package_root"
  find "$package_root" -type f \
    \( -iname '*.ttf' -o -iname '*.otf' -o -iname '*.ttc' \) \
    -exec cp -f {} "$install_root/" \;
done

echo "[fonts] downloading the Microsoft Core Fonts installer tools..."
if command -v cabextract >/dev/null 2>&1; then
  CABEXTRACT="$(command -v cabextract)"
else
  apt-get download cabextract >/dev/null
  cab_deb="$(find . -maxdepth 1 -name 'cabextract_*.deb' -print -quit)"
  mkdir -p "$WORK_DIR/cabextract"
  dpkg-deb -x "$cab_deb" "$WORK_DIR/cabextract"
  CABEXTRACT="$WORK_DIR/cabextract/usr/bin/cabextract"
  if ldd "$CABEXTRACT" | grep -q 'not found'; then
    echo "[fonts] cabextract runtime dependencies are missing; install libmspack0 or libmspack0t64." >&2
    exit 1
  fi
fi

apt-get download ttf-mscorefonts-installer >/dev/null
mkdir -p "$WORK_DIR/mscorefonts-installer"
dpkg-deb -x ./ttf-mscorefonts-installer_*.deb "$WORK_DIR/mscorefonts-installer"

cat > "$WORK_DIR/corefonts.sha256" <<'EOF'
0524fe42951adc3a7eb870e32f0920313c71f170c859b5f770d82b4ee111e970  andale32.exe
85297a4d146e9c87ac6f74822734bdee5f4b2a722d7eaa584b7f2cbf76f478f6  arial32.exe
a425f0ffb6a1a5ede5b979ed6177f4f4f4fdef6ae7c302a7b7720ef332fec0a8  arialb32.exe
9c6df3feefde26d4e41d4a4fe5db2a89f9123a772594d7f59afd062625cd204e  comic32.exe
bb511d861655dde879ae552eb86b134d6fae67cb58502e6ff73ec5d9151f3384  courie32.exe
2c2c7dcda6606ea5cf08918fb7cd3f3359e9e84338dc690013f20cd42e930301  georgi32.exe
6061ef3b7401d9642f5dfdb5f2b376aa14663f6275e60a51207ad4facf2fccfb  impact32.exe
db56595ec6ef5d3de5c24994f001f03b2a13e37cee27bc25c58f6f43e8f807ab  times32.exe
5a690d9bb8510be1b8b4fe49f1f2319651fe51bbe54775ddddd8ef0bd07fdac9  trebuc32.exe
c1cb61255e363166794e47664e2f21af8e3a26cb6346eb8d2ae2fa85dd5aad96  verdan32.exe
64595b5abc1080fba8610c5c34fab5863408e806aafe84653ca8575bed17d75a  webdin32.exe
EOF

echo "[fonts] downloading and verifying Microsoft Core Fonts..."
cd "$WORK_DIR/corefonts"
while read -r checksum archive; do
  wget -q --show-progress -O "$archive" "https://downloads.sourceforge.net/corefonts/$archive"
done < "$WORK_DIR/corefonts.sha256"
sha256sum --check "$WORK_DIR/corefonts.sha256"

rm -rf "$FONT_ROOT/microsoft-core-fonts"
mkdir -p "$WORK_DIR/corefonts/extracted" "$FONT_ROOT/microsoft-core-fonts"
for archive in ./*.exe; do
  "$CABEXTRACT" -q -d "$WORK_DIR/corefonts/extracted" "$archive"
done
find "$WORK_DIR/corefonts/extracted" -type f -iname '*.ttf' \
  -exec cp -f {} "$FONT_ROOT/microsoft-core-fonts/" \;
install -m 0644 "$WORK_DIR/mscorefonts-installer/usr/share/doc/ttf-mscorefonts-installer/copyright" \
  "$FONT_ROOT/microsoft-core-fonts/UBUNTU-PACKAGE-COPYRIGHT"

find "$FONT_ROOT" -type f \( -iname '*.ttf' -o -iname '*.otf' -o -iname '*.ttc' \) \
  -exec chmod 0644 {} \;

if [ ! -f "$SUBSTITUTIONS_FILE" ]; then
  echo "[fonts] missing substitution config: $SUBSTITUTIONS_FILE" >&2
  exit 1
fi
install -m 0644 "$SUBSTITUTIONS_FILE" /etc/fonts/conf.avail/65-tlooto-academic-substitutions.conf
ln -sfn ../conf.avail/65-tlooto-academic-substitutions.conf \
  /etc/fonts/conf.d/65-tlooto-academic-substitutions.conf

find "$FONT_ROOT" -type f \( -iname '*.ttf' -o -iname '*.otf' -o -iname '*.ttc' \) \
  -print0 | sort -z | xargs -0 sha256sum > "$FONT_ROOT/FONT-SHA256SUMS"

fc-cache -f

assert_font() {
  local requested="$1"
  shift
  local actual
  local expected
  local accepted=""
  local matched="no"
  actual="$(fc-match -f '%{family[0]}' "$requested")"
  for expected in "$@"; do
    accepted="${accepted}${accepted:+ | }${expected}"
    if [ "$actual" = "$expected" ]; then
      matched="yes"
    fi
  done
  if [ "$matched" != "yes" ]; then
    echo "[fonts] expected '$requested' to resolve to one of [$accepted], got '$actual'" >&2
    exit 1
  fi
  local key="${requested// /_}"
  key="${key//[^A-Za-z0-9_]/_}"
  printf 'font_match.%s=%s\n' "$key" "$actual" >> "$WORK_DIR/font-matches.txt"
}

assert_font "Times New Roman" "Times New Roman"
assert_font "Arial" "Arial"
assert_font "Palatino Linotype" "Palatino Linotype" "TeX Gyre Pagella"
assert_font "Cambria Math" "Cambria Math" "STIX Math" "STIXMath" "STIX Two Math"
assert_font "Noto Sans CJK KR" "Noto Sans CJK KR"
assert_font "Noto Serif CJK KR" "Noto Serif CJK KR"
assert_font "NanumGothic" "NanumGothic"
assert_font "NanumMyeongjo" "NanumMyeongjo"
assert_font "Calibri" "Carlito"
assert_font "Cambria" "Caladea"
assert_font "Malgun Gothic" "Malgun Gothic" "Noto Sans CJK KR"
assert_font "맑은 고딕" "맑은 고딕" "Noto Sans CJK KR"
assert_font "나눔명조" "나눔명조" "NanumMyeongjo"
assert_font "KoPub바탕체 Medium" "KoPub바탕체 Medium" "Noto Serif CJK KR"
assert_font "Wingdings" "Wingdings" "Webdings"
assert_font "Batang" "NanumMyeongjo"

FONT_FILE_COUNT="$(find "$FONT_ROOT" -type f \( -iname '*.ttf' -o -iname '*.otf' -o -iname '*.ttc' \) | wc -l | tr -d '[:space:]')"
{
  printf 'installed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'install_complete=yes\n'
  printf 'microsoft_core_fonts_eula_accepted=yes\n'
  printf 'font_files=%s\n' "$FONT_FILE_COUNT"
  cat "$WORK_DIR/package-versions.txt"
  cat "$WORK_DIR/font-matches.txt"
} > "$MANIFEST_TMP"
chmod 0644 "$MANIFEST_TMP"
mv -f "$MANIFEST_TMP" "$FONT_ROOT/INSTALL-MANIFEST.txt"

echo "[fonts] installed $FONT_FILE_COUNT font files in $FONT_ROOT"
