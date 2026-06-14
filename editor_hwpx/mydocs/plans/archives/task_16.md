# 타스크 16: 도형(Shape) 렌더링 구현

## 목표

HWP 문서의 도형 개체(사각형, 직선, 타원, 다각형, 곡선, 묶음 개체)를 렌더링한다.
현재는 글상자(TextBox)가 있는 도형만 텍스트 부분만 렌더링하고, 도형의 시각적 요소(채우기/테두리)와 묶음 개체(Group)는 미구현 상태이다.

## 현재 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| 파싱 | 완료 | ShapeObject 7종 파싱됨 (Line, Rectangle, Ellipse, Arc, Polygon, Curve, Group) |
| 렌더 트리 노드 | 완료 | Line, Rectangle, Ellipse, Path, Group, TextBox 노드 타입 존재 |
| SVG/Canvas 렌더러 | 완료 | 렌더 트리 노드 처리 구현됨 (표 셀 테두리 등에 사용 중) |
| layout_shape | 부분 | TextBox 있는 도형만 텍스트 레이아웃, 시각 요소 미렌더링 |
| Group 도형 | 미구현 | `ShapeObject::Group(_) => return` |
| 시각 요소 | 미구현 | 채우기(Fill), 테두리(ShapeBorderLine) 미적용 |

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/layout.rs` | `layout_shape()` 리팩토링: 도형 시각 노드 생성, Group 재귀 처리 |

## 구현 방법

### 개별 도형 렌더링

현재 `layout_shape()`는 TextBox 없으면 건너뛰지만, 수정 후에는:

1. **DrawingObjAttr에서 fill/border 추출** → ShapeStyle 생성
2. **도형 타입별 렌더 노드 생성**:
   - `ShapeObject::Rectangle` → `RenderNodeType::Rectangle(RectangleNode)`
   - `ShapeObject::Line` → `RenderNodeType::Line(LineNode)`
   - `ShapeObject::Ellipse` → `RenderNodeType::Ellipse(EllipseNode)`
   - `ShapeObject::Arc/Polygon/Curve` → `RenderNodeType::Path(PathNode)`
3. **TextBox가 있으면 자식으로 텍스트 레이아웃 추가** (기존 로직 유지)

### Group(묶음 개체) 렌더링

GroupShape의 children을 재귀적으로 처리:
- Group 위치(common.horizontal_offset, vertical_offset)를 기준점으로 설정
- 각 하위 개체의 ShapeComponentAttr.offset_x/y를 Group 기준점에 더하여 절대 좌표 계산
- 하위 개체별로 시각 노드 + TextBox 생성

### Fill → ShapeStyle 변환

```
FillType::Solid → fill_color = Some(solid.background_color)
FillType::None  → fill_color = None
ShapeBorderLine → stroke_color, stroke_width
```

## 검증 방법

1. 기존 233개 테스트 통과
2. `samples/hwp-3.0-HWPML.hwp` 19~20페이지 다이어그램 렌더링 확인
3. 기존 글상자(TextBox) 렌더링 정상 동작 확인
4. WASM 빌드 성공
