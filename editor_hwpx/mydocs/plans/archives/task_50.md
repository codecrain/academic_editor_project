# 타스크 50 수행계획서

## 타스크: 커서 이동 확장 + 셀 탐색

**백로그**: B-309 (MovePos 28+ 이동 타입) + B-903 (셀 탐색) + B-308 (문서 로딩 시 캐럿 자동 배치)

## 1. 현황 분석

### 현재 구현 상태

**CursorState** (`engine/cursor.ts`)는 다음만 지원:
- `moveTo(pos)` — hitTest 결과로 이동
- `moveHorizontal(delta)` — ArrowLeft/Right (본문 + 셀 내부)
  - 본문: 문단 경계 넘기 (이전/다음 문단)
  - 셀: 셀 내 문단 경계만 (셀 밖 이동 불가)
- `updateRect()` — WASM getCursorRect / getCursorRectInCell

**InputHandler** (`engine/input-handler.ts`)의 키 처리:
- ArrowLeft/Right → `cursor.moveHorizontal(±1)`
- ArrowUp, ArrowDown, Home, End, Tab → **미구현** (주석만 존재, 167행)

### 필요한 이동 타입 (설계서 §6.4)

| 키 | 이동 타입 | 우선순위 |
|----|-----------|----------|
| **ArrowUp** | 윗줄 이동 (X 좌표 유지) | 높음 |
| **ArrowDown** | 아랫줄 이동 (X 좌표 유지) | 높음 |
| **Home** | 줄 시작 | 높음 |
| **End** | 줄 끝 | 높음 |
| **Ctrl+Home** | 문서 시작 (sec=0, para=0, offset=0) | 높음 |
| **Ctrl+End** | 문서 끝 (마지막 문단 끝) | 높음 |
| **Tab** (셀 내부) | 다음 셀 | 높음 |
| **Shift+Tab** (셀 내부) | 이전 셀 | 높음 |
| **Ctrl+Left** | 이전 단어 경계 | 중간 |
| **Ctrl+Right** | 다음 단어 경계 | 중간 |

**범위 제한**: 설계서의 28+ 이동 타입 중 사용자 키보드로 직접 접근하는 핵심 이동만 구현한다. PageUp/Down, Ctrl+↑/↓(문단 이동), ControlContext 전환 등은 향후 확장한다.

## 2. 필요한 WASM API 분석

### 기존 API (사용 가능)
- `getParagraphCount(sec)` / `getParagraphLength(sec, para)` — 문단 경계 판단
- `getCellParagraphCount(sec, ppi, ci, cei)` / `getCellParagraphLength(...)` — 셀 문단 경계
- `getCursorRect(sec, para, offset)` / `getCursorRectInCell(...)` — 캐럿 좌표
- `hitTest(page, x, y)` — 좌표 → DocumentPosition
- `getTextRange(sec, para, offset, count)` / `getTextInCell(...)` — 단어 경계 탐색용 텍스트 읽기

### 신규 API 필요

#### (1) `getLineInfo(sec, para, charOffset)` — 줄 정보 조회

현재 커서가 속한 줄의 정보를 반환한다. ArrowUp/Down, Home/End 구현의 핵심 API.

```typescript
interface LineInfo {
  lineIndex: number;      // 문단 내 줄 인덱스
  lineCount: number;      // 문단 전체 줄 수
  charStart: number;      // 줄의 시작 char offset
  charEnd: number;        // 줄의 끝 char offset
}
```

**Rust 구현 근거**: `LineSeg` 구조체에 `text_start` (UTF-16)가 있고, `char_offsets[]`로 char index 변환 가능. 문단의 `line_segs` 배열을 순회하여 해당 charOffset이 속한 줄을 찾는다.

#### (2) `getLineInfoInCell(sec, ppi, ci, cei, cpi, charOffset)` — 셀 내 줄 정보

셀 내부 문단의 줄 정보. 구현 방식은 본문과 동일하되 셀 문단 참조 경로가 다르다.

#### (3) `getCaretPosition()` — 문서 저장된 캐럿 위치 조회

```typescript
interface CaretPosition {
  sectionIndex: number;    // doc_properties.caret_list_id
  paragraphIndex: number;  // doc_properties.caret_para_id (UTF-16 → char index 변환 필요)
  charOffset: number;      // doc_properties.caret_char_pos (UTF-16 → char index 변환 필요)
}
```

**Rust 구현 근거**: `doc_properties.caret_list_id`, `caret_para_id`, `caret_char_pos`에 이미 저장됨. 단, `caret_para_id`는 문단 ID이므로 인덱스 변환이 필요하고, `caret_char_pos`는 UTF-16 단위이므로 char index로 변환 필요.

#### (4) `getCellIndex(sec, ppi, ci, row, col)` — 셀 좌표 → 셀 인덱스 변환

Tab/Shift+Tab 셀 이동 시 행/열 좌표를 셀 배열 인덱스로 변환.

#### (5) `getTableDimensions(sec, ppi, ci)` — 표 행/열 수 조회

```typescript
interface TableDimensions {
  rowCount: number;
  colCount: number;
  cellCount: number;
}
```

## 3. 구현 전략

### 줄 단위 이동 (ArrowUp/Down)

설계서 §6.4.4의 **preferred X 좌표** 패턴을 따른다:
1. 수직 이동 시작 시 현재 캐럿 X 좌표를 `preferredX`에 저장
2. 목표 줄에서 `preferredX`에 가장 가까운 문자 위치를 `hitTest`로 계산
3. 수평 이동/클릭/편집 시 `preferredX` 초기화

**간소화**: 설계서의 `hitTestLineX`(줄 내 X 좌표 이진 탐색)는 복잡하므로, 현재 구현에서는 WASM `hitTest`를 활용한다. 목표 줄의 Y 좌표와 preferredX로 hitTest를 호출하면 WASM이 정확한 문자 위치를 반환한다.

### Home/End (줄 시작/끝)

`getLineInfo`로 현재 줄의 `charStart`/`charEnd`를 얻어 이동.

### Ctrl+Home/End (문서 시작/끝)

- Ctrl+Home: `{ sectionIndex: 0, paragraphIndex: 0, charOffset: 0 }`
- Ctrl+End: 마지막 구역의 마지막 문단 끝 (`getParagraphCount` → `getParagraphLength`)

### Tab/Shift+Tab 셀 이동

간소화된 셀 이동을 구현한다:
- 현재 셀의 행/열 정보를 WASM에서 조회
- 다음/이전 셀 인덱스를 계산하여 이동
- 마지막 셀에서 Tab → 표 밖 다음 위치로 이동 (새 행 삽입은 향후)

### 문서 로딩 시 캐럿 자동 배치

`getCaretPosition()` API로 HWP 파일에 저장된 마지막 캐럿 위치를 읽어 복원.

## 4. 변경 대상 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/wasm_api.rs` | getLineInfo, getLineInfoInCell, getCaretPosition, getCellIndex, getTableDimensions WASM API 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 신규 API 5종 TypeScript 래퍼 추가 |
| `rhwp-studio/src/core/types.ts` | LineInfo, TableDimensions, CaretPosition 인터페이스 추가 |
| `rhwp-studio/src/engine/cursor.ts` | moveVertical, moveToLineStart/End, moveToDocStart/End, moveToCellNext/Prev 메서드 추가, preferredX 필드 추가 |
| `rhwp-studio/src/engine/input-handler.ts` | ArrowUp/Down, Home/End, Ctrl+Home/End, Tab/Shift+Tab 키 처리 추가 |
| `rhwp-studio/src/app.ts` | 문서 로딩 완료 시 캐럿 자동 배치 호출 |

## 5. 위험 요소 및 대응

| 위험 | 대응 |
|------|------|
| LineSeg의 text_start가 UTF-16 단위 → char index 변환 필요 | 기존 `char_offsets[]` 변환 로직 활용 (wasm_api.rs에 이미 패턴 존재) |
| 셀 문단의 line_segs가 reflow 전이면 부정확 | reflow_cell_paragraph() 호출 후 line_segs 참조 (기존 패턴 따름) |
| caret_para_id가 문단 ID(순서 아님)일 가능성 | HWP 스펙 확인 후 인덱스/ID 변환 구현 |
| hitTest의 Y 좌표 계산이 줄 이동에 정확하지 않을 수 있음 | getLineInfo + hitTest 조합으로 정확한 Y 좌표 확보 |
