# 타스크 49 수행계획서: Undo/Redo (실행취소/다시실행)

## 배경

타스크 48에서 기본 커서 + 텍스트 입력이 완성되었으나, 편집 실수를 되돌릴 수 없다. 현재 `InputHandler`가 WASM API를 직접 호출하여 편집 결과를 추적하지 않기 때문이다. 설계서 §8(명령 히스토리)의 Command 패턴을 적용하여 모든 편집 동작을 역실행 가능한 Command 객체로 캡슐화한다.

## 현재 상태 분석

### InputHandler 편집 동작 (6종)

| 동작 | 현재 코드 | Command 필요 |
|------|-----------|-------------|
| 텍스트 입력 (일반) | `insertText()` 직접 호출 | InsertTextCommand |
| 텍스트 입력 (셀) | `insertTextInCell()` 직접 호출 | InsertTextCommand (셀 분기) |
| Backspace (문자 삭제) | `deleteText()` 직접 호출 | DeleteTextCommand |
| Backspace (문단 병합) | `mergeParagraph()` 직접 호출 | MergeParagraphCommand |
| Delete | `deleteText()` / `mergeParagraph()` | DeleteTextCommand / MergeParagraphCommand |
| Enter | `splitParagraph()` 직접 호출 | SplitParagraphCommand |

### IME 조합과 Undo 통합 (설계서 §8.6)

- compositionstart → compositionupdate: WASM 직접 호출 (Undo 스택 기록 **안 함**)
- compositionend: Command 패턴으로 `InsertTextCommand` 실행 → Undo 스택 기록
- 연속 한글 입력은 300ms 이내 + 연속 위치면 하나로 병합

### 필요 WASM API 보강

| API | 현황 | 용도 |
|-----|------|------|
| `getTextRange` | Rust 구현 O, TS 래퍼 X | 삭제 전 텍스트 보존 (Undo용) |
| `getTextRangeInCell` | **미구현** | 셀 내 삭제 전 텍스트 보존 (Undo용) |

## 목표

1. Command 패턴 인프라 구축 (EditCommand 인터페이스 + CommandHistory)
2. 편집 명령 4종 구현 (InsertText, DeleteText, SplitParagraph, MergeParagraph)
3. InputHandler 리팩터링 — 직접 WASM 호출 → Command dispatch 전환
4. Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo) 단축키 처리
5. 연속 타이핑 묶기 (mergeWith, 300ms 이내 연속 입력)
6. IME 조합과 Undo 통합 (조합 중 기록 안 함, 확정 시점에 기록)

## 산출물

| 파일 | 유형 | 내용 |
|------|------|------|
| `src/wasm_api.rs` | 수정 | getTextRangeInCell API 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 수정 | getTextRange, getTextRangeInCell 래퍼 추가 |
| `rhwp-studio/src/engine/command.ts` | **신규** | EditCommand 인터페이스 + 4종 Command 클래스 |
| `rhwp-studio/src/engine/history.ts` | **신규** | CommandHistory (Undo/Redo 스택, 병합 로직) |
| `rhwp-studio/src/engine/input-handler.ts` | 수정 | Command dispatch 전환, Ctrl+Z/Y 처리 |

## 설계 핵심

### Command 패턴 (간소화)

설계서 §8의 EditContext에서 현재 미구현 모듈(IncrementalLayout, DirtyTracker)을 제외하고, 현재 코드베이스에서 바로 동작하는 간소화 버전을 구현한다:

```typescript
interface EditCommand {
  readonly type: string;
  readonly timestamp: number;
  execute(wasm: WasmBridge): DocumentPosition;  // 실행 후 커서 위치 반환
  undo(wasm: WasmBridge): DocumentPosition;     // 역실행 후 커서 위치 반환
  mergeWith(other: EditCommand): EditCommand | null;
}
```

- `execute()`/`undo()`는 `WasmBridge`만 받아 WASM API 호출
- 커서 이동과 재렌더링은 InputHandler가 CommandResult의 커서 위치로 처리
- 셀/본문 분기는 각 Command 내부에서 `DocumentPosition.parentParaIndex` 확인

### 연속 타이핑 묶기

```
"안녕하세요" → InsertTextCommand 5개 → mergeWith → 1개 (300ms 이내)
Ctrl+Z 1회 → "안녕하세요" 전체 삭제
```

## 워크플로우

1. 수행계획서 → 승인
2. 구현 계획서 → 승인
3. 단계별 구현 + 완료보고서 → 승인
4. 최종 결과보고서
