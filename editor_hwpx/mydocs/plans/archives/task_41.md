# 타스크 41: 클립보드 표 붙여넣기 후 저장 파일 손상 수정

## 배경

웹 뷰어에서 HTML 표를 클립보드로 붙여넣기한 후 HWP로 저장하면, 한컴오피스에서 "파일이 손상되었습니다" 오류가 발생한다. 트러블슈팅 분석(`mydocs/troubleshootings/table_paste_file_corruption.md`)에서 9개의 차이점(DIFF-1~9)이 식별되었으며, 그 중 char_count_msb(FIX-1)만 수정 완료된 상태이다.

## 목표

`parse_table_html()` 함수에서 생성하는 Table 컨트롤의 품질을 개선하여, 붙여넣기 후 저장된 HWP 파일이 한글 프로그램에서 정상적으로 열리도록 한다.

## 미수정 항목 요약

| 순위 | 항목 | 심각도 | 원인 요약 |
|------|------|--------|----------|
| 1 | DIFF-1 빈 셀 공백 | 높음 | `&nbsp;` → 공백 변환으로 빈 셀에 불필요한 PARA_TEXT 생성 |
| 2 | DIFF-2 CharShape ID 손실 | 중간 | 모든 셀이 CS_id=0으로 통일 |
| 3 | DIFF-4 BorderFill ID 오프셋 | 중간 | 테이블 border_fill_id 하드코딩 |
| 4 | DIFF-5 TABLE attr 플래그 | 낮음~중간 | bit 1 (셀 분리 금지) 미설정 |
| 5 | DIFF-3 ParaShape ID 오프셋 | 낮음~중간 | 기존 표 셀의 para_shape_id 재사용 |
| 6 | DIFF-6 LineSeg 메트릭 | 낮음 | segWidth=0, flags=0 |
| 7 | DIFF-7 인스턴스 ID | 낮음 | instance_id=0 |
| 8 | DIFF-8 표 컨테이너 LineSeg | 낮음 | 표 문단 높이 부정확 |
| 9 | DIFF-9 원본 표 BF ID | 낮음 | 재직렬화 부작용 |

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/wasm_api.rs` | `parse_table_html()` 내 9개 DIFF 수정 |

## 검증

1. 테스트 파일(`template/empty-step2-p.hwp` vs 수정 결과)로 레코드 비교
2. 저장된 HWP 파일이 한글 프로그램에서 정상 오픈
3. `cargo test` 전체 테스트 통과
4. `wasm-pack build` WASM 빌드 성공
