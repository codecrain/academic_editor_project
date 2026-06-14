# 타스크 95 구현 계획서

## 단계 1: 모델 정의 + 파서 수정

### 모델
- `src/model/header_footer.rs`: MasterPage 구조체 추가 (apply_to, paragraphs, text_width, text_height, text_ref, num_ref, raw_list_header)
- `src/model/document.rs`: SectionDef에 `master_pages: Vec<MasterPage>` 필드 추가

### 파서
- `src/parser/body_text.rs`: `parse_section_def()` 수정
  - `parse_master_pages_from_raw()` 함수 신규 작성
  - extra_child_records에서 LIST_HEADER(tag 66) 순서대로 탐색
  - LIST_HEADER data에서 바탕쪽 정보 파싱 (표 139, 10바이트)
  - LIST_HEADER 이후 레코드에서 parse_paragraph_list() 재사용
  - 순서에 따라 apply_to: Both → Odd → Even
  - extra_child_records는 변경하지 않음 (직렬화 보존)

## 단계 2: 페이지네이션

- `src/renderer/pagination.rs`:
  - MasterPageRef 구조체 추가
  - PageContent에 active_master_page 필드 추가
  - 구역별 master_pages 수집 → 홀수/짝수 페이지 선택 로직
  - hide_master_page 플래그 반영

## 단계 3: 레이아웃 + 렌더러

- `src/renderer/render_tree.rs`: RenderNodeType::MasterPage 추가
- `src/renderer/layout.rs`: build_render_tree()에 sections 파라미터 추가, MasterPage 노드 삽입
- `src/renderer/svg.rs`: MasterPage 노드 렌더링 분기
- `src/renderer/web_canvas.rs`: MasterPage 노드 렌더링 분기
- `src/wasm_api.rs`: build_page_tree 호출 시 sections 전달

## 단계 4: 빌드 및 검증

- docker compose run --rm test → Rust 테스트 통과
- docker compose run --rm wasm → WASM 빌드
- npm run build → Vite 빌드
- 바탕쪽 포함 HWP 파일 SVG/Canvas 렌더링 확인
