# 타스크 93: hwplib 기준 도형 파싱 정합성 수정 — 완료 보고서

## 수정 내역

### 1단계: 데이터 모델 수정

| 변경 | 파일 | 전 | 후 |
|------|------|----|----|
| LineShape 필드 | `src/model/shape.rs` | `attr: u16` | `started_right_or_bottom: bool` |
| ArcShape 필드 | `src/model/shape.rs` | `attr: u32` | `arc_type: u8` |

### 2단계: 파서 함수 수정

| 도형 | 불일치 | 수정 내용 |
|------|--------|-----------|
| LINE | 5번째 필드 `read_u16()` 2B | `read_i32()` 4B → boolean 변환 |
| RECT | x[0..4],y[0..4] (X 전체 → Y 전체) | x1,y1,x2,y2,x3,y3,x4,y4 인터리브 쌍 |
| POLYGON | count `read_i16()` 2B | `read_i32()` 4B |
| POLYGON | 좌표값 `i32 >> 16` (고정소수점 가정) | plain i32 (HWPUNIT) |
| CURVE | count `read_i16()` 2B + `>>16` + 패딩 없음 | `read_i32()` 4B + plain i32 + `skip(4)` |
| ARC | `read_u32()` 4B | `read_u8()` 1B |

### 3단계: 렌더러 코드 조정

- 렌더러에서 `LineShape.attr`, `ArcShape.attr`을 직접 참조하지 않아 변경 불필요
- 다각형/곡선 좌표는 `points` 벡터를 그대로 사용하므로 `>>16` 제거 후 자동 반영
- 사각형 좌표는 렌더러에서 `common.width/height` 사용으로 영향 없음

### 4단계: 직렬화 코드 동기화

파서 변경에 맞춰 직렬화 코드도 동일하게 수정:

| 도형 | 변경 |
|------|------|
| LINE | `write_u16(line.attr)` → `write_i32(started_right_or_bottom as i32)` |
| RECT | split → interleaved 순서 |
| POLYGON | `write_i16` → `write_i32`, x/y split → interleaved |
| CURVE | `write_i16` → `write_i32`, x/y split → interleaved, `write_u32(0)` 패딩 추가 |
| ARC | `write_u32(arc.attr)` → `write_u8(arc.arc_type)` |

## 수정 파일

| 파일 | 수정 내용 |
|------|-----------|
| `src/model/shape.rs` | LineShape, ArcShape 필드 변경 |
| `src/parser/control.rs` | 6개 도형 파서 함수 수정 |
| `src/serializer/control.rs` | 6개 도형 직렬화 함수 수정 |

## 검증 결과

- `cargo test` — 532개 테스트 통과 (0 실패)
- `export-svg KTX.hwp` — SVG 정상 출력
