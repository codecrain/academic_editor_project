# 타스크 4 - 4단계 완료 보고서: 표 렌더링 + 각주 렌더링 + 통합 검증

## 구현 내용

### 수정 파일

| 파일 | 변경 | 역할 |
|------|------|------|
| `src/renderer/layout.rs` | ~200줄 추가 | 각주 영역 렌더링, 윗첨자 참조번호, 들여쓰기 클램프 |
| `src/renderer/pagination.rs` | ~60줄 추가 | FootnoteRef/FootnoteSource 구조체, 각주 수집 로직 |
| `src/renderer/page_layout.rs` | ~15줄 추가 | update_footnote_area() 동적 각주 영역 계산 |
| `src/parser/control.rs` | ~10줄 수정 | find_list_header_paragraphs 레벨 버그 수정 |
| `src/parser/body_text.rs` | ~5줄 수정 | FootnoteShape 28바이트 파싱 수정 |
| `src/wasm_api.rs` | ~15줄 수정 | FootnoteShape 전달 경로 추가 |

### 핵심 변경 사항

**1. 문단 들여쓰기/내어쓰기 (layout.rs)**

- `layout_composed_paragraph()`의 줄별 x좌표 계산에 indent 반영
- 첫 번째 줄에만 indent 적용 (들여쓰기/내어쓰기 모두)
- 음수 x좌표 방지: `(margin_left + line_indent).max(0.0)` 클램프

**2. 각주 수집 인프라 (pagination.rs)**

- `FootnoteRef` 구조체: 각주 번호 + 출처(본문/테이블셀) 추적
- `FootnoteSource` enum: `Body { para_index, control_index }`, `TableCell { ... }`
- `PageContent.footnotes`: 페이지별 각주 목록
- 본문 문단 및 표 셀 내 `Control::Footnote` 감지 → 현재 페이지에 수집

**3. 각주 영역 렌더링 (layout.rs)**

- `layout_footnote_area()`: 구분선 + 각주 문단 레이아웃
- `layout_footnote_paragraph_with_number()`: 각주 번호(1)~5)) + 문단 텍스트
- `estimate_footnote_area_height()`: 각주 영역 높이 사전 계산
- `get_footnote_paragraphs()`: FootnoteRef → 실제 Footnote.paragraphs 참조

**4. 각주 윗첨자 참조번호 (layout.rs)**

- `add_footnote_superscripts()`: 문단 내 각주 컨트롤 → 윗첨자 렌더링
- 본문 폰트의 60% 크기, 35% 위로 올림
- 본문 폰트 패밀리 상속 (휴먼명조 등)
- 본문 FullParagraph + 표 셀 양쪽에서 호출

### 파서 버그 수정

**1. find_list_header_paragraphs 레벨 버그 (control.rs)**

- 문제: `level > base_level` 필터가 LIST_HEADER와 PARA_HEADER가 같은 레벨인 경우 빈 결과 반환
- 원인: 표 셀 내 각주에서 자식 레코드가 같은 레벨에 배치됨
- 수정: LIST_HEADER 이후 모든 레코드를 `parse_paragraph_list()`에 전달

**2. FootnoteShape 바이트 정렬 (body_text.rs)**

- 문제: 구분선 색상이 #010100 (검정이어야 함 → #000000)
- 원인: 스펙은 26바이트이나 실제 레코드는 28바이트 (미문서화 2바이트 존재)
- 수정: `note_spacing`과 `separator_line_type` 사이에 `_unknown = r.read_u16()` 추가
- 추가: attr 필드에서 number_format, numbering, placement 파싱

## SVG 검증 결과

참조 이미지 `2014-08-hwp.png`와 비교:

| 항목 | 결과 |
|------|------|
| 표 셀 내 윗첨자 1)~5) | 렌더링됨 (휴먼명조 10.4px, 위치 정확) |
| 각주 구분선 | #000000, 0.5px, 본문 폭의 약 28% |
| 각주 텍스트 1)~5) | 모두 렌더링됨 (바탕 14.4px + 휴먼명조 16px) |
| 음수 x좌표 | 없음 (클램프 적용) |
| 들여쓰기 | 적용됨 |

## 테스트 결과

| 항목 | 결과 |
|------|------|
| 전체 테스트 | **213개 통과** |
| 빌드 | 성공 (경고 0개) |

## 상태

- 완료일: 2026-02-06
- 상태: 승인 대기
