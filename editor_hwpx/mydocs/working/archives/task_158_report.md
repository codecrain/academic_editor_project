# 타스크 158 완료 보고서: 글상자 세로쓰기 (1단계)

## 작업 요약

글상자(TextBox) 세로쓰기 렌더링 기능을 구현하였다. 표 셀의 세로쓰기 로직을 기반으로 글상자에 맞게 적응하였으며, 표 셀 세로쓰기도 line_seg 기반 칼럼 레이아웃으로 개선하였다.

## 수정 파일 (8개, +623/-187)

| 파일 | 변경 | 내용 |
|------|------|------|
| `src/model/shape.rs` | +2 | Shape 모델 필드 추가 |
| `src/parser/control/shape.rs` | +57/-변경 | Shape 파싱 개선 |
| `src/parser/mod.rs` | +16 | 파서 추가 |
| `src/renderer/height_measurer.rs` | +173/-변경 | 세로쓰기 높이 측정 |
| `src/renderer/layout/shape_layout.rs` | +312/-변경 | 글상자 세로쓰기 핵심 구현 |
| `src/renderer/layout/table_cell_content.rs` | +193/-변경 | 표 셀 세로쓰기 line_seg 기반 개선 |
| `src/renderer/layout/table_layout.rs` | +33/-변경 | 표 레이아웃 세로쓰기 지원 |
| `src/renderer/layout/text_measurement.rs` | +24/-변경 | 텍스트 측정 유틸리티 |

## 주요 구현 내용

### 1. 글상자 세로쓰기 감지 (`shape_layout.rs`)
- `text_box.list_attr & 0x07`로 text_direction 추출 (비트 0~2)
- 표 셀은 비트 16~18 사용하지만, 글상자 LIST_HEADER는 비트 0~2 사용
- text_direction: 0=가로쓰기, 1=영문눕힘, 2=영문세움

### 2. `layout_vertical_textbox_text()` 함수 (shape_layout.rs, ~247줄)
- 표 셀의 `layout_vertical_cell_text()` 로직을 글상자용으로 적응
- 칼럼별 문자 배치: 텍스트 위→아래, 칼럼 오른쪽→왼쪽
- CJK/라틴 문자 판정에 따른 회전 처리
- 칼럼 오버플로우 시 다음 칼럼으로 이동
- 수직 정렬 지원 (Top→우측, Center→중앙, Bottom→좌측)

### 3. 표 셀 세로쓰기 개선 (`table_cell_content.rs`)
- 기존: 글꼴 크기 기반 칼럼 너비 계산
- 변경: line_seg 구조체 기반 칼럼 매핑
  - `line_seg.line_height` → col_width (칼럼 너비)
  - `line_seg.line_spacing` → col_spacing (칼럼 간격)
- `ColumnInfo` 구조체 도입: col_width, col_spacing, total_height, alignment
- 문단별 정렬(alignment) 반영

### 4. 캡션 처리 (`shape_layout.rs`)
- `calculate_caption_height`, `caption_spacing`, `caption_top_offset` 추가
- 캡션이 있는 글상자의 세로쓰기 시 영역 보정

## 미해결 사항

| 항목 | 상태 | 비고 |
|------|------|------|
| 칼럼 너비 한컴 일치 | 미해결 | col_width=line_height(1000HU)가 한컴보다 좁음. vpos 기반 접근 시도했으나 결과 악화로 원복 |
| 기호 대체 | 미구현 | 세로쓰기 시 구두점 방향 회전/대체 (마침표→고리점 등) |
| 회전 속성 UI 연동 | 미구현 | 대화상자에서 회전 각도 설정 → 저장 → 렌더링 |
| 패턴 채우기 검증 | 미검증 | 빗금/격자 등 패턴 렌더링 확인 필요 |
| 도형→글상자 변환 | 미구현 | 우선순위 낮음 |

## line_seg 분석 데이터 (향후 참조)

표 셀 세로쓰기 시 line_seg 값 (10pt 글꼴 기준):
- `line_height` = 1000 HU (칼럼 너비 = 글꼴 크기)
- `line_spacing` = 600 HU (칼럼 간격)
- `vertical_pos` 간격 = 1600 HU (line_height + line_spacing)
- `segment_width` = 10904 HU (칼럼 높이 = 셀 너비)

한컴 렌더링에서는 칼럼이 더 넓게 표시되므로, 향후 칼럼 너비 계산 방식 재검토 필요.

## 테스트

- 608개 전체 테스트 통과
- 회귀 없음
