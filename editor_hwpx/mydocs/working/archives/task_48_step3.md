# 타스크 48 단계 3 완료보고서

## 단계: 클릭 커서 배치 + 키보드 입력

## 수행 내용

### 신규 파일 (1개)

**`engine/input-handler.ts`** — 클릭/키보드 입력 처리기
- Hidden `<textarea>` 기반 키보드 입력 수신
- 클릭 이벤트 → 좌표 변환 → `hitTest()` → 커서 배치 → 캐럿 표시
- 키보드 입력 처리:
  - 텍스트 입력 → `insertText()` → 재렌더링 → 캐럿 갱신
  - Backspace → `deleteText()` / `mergeParagraph()` → 재렌더링 → 캐럿 갱신
  - Delete → `deleteText()` / `mergeParagraph()` (역방향)
  - Enter → `splitParagraph()` → 재렌더링 → 캐럿 갱신
  - ArrowLeft / ArrowRight → 커서 이동 → 캐럿 갱신
- 줌 변경 시 캐럿 위치 자동 갱신
- 문서 재로드 시 `deactivate()` 호출로 상태 리셋

### 수정 파일 (2개)

**`view/canvas-view.ts`**
- `refreshPages()` 메서드 추가: 편집 후 보이는 페이지 재렌더링
  - 페이지 정보 재수집 → VirtualScroll 갱신 → Canvas 전체 재렌더링
- `document-changed` 이벤트 구독 추가

**`main.ts`**
- `InputHandler` 임포트 및 초기화
- `loadFile()` 내 문서 재로드 시 `inputHandler.deactivate()` 호출

### 좌표 변환 흐름

```
클릭 (clientX/Y)
  → scroll-content 기준 상대 좌표
  → VirtualScroll.getPageAtY() → 페이지 인덱스
  → 줌 역산 → 페이지 내 픽셀 좌표
  → hitTest(page, x, y) → {sectionIndex, paragraphIndex, charOffset}
  → cursor.moveTo() → getCursorRect() → caret.show()
```

### 편집 흐름

```
키 입력 (textarea input)
  → insertText(sec, para, offset, text) [WASM]
  → emit('document-changed') → CanvasView.refreshPages()
  → cursor.updateRect() → caret.update()
```

## 검증

| 항목 | 결과 |
|------|------|
| `tsc --noEmit` | **통과** (0 errors) |
| `vite build` | **성공** (16 modules, 37.73KB JS, 273ms) |

## 변경/생성 파일

| 파일 | 유형 | 내용 |
|------|------|------|
| `rhwp-studio/src/engine/input-handler.ts` | 신규 | 클릭/키보드 입력 처리기 |
| `rhwp-studio/src/view/canvas-view.ts` | 수정 | refreshPages() + document-changed 이벤트 |
| `rhwp-studio/src/main.ts` | 수정 | InputHandler 초기화, 문서 로드 시 deactivate |
