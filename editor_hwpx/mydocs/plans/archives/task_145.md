# 타스크 145 수행계획서: ShapeObject::common() 활용 확대

## 1. 개요

ShapeObject enum의 8-variant 매칭 중복을 메서드로 통합한다.

## 2. 목표

- `shape_attr()`, `shape_name()` 메서드 추가
- `z_order()` 단순화 (`self.common().z_order`)
- 8곳의 중복 match 블록 제거 → 메서드 호출로 교체

## 3. 변경 파일

| 파일 | 변경 |
|------|------|
| src/model/shape.rs | shape_attr(), shape_name() 추가, z_order() 단순화 |
| src/renderer/layout/shape_layout.rs | 5개 match → 메서드 호출 |
| src/renderer/layout/table_cell_content.rs | 1개 match → shape.common() |
| src/main.rs | 2개 match → shape_name() + common()/shape_attr() |

## 4. 검증

- 582개 테스트 통과 + WASM 빌드 + Clippy 0
