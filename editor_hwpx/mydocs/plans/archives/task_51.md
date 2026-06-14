# 타스크 51 수행계획서: 복사/붙여넣기 (클립보드)

## 개요

- **타스크**: B-305. 복사/붙여넣기 (클립보드)
- **브랜치**: `local/task51`
- **선행 타스크**: 타스크 50 (커서 이동 확장 + 셀 탐색) 완료

## 목표

HWP 웹 에디터에서 텍스트 선택(Selection)과 클립보드 기능(Ctrl+C/X/V)을 구현한다.

## 범위

### 포함
- 텍스트 선택 (Shift+Arrow, Shift+Home/End, Ctrl+Shift+Home/End, Ctrl+A)
- 선택 영역 시각화 (파란색 반투명 하이라이트)
- 복사 (Ctrl+C) — 시스템 클립보드 + 내부 클립보드
- 잘라내기 (Ctrl+X) — 복사 후 선택 삭제
- 붙여넣기 (Ctrl+V) — 내부/외부 텍스트 삽입
- 선택 영역 편집 (Backspace/Delete/문자입력으로 선택 대체)
- 표 셀 내부에서 동일한 동작 지원
- Undo/Redo 통합

### 제외 (첫 패스)
- 마우스 드래그 선택
- 셀↔본문 경계를 넘는 선택
- 셀 블록 선택 (표 전체 셀 범위 선택)
- 서식 포함 붙여넣기 (HTML → 서식 복원)
- 이미지/도형 복사

## 기존 자산

Rust WASM 측에 클립보드 API가 이미 구현됨:
- `copySelection`, `copySelectionInCell` — 선택 영역 복사
- `pasteInternal`, `pasteInternalInCell` — 내부 클립보드 붙여넣기
- `pasteHtml`, `pasteHtmlInCell` — HTML 붙여넣기
- `exportSelectionHtml`, `exportSelectionInCellHtml` — HTML 내보내기
- `hasInternalClipboard`, `getClipboardText`, `clearClipboard`

## 구현 단계

| 단계 | 내용 | 주요 파일 |
|------|------|-----------|
| 1단계 | Selection 모델 + Shift+Arrow 키 처리 | cursor.ts, input-handler.ts, types.ts |
| 2단계 | Selection 렌더링 (WASM getSelectionRects + DOM 오버레이) | wasm_api.rs, selection-renderer.ts, wasm-bridge.ts |
| 3단계 | 클립보드 연동 + 선택 영역 편집 | wasm_api.rs, command.ts, input-handler.ts, wasm-bridge.ts |

## 산출물

- 수정 파일 7개 (Rust 1개 + TypeScript 6개)
- 신규 파일 1개 (selection-renderer.ts)
- 추가 WASM API 4개 (getSelectionRects, getSelectionRectsInCell, deleteRange, deleteRangeInCell)
