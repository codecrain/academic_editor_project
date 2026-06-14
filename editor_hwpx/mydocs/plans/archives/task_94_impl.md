# 타스크 94: 구현 계획서

## 단계별 구현 계획 (3단계)

### 1단계: 모델 + 파서 수정

**파일**: `src/model/shape.rs`, `src/parser/control.rs`

- `CommonObjAttr`에 `vert_align: VertAlign`, `horz_align: HorzAlign` 필드 추가
- `VertAlign` enum: Top(0), Center(1), Bottom(2), Inside(3), Outside(4)
- `HorzAlign` enum: Left(0), Center(1), Right(2), Inside(3), Outside(4)
- `parse_common_obj_attr()`에서 attr 비트 5-7 → vert_align, 비트 10-12 → horz_align 파싱

### 2단계: 렌더러 위치 계산 수정

**파일**: `src/renderer/layout.rs`

- `compute_object_position()`에 `obj_height` 매개변수 추가
- 세로 정렬 계산:
  - Top(0): 기존대로 `base_y + v_offset`
  - Center(1): `base_y + (ref_height - obj_height) / 2 + v_offset`
  - Bottom(2): `base_y + ref_height - obj_height - v_offset`
- 가로 정렬 계산:
  - Left(0): 기존대로 `base_x + h_offset`
  - Center(1): `base_x + (ref_width - obj_width) / 2 + h_offset`
  - Right(2): `base_x + ref_width - obj_width - h_offset`
- 모든 `compute_object_position()` 호출부 업데이트

### 3단계: 빌드·테스트·검증

- `docker compose --env-file /dev/null run --rm test` — 전체 테스트 통과
- `export-svg samples/basic/BookReview.hwp` — 위치 확인
- 커밋 및 merge
