# 타스크 60: 표의 셀 높이 처리 개선 — 구현계획서

## 1단계: height_measurer.rs 수정 (~30줄)

### height_measurer.rs

1. `measure_table()` 시그니처에 `styles: &ResolvedStyleSet` 파라미터 추가
2. `measure_section()` 호출부에 `styles` 인자 전달
3. Phase 2 (line 253-276): 각 문단에서 spacing_before/after 조회 → content_height에 합산, last_line_spacing 빼기 제거
4. MeasuredCell (line 328-346): line_heights에 spacing fold (첫 줄에 spacing_before, 마지막 줄에 spacing_after), 마지막 줄 line_spacing 유지

## 2단계: layout.rs 수정 (~50줄)

### layout.rs

1. `layout_table()` Phase 1-b: 문단별 spacing_before/after 합산, last_line_spacing 빼기 제거
2. `layout_table()` 수직 정렬 높이: .zip(cell.paragraphs)로 para_shape_id 접근, spacing 합산
3. `layout_partial_table()` 비분할 셀 높이: 동일 수정
4. `layout_partial_table()` 분할 셀 높이: spacing_before (start==0), spacing_after (end==total) 조건부 합산
5. `compute_cell_line_ranges()`: styles 파라미터 추가, 첫 줄에 spacing_before fold, 마지막 줄에 spacing_after fold

## 3단계: 빌드 검증 + 테스트 + 시각 확인

1. `docker compose --env-file /dev/null run --rm dev` — 네이티브 빌드
2. `docker compose --env-file /dev/null run --rm test` — 전체 테스트 (기존 480개 통과)
3. `docker compose --env-file /dev/null run --rm wasm` — WASM 빌드
4. k-water-rfp.hwp SVG 시각 검증: 셀 내 텍스트 오버플로 해소 확인
