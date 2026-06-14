# 타스크 165 1단계 완료 보고서

## 개요

도형 회전/대칭(flip) 렌더링을 위한 렌더 트리 확장과 SVG/Canvas 렌더러 수정을 완료했다.

## 구현 내용

### 1. 렌더 트리 확장 (`render_tree.rs`)

| 항목 | 내용 |
|------|------|
| `ShapeTransform` 구조체 | `rotation: f64`, `horz_flip: bool`, `vert_flip: bool`, `has_transform()` 메서드 |
| 도형 노드 필드 추가 | `LineNode`, `RectangleNode`, `EllipseNode`, `PathNode`, `ImageNode` 각각에 `transform: ShapeTransform` |
| 생성자 패턴 | 각 노드에 `new()` 생성자 추가 → transform 자동 default 설정 |

**생성자 패턴 (공통 함수):**
- `LineNode::new(x1, y1, x2, y2, style)` — transform 자동 default
- `RectangleNode::new(corner_radius, style, gradient)` — transform + section/para/control_index 자동 None
- `EllipseNode::new(style, gradient)` — transform 자동 default
- `PathNode::new(commands, style, gradient)` — transform 자동 default
- `ImageNode::new(bin_data_id, data)` — transform + 모든 Option 필드 자동 None

**호출측 패턴 3가지:**
1. 기본: `PathNode::new(commands, style, gradient)`
2. 필드 오버라이드: `ImageNode { fill_mode: Some(...), ..ImageNode::new(id, data) }`
3. 위치 정보 포함: `RectangleNode { section_index: Some(si), ..RectangleNode::new(r, s, g) }`

→ 앞으로 새 공통 필드 추가 시 `new()` 생성자만 수정하면 됨

### 2. 레이아웃 수정 (`shape_layout.rs`)

| 항목 | 내용 |
|------|------|
| `extract_shape_transform()` | `ShapeComponentAttr`에서 rotation_angle, horz_flip, vert_flip 추출 |
| `layout_shape_object()` | match 전에 공통으로 transform 추출, 각 도형 노드에 전달 |

### 3. SVG 렌더러 (`svg.rs`)

| 항목 | 내용 |
|------|------|
| `open_shape_transform()` | `<g transform="...">` 래퍼 생성 |
| `close_shape_transform()` | `</g>` 종료 |
| 변환 순서 | 대칭(flip) → 회전(rotate) |
| SVG transform | 좌우대칭: `translate(2*cx,0) scale(-1,1)`, 상하대칭: `translate(0,2*cy) scale(1,-1)`, 회전: `rotate(angle,cx,cy)` |

### 4. Canvas 렌더러 (`canvas.rs`)

| 항목 | 내용 |
|------|------|
| 새 커맨드 | `Save`, `Restore`, `SetTransform { tx, ty, rotation_rad, sx, sy }` |
| `open_shape_transform()` | Save + SetTransform 커맨드 추가 |
| `close_shape_transform()` | Restore 커맨드 추가 |

### 5. Web Canvas 렌더러 (`web_canvas.rs`)

| 항목 | 내용 |
|------|------|
| `open_shape_transform()` | `ctx.save()` → `translate(cx,cy)` → `scale(sx,sy)` → `rotate(rad)` → `translate(-cx,-cy)` |
| `close_shape_transform()` | `ctx.restore()` |

## 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/render_tree.rs` | ShapeTransform 구조체, 5개 노드에 transform 필드 + new() 생성자 |
| `src/renderer/layout/utils.rs` | `extract_shape_transform()` 함수 추가 |
| `src/renderer/layout/shape_layout.rs` | transform 추출 및 노드 전달, 22개 초기화 위치 생성자로 전환 |
| `src/renderer/layout/border_rendering.rs` | LineNode 생성자 전환 (2곳) |
| `src/renderer/layout.rs` | LineNode 생성자 전환 (1곳) |
| `src/renderer/layout/paragraph_layout.rs` | RectangleNode 생성자 전환 (2곳) |
| `src/renderer/layout/picture_footnote.rs` | ImageNode/LineNode 생성자 전환 (3곳) |
| `src/renderer/layout/table_cell_content.rs` | RectangleNode 생성자 전환 (1곳) |
| `src/renderer/layout/table_layout.rs` | RectangleNode 생성자 전환 (1곳) |
| `src/renderer/svg.rs` | open/close_shape_transform + 5개 도형에 적용 |
| `src/renderer/canvas.rs` | Save/Restore/SetTransform 커맨드 + open/close |
| `src/renderer/web_canvas.rs` | ctx save/translate/scale/rotate/restore + open/close |

## 검증

- 608개 테스트 모두 통과
- `samples/shape-rotate-01.hwp` → 3개 회전 도형 정상 렌더링 확인
  - rotate(16°): 녹색 사각형
  - rotate(329°): 패턴 채우기 사각형
  - rotate(286°): 분홍색 사각형
