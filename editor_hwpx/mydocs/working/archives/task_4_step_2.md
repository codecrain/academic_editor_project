# 타스크 4 - 2단계 완료 보고서: 문서 구조 구성 (Document Composition)

## 구현 내용

### 신규 파일

| 파일 | 라인 | 역할 |
|------|------|------|
| `src/renderer/composer.rs` | 351 | 문서 구성 모듈 |

### 수정 파일

| 파일 | 변경 | 역할 |
|------|------|------|
| `src/model/paragraph.rs` | +3줄 | `char_offsets: Vec<u32>` 필드 추가 |
| `src/parser/body_text.rs` | ~50줄 수정 | `parse_para_text()` → `(String, Vec<u32>)` 반환, 위치 매핑 생성 |
| `src/renderer/mod.rs` | +1줄 | `pub mod composer;` 등록 |

### 구현 구조체

| 구조체 | 설명 |
|--------|------|
| `ComposedTextRun` | 줄 내 동일 스타일 텍스트 조각 (text + char_style_id) |
| `ComposedLine` | 줄별 TextRun 목록 + LineSeg 레이아웃 정보 |
| `ComposedParagraph` | 구성된 문단 (lines + para_style_id + inline_controls) |
| `InlineControl` | 인라인 컨트롤 위치 정보 (line_index + control_type) |

### 핵심 알고리즘

**1. UTF-16 위치 매핑** (parse_para_text 수정)
```
원본 UTF-16: [ctrl 8units][A][B][C]
text = "ABC"
char_offsets = [8, 9, 10]
→ char_offsets[i] = text[i]의 원본 UTF-16 코드 유닛 위치
```

**2. 줄별 텍스트 분할** (compose_lines)
```
LineSeg[0].text_start = 0, LineSeg[1].text_start = 5
char_offsets를 이용하여 UTF-16 위치 → 텍스트 인덱스 변환
→ line[0] = text[0..5], line[1] = text[5..]
```

**3. CharShapeRef 기반 다중 TextRun** (split_by_char_shapes)
```
줄 텍스트 "AAABBB", CharShapeRef: [{pos:0, id:1}, {pos:3, id:2}]
→ TextRun("AAA", style=1), TextRun("BBB", style=2)
```

### 버그 수정

**dedup_by_key 순서 버그**
- 문제: 줄 시작 이전의 CharShapeRef가 여러 개 매핑될 때, `dedup_by_key`가 첫 번째(오래된 스타일)를 유지
- 수정: `reverse → dedup → reverse`로 마지막(최신 스타일)을 유지

## 테스트 결과

| 항목 | 결과 |
|------|------|
| 전체 테스트 | **202개 통과** (177 기존 + 14 style_resolver + 11 composer) |
| 빌드 | 성공 (경고 0개) |

### 신규 테스트 (11개)

| 테스트 | 검증 내용 |
|--------|----------|
| test_compose_single_line_single_style | 단일 줄, 단일 스타일 |
| test_compose_single_line_multi_style | 단일 줄, 다중 스타일 분할 |
| test_compose_multi_line | 다중 줄 텍스트 분할 |
| test_compose_multi_line_multi_style | 다중 줄 + 다중 스타일 |
| test_compose_empty_paragraph | 빈 문단 처리 |
| test_compose_no_line_segs | LineSeg 없는 문단 |
| test_compose_with_ctrl_char_gap | 확장 컨트롤 문자 위치 격차 |
| test_identify_inline_controls_table | 표 컨트롤 식별 |
| test_utf16_range_to_text_range | UTF-16 → 텍스트 인덱스 변환 |
| test_utf16_range_no_offsets | 오프셋 없는 1:1 매핑 |
| test_find_active_char_shape | 활성 CharShapeRef 탐색 |

## 상태

- 완료일: 2026-02-05
- 상태: 승인 완료
