# 타스크 198 — 2단계 완료 보고서: BUG-3 중첩 표 경계 초과 수정

## 수행 내용

### BUG-3: 비분할 행의 중첩 표가 PartialTable 셀 경계 초과 렌더링

**원인**: `layout_partial_table`의 비분할 행(non-split row) 처리 시, 셀 내 중첩 표를 `layout_table()`에 `split_ref=None`으로 전달하여 전체 높이로 렌더링. 셀의 가용 공간보다 중첩 표가 클 때 body area를 초과함.

**수정**: `table_partial.rs` 비분할 행 코드 (line 771~)에서:
1. 셀의 가용 높이(`available_h`)를 계산
2. 중첩 표 높이(`nested_h`)가 `available_h`를 초과하면 `calc_nested_split_rows()`로 `NestedTableSplit` 생성
3. 행 범위 필터가 필요한 경우 `split_ref`를 `layout_table()`에 전달
4. 이미 분할 행에서 사용하던 동일한 메커니즘을 비분할 행에도 적용

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/layout/table_partial.rs` | 비분할 행 중첩 표 렌더링에 NestedTableSplit 적용 |

## 검증 결과

- 기존 테스트: 677 passed, 1 ignored — 전체 통과
- hwpp-001.hwp 68페이지 전체 SVG 내보내기: **모든 페이지에서 표 콘텐츠 오버플로우 없음**
  - page 31: max_rect_bottom=1007.20 (body area 1034.07 이내)
  - page 52: max_rect_bottom=955.71 (body area 1034.07 이내)
