# 타스크 41 단계 3 완료보고서: DIFF-2,3,4,6,8 수정

## 수정 내용

### DIFF-2: CharShape ID 올바른 할당 (심각도: 중간)

**문제**: 셀 문단의 char_shapes가 비어있어 직렬화 시 기본값(id=0)으로 대체됨
**수정**: 셀 문단 보정 코드에서 char_shapes가 비어있으면 기본 CharShapeRef(start_pos=0, char_shape_id=0) 추가

```rust
if cp_para.char_shapes.is_empty() {
    cp_para.char_shapes.push(CharShapeRef {
        start_pos: 0,
        char_shape_id: 0, // 기본 CharShape
    });
}
```

**효과**: 모든 셀 문단이 명시적 CharShapeRef를 가짐. 직렬화 시 PARA_CHAR_SHAPE 레코드에 정확한 데이터 포함.

### DIFF-3: ParaShape ID 올바른 할당 (심각도: 낮음~중간)

**문제**: 기존 문서의 첫 번째 표 셀의 para_shape_id를 재사용하는 복잡한 로직이 잘못된 ID를 반환
**수정**: 기본 "본문" ParaShape(id=0) 사용으로 단순화

```rust
// 수정 전: 기존 표 셀에서 탐색하는 복잡한 로직 (13줄)
// 수정 후:
let cell_para_shape_id: u16 = 0;
```

**효과**: 모든 셀 문단이 기본 본문 ParaShape를 사용. 유효한 참조 보장.

### DIFF-4: BorderFill ID (심각도: 중간)

**상태**: 이미 올바르게 처리됨

`create_border_fill_from_css()`가 1-based ID를 올바르게 반환하고, surgical insert로 DocInfo raw_stream 일관성 유지.

### DIFF-6: 셀 LineSeg 메트릭 (심각도: 낮음)

**상태**: 이미 보정 코드에서 올바르게 처리됨

- `tag = 0x00060000` (bit 17,18 = 정상 HWP 셀 문단 패턴)
- `segment_width = cell_width - left_padding - right_padding`
- `line_height`, `text_height`, `baseline_distance`, `line_spacing` 폰트 크기 기반 계산

### DIFF-8: 표 컨테이너 PARA_LINE_SEG (심각도: 낮음)

**상태**: 이미 표 문단 생성 코드에서 올바르게 처리됨

- `line_height = total_height`, `text_height = total_height`
- `segment_width = total_width`
- `tag = 0x00060000`

## 통합 테스트 검증

`test_parse_table_html_save`: parse_table_html()로 2×2 표(빈 셀 포함) 생성 → 기존 HWP에 삽입 → 저장 → 재파싱

| 항목 | 검증 결과 |
|------|----------|
| DIFF-1 빈 셀 | 셀[1],셀[2]: cc=1, text='', has_para_text=false |
| DIFF-2 CharShape | 모든 셀 cs=1 (명시적 CharShapeRef) |
| DIFF-3 ParaShape | 모든 셀 para_shape_id=0 |
| DIFF-5 TABLE attr | tbl_rec_attr=0x04000006 |
| DIFF-6 LineSeg | tag=0x00060000, seg_width > 0 |
| DIFF-7 instance_id | 0x7C174784 (비-0) |
| DIFF-8 컨테이너 | line_height=2000, seg_width=30000 |

## 생성 파일

- `output/save_test_parsed_table.hwp`: parse_table_html()로 생성한 표가 삽입된 HWP 파일 → HWP 프로그램 확인 필요

## 테스트

- `test_parse_table_html_save`: 통합 테스트 (신규)
- 전체 테스트: 476개 통과 (475 → 476)

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/wasm_api.rs` | DIFF-2: char_shapes 기본값 추가, DIFF-3: cell_para_shape_id 단순화, 통합 테스트 추가 |
