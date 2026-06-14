# 타스크 32 - 2단계 완료 보고서

## 단계: CharShape/ParaShape 변경 로직

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/model/style.rs` | CharShape/ParaShape에 `PartialEq` derive 추가; `CharShapeMods`, `ParaShapeMods` 구조체 + `apply_to()` 메서드 |
| `src/model/paragraph.rs` | `apply_char_shape_range()` 메서드 — CharShapeRef 범위 분할/교체 알고리즘 |
| `src/model/document.rs` | `find_or_create_char_shape()`, `find_or_create_para_shape()` — 스타일 중복제거 |

## 구현 상세

### 1. CharShapeMods / ParaShapeMods (style.rs)
- `Option<T>` 패턴으로 변경할 속성만 지정 (None이면 기존 값 유지)
- `apply_to(&self, base: &CharShape) -> CharShape` — 기존 스타일에 수정사항 오버레이
- CharShapeMods: bold, italic, underline, strikethrough, font_id, base_size, text_color, shade_color
- ParaShapeMods: alignment, line_spacing, line_spacing_type, indent

### 2. apply_char_shape_range() (paragraph.rs)
- `[start_char_offset, end_char_offset)` 범위에 새 char_shape_id를 적용
- UTF-8 char offset → UTF-16 위치 변환
- 겹치는 CharShapeRef를 3가지 경우로 처리:
  - **왼쪽 부분 겹침**: 기존 ref 유지 + 새 ref 삽입
  - **완전 겹침**: 새 ref로 교체
  - **오른쪽 부분 겹침**: 새 ref 삽입 + 기존 ref 복원
- 텍스트 끝 이후 불필요한 복원 ref 방지 (`utf16_end < text_utf16_len` 가드)
- 연속 동일 ID 자동 병합

### 3. find_or_create_char_shape / para_shape (document.rs)
- 기존 스타일을 복제 → 수정사항 적용 → PartialEq로 기존 배열 검색
- 동일 스타일이 이미 있으면 기존 ID 반환 (중복 제거)
- 없으면 새로 추가하고 raw_stream 무효화 (재직렬화 유도)

## 추가된 테스트 (9개)

| 테스트 | 내용 |
|--------|------|
| `test_char_shape_id_at` | 위치별 CharShape ID 조회 |
| `test_apply_char_shape_range_full` | 전체 범위 적용 |
| `test_apply_char_shape_range_left_partial` | 왼쪽 부분 변경 |
| `test_apply_char_shape_range_right_partial` | 오른쪽 부분 변경 |
| `test_apply_char_shape_range_middle` | 중간 부분 변경 |
| `test_apply_char_shape_range_multi_segment` | 여러 세그먼트 걸침 |
| `test_apply_char_shape_range_merge_same_id` | 동일 ID 병합 |
| `test_find_or_create_char_shape_reuse` | CharShape 중복 제거 |
| `test_find_or_create_para_shape_reuse` | ParaShape 중복 제거 |

## 테스트 결과
- **399개 테스트 모두 통과** (기존 390 + 신규 9)
