# 타스크 157 — 2단계 완료 보고서

## 단계 목표

글상자(Shape) 선택/이동/크기조절 UI — 기존 그림(Picture) 선택 패턴을 확장하여 글상자에도 동일한 선택/이동/크기조절 UX를 제공한다.

## 구현 전략

기존 그림 선택 시스템(`input-handler-picture.ts`)을 **통합 개체 선택 시스템**으로 확장했다. `selectedPictureRef`에 `type: 'image' | 'shape'` 필드를 추가하여, 한 세트의 코드로 그림과 글상자 모두를 처리한다.

## 변경 파일 (10개)

| 파일 | 변경 내용 |
|------|-----------|
| `rhwp-studio/src/core/types.ts` | `ControlLayoutItem.type`에 `'shape'` 추가, `ObjectRef` 인터페이스 신규, `ShapeProperties` 인터페이스 신규 |
| `rhwp-studio/src/core/wasm-bridge.ts` | `createShapeControl`, `getShapeProperties`, `setShapeProperties`, `deleteShapeControl` 4개 메서드 추가 |
| `rhwp-studio/src/engine/cursor.ts` | `selectedPictureRef`에 `type` 필드 추가, `enterPictureObjectSelectionDirect`에 type 매개변수 추가, `getSelectedPictureRef` 반환형 갱신 |
| `rhwp-studio/src/engine/input-handler-picture.ts` | `findPictureAtClick`/`findPictureBbox`에 type 반영, `getObjectProperties`/`setObjectProperties`/`deleteObjectControl` 헬퍼 함수 추가 (image/shape 분기), 이동/리사이즈 로직을 통합 헬퍼로 전환 |
| `rhwp-studio/src/engine/input-handler.ts` | 상태 타입에 `type` 필드 추가, wrapper 메서드 3개 추가 (`getObjectProperties`, `setObjectProperties`, `deleteObjectControl`), 반환형 갱신 |
| `rhwp-studio/src/engine/input-handler-mouse.ts` | 리사이즈/이동 드래그에서 통합 헬퍼 사용, `enterPictureObjectSelectionDirect` 호출에 `picHit.type` 전달, ref에 type 포함 |
| `rhwp-studio/src/engine/input-handler-keyboard.ts` | Delete/Backspace에서 `deleteObjectControl(ref)` 사용 (기존 `deletePictureControl` 대체) |
| `rhwp-studio/src/engine/input-handler-table.ts` | `moveSelectedPicture`에서 `getObjectProperties`/`setObjectProperties` 사용, `MoveShapeCommand` 분기 추가 |
| `rhwp-studio/src/engine/command.ts` | `MoveShapeCommand` 클래스 추가 (Undo/Redo 지원) |
| `rhwp-studio/src/command/commands/insert.ts` | `insert:picture-delete`에서 shape/image 분기 삭제 처리 |

## 핵심 설계

### 통합 개체 참조 (ObjectRef)

```typescript
{ sec: number; ppi: number; ci: number; type: 'image' | 'shape' }
```

모든 개체 선택/이동/크기조절/삭제 로직이 이 참조를 통해 type에 따라 적절한 WASM API를 호출한다.

### 헬퍼 함수 분기 패턴

```typescript
// input-handler-picture.ts
export function getObjectProperties(this: any, ref): any {
  if (ref.type === 'shape') return this.wasm.getShapeProperties(ref.sec, ref.ppi, ref.ci);
  return this.wasm.getPictureProperties(ref.sec, ref.ppi, ref.ci);
}
```

### MoveShapeCommand (Undo/Redo)

`MovePictureCommand`와 동일한 구조로, `getShapeProperties`/`setShapeProperties` WASM API를 사용한다.

## 검증

- **Rust 테스트**: 608 passed, 0 failed
- **WASM 빌드**: 성공
- **TypeScript 타입 검사**: 새 에러 없음 (기존 1개 pre-existing 에러 유지)

## 지원되는 글상자 조작

| 조작 | 동작 |
|------|------|
| 클릭 | 8방향 핸들로 글상자 선택 |
| 핸들 드래그 | 크기조절 (코너: 비율 유지) |
| 본체 드래그 | 이동 (treatAsChar=false인 경우) |
| 방향키 | 그리드 단위 이동 |
| Delete/Backspace | 삭제 |
| Escape | 선택 해제 |
| Undo/Redo | 이동 취소/다시실행 |
