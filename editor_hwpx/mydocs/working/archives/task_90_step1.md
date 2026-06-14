# 타스크 90 — 1단계 완료 보고서

## 단계 목표
공통 유틸리티 함수 추출 + header.rs charPr/paraPr 파싱 보완

## 완료 항목

### 1. utils.rs 신규 생성
- `src/parser/hwpx/utils.rs` — 공통 유틸리티 함수 모듈 생성
- 함수 목록: `local_name`, `attr_str`, `attr_eq`, `parse_u8`, `parse_i8`, `parse_u16`, `parse_i16`, `parse_u32`, `parse_i32`, `parse_color`, `parse_color_str`, `parse_bool`, `skip_element`
- 단위 테스트 3개 포함 (`test_local_name`, `test_parse_color_str`, `test_parse_color_str_with_alpha`)

### 2. header.rs 중복 함수 제거 + paraPr/charPr 보완
- `use super::utils::*` 추가
- 중복 유틸리티 함수 70줄 제거 (`local_name`, `attr_str`, `parse_u8`~`parse_i32`, `parse_color`)
- header 전용 함수 유지: `is_empty_event`, `parse_alignment`, `parse_border_line_type`, `parse_border_width`

**charPr 보완**:
- `<hh:emboss/>` → `cs.attr |= 1 << 9` (양각)
- `<hh:engrave/>` → `cs.attr |= 1 << 10` (음각)

**paraPr 보완**:
- `<hh:breakSetting>` 파싱 추가: widowOrphan(bit 5), keepWithNext(bit 6), keepLines(bit 7), pageBreakBefore(bit 8) → `ps.attr2`
- `<hh:autoSpacing>` 파싱 추가: eAsianEng(bit 20), eAsianNum(bit 21) → `ps.attr1`
- `<hh:border>` 보완: offsetLeft/Right/Top/Bottom → `ps.border_spacing[0..4]`

### 3. section.rs 중복 함수 제거
- `use super::utils::*` 추가
- 중복 유틸리티 함수 50줄 제거 (`local_name`, `attr_str`, `parse_u8`, `parse_i8_`, `parse_u16`, `parse_i16`, `parse_u32`, `skip_element`)
- `parse_i32_val` → utils의 `parse_i32`로 통일
- `parse_i8_` → utils의 `parse_i8`로 통일

## 검증 결과
- `docker compose run --rm test` — **532개 테스트 전체 통과** (기존 529개 + 3개 신규 utils 테스트)

## 수정 파일
| 파일 | 변경 내용 |
|------|----------|
| `src/parser/hwpx/utils.rs` | 신규 생성 — 공통 유틸리티 함수 + 테스트 |
| `src/parser/hwpx/mod.rs` | `pub mod utils;` 추가 |
| `src/parser/hwpx/header.rs` | utils import, 중복 제거, charPr/paraPr 보완 |
| `src/parser/hwpx/section.rs` | utils import, 중복 제거, 함수명 통일 |
