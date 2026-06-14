# 타스크 36: 표 테두리 처리 고도화 - 1단계 완료 보고서

## 1단계 목표

k-water-rfp.hwp 1페이지 표의 상단/하단 장식 셀 그라데이션 배경이 투명으로 렌더링되는 문제 해결

## 수행 내역

### 1-1. 데이터 모델 확장

- `GradientFillInfo` 구조체를 `src/renderer/mod.rs`에 정의
- `RectangleNode`, `EllipseNode`, `PathNode`에 `gradient: Option<Box<GradientFillInfo>>` 필드 추가
- `ShapeStyle`에는 gradient를 넣지 않음 (성능 문제 회피: RenderNodeType enum 크기 폭발 방지)

### 1-2. Style Resolver 확장

- `ResolvedBorderStyle`에 `gradient: Option<Box<GradientFillInfo>>` 필드 추가
- `resolve_single_border_style()`에서 `FillType::Gradient` 처리 로직 구현
- 유효성 검사: 색상 2~64개, center 값 200 이내

### 1-3. Layout Engine 수정

- `drawing_to_shape_style()` 반환형을 `(ShapeStyle, Option<Box<GradientFillInfo>>)` 튜플로 변경
- 5개 호출부 모두 수정 (Rectangle, Ellipse, Path 등)
- 셀 배경 렌더링 4개소에서 gradient를 `RectangleNode`로 전달

### 1-4. SVG Renderer 확장

- `<defs>` 섹션 관리: `begin_page()`에서 삽입 위치 기록, `end_page()`에서 삽입
- `create_gradient_def()`: `<linearGradient>` / `<radialGradient>` SVG 요소 생성
- `build_gradient_stops()`: 색상별 `<stop>` 요소 생성
- `angle_to_svg_coords()`: HWP 각도 → SVG x1/y1/x2/y2 좌표 변환
- `draw_rect_with_gradient()`, `draw_ellipse_with_gradient()`, `draw_path_with_gradient()` 추가

### 1-5. HWP 그라데이션 파싱 수정 (핵심 버그 수정)

**문제**: HWP 5.0 스펙 문서의 그라데이션 필드 크기 오류로 인한 OOM (436M 색상 배열)

**원인**: 스펙 문서에는 INT16(2바이트)로 기재되어 있으나 실제 바이너리는 다른 크기 사용

| 필드 | HWP 5.0 스펙 | 실제 바이너리 (레퍼런스 확인) |
|------|-------------|---------------------------|
| kind | INT16 (2B) | u8 (1B) |
| angle | INT16 (2B) | u32 (4B) |
| center_x | INT16 (2B) | u32 (4B) |
| center_y | INT16 (2B) | u32 (4B) |
| step | INT16 (2B) | u32 (4B) |
| count | INT16 (2B) | u32 (4B) |

**교차 검증**: Rust hwp crate (https://docs.rs/hwp) 레퍼런스 구현 확인
- 코드 주석: "전체적으로 문서 오류가 있어 바이트가 다르다"
- change_points: count > 2일 때 1개의 u32만 읽음
- 추가 정보: additional_info_count(u32) + step_center(u8) + alpha(u8) 필수

## 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/parser/doc_info.rs` | `parse_fill()` 그라데이션 필드 크기 수정 |
| `src/renderer/mod.rs` | `GradientFillInfo` 구조체 정의 |
| `src/renderer/render_tree.rs` | 3개 노드 타입에 gradient 필드 추가 |
| `src/renderer/style_resolver.rs` | gradient 해소 로직 추가 |
| `src/renderer/layout.rs` | gradient 전달 로직 수정 |
| `src/renderer/svg.rs` | SVG gradient 렌더링 구현 |

## 검증 결과

- **단위 테스트**: 416개 전체 통과
- **k-water-rfp.hwp**: 30페이지 전체 SVG 내보내기 성공 (OOM 없음)
  - 1페이지 장식 행에 `<radialGradient>` 2개 생성
  - 색상: #d6e6fe (연한 파란색) → #000080 (네이비)
  - center: cx=50%, cy=52%
- **전체 샘플**: 20개 HWP 파일 모두 정상 내보내기 확인

## SVG 출력 예시 (k-water-rfp_001.svg)

```xml
<defs>
  <radialGradient id="grad1" cx="50%" cy="52%" r="50%" fx="50%" fy="52%">
    <stop offset="0.0%" stop-color="#d6e6fe"/>
    <stop offset="100.0%" stop-color="#000080"/>
  </radialGradient>
</defs>
...
<rect x="84.81" y="247.73" width="630.37" height="11" fill="url(#grad1)"/>
```
