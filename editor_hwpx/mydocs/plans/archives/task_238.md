# Task 238 수행계획서: 검색 기능 구현

## 개요

편집 메뉴의 검색 관련 4개 기능을 구현한다.

| 기능 | 단축키 | 설명 |
|------|--------|------|
| 찾기(F) | Ctrl+F | 텍스트 검색 대화상자, 다음/이전 탐색 |
| 찾아바꾸기(E) | Ctrl+F2 | 찾기 + 바꾸기/모두 바꾸기 |
| 다시찾기(X) | Ctrl+L | 마지막 검색어로 다음 결과 이동 |
| 찾아가기(G) | Alt+G | 쪽 번호로 이동 |

## 현재 상태

- `edit:find`, `edit:find-replace` 커맨드가 스텁으로 등록됨 (`canExecute: () => false`)
- 메뉴 HTML 존재 (disabled 상태)
- 단축키: Ctrl+F, Ctrl+H 등록됨 → Ctrl+F2, Ctrl+L, Alt+G 추가 필요
- WASM 검색 API 없음 — 신규 구현 필요

## 구현 범위

### Rust (WASM API)
1. **`searchText(query, fromSec, fromPara, fromChar, forward, caseSensitive)`** — 문서 텍스트 검색
   - 본문 문단 순회, 표/글상자 내 중첩 텍스트 포함
   - 대소문자 구분 옵션
   - 정방향/역방향 검색
   - 결과: `{ found, sec, para, charOffset, length, cellContext? }`
2. **`replaceText(sec, para, charOffset, length, newText, cellContext?)`** — 텍스트 치환
3. **`replaceAll(query, newText, caseSensitive)`** — 전체 치환, 치환 횟수 반환
4. **`getPageOfPosition(sec, para)`** — 위치→쪽 번호 변환 (하이라이트용)

### TypeScript (프론트엔드)
1. **찾기/찾아바꾸기 대화상자** — ModalDialog 기반
   - 찾기 탭: 검색어 입력, 대소문자 구분, 다음 찾기/이전 찾기
   - 바꾸기 탭: 바꿀 내용, 바꾸기/모두 바꾸기
   - 검색 결과 하이라이트 (캔버스 오버레이)
   - 대화상자 열린 상태에서 편집 영역 조작 가능 (모달리스)
2. **찾아가기 대화상자** — 쪽 번호 입력 → 해당 쪽으로 스크롤
3. **커맨드/단축키 연결**
   - `edit:find` (Ctrl+F), `edit:find-replace` (Ctrl+F2), `edit:find-again` (Ctrl+L), `edit:goto` (Alt+G)
4. **메뉴 항목 갱신** — disabled 해제, 누락 항목 추가

## 제외 범위
- 정규식 검색
- 서식 조건 검색
- 조판부호 검색

## 영향 분석

| 파일 | 변경 |
|------|------|
| `src/document_core/queries/` | search_query.rs 신규 |
| `src/document_core/queries/mod.rs` | 모듈 등록 |
| `src/wasm_api.rs` | searchText, replaceText, replaceAll, getPageOfPosition API |
| `rhwp-studio/src/ui/` | find-dialog.ts, goto-dialog.ts 신규 |
| `rhwp-studio/src/command/commands/edit.ts` | 4개 커맨드 구현 |
| `rhwp-studio/src/command/shortcut-map.ts` | Ctrl+F2, Ctrl+L, Alt+G 추가 |
| `rhwp-studio/index.html` | 메뉴 항목 갱신 (다시찾기, 찾아가기 추가) |
| `rhwp-studio/src/core/wasm-bridge.ts` | API 래퍼 |
| `rhwp-studio/src/core/types.ts` | 인터페이스 추가 |
| `rhwp-studio/src/styles/` | find-dialog.css 신규 |

## 검증 계획
- cargo test 통과
- WASM 빌드 성공
- 브라우저 테스트: 찾기→하이라이트→다음/이전, 바꾸기, 모두 바꾸기, 찾아가기
