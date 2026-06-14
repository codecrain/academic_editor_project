# 타스크 73: 문단 부호 표시 기능 구현 — 구현 계획서

## 구현 단계 (3단계)

### 1단계: 렌더러 기호 수정 + 강제 줄 바꿈 지원 (백엔드)

**수정 파일**: `composer.rs`, `render_tree.rs`, `layout.rs`, `svg.rs`, `web_canvas.rs`, `html.rs`

| 작업 | 설명 |
|------|------|
| ComposedLine.has_line_break | 줄 텍스트가 `\n`으로 끝나는지 검사, `\n` 제거 |
| TextRunNode.is_line_break_end | 강제 줄 바꿈 줄의 마지막 TextRun 표시용 |
| layout.rs 플래그 전달 | `comp_line.has_line_break && last_run` → `is_line_break_end` |
| 렌더러 기호 변경 | ¶(U+00B6) → ↵(U+21B5), 강제 줄 바꿈도 ↵ 사용 |

**검증**: `docker compose --env-file /dev/null run --rm test`

---

### 2단계: 프론트엔드 토글 기능 구현

**수정 파일**: `wasm-bridge.ts`, `view.ts`, `index.html`

| 작업 | 설명 |
|------|------|
| WasmBridge.setShowParagraphMarks() | WASM API 호출 래퍼 |
| view:para-mark 커맨드 | 토글 상태 관리 + `document-changed` 이벤트 |
| index.html 버튼 연결 | 툴바 `data-cmd`, 메뉴 `disabled` 제거 |
| active 클래스 토글 | 시각적 토글 상태 표시 |

**검증**: 브라우저에서 문서 로드 → 메뉴/툴바 클릭 → 문단 부호 토글 확인

---

### 3단계: 빌드 검증 + SVG 내보내기 확인

1. `docker compose --env-file /dev/null run --rm test` — 전체 테스트 통과
2. `docker compose --env-file /dev/null run --rm wasm` — WASM 빌드
3. `cd rhwp-studio && npx vite build` — Vite 빌드
4. SVG 내보내기: ↵ 기호 렌더링 확인

---

## 수정 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `src/renderer/composer.rs` | ComposedLine에 `has_line_break` 추가, `\n` 제거 | ~10줄 |
| `src/renderer/render_tree.rs` | TextRunNode에 `is_line_break_end` 추가 | ~3줄 |
| `src/renderer/layout.rs` | `is_line_break_end` 플래그 전달 | ~10줄 |
| `src/renderer/svg.rs` | ¶→↵ 변경, 줄 바꿈 ↵ 추가 | ~10줄 |
| `src/renderer/web_canvas.rs` | ¶→↵ 변경, 줄 바꿈 ↵ 추가 | ~10줄 |
| `src/renderer/html.rs` | ¶→↵ 변경, 줄 바꿈 ↵ 추가 | ~10줄 |
| `rhwp-studio/src/core/wasm-bridge.ts` | `setShowParagraphMarks()` 추가 | ~4줄 |
| `rhwp-studio/src/command/commands/view.ts` | `view:para-mark` 커맨드 구현 | ~15줄 |
| `rhwp-studio/index.html` | 버튼 `data-cmd` + 메뉴 disabled 제거 | ~2줄 |
