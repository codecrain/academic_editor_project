# 타스크 142 — 4단계 완료 보고서

## 개요

parser/control.rs, serializer/control.rs, serializer/cfb_writer.rs, model/table.rs 분할 완료.

## 변경 내역

### parser/control.rs (1,744줄 → 585줄)

| 파일 | 줄 수 | 내용 |
|------|-------|------|
| `control.rs` | 585 | parse_control 디스패처 + 테이블/헤더푸터/각주미주/단순 컨트롤 파서 |
| `control/shape.rs` | 789 | GSO/도형 파싱 (parse_gso_control, parse_common_obj_attr 등) |
| `control/tests.rs` | 394 | 파서 테스트 13개 |

### serializer/control.rs (1,520줄 → 1,120줄)

| 파일 | 줄 수 | 내용 |
|------|-------|------|
| `control.rs` | 1,120 | 컨트롤 직렬화 함수 전체 |
| `control/tests.rs` | 400 | 라운드트립 테스트 3개 |

### serializer/cfb_writer.rs (1,516줄 → 196줄)

| 파일 | 줄 수 | 내용 |
|------|-------|------|
| `cfb_writer.rs` | 196 | serialize_hwp + compress_stream + write_hwp_cfb |
| `cfb_writer/tests.rs` | 1,320 | CFB 테스트 14개 + 헬퍼 (테스트 전용) |

### model/table.rs (1,767줄 → 987줄)

| 파일 | 줄 수 | 내용 |
|------|-------|------|
| `table.rs` | 987 | Table/Cell/Row 모델 정의 |
| `table/tests.rs` | 780 | 테이블 테스트 43개 |

## 검증

- `cargo check`: 0 errors
- `cargo test`: 582 passed, 0 failed
- `cargo clippy`: 0 warnings
- 모든 소스 파일 1,200줄 이하 (cfb_writer/tests.rs 1,320줄은 순수 테스트 코드)

## 분할 기법

- **shape.rs 추출**: parser/control.rs에서 도형 파싱 섹션(~768줄)을 별도 모듈로 분리
  - `parse_gso_control`, `parse_common_obj_attr` → `pub(crate)` 가시성
  - `parse_caption` → `pub(crate)` (shape에서 호출)
  - `super::doc_info` → `crate::parser::doc_info` 경로 수정
- **테스트 추출**: 4개 파일 모두 `#[cfg(test)] mod tests;` 패턴으로 외부 파일 분리
