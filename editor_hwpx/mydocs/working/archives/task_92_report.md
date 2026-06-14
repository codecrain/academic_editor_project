# 타스크 92 — 완료 보고서

## 도형 렌더링 변환(scale/offset/rotation) 적용

### 수정 내용

#### 근본 원인 발견: 고정소수점 좌표 형식

구현 과정에서 계획 단계에서 발견하지 못한 **근본 원인**을 추가 발견:
- 다각형(Polygon)과 곡선(Curve) 도형의 꼭짓점 좌표가 **고정소수점 16.16 형식**(HWPUNIT × 65536)으로 HWP 파일에 저장됨
- 파서가 이 값을 그대로 `i32`로 읽어 `Point { x, y }`에 저장
- 렌더링 시 `hwpunit_to_px()`가 이 거대한 값을 그대로 변환하여 좌표가 수백만 픽셀로 렌더링됨

**예시** (KTX.hwp, `orig=5216×7880` 다각형):
- 변경 전: `pt[0] = (200802304, 59244544)` → 14,316,403px
- 변경 후: `pt[0] = (3063, 904)` → 218.5px (정상 범위)

#### 근본 원인 발견 2: 좌표 배열 읽기 순서

HWP 5.0 스펙에는 다각형 좌표가 "X 배열 → Y 배열" 순으로 기술되어 있으나, 실제 바이너리 형식은 **(x,y) 인터리브 쌍**으로 저장됨.

- 스펙: `INT16 cnt`, `INT32[cnt] x_array`, `INT32[cnt] y_array`
- 실제: `INT16 cnt`, `(INT32 x, INT32 y) × cnt`

참고 구현체 3개 (Java hwplib, Python pyhwp, Rust openhwp) 모두 인터리브 쌍으로 읽음.

**증상**: 188개 점의 다각형(한반도 남한 윤곽)이 지그재그 패턴으로 렌더링됨
- X/Y 배열 분리 읽기 시: `pt[0]=(3064,904), pt[1]=(0,7848)` → Y값 교차
- 인터리브 읽기 시: `pt[0]=(3064,0), pt[1]=(2068,600)` → 연속적 해안선 윤곽

#### 수정 1: 파서 좌표 읽기 수정

**파일**: `src/parser/control.rs`
- `parse_polygon_shape_data()`: (x,y) 인터리브 쌍으로 읽기 + `>> 16` 고정소수점 변환
- `parse_curve_shape_data()`: 동일 인터리브 쌍 읽기 + `>> 16` 변환

#### 수정 2: 렌더러 내부 좌표 스케일링

**파일**: `src/renderer/layout.rs`
- **Line**: `start/end` 좌표에 `common.width / original_width` 스케일 적용
- **Polygon**: `points[]` 좌표에 동일 스케일 적용
- **Curve**: `curve_to_path_commands_scaled()` 함수로 변경, `sx/sy` 파라미터 추가

스케일 계산:
```rust
let sx = if sa.original_width > 0 { w / hwpunit_to_px(sa.original_width as i32, dpi) } else { 1.0 };
let sy = if sa.original_height > 0 { h / hwpunit_to_px(sa.original_height as i32, dpi) } else { 1.0 };
```

#### Group 자식 처리

기존 `layout_shape_object()` 재귀 호출 구조에서 `child_w/child_h`를 `current_width × render_sx`로 계산하여 전달하므로, 내부 좌표 스케일링이 Group 자식에도 자동 적용됨.

#### 수정 3: 단색 채우기(Solid Fill) 조건 수정

**파일**: `src/renderer/layout.rs`

HWP `pattern_type` 값의 의미:
- `0` = 채우기 없음 (투명)
- `-1` = 단색 채우기 (패턴 없음)
- `> 0` = 패턴 채우기

기존 조건 `pattern_type <= 0`이 `-1`(단색 채우기)도 투명으로 처리하여, 그림자 효과용 다각형의 단색 배경(`#7f936b`)이 렌더링되지 않았음. `pattern_type == 0`으로 수정하여 단색 채우기가 정상 적용됨.

#### 수정 4: 묶음 개체(Group) 파싱 및 렌더링 검증

**파일**: `src/parser/control.rs`, `src/renderer/layout.rs`

- `parse_gso_control()`에서 `SHAPE_COMPONENT_CONTAINER` 태그로 묶음 개체 탐지
- `parse_container_children()`로 자식 도형 재귀 파싱
- 렌더러에서 묶음 평탄화: 자식을 `render_tx/ty` 오프셋 적용하여 부모에 직접 렌더링
- KTX.hwp 독도 묶음 개체 (사각형 1 + 다각형 6) 정상 파싱 및 렌더링 확인

#### 수정 5: 도형 z-order 렌더링 순서 적용

**파일**: `src/renderer/layout.rs`, `src/model/shape.rs`

- `ShapeObject::z_order()` 메서드 추가 — 모든 도형 변형에서 `common.z_order` 반환
- `build_render_tree()` 2차 패스: 도형을 z-order 순으로 정렬한 후 렌더링
- 낮은 z-order → 먼저 렌더링 (아래), 높은 z-order → 나중에 렌더링 (위)

### 검증 결과

| 항목 | 결과 |
|------|------|
| Rust 테스트 | 532개 전체 통과 |
| WASM 빌드 | 성공 |
| Vite 빌드 | 성공 |
| KTX.hwp SVG | 직선 2개 + 다각형(단색+그라데이션) + 묶음 개체(독도 7자식) 정상 렌더링, z-order 적용 |
| treatise sample.hwp SVG | 9페이지 정상 출력 |

### 수정 파일

| 파일 | 수정 내용 |
|------|----------|
| `src/parser/control.rs` | 다각형/곡선 파서: (x,y) 인터리브 쌍 읽기 + 고정소수점 16.16 → HWPUNIT 변환 |
| `src/renderer/layout.rs` | Line/Polygon/Curve 내부 좌표 스케일링, 단색 채우기 조건 수정, 묶음 평탄화, z-order 정렬 렌더링 |
| `src/model/shape.rs` | `ShapeObject::z_order()` 메서드 추가 |
