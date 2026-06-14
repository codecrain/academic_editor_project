# 타스크 25 — 3단계 완료 보고서: 편집 모드 상태 머신 + 시각화

## 완료 내용

### 3-1. SelectionRenderer 시각화 메서드 추가 (`web/text_selection.js`)

| 메서드 | 기능 |
|--------|------|
| `drawObjectSelection(ctrl)` | 파란색 점선 테두리(2px) + 8개 리사이즈 핸들(6x6px 흰색 사각형) |
| `drawCellSelection(cells)` | 반투명 파란색 배경(rgba 0,100,255,0.2) + 파란색 실선 테두리(2px) |

### 3-2. SelectionController 텍스트 클릭 콜백 (`web/text_selection.js`)

- `onTextClick` 콜백 추가: TextRun 히트 시 호출 → editor.js에서 editMode='text' 전환

### 3-3. 편집 모드 상태 머신 (`web/editor.js`)

**상태 변수**:
```javascript
let editMode = 'none';      // 'none' | 'text' | 'objectSelected' | 'cellSelected'
let selectedControl = null;  // 선택된 컨트롤 정보
let selectedCells = [];      // 선택된 셀 배열
```

**상태 전이 규칙**:

| 현재 모드 | 이벤트 | 새 모드 | 시각화 |
|-----------|--------|---------|--------|
| none/text | TextRun 클릭 | text | 캐럿 |
| none/text | 컨트롤 클릭 | objectSelected | 점선 테두리 + 핸들 |
| objectSelected | Esc | none | 해제 |
| objectSelected | Enter/F5 (표) | cellSelected | 셀 하이라이트 |
| cellSelected | Esc | objectSelected | 점선 테두리 + 핸들 |
| cellSelected | Enter | text (셀 내) | 캐럿 |
| cellSelected | 방향키 | cellSelected (이동) | 셀 하이라이트 |
| text (셀 내) | Esc | cellSelected | 셀 하이라이트 |
| text (본문) | Esc | none | 해제 |

### 3-4. 키보드 핸들러 확장 (`web/editor.js`)

기존 키보드 핸들러 앞에 editMode별 분기 추가:

- **objectSelected**: Esc → 해제, Enter/F5 → 셀 선택 (표), Ctrl 조합만 통과
- **cellSelected**: Esc → 객체 선택, Enter → 셀 편집, 방향키 → 셀 이동, Tab → 차단
- **text + Esc**: 셀 내 → cellSelected, 본문 → none

### 3-5. 셀 텍스트 편집/탐색 헬퍼

| 함수 | 기능 |
|------|------|
| `enterCellTextEdit(cell)` | 셀 내 첫 문단에 캐럿 설정, IME 포커스 |
| `findControlForCell(docPos)` | 문서 좌표로 소속 표 컨트롤 검색 |
| `handleCellNavigation(key, isShift)` | 방향키로 셀 이동, Shift+방향키로 범위 확장 (기본) |

### 3-6. editMode 리셋

- 파일 업로드 시 (`handleFileUpload`): editMode = 'none'
- 페이지 이동 시 (`prevPage`/`nextPage`): editMode = 'none'

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `web/text_selection.js` | SelectionRenderer에 drawObjectSelection/drawCellSelection 추가, onTextClick 콜백 |
| `web/editor.js` | editMode 상태 머신, 키보드 핸들러 확장, 헬퍼 함수, 리셋 로직 |

## 검증 결과

- `docker compose run --rm test` — 346개 테스트 통과
- `docker compose run --rm wasm` — WASM 빌드 성공
- JS 코드 문법 검증 완료
