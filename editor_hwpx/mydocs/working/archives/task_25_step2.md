# 타스크 25 — 2단계 완료 보고서: JS 히트테스트 확장

## 완료 내용

### 2-1. ControlLayoutManager 클래스 추가 (`web/text_selection.js`)

`TextLayoutManager`와 동일한 패턴으로 컨트롤 레이아웃 관리자 구현:

| 메서드 | 기능 |
|--------|------|
| `loadPage(pageNum, doc)` | WASM `getPageControlLayout()` 호출 → controls 배열 파싱 |
| `hitTestControl(x, y)` | 좌표가 컨트롤 바운딩 박스 내인지 검사 → 히트된 컨트롤 정보 반환 |
| `hitTestCell(x, y, control)` | 표 컨트롤 내 특정 셀 히트테스트 → 셀 정보 반환 |

### 2-2. SelectionController 히트테스트 확장 (`web/text_selection.js`)

**생성자 확장**:
- `controlLayoutManager` 옵션 파라미터 추가 (4번째 인자)
- `onControlSelect` 콜백: 컨트롤 영역 클릭 시 호출 `(ctrl, x, y)`
- `onControlDeselect` 콜백: 빈 영역 클릭 시 호출

**`_onMouseDown()` 히트테스트 확장**:

```
클릭 → layout.hitTest(x, y)
  ├── TextRun 히트 → 텍스트 편집 (기존 동작, 최우선)
  └── TextRun 미히트 → controlLayout.hitTestControl(x, y)
        ├── 컨트롤 히트 → onControlSelect 콜백 호출
        └── 컨트롤 미히트 → onControlDeselect 콜백 호출 (선택 해제)
```

### 2-3. editor.js 연동

| 변경 | 내용 |
|------|------|
| import 확장 | `ControlLayoutManager` 추가 |
| 전역 인스턴스 | `controlLayout = new ControlLayoutManager()` |
| 페이지 렌더링 | `controlLayout.loadPage(currentPage, doc)` 추가 |
| SelectionController | 4번째 인자로 `controlLayout` 전달 |
| 콜백 설정 | `onControlSelect`, `onControlDeselect` → console.log (3단계에서 상태 머신으로 확장) |

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `web/text_selection.js` | ControlLayoutManager 클래스 추가, SelectionController 히트테스트 확장 |
| `web/editor.js` | import 확장, controlLayout 전역 인스턴스, 렌더링 흐름 연동, 콜백 설정 |

## 검증 결과

- `docker compose run --rm test` — 346개 테스트 통과
- `docker compose run --rm wasm` — WASM 빌드 성공
- JS 코드 문법 검증 완료

## 히트테스트 우선순위 원칙

1. **TextRun 히트** → 텍스트 편집 모드 (최우선, 기존 동작 완전 보존)
2. **컨트롤 히트** → 객체 선택 (onControlSelect 콜백)
3. **아무것도 미히트** → 선택 해제 (onControlDeselect 콜백)

이 우선순위로 셀 내부 텍스트 클릭 시 기존 텍스트 편집이 그대로 동작하며, 표 테두리/여백 등 TextRun이 없는 컨트롤 영역 클릭 시에만 객체 선택이 발동합니다.
