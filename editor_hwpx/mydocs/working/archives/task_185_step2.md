# 타스크 185 - 2단계 완료 보고서: HeightMeasurer 높이 계산 수정

## 수정 내용

### 수정 파일
- `src/renderer/height_measurer.rs` — `measure_paragraph()` 메서드

### 수정 사항

HeightMeasurer의 `measure_paragraph()`에서 composed line 데이터를 사용할 때, layout의 `layout_paragraph()`와 동일한 line_height 보정 로직을 추가.

**보정 조건**: `raw_line_height < max_font_size` (해당 줄의 최대 폰트 크기)

**보정 공식** (ParaShape의 line_spacing_type에 따라):
- Percent: `max_fs * line_spacing / 100.0`
- Fixed: `line_spacing.max(max_fs)`
- SpaceOnly: `max_fs + line_spacing`
- Minimum: `line_spacing.max(max_fs)`

최종값: `computed.max(max_fs)` (폰트 크기 이하로 내려가지 않도록)

### 구현 세부사항

각 composed line에서:
1. `line.runs`의 `char_style_id`로 CharStyle 조회하여 `font_size` 최대값 산출
2. `raw_lh < max_fs`이면 ParaShape의 줄간격 설정으로 보정
3. 보정된 line_height를 높이 합산에 사용

## 검증 결과

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| Overflow 건수 | 31건 | 1건 |
| 총 페이지 수 | 66 | 67 |
| 테스트 통과 | 657/657 | 657/657 |

- 페이지 수 증가(66→67)는 정상: 문단이 올바르게 다음 페이지로 넘어감
- 잔여 1건은 page 23의 Table(para 199) — 표 분할 관련 기존 버그로, 본 타스크 범위 외

## 참조

- 보정 원본 코드: `paragraph_layout.rs:562-578`
- 1단계 진단 보고서: `mydocs/working/task_185_step1.md`
