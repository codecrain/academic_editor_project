# Task 239 수행계획서: 문자표 입력 기능 구현

## 목표

도구상자 및 메뉴의 문자표 버튼 클릭 시 유니코드 문자표 대화상자를 표시하고,
선택한 문자를 본문 커서 위치에 삽입하는 기능을 구현한다.

## 범위

- **유니코드 문자표에 한정** (사용자 문자표, 한글(HNC) 문자표, 완성형(KS) 문자표 제외)
- 한컴 오피스 문자표 입력 UI를 참고하여 구현

## 주요 기능

1. **유니코드 블록 목록** — 왼쪽 패널에 유니코드 블록 카테고리 표시 (기본 라틴, 그리스, 화살표, 수학 연산자, 도형, CJK 등)
2. **문자 그리드** — 선택한 블록의 문자를 16열 그리드로 표시
3. **문자 선택 및 미리보기** — 클릭 시 하이라이트 + 유니코드 코드 표시 + 확대 미리보기
4. **문자 삽입** — "넣기" 버튼 또는 더블 클릭으로 커서 위치에 문자 삽입
5. **최근 사용한 문자** — localStorage 기반으로 최근 삽입한 문자 기록/표시
6. **진입점 연결** — 도구상자 버튼, 메뉴 > 입력 > 문자표, 단축키(Alt+F10)

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `rhwp-studio/src/ui/symbols-dialog.ts` | 신규 — 문자표 대화상자 클래스 |
| `rhwp-studio/src/styles/symbols-dialog.css` | 신규 — 문자표 대화상자 스타일 |
| `rhwp-studio/src/style.css` | CSS import 추가 |
| `rhwp-studio/src/command/commands/insert.ts` | `insert:symbols` stub → 실제 구현 |
| `rhwp-studio/index.html` | 메뉴 disabled 해제, 도구상자 버튼 data-cmd 연결 |

## 기술 사항

- Rust/WASM 변경 없음 — 기존 `insertText` API로 문자 삽입
- `InsertTextCommand`를 통해 undo/redo 지원
- `ModalDialog` 기반 모달 대화상자
- 유니코드 블록 정의는 TypeScript 상수 배열로 관리

## 제외 사항

- 사용자 문자표, 한글(HNC) 문자표, 완성형(KS) 문자표 탭
- 입력 문자(G) 필드 (연속 입력 버퍼)
- 등록(R) 기능 (사용자 문자표 등록)
- 선택 문자 확대(M) 체크박스
