# 타스크 68 구현 계획서: 비동기 웹폰트 로딩 완료 후 자동 리렌더링

## 1단계: font-loader.ts — background Promise 반환

**수정 파일**: `rhwp-studio/src/core/font-loader.ts`

- `loadWebFonts()` 반환 타입: `Promise<void>` → `Promise<{ backgroundDone: Promise<void> }>`
- 기존 `fire-and-forget` 호출을 변수에 저장하여 반환

```typescript
// 변경 전
export async function loadWebFonts(): Promise<void> {
  // ...
  loadFontsInBackground(rest); // fire-and-forget
}

// 변경 후
export async function loadWebFonts(): Promise<{ backgroundDone: Promise<void> }> {
  // ...
  const backgroundDone = loadFontsInBackground(rest);
  return { backgroundDone };
}
```

## 2단계: main.ts — 2단계 완료 시 자동 리렌더링

**수정 파일**: `rhwp-studio/src/main.ts`

- `loadWebFonts()` 결과에서 `backgroundDone` Promise를 저장
- `backgroundDone` 완료 시 문서가 열려있으면 `canvasView.refreshPages()` 호출

```typescript
const { backgroundDone } = await loadWebFonts();

// 2단계 폰트 로딩 완료 시 자동 리렌더링
backgroundDone.then(() => {
  if (canvasView && wasm.pageCount > 0) {
    console.log('[main] 백그라운드 폰트 로딩 완료 → 페이지 리렌더링');
    canvasView.refreshPages();
  }
});
```

## 3단계: 빌드 검증

- `cd rhwp-studio && npx vite build` — TS 빌드 성공 확인
- 콘솔 로그 메시지로 리렌더링 트리거 동작 확인 가능

## 수정 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `rhwp-studio/src/core/font-loader.ts` | 반환 타입에 `backgroundDone` Promise 포함 |
| `rhwp-studio/src/main.ts` | `backgroundDone` 완료 시 `refreshPages()` 호출 |
