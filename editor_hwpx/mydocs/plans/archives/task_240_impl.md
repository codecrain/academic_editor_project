# Task 240 구현 계획서: 책갈피 기능 구현

## 단계별 구현 계획

### 1단계: Rust WASM API — 책갈피 CRUD + F11 지원

- `src/document_core/queries/bookmark_query.rs` 신규
  - 문서 전체 순회하여 책갈피 목록 반환 (이름, 위치: sec/para/ctrl_idx)
  - 책갈피 추가 (커서 위치 문단의 controls에 Bookmark 삽입 + recompose)
  - 책갈피 삭제 (sec/para/ctrl_idx로 컨트롤 제거 + recompose)
  - 책갈피 이름 변경
- `src/wasm_api.rs`에 WASM 바인딩 추가
  - `getBookmarks() → JSON [{name, sec, para, ctrlIdx}]`
  - `addBookmark(sec, para, charOffset, name) → JSON {ok, error?}`
  - `deleteBookmark(sec, para, ctrlIdx) → JSON {ok}`
  - `renameBookmark(sec, para, ctrlIdx, newName) → JSON {ok, error?}`
- `src/document_core/commands/text_editing.rs` — `classify_control()`에 `Control::Bookmark` 추가
  - F11이 책갈피 컨트롤도 선택 대상으로 인식하도록 함
- `cargo test` 통과 확인

### 2단계: 조판 부호 모드 책갈피 마커 렌더링

- `src/renderer/layout/paragraph_layout.rs` 수정
  - 문단의 컨트롤 목록에서 Bookmark를 감지
  - `show_control_codes` 모드일 때 `[책갈피: 이름]` 텍스트 마커 삽입
  - 기존 `[누름틀 시작/끝]` 패턴과 동일한 방식 (축소 폰트, 색상 구분)
- WASM 재빌드 + 조판 부호 모드에서 기존 HWP 파일의 책갈피 표시 확인

### 3단계: TypeScript 대화상자 UI

- `rhwp-studio/src/core/types.ts` — `BookmarkInfo` 타입 추가
- `rhwp-studio/src/core/wasm-bridge.ts` — WASM API 래퍼 4종
- `rhwp-studio/src/ui/bookmark-dialog.ts` — 책갈피 대화상자
  - 책갈피 이름 입력란
  - 책갈피 목록 (이름순/위치순 정렬)
  - 넣기/이동/삭제/이름 바꾸기/닫기 버튼
  - 중복 이름 검증 + 에러 메시지
- `rhwp-studio/src/styles/bookmark-dialog.css` — 스타일
- `rhwp-studio/src/style.css` — CSS import

### 4단계: 명령·메뉴·단축키 연결 및 테스트

- `insert.ts` — `insert:bookmark` 명령 구현
- `index.html` — 메뉴 > 입력 > 책갈피 항목 추가/활성화
- `shortcut-map.ts` — Ctrl+K,B 단축키
- F11 책갈피 선택 시 TypeScript 쪽 처리 추가 (handleF11에서 bookmark 타입 분기)
- 찾아가기 대화상자에 책갈피 탭 추가 (GotoDialog 확장)
- 동작 테스트
  - 메뉴 > 입력 > 책갈피 → 대화상자 열기 → 넣기
  - 조판 부호 모드에서 `[책갈피: 이름]` 마커 확인
  - F11로 책갈피 선택 → 수정/삭제
  - 찾아가기 > 책갈피로 이동
- 오늘할일 상태 갱신
