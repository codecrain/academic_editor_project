# 타스크 183: 테이블 배경 기능 구현 — 수행계획서

## 배경

테이블 셀의 배경 렌더링이 불완전한 상태이다. 솔리드 컬러 배경은 동작하나, 패턴 채우기와 이미지 채우기가 테이블 셀에 적용되지 않는다.

### 현재 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| 솔리드 컬러 배경 | 동작 | fill_color로 렌더링 |
| 그라데이션 배경 | 동작 | gradient로 렌더링 |
| 패턴 채우기 | 미구현 | SolidFill.pattern_type/pattern_color 무시 |
| 이미지 채우기 | 미연결 | ResolvedBorderStyle에 존재하나 렌더링 미구현 |

### 테스트 예제

- `samples/synam-001.hwp` — 1페이지 두 번째 표

## 목표

1. 테이블 셀의 패턴 채우기를 SVG/Canvas에서 정상 렌더링
2. 기존 솔리드/그라데이션 배경에 영향 없음
3. 이미지 채우기 연결 (가능 시)

## 근본 원인 분석

### 1. `ResolvedBorderStyle` (style_resolver.rs)
- `pattern` 필드 없음
- `resolve_single_border_style()` 에서 SolidFill의 `pattern_type`/`pattern_color` 추출 안 함

### 2. `render_cell_background()` (table_layout.rs)
- `fill_color`와 `gradient`만 처리
- `ShapeStyle.pattern`에 항상 None 전달

### 3. 렌더러 인프라는 이미 존재
- SVG: `create_pattern_def()` — 6종 패턴(가로줄, 세로줄, 대각선, 역대각선, 십자, 격자)
- Canvas: `apply_pattern_fill()` — Canvas createPattern 기반
- `ShapeStyle.pattern: Option<PatternFillInfo>` 이미 정의

## 수정 범위

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/style_resolver.rs` | ResolvedBorderStyle에 pattern 추가, resolve 함수에서 패턴 추출 |
| `src/renderer/layout/table_layout.rs` | render_cell_background에서 pattern 전달 |

## 검증 방법

1. `cargo test` — 전체 테스트 통과
2. `cargo build` — 네이티브 빌드 성공
3. `cargo run --bin rhwp -- export-svg samples/synam-001.hwp` — 1페이지 두 번째 표 배경 확인
4. 기존 배경(솔리드, 그라데이션)에 영향 없음
5. WASM 빌드 성공

## 일정

구현 규모가 작으므로 단일 단계로 진행 가능.
