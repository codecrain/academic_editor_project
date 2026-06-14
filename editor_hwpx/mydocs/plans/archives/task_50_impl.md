# 타스크 50 구현 계획서

## 타스크: 커서 이동 확장 + 셀 탐색

**단계 구성**: 5단계

---

## 1단계: WASM API 추가 (Rust)

### 목표
커서 이동에 필요한 WASM API 5종을 Rust에 구현한다.

### 구현 내용

#### (1) `getLineInfo(sec, para, charOffset)` → JSON
문단 내 줄 정보를 반환한다. LineSeg의 `text_start` (UTF-16)를 `char_offsets[]`로 char index로 변환하여 각 줄의 시작/끝 char offset을 계산한다.

```rust
// 반환 JSON:
{ "lineIndex": 0, "lineCount": 3, "charStart": 0, "charEnd": 15 }
```

**구현 로직**:
1. `para.line_segs` 배열을 순회
2. 각 LineSeg의 `text_start` (UTF-16) → `utf16_pos_to_char_idx()` 사용하여 char index로 변환
3. 입력된 `charOffset`이 속한 줄 인덱스 결정
4. 해당 줄의 charStart, charEnd (다음 줄 charStart 또는 문단 끝) 반환

#### (2) `getLineInfoInCell(sec, ppi, ci, cei, cpi, charOffset)` → JSON
셀 내부 문단의 줄 정보. `get_cell_paragraph_ref()`로 문단 참조를 얻어 (1)과 동일한 로직 적용.

#### (3) `getCaretPosition()` → JSON
문서에 저장된 캐럿 위치를 char index로 변환하여 반환한다.

```rust
// 반환 JSON:
{ "sectionIndex": 0, "paragraphIndex": 2, "charOffset": 5 }
```

**구현 로직**:
1. `doc_properties.caret_list_id` → sectionIndex
2. `doc_properties.caret_para_id` → paragraphIndex (값 검증)
3. `doc_properties.caret_char_pos` (UTF-16) → `utf16_pos_to_char_idx()` → charOffset
4. 범위 초과 시 안전한 기본값 (0, 0, 0) 반환

#### (4) `getTableDimensions(sec, ppi, ci)` → JSON
표의 행/열/셀 수를 반환한다.

```rust
// 반환 JSON:
{ "rowCount": 3, "colCount": 4, "cellCount": 12 }
```

**구현 로직**: `get_table_ref()`로 표 참조를 얻어 `table.row_count`, `table.col_count`, `table.cells.len()` 반환.

#### (5) `getCellInfo(sec, ppi, ci, cellIdx)` → JSON
특정 셀의 행/열 정보를 반환한다.

```rust
// 반환 JSON:
{ "row": 1, "col": 2, "rowSpan": 1, "colSpan": 1 }
```

### 검증
- `cargo test` 통과
- `wasm-pack build` 성공

---

## 2단계: TypeScript 래퍼 + 타입 정의

### 목표
신규 WASM API의 TypeScript 래퍼를 `wasm-bridge.ts`에 추가하고, 반환 타입을 `types.ts`에 정의한다.

### 구현 내용

#### `types.ts` 추가
```typescript
/** WASM getLineInfo() 반환 타입 */
export interface LineInfo {
  lineIndex: number;
  lineCount: number;
  charStart: number;
  charEnd: number;
}

/** WASM getTableDimensions() 반환 타입 */
export interface TableDimensions {
  rowCount: number;
  colCount: number;
  cellCount: number;
}

/** WASM getCellInfo() 반환 타입 */
export interface CellInfo {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}
```

#### `wasm-bridge.ts` 추가 (5개 메서드)
```typescript
getLineInfo(sec, para, charOffset): LineInfo
getLineInfoInCell(sec, ppi, ci, cei, cpi, charOffset): LineInfo
getCaretPosition(): DocumentPosition | null
getTableDimensions(sec, ppi, ci): TableDimensions
getCellInfo(sec, ppi, ci, cellIdx): CellInfo
```

### 검증
- `tsc --noEmit` 통과

---

## 3단계: CursorState 이동 메서드 확장

### 목표
`cursor.ts`에 수직 이동, Home/End, 문서 시작/끝, 셀 탐색 메서드를 추가한다.

### 구현 내용

#### preferredX 필드
```typescript
private preferredX: number | null = null;

/** 수평 이동/클릭/편집 시 preferredX 초기화 */
resetPreferredX(): void { this.preferredX = null; }
```

#### 수직 이동: `moveVertical(delta: number)`
- **본문**:
  1. `getLineInfo(sec, para, charOffset)` → 현재 줄 정보
  2. preferredX 설정 (최초 수직 이동 시 현재 getCursorRect().x 저장)
  3. 같은 문단 내 다음/이전 줄이 있으면 → 해당 줄 Y 좌표 + preferredX로 hitTest
  4. 문단 경계 넘기 → 다음/이전 문단의 첫/마지막 줄로 hitTest
- **셀 내부**: 동일 로직, `getLineInfoInCell` 사용

**hitTest 활용 전략**: 목표 줄의 Y 좌표를 계산하려면 getCursorRect로 현재 줄 상단 Y를 얻고, 줄 높이만큼 가감한다. 이 좌표와 preferredX를 hitTest에 전달하면 WASM이 정확한 문자 위치를 반환한다.

#### Home/End: `moveToLineStart()` / `moveToLineEnd()`
- `getLineInfo` → charStart / charEnd로 이동

#### 문서 시작/끝: `moveToDocumentStart()` / `moveToDocumentEnd()`
- 시작: `{ sec: 0, para: 0, charOffset: 0 }`
- 끝: `getParagraphCount(sec-1)` → `getParagraphLength(sec, lastPara)` → 마지막 위치

#### 셀 탐색: `moveToCellNext()` / `moveToCellPrev()`
- `getTableDimensions()` + `getCellInfo()` → 현재 셀의 행/열 확인
- 다음/이전 셀 인덱스 계산 (행 끝 → 다음 행 첫 셀, 표 끝 → 표 밖)
- 새 셀의 첫 위치로 moveTo

### 검증
- `tsc --noEmit` 통과

---

## 4단계: InputHandler 키 처리 + 문서 로딩 캐럿 배치

### 목표
키보드 이벤트를 새 이동 메서드에 연결하고, 문서 로딩 시 캐럿 자동 배치를 구현한다.

### 구현 내용

#### InputHandler.onKeyDown() 확장

```typescript
case 'ArrowUp':
  e.preventDefault();
  this.cursor.moveVertical(-1);
  this.updateCaret();
  break;
case 'ArrowDown':
  e.preventDefault();
  this.cursor.moveVertical(1);
  this.updateCaret();
  break;
case 'Home':
  e.preventDefault();
  this.cursor.moveToLineStart();
  this.updateCaret();
  break;
case 'End':
  e.preventDefault();
  this.cursor.moveToLineEnd();
  this.updateCaret();
  break;
case 'Tab':
  e.preventDefault();
  if (this.cursor.isInCell()) {
    if (e.shiftKey) this.cursor.moveToCellPrev();
    else this.cursor.moveToCellNext();
    this.updateCaret();
  }
  break;
```

#### handleCtrlKey() 확장
```typescript
case 'home':
  e.preventDefault();
  this.cursor.moveToDocumentStart();
  this.updateCaret();
  break;
case 'end':
  e.preventDefault();
  this.cursor.moveToDocumentEnd();
  this.updateCaret();
  break;
```

#### preferredX 초기화 연동
수평 이동, 클릭, 편집 시 `cursor.resetPreferredX()` 호출.

#### 문서 로딩 캐럿 배치
`InputHandler`에 `activateWithCaretPosition()` 메서드 추가:
1. `wasm.getCaretPosition()` 호출
2. 유효한 위치면 → `cursor.moveTo()` + `caret.show()` + `textarea.focus()`
3. 실패 시 문서 시작 위치 (0, 0, 0)에 배치

`main.ts`의 `loadFile()` 마지막에 호출.

### 검증
- `tsc --noEmit` + `vite build` 통과

---

## 5단계: 빌드 검증 + 런타임 테스트

### 빌드 검증
| 항목 | 명령 |
|------|------|
| Rust 테스트 | `docker compose run --rm test` |
| WASM 빌드 | `docker compose run --rm wasm` |
| TypeScript 컴파일 | `tsc --noEmit` |
| Vite 번들 | `vite build` |

### 브라우저 런타임 테스트 항목 (12개)

| # | 테스트 | 검증 내용 |
|---|--------|-----------|
| 1 | ArrowDown 줄 이동 | 여러 줄 문단에서 ↓ 키로 아래 줄 이동 |
| 2 | ArrowUp 줄 이동 | ↑ 키로 위 줄 이동, 문단 경계 넘기 |
| 3 | preferredX 유지 | 긴 줄 → 짧은 줄 → 긴 줄 이동 시 원래 X 좌표 복원 |
| 4 | Home 키 | 줄 시작으로 이동 |
| 5 | End 키 | 줄 끝으로 이동 |
| 6 | Ctrl+Home | 문서 시작 (0, 0, 0)으로 이동 |
| 7 | Ctrl+End | 문서 마지막 문단 끝으로 이동 |
| 8 | Tab 셀 이동 | 셀 내부에서 Tab으로 다음 셀 이동 |
| 9 | Shift+Tab 셀 이동 | Shift+Tab으로 이전 셀 이동 |
| 10 | 셀 내부 ArrowUp/Down | 셀 내 여러 줄에서 수직 이동 |
| 11 | 문서 로딩 캐럿 배치 | HWP 파일 열기 시 저장된 캐럿 위치에 캐럿 표시 |
| 12 | Undo 후 커서 이동 정상 | Ctrl+Z 후 ArrowUp/Down 동작 확인 |

### 최종 산출물
- 단계별 완료보고서 (`mydocs/working/task_50_step{1-5}.md`)
- 최종 결과보고서 (`mydocs/working/task_50_final.md`)
- 20260213.md 타스크 50 상태 → "완료"
