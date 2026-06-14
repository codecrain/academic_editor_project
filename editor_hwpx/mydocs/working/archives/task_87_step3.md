# 타스크 87 — 3단계 완료보고서

## TableObjectRenderer 시각적 피드백

### 완료 내용

#### 1. TableObjectRenderer 신규 (`table-object-renderer.ts`)
- CellSelectionRenderer와 동일한 오버레이 패턴 활용
- `render(tableBBox, zoom)` — 표 외곽에 파란색 2px 실선 테두리 + 8개 핸들 사각형 렌더링
- 핸들 위치: 4모서리(NW, NE, SW, SE) + 4변 중점(N, S, E, W)
- 핸들 크기: 8x8px (화면 고정, 줌 무관)
- `getHandleAtPoint(x, y)` — 마우스 좌표가 어떤 핸들 위인지 판별 (4단계에서 사용)
- `clear()`, `dispose()` — 오버레이 정리/해제

#### 2. CSS 스타일 (`style.css`)
- `.table-object-border` — 파란색(#337ab7) 2px 실선 테두리
- `.table-object-handle` — 파란색 배경 + 흰색 1px 테두리 사각형

#### 3. InputHandler 연동 (`input-handler.ts`)
- `setTableObjectRenderer()` 주입 메서드 추가
- `table-object-selection-changed` 이벤트 리스닝 → `renderTableObjectSelection()` / `clear()` 호출
- `renderTableObjectSelection()` — WASM `getTableBBox` 호출 → renderer.render() 호출
- dispose()에서 tableObjectRenderer?.dispose() 정리

#### 4. main.ts 연결
- `TableObjectRenderer` import + 인스턴스 생성 + InputHandler에 주입

### 수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `rhwp-studio/src/engine/table-object-renderer.ts` | 신규 — 표 객체 선택 오버레이 렌더러 |
| `rhwp-studio/src/style.css` | 표 객체 선택 CSS 추가 |
| `rhwp-studio/src/engine/input-handler.ts` | 렌더러 주입 + 이벤트 연동 |
| `rhwp-studio/src/main.ts` | TableObjectRenderer 생성 + 주입 |

### 검증
- Vite 빌드 성공 ✓ (40 modules)
