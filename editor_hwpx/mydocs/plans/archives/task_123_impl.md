# 타스크 123 구현 계획서 — 벡터 품질 줌

## 전체 구현 단계 (4단계)

---

## 1단계: WASM render_page_to_canvas에 scale 파라미터 추가

### 목표
WASM 렌더링 API에 scale 파라미터를 추가하여 캔버스를 줌 배율로 렌더링한다.

### 변경 파일 및 내용

**src/wasm_api.rs** (라인 199-216)
- `render_page_to_canvas` 시그니처에 `scale: f64` 추가
- `scale <= 0`이면 1.0 기본값 (하위호환)
- 캔버스 크기 = `(width * scale) as u32`, `(height * scale) as u32`
- 최대 캔버스 크기 16384px 가드
- `renderer.set_scale(scale)` 호출

**src/renderer/web_canvas.rs**
- `WebCanvasRenderer`에 `scale: f64` 필드 추가 (기본값 1.0)
- `set_scale(scale: f64)` public 메서드 추가
- `begin_page()`에서 `ctx.scale(scale, scale)` 적용
- `clear()` 시 `set_transform(1,0,0,1,0,0)` 리셋 후 재적용

### 검증
- `cargo build` 성공
- `cargo test` 571개 통과

---

## 2단계: JS applyZoom 벡터 재렌더링 방식으로 변경

### 목표
CSS transform 래스터 줌을 벡터 재렌더링 줌으로 교체한다.

### 변경 파일 및 내용

**web/editor.js**

모듈 변수 추가:
- `_basePageWidth`, `_basePageHeight` — 줌 1.0 기준 페이지 크기
- `_zoomRenderTimer` — 디바운스 타이머

`renderCurrentPage()` 수정:
- `doc.renderPageToCanvas(currentPage, canvas, zoomLevel)` 호출
- `_basePageWidth = canvas.width / zoomLevel` 저장
- 비동기 재렌더(라인 604-608)에도 `zoomLevel` 전달

`applyZoom()` 재작성:
- 즉시: CSS `transform: scale(cssRatio)` (현재 캔버스 대비 목표 비율)
- scaler 크기 = `_basePageWidth * zoomLevel`
- 150ms 디바운스 후 `_renderAtZoom(zoomLevel)` 호출

`_renderAtZoom(zoom)` 신규 함수:
- `doc.renderPageToCanvas(currentPage, canvas, zoom)`
- 오버레이 캔버스 크기 동기화
- CSS transform 제거
- scaler 크기 갱신
- 셀렉션/캐럿/검색 하이라이트 재그리기

`zoomFit()` 수정:
- `baseWidth = canvas.width / zoomLevel`

### 검증
- WASM 빌드 성공
- 웹에서 줌 100%/200%/50% 렌더링 확인

---

## 3단계: 마우스 좌표 변환 및 오버레이 줌 적용

### 목표
줌 상태에서 마우스 히트테스트, 캐럿, 셀렉션, 검색 하이라이트가 정확하게 동작한다.

### 변경 파일 및 내용

**web/text_selection.js**

SelectionRenderer 수정:
- `_zoom` 필드 추가 (기본값 1.0)
- `setZoomScale(zoom)` 메서드
- `clear()`에서 `setTransform(1,0,0,1,0,0)` → clearRect → `setTransform(zoom,0,0,zoom,0,0)`

SelectionController 수정:
- `_zoom` 필드, `setZoomScale(zoom)` 메서드
- `_toPageCoords()`: `÷ this._zoom` (screen → document 변환)
- `_drawCaret()`: 폭 `Math.max(1, 2 / this._zoom)` (화면 최소 1px)

**web/editor.js**

컨텍스트 메뉴 히트테스트 (라인 1892-1896):
- `cx`, `cy` 계산에 `/ zoomLevel` 적용

### 검증
- 줌 200%에서 텍스트 클릭 → 캐럿 위치 정확
- 줌 200%에서 드래그 선택 → 영역 정확
- 줌 200%에서 표 셀 클릭/우클릭 → 셀 선택 정확

---

## 4단계: 통합 테스트 및 검증

### 검증 항목

| 항목 | 방법 |
|------|------|
| 571개 회귀 테스트 | `docker compose run --rm test` |
| WASM 빌드 | `docker compose run --rm wasm` |
| 줌 100% 렌더링 | 웹에서 문서 열기 → 기본 렌더링 확인 |
| 줌 확대(200%) | 텍스트 선명도 확인 |
| 줌 축소(50%) | 렌더링 정상 확인 |
| Ctrl+휠 줌 | 디바운스 동작 (즉시 CSS → 150ms 후 벡터) |
| 마우스 히트테스트 | 줌 상태 텍스트 클릭 정확성 |
| 텍스트 선택 | 줌 상태 드래그 선택 정확성 |
| 검색 하이라이트 | 줌 상태 하이라이트 위치 |
| 표 셀 선택/우클릭 | 줌 상태 셀 선택 정확성 |
| 줌 맞춤(zoomFit) | 페이지 맞춤 계산 |
| 캐럿 깜빡임 | 줌 변경 후 캐럿 표시 |

---

## 영향 범위 요약

| 파일 | 단계 | 변경 내용 |
|------|------|-----------|
| src/wasm_api.rs | 1 | render_page_to_canvas에 scale 파라미터 |
| src/renderer/web_canvas.rs | 1 | scale 필드, ctx.scale() |
| web/editor.js | 2, 3 | applyZoom 재작성, renderCurrentPage, zoomFit, 컨텍스트 메뉴 |
| web/text_selection.js | 3 | SelectionRenderer/Controller 줌 스케일 |
