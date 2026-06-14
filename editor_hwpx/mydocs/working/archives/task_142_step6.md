# 타스크 142 — 6단계 완료 보고서

## 개요

TypeScript/CSS 파일 분할로 1,200줄 이하 달성. 3개 대상 파일 모두 분할 완료.

## 변경 내역

### A. input-handler.ts (3,106줄 → 1,148줄)

42개 메서드를 5개 모듈로 추출. 클래스 메서드는 1줄 delegation 래퍼로 대체.

| 추출 파일 | 줄 수 | 포함 메서드 |
|-----------|-------|------------|
| input-handler-mouse.ts | 721 | onClick, onContextMenu, onMouseMove, handleResizeHover, onMouseUp |
| input-handler-table.ts | 495 | startResizeDrag, updateResizeDrag, finishResizeDrag 외 10개 |
| input-handler-keyboard.ts | 565 | onKeyDown, handleCtrlKey, handleSelectAll, onCopy, onCut, onPaste |
| input-handler-text.ts | 176 | handleBackspace, handleDelete, onCompositionStart/End, onInput 외 3개 |
| input-handler-picture.ts | 215 | findPictureAtClick, findPictureBbox, 리사이즈/이동 드래그 외 6개 |

추출 패턴: `export function methodName(this: any, args)` + `.call(this, args)` delegation

### B. style.css (1,588줄 → 11줄)

11개 섹션별 CSS 파일로 분할, `@import` 방식으로 통합.

| 추출 파일 | 줄 수 | 내용 |
|-----------|-------|------|
| styles/base.css | 18 | 기본 스타일 |
| styles/menu-bar.css | 198 | 메뉴바 |
| styles/toolbar.css | 136 | 도구 상자 |
| styles/style-bar.css | 231 | 서식 도구 모음 |
| styles/editor.css | 30 | 편집 영역 |
| styles/status-bar.css | 105 | 상태 표시줄 |
| styles/dialogs.css | 457 | 공통 대화상자 |
| styles/char-shape-dialog.css | 185 | 글자모양 대화상자 |
| styles/table-selection.css | 23 | 표 선택 |
| styles/para-shape-dialog.css | 125 | 문단모양 대화상자 |
| styles/picture-props.css | 74 | 그림 속성 |

### C. para-shape-dialog.ts (1,497줄 → 877줄)

탭 설정 및 테두리 탭 빌더를 클로저 패턴으로 추출.

| 추출 파일 | 줄 수 | 내용 |
|-----------|-------|------|
| para-shape-helpers.ts | 40 | DOM 헬퍼 함수 (createFieldset, row, label 등) |
| para-shape-tab-builders.ts | 662 | buildTabSettingsTab(), buildBorderTab() |

### D. 부수적 수정

- `renderer/layout/text_measurement.rs`: `super::generic_fallback` → `crate::renderer::generic_fallback` (기존 빌드 오류 수정)

## 검증 결과

- `npx tsc --noEmit`: 오류 없음
- `docker compose --env-file .env.docker run --rm wasm`: 빌드 성공
- `docker compose --env-file .env.docker run --rm test`: 582 테스트 통과
- `cargo clippy --all-targets`: 0 warnings
