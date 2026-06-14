# 타스크 48 단계 2 완료보고서

## 단계: TypeScript 커서 모델 + 캐럿 렌더링

## 수행 내용

### 신규 파일 (2개)

**`engine/cursor.ts`** — CursorState 관리 클래스
- `DocumentPosition` 기반 커서 위치 관리
- `moveTo(pos)`: 문서 위치로 커서 이동
- `moveHorizontal(delta)`: 좌/우 화살표 키 처리 (문단 경계 넘기 포함)
- `updateRect()`: WASM `getCursorRect()` 호출로 픽셀 좌표 갱신
- `getPosition() / getRect()`: 현재 상태 조회

**`engine/caret-renderer.ts`** — Canvas 오버레이 캐럿 렌더러
- DOM `<div>` 엘리먼트 기반 캐럿 (2px 폭, 검정색)
- `scroll-content` 안에 배치 → 스크롤과 함께 이동
- 500ms 깜박임 (setInterval)
- `show(rect, zoom)`: 캐럿 표시 + 깜박임 시작
- `hide()`: 캐럿 숨김
- `update(rect, zoom)`: 위치 갱신 + 깜박임 리셋 (입력 후 항상 보이게)
- `updatePosition(zoom)`: 줌 변경 시 좌표 재계산

### 수정 파일 (2개)

**`core/types.ts`** — 타입 3개 추가
- `CursorRect`: `{pageIndex, x, y, height}` — 캐럿 좌표
- `HitTestResult`: `{sectionIndex, paragraphIndex, charOffset}` — 히트 테스트 결과
- `DocumentPosition`: `{sectionIndex, paragraphIndex, charOffset}` — 커서 위치

**`core/wasm-bridge.ts`** — WASM 래퍼 8개 추가
- `getCursorRect(sec, para, charOffset) → CursorRect`
- `hitTest(pageNum, x, y) → HitTestResult`
- `insertText(sec, para, charOffset, text) → string`
- `deleteText(sec, para, charOffset, count) → string`
- `splitParagraph(sec, para, charOffset) → string`
- `mergeParagraph(sec, para) → string`
- `getParagraphLength(sec, para) → number`
- `getParagraphCount(sec) → number`

## 검증

| 항목 | 결과 |
|------|------|
| `tsc --noEmit` | **통과** (0 errors) |

## 변경/생성 파일

| 파일 | 유형 | 내용 |
|------|------|------|
| `rhwp-studio/src/core/types.ts` | 수정 | CursorRect, HitTestResult, DocumentPosition 타입 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 수정 | WASM API 래퍼 8개 추가 |
| `rhwp-studio/src/engine/cursor.ts` | 신규 | CursorState 커서 모델 |
| `rhwp-studio/src/engine/caret-renderer.ts` | 신규 | 캐럿 DOM 렌더러 (500ms 깜박임) |
