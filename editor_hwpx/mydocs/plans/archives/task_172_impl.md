# 타스크 172: 문단번호/글머리표 — 구현계획서

## 구현 단계 (4단계)

### 1단계: WASM API + JSON 파이프라인

**`src/document_core/commands/formatting.rs`** — build_para_properties_json:
- `numbering_id` 출력 추가: `"numberingId":{}`

**`src/document_core/helpers.rs`** — parse_para_shape_mods:
- `"numberingId"` 파싱 추가

**`src/wasm_api.rs`** — 새 WASM API:
- `getNumberingList()` → JSON 배열
- `getBulletList()` → JSON 배열
- `ensureDefaultNumbering()` → 기본 7수준 번호 생성, ID 반환
- `ensureDefaultBullet(char)` → 해당 문자 Bullet 생성, ID 반환

**`rhwp-studio/src/core/wasm-bridge.ts`** — 래퍼 4개
**`rhwp-studio/src/core/types.ts`** — ParaProperties에 numberingId 추가

### 2단계: 도구상자 버튼 + 토글 로직

**`rhwp-studio/index.html`** — #icon-toolbar에 번호/글머리표/수준 버튼
**`rhwp-studio/src/styles/icon-toolbar.css`** — 아이콘 CSS
**`rhwp-studio/src/engine/input-handler.ts`** — toggleNumbering(), toggleBullet()
**`rhwp-studio/src/command/commands/format.ts`** — 커맨드 등록
**`rhwp-studio/src/ui/toolbar.ts`** — 이벤트 바인딩

### 3단계: 글머리표 선택 팝업

**`rhwp-studio/src/ui/bullet-popup.ts`** (신규):
- 18종 글머리표 문자 그리드 팝업
- ●, ■, ◆, ▶, ○, □, ◇, ▷, ★, ☆, ♠, ♣, ♥, ♦, ✓, →, -, ·

### 4단계: 문단번호 모양 대화상자

**`rhwp-studio/src/ui/numbering-dialog.ts`** (신규):
- 한컴 호환 번호 형식 프리셋 (6~8종)
- 시작 번호 입력 + 미리보기 패널

## 검증

| 시나리오 | 기대 결과 |
|---------|----------|
| 도구상자 "번호" 버튼 클릭 | 현재 문단에 기본 번호 적용 |
| 번호 문단에서 다시 "번호" 클릭 | 번호 해제 |
| 도구상자 "글머리표" 버튼 클릭 | 기본 글머리표 ● 적용 |
| 글머리표 드롭다운에서 ■ 선택 | 해당 문자로 변경 |
| "수준▲/▼" 클릭 | 수준 변경 |
| 번호 모양 대화상자에서 프리셋 선택 | 해당 패턴 적용 |
