# 타스크 157 구현계획서: 글상자 삽입 및 기본 편집

## 구현 단계 (4단계)

---

## 1단계: WASM API + Rust 백엔드

### 목표
글상자 생성/삭제/속성 조회·변경 API를 Rust 백엔드에 구현하고 WASM으로 노출한다.

### 변경 파일

#### 1-1. `src/wasm_api/commands/object_ops.rs` — 핵심 CRUD 함수

**`create_shape_control_native()`** — 글상자 생성
- `create_table_native()` (280행) 패턴을 그대로 따름
- 입력: `section_idx, para_idx, char_offset, width, height, horz_offset, vert_offset, wrap_type`
- 생성할 구조:
  ```
  Control::Shape(Box::new(ShapeObject::Rectangle(RectangleShape {
      common: CommonObjAttr {
          width, height,
          horizontal_offset: horz_offset,
          vertical_offset: vert_offset,
          text_wrap: wrap_type,
          attr: 0x0A0211,  // treat_as_char 기본값
          ...Default::default()
      },
      drawing: DrawingObjAttr {
          shape_attr: ShapeComponentAttr {
              current_width: width,
              current_height: height,
              original_width: width,
              original_height: height,
              render_sx: 1.0, render_sy: 1.0,
              ..Default::default()
          },
          border_line: ShapeBorderLine {
              color: ColorRef(0),  // 검정
              width: 283,          // 0.4mm (기본 테두리)
              ..Default::default()
          },
          fill: Fill::default(),   // 채우기 없음
          text_box: Some(TextBox {
              vertical_align: VerticalAlign::Top,
              margin_left: 510, margin_right: 510,  // 1.8mm
              margin_top: 141, margin_bottom: 141,   // 0.5mm
              max_width: width,
              paragraphs: vec![빈_문단],              // 빈 문단 1개
              ..Default::default()
          }),
      },
      round_rate: 0,
      x_coords: [0, width as i32, width as i32, 0],
      y_coords: [0, 0, height as i32, height as i32],
  })))
  ```
- 문단 생성: `create_table_native()` 동일 패턴 (char_count=9, segment_width=0)
- 삽입 후: `recompose_section()`, `paginate_if_needed()`
- 반환: `{"ok":true,"paraIdx":N,"controlIdx":0}`

**`get_shape_properties_native()`** — 속성 조회
- `get_picture_properties_native()` 패턴
- Control::Shape 매칭 → CommonObjAttr + DrawingObjAttr + TextBox 필드를 JSON 반환
- JSON 필드:
  ```json
  {
    "width": u32, "height": u32,
    "treatAsChar": bool,
    "vertRelTo": str, "vertAlign": str,
    "horzRelTo": str, "horzAlign": str,
    "vertOffset": u32, "horzOffset": u32,
    "textWrap": str,
    "borderColor": u32, "borderWidth": i32,
    "tbMarginLeft": i16, "tbMarginRight": i16,
    "tbMarginTop": i16, "tbMarginBottom": i16,
    "tbVerticalAlign": str,
    "description": str
  }
  ```

**`set_shape_properties_native()`** — 속성 변경
- `set_picture_properties_native()` 패턴
- JSON 파싱 → CommonObjAttr/DrawingObjAttr/TextBox 필드 업데이트
- `recompose_section()`, `paginate_if_needed()`

**`delete_shape_control_native()`** — 삭제
- `delete_picture_control_native()` 패턴
- 컨트롤 제거 + 빈 문단 정리

#### 1-2. `src/wasm_api.rs` — WASM 바인딩

```rust
#[wasm_bindgen(js_name = createShapeControl)]
pub fn create_shape_control(&mut self, json: &str) -> Result<String, JsValue>

#[wasm_bindgen(js_name = getShapeProperties)]
pub fn get_shape_properties(&self, sec: u32, ppi: u32, ci: u32) -> Result<String, JsValue>

#[wasm_bindgen(js_name = setShapeProperties)]
pub fn set_shape_properties(&mut self, sec: u32, ppi: u32, ci: u32, json: &str) -> Result<String, JsValue>

#[wasm_bindgen(js_name = deleteShapeControl)]
pub fn delete_shape_control(&mut self, sec: u32, ppi: u32, ci: u32) -> Result<String, JsValue>
```

#### 1-3. `src/wasm_api/queries/rendering.rs` — getPageControlLayout 확장

- `get_page_control_layout_native()` — Shape 노드 수집 추가
- 기존: Table, Image 만 수집
- 추가: Shape(Rectangle/Ellipse/...) 노드도 수집
- JSON 출력에 `"type": "shape"` 추가

### 검증
- `docker compose --env-file .env.docker run --rm test` — 전체 테스트 통과
- `docker compose --env-file .env.docker run --rm wasm` — WASM 빌드 성공

---

## 2단계: 글상자 선택/이동/크기조절 (UI)

### 목표
기존 그림 선택/이동/크기조절 패턴을 글상자(shape)에 확장한다.

### 변경 파일

#### 2-1. `rhwp-studio/src/engine/input-handler-picture.ts` — shape hit-test 추가

**`findShapeAtClick()`** 신규 — 그림과 동일 패턴
```typescript
export function findShapeAtClick(this: any,
  pageIdx: number, pageX: number, pageY: number,
): { sec: number; ppi: number; ci: number } | null {
  const layout = this.wasm.getPageControlLayout(pageIdx);
  for (const ctrl of layout.controls) {
    if (ctrl.type !== 'shape') continue;
    if (pageX >= ctrl.x && pageX <= ctrl.x + ctrl.w &&
        pageY >= ctrl.y && pageY <= ctrl.y + ctrl.h) {
      return { sec: ctrl.secIdx, ppi: ctrl.paraIdx, ci: ctrl.controlIdx };
    }
  }
  return null;
}
```

**`findShapeBbox()`** 신규 — bbox 조회

#### 2-2. `rhwp-studio/src/engine/cursor.ts` — shape 선택 모드

그림 선택 모드와 동일한 패턴으로 shape 선택 모드 추가:
```typescript
private _shapeObjectSelected = false;
private selectedShapeRef: { sec: number; ppi: number; ci: number } | null = null;

enterShapeObjectSelectionDirect(sec, ppi, ci): void
exitShapeObjectSelection(): void
isInShapeObjectSelection(): boolean
getSelectedShapeRef(): { sec; ppi; ci } | null
moveOutOfSelectedShape(): void
```

#### 2-3. `rhwp-studio/src/engine/input-handler-mouse.ts` — 이벤트 라우팅

onClick에서:
1. shape 선택 모드 중 클릭 → 핸들 감지 → 리사이즈 드래그 / 본체 → 이동 드래그
2. 일반 클릭에서 shape hit → shape 선택 모드 진입
3. shape 더블클릭 → 글상자 내부 커서 진입 (enterTextBox)

onMouseMove에서:
- shape 선택 모드 → 핸들/본체 커서 변경
- 이동/크기조절 드래그 업데이트

onMouseUp에서:
- 이동/크기조절 드래그 완료

#### 2-4. `rhwp-studio/src/engine/command.ts` — Undo/Redo 커맨드

```typescript
export class MoveShapeCommand implements EditCommand {
  // MovePictureCommand와 동일 패턴
  // getShapeProperties/setShapeProperties 사용
}

export class ResizeShapeCommand implements EditCommand {
  // 리사이즈용 (origWidth/origHeight, newWidth/newHeight)
}
```

#### 2-5. `rhwp-studio/src/engine/input-handler-keyboard.ts` — 키보드

- shape 선택 모드에서 Delete/Backspace → 삭제
- Enter → 글상자 내부 진입
- Shift+Esc → 글상자 내부에서 선택 모드로 탈출 (기존 exitTextBox 활용)
- Shift+방향키 → 1mm 크기 변경

### 검증
- WASM 빌드
- 기존 글상자 HWP 파일 열기 → 클릭 선택 → 핸들 표시
- 드래그 이동/크기조절 → Undo/Redo
- 더블클릭 → 텍스트 편집 → Shift+Esc 탈출

---

## 3단계: 글상자 생성 UI (마우스 드래그 + 단축키)

### 목표
사용자가 메뉴/도구상자에서 글상자 모드를 활성화하고, 마우스 드래그로 영역을 지정하여 새 글상자를 생성한다.

### 변경 파일

#### 3-1. `rhwp-studio/src/command/commands/insert.ts` — stub 교체

```typescript
{
  id: 'insert:textbox',
  label: '글상자',
  icon: 'icon-textbox',
  canExecute: (ctx) => ctx.hasDocument,
  execute(services) {
    const ih = services.getInputHandler();
    if (!ih) return;
    ih.enterTextboxCreationMode();
  },
},
```

#### 3-2. `rhwp-studio/src/engine/input-handler-mouse.ts` — 생성 드래그 모드

**`enterTextboxCreationMode()`** — 생성 모드 진입
- `isTextboxCreationMode = true`
- 커서를 십자(+)로 변경: `container.style.cursor = 'crosshair'`

**onMouseDown** (생성 모드):
- 시작점 기록 (`creationStartPageX/Y`)
- 드래그 시작

**onMouseMove** (생성 모드):
- 사각형 프리뷰 렌더링 (TableObjectRenderer 재사용)

**onMouseUp** (생성 모드):
- 영역 크기 계산 (px → HWPUNIT)
- 최소 크기 확인 (30mm × 30mm 미만이면 30mm × 30mm로)
- `wasm.createShapeControl()` 호출
- 생성된 글상자 내부로 커서 진입
- `eventBus.emit('document-changed')`

#### 3-3. `rhwp-studio/src/engine/input-handler-keyboard.ts` — 단축키

생성 모드에서 키보드 입력 감지:
| 키 | 동작 |
|---|---|
| Esc | 생성 모드 취소 |
| F/Enter | 기본 배치로 30mm×30mm 글상자 삽입 |
| D | 글자처럼취급으로 삽입 |
| S | 어울림/문단으로 삽입 |
| A | 어울림/쪽으로 삽입 |
| V | 어울림/종이로 삽입 |
| C | 자리차지/문단으로 삽입 |
| X | 자리차지/쪽으로 삽입 |
| Z | 자리차지/종이로 삽입 |

### 검증
- 메뉴에서 글상자 클릭 → 십자 커서
- 드래그로 영역 지정 → 글상자 생성 + 내부 커서
- 텍스트 입력 → 저장 → 재열기
- 단축키(D/S/A) 테스트

---

## 4단계: 개체 속성 대화상자 — 글상자 탭

### 목표
기존 개체 속성 대화상자(picture-props-dialog.ts)에 글상자 탭을 추가하여 여백/세로정렬/한줄입력을 설정한다.

### 변경 파일

#### 4-1. `rhwp-studio/src/ui/picture-props-dialog.ts` — 글상자 탭 추가

기존 대화상자를 shape에도 사용할 수 있도록 확장:
- 기본 탭: 기존 크기/위치/배치방식 (Picture와 공유)
- **글상자 탭** (신규):
  - 여백: 왼쪽/오른쪽/위쪽/아래쪽 (mm 입력)
  - 세로 정렬: 위/가운데/아래 (아이콘 버튼 3개)
  - 한 줄로 입력: 체크박스

#### 4-2. CSS 추가

글상자 탭 스타일:
- 접두어: `tb-` (글상자 속성)
- 레이아웃: 기존 속성 탭과 동일한 그리드 패턴

#### 4-3. `rhwp-studio/src/command/commands/insert.ts` — 속성 메뉴 연결

shape 선택 모드에서 개체 속성 메뉴:
```typescript
{
  id: 'insert:shape-props',
  label: '개체 속성',
  canExecute: (ctx) => ctx.inShapeObjectSelection,
  execute(services) {
    const ref = ih.getSelectedShapeRef();
    picturePropsDialog.openForShape(ref.sec, ref.ppi, ref.ci);
  },
},
```

### 검증
- 글상자 선택 → 개체 속성 → 글상자 탭
- 여백 변경 → 확인 → 렌더링 반영
- 세로 정렬 변경 → 확인 → 텍스트 위치 변경
- 한 줄로 입력 → 텍스트가 줄 바꿈 없이 한 줄 유지

---

## 핵심 설계 결정

| 결정 | 근거 |
|------|------|
| Picture 패턴 그대로 재사용 | 검증된 아키텍처, 일관성 유지 |
| shape/picture 선택 모드 분리 | 각각 다른 속성 API 사용, 향후 확장 용이 |
| TableObjectRenderer 공유 | 핸들 렌더링은 개체 종류와 무관 |
| 글상자 탭은 기존 대화상자에 추가 | 별도 대화상자 불필요, 기본 탭 공유 |
| 기본 테두리 검정 0.4mm | 한컴 HWP 기본값과 동일 |
| 기본 여백 1.8mm/0.5mm | 한컴 HWP 글상자 기본 여백 |
