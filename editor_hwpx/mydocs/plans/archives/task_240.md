# Task 240 수행계획서: 책갈피 기능 구현

## 목표

문서 본문에 이름이 있는 위치 표식(책갈피)을 넣고, 대화상자에서 목록 조회·이동·삭제·이름 바꾸기를 수행하는 기능을 구현한다.

## 한컴 도움말 기반 기능 정의

### 책갈피 대화상자 (Ctrl+K,B)
- **책갈피 이름** — 입력란 (커서 위치 주변 텍스트를 기본값으로 제안)
- **책갈피 목록** — 현재 문서에 등록된 책갈피 표시
- **정렬 기준** — 이름순 / 위치순
- **넣기** — 새 책갈피를 커서 위치에 삽입 (중복 이름 불가)
- **이동** — 선택한 책갈피 위치로 커서 이동
- **삭제** — 선택한 책갈피를 문서에서 제거
- **이름 바꾸기** — 선택한 책갈피 이름 변경

### 동작 규칙
- 같은 이름의 책갈피 중복 등록 불가
- 책갈피는 조판 부호로 삽입 (화면에 보이지 않음, 인쇄·정렬에 영향 없음)
- 조판 부호 표시 모드에서 책갈피 표식 확인 가능

## 현재 코드 상태

### 이미 구현됨 (Rust)
- `Bookmark` 모델 (`src/model/control.rs`) — `name: String`
- HWP 바이너리 파서 (`src/parser/control.rs`) — `parse_bookmark()`
- HWPX XML 파서 (`src/parser/hwpx/section.rs`)
- 직렬화기 (`src/serializer/control.rs`) — `serialize_bookmark()`

### 미구현
- WASM API — 책갈피 목록 조회, 추가, 삭제, 이름 변경, 위치 조회
- 조판 부호 표시 — 조판 부호 모드에서 `[책갈피: 이름]` 마커 렌더링
- TypeScript 대화상자 UI
- 명령/메뉴/단축키 연결

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `src/wasm_api.rs` | 책갈피 CRUD WASM API 추가 |
| `src/document_core/queries/` | 책갈피 조회/조작 쿼리 모듈 |
| `src/renderer/layout/paragraph_layout.rs` | 조판 부호 모드에서 책갈피 마커 렌더링 |
| `rhwp-studio/src/core/wasm-bridge.ts` | WASM API 래퍼 |
| `rhwp-studio/src/core/types.ts` | BookmarkInfo 타입 |
| `rhwp-studio/src/ui/bookmark-dialog.ts` | 책갈피 대화상자 |
| `rhwp-studio/src/styles/bookmark-dialog.css` | 대화상자 스타일 |
| `rhwp-studio/src/command/commands/insert.ts` | `insert:bookmark` 명령 |
| `rhwp-studio/index.html` | 메뉴 항목 활성화 |
| `rhwp-studio/src/command/shortcut-map.ts` | Ctrl+K,B 단축키 |

## 제외 사항
- 블록 책갈피 (선택 영역 기반 책갈피)
- 쉬운 책갈피 (Ctrl+K,1~0 / Ctrl+Q,1~0)
- 하이퍼링크와의 연동
- 교차 참조 기능
