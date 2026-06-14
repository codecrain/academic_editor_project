# Task 238 구현 계획서: 검색 기능 구현

## 단계 구성 (4단계)

### 1단계: WASM 검색 엔진 (Rust)

**목표**: 문서 텍스트 검색/치환 네이티브 API 구현

- `src/document_core/queries/search_query.rs` 신규 생성
  - `search_text_native(query, from_sec, from_para, from_char, forward, case_sensitive)` — 본문 문단 순회 검색
    - section → paragraph → text 순회
    - 표 셀, 글상자 등 중첩 컨트롤 내부 텍스트도 검색
    - 대소문자 무시 옵션 (소문자 변환 비교)
    - 정방향: 현재 위치 이후부터, 문서 끝까지 → 문서 처음부터 현재 위치까지 (wrap-around)
    - 역방향: 현재 위치 이전부터, 문서 처음까지 → 문서 끝부터 현재 위치까지
  - `replace_text_native(sec, para, char_offset, length, new_text, cell_context_json)` — 단일 치환
    - 기존 `delete_text` + `insert_text` 조합
    - recompose_section 호출
  - `replace_all_native(query, new_text, case_sensitive)` — 전체 치환
    - 문서 전체 순회, 모든 일치 항목 치환
    - 치환 횟수 반환
- `src/document_core/queries/mod.rs` — 모듈 등록
- `src/wasm_api.rs` — 4개 API 노출 (searchText, replaceText, replaceAll, getPageOfPosition)
- cargo test 통과 확인

### 2단계: 프론트엔드 API 연결 및 커맨드/단축키

**목표**: WASM API 래퍼 + 커맨드 시스템 연결

- `rhwp-studio/src/core/types.ts` — SearchResult, ReplaceResult 인터페이스
- `rhwp-studio/src/core/wasm-bridge.ts` — searchText, replaceText, replaceAll 래퍼
- `rhwp-studio/src/command/shortcut-map.ts` — 단축키 추가
  - Ctrl+F → `edit:find` (기존)
  - Ctrl+F2 → `edit:find-replace` (추가)
  - Ctrl+L → `edit:find-again` (추가)
  - Alt+G → `edit:goto` (추가)
- `rhwp-studio/src/command/commands/edit.ts` — 4개 커맨드 execute 구현 연결
- `rhwp-studio/index.html` — 메뉴 항목 갱신 (disabled 해제, 다시찾기/찾아가기 추가)

### 3단계: 찾기/찾아바꾸기 대화상자

**목표**: 검색 UI 구현

- `rhwp-studio/src/ui/find-dialog.ts` 신규
  - ModalDialog 기반이되, 모달리스 동작 (편집 영역 조작 가능)
  - 모드: 찾기 / 찾아바꾸기 (탭 또는 토글)
  - 찾기 입력란, 대소문자 구분 체크박스
  - 다음 찾기 / 이전 찾기 버튼
  - 바꾸기 입력란, 바꾸기 / 모두 바꾸기 버튼 (바꾸기 모드만)
  - 검색 결과 위치로 커서 이동 + 스크롤
  - 검색어 하이라이트 (선택 영역으로 표시)
  - 다시찾기(Ctrl+L): 대화상자 없이 마지막 검색어로 다음 검색
- `rhwp-studio/src/styles/find-dialog.css` 신규
- `rhwp-studio/src/style.css` — import 추가

### 4단계: 찾아가기 대화상자 및 최종 검증

**목표**: 찾아가기 + 통합 테스트

- `rhwp-studio/src/ui/goto-dialog.ts` 신규
  - 쪽 번호 입력 → 해당 쪽 첫 위치로 스크롤
  - 범위 검증 (1 ~ 총 쪽 수)
- WASM 빌드
- 브라우저 통합 테스트
  - 찾기: 검색어 입력 → 하이라이트 → 다음/이전
  - 바꾸기: 단일 바꾸기 → 모두 바꾸기
  - 다시찾기: Ctrl+L로 반복
  - 찾아가기: 쪽 번호 이동
- 최종 보고서 작성
