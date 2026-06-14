# 타스크 93: 구현 계획서

## 단계별 구현 계획 (4단계)

### 1단계: 데이터 모델 수정

**파일**: `src/model/shape.rs`

- `LineShape.attr: u16` → `LineShape.started_right_or_bottom: bool` (hwplib: startedRightOrBottom)
- `ArcShape.attr: u32` → `ArcShape.arc_type: u8` (hwplib: ArcType enum, 0=Arc, 1=CircularSector, 2=Bow)
- 관련 참조 코드 검색 및 업데이트

### 2단계: 파서 함수 수정

**파일**: `src/parser/control.rs`

| 함수 | 변경 내용 |
|------|----------|
| `parse_line_shape_data()` | `read_u16()` → `read_i32()`, boolean 변환 |
| `parse_rect_shape_data()` | x[0..4]+y[0..4] → (x1,y1),(x2,y2),(x3,y3),(x4,y4) 인터리브 |
| `parse_polygon_shape_data()` | count `read_i16()` → `read_i32()`, `>>16` 시프트 제거 |
| `parse_curve_shape_data()` | count `read_i16()` → `read_i32()`, `>>16` 제거, `skip(4)` 추가 |
| `parse_arc_shape_data()` | `read_u32()` → `read_u8()` |

### 3단계: 렌더러 코드 조정

**파일**: `src/renderer/layout.rs` 및 관련 파일

- `LineShape.attr` 참조 → `started_right_or_bottom` 참조로 변경
- `ArcShape.attr` 참조 → `arc_type` 참조로 변경
- 사각형 좌표 인덱스 확인 (x_coords/y_coords 사용처)
- 다각형/곡선 좌표 스케일링 로직 확인 (>>16 관련 후처리 존재 여부)

### 4단계: 빌드·테스트·검증

- `docker compose run --rm test` — 전체 테스트 통과
- `docker compose run --rm dev cargo run -- export-svg samples/basic/KTX.hwp` — 도형 렌더링
- 추가 샘플 파일 SVG 출력 비교
- 커밋
