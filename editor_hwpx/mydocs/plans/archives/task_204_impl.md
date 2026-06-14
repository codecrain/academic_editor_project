# 타스크 204 구현 계획서: 축소 시 다중 페이지 배열 뷰

## 1단계: VirtualScroll 그리드 배치 로직

- `setPageDimensions(pages, zoom, viewportWidth?)` 확장
- 줌 50% 이하 + viewportWidth 전달 시 그리드 배치 계산
- `pageLefts[]` 배열, `columns` 필드 추가
- `getPageLeft(pageIdx)` 메서드 추가
- `isGridMode()` 메서드 추가

## 2단계: CanvasView 그리드 렌더링

- `renderPage()`: 그리드 모드에서 canvas.style.left를 pageLeft로 설정
- `onZoomChanged()`, `loadDocument()`, `refreshPages()`: viewportWidth 전달
- 그리드 모드에서 canvas에 `grid-mode` 클래스 추가 (CSS 분기)

## 3단계: CSS + CaretRenderer 대응

- `editor.css`: `.grid-mode` 캔버스는 `transform:translateX(-50%)` 해제
- `caret-renderer.ts`: pageLeft 계산에 VirtualScroll.getPageLeft() 활용
