# 타스크 202: IME 조합 블랙박스 캐럿

## 목표

IME 조합 중 한컴/MS워드 스타일의 블랙박스 캐럿을 구현한다.
- 조합 중: 글자 크기의 검은 사각형(블랙박스) 깜빡임 + 그 안에 흰색 조합 문자
- 조합 종료: 일반 캐럿(얇은 세로 막대) 복귀

## 현재 상태

### 완료된 인프라
- `CaretRenderer`: DOM div 기반 깜박이는 캐럿 (2px 세로 막대)
- `isComposing` / `compositionAnchor` / `compositionLength`: IME 조합 상태 추적
- `getCursorRect`: WASM API로 임의 위치의 커서 좌표(x, y, height, pageIndex) 조회 가능
- IME 조합 중 실시간 텍스트 삽입/삭제 동작 완비

### 미구현 항목
- 조합 중 블랙박스 표시 없음 (일반 캐럿만 표시)
- 조합 중 흰색 문자 오버레이 없음

## 동작 명세

| 상태 | 캐럿 모양 | 깜빡임 | 비고 |
|------|-----------|--------|------|
| 비조합 (일반) | 2px 세로 막대 | 500ms | 현재 구현 완료 |
| IME 조합 중 | 글자 크기 블랙박스 | 500ms | 블랙박스 안에 흰색 조합 문자 |

### 블랙박스 크기 계산
- **높이**: 커서 rect의 height (글줄 높이)
- **너비**: anchor 위치 rect.x → 현재 위치 rect.x 차이 (조합 문자 폭)
- **위치**: anchor 위치의 (x, y) — 페이지 좌표

### 깜빡임 동작
- 블랙박스 전체가 깜빡임 (ON: 검은 배경 + 흰 글자, OFF: 투명 = 캔버스의 검은 글자 보임)
- 주기: 500ms (기존 캐럿과 동일)

## 구현 방식

### CaretRenderer 확장
- 조합 오버레이 div 추가 (검은 배경, 흰 글자)
- `showComposition(startRect, text, charWidth, zoom)` 메서드 추가
- `hideComposition()` 메서드 추가
- 조합 중에는 기존 캐럿 숨기고 조합 오버레이 표시

### InputHandler.updateCaret() 확장
- `isComposing && compositionAnchor` 일 때:
  1. anchor 위치의 getCursorRect 호출 → startRect
  2. 현재 위치의 getCursorRect → endRect (기존 로직)
  3. 너비 = endRect.x - startRect.x
  4. 조합 텍스트 = textarea.value 또는 getTextAt()
  5. `caret.showComposition(startRect, text, width, zoom)` 호출
- 비조합 시: `caret.hideComposition()` 호출

## 영향 범위

| 파일 | 수정 내용 |
|------|-----------|
| `rhwp-studio/src/engine/caret-renderer.ts` | 조합 오버레이 요소 + showComposition/hideComposition |
| `rhwp-studio/src/engine/input-handler.ts` | updateCaret()에서 조합 모드 분기 |

## 범위 외

- WASM/Rust 측 변경 없음 (순수 프론트엔드 UI)
- 수정 모드(덮어쓰기) 캐럿 → 후속 타스크
- 세로쓰기 IME 조합 → 후속 타스크
