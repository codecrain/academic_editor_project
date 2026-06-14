# 타스크 45 단계 3 완료보고서

## 단계: 페이지 렌더링 + 좌표 체계

## 수행 내용

### 1. PageRenderer (`view/page-renderer.ts`)

- `renderPage(pageIdx, canvas)`: WASM `renderPageToCanvas()` 호출 위임
- **비동기 이미지 대응**: 기존 `web/app.js`와 동일한 200ms 지연 재렌더링 패턴 적용
- `cancelReRender()` / `cancelAll()`: Canvas 해제 시 불필요한 재렌더링 방지

### 2. CoordinateSystem (`view/coordinate-system.ts`)

설계서 §5.4의 3단계 좌표 변환을 구현하였다:

| 변환 | 메서드 |
|------|--------|
| 뷰포트 → 문서 | `viewportToDocument(vx, vy, scrollX, scrollY)` |
| 문서 → 페이지 | `documentToPage(dx, dy)` |
| 페이지 → 문서 | `pageToDocument(pageIdx, px, py)` |
| 페이지 → 뷰포트 | `pageToViewport(pageIdx, px, py, scrollX, scrollY)` |

### 3. CanvasView (`view/canvas-view.ts`) — 전체 조립

5개 모듈을 조합하는 중앙 컨트롤러:

```
CanvasView
├── VirtualScroll     ← 페이지 오프셋/가시 페이지
├── CanvasPool        ← Canvas 할당/반환
├── PageRenderer      ← WASM 렌더링
├── ViewportManager   ← 스크롤/줌 상태
└── CoordinateSystem  ← 좌표 변환
```

**핵심 플로우**:
1. `loadDocument()`: 모든 페이지의 `getPageInfo()` 수집 → `setPageDimensions()` → 스크롤 컨테이너 높이 설정
2. `updateVisiblePages()` (스크롤/리사이즈): 가시+프리페치 페이지 계산 → 벗어난 페이지 해제 → 새 페이지 렌더링
3. `onZoomChanged()`: 페이지 크기 재계산 → 스크롤 위치 보정 → 전체 재렌더링
4. 현재 페이지 번호: 뷰포트 중앙 Y 기준 `getPageAtY()` → `current-page-changed` 이벤트 발행

### 4. main.ts 업데이트

- CanvasView 생성 및 연결
- 줌 컨트롤: 버튼 클릭 + 키보드 단축키 (Ctrl+/Ctrl-/Ctrl+0)
- 이벤트 리스너: 페이지 정보 갱신, 줌 레벨 표시

### 5. 줌 처리 방식

WASM `renderPageToCanvas()`가 Canvas 크기를 자동 설정하므로:
- 원본 크기로 렌더링 → CSS `width`/`height`로 줌 스케일링
- 페이지 오프셋은 줌 적용된 크기로 계산

### 6. 검증 결과

- `tsc --noEmit`: TypeScript 타입 체크 통과 (에러 0)
- `vite build`: 13개 모듈 번들링 성공 (252ms)
  - `index.js`: 27.73 kB (gzip 7.91 kB)
  - `rhwp_bg.wasm`: 874.62 kB (gzip 331.28 kB)
  - `index.css`: 1.28 kB

## 산출물

| 파일 | 역할 |
|------|------|
| `rhwp-studio/src/view/canvas-view.ts` | 연속 스크롤 캔버스 뷰 (전체 조립) |
| `rhwp-studio/src/view/page-renderer.ts` | 페이지 렌더링 + 지연 재렌더링 |
| `rhwp-studio/src/view/coordinate-system.ts` | 3단계 좌표 변환 |
| `rhwp-studio/src/main.ts` | 앱 진입점 (CanvasView 연동, 줌, 이벤트) |

## 다음 단계

단계 4: UI + 줌 + 마무리
- 전체 코드 정리
- 다양한 샘플 HWP 파일 테스트
- 오류 처리 보강
