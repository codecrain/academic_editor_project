# 타스크 46 최종 결과보고서

## 타스크: rhwp-studio 뷰어 런타임 검증 + 버그 수정

## 개요

타스크 45에서 구현한 rhwp-studio 뷰어 프로토타입(15개 파일, 712행)의 런타임 동작을 검증하고, 코드 리뷰 4건 + 브라우저 테스트 1건 = 총 5건의 버그를 수정하였다.

## 수행 단계

| 단계 | 작업 내용 | 결과 |
|------|----------|------|
| **1** | Vite 개발 서버 구동 및 빌드 검증 | tsc 통과, vite build 성공, 개발 서버 140ms 기동 |
| **2** | 코드 리뷰 기반 버그 4건 수정 | 4건 모두 수정 완료 |
| **3** | 브라우저 런타임 테스트 + 버그 1건 추가 수정 | `measureTextWidth` 누락 수정, 전 항목 검증 통과 |

## 수정된 버그 목록

| No | 파일 | 문제 | 심각도 | 발견 방법 |
|----|------|------|--------|-----------|
| 1 | `wasm-bridge.ts` | `globalThis.measureTextWidth` 미등록 → WASM 렌더링 전면 실패 | **치명** | 브라우저 테스트 |
| 2 | `viewport-manager.ts` | `setScrollTop()` 내부 scrollY 미갱신 → 줌 변경 시 잘못된 페이지 렌더링 | 높음 | 코드 리뷰 |
| 3 | `canvas-view.ts` | `loadDocument()` getPageInfo 루프에 try-catch 없음 → 부분 실패 시 전체 중단 | 중간 | 코드 리뷰 |
| 4 | `canvas-view.ts` | `renderPage()` WASM 렌더링 예외 시 빈 캔버스가 DOM에 잔류 | 중간 | 코드 리뷰 |
| 5 | `canvas-pool.ts` | `releaseAll()` Map 순회 중 삭제 → 명시적 키 배열 복사로 안전성 확보 | 낮음 | 코드 리뷰 |

## 수정 상세

### 1. WasmBridge `measureTextWidth` 등록 (치명)

**문제:** WASM 렌더러(`renderPageToCanvas`)가 텍스트 배치를 위해 `globalThis.measureTextWidth(font, text)`를 호출하는데, 기존 `web/index.html`에는 `<script>` 태그로 등록되어 있었으나 rhwp-studio에는 누락되어 전체 렌더링이 실패.

**수정:** `WasmBridge.initialize()`에서 WASM 초기화 전에 Canvas 2D API 기반 `measureTextWidth` 함수를 `globalThis`에 등록.

```typescript
private installMeasureTextWidth(): void {
  if ((globalThis as Record<string, unknown>).measureTextWidth) return;
  let ctx: CanvasRenderingContext2D | null = null;
  let lastFont = '';
  (globalThis as Record<string, unknown>).measureTextWidth = (font: string, text: string): number => {
    if (!ctx) {
      ctx = document.createElement('canvas').getContext('2d');
    }
    if (font !== lastFont) {
      ctx!.font = font;
      lastFont = font;
    }
    return ctx!.measureText(text).width;
  };
}
```

### 2. ViewportManager `setScrollTop()` 상태 동기화

```typescript
// 수정 전
setScrollTop(y: number): void {
  if (this.container) {
    this.container.scrollTop = y;
  }
}

// 수정 후
setScrollTop(y: number): void {
  if (this.container) {
    this.container.scrollTop = y;
    this.scrollY = this.container.scrollTop;  // 브라우저 클램프 값 반영
  }
}
```

### 3. CanvasView `loadDocument()` 에러 핸들링

- 개별 `getPageInfo()` 호출을 try-catch로 감싸 실패 페이지 건너뜀
- 로드된 페이지 0개 시 early return
- 로그에 성공/전체 비율 표시

### 4. CanvasView `renderPage()` 에러 핸들링

- WASM 렌더링 예외 시 캔버스를 풀에 반환하고 early return
- 빈 캔버스 DOM 잔류 방지

### 5. CanvasPool `releaseAll()` 안전성

```typescript
// 수정 전
releaseAll(): void {
  for (const [pageIdx] of this.inUse) { this.release(pageIdx); }
}

// 수정 후
releaseAll(): void {
  const pages = Array.from(this.inUse.keys());
  for (const pageIdx of pages) { this.release(pageIdx); }
}
```

## 브라우저 런타임 검증 결과

| 검증 항목 | 결과 |
|----------|------|
| WASM 초기화 성공 여부 (상태바 메시지) | 정상 |
| HWP 파일 로드 및 페이지 렌더링 | 정상 |
| 연속 스크롤 시 Canvas 풀링 동작 | 정상 |
| 줌 변경 시 스크롤 위치 유지 | 정상 |
| 드래그 앤 드롭 시각 피드백 | 정상 |

## 빌드 검증

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| `tsc --noEmit` | 통과 | 통과 |
| `vite build` | 성공 (240ms) | 성공 (99ms) |
| JS 번들 | 28.19 kB | 28.82 kB (+630B) |
| CSS | 1.38 kB | 변경 없음 |
| WASM | 874.62 kB | 변경 없음 |

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `rhwp-studio/src/core/wasm-bridge.ts` | `installMeasureTextWidth()` 메서드 추가 |
| `rhwp-studio/src/view/viewport-manager.ts` | `setScrollTop()` 내부 scrollY 동기화 추가 |
| `rhwp-studio/src/view/canvas-view.ts` | `loadDocument()`, `renderPage()` 에러 핸들링 추가 |
| `rhwp-studio/src/view/canvas-pool.ts` | `releaseAll()` 키 배열 복사 후 순회로 변경 |

## 산출물

| 문서 | 경로 |
|------|------|
| 수행계획서 | `mydocs/plans/task_46.md` |
| 단계 1 완료보고 | `mydocs/working/task_46_step1.md` |
| 단계 2 완료보고 | `mydocs/working/task_46_step2.md` |
| 최종 결과보고서 | `mydocs/working/task_46_final.md` |
