# 타스크 45 단계 2 완료보고서

## 단계: 가상 스크롤 + Canvas 풀

## 수행 내용

### 1. VirtualScroll (`view/virtual-scroll.ts`)

설계서 §5.2를 구현하였다:

- `setPageDimensions(pages, zoom)`: WASM `getPageInfo()` 결과를 받아 페이지별 높이/폭/오프셋 계산. 페이지 간 간격(pageGap=10px) 포함
- `getVisiblePages(scrollY, viewportHeight)`: 뷰포트 범위와 각 페이지 Y 범위를 비교하여 보이는 페이지 목록 반환
- `getPrefetchPages()`: visible 범위 ±1 페이지를 포함하여 프리페치 대상 반환
- `getPageAtY(docY)`: 문서 Y 좌표가 속하는 페이지 인덱스 반환 (현재 페이지 표시용)
- 줌 적용: `setPageDimensions()`에서 zoom 계수를 곱하여 페이지 크기 조정

### 2. CanvasPool (`view/canvas-pool.ts`)

설계서 §5.3.2를 구현하였다:

- `acquire(pageIdx)`: 풀에서 Canvas 꺼내거나 새로 생성, `inUse` Map에 등록
- `release(pageIdx)`: DOM에서 제거 후 풀에 반환
- `has(pageIdx)`: 할당 여부 확인 (중복 렌더링 방지)
- `releaseAll()`: 문서 교체 시 전체 해제
- `activePages`: 현재 렌더링 중인 페이지 목록 조회

### 3. ViewportManager (`view/viewport-manager.ts`)

- `attachTo(container)`: 스크롤 이벤트 + ResizeObserver 바인딩
- 스크롤 이벤트 → `viewport-scroll` EventBus 발행 (passive 리스너)
- 리사이즈 감지 → `viewport-resize` EventBus 발행
- `setZoom(zoom)`: 25%~400% 범위 제한, `zoom-changed` 이벤트 발행
- `detach()`: 이벤트/옵저버 정리

## 설계 결정

1. **pageGap 상단 포함**: 첫 번째 페이지 위에도 pageGap을 두어 시각적 여백 확보
2. **passive 스크롤 리스너**: 스크롤 성능 최적화
3. **ResizeObserver**: 창 크기 변경 시 뷰포트 크기 자동 갱신

## 검증 결과

- `tsc --noEmit`: TypeScript 타입 체크 통과 (에러 0)

## 산출물

| 파일 | 역할 |
|------|------|
| `rhwp-studio/src/view/virtual-scroll.ts` | 가상 스크롤 (페이지 오프셋, 가시 페이지 계산) |
| `rhwp-studio/src/view/canvas-pool.ts` | Canvas 풀 (할당/반환/재활용) |
| `rhwp-studio/src/view/viewport-manager.ts` | 뷰포트 상태 관리 (스크롤, 줌, 리사이즈) |

## 다음 단계

단계 3: 페이지 렌더링 + 좌표 체계
- PageRenderer, CoordinateSystem, CanvasView 구현
- 전체 조립 및 연속 스크롤 뷰 동작
