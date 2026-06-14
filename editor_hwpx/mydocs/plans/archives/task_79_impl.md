# 타스크 79 구현계획서: 표 투명선 보여주기

## 구현 개요

문단 부호 토글(`show_paragraph_marks`)과 동일한 패턴으로 투명선 토글을 구현한다. 단, 문단 부호는 렌더러(Canvas/SVG)에서 처리하지만 투명선은 **레이아웃 엔진**에서 Line 노드를 생성해야 하므로 `LayoutEngine`에 플래그를 추가한다.

---

## 1단계: WASM API 플래그 및 메서드 추가

**파일**: `src/wasm_api.rs`

### 1-1. HwpDocument에 플래그 추가

```rust
// 기존 (101행)
show_paragraph_marks: bool,
// 추가
show_transparent_borders: bool,
```

초기값 `false` (125행 부근, 기존 패턴과 동일)

### 1-2. WASM 메서드 추가

```rust
#[wasm_bindgen(js_name = setShowTransparentBorders)]
pub fn set_show_transparent_borders(&mut self, enabled: bool) {
    self.show_transparent_borders = enabled;
}
```

### 1-3. build_page_tree() 호출 전 LayoutEngine에 플래그 전달

`render_page_to_canvas()` (177행 부근)와 기타 렌더링 경로에서:

```rust
self.layout_engine.show_transparent_borders = self.show_transparent_borders;
let tree = self.build_page_tree(page_num)?;
```

**규모**: ~10줄

---

## 2단계: 레이아웃 엔진 - 투명 테두리 렌더링

**파일**: `src/renderer/layout.rs`

### 2-1. LayoutEngine에 플래그 추가

```rust
// 기존 (141-148행)
pub struct LayoutEngine {
    dpi: f64,
    auto_counter: std::cell::RefCell<AutoNumberCounter>,
}

// 추가
pub struct LayoutEngine {
    dpi: f64,
    auto_counter: std::cell::RefCell<AutoNumberCounter>,
    pub show_transparent_borders: bool,
}
```

초기값 `false` (new() 메서드에 추가)

### 2-2. layout_table()에서 투명 테두리 렌더링 호출

`render_edge_borders()` 호출 (1654행 부근) 직후:

```rust
// 기존
table_node.children.extend(render_edge_borders(
    tree, &h_edges, &v_edges, &col_x, &row_y, table_x, table_y,
));

// 추가
if self.show_transparent_borders {
    table_node.children.extend(render_transparent_borders(
        tree, &h_edges, &v_edges, &col_x, &row_y, table_x, table_y,
    ));
}
```

### 2-3. render_transparent_borders() 함수 추가

엣지 그리드의 `None` 슬롯(투명 테두리)에 대해 빨간색 점선 Line 노드를 생성한다.

```rust
fn render_transparent_borders(
    tree: &mut PageRenderTree,
    h_edges: &[Vec<Option<BorderLine>>],
    v_edges: &[Vec<Option<BorderLine>>],
    col_x: &[f64],
    row_y: &[f64],
    table_x: f64,
    table_y: f64,
) -> Vec<RenderNode> {
    let mut nodes = Vec::new();

    // 수평 투명 엣지 (연속된 None 슬롯을 하나의 선분으로 병합)
    for row_bound in 0..h_edges.len() {
        let y = table_y + row_y[row_bound];
        let mut seg_start: Option<usize> = None;

        for col in 0..h_edges[row_bound].len() {
            if h_edges[row_bound][col].is_none() {
                if seg_start.is_none() { seg_start = Some(col); }
            } else {
                if let Some(start) = seg_start {
                    let x1 = table_x + col_x[start];
                    let x2 = table_x + col_x[col];
                    nodes.push(create_transparent_line_node(tree, x1, y, x2, y));
                    seg_start = None;
                }
            }
        }
        if let Some(start) = seg_start {
            let x1 = table_x + col_x[start];
            let x2 = table_x + *col_x.last().unwrap_or(&0.0);
            nodes.push(create_transparent_line_node(tree, x1, y, x2, y));
        }
    }

    // 수직 투명 엣지 (동일 패턴)
    for col_bound in 0..v_edges.len() {
        let x = table_x + col_x[col_bound];
        let mut seg_start: Option<usize> = None;

        for row in 0..v_edges[col_bound].len() {
            if v_edges[col_bound][row].is_none() {
                if seg_start.is_none() { seg_start = Some(row); }
            } else {
                if let Some(start) = seg_start {
                    let y1 = table_y + row_y[start];
                    let y2 = table_y + row_y[row];
                    nodes.push(create_transparent_line_node(tree, x, y1, x, y2));
                    seg_start = None;
                }
            }
        }
        if let Some(start) = seg_start {
            let y1 = table_y + row_y[start];
            let y2 = table_y + *row_y.last().unwrap_or(&0.0);
            nodes.push(create_transparent_line_node(tree, x, y1, x, y2));
        }
    }

    nodes
}
```

### 2-4. create_transparent_line_node() 헬퍼 함수

```rust
fn create_transparent_line_node(
    tree: &mut PageRenderTree,
    x1: f64, y1: f64, x2: f64, y2: f64,
) -> RenderNode {
    // 빨간색(#FF0000) 점선, 0.4px 너비
    tree.create_node(
        RenderNodeType::Line(LineNode {
            x1, y1, x2, y2,
            style: LineStyle {
                color: ColorRef(0x0000FF), // BGR 포맷: Red
                width: 0.4,
                dash: StrokeDash::Dot,
            },
        }),
        BoundingBox { x: x1.min(x2), y: y1.min(y2),
                       width: (x2-x1).abs().max(0.4), height: (y2-y1).abs().max(0.4) },
    )
}
```

**규모**: ~60줄

---

## 3단계: 프론트엔드 - 메뉴 및 버튼 연결

### 3-1. rhwp-studio: view:border-transparent 커맨드 구현

**파일**: `rhwp-studio/src/command/commands/view.ts` (96-101행)

문단 부호 커맨드(79-95행)와 동일 패턴:

```typescript
// 수정 전
{
    id: 'view:border-transparent',
    label: '투명 선',
    canExecute: () => false,
    execute() { /* TODO */ },
},

// 수정 후
(() => {
    let showBorders = false;
    return {
        id: 'view:border-transparent',
        label: '투명 선',
        canExecute: (ctx) => ctx.hasDocument,
        execute(services) {
            showBorders = !showBorders;
            services.wasm.setShowTransparentBorders(showBorders);
            document.querySelectorAll('[data-cmd="view:border-transparent"]').forEach(el => {
                el.classList.toggle('active', showBorders);
            });
            services.eventBus.emit('document-changed');
        },
    } satisfies CommandDef;
})(),
```

**파일**: `rhwp-studio/index.html` (71행)

```html
<!-- 수정 전 -->
<div class="md-item disabled" data-cmd="view:border-transparent">...

<!-- 수정 후: disabled 클래스 제거 -->
<div class="md-item" data-cmd="view:border-transparent">...
```

### 3-2. web/editor.js: 투명선 토글 버튼 추가

**파일**: `web/editor.html` (202-204행 부근)

```html
<!-- 문단부호 버튼 바로 옆에 추가 -->
<div class="toolbar-group" id="toolbar-transparent-border">
    <button id="transparent-border-btn" class="toolbar-btn"
            title="투명 선 보이기/숨기기">┅</button>
</div>
```

**파일**: `web/editor.js`

전역 상태 추가 (44행 부근):
```javascript
let showTransparentBorders = false;
```

이벤트 리스너 추가 (setupEventListeners, 123행 부근):
```javascript
const tbBtn = document.getElementById('transparent-border-btn');
if (tbBtn) tbBtn.addEventListener('click', toggleTransparentBorders);
```

토글 함수 추가 (toggleParagraphMarks 아래):
```javascript
function toggleTransparentBorders() {
    if (!doc) return;
    showTransparentBorders = !showTransparentBorders;
    doc.setShowTransparentBorders(showTransparentBorders);

    const btn = document.getElementById('transparent-border-btn');
    if (btn) {
        btn.style.background = showTransparentBorders ? '#4A90D9' : '';
        btn.style.color = showTransparentBorders ? '#fff' : '';
    }

    renderCurrentPage();
}
```

**규모**: ~30줄

---

## 4단계: 회귀 테스트 + 빌드 검증

**파일**: `src/wasm_api.rs`

### 테스트: 투명 테두리 Line 노드 생성 검증

```rust
#[test]
fn test_task79_transparent_border_lines() {
    // 투명 테두리가 있는 표를 포함하는 샘플 HWP 파일로
    // show_transparent_borders=true 시 Line 노드가 추가 생성되는지 검증
    // show_transparent_borders=false 시 기존 동작(생성 안됨) 확인
}
```

### 빌드 검증

1. `docker compose --env-file /dev/null run --rm test` — 전체 테스트 통과
2. SVG 내보내기: 투명 테두리 표 포함 파일 확인
3. WASM 빌드 + Vite 빌드 + 웹 브라우저 검증

**규모**: 테스트 ~30줄

---

## 수정 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `src/wasm_api.rs` | 플래그 + 메서드 + 전달 + 테스트 | ~40줄 |
| `src/renderer/layout.rs` | LayoutEngine 플래그 + render_transparent_borders() + 헬퍼 | ~65줄 |
| `rhwp-studio/src/command/commands/view.ts` | 커맨드 구현 | ~15줄 |
| `rhwp-studio/index.html` | disabled 제거 | 1줄 |
| `web/editor.html` | 투명선 버튼 추가 | ~4줄 |
| `web/editor.js` | 토글 상태 + 리스너 + 함수 | ~15줄 |
