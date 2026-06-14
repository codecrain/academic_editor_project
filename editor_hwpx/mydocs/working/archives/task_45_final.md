# 타스크 45 최종 결과보고서

## 타스크: rhwp-studio 프로젝트 초기 구축 + 캔버스 뷰어 프로토타입

## 개요

타스크 44의 아키텍처 설계서(§2, §5)를 기반으로 **rhwp-studio** 프로젝트를 초기 구축하고, HWP 문서를 연속 스크롤 캔버스 뷰로 표시하는 뷰어 프로토타입을 구현하였다.

## 수행 단계

| 단계 | 작업 내용 | 산출물 |
|------|----------|--------|
| **1** | 프로젝트 스캐폴딩 + WASM 연동 | Vite+TS 프로젝트, WasmBridge, EventBus, Types |
| **2** | 가상 스크롤 + Canvas 풀 | VirtualScroll, CanvasPool, ViewportManager |
| **3** | 페이지 렌더링 + 좌표 체계 | PageRenderer, CoordinateSystem, CanvasView |
| **4** | UI + 줌 + 마무리 | 드래그앤드롭, 줌 컨트롤, 코드 정리 |

## 프로젝트 구조

```
rhwp-studio/               (15개 파일)
├── src/
│   ├── main.ts              ← 앱 진입점
│   ├── style.css            ← 전체 스타일
│   ├── core/
│   │   ├── wasm-bridge.ts   ← WASM 모듈 래퍼
│   │   ├── event-bus.ts     ← 이벤트 발행/구독
│   │   └── types.ts         ← 공통 타입
│   └── view/
│       ├── canvas-view.ts   ← 연속 스크롤 캔버스 뷰 (전체 조립)
│       ├── virtual-scroll.ts← 가상 스크롤
│       ├── canvas-pool.ts   ← Canvas 풀
│       ├── page-renderer.ts ← 페이지 렌더링
│       ├── viewport-manager.ts ← 뷰포트 상태
│       └── coordinate-system.ts ← 좌표 변환
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .gitignore
```

## 핵심 구현

### 1. WASM 연동

- `pkg/rhwp.js` + `pkg/rhwp_bg.wasm`을 Vite alias(`@wasm`)로 직접 import
- `vite.config.ts`의 `fs.allow: ['..']`로 상위 디렉토리 접근 허용
- 기존 WASM API 7개 활용: `init`, `HwpDocument`, `pageCount`, `getPageInfo`, `renderPageToCanvas`, `getDocumentInfo`, `convertToEditable`

### 2. 연속 스크롤 캔버스 뷰 (설계서 §5 구현)

| 컴포넌트 | 역할 |
|----------|------|
| **VirtualScroll** | 페이지별 Y 오프셋 계산, 가시 페이지 목록 반환, 프리페치(±1) |
| **CanvasPool** | Canvas DOM 요소 할당/반환/재활용 (메모리 절약) |
| **PageRenderer** | WASM renderPageToCanvas 호출 + 200ms 지연 재렌더링(이미지 대응) |
| **ViewportManager** | 스크롤/리사이즈 이벤트 → EventBus 발행, 줌 상태 관리 |
| **CoordinateSystem** | 뷰포트 ↔ 문서 ↔ 페이지 3단계 좌표 변환 |
| **CanvasView** | 전체 조립 — 스크롤 시 보이는 페이지만 렌더링, 벗어난 페이지 해제 |

### 3. 줌

- 25% ~ 400% 범위, 10% 단위
- CSS 스케일링: WASM은 원본 크기로 렌더링 → `canvas.style.width/height`로 줌 적용
- 줌 변경 시 스크롤 위치 보정: 뷰포트 중앙 페이지 기준으로 비율 유지

### 4. UI

- 파일 열기: input + 드래그 앤 드롭
- 줌 컨트롤: 버튼 + 키보드 (Ctrl+/Ctrl-/Ctrl+0)
- 현재 페이지: 뷰포트 중앙 기준 자동 갱신

## 빌드 검증

| 검증 항목 | 결과 |
|----------|------|
| `tsc --noEmit` | 통과 (에러 0) |
| `vite build` | 성공 (251ms) |
| JS 번들 | 28.19 kB (gzip 7.99 kB) |
| CSS | 1.38 kB (gzip 0.62 kB) |
| WASM | 874.62 kB (gzip 331.28 kB) |
| 모듈 수 | 13개 |

## 산출물 목록

| 문서 | 경로 | 내용 |
|------|------|------|
| 수행계획서 | `mydocs/plans/task_45.md` | 4단계 수행 계획 |
| 구현계획서 | `mydocs/plans/task_45_impl.md` | 4단계 상세 구현 계획 |
| 단계 1 완료보고 | `mydocs/working/task_45_step1.md` | 프로젝트 스캐폴딩 결과 |
| 단계 2 완료보고 | `mydocs/working/task_45_step2.md` | 가상 스크롤 구현 결과 |
| 단계 3 완료보고 | `mydocs/working/task_45_step3.md` | 페이지 렌더링 구현 결과 |
| 단계 4 완료보고 | `mydocs/working/task_45_step4.md` | UI + 줌 마무리 결과 |
| **소스 코드** | `rhwp-studio/` | 15개 파일, TypeScript 뷰어 프로토타입 |

## 설계서 §2/§5 구현 달성도

| 설계 항목 | 상태 |
|----------|------|
| Vite + TypeScript 프로젝트 | 완료 |
| WASM 연동 (pkg/ import) | 완료 |
| VirtualScroll + 페이지 Y 오프셋 | 완료 |
| Canvas 풀링 | 완료 |
| 뷰포트 기반 렌더링 | 완료 |
| 3단계 좌표 체계 | 완료 |
| 페이지 데코레이션 (그림자) | 완료 (CSS) |
| 줌 처리 | 완료 |
| EventBus 내부 이벤트 | 완료 |
| Docker Compose studio 서비스 | 미구현 (범위 제외) |
| engine/, compat/, ui/ 모듈 | 미구현 (향후 편집 타스크) |
