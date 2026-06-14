# 타스크 45 구현계획서: rhwp-studio 프로젝트 초기 구축 + 캔버스 뷰어 프로토타입

> 작성일: 2026-02-12

## 단계 1: 프로젝트 스캐폴딩 + WASM 연동

### 1.1 프로젝트 생성

`rhwp-studio/` 디렉토리를 수동으로 구성한다 (Vite 템플릿 대신 최소 설정):

```
rhwp-studio/
├── src/
│   ├── main.ts
│   └── core/
│       ├── wasm-bridge.ts
│       ├── event-bus.ts
│       └── types.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .gitignore
```

### 1.2 package.json

```json
{
  "name": "rhwp-studio",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.1.0"
  }
}
```

### 1.3 vite.config.ts

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@wasm': resolve(__dirname, '..', 'pkg'),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: ['..'],  // pkg/ 접근 허용
    },
  },
});
```

핵심: `fs.allow: ['..']`로 상위 디렉토리의 `pkg/` WASM 모듈에 접근 가능하게 한다.

### 1.4 WasmBridge 클래스

```typescript
// core/wasm-bridge.ts
import init, { HwpDocument } from '@wasm/rhwp.js';

export class WasmBridge {
  private doc: HwpDocument | null = null;

  async initialize(): Promise<void> {
    await init();
  }

  loadDocument(data: Uint8Array): DocumentInfo {
    if (this.doc) this.doc.free();
    this.doc = new HwpDocument(data);
    this.doc.convertToEditable();
    return JSON.parse(this.doc.getDocumentInfo());
  }

  get pageCount(): number {
    return this.doc?.pageCount() ?? 0;
  }

  getPageInfo(pageNum: number): PageInfo {
    return JSON.parse(this.doc!.getPageInfo(pageNum));
  }

  renderPageToCanvas(pageNum: number, canvas: HTMLCanvasElement): void {
    this.doc!.renderPageToCanvas(pageNum, canvas);
  }

  dispose(): void {
    this.doc?.free();
    this.doc = null;
  }
}
```

참고: `renderPageToCanvas()`는 WASM 내부에서 Canvas 크기를 `bbox.width × bbox.height`로 자동 설정한다 (`wasm_api.rs:167-168`). 따라서 외부에서 크기를 미리 설정할 필요가 없다.

### 1.5 EventBus 클래스

```typescript
// core/event-bus.ts
type Handler = (...args: any[]) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, ...args: any[]): void {
    this.handlers.get(event)?.forEach(h => h(...args));
  }
}
```

### 1.6 공통 타입

```typescript
// core/types.ts
export interface DocumentInfo {
  version: string;
  sectionCount: number;
  pageCount: number;
  encrypted: boolean;
  fallbackFont: string;
}

export interface PageInfo {
  pageIndex: number;
  width: number;
  height: number;
  sectionIndex: number;
}
```

### 1.7 main.ts (초기 검증)

WASM 초기화 → 파일 업로드 → pageCount 출력까지만 검증한다.

### 1.8 검증 기준

- `npm run dev` → Vite 개발 서버 기동
- WASM init 성공 로그
- HWP 파일 업로드 → `console.log(pageCount)` 출력

---

## 단계 2: 가상 스크롤 + Canvas 풀

### 2.1 VirtualScroll 클래스

설계서 §5.2를 구현한다:

```typescript
// view/virtual-scroll.ts
export class VirtualScroll {
  private pageOffsets: number[] = [];
  private pageHeights: number[] = [];
  private pageWidths: number[] = [];
  private pageGap = 10;

  setPageDimensions(pages: PageInfo[]): void;
  getVisiblePages(scrollY: number, viewportHeight: number): number[];
  getPageOffset(pageIdx: number): number;
  getTotalHeight(): number;
  getPageAtY(docY: number): number;
}
```

**핵심 로직**:
- `setPageDimensions()`: WASM의 `getPageInfo()` 결과로 페이지별 높이/폭 설정 → `pageOffsets[]` 계산
- `getVisiblePages()`: 뷰포트 상/하단 Y와 각 페이지의 Y 범위를 비교하여 보이는 페이지 목록 반환
- 페이지 크기 단위: WASM `getPageInfo()`가 반환하는 값은 픽셀 단위 (렌더 트리 bbox)

### 2.2 CanvasPool 클래스

설계서 §5.3.2를 구현한다:

```typescript
// view/canvas-pool.ts
export class CanvasPool {
  private available: HTMLCanvasElement[] = [];
  private inUse = new Map<number, HTMLCanvasElement>();

  acquire(pageIdx: number): HTMLCanvasElement;
  release(pageIdx: number): void;
  releaseAll(): void;
  getCanvas(pageIdx: number): HTMLCanvasElement | undefined;
}
```

**핵심 로직**:
- `acquire()`: 풀에서 Canvas 꺼내거나 새로 생성, `inUse`에 등록
- `release()`: Canvas를 DOM에서 제거, 풀에 반환
- Canvas 최대 수량: 풀 + 사용 중 합계 약 7~8개

### 2.3 ViewportManager 클래스

```typescript
// view/viewport-manager.ts
export class ViewportManager {
  private scrollY = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private zoom = 1.0;

  attachTo(container: HTMLElement): void;   // 스크롤 이벤트 바인딩
  getScrollY(): number;
  getViewportSize(): { width: number; height: number };
  getZoom(): number;
  setZoom(zoom: number): void;
}
```

### 2.4 HTML/CSS 레이아웃

```html
<div id="studio-root">
  <div id="toolbar">...</div>
  <div id="scroll-container">        <!-- overflow-y: auto -->
    <div id="scroll-content">        <!-- height: 전체 문서 높이 -->
      <!-- Canvas 요소들이 absolute 배치됨 -->
    </div>
  </div>
</div>
```

```css
#scroll-container {
  position: relative;
  overflow-y: auto;
  flex: 1;
  background: #e0e0e0;
}
#scroll-content {
  position: relative;
  margin: 0 auto;  /* 수평 중앙 정렬 */
}
#scroll-content canvas {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);  /* 페이지 수평 중앙 */
  box-shadow: 0 2px 4px rgba(0,0,0,0.15);
  background: white;
}
```

### 2.5 검증 기준

- 파일 로드 후 스크롤 컨테이너에 전체 문서 높이 적용
- 스크롤 시 `getVisiblePages()` 반환값 변경 확인 (콘솔 로그)
- Canvas 할당/반환 동작 확인

---

## 단계 3: 페이지 렌더링 + 좌표 체계

### 3.1 PageRenderer 클래스

```typescript
// view/page-renderer.ts
export class PageRenderer {
  constructor(private wasm: WasmBridge) {}

  renderPage(pageIdx: number, canvas: HTMLCanvasElement): void {
    this.wasm.renderPageToCanvas(pageIdx, canvas);
  }
}
```

WASM `renderPageToCanvas()`가 Canvas 크기를 자동 설정하므로, 줌 미적용 시에는 래퍼만으로 충분하다.

### 3.2 CoordinateSystem 클래스

설계서 §5.4를 구현한다:

```typescript
// view/coordinate-system.ts
export class CoordinateSystem {
  viewportToDocument(vx: number, vy: number): { x: number; y: number };
  documentToPage(dx: number, dy: number): { pageIdx: number; x: number; y: number };
  pageToDocument(pageIdx: number, px: number, py: number): { x: number; y: number };
  pageToViewport(pageIdx: number, px: number, py: number): { x: number; y: number };
}
```

### 3.3 CanvasView 클래스 (전체 조립)

```typescript
// view/canvas-view.ts
export class CanvasView {
  private virtualScroll: VirtualScroll;
  private canvasPool: CanvasPool;
  private pageRenderer: PageRenderer;
  private viewportManager: ViewportManager;
  private coordinateSystem: CoordinateSystem;
  private renderedPages = new Set<number>();

  constructor(container: HTMLElement, wasm: WasmBridge, eventBus: EventBus);

  loadDocument(): void;       // 페이지 정보 수집 → 가상 스크롤 초기화
  private onScroll(): void;   // 스크롤 이벤트 핸들러
  private updateVisiblePages(): void;  // 보이는 페이지 렌더링/해제
  dispose(): void;
}
```

**렌더링 플로우**:
```
onScroll()
  → ViewportManager.getScrollY()
  → VirtualScroll.getVisiblePages(scrollY, viewportHeight)
  → 기존 visible과 비교:
    - 새로 보이는 페이지: CanvasPool.acquire() → DOM 추가 → renderPage()
    - 벗어난 페이지: CanvasPool.release()
  → 프리페치: visible 범위 ±1 페이지도 렌더링
```

**이미지 비동기 로드 대응**: 기존 `web/app.js`와 동일하게, 첫 렌더링 후 200ms 지연 재렌더링으로 data URL 이미지 디코딩 문제 해결.

### 3.4 검증 기준

- HWP 파일 로드 → 모든 페이지가 연속 스크롤로 표시
- 스크롤 시 보이는 페이지만 Canvas 존재 (DOM 확인)
- 벗어난 페이지 Canvas 자동 해제
- 다양한 샘플 파일(10페이지, 1페이지) 테스트

---

## 단계 4: UI + 줌 + 마무리

### 4.1 기본 UI 구성

```
┌─────────────────────────────────────────────┐
│ [파일 열기]  │  [-] 100% [+]  │  3 / 15 페이지 │
├─────────────────────────────────────────────┤
│                                             │
│           ┌──────────────────┐              │
│           │                  │              │
│           │   Page Canvas    │              │
│           │                  │              │
│           └──────────────────┘              │
│                                             │
└─────────────────────────────────────────────┘
```

### 4.2 줌 처리

줌 변경 시 수행할 작업:

1. **Canvas 크기 조정**: WASM `renderPageToCanvas()`가 Canvas 크기를 자동 설정하므로, 줌 적용은 CSS `transform: scale()` 방식을 사용한다.
   - 또는 Canvas에 직접 줌 적용: `canvas.style.width = (actualWidth * zoom) + 'px'`
2. **페이지 높이/오프셋 재계산**: `setPageDimensions()`에 줌 반영
3. **스크롤 위치 보정**: 줌 전 보이던 페이지가 계속 보이도록 scrollTop 조정
4. **모든 보이는 페이지 재렌더링**

줌 범위: 25% ~ 400%, 단계: 10%

### 4.3 현재 페이지 표시

스크롤 위치 기반으로 뷰포트 중앙에 위치한 페이지 번호를 계산하여 상태바에 표시.

### 4.4 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| Ctrl + `+` | 줌 인 (+10%) |
| Ctrl + `-` | 줌 아웃 (-10%) |
| Ctrl + `0` | 줌 100% 리셋 |

### 4.5 오류 처리

- WASM 초기화 실패: 사용자에게 에러 메시지 표시
- 파일 로드 실패: 에러 상세 표시
- 렌더링 실패: 해당 페이지에 에러 표시, 다른 페이지는 정상 표시

### 4.6 검증 기준

- 파일 열기 → 연속 스크롤 → 줌 IN/OUT → 정상 동작
- 키보드 단축키 동작
- 페이지 번호 표시 갱신
- `samples/` 하위 다양한 HWP 파일 테스트

---

## 파일 생성 목록 (예상)

```
rhwp-studio/
├── src/
│   ├── main.ts
│   ├── core/
│   │   ├── wasm-bridge.ts
│   │   ├── event-bus.ts
│   │   └── types.ts
│   ├── view/
│   │   ├── canvas-view.ts
│   │   ├── virtual-scroll.ts
│   │   ├── canvas-pool.ts
│   │   ├── page-renderer.ts
│   │   ├── viewport-manager.ts
│   │   └── coordinate-system.ts
│   ├── ui/
│   │   └── toolbar.ts
│   └── style.css
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .gitignore
```

총 15개 파일, TypeScript 12개 + HTML 1개 + CSS 1개 + 설정 3개
