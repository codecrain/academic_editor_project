# 타스크 49 최종 결과보고서

## 타스크: Undo/Redo (실행취소/다시실행)

## 개요

모든 편집 동작을 Command 패턴으로 캡슐화하여 Undo/Redo를 구현하였다. 설계서 §8(명령 히스토리)의 핵심 구조를 따르되, 미구현 모듈(IncrementalLayout, DirtyTracker)을 제외한 간소화 버전으로 구축하였다. 기존 InputHandler의 직접 WASM 호출을 Command dispatch로 전환하고, Ctrl+Z/Y 단축키, 연속 타이핑 묶기, IME 조합-Undo 통합을 완성하였다.

## 구현 결과

### Command 패턴 인프라

**`engine/command.ts`** — EditCommand 인터페이스 + 5종 Command

| Command | execute() | undo() | mergeWith |
|---------|-----------|--------|-----------|
| `InsertTextCommand` | insertText[InCell] | deleteText[InCell] | 연속 위치 + 300ms 이내 |
| `DeleteTextCommand` | getTextRange → deleteText | insertText (보존 텍스트) | 연속 BS/Del + 300ms |
| `SplitParagraphCommand` | splitParagraph | mergeParagraph | 불가 |
| `MergeParagraphCommand` | getParagraphLength → mergeParagraph | splitParagraph (보존 위치) | 불가 |
| `MergeNextParagraphCommand` | mergeParagraph(para+1) | splitParagraph (현재 위치) | 불가 |

- 본문/셀 자동 분기: `DocumentPosition.parentParaIndex` 확인으로 헬퍼 함수가 WASM API 자동 선택
- 삭제 전 텍스트 보존: `getTextRange`/`getTextInCell`로 삭제 대상 텍스트를 Command 내부에 저장

**`engine/history.ts`** — CommandHistory

| 메서드 | 역할 |
|--------|------|
| `execute(cmd, wasm)` | 명령 실행 + 병합 시도 + undoStack push |
| `undo(wasm)` | undoStack pop → undo → redoStack push |
| `redo(wasm)` | redoStack pop → execute → undoStack push |
| `recordWithoutExecute(cmd)` | IME compositionend용 — 실행 없이 기록만 |
| `clear()` | 문서 로드 시 히스토리 초기화 |

### InputHandler 리팩터링

| 변경 | Before | After |
|------|--------|-------|
| 텍스트 입력 | `wasm.insertText()` 직접 | `InsertTextCommand` → `history.execute()` |
| Backspace 삭제 | `wasm.deleteText()` 직접 | `DeleteTextCommand(backward)` → `history.execute()` |
| Delete 삭제 | `wasm.deleteText()` 직접 | `DeleteTextCommand(forward)` → `history.execute()` |
| Enter | `wasm.splitParagraph()` 직접 | `SplitParagraphCommand` → `history.execute()` |
| 문단 병합 (BS) | `wasm.mergeParagraph()` 직접 | `MergeParagraphCommand` → `history.execute()` |
| 문단 병합 (Del) | `wasm.mergeParagraph()` 직접 | `MergeNextParagraphCommand` → `history.execute()` |
| IME 조합 중 | WASM 직접 호출 | WASM 직접 호출 유지 (Undo 기록 안 함) |
| IME 확정 | — | `recordWithoutExecute(InsertTextCommand)` |
| Ctrl+Z/Y | 미지원 | `handleUndo()` / `handleRedo()` |

### 연속 타이핑 묶기

- 같은 문단/셀, 연속 위치, 300ms 이내 → 하나의 InsertTextCommand로 병합
- Backspace/Delete도 같은 조건으로 병합
- Enter, 커서 이동, 서식 변경 등은 병합 중단

### IME 조합-Undo 통합

- compositionstart~compositionupdate: WASM 직접 호출 (Undo 스택 기록 안 함)
- compositionend: `getTextRange`로 확정 텍스트 읽기 → `InsertTextCommand` 생성 → `recordWithoutExecute()`
- 연속 한글 입력 300ms 이내 → 병합 (예: "한글" → Ctrl+Z 1회로 전체 삭제)

### WasmBridge 래퍼 추가 (2개)

`getTextRange`, `getTextInCell` — 삭제 전 텍스트 보존 (Undo용)

## 검증 결과

### 빌드 검증

| 항목 | 결과 |
|------|------|
| `cargo test` (Docker) | **474 tests 통과** |
| `wasm-pack build` (Docker) | **성공** |
| `tsc --noEmit` | **통과** |
| `vite build` | **성공** (18 modules, 48.38KB JS) |

### 브라우저 런타임 테스트 (10항목 전 통과)

| # | 테스트 항목 | 결과 |
|---|-----------|------|
| 1 | 텍스트 입력 후 Ctrl+Z | **통과** |
| 2 | Ctrl+Z 후 Ctrl+Y (Redo) | **통과** |
| 3 | Backspace 후 Ctrl+Z | **통과** |
| 4 | Delete 후 Ctrl+Z | **통과** |
| 5 | Enter 후 Ctrl+Z | **통과** |
| 6 | 문단 병합 후 Ctrl+Z | **통과** |
| 7 | 연속 타이핑 묶기 | **통과** |
| 8 | 한글 IME 후 Ctrl+Z | **통과** |
| 9 | 셀 내 편집 후 Ctrl+Z | **통과** |
| 10 | 다중 Undo 후 새 편집 (Redo 초기화) | **통과** |

## 변경 파일 총괄

| 파일 | 유형 | 내용 |
|------|------|------|
| `rhwp-studio/src/core/wasm-bridge.ts` | 수정 | `getTextRange`, `getTextInCell` 래퍼 추가 |
| `rhwp-studio/src/engine/command.ts` | **신규** | EditCommand 인터페이스 + 5종 Command 클래스 |
| `rhwp-studio/src/engine/history.ts` | **신규** | CommandHistory (Undo/Redo 스택, 병합, recordWithoutExecute) |
| `rhwp-studio/src/engine/input-handler.ts` | 수정 | Command dispatch 전환, Ctrl+Z/Y, IME-Undo 통합 |

## 산출물

| 문서 | 경로 |
|------|------|
| 수행계획서 | `mydocs/plans/task_49.md` |
| 구현 계획서 | `mydocs/plans/task_49_impl.md` |
| 최종 결과보고서 | `mydocs/working/task_49_final.md` |
