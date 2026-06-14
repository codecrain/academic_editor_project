# 타스크 104 — 완료 보고서

## 타스크명
중첩 표 셀 클릭 시 첫 페이지 강제 이동 버그 수정

## 작업 기간
2026-02-17

## 배경
중첩 표(표 안의 표) 셀을 클릭하면 `para=4294967295(u32::MAX)` 오류와 함께 첫 페이지로 강제 이동됨.

### 근본 원인
`layout_table()`이 중첩 표를 재귀 호출할 때 `table_meta: None` 전달.
→ 중첩 표 내 TextRun의 셀 컨텍스트(parent_para_index, control_index 등)가 모두 None.
→ hitTest → isInCell()=false → getCursorRect에 유효하지 않은 paragraphIndex 전달 → 오류.

## 수정 내역

### `src/renderer/layout.rs`

#### 1. `layout_table` 시그니처에 `enclosing_cell_ctx: Option<CellContext>` 추가
- 중첩 표의 TextRun이 외부 셀 컨텍스트를 상속하도록 함

#### 2. 가로쓰기 셀 컨텍스트 생성 로직 변경
```rust
// enclosing_cell_ctx가 있으면(중첩 표) 외부 셀 컨텍스트 상속
let cell_context = if let Some(ctx) = enclosing_cell_ctx {
    Some(ctx)
} else {
    table_meta.map(|(pi, ci)| CellContext { ... })
};
```

#### 3. 중첩 표 호출부 2곳에 cell_context 전달
- 가로쓰기 중첩 (layout_table 내부)
- 세로쓰기 중첩 (layout_partial_table 내부)

#### 4. 최상위 호출부 3곳에 None 전달

#### 5. `layout_vertical_cell_text` 시그니처에도 `enclosing_cell_ctx` 추가
- 세로쓰기 셀 TextRun도 중첩 표에서 올바른 셀 컨텍스트 반영

## 제한 사항
- 중첩 표 셀 클릭 시 캐럿이 **외부 셀 기준**으로 위치함 (크래시 방지)
- 중첩 표 내부 셀에 정확히 캐럿 위치시키려면 `DocumentPosition` 모델 확장 필요 (별도 타스크)

## 테스트 결과
- 564개 테스트 통과
- WASM 빌드 성공

## 수정 파일

| 파일 | 변경 |
|------|------|
| `src/renderer/layout.rs` | `layout_table` 시그니처 + 셀 컨텍스트 전파 로직 + 호출부 6곳 |
