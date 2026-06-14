# 타스크 77 구현계획서: 페이지 하단 표 셀 내 이미지 처리

## 구현 개요

페이지네이션에서 인트라-로우 분할 시, 행의 셀이 분할 불가능한 단일 줄(이미지)로만 구성된 경우 분할을 금지하고 행 전체를 다음 페이지로 이동시킨다.

---

## 1단계: MeasuredTable에 행 분할 가능 여부 판별 메서드 추가

**파일**: `src/renderer/height_measurer.rs`

`MeasuredTable`에 행이 인트라-로우 분할 가능한지 판별하는 메서드를 추가한다.

```rust
/// 지정 행이 인트라-로우 분할 가능한지 판별한다.
/// 행의 모든 셀이 단일 줄(≤1)이면 분할 불가 (이미지 셀).
/// 2줄 이상의 셀이 하나라도 있으면 분할 가능 (텍스트 셀).
pub fn is_row_splittable(&self, row: usize) -> bool {
    let cells_in_row: Vec<&MeasuredCell> = self.cells.iter()
        .filter(|c| c.row == row && c.row_span == 1)
        .collect();
    if cells_in_row.is_empty() {
        return false;
    }
    cells_in_row.iter().any(|c| c.line_heights.len() > 1)
}
```

**규모**: ~10줄 신규 메서드

---

## 2단계: 페이지네이션 인트라-로우 분할 조건에 분할 가능 여부 추가

**파일**: `src/renderer/pagination.rs`

인트라-로우 분할을 시도하는 2곳에 `is_row_splittable()` 검사를 추가한다.

### 수정 위치 1: 첫 행 오버플로 (740행)

```rust
// 수정 전
if can_intra_split {

// 수정 후
if can_intra_split && mt.is_row_splittable(r) {
```

### 수정 위치 2: 중간 행 부분 배치 (758행)

```rust
// 수정 전
if can_intra_split {

// 수정 후
if can_intra_split && mt.is_row_splittable(r) {
```

이 수정으로 단일 줄(이미지) 행은 인트라-로우 분할 분기에 진입하지 않으며:
- 첫 행인 경우: 폴백으로 최소 1행 강제 포함 (755행)
- 중간 행인 경우: "이 행은 포함하지 않음"으로 다음 페이지 이동 (773행)

**규모**: 2행 수정

---

## 3단계: 회귀 테스트 + 빌드 검증

**파일**: `src/wasm_api.rs`

### 테스트 1: 표6 셀2 이미지 다음 페이지 렌더링

```rust
#[test]
fn test_task77_partial_table_image_cell_no_split() {
    // 20250130-hongbo.hwp의 표6(문단30)에서
    // 행2(이미지 셀)가 인트라-로우 분할되지 않고
    // 다음 페이지에서 완전하게 렌더링되는지 검증
}
```

### 빌드 검증

1. `docker compose --env-file /dev/null run --rm test` — 전체 테스트 통과
2. SVG 내보내기: `20250130-hongbo.hwp` 페이지별 이미지 위치 확인
3. WASM 빌드 + Vite 빌드 + 웹 브라우저 검증

**규모**: 테스트 ~30줄

---

## 수정 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `src/renderer/height_measurer.rs` | `is_row_splittable()` 메서드 추가 | ~10줄 |
| `src/renderer/pagination.rs` | 인트라-로우 분할 조건에 `is_row_splittable()` 검사 추가 (2곳) | ~2줄 |
| `src/wasm_api.rs` | 회귀 테스트 추가 | ~30줄 |
