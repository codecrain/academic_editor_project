# 타스크 142 — 2단계 완료 보고서

## 목표

`src/renderer/layout.rs` (8,708줄) → 도메인별 서브모듈 분리 (각 모듈 ≤1,200줄)

## 수행 결과

### 분리된 모듈 (11개 파일)

| 파일 | 줄 수 | 역할 |
|------|-------|------|
| `layout.rs` | 1,128 | LayoutEngine struct + build_render_tree + header/footer + mod 선언 |
| `layout/text_measurement.rs` | 492 | MeasureCache + 텍스트 폭 측정 + CJK/클러스터 판별 |
| `layout/paragraph_layout.rs` | 1,055 | 문단 레이아웃 (인라인 표, composed, raw) + 번호 매기기 |
| `layout/table_layout.rs` | 1,191 | layout_table + 셀 높이/줄 범위 계산 |
| `layout/table_partial.rs` | 1,102 | layout_partial_table (페이지 분할 표) |
| `layout/table_cell_content.rs` | 522 | 세로쓰기 + 셀 도형 + 임베디드 표 |
| `layout/shape_layout.rs` | 1,110 | 도형/글상자/그룹 레이아웃 |
| `layout/picture_footnote.rs` | 726 | 그림/캡션 + 각주 영역 레이아웃 |
| `layout/border_rendering.rs` | 486 | 표 테두리 수집/렌더링 + 라인 생성 |
| `layout/utils.rs` | 272 | BinData 검색 + 번호 포맷 + 도형 스타일 변환 |
| `layout/tests.rs` | 754 | 레이아웃 테스트 22개 |

### 모듈 크기 제한 준수 상태

- **1,200줄 이하**: 모든 11개 파일 ✅
- 최대 모듈: `table_layout.rs` (1,191줄)

### 설계 패턴

- **분산 impl 패턴**: `LayoutEngine` struct은 `layout.rs`에 한 번만 정의, `impl` 블록은 7개 서브모듈에 분산
- **독립 함수**: text_measurement, border_rendering, utils는 standalone 함수 모듈
- **pub(crate) re-export**: 자주 사용되는 함수를 layout.rs에서 re-export하여 접근 편의성 유지

## 검증 결과

| 항목 | 결과 |
|------|------|
| `cargo check` | ✅ 0 errors, 0 warnings |
| `cargo clippy` | ✅ 0 warnings |
| `cargo test` | ✅ 582 passed, 0 failed |

## 비고

- 원본 대비 총 줄 수 증가: 8,708 → 8,838 (+130줄, 모듈 헤더/import 오버헤드)
- `build_render_tree` (922줄) 단일 함수는 추후 CC 감소 단계에서 리팩토링 대상
