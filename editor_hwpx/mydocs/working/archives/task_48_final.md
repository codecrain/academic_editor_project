# 타스크 48 최종 결과보고서

## 타스크: rhwp-studio 기본 커서 + 텍스트 입력

## 개요

rhwp-studio에 기본 커서 배치(클릭), 텍스트 입력, Backspace/Delete 삭제, Enter 문단 분할, 좌/우 화살표 이동 기능을 구현하였다. 설계서 §6(커서 모델), §7(입력 시스템)의 기본 구조를 따르며, WASM 코어에 3개 API를 추가하고 TypeScript 편집 엔진 3개 모듈을 신규 구축하였다. 런타임 테스트에서 발견된 8건의 버그를 모두 수정하여, 본문 및 테이블 셀 편집과 한글 IME 실시간 조합 렌더링까지 완성하였다.

## 구현 결과

### Rust WASM API (Phase 2: 커서/히트 테스트 + 셀 편집)

| API | 시그니처 | 용도 |
|-----|---------|------|
| `getCursorRect` | `(sec, para, charOffset) → {pageIndex, x, y, height}` | 본문 캐럿 픽셀 좌표 계산 |
| `hitTest` | `(page, x, y) → {sectionIndex, paragraphIndex, charOffset, [셀컨텍스트]}` | 클릭 좌표 → 문서 위치 변환 (본문+셀) |
| `getCursorRectInCell` | `(sec, parentPara, ctrlIdx, cellIdx, cellPara, charOffset) → {pageIndex, x, y, height}` | 셀 내 캐럿 픽셀 좌표 계산 |

**구현 알고리즘:**
- `getCursorRect`: `find_pages_for_paragraph()` → `build_page_tree()` → TextRunNode 순회 → `compute_char_positions()` 보간
- `hitTest`: `build_page_tree()` → TextRun 수집 (본문+셀) → `format_hit()` → 3단계 히트 검사 (bbox 정확 매칭 → 같은 줄 스냅 → 최근접 줄)
- `getCursorRectInCell`: `find_pages_for_paragraph(sec, parentPara)` → `build_page_tree()` → 셀 TextRun 4필드 매칭 → 좌표 계산

### TypeScript 편집 엔진 (`engine/`)

| 모듈 | 역할 |
|------|------|
| `cursor.ts` | CursorState — 문서 위치 관리, 본문/셀 좌우 이동, 문단/셀문단 경계 넘기 |
| `caret-renderer.ts` | CaretRenderer — DOM 캐럿 (500ms 깜박임, 줌 대응, CSS 중앙정렬 보정) |
| `input-handler.ts` | InputHandler — 클릭 커서 배치, 키보드 입력, 셀 편집 라우팅, 한글 IME 조합 렌더링 |

### 지원 기능

| 기능 | 구현 | 사용 WASM API |
|------|------|-------------|
| 본문 클릭 커서 배치 | hitTest → CursorState.moveTo | `hitTest` + `getCursorRect` |
| 테이블 셀 클릭 커서 배치 | hitTest (셀 컨텍스트) → CursorState.moveTo | `hitTest` + `getCursorRectInCell` |
| 텍스트 입력 (영문) | Hidden textarea → insertText/insertTextInCell | `insertText` / `insertTextInCell` |
| 한글 IME 실시간 조합 | compositionAnchor 패턴 — 매 input마다 이전 조합 삭제 → 현재 조합 삽입 → 재렌더링 | `insertText` + `deleteText` |
| Backspace 삭제 | charOffset > 0: deleteText, = 0: mergeParagraph (셀: deleteTextInCell) | `deleteText` / `mergeParagraph` / `deleteTextInCell` |
| Delete 삭제 | charOffset < len: deleteText, = len: mergeParagraph(next) (셀: deleteTextInCell) | `deleteText` / `mergeParagraph` / `deleteTextInCell` |
| Enter 문단 분할 | splitParagraph → 다음 문단 시작으로 이동 (셀 내 미지원) | `splitParagraph` |
| 좌/우 화살표 | CursorState.moveHorizontal (본문/셀 분기, 문단 경계 넘기) | `getParagraphLength` / `getCellParagraphLength` 등 |
| 캐럿 깜박임 | 500ms 토글, 입력 시 리셋 | — |
| 줌 대응 | 캐럿 좌표 × zoom, 클릭 좌표 ÷ zoom, CSS 중앙정렬 보정 | — |
| 편집 후 재렌더링 | document-changed 이벤트 → refreshPages() | `renderPageToCanvas` |

### WasmBridge 래퍼 추가 (13개)

**본문 API (8개):** `getCursorRect`, `hitTest`, `insertText`, `deleteText`, `splitParagraph`, `mergeParagraph`, `getParagraphLength`, `getParagraphCount`

**셀 API (5개):** `getCursorRectInCell`, `insertTextInCell`, `deleteTextInCell`, `getCellParagraphLength`, `getCellParagraphCount`

## 런타임 버그 수정 (8건)

| # | 증상 | 원인 | 수정 |
|---|------|------|------|
| 1 | TextStyle private 접근 에러 | `TextStyle` 필드 비공개 | `compute_char_positions()` 필드 접근 수정 |
| 2 | 캐럿 재렌더링 시 사라짐 | `innerHTML = ''`로 캐럿 DOM 제거 | `ensureAttached()` 추가 |
| 3 | 클릭 좌표 이중 계산 | `getBoundingClientRect` 스크롤 반영인데 수동 보정 추가 | 수동 보정 제거 |
| 4 | CSS 중앙정렬 보정 누락 | `left:50%; translateX(-50%)` 미반영 | `pageLeft` 계산 추가 |
| 5 | 클릭 시 포커스 이탈 | 컨테이너 클릭 → textarea 포커스 소실 | `e.preventDefault()` |
| 6 | 테이블 셀 캐럿 미표시 | `collect_runs()` 셀 TextRun 필터 | 필터 제거, 셀 컨텍스트 전파, `format_hit()` |
| 7 | 한글 IME 비정상 | composition 이벤트 미처리 | IME 조합 핸들러 + 실시간 렌더링 구현 |
| 8 | 테이블 영역 콘솔 오류 | `PartialTable`/`Shape` 미처리 | 모든 PageItem 변형 명시적 매칭 |

## 검증 결과

### 빌드 검증

| 항목 | 결과 |
|------|------|
| `cargo test` (Docker) | **474 tests 통과** (0 failed) |
| `wasm-pack build` (Docker) | **성공** (release, 899KB WASM) |
| `tsc --noEmit` | **통과** (0 errors) |
| `vite build` | **성공** (42.35KB JS) |

### 브라우저 런타임 테스트

| # | 테스트 항목 | 결과 |
|---|-----------|------|
| 1 | 본문 텍스트 클릭 시 캐럿 표시 | **통과** |
| 2 | 테이블 셀 클릭 시 캐럿 표시 | **통과** |
| 3 | 본문 텍스트 입력 (영문) | **통과** |
| 4 | 본문 텍스트 입력 (한글 IME 실시간 조합) | **통과** |
| 5 | 테이블 셀 텍스트 입력 | **통과** |
| 6 | Backspace 삭제 (본문/셀) | **통과** |
| 7 | Delete 삭제 (본문/셀) | **통과** |
| 8 | Enter 문단 분할 | **통과** |
| 9 | 좌/우 화살표 이동 | **통과** |
| 10 | 줌 변경 시 캐럿 위치 유지 | **통과** |

## 미구현 항목 (향후 백로그)

| 항목 | 백로그 |
|------|--------|
| ArrowUp/ArrowDown 상하 이동 | B-309 (MovePos 28+ 이동 타입) |
| Home/End 줄 시작/끝 이동 | B-309 |
| 셀 내 Enter (splitParagraphInCell) | 셀 API 확장 필요 |
| Tab/Shift+Tab 셀 탐색 | B-903 |
| 문서 로딩 시 캐럿 자동 배치 | B-308 |

## 변경 파일 총괄

| 파일 | 유형 | 내용 |
|------|------|------|
| `src/wasm_api.rs` | 수정 | Phase 2 WASM API (getCursorRect, hitTest, getCursorRectInCell) + 셀 hitTest + format_hit + PartialTable/Shape 처리 |
| `rhwp-studio/src/core/types.ts` | 수정 | CursorRect, HitTestResult, DocumentPosition 타입 (셀 컨텍스트 포함) |
| `rhwp-studio/src/core/wasm-bridge.ts` | 수정 | WASM API 래퍼 13개 (본문 8 + 셀 5) |
| `rhwp-studio/src/engine/cursor.ts` | 신규 | CursorState 커서 모델 (본문/셀 분기) |
| `rhwp-studio/src/engine/caret-renderer.ts` | 신규 | CaretRenderer 캐럿 렌더러 (중앙정렬 보정, ensureAttached) |
| `rhwp-studio/src/engine/input-handler.ts` | 신규 | InputHandler 입력 처리기 (셀 라우팅, IME 조합 렌더링) |
| `rhwp-studio/src/view/canvas-view.ts` | 수정 | refreshPages() + document-changed 이벤트 |
| `rhwp-studio/src/main.ts` | 수정 | InputHandler 초기화 |

## 산출물

| 문서 | 경로 |
|------|------|
| 수행계획서 | `mydocs/plans/task_48.md` |
| 단계 1 완료보고서 | `mydocs/working/task_48_step1.md` |
| 단계 2 완료보고서 | `mydocs/working/task_48_step2.md` |
| 단계 3 완료보고서 | `mydocs/working/task_48_step3.md` |
| 단계 4 완료보고서 | `mydocs/working/task_48_step4.md` |
| 최종 결과보고서 | `mydocs/working/task_48_final.md` |
