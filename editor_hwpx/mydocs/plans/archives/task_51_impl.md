# 타스크 51 구현계획서: 복사/붙여넣기 (클립보드)

## Context

타스크 50에서 커서 이동이 완료되었다. 클립보드 기능을 구현하려면 **텍스트 선택(Selection)**이 선행 필요하다.

**핵심 발견**: Rust WASM 측에 클립보드 API가 이미 풍부하게 구현되어 있다:
- `copySelection`, `copySelectionInCell` — 선택 영역을 내부 클립보드에 복사
- `pasteInternal`, `pasteInternalInCell` — 내부 클립보드 붙여넣기
- `pasteHtml`, `pasteHtmlInCell` — HTML 붙여넣기
- `exportSelectionHtml`, `exportSelectionInCellHtml` — HTML로 내보내기
- `hasInternalClipboard`, `getClipboardText`, `clearClipboard`

**아직 없는 것**: TypeScript 측 Selection 모델, Selection 렌더링, Shift+Arrow 처리, 클립보드 이벤트 연결, 선택 영역 삭제(deleteRange), 선택 영역 하이라이트용 WASM API(`getSelectionRects`)

---

## 단계별 구현 계획

### 1단계: Selection 모델 + Shift+Arrow 키 처리

**목표**: CursorState에 anchor/focus 선택 모델을 추가하고 Shift+Arrow로 선택 확장/축소.

**`cursor.ts` 수정**:
- `private anchor: DocumentPosition | null = null` 필드 추가
- `hasSelection(): boolean` — anchor가 null이 아닌지
- `getSelection(): { anchor: DocumentPosition; focus: DocumentPosition } | null`
- `getSelectionOrdered(): { start: DocumentPosition; end: DocumentPosition } | null` — 항상 start < end
- `setAnchor(): void` — 현재 position을 anchor로 설정
- `clearSelection(): void` — anchor를 null로
- `static comparePositions(a, b): number` — 두 위치 비교 (-1, 0, 1)

위치 비교 로직:
```
본문: (sectionIndex, paragraphIndex, charOffset) 사전순
셀: 같은 셀이면 (cellParaIndex, charOffset) 비교
셀↔본문: 첫 패스에서는 동일 컨텍스트만 선택 허용 (경계 넘기 제한)
```

**`input-handler.ts` 수정**:
- Shift+Arrow: `setAnchor()` → 이동 → selection 자동 확장
- Shift+Home/End: 줄 시작/끝까지 선택
- Ctrl+Shift+Home/End: 문서 시작/끝까지 선택
- 비Shift 이동키: `clearSelection()` 후 이동
- 마우스 클릭: `clearSelection()` 후 위치 이동
- Ctrl+A: anchor=문서시작, focus=문서끝

**`types.ts` 수정**:
- `SelectionRect` 인터페이스 추가: `{ pageIndex, x, y, width, height }`

### 2단계: Selection 렌더링 (WASM getSelectionRects + DOM 오버레이)

**목표**: 선택 영역을 파란색 반투명 사각형으로 시각화.

**`src/wasm_api.rs` 추가** — `getSelectionRects` WASM API:
```rust
#[wasm_bindgen(js_name = getSelectionRects)]
pub fn get_selection_rects(
    &self, section_idx: u32,
    start_para_idx: u32, start_char_offset: u32,
    end_para_idx: u32, end_char_offset: u32,
) -> Result<String, JsValue>

#[wasm_bindgen(js_name = getSelectionRectsInCell)]
pub fn get_selection_rects_in_cell(
    &self, section_idx: u32, parent_para_idx: u32, control_idx: u32, cell_idx: u32,
    start_cell_para_idx: u32, start_char_offset: u32,
    end_cell_para_idx: u32, end_char_offset: u32,
) -> Result<String, JsValue>
```

반환: `[{"pageIndex":N,"x":F,"y":F,"width":F,"height":F}, ...]`

알고리즘: 각 문단의 줄(LineSeg)을 순회하며, 선택 범위에 겹치는 줄마다 getCursorRect으로 좌/우 경계 X좌표를 구해 사각형 생성.

**`selection-renderer.ts` 신규 파일** — `caret-renderer.ts` 패턴 차용:
- `#scroll-content`에 `div.selection-layer` (z-index:5, pointer-events:none) 추가
- `render(rects, zoom)`: 각 rect를 div로 생성, `rgba(51,122,183,0.3)` 배경
- `clear()`: 모든 하이라이트 div 제거
- 페이지 오프셋 + 줌 보정: `caret-renderer.ts`의 위치 계산 로직 재사용

**`wasm-bridge.ts` 추가**: `getSelectionRects()`, `getSelectionRectsInCell()` 래퍼

**`input-handler.ts` 연동**: Shift+이동 후 `updateSelection()` 호출 → WASM에서 rect 획득 → SelectionRenderer 렌더

### 3단계: 클립보드 연동 + 선택 영역 편집

**목표**: Ctrl+C/X/V 구현, 선택 영역 삭제/대체.

**선택 영역 삭제 (WASM 추가)**:

`src/wasm_api.rs`에 `deleteRange` API 추가:
```rust
#[wasm_bindgen(js_name = deleteRange)]
pub fn delete_range(
    &mut self, section_idx: u32,
    start_para_idx: u32, start_char_offset: u32,
    end_para_idx: u32, end_char_offset: u32,
) -> Result<String, JsValue>
// 반환: {"ok":true,"paraIdx":N,"charOffset":N}

#[wasm_bindgen(js_name = deleteRangeInCell)]
pub fn delete_range_in_cell(
    &mut self, section_idx: u32, parent_para_idx: u32, control_idx: u32, cell_idx: u32,
    start_cell_para_idx: u32, start_char_offset: u32,
    end_cell_para_idx: u32, end_char_offset: u32,
) -> Result<String, JsValue>
```

다중 문단 삭제 로직을 Rust에서 처리 (moveVertical 경험 반영 — 복잡한 문단 조작은 WASM 단일 호출이 안정적):
1. 마지막 문단의 앞부분 삭제 (0..endOffset)
2. 중간 문단 역순 삭제 (mergeParagraph 반복)
3. 첫 문단의 뒷부분 삭제 (startOffset..paraLen)
4. 첫-마지막 문단 병합

**`command.ts` 추가** — `DeleteSelectionCommand`:
```typescript
class DeleteSelectionCommand implements EditCommand {
  type = 'deleteSelection';
  // execute: wasm.deleteRange() 호출, 삭제 전 copySelection으로 텍스트 보존
  // undo: 보존된 텍스트로 pasteInternal 호출
}
```

**`wasm-bridge.ts` 추가**: 기존 WASM 클립보드 API 래퍼 ~10개:
- `copySelection`, `copySelectionInCell`
- `pasteInternal`, `pasteInternalInCell`
- `exportSelectionHtml`, `exportSelectionInCellHtml`
- `hasInternalClipboard`, `getClipboardText`, `clearClipboard`
- `deleteRange`, `deleteRangeInCell`

**`input-handler.ts` 수정**:

Copy (Ctrl+C):
```
handleCopy(): 선택 있으면 → wasm.copySelection() → navigator.clipboard.write(plainText + html)
  실패 시 fallback: textarea.value = text; textarea.select(); document.execCommand('copy')
```

Cut (Ctrl+X):
```
handleCut(): handleCopy() → deleteSelection()
```

Paste (Ctrl+V):
```
handlePaste(): 선택 있으면 먼저 삭제 → wasm.pasteInternal() 시도 →
  외부 텍스트면 InsertText/SplitParagraph 순차 실행
```

선택 영역 편집:
- Backspace/Delete + 선택: `deleteSelection()` 호출
- 문자 입력 + 선택: 선택 삭제 → 입력
- IME 시작 + 선택: 선택 삭제 → 조합 시작
- Enter + 선택: 선택 삭제 → splitParagraph

paste 이벤트 리스너 추가 (textarea에):
```typescript
textarea.addEventListener('paste', (e) => { e.preventDefault(); handlePaste(e.clipboardData); })
textarea.addEventListener('copy', (e) => { e.preventDefault(); handleCopy(); })
textarea.addEventListener('cut', (e) => { e.preventDefault(); handleCut(); })
```

---

## 수정 파일 목록

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `src/wasm_api.rs` | `getSelectionRects` + `deleteRange` WASM API 2쌍 + 네이티브 구현 | +200줄 |
| `rhwp-studio/src/core/types.ts` | `SelectionRect` 인터페이스 | +7줄 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 클립보드/선택 API 래퍼 12개 | +80줄 |
| `rhwp-studio/src/engine/cursor.ts` | anchor/focus 선택 모델, comparePositions | +80줄 |
| `rhwp-studio/src/engine/selection-renderer.ts` | 선택 영역 하이라이트 (신규) | +80줄 |
| `rhwp-studio/src/engine/command.ts` | DeleteSelectionCommand | +60줄 |
| `rhwp-studio/src/engine/input-handler.ts` | Shift+Arrow, Ctrl+C/X/V/A, 선택편집 | +150줄 |

## 검증 방법

1. Docker WASM 빌드: `docker compose --env-file /dev/null run --rm wasm`
2. Vite 빌드: `npm run build`
3. 런타임 테스트:
   - Shift+Arrow로 텍스트 선택 → 파란색 하이라이트 표시
   - Shift+Home/End, Ctrl+Shift+Home/End
   - Ctrl+C → 외부 에디터에 붙여넣기 확인
   - Ctrl+V → 외부 텍스트 붙여넣기 (단일/다중 줄)
   - Ctrl+X → 선택 텍스트 잘라내기
   - 선택 + Backspace/Delete → 선택 삭제
   - 선택 + 문자 입력 → 선택 대체
   - 선택 + Enter → 선택 삭제 후 문단 분할
   - Ctrl+A → 전체 선택
   - Undo/Redo가 선택 삭제/붙여넣기를 올바르게 복원
   - 표 셀 내에서 동일한 동작 확인
