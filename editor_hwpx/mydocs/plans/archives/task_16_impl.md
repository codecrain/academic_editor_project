# 타스크 16 구현 계획서: 도형(Shape) 렌더링 구현

## 1단계: 개별 도형 시각 요소 렌더링

**변경 파일:**
- `src/renderer/layout.rs`

**작업:**
1. `drawing_to_shape_style()` 헬퍼 함수 추가: `DrawingObjAttr`의 `fill`/`border_line` → `ShapeStyle` 변환
2. `drawing_to_line_style()` 헬퍼 함수 추가: `ShapeBorderLine` → `LineStyle` 변환
3. `layout_shape()` 수정: TextBox 없는 도형도 시각 노드 생성
   - Rectangle → `RenderNodeType::Rectangle(RectangleNode)` + 자식 TextBox
   - Line → `RenderNodeType::Line(LineNode)`
   - Ellipse → `RenderNodeType::Ellipse(EllipseNode)` + 자식 TextBox
   - Arc/Polygon/Curve → `RenderNodeType::Path(PathNode)` + 자식 TextBox
4. 기존 TextBox 전용 로직을 도형 노드의 자식으로 이동

**완료 기준:** 기존 테스트 통과, TextBox 없는 사각형/선이 SVG에 렌더링됨

---

## 2단계: Group(묶음 개체) 렌더링

**변경 파일:**
- `src/renderer/layout.rs`

**작업:**
1. `layout_shape_object()` 함수 추출: 개별 ShapeObject를 렌더 노드로 변환 (기준 좌표 매개변수 추가)
2. `layout_shape()`에서 Group 처리: Group의 common 위치를 기준점으로, children을 재귀 처리
   - Group의 절대 좌표 계산 (common.horizontal_offset, vertical_offset)
   - 각 child의 ShapeComponentAttr.offset_x/y를 Group 기준점에 상대적으로 적용
3. `calculate_shape_reserved_height()`에서도 Group 처리 추가

**완료 기준:** 기존 테스트 통과, Group 도형이 SVG에 렌더링됨

---

## 3단계: 테스트 및 검증

**작업:**
1. 도형 관련 단위 테스트 추가
   - `drawing_to_shape_style` 변환 테스트 (Solid fill, None fill, border)
   - Rectangle/Line/Ellipse 레이아웃 테스트
2. `samples/hwp-3.0-HWPML.hwp` 19~20페이지 SVG 내보내기 확인
3. 기존 글상자(TextBox) 문서 렌더링 정상 확인
4. WASM 빌드 확인

**완료 기준:** 전체 테스트 통과, WASM 빌드 성공, 샘플 다이어그램 렌더링 정상
