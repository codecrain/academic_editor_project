# 타스크 49 구현 계획서: Undo/Redo (실행취소/다시실행)

## 전략 방향

현재 `InputHandler`가 WASM API를 직접 호출하는 구조를 **Command 패턴**으로 전환한다. Command 객체가 편집 동작의 실행(execute)과 역실행(undo)을 캡슐화하고, `CommandHistory`가 Undo/Redo 스택을 관리한다. 설계서 §8을 기반으로 하되, 미구현 모듈(IncrementalLayout, DirtyTracker)은 제외한 간소화 버전을 구현한다.

## 핵심 설계

### Command 인터페이스

```typescript
interface EditCommand {
  readonly type: string;
  readonly timestamp: number;
  execute(wasm: WasmBridge): DocumentPosition;
  undo(wasm: WasmBridge): DocumentPosition;
  mergeWith(other: EditCommand): EditCommand | null;
}
```

### 명령-WASM 매핑

| Command | execute() | undo() | mergeWith |
|---------|-----------|--------|-----------|
| InsertTextCommand | insertText[InCell] | deleteText[InCell] | 연속 위치 + 300ms 이내 |
| DeleteTextCommand | getTextRange[InCell] → deleteText[InCell] | insertText[InCell] | 연속 BS/Del + 300ms 이내 |
| SplitParagraphCommand | splitParagraph | mergeParagraph | 불가 |
| MergeParagraphCommand | getParagraphLength → mergeParagraph | splitParagraph | 불가 |

### IME 조합 ↔ Undo 경계

```
[조합 중] compositionstart → input(update) × N
  → WASM 직접 호출 (Undo 스택 기록 안 함, 현행 유지)

[조합 확정] compositionend
  → InsertTextCommand 생성, CommandHistory.execute()
  → 이전 조합 텍스트는 이미 삭제+재삽입 과정에서 문서에 최종본만 남아 있음
  → Command의 position = compositionAnchor, text = 확정 텍스트
```

## 단계 구성 (4단계)

### 단계 1: WASM API 보강 + TypeScript 래퍼

**작업 내용**:
- Rust: `getTextRangeInCell` WASM/Native 메서드 추가 (셀 내 텍스트 부분 추출)
- TypeScript: `wasm-bridge.ts`에 `getTextRange`, `getTextRangeInCell` 래퍼 추가

**변경 파일**:
| 파일 | 내용 |
|------|------|
| `src/wasm_api.rs` | `getTextRangeInCell` + `get_text_range_in_cell_native` 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | `getTextRange`, `getTextRangeInCell` 래퍼 |

**검증**: `cargo test`, `tsc --noEmit`

### 단계 2: Command 패턴 인프라

**작업 내용**:
- `engine/command.ts`: EditCommand 인터페이스 + 4종 Command 클래스
  - `InsertTextCommand` — 본문/셀 자동 분기, 연속 타이핑 병합
  - `DeleteTextCommand` — 삭제 전 getTextRange로 텍스트 보존, Backspace/Delete 병합
  - `SplitParagraphCommand` — 역연산: mergeParagraph
  - `MergeParagraphCommand` — 병합 전 getParagraphLength로 분할 위치 보존, 역연산: splitParagraph
- `engine/history.ts`: CommandHistory 클래스
  - undoStack / redoStack
  - execute(): 명령 실행 + 이전 명령과 병합 시도 + 스택 push
  - undo(): undoStack pop → undo() → redoStack push
  - redo(): redoStack pop → execute() → undoStack push
  - canUndo() / canRedo()
  - clear(): 문서 로드 시 히스토리 초기화

**변경 파일**:
| 파일 | 유형 | 내용 |
|------|------|------|
| `rhwp-studio/src/engine/command.ts` | **신규** | EditCommand + 4종 Command |
| `rhwp-studio/src/engine/history.ts` | **신규** | CommandHistory |

**검증**: `tsc --noEmit`

### 단계 3: InputHandler 리팩터링 + Ctrl+Z/Y

**작업 내용**:
- `InputHandler`에 `CommandHistory` 통합
- 편집 메서드를 Command dispatch로 전환:
  - `onInput()` (일반 입력) → `InsertTextCommand` 생성 → `history.execute()`
  - `onCompositionEnd()` → `InsertTextCommand` 생성 (조합 확정 텍스트)
  - `handleBackspace()` → `DeleteTextCommand` 또는 `MergeParagraphCommand`
  - `handleDelete()` → `DeleteTextCommand` 또는 `MergeParagraphCommand`
  - Enter → `SplitParagraphCommand`
- `onKeyDown()`에 Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z 핸들러 추가
- `deactivate()`에서 히스토리 초기화 (문서 재로드 시)
- IME 조합 중(`onInput` isComposing 분기)은 기존 WASM 직접 호출 유지 (Undo 기록 안 함)

**주요 변경 포인트 (InputHandler)**:
```
Before: this.wasm.insertText(sec, para, offset, text);
After:  const cmd = new InsertTextCommand(pos, text);
        const newPos = this.history.execute(cmd, this.wasm);
        this.cursor.moveTo(newPos);
```

**변경 파일**:
| 파일 | 내용 |
|------|------|
| `rhwp-studio/src/engine/input-handler.ts` | Command dispatch 전환, Ctrl+Z/Y |

**검증**: `tsc --noEmit`, `vite build`

### 단계 4: 빌드 검증 + 런타임 테스트

**작업 내용**:
- Docker 빌드: `cargo test`, `wasm-pack build`
- TypeScript 빌드: `tsc --noEmit`, `vite build`
- 브라우저 런타임 테스트

**런타임 테스트 항목**:

| # | 테스트 | 검증 방법 |
|---|--------|----------|
| 1 | 텍스트 입력 후 Ctrl+Z | 입력한 텍스트 전체 삭제 확인 |
| 2 | Ctrl+Z 후 Ctrl+Y | 삭제된 텍스트 복원 확인 |
| 3 | Backspace 후 Ctrl+Z | 삭제된 문자 복원 확인 |
| 4 | Delete 후 Ctrl+Z | 삭제된 문자 복원 확인 |
| 5 | Enter 후 Ctrl+Z | 문단 병합 확인 |
| 6 | 문단 병합(BS at start) 후 Ctrl+Z | 문단 다시 분할 확인 |
| 7 | 연속 타이핑 묶기 | "abc" 연타 → Ctrl+Z 1회로 전체 삭제 확인 |
| 8 | 한글 IME 입력 후 Ctrl+Z | 확정된 한글 삭제 확인 |
| 9 | 셀 내 편집 후 Ctrl+Z | 셀 내 텍스트 Undo 확인 |
| 10 | 다중 Undo 후 새 편집 | Redo 스택 초기화 확인 |
