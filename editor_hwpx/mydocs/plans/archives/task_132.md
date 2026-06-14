# 타스크 132 수행계획서 — 표 만들기 대화상자

## 배경

### 현재 문제

rhwp-studio에서 메뉴 > 표 > "표 만들기" 항목이 존재하지만 stub 상태(`execute() { /* TODO */ }`)이다.
사용자가 새 표를 삽입할 방법이 없으며, WASM 측에도 `createTable` API가 없다.

### 한컴 웹기안기 참조

webhwp는 `TableCreateDialog`로 행/열 수와 크기를 지정하여 표를 생성한다.
rhwp에서도 동일한 기능을 제공해야 한다.

### 기존 인프라 현황

| 항목 | 상태 |
|------|------|
| Table 모델 (`src/model/table.rs`) | 완전 (Cell::new_empty, rebuild_grid 등) |
| 표 Paragraph 생성 패턴 | `inject_html_tables_to_section()` (wasm_api.rs:8560-8720)에 완전한 예시 존재 |
| WasmBridge 패턴 | `insertTableRow()` 등 JSON 반환 패턴 확립 |
| 대화상자 패턴 | CharShapeDialog (독립 클래스, onApply 콜백) 패턴 사용 가능 |
| 커맨드 패턴 | `table:create` stub이 `table.ts:18-19`에 이미 등록됨 |
| 메뉴 연결 | `index.html`에 `data-cmd="table:create"` 이미 존재 |

## 구현 단계 (4단계)

---

### 1단계: WASM API — `createTable`

**목적**: 커서 위치에 새 표를 생성하는 Rust 함수 추가

**파일**: `src/wasm_api.rs`

**공개 API** (wasm_bindgen):
```rust
#[wasm_bindgen(js_name = createTable)]
pub fn create_table(
    &mut self,
    section_idx: u32,
    para_idx: u32,
    char_offset: u32,
    row_count: u32,
    col_count: u32,
) -> Result<String, JsValue>
```

**내부 구현** (`create_table_native`):
1. PageDef에서 편집 영역 폭 계산: `page_width - margin_left - margin_right`
2. 열 균등 분배: `col_width = total_width / col_count`
3. 기본 행 높이: 1000 HWPUNIT
4. `row_count × col_count` 개의 `Cell::new_empty()` 생성
5. Table 구조체 생성 (기존 `inject_html_tables_to_section` 패턴 재사용):
   - `attr`: `0x082A2311` (treat_as_char 표준값)
   - `raw_ctrl_data`: CommonObjAttr 38바이트 (width, height, instance_id)
   - `raw_table_record_attr`: `0x04000006`
   - `padding`: 기본값 L:510 R:510 T:141 B:141
   - `border_fill_id`: DocInfo에서 실선 테두리 BorderFill 확보
6. Table을 포함하는 Paragraph 생성 (char_count=9, control_mask=0x800)
7. 커서 위치에 삽입:
   - `char_offset == 0`이고 빈 문단이면 → 해당 문단을 표 문단으로 교체
   - 그 외 → `split_paragraph_native()`로 문단 분할 후 표 문단 삽입
8. 표 아래에 빈 문단 추가 (HWP 표준 동작)
9. `rebuild_grid()` 호출
10. JSON 반환: `{"ok":true,"paraIdx":<N>,"controlIdx":0}`

**재사용할 기존 코드**:
- `Cell::new_empty()` (`src/model/table.rs:115`)
- `Table::rebuild_grid()` (`src/model/table.rs:184`)
- `inject_html_tables_to_section`의 raw_ctrl_data/table_attr/tbl_rec_attr 생성 패턴 (wasm_api.rs:8560-8720)
- `split_paragraph_native()` (wasm_api.rs:4454)

---

### 2단계: WasmBridge 메서드 추가

**목적**: JS에서 WASM `createTable`을 호출하는 타입 안전 래퍼

**파일**: `rhwp-studio/src/core/wasm-bridge.ts`

```typescript
createTable(sec: number, para: number, charOffset: number,
            rows: number, cols: number): { ok: boolean; paraIdx: number; controlIdx: number } {
  this.ensureDoc();
  return JSON.parse(this.doc.createTable(sec, para, charOffset, rows, cols));
}
```

---

### 3단계: 표 만들기 대화상자 UI

**목적**: 행/열 수를 입력받는 간단한 대화상자

**파일**: `rhwp-studio/src/ui/table-create-dialog.ts` (신규)

**UI 레이아웃** (한컴 스타일):
```
┌───────────────────────────┐
│ 표 만들기              [×]│
├───────────────────────────┤
│                           │
│  줄(행) 수:  [ 2 ]       │
│  칸(열) 수:  [ 3 ]       │
│                           │
├───────────────────────────┤
│           [만들기] [취소] │
└───────────────────────────┘
```

**구현**:
- CharShapeDialog 패턴 따름 (독립 클래스, build() → show() → hide())
- CSS: 기존 `.dialog-*` 클래스 재사용, 접두어 `tc-` (table-create)
- 줄 수: 1~256, 기본 2
- 칸 수: 1~256, 기본 3
- `onApply` 콜백: `(rows: number, cols: number) => void`
- Enter 키로 확인, Esc로 취소

---

### 4단계: 커맨드 연결 + 테스트

**목적**: `table:create` 커맨드에서 대화상자 호출 → WASM API 호출 → 렌더링 갱신

**파일 1**: `rhwp-studio/src/command/commands/table.ts` (라인 18-19)

```typescript
{ id: 'table:create', label: '표 만들기', icon: 'icon-table',
  canExecute: (ctx) => ctx.hasDocument && !ctx.inTable,
  execute(services) {
    const ih = services.getInputHandler();
    if (!ih) return;
    const pos = ih.getCursorPosition();
    const dialog = new TableCreateDialog();
    dialog.onApply = (rows, cols) => {
      try {
        const result = services.wasm.createTable(
          pos.sectionIndex, pos.paragraphIndex, pos.charOffset,
          rows, cols
        );
        if (result.ok) {
          services.eventBus.emit('document-changed');
        }
      } catch (e) {
        console.error('표 만들기 실패:', e);
      }
    };
    dialog.show();
  },
},
```

**파일 2**: 회귀 테스트 및 WASM 빌드 검증
- `docker compose run --rm test` — 571개 회귀 테스트 통과
- `docker compose run --rm wasm` — WASM 빌드 성공
- 브라우저에서 빈 문서 열기 → 표 만들기 → 2×3 표 생성 확인
- 저장 후 다시 열어 표가 보존되는지 확인

---

## 변경 파일 요약

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `src/wasm_api.rs` | `create_table` + `create_table_native` 추가 | ~120줄 |
| `rhwp-studio/src/core/wasm-bridge.ts` | `createTable()` 메서드 추가 | ~5줄 |
| `rhwp-studio/src/ui/table-create-dialog.ts` | 표 만들기 대화상자 (신규) | ~120줄 |
| `rhwp-studio/src/command/commands/table.ts` | `table:create` 구현 | ~15줄 |
| **합계** | | **~260줄** |

## 검증 방법

1. `docker compose run --rm test` — 571개 회귀 테스트 통과 확인
2. `docker compose run --rm wasm` — WASM 빌드 성공 확인
3. 브라우저에서 빈 문서 → 표 > 표 만들기 → 2×3 표 삽입 → 셀 내 텍스트 입력 확인
4. 표가 포함된 문서 저장(.hwp) 후 재로딩하여 표 보존 확인
5. 기존 문서의 텍스트 중간에서 표 삽입 → 문단 분할 + 표 삽입 정상 동작 확인
