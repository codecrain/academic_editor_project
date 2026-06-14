# 타스크 95 최종 결과 보고서

## 타스크명
바탕쪽(Master Page) 기능 구현

## 작업 기간
2026-02-16

## 수정 내역

### 1. MasterPage 모델 정의
- `header_footer.rs`에 `MasterPage` 구조체 추가
- `HeaderFooterApply` 열거형 재사용 (Both/Odd/Even)
- 필드: apply_to, paragraphs, text_width, text_height, text_ref, num_ref, raw_list_header
- `SectionDef`에 `master_pages: Vec<MasterPage>` 필드 추가 (렌더링 전용)

### 2. 바탕쪽 파서 구현
- `parse_master_pages_from_raw()` 함수 신규 작성
- `extra_child_records`에서 **최상위 레벨** LIST_HEADER만 바탕쪽으로 파싱
  - 하위 레벨 LIST_HEADER는 도형 내부 텍스트박스 (레벨 필터링으로 구분)
- LIST_HEADER 표준 프리픽스(8바이트) 이후 바탕쪽 정보(10바이트) 파싱 (HWP 스펙 표 139)
- `parse_paragraph_list()` 재사용하여 문단 추출
- 순서에 따라 apply_to: 1번째=Both, 2번째=Odd, 3번째=Even
- `extra_child_records`는 그대로 유지 (직렬화 보존)

### 3. 페이지네이션 바탕쪽 선택 로직
- `MasterPageRef` 구조체 추가 (section_index, master_page_index)
- `PageContent`에 `active_master_page: Option<MasterPageRef>` 필드 추가
- 구역별 master_pages에서 홀수/짝수 페이지에 맞는 바탕쪽 선택
- `hide_master_page` 플래그 반영
- 머리말/꼬리말과 동일한 Both→Odd/Even 우선순위 패턴

### 4. 렌더 트리 + 레이아웃
- `RenderNodeType::MasterPage` 추가
- `build_render_tree()`에 `active_master_page: Option<&MasterPage>` 파라미터 추가
- PageBackground 이후, Header 이전에 MasterPage 노드 삽입
- 바탕쪽 도형(Shape/Picture/Table)은 전체 용지(page_area) 기준 렌더링
- 렌더링 계층: PageBackground < **MasterPage** < Header < Body < FootnoteArea < Footer

### 5. Page 기준 도형 body-clip 밖 렌더링
- `HorzRelTo::Page` / `VertRelTo::Page` 기준 도형도 body-clip 밖에 배치
- 기존 `Paper`만 체크하던 조건을 `Paper | Page`로 확장
- 편집용지 여백과 무관하게 전체 용지에 렌더링

### 6. 디버그 출력 개선
- `main.rs` dump 모드에서 바탕쪽 상세 정보 출력 (개수, apply_to, 문단수, 컨트롤 목록)

## 수정 파일 (9개)

| 파일 | 수정 내용 |
|------|----------|
| `src/model/header_footer.rs` | MasterPage 구조체 추가 |
| `src/model/document.rs` | SectionDef.master_pages 필드 추가 |
| `src/parser/body_text.rs` | parse_master_pages_from_raw() 바탕쪽 파서 + 레벨 필터링 |
| `src/renderer/pagination.rs` | MasterPageRef, PageContent.active_master_page |
| `src/renderer/render_tree.rs` | RenderNodeType::MasterPage |
| `src/renderer/layout.rs` | 바탕쪽 도형 렌더링, Page 기준 body-clip 밖 배치 |
| `src/wasm_api.rs` | 페이지네이션 바탕쪽 선택 + build_page_tree 연동 |
| `src/main.rs` | 바탕쪽 dump 상세 정보 출력 |
| `mydocs/orders/20260216.md` | 타스크 상태 갱신 |

## 검증 결과

- Rust 테스트: 532개 통과, 0개 실패
- Native 빌드: 성공
- WASM 빌드: 성공
- Vite 빌드: 성공
- SVG 내보내기: BookReview.hwp 정상 출력 확인
- 웹 Canvas: BookReview.hwp 정상 렌더링 확인
  - 2페이지: 바탕쪽 분홍색 글상자 렌더링
  - 1페이지: Page 기준 텍스트박스 용지 좌우 꽉 차게 렌더링

## 직렬화 보존

`extra_child_records`는 변경하지 않았으며, 바탕쪽 raw 레코드는 기존대로 보존되어 직렬화 시 복원됨. `master_pages` 필드는 렌더링 전용.

## 브랜치
- 작업 브랜치: `local/task95`
- main 머지: 완료
