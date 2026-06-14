# 타스크 193 — 1단계 완료 보고서

## 완료 내용: WASM API 및 Rust 편집 함수 구현

### 신규 파일
- **`src/document_core/commands/header_footer_ops.rs`** — 머리말/꼬리말 CRUD 및 텍스트 편집 함수

### 수정 파일
- **`src/document_core/commands/mod.rs`** — header_footer_ops 모듈 등록
- **`src/wasm_api.rs`** — 10개 WASM API 바인딩 추가
- **`src/document_core/queries/cursor_rect.rs`** — 커서 좌표 계산 및 히트테스트 함수 추가

### 구현된 Rust Native 함수 (DocumentCore)

| 함수 | 설명 |
|------|------|
| `get_header_footer_native` | 머리말/꼬리말 존재 여부 및 정보 조회 |
| `create_header_footer_native` | 빈 머리말/꼬리말 생성 (Both/Even/Odd) |
| `insert_text_in_header_footer_native` | 머리말/꼬리말 내 텍스트 삽입 |
| `delete_text_in_header_footer_native` | 머리말/꼬리말 내 텍스트 삭제 |
| `split_paragraph_in_header_footer_native` | 머리말/꼬리말 내 문단 분할 (Enter) |
| `merge_paragraph_in_header_footer_native` | 머리말/꼬리말 내 문단 병합 (Backspace) |
| `get_header_footer_para_info_native` | 머리말/꼬리말 문단 정보 조회 |
| `get_cursor_rect_in_header_footer_native` | 머리말/꼬리말 내 커서 좌표 계산 |
| `hit_test_header_footer_native` | 페이지 좌표 → 머리말/꼬리말 영역 판별 |

### 구현된 WASM API (JavaScript 호출용)

| JS 이름 | 설명 |
|---------|------|
| `getHeaderFooter(sectionIdx, isHeader, applyTo)` | 조회 |
| `createHeaderFooter(sectionIdx, isHeader, applyTo)` | 생성 |
| `insertTextInHeaderFooter(...)` | 텍스트 삽입 |
| `deleteTextInHeaderFooter(...)` | 텍스트 삭제 |
| `splitParagraphInHeaderFooter(...)` | 문단 분할 |
| `mergeParagraphInHeaderFooter(...)` | 문단 병합 |
| `getHeaderFooterParaInfo(...)` | 문단 정보 |
| `getCursorRectInHeaderFooter(...)` | 커서 좌표 |
| `hitTestHeaderFooter(pageNum, x, y)` | 영역 히트테스트 |

### 내부 헬퍼 함수
- `find_header_footer_control` — 구역의 문단에서 Header/Footer 컨트롤 위치 탐색
- `get_hf_paragraph_mut/ref` — 머리말/꼬리말 내부 문단 참조 접근
- `reflow_hf_paragraph` — 머리말/꼬리말 문단 리플로우 (페이지 텍스트 영역 폭 기반)
- `find_section_for_page` — 페이지 번호 → 구역 인덱스 변환
- `get_active_hf_apply_to` — 활성 머리말/꼬리말의 applyTo 값 추출

### 테스트 결과
- **664개 전체 통과** (기존 657개 + 신규 7개)
- 신규 테스트:
  - `test_create_and_get_header` / `test_create_and_get_footer`
  - `test_duplicate_create_fails`
  - `test_insert_text_in_header` / `test_delete_text_in_header`
  - `test_split_merge_paragraph_in_header`
  - `test_odd_even_header`

### 설계 요점
1. **Header/Footer는 문단 컨트롤**: `section.paragraphs[0].controls`에 `Control::Header(Box<Header>)` 형태로 저장
2. **applyTo 매핑**: 0=Both(양쪽), 1=Even(짝수), 2=Odd(홀수)
3. **리플로우**: 머리말/꼬리말 영역 폭 = `page_width - margin_left - margin_right`
4. **커서 좌표**: 렌더 트리에서 Header/Footer 노드 하위의 TextRun을 탐색, `para_index = usize::MAX - hf_para_idx` 마커 사용
