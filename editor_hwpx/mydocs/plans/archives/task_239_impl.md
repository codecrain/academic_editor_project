# Task 239 구현 계획서: 문자표 입력 기능 구현

## 단계별 구현 계획

### 1단계: 문자표 대화상자 UI 구현

- `symbols-dialog.ts` 신규 작성
  - 유니코드 블록 정의 (상수 배열)
  - 왼쪽 블록 목록 패널
  - 16열 문자 그리드
  - 유니코드 코드 표시 + 확대 미리보기
  - 넣기/닫기 버튼
  - 최근 사용한 문자 영역 (localStorage)
- `symbols-dialog.css` 신규 작성
- `style.css`에 import 추가

### 2단계: 명령 연결 및 문자 삽입

- `insert:symbols` stub → 실제 구현 (SymbolsDialog 호출)
- `InsertTextCommand`로 커서 위치에 문자 삽입 (undo/redo 지원)
- `index.html` 메뉴 disabled 해제 + 도구상자 버튼 data-cmd 연결
- `vite-env.d.ts` 추가 (기존 tsc 오류 수정)

### 3단계: 테스트 및 최종 정리

- 동작 확인: 블록 선택 → 문자 클릭 → 넣기 → 본문 삽입
- 더블 클릭 즉시 삽입 확인
- 최근 사용 문자 저장/표시 확인
- 도구상자, 메뉴, 단축키(Alt+F10) 진입점 확인
- 오늘할일 상태 갱신
