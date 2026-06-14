# 타스크 47 단계 1-2 완료보고서

## 단계: Phase 1 기본 편집 API 7개 구현

## 수행 내용

7개 API를 `wasm_api.rs`에 WASM + Native 양쪽으로 구현했다. 단계 1(문서/구역/문단 4개)과 단계 2(셀 3개)를 한 번에 진행했다.

### 추가된 WASM 메서드 (7개)

| No | API | WASM 시그니처 | Native 메서드 |
|----|-----|-------------|--------------|
| 1 | `getSectionCount` | `() → u32` | (직접 반환, Native 불필요) |
| 2 | `getParagraphCount` | `(sec) → u32` | `get_paragraph_count_native` |
| 3 | `getParagraphLength` | `(sec, para) → u32` | `get_paragraph_length_native` |
| 4 | `getTextRange` | `(sec, para, offset, count) → String` | `get_text_range_native` |
| 5 | `getCellParagraphCount` | `(sec, para, ctrl, cell) → u32` | `get_cell_paragraph_count_native` |
| 6 | `getCellParagraphLength` | `(sec, para, ctrl, cell, cellPara) → u32` | `get_cell_paragraph_length_native` |
| 7 | `getTextInCell` | `(sec, para, ctrl, cell, cellPara, offset, count) → String` | `get_text_in_cell_native` |

### 구현 패턴

- `getSectionCount`: 단순 조회 → 직접 `u32` 반환 (오류 불가)
- 나머지 6개: `Result<T, JsValue>` 반환, Native는 `Result<T, HwpError>`
- 셀 API: 기존 `get_cell_paragraph_ref()` 헬퍼 활용
- `getTextRange` / `getTextInCell`: `chars().collect()` → 범위 슬라이싱

## 검증

| 항목 | 결과 |
|------|------|
| `cargo test` (Docker) | 474 tests 통과 |
| `wasm-pack build` (Docker) | 성공 (29.2s) |
| `pkg/rhwp.d.ts` 시그니처 | 7개 API 모두 포함 확인 |
