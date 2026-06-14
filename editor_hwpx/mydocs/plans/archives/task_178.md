# 타스크 178: Undo 시스템 라우팅 통합 리팩토링 — 수행계획서

## 배경

타스크 177에서 스냅샷 기반 SnapshotCommand를 도입하여 붙여넣기·객체 삭제의 Undo를
가능하게 했다. 현재 Undo 시스템은 3개의 진입점으로 분산되어 있다:

| 진입점 | 용도 | 호출부 |
|--------|------|--------|
| `executeCommand(cmd)` | 정밀 커맨드 (텍스트, 문단, 서식) | input-handler.ts (private) |
| `executeSnapshotOperation(type, fn)` | 스냅샷 커맨드 (붙여넣기, 객체 삭제) | input-handler.ts (public) |
| `recordWithoutExecute(cmd)` | WASM 직접 호출 후 기록 (이동, IME) | history.ts |

호출부(keyboard/table/text handler)가 **어떤 커맨드를 생성할지, 어떤 진입점을 사용할지**를
직접 결정하고 있어 다음 문제가 있다:

1. **새 작업 추가 시** 정밀/스냅샷 판단을 호출부가 직접 해야 함
2. **Undo 전략 변경** (정밀↔스냅샷) 시 호출부 코드 수정 필요
3. **executeCommand 시그니처**가 10개 타입의 union으로 비대

## 목표

이벤트 컨텍스트 기반 라우팅 구조를 도입하여:
- 호출부는 **"무엇을 하려는가"** 만 서술 (OperationDescriptor)
- 라우터가 **적절한 Undo 전략**을 자동 선택
- 단일 진입점 `executeOperation(descriptor)` 통합

## 설계

### OperationDescriptor 타입

```typescript
/** 편집 작업 서술자 — 호출부가 "무엇을 하려는가"만 기술 */
type OperationDescriptor =
  // === 정밀 커맨드 (기존 유지) ===
  | { kind: 'insertText'; pos: DocumentPosition; text: string }
  | { kind: 'deleteText'; pos: DocumentPosition; count: number; forward: boolean }
  | { kind: 'splitParagraph'; pos: DocumentPosition; inCell: boolean }
  | { kind: 'mergeParagraph'; pos: DocumentPosition }
  | { kind: 'mergeNextParagraph'; pos: DocumentPosition }
  | { kind: 'mergeParagraphInCell'; pos: DocumentPosition }
  | { kind: 'mergeNextParagraphInCell'; pos: DocumentPosition }
  | { kind: 'deleteSelection'; anchor: DocumentPosition; focus: DocumentPosition }
  | { kind: 'applyCharFormat'; props: CharProperties }
  // === 스냅샷 커맨드 (자동 래핑) ===
  | { kind: 'snapshot'; operationType: string; operation: (wasm: WasmBridge) => DocumentPosition }
  // === 외부 실행 기록 (recordWithoutExecute) ===
  | { kind: 'record'; command: EditCommand };
```

### 라우터 (`executeOperation`)

```typescript
executeOperation(desc: OperationDescriptor): void {
  switch (desc.kind) {
    case 'insertText':
      return this._exec(new InsertTextCommand(...));
    case 'deleteText':
      return this._exec(new DeleteTextCommand(...));
    case 'snapshot':
      return this._execSnapshot(desc.operationType, desc.operation);
    case 'record':
      return this._record(desc.command);
    // ...
  }
}
```

### 호출부 변경 예시

**Before:**
```typescript
// input-handler-keyboard.ts
this.handler.executeSnapshotOperation('deleteObject', (wasm) => {
  wasm.deletePictureControl(sec, ppi);
  return pos;
});
```

**After:**
```typescript
this.handler.executeOperation({
  kind: 'snapshot',
  operationType: 'deleteObject',
  operation: (wasm) => { wasm.deletePictureControl(sec, ppi); return pos; }
});
```

## 구현 단계

### 1단계: OperationDescriptor 타입 + 라우터

| 파일 | 변경 |
|------|------|
| `command.ts` | `OperationDescriptor` 타입 정의 |
| `input-handler.ts` | `executeOperation()` 라우터 구현. 기존 `executeCommand()`/`executeSnapshotOperation()` 내부 위임 |

- 기존 메서드는 private으로 유지 (하위 호환)
- 라우터가 `_exec`, `_execSnapshot`, `_record` 내부 메서드로 위임

### 2단계: 호출부 마이그레이션

| 파일 | 변경 |
|------|------|
| `input-handler-keyboard.ts` | 11개 호출부 → `executeOperation()` 전환 |
| `input-handler-text.ts` | IME/backspace/delete 호출부 전환 |
| `input-handler-table.ts` | 테이블/그림/글상자 이동 호출부 전환 |

### 3단계: 정리

| 파일 | 변경 |
|------|------|
| `input-handler.ts` | 기존 `executeCommand()`, `executeSnapshotOperation()` 제거 (라우터로 통합) |
| `command.ts` | 미사용 임포트 정리 |

## 검증

- TS 타입체크 통과
- 615 cargo 테스트 통과
- 기능 검증: 텍스트 입력/삭제 → Undo/Redo, 붙여넣기 → Undo, 객체 삭제 → Undo

## 범위 외

- 기존 14개 EditCommand 구현체 자체는 변경하지 않음
- Undo 전략 변경 (예: DeleteSelection을 스냅샷으로 전환)은 이 타스크에서 하지 않음
- WASM/Rust 코드 변경 없음
