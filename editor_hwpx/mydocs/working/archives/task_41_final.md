# 타스크 41 최종 결과보고서: 클립보드 표 붙여넣기 후 저장 파일 손상 수정

## 목표

`parse_table_html()` 함수에서 생성하는 Table 컨트롤의 품질을 개선하여, 붙여넣기 후 저장된 HWP 파일이 한글 프로그램에서 정상적으로 열리도록 한다.

## 수행 결과

### 핵심 발견: char_count_msb 문맥 의존성

기존 FIX-1에서 MSB=true로 수정했으나, 기존 내용이 있는 문서에 표를 삽입하면 "표 이후 내용이 사라지는" 문제 발생.

**원인**: HWP의 char_count MSB 플래그는 문서 구조에 따라 달라야 함:
- 빈 문서: MSB=1 (표가 유일한 콘텐츠)
- 기존 내용 있는 문서: MSB=0 (표 이후 문단이 있음)

**진단 방법**: 기존 표 문단을 복제 삽입(성공) vs parse_table_html 생성 삽입(실패) 바이트 레벨 비교로 PARA_HEADER의 char_count MSB 차이 발견.

### 수정된 DIFF 항목 (총 8개 + FIX-1 재수정)

| 항목 | 심각도 | 수정 내용 | 효과 |
|------|--------|----------|------|
| FIX-1 | **최고** | 표 문단 char_count_msb = false | 표 이후 내용 정상 렌더링 |
| DIFF-1 | 높음 | &nbsp; → 빈 셀 처리 (cc=1, PARA_TEXT 없음) | 레코드 구조 정상화 |
| DIFF-2 | 중간 | 셀 문단에 기본 CharShapeRef 추가 | 문자 서식 참조 유효 |
| DIFF-3 | 낮음~중간 | cell_para_shape_id = 0 (기본 본문) | 문단 서식 참조 유효 |
| DIFF-4 | 중간 | create_border_fill_from_css() + surgical insert | 테두리/배경 참조 정확 |
| DIFF-5 | 낮음~중간 | raw_table_record_attr = 0x04000006 | 셀 분리 금지 항상 설정 |
| DIFF-6 | 낮음 | tag=0x00060000, seg_width 계산 | 셀 LineSeg 메트릭 정상 |
| DIFF-7 | 낮음 | 해시 기반 비-0 instance_id | CTRL_HEADER 인스턴스 ID 유효 |
| DIFF-8 | 낮음 | total_height/total_width 기반 | 표 컨테이너 LineSeg 정상 |

### 추가 발견: DocInfo 재직렬화 버그

DocInfo를 완전히 재직렬화하면 복잡한 문서에서 파일 손상 발생. 워크어라운드로 DocInfo raw_stream을 유지하고 Section만 재직렬화. 새 BorderFill/CharShape 추가 시 surgical insert로 raw_stream 부분 변경.

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/wasm_api.rs` | parse_table_html() 내 DIFF-1~8 + FIX-1 재수정 |

## 검증

### 테스트
- 전체 테스트: 477개 통과 (473 → 477, 4개 테스트 추가)
- 추가된 테스트:
  - `test_inject_table_into_existing`: 복제 표 삽입 검증
  - `test_diff1_empty_cell_nbsp`: DIFF-1 빈 셀 검증
  - `test_diag_clone_vs_parsed_table`: 복제 vs 생성 바이트 비교 진단
  - `test_parse_table_html_save`: parse_table_html 통합 검증

### HWP 프로그램 검증
- `output/save_test_table_inject.hwp` (복제 표): 정상 오픈, 전체 내용 렌더링 ✓
- `output/save_test_parsed_table.hwp` (parse_table_html 표): 정상 오픈, 전체 내용 렌더링 ✓

## 단계별 진행 이력

| 단계 | 내용 | 결과 |
|------|------|------|
| 1 | 기존 HWP에 프로그래밍 표 삽입 검증 | DocInfo 재직렬화 버그 발견, 복제 표 방식으로 정상 동작 확인 |
| 2 | DIFF-1, DIFF-5, DIFF-7 수정 | 빈 셀 처리, TABLE attr, instance_id 수정 |
| 3 | DIFF-2,3,4,6,8 수정 | CharShape/ParaShape ID, LineSeg 메트릭 수정 |
| 추가 | char_count_msb 재수정 | 바이트 레벨 비교로 MSB=false가 정답임을 발견, 표 이후 내용 정상 표시 |
