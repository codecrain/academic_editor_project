# 타스크 51 단계별 완료 보고서: 복사/붙여넣기 (클립보드)

## 1단계: Selection 모델 + Shift+Arrow 키 처리 — 완료

### 구현 내용

**`types.ts`**: `SelectionRect` 인터페이스 이미 존재 확인 (이전 세션에서 추가됨)

**`cursor.ts`** — Selection 모델 추가:
- `private anchor: DocumentPosition | null` 필드 추가
- `hasSelection()`: anchor가 null이 아닌지 확인
- `getSelection()`: anchor/focus 쌍 반환
- `getSelectionOrdered()`: start < end 순서 보장 (comparePositions 사용)
- `setAnchor()`: 현재 position을 anchor로 설정 (이미 있으면 유지)
- `clearSelection()`: anchor를 null로 초기화
- `static comparePositions(a, b)`: 두 DocumentPosition 비교
  - 본문↔본문: (sectionIndex, paragraphIndex, charOffset) 사전순
  - 셀↔셀: 같은 셀이면 (cellParaIndex, charOffset), 다른 셀이면 셀 인덱스 비교
  - 본문↔셀: parentParaIndex vs paragraphIndex 비교

**`input-handler.ts`** — Shift+키 선택:
- ArrowLeft/Right/Up/Down + Shift: `setAnchor()` → 이동 (선택 확장)
- Home/End + Shift: 줄 시작/끝까지 선택
- Ctrl+Shift+Home/End: 문서 시작/끝까지 선택
- 비Shift 이동키: `clearSelection()` 후 이동
- 마우스 클릭: `clearSelection()` 후 위치 이동
- Ctrl+A: 문서 전체 선택

### 빌드 결과
- Vite(tsc) 빌드: 성공

---

## 2단계: Selection 렌더링 (WASM getSelectionRects + DOM 오버레이) — 완료

### 구현 내용

**`src/wasm_api.rs`** — WASM API 2쌍:
- `getSelectionRects(sec, startPara, startOffset, endPara, endOffset)`: 본문 선택 영역의 줄별 사각형 배열 반환
- `getSelectionRectsInCell(sec, ppi, ci, cei, startCpi, startOffset, endCpi, endOffset)`: 셀 내 동일
- 알고리즘: 선택 범위 내 각 문단의 각 줄을 순회, `getCursorRect`로 좌/우 경계 X좌표를 구해 사각형 생성

**`selection-renderer.ts`** — 신규 파일:
- `caret-renderer.ts` 패턴 차용
- `#scroll-content`에 `div.selection-layer` (z-index:5, pointer-events:none)
- `render(rects, zoom)`: 각 rect를 div로 생성, `rgba(51,122,183,0.3)` 배경
- `clear()`: 모든 하이라이트 div 제거
- `ensureAttached()`: DOM 재부착 (loadDocument 후 대응)
- 페이지 오프셋 + CSS 중앙 정렬 + 줌 보정

**`wasm-bridge.ts`**: `getSelectionRects()`, `getSelectionRectsInCell()` 래퍼 추가

**`input-handler.ts`**: `updateSelection()` 메서드 — Shift+이동 후 자동 호출, 선택 해제 시 `clear()`

### 빌드 결과
- Docker WASM 빌드: 성공
- Vite(tsc) 빌드: 성공

---

## 3단계: 클립보드 연동 + 선택 영역 편집 — 완료

### 구현 내용

**`src/wasm_api.rs`** — deleteRange API 2쌍:
- `deleteRange(sec, startPara, startOffset, endPara, endOffset)`: 본문 선택 영역 삭제
- `deleteRangeInCell(sec, ppi, ci, cei, startCpi, startOffset, endCpi, endOffset)`: 셀 내 동일
- 알고리즘: 단일 문단이면 delete_text_at, 다중 문단이면 역순으로 중간 문단 제거 후 첫-마지막 문단 병합
- `get_cell_mut()` 헬퍼 추가: 셀에 대한 가변 참조 획득

**`command.ts`** — `DeleteSelectionCommand`:
- `execute()`: 삭제 전 텍스트를 문단별로 보존 → wasm.deleteRange() 호출
- `undo()`: 보존된 텍스트로 복원 (단일 문단: insertText, 다중 문단: splitParagraph + insertText 반복)
- mergeWith: 항상 null (선택 삭제는 병합 불가)

**`wasm-bridge.ts`** — 클립보드 API 래퍼 8개:
- `deleteRange`, `deleteRangeInCell`
- `copySelection`, `copySelectionInCell`
- `pasteInternal`, `pasteInternalInCell`
- `hasInternalClipboard`, `getClipboardText`

**`input-handler.ts`** — 클립보드 이벤트 + 선택 편집:
- `onCopy()`: 선택 → wasm.copySelection → clipboardData.setData('text/plain')
- `onCut()`: onCopy + deleteSelection
- `onPaste()`: 선택 삭제 → hasInternalClipboard면 pasteInternal, 아니면 외부 텍스트 줄 단위 삽입
- `deleteSelection()`: DeleteSelectionCommand 생성 → execute
- Backspace/Delete + 선택: deleteSelection() 호출
- Enter + 선택: deleteSelection() → splitParagraph
- IME 조합 시작 + 선택: deleteSelection() → 조합 시작
- 일반 입력 + 선택: deleteSelection() → insertText

### 빌드 결과
- Docker WASM 빌드: 성공
- Vite(tsc) 빌드: 성공

---

## 추가: HTML 클립보드 통합 (표 붙여넣기) — 완료

### 구현 내용

기존 WASM 코어에 이미 구현되어 있던 HTML 클립보드 API를 TypeScript 측에 연결하여 외부 프로그램(HWP 등)에서 복사한 표/서식이 그대로 붙여넣기 가능하도록 구현.

**`wasm-bridge.ts`** — HTML 클립보드 API 래퍼 4개 추가:
- `exportSelectionHtml()`, `exportSelectionInCellHtml()`: 선택 영역을 HTML로 내보내기
- `pasteHtml()`, `pasteHtmlInCell()`: HTML 붙여넣기 (표/서식 보존)

**`input-handler.ts`** — 클립보드 이벤트 개선:
- `onCopy()`: `text/plain` + `text/html` 동시 내보내기 (`exportSelectionHtml` 활용)
- `onPaste()`: HTML 우선 붙여넣기 경로 추가 — `text/html` → `pasteHtml` → 실패 시 `text/plain` 폴백

### 검증 결과
- HWP 프로그램에서 표 컨트롤 선택 복사 → 붙여넣기: 표로 정상 렌더링 확인
- Vite(tsc) 빌드: 성공

---

## 수정 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `src/wasm_api.rs` | getSelectionRects/InCell + deleteRange/InCell + get_cell_mut | +170줄 |
| `rhwp-studio/src/core/types.ts` | SelectionRect (이전 세션 추가) | - |
| `rhwp-studio/src/core/wasm-bridge.ts` | 선택/클립보드/삭제/HTML API 래퍼 16개 | +80줄 |
| `rhwp-studio/src/engine/cursor.ts` | anchor/focus 선택 모델, comparePositions | +75줄 |
| `rhwp-studio/src/engine/selection-renderer.ts` | 선택 영역 하이라이트 (신규) | +70줄 |
| `rhwp-studio/src/engine/command.ts` | DeleteSelectionCommand | +80줄 |
| `rhwp-studio/src/engine/input-handler.ts` | Shift+Arrow, Ctrl+C/X/V/A, 선택편집, 클립보드 이벤트, HTML 붙여넣기 | +170줄 |
