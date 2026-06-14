# 타스크 194 구현 계획서 — 머리말/꼬리말 관리 기능

## 1단계: 머리말/꼬리말 삭제 기능 + 도구상자 고도화

### Rust
- `header_footer_ops.rs`에 `delete_header_footer_native` 추가
  - 구역의 문단에서 해당 Header/Footer 컨트롤을 찾아 제거
  - 재페이지네이션 트리거
- `wasm_api.rs`에 `deleteHeaderFooter` WASM 바인딩 추가

### TypeScript
- `wasm-bridge.ts`에 `deleteHeaderFooter` 메서드 추가
- `page.ts`에 `page:headerfooter-delete` 커맨드 추가
  - 편집 모드 탈출 → 컨트롤 삭제 → 캔버스 갱신

### HTML/CSS
- `.tb-headerfooter-group` 도구상자 확장:
  ```
  [머리말(양쪽)] | [이전] [다음] | [닫기] [지우기]
  ```
- [지우기] 버튼: `data-cmd="page:headerfooter-delete"`
- [이전]/[다음] 버튼: 1단계에서는 UI만 배치, 2단계에서 동작 연결

## 2단계: 이전/다음 머리말·꼬리말 이동

### Rust
- `header_footer_ops.rs`에 `get_header_footer_list_native` 추가
  - 현재 구역 + 전체 구역의 머리말/꼬리말 목록 반환
  - JSON: `[{sectionIdx, isHeader, applyTo, label}, ...]`

### TypeScript
- `wasm-bridge.ts`에 `getHeaderFooterList` 메서드 추가
- `cursor.ts`에 `switchHeaderFooter(sectionIdx, isHeader, applyTo)` 추가
  - 현재 편집 중인 머리말/꼬리말에서 다른 것으로 전환
- `page.ts`에 `page:headerfooter-prev`, `page:headerfooter-next` 커맨드 추가
  - 목록에서 현재 위치의 이전/다음 항목으로 이동
  - 도구상자 레이블 갱신

## 3단계: 감추기 기능 + 테스트 검증

### Rust
- `model/document.rs`의 `Section` 또는 `PageContent`에 감추기 플래그 추가
  - `hide_header_on_pages: HashSet<usize>` / `hide_footer_on_pages: HashSet<usize>`
- `header_footer_ops.rs`에 `toggle_hide_header_footer_native` 추가
  - 특정 페이지의 머리말/꼬리말 감추기 토글
- 렌더러 `layout.rs`의 `build_header`/`build_footer`에서 감추기 플래그 확인
  - 플래그가 있으면 빈 노드만 생성 (영역은 유지, 내용만 비움)

### TypeScript
- `wasm-bridge.ts`에 `toggleHideHeaderFooter` 추가
- `page.ts`에 `page:hide-headerfooter` 커맨드 추가

### 최종 검증
- Rust 테스트 추가 (삭제, 목록 조회, 감추기)
- TypeScript 컴파일 확인
- WASM 빌드
