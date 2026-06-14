# 타스크 123 수행계획서 — 벡터 품질 줌

## 1. 목표

현재 웹 에디터의 줌이 CSS `transform: scale()`로 캔버스 래스터를 확대/축소하여 확대 시 텍스트가 흐려지는 문제를 해결한다. Canvas 2D `ctx.scale()`을 사용하여 줌 배율로 재렌더링하면 텍스트/선/곡선이 해당 해상도에서 다시 래스터화되어 선명한 벡터 품질을 얻는다.

## 2. 현재 상태 분석

### 현재 줌 구조
- `applyZoom()` → CSS `transform: scale(zoomLevel)` on `#canvas-wrapper`
- 캔버스는 항상 1:1 문서 크기로 렌더링 (변하지 않음)
- 확대 시 픽셀이 보이는 래스터 방식

### 렌더링 파이프라인
- WASM `render_page_to_canvas(page_num, canvas)` → build_page_tree → WebCanvasRenderer
- 캔버스 크기 = 페이지 크기 (DPI 기반)
- scale/zoom 파라미터 없음

### 좌표 체계
- 렌더트리: 문서 좌표 (HWPUNIT → px 변환, DPI 기반)
- 마우스: `_toPageCoords()` — screen → canvas 변환 (`canvas.width / rect.width` 비율)
- 히트테스트: 문서 좌표 기준

## 3. 핵심 원리

- `canvas.width/height` = 페이지크기 × scale (고해상도 백킹 스토어)
- `ctx.scale(scale, scale)` 적용 후 렌더트리 좌표(문서 단위) 그대로 그리기
- CSS transform 제거 → 캔버스가 실제 크기로 표시
- 마우스 좌표 변환: screen → document = `÷ zoomLevel`
- 성능: 즉시 CSS scale + 150ms 디바운스 후 벡터 재렌더 (하이브리드)

## 4. 구현 범위

### 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/wasm_api.rs` | `render_page_to_canvas`에 scale 파라미터 추가 |
| `src/renderer/web_canvas.rs` | scale 필드, set_scale(), begin_page에 ctx.scale() |
| `web/editor.js` | applyZoom 재작성, renderCurrentPage에 zoom 전달, zoomFit 수정 |
| `web/text_selection.js` | SelectionRenderer/Controller에 zoom 스케일, _toPageCoords 수정 |

### 비변경 영역
- 렌더트리 구조 (문서 좌표 유지)
- DPI/페이지네이션 (줌과 무관)
- SVG 렌더러 (네이티브 전용)
- 테스트 코드 (WASM 전용 변경)

## 5. 위험 요소

- 줌 3x 시 캔버스 9배 픽셀 → 메모리/성능 (디바운스로 완화, 최대 16384px 가드)
- 오버레이 좌표 불일치 (셀렉션/캐럿) → ctx.scale 동기화로 해결
- 하위호환 (scale 생략 시) → `scale <= 0`이면 1.0 기본값
