# 타스크 52 단계별 완료 보고서: 서식 변경 (글꼴/크기/굵게/기울임)

## 1단계: 툴바 UI 구축 — 한컴 웹기안기 3행 구조 (완료)

### 구현 내용

한컴 웹기안기와 동일한 3행 구조로 전면 개편:

**1행: 메뉴바 `#menu-bar`**
- 파일, 편집, 보기, 입력, 서식, 쪽, 표 — 7개 메뉴 항목
- hover 시 하단 파란 밑줄 + 배경 하이라이트
- "파일" 클릭 → 파일 열기 다이얼로그 연결

**2행: 아이콘 툴바 `#icon-toolbar`**
- 6개 그룹 (세로 구분선으로 분리):
  - 오려두기, 복사하기, 붙이기, 모양복사
  - 조판부호, 문단부호, 격자보기
  - 글자모양, 문단모양
  - 표, 도형, 그림
  - 개체속성, 문자표, 하이퍼링크
  - 각주, 미주, 머리말, 꼬리말, 찾기
- 각 버튼: 아이콘 + 하단 텍스트 라벨, hover 시 배경 하이라이트
- 상태 표시줄 우측 정렬

**3행: 서식 도구 모음 `#style-bar`** — 한컴 웹기안기 style_bar 패턴:
- 스타일 드롭다운 (`대표`)
- 글꼴 드롭다운 (`함초롬바탕`, 110px)
- 크기 입력 + `pt` 단위 + ▲▼ 화살표
- 서식 버튼: **가**(굵게), *가*(기울임), <u>간</u>(밑줄), 가▾(취소선) — 한글 "가" 글자로 서식 표현
- 글자색: 간 + 색상 바 + ▾
- 형광펜 ✏
- 정렬 4개: CSS 줄 패턴 아이콘
- 줄 간격 ⇕▾
- 줌: 숫자 + % + ◀▶

### 빌드 결과
- Vite(tsc) 빌드: 성공 (HTML 7.78KB, CSS 5.22KB, JS 76.28KB)

---

## 2단계: Toolbar TypeScript 모듈 + EventBus 연동 — 완료

### 구현 내용

**`ui/toolbar.ts` 신규 파일**:
- `Toolbar` 클래스 — style-bar DOM 요소 바인딩 + EventBus 연동
- `setupFormatButtons()`: B/I/U/S mousedown → `eventBus.emit('format-toggle', prop)`
- `setupFontControls()`: 글꼴 change → `findOrCreateFontId` → `format-char`, 크기 Enter → `format-char`, 증감 → `format-char`
- `setupColorPicker()`: 버튼 클릭 → color picker 열기, input → `format-char`
- `setupAlignButtons()`: 정렬 버튼 → `eventBus.emit('format-para', {align})`
- `updateState(props)`: `cursor-format-changed` 수신 → B/I/U/S 활성 상태, 글꼴/크기/색상 반영
- `setEnabled(bool)`: 문서 로드 전 비활성화

**`main.ts` 수정**:
- `Toolbar` import + 초기화
- 메뉴바 "파일" 클릭 → 파일 열기 연결
- 초기 비활성화, loadFile 성공 시 활성화
- zoom-level 표시 형식 조정 (% 별도 span)

---

## 3단계: WasmBridge 래퍼 + ApplyCharFormatCommand — 완료

### 구현 내용

**`types.ts` 추가** — `CharProperties` 인터페이스:
- `fontFamily?`, `fontSize?` (HWPUNIT), `bold?`, `italic?`, `underline?`, `strikethrough?`, `textColor?`, `charShapeId?`, `fontId?`

**`wasm-bridge.ts` 추가** — 서식 API 래퍼 8개:
- `getCharPropertiesAt` / `getCellCharPropertiesAt`
- `applyCharFormat` / `applyCharFormatInCell`
- `findOrCreateFontId`
- `getParaPropertiesAt` / `applyParaFormat` / `applyParaFormatInCell`

**`command.ts` 추가** — `ApplyCharFormatCommand`:
- `execute()`: 선택 범위 내 각 문단별로 `applyCharFormat` 호출, 이전 charShapeId 보존
- `undo()`: 보존된 charShapeId로 복원
- `mergeWith`: 항상 null

---

## 4단계: InputHandler 연동 (단축키 + 서식 상태 조회) — 완료

### 구현 내용

**`input-handler.ts` 수정**:

단축키 (`handleCtrlKey`):
- `Ctrl+B`: `applyToggleFormat('bold')`
- `Ctrl+I`: `applyToggleFormat('italic')`
- `Ctrl+U`: `applyToggleFormat('underline')`

서식 적용:
- `applyCharFormat(props)`: 선택 범위 → `ApplyCharFormatCommand` → `executeCommand`
- `applyToggleFormat(prop)`: 커서 앞 글자 서식 조회 → 토글
- `applyParaFormat(props)`: 문단 정렬 (선택 범위 내 모든 문단)

서식 상태 조회:
- `getCharPropertiesAtCursor()`: offset-1 기준 (커서 앞 글자)
- `emitCursorFormatState()`: updateCaret, onClick, activateWithCaretPosition에서 호출

EventBus 수신:
- `format-toggle`, `format-char`, `format-para`

클릭 무시 범위 확장:
- `#menu-bar`, `#icon-toolbar`, `#style-bar`

---

## 5단계: 글꼴 목록 + 색상 피커 + 정렬 — 완료

### 구현 내용

**글꼴**: 7개 기본 글꼴 + `findOrCreateFontId` 연동
**크기**: pt 입력 + ▲▼ 증감 (±1pt), HWPUNIT 변환 (×200)
**색상**: color picker + `#color-bar` 동기화
**정렬**: `applyParaFormat` / `applyParaFormatInCell` WASM API 래퍼 + 4방향 버튼

---

## 6단계: 한컴 SVG 스프라이트 아이콘 적용 — 완료

### 구현 내용

**아이콘 리소스 적용**:
- webhwp `commonFrame/skins/images/icon_small_ko.svg` (470KB) → `rhwp-studio/public/images/` 복사
- 한컴 웹기안기 동일한 SVG 스프라이트 아이콘 사용

**스프라이트 시스템** (`style.css`):
- `.tb-sprite` 기본 클래스: 18x18px, `background-image: url(/images/icon_small_ko.svg)`
- 40px 그리드 기반 `background-position: calc(-40px * col) calc(-40px * row)` — 한컴 CSS와 동일 방식
- 20개 아이콘 클래스 매핑:
  - `icon-cut(2,1)`, `icon-copy(3,1)`, `icon-paste(4,1)`, `icon-format-copy(0,10)`
  - `icon-ctrl-mark(7,7)`, `icon-para-mark(8,7)`, `icon-grid(13,2)`
  - `icon-char-shape(12,8)`, `icon-para-shape(13,8)`
  - `icon-table(2,3)`, `icon-shape(0,3)`, `icon-image(1,3)`
  - `icon-obj-props(17,1)`, `icon-symbols(4,3)`, `icon-hyperlink(5,3)`
  - `icon-footnote(4,4)`, `icon-endnote(5,4)`, `icon-header(1,4)`, `icon-footer(2,4)`
  - `icon-find(15,1)`

**HTML 변경** (`index.html`):
- 2행 아이콘 툴바의 모든 유니코드 텍스트 아이콘 → `<span class="tb-sprite icon-xxx">` 교체

### 빌드 결과
- Vite(tsc) 빌드: 성공 (HTML 8.00KB, CSS 6.16KB, JS 76.28KB)

---

## 7단계: 웹폰트 로딩 + 폰트 치환 시스템 포팅 — 완료

### 구현 내용

**`core/font-loader.ts` (신규)** — web/editor.html 폰트 로딩 시스템 TypeScript 포팅:
- `FONT_LIST`: 66개 폰트 엔트리 (HY, 함초롬, 시스템, 영문, Pretendard 등)
- `REGISTERED_FONTS`: @font-face 등록 폰트 Set
- `loadWebFonts()`: CSS @font-face 규칙 동적 생성 + FontFace API 즉시 로드
- Canvas 2D 호환 보장 (Chrome은 FontFace API만으로 Canvas 폰트 인식 못할 수 있음)

**`core/font-substitution.ts` (신규)** — web/font_substitution.js TypeScript 포팅:
- `SUBST_TABLES`: webhwp g_SubstFonts 치환 테이블 (7개 언어별)
- `resolveFont(fontName, altType, langId)`: 3계층 폰트 해소 (등록 → 체인 추적 → fallback)
- `fontFamilyWithFallback(fontName)`: CSS font-family fallback 체인 생성
- Rust WASM 측에도 `resolve_font_substitution`이 구현되어 있어 이중 안전장치

**`main.ts` 수정**:
- `loadWebFonts()` 호출 추가 (WASM 초기화 전)
- 상태 표시: "웹폰트 로딩 중..." → "WASM 로딩 중..." → "HWP 파일을 선택해주세요."

**폰트 파일 연결**:
- `rhwp-studio/public/fonts` → `../../web/fonts` 심링크 (31MB, 31개 woff2)
- Vite 빌드 시 `dist/fonts/`로 자동 복사 확인

### 빌드 결과
- Vite(tsc) 빌드: 성공 (21 modules, HTML 8.00KB, CSS 6.16KB, JS 80.56KB)

---

## 수정 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `rhwp-studio/index.html` | 3행 구조 + 스프라이트 아이콘 적용 | +95줄 (전면 개편) |
| `rhwp-studio/src/style.css` | 전체 UI 스타일 + 스프라이트 시스템 | +250줄 (전면 개편) |
| `rhwp-studio/public/images/icon_small_ko.svg` | 한컴 SVG 스프라이트 (신규) | 470KB |
| `rhwp-studio/src/ui/toolbar.ts` | Toolbar 클래스 (신규) | +178줄 |
| `rhwp-studio/src/core/types.ts` | CharProperties 인터페이스 | +12줄 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 서식/문단 API 래퍼 8개 | +50줄 |
| `rhwp-studio/src/engine/command.ts` | ApplyCharFormatCommand | +75줄 |
| `rhwp-studio/src/engine/input-handler.ts` | Ctrl+B/I/U, 서식 적용, 서식 상태, 정렬 | +85줄 |
| `rhwp-studio/src/main.ts` | Toolbar 초기화 + 메뉴바 연결 + 웹폰트 로딩 | +12줄 |
| `rhwp-studio/src/core/font-loader.ts` | 웹폰트 로더 (신규) — 66개 폰트 | +100줄 |
| `rhwp-studio/src/core/font-substitution.ts` | 폰트 치환 (신규) — 7개 언어 | +200줄 |
| `rhwp-studio/public/fonts` | web/fonts 심링크 (31개 woff2, 31MB) | 심링크 |
