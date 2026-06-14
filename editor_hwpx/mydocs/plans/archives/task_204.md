# 타스크 204: 축소 시 다중 페이지 배열 뷰

## 목표

줌이 일정 수준 이하일 때 페이지를 가로 N열 그리드로 배치한다 (한컴/MS워드 스타일).

## 현재 상태

- 모든 줌 레벨에서 페이지가 세로 1열로 배치됨
- `VirtualScroll.setPageDimensions()`: 세로 1열 오프셋 계산
- `CanvasView.renderPage()`: CSS `left:50%; transform:translateX(-50%)`로 중앙 정렬
- 줌 범위: 25%~400%

## 동작 명세

| 줌 레벨 | 배치 | 비고 |
|---------|------|------|
| 50% 초과 | 1열 (현재) | 기존 동작 유지 |
| 50% 이하 | N열 그리드 | 뷰포트 너비에 맞춰 열 수 자동 계산 |

### 열 수 계산
- `columns = floor(viewportWidth / (pageWidth * zoom + gap))`
- 최소 1열, 최대 페이지 수

## 구현 방식

### VirtualScroll 확장
- `setPageDimensions(pages, zoom, viewportWidth?)` — viewportWidth 전달 시 그리드 배치 계산
- 그리드 모드에서 `pageOffsets[i]`는 행(row) 기준 Y 오프셋
- 새 필드: `pageLefts[i]` — 페이지별 X 오프셋 (그리드 배치 시)
- `getPageLeft(pageIdx)` 메서드 추가
- `columns` 필드 — 현재 열 수 (1이면 단일 열 모드)

### CanvasView 수정
- `renderPage()`: 그리드 모드에서 CSS left를 `pageLefts[i]`로 설정 (중앙 정렬 대신)
- `onZoomChanged()`: viewportWidth 전달

### CSS 수정
- 그리드 모드에서 `transform:translateX(-50%)` 해제 필요

## 영향 범위

| 파일 | 수정 내용 |
|------|-----------|
| `rhwp-studio/src/view/virtual-scroll.ts` | 그리드 배치 로직, pageLefts 배열 |
| `rhwp-studio/src/view/canvas-view.ts` | renderPage() X좌표, viewportWidth 전달 |
| `rhwp-studio/src/styles/editor.css` | 그리드 모드 CSS 분기 |
| `rhwp-studio/src/engine/caret-renderer.ts` | pageLeft 계산 그리드 대응 |
| `rhwp-studio/src/view/viewport-manager.ts` | viewportWidth 전달 |

## 범위 외

- 페이지 클릭/편집은 그리드 모드에서 비활성 (읽기 전용 미리보기)
- 페이지 번호 오버레이 → 후속 타스크
