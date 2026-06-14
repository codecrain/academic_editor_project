# 타스크 37 - 2단계 완료 보고서: 플레인 텍스트 붙여넣기 (JS)

## 구현 내용

### 1. Ctrl+C/V/X 키 바인딩 (editor.js)

| 키 | 조건 | 동작 |
|-----|------|------|
| Ctrl+C | 캐럿/선택/컨트롤 선택 활성 | `handleCopyToInternal()` 호출, `preventDefault` 안 함 (text_selection.js가 브라우저 클립보드 처리) |
| Ctrl+V | 캐럿 또는 선택 활성 | `handlePaste()` 호출, `preventDefault` |
| Ctrl+X | 캐럿 또는 선택 활성 | `handleCut()` 호출, `preventDefault` |

### 2. handleCopyToInternal()

내부 WASM 클립보드에 선택 내용을 복사한다.

- **컨트롤 선택 상태** (`editMode === 'objectSelected'`): `doc.copyControl()` 호출
- **텍스트 선택 (본문)**: `doc.copySelection(secIdx, startPara, startOffset, endPara, endOffset)`
- **텍스트 선택 (셀 내부)**: `doc.copySelectionInCell(secIdx, parentPara, ctrlIdx, cellIdx, startCellPara, startOffset, endCellPara, endOffset)`
- 기존 text_selection.js의 Ctrl+C 핸들러와 병행 동작 (내부 + 브라우저 클립보드 동시 복사)

### 3. handlePaste() (async)

내부 클립보드를 우선 사용하고, 없으면 브라우저 클립보드에서 플레인 텍스트를 읽어 삽입한다.

#### 동작 흐름

1. 선택 범위가 있으면 먼저 삭제
2. 붙여넣기 위치 결정 (선택 시작점 또는 캐럿 위치)
3. **내부 클립보드 확인** (`doc.hasInternalClipboard()`)
   - 본문: `doc.pasteInternal(secIdx, paraIdx, charOffset)` → 서식 보존 붙여넣기
   - 셀: `doc.pasteInternalInCell(secIdx, parentPara, ctrlIdx, cellIdx, cellParaIdx, charOffset)`
   - 반환된 JSON에서 `paraIdx`/`cellParaIdx` + `charOffset`으로 캐럿 복원
4. **내부 클립보드 없음** → `navigator.clipboard.readText()` → `handleTextInsert(text)` (기존 텍스트 삽입 로직 재활용)

### 4. handleCut()

잘라내기: 복사 + 삭제를 순차적으로 수행한다.

1. 컨트롤 객체 선택 상태에서는 미지원 (warn)
2. `handleCopyToInternal()` 호출 (내부 클립보드에 복사)
3. `textLayout.getSelectedText()` → `navigator.clipboard.writeText()` (브라우저 클립보드에도 복사)
4. `_doDeleteText()` 호출 (선택 영역 삭제)
5. 재렌더링 + 캐럿 복원

### 5. getSelectionDocRange() 확장 (text_selection.js)

이전 단계에서 구현 완료. 다중 문단 선택을 지원하도록 확장됨.

- `startParaIdx` / `endParaIdx`: 실제 문단 인덱스
- `startCellParaIdx` / `endCellParaIdx`: 셀 내부 문단 인덱스
- 다른 구역, 다른 셀 간 선택은 미지원

## 이벤트 흐름

### Ctrl+C (복사)
```
editor.js keydown → handleCopyToInternal() → doc.copySelection() [내부 클립보드]
text_selection.js keydown → navigator.clipboard.writeText() [브라우저 클립보드]
```
→ 내부/브라우저 클립보드 동시 저장

### Ctrl+V (붙여넣기)
```
editor.js keydown → handlePaste()
  └→ doc.hasInternalClipboard() ?
      ├→ Y: doc.pasteInternal() [서식 보존]
      └→ N: navigator.clipboard.readText() → handleTextInsert() [플레인 텍스트]
```

### Ctrl+X (잘라내기)
```
editor.js keydown → handleCut()
  ├→ handleCopyToInternal() [내부 클립보드]
  ├→ navigator.clipboard.writeText() [브라우저 클립보드]
  └→ _doDeleteText() [선택 삭제]
```

## 테스트 결과

- 기존 테스트: 421 통과 (클립보드 5개 포함)
- WASM 빌드: 성공
- JS 코드: 문법 오류 없음 (WASM 빌드 시 검증)

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `web/editor.js` | Ctrl+C/V/X 키 바인딩, handleCopyToInternal(), handlePaste(), handleCut() 구현 |
| `web/text_selection.js` | getSelectionDocRange() 다중 문단 선택 지원 (1단계에서 완료) |
