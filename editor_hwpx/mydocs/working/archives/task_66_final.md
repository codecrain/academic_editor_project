# 타스크 66 최종 보고서: 텍스트+Table 동시 포함 문단 렌더링 수정

## 완료 일시
2026년 2월 14일

## 문제 요약

`img-start-001.hwp` 1페이지에서 para[1]이 텍스트(80자: "【주관부서】디지털전환추진단...")와 Table 컨트롤을 동시에 포함하는 구조이다. 기존 코드는 Table이 있는 문단의 텍스트 렌더링을 건너뛰어 해당 텍스트가 표시되지 않았다.

### 문단 구조
```
para[1]: [Table 컨트롤(8 UTF-16)] [공정폭 빈 칸] [텍스트 80자] [문단종료컨트롤]
- line_seg[0]: text_start=0, line_height=4100 (표 높이, 표가 페이지 전체 너비 차지)
- line_seg[1]: text_start=8, line_height=1150 (텍스트 줄, 표 아래에 위치)
- char_offsets: [8, 9, 10, ...] (표 컨트롤 이후 시작)
```

## 수정 내용

### 핵심 설계 결정

텍스트+표 혼합 문단의 렌더링 순서가 핵심 문제였다:
- **잘못된 방식**: FullParagraph(line[0]+line[1]) → Table → 표가 텍스트 아래에 렌더링됨
- **올바른 방식**: Table → PartialParagraph(line[1]만) → 텍스트가 표 아래에 렌더링됨

### 1. layout.rs — 표 문단 FullParagraph 건너뜀 유지

```rust
// 표 컨트롤이 있는 문단은 FullParagraph에서 건너뜀
// (표는 PageItem::Table로, 혼합 문단의 텍스트는 PartialParagraph로 처리)
if has_table { ... continue; }
```

- 기존 `if has_table { continue; }` 로직 유지
- 표 문단의 텍스트는 FullParagraph가 아닌 PartialParagraph로 처리

### 2. pagination.rs — Table 뒤에 PartialParagraph 배치

```rust
// 표 전체가 현재 페이지에 들어감
current_items.push(PageItem::Table { ... });
current_height += effective_height;

// 텍스트+표 혼합 문단: 표 뒤에 텍스트 줄 배치
if !para.text.is_empty() {
    if let Some(mp) = measured.get_measured_paragraph(para_idx) {
        let total_lines = mp.line_heights.len();
        if total_lines > 1 {
            current_items.push(PageItem::PartialParagraph {
                para_index: para_idx,
                start_line: 1,      // line[0](표 자리)은 건너뜀
                end_line: total_lines,
            });
            current_height += text_height;
        }
    }
}
```

- Table 아이템 뒤에 PartialParagraph(start_line=1) 배치
- line[0](표 자리표시)은 건너뛰고 line[1]+(텍스트)만 렌더링
- 높이 계산에 텍스트 높이 반영

### 3. height_measurer.rs — 수정 불필요

- 이미 모든 문단의 높이를 측정하고 있음

### 4. 검증 테스트 추가 (wasm_api.rs)

`test_task66_table_text_mixed_paragraph_rendering` 테스트:
- pagination 순서 검증: Table이 PartialParagraph보다 먼저 배치
- PartialParagraph가 line 1부터 시작
- 렌더 트리에서 표의 y좌표 < 텍스트의 y좌표 (올바른 위치)
- SVG에서 개별 문자가 출력되는지 확인

## 검증 결과

| 항목 | 결과 |
|------|------|
| Rust 전체 테스트 | 487개 통과 (기존 486 + 새 테스트 1) |
| SVG 내보내기 (img-start-001.hwp) | table_y=75.8, text_y=122.9 — 텍스트가 표 아래 렌더링 |
| SVG 내보내기 (hwp-multi-001.hwp) | 9페이지 (main 브랜치와 동일, 회귀 없음) |
| 렌더 트리 | para[1]에서 TextRun 생성, 표 아래 올바른 위치 |
| 기존 Table 레이아웃 | 텍스트 없는 순수 표 문단은 기존 동작 동일 |

## 수정 파일 목록

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `src/renderer/layout.rs` | 표 문단 건너뜀 주석 갱신 | ~2줄 |
| `src/renderer/pagination.rs` | Table 뒤에 PartialParagraph 배치 | ~15줄 |
| `src/wasm_api.rs` | 검증 테스트 추가 | ~60줄 |
| `mydocs/plans/task_66.md` | 수행계획서 | 문서 |
| `mydocs/working/task_66_final.md` | 최종 보고서 | 문서 |
