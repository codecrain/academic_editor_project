# 타스크 202 구현 계획서: IME 조합 블랙박스 캐럿

## 1단계: CaretRenderer 조합 오버레이 추가

`caret-renderer.ts`에 조합 표시용 DOM 요소와 메서드를 추가한다.

- 조합 오버레이 div 생성 (position:absolute, background:#000, color:#fff, pointer-events:none)
- `showComposition(rect, width, zoom, text)`: 블랙박스 + 흰색 텍스트 표시, 캐럿 숨김
- `hideComposition()`: 블랙박스 숨기고 캐럿 복귀
- 깜빡임: 기존 캐럿과 동일한 500ms 주기, 블랙박스 전체 ON/OFF

## 2단계: InputHandler 조합 모드 연동

`input-handler.ts`의 `updateCaret()`에서 조합 상태를 감지하여 CaretRenderer에 전달한다.

- `isComposing && compositionAnchor`일 때:
  - anchor 위치의 getCursorRect 호출 → startRect (블랙박스 시작 좌표)
  - 현재 커서 rect → endRect (블랙박스 끝 좌표)
  - 너비 = endRect.x - startRect.x (최소 height * 0.7 보장)
  - 조합 텍스트 = `this.textarea.value`
  - `caret.showComposition(startRect, width, zoom, text)` 호출
- 비조합 시: `caret.hideComposition()` 확인

## 3단계: 테스트 및 검증

- 한글 입력 테스트 (ㄱ→가→간 등 조합 과정)
- 표 셀 내 IME 조합 테스트
- 조합 중 방향키/Enter로 확정 시 블랙박스 → 캐럿 전환 확인
- 줌 변경 시 블랙박스 크기/위치 정확성 확인
