# 타스크 31 — 1단계 완료 보고서: 캐럿 상하 이동 구현

## 변경 파일

### `web/editor.js` (line 250)
- ArrowUp/ArrowDown을 text_selection.js에 위임 추가

### `web/text_selection.js`
- `_savedCaretX` 상태 추가 (constructor): 연속 상하 이동 시 X 좌표 유지
- `_getLineGroups()`: runs를 Y 좌표로 줄 그룹화 (±1px 허용)
- `_findClosestCharInLine()`: 대상 줄에서 targetX에 가장 가까운 문자 위치 탐색
- `_moveCaretUp()`: 윗줄 이동, `_savedCaretX` 사용
- `_moveCaretDown()`: 아랫줄 이동, `_savedCaretX` 사용
- keydown 핸들러: ArrowUp/Down 케이스 추가, ArrowLeft/Right/Home/End에서 `_savedCaretX` 리셋

## 빌드 결과
- WASM 빌드 성공
