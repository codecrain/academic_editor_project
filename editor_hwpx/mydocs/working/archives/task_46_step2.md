# 타스크 46 단계 2 완료보고서

## 단계: 식별된 버그 수정

## 수정 사항

### 2-1. ViewportManager `setScrollTop()` 상태 동기화 (심각도: 높음)

**파일:** `rhwp-studio/src/view/viewport-manager.ts`

**문제:** `setScrollTop(y)` 호출 시 DOM의 `scrollTop`만 변경하고 내부 `scrollY` 필드를 갱신하지 않음. 줌 변경 시 `onZoomChanged()`에서 `setScrollTop()` 후 `updateVisiblePages()`를 호출하면 `getScrollY()`가 구 스크롤 값을 반환하여 잘못된 페이지가 렌더링됨.

**수정:** `setScrollTop()` 내에서 `this.scrollY = this.container.scrollTop`으로 동기화. `container.scrollTop`을 다시 읽어 브라우저가 클램프한 실제 값을 반영.

### 2-2. CanvasView `loadDocument()` 에러 핸들링 (심각도: 중간)

**파일:** `rhwp-studio/src/view/canvas-view.ts`

**문제:** `getPageInfo()` 루프에 try-catch 없음. 특정 페이지 정보 조회 실패 시 전체 로드가 중단됨.

**수정:**
- 개별 `getPageInfo()` 호출을 try-catch로 감싸 실패 페이지를 건너뜀
- 로드된 페이지가 0개인 경우 early return으로 안전하게 종료
- 로그에 성공/전체 페이지 수 비율 표시 (`3/5페이지 로드`)

### 2-3. CanvasPool `releaseAll()` 안전성 개선 (심각도: 낮음)

**파일:** `rhwp-studio/src/view/canvas-pool.ts`

**문제:** `for...of`로 `inUse` Map을 순회하면서 `release()`에서 `inUse.delete()`를 호출. ES6 스펙상 동작하나 의도 불명확.

**수정:** `Array.from(this.inUse.keys())`로 키 배열을 먼저 복사한 후 순회.

### 2-4. CanvasView `renderPage()` WASM 렌더링 에러 핸들링 (심각도: 중간)

**파일:** `rhwp-studio/src/view/canvas-view.ts`

**문제:** `pageRenderer.renderPage()` 실패 시 (WASM 렌더링 예외) 캔버스가 DOM에 빈 상태로 남고, 풀에서 회수되지 않음.

**수정:**
- try-catch로 WASM 렌더링 예외 포착
- 실패 시 캔버스를 풀에 반환하고 early return

## 검증

| 항목 | 결과 |
|------|------|
| `tsc --noEmit` | 통과 |
| `vite build` | 성공 (242ms, 13 모듈) |
| JS 번들 | 28.57 kB (수정 전 28.19 kB → +380B) |
