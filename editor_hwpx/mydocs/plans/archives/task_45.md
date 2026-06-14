# 타스크 45 수행계획서: rhwp-studio 프로젝트 초기 구축 + 캔버스 뷰어 프로토타입

> 작성일: 2026-02-12

## 목표

타스크 44에서 설계한 아키텍처를 기반으로 **rhwp-studio** 프로젝트를 초기 구축하고, HWP 문서를 연속 스크롤 캔버스 뷰로 표시하는 **뷰어 프로토타입**을 구현한다.

## 범위

### 포함

- Vite + TypeScript 프로젝트 초기 설정
- WASM 연동 (`pkg/` → rhwp-studio import)
- 연속 스크롤 캔버스 뷰 (VirtualScroll + CanvasPool)
- 3단계 좌표 체계 (Document / Page / Viewport)
- 파일 업로드 → 렌더링 기본 UI
- 줌(확대/축소) 기본 지원

### 제외 (향후 타스크)

- 편집 엔진 (커서, 선택, 입력, 명령)
- HwpCtrl 호환 레이어
- Docker 빌드 체계 (로컬 개발 우선)

## 기술 기반

| 항목 | 선택 | 참조 |
|------|------|------|
| 빌드 | Vite 6.x | 설계서 §2.4 |
| 언어 | TypeScript 5.x | 설계서 §2.4 |
| 캔버스 | HTML Canvas 2D | 설계서 §2.4, §5 |
| WASM | `pkg/rhwp.js` + `pkg/rhwp_bg.wasm` | 설계서 §2.5 |
| 스타일 | Vanilla CSS (외부 프레임워크 없음) | 최소 의존성 |

## 현재 WASM API 활용 목록

기존 뷰어(`web/app.js`)에서 사용 중인 API를 그대로 활용한다:

| API | 용도 |
|-----|------|
| `init()` | WASM 초기화 |
| `new HwpDocument(data)` | 문서 로드 |
| `doc.convertToEditable()` | 배포용 문서 변환 |
| `doc.pageCount()` | 총 페이지 수 |
| `doc.renderPageToCanvas(page, canvas)` | Canvas 렌더링 |
| `doc.getDocumentInfo()` | 문서 정보 (JSON) |
| `version()` | rhwp 버전 |

추가로 필요한 API:
| API | 용도 | 비고 |
|-----|------|------|
| `doc.getPageDimensions(page)` | 페이지별 크기 (폭, 높이) | 없으면 첫 렌더링 후 Canvas 크기로 추정 |

## 프로젝트 구조

```
rhwp-studio/
├── src/
│   ├── main.ts              ← 앱 진입점
│   ├── core/
│   │   ├── wasm-bridge.ts   ← WASM 모듈 로딩/호출 래퍼
│   │   ├── event-bus.ts     ← 내부 이벤트 버스
│   │   └── types.ts         ← 공통 타입 정의
│   ├── view/
│   │   ├── canvas-view.ts   ← 연속 스크롤 캔버스 뷰 (진입점)
│   │   ├── virtual-scroll.ts← 가상 스크롤 (페이지 Y 오프셋, 가시 페이지 계산)
│   │   ├── canvas-pool.ts   ← Canvas 풀 관리 (할당/반환/재활용)
│   │   ├── page-renderer.ts ← 페이지별 렌더링 (WASM 호출 + 데코레이션)
│   │   ├── viewport-manager.ts ← 뷰포트 상태 (스크롤, 줌)
│   │   └── coordinate-system.ts ← 3단계 좌표 변환
│   └── ui/
│       └── toolbar.ts       ← 최소 UI (파일 열기, 줌, 페이지 정보)
├── public/
│   └── favicon.ico
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .gitignore
```

## 단계 구성 (4단계)

### 단계 1: 프로젝트 스캐폴딩 + WASM 연동

**작업 내용**:
- Vite + TypeScript 프로젝트 생성 (`rhwp-studio/`)
- `tsconfig.json`, `vite.config.ts` 설정
- `pkg/` WASM 모듈 import 경로 설정 (Vite alias 또는 상대 경로)
- `WasmBridge` 클래스: WASM 초기화, 문서 로드, 렌더링 래핑
- `EventBus` 클래스: 간단한 이벤트 발행/구독
- 공통 타입 정의 (`types.ts`)
- 검증: WASM 로드 → HWP 파일 열기 → `console.log(pageCount)` 성공

**산출물**: `rhwp-studio/` 프로젝트 기본 골격, WASM 연동 동작 확인

### 단계 2: 가상 스크롤 + Canvas 풀

**작업 내용**:
- `VirtualScroll`: 페이지 Y 오프셋 계산, 가시 페이지 목록 반환
- `CanvasPool`: Canvas 할당/반환/재활용, DOM 추가/제거
- `ViewportManager`: 스크롤 이벤트 핸들링, 줌 상태
- 스크롤 컨테이너 HTML/CSS 레이아웃 구성
- 검증: 페이지 수만큼의 가상 높이, 스크롤 시 Canvas 할당/반환 로그 확인

**산출물**: 가상 스크롤 인프라 동작

### 단계 3: 페이지 렌더링 + 좌표 체계

**작업 내용**:
- `PageRenderer`: WASM `renderPageToCanvas()` 호출, 페이지 데코레이션 (그림자, 테두리)
- `CoordinateSystem`: 뷰포트 ↔ 문서 ↔ 페이지 좌표 변환
- `CanvasView`: 전체 뷰 조립 (VirtualScroll + CanvasPool + PageRenderer + CoordinateSystem)
- 스크롤 시 보이는 페이지 자동 렌더링, 벗어난 페이지 해제
- 프리페치: 뷰포트 인접 1~2페이지 미리 렌더링
- 이미지 비동기 로드 대응 (지연 재렌더링)
- 검증: HWP 파일 로드 → 연속 스크롤로 전체 페이지 탐색 가능

**산출물**: 연속 스크롤 캔버스 뷰 동작

### 단계 4: UI + 줌 + 마무리

**작업 내용**:
- 기본 UI: 파일 열기 버튼, 줌 컨트롤(+/-/100%), 페이지 표시 (현재/전체)
- 줌 처리: Canvas 크기 조정 + 페이지 높이 재계산 + 스크롤 위치 보정
- 현재 페이지 표시: 스크롤 위치 기반으로 현재 보이는 페이지 번호 갱신
- 키보드 단축키: Ctrl+/Ctrl- (줌), Ctrl+0 (100%)
- 전체 코드 정리, 오류 처리 보강
- 검증: 다양한 샘플 HWP 파일 로드 + 스크롤 + 줌 테스트

**산출물**: 완성된 캔버스 뷰어 프로토타입

## 성능 목표

| 지표 | 목표 |
|------|------|
| WASM 초기화 | < 100ms |
| 문서 로드 (10페이지) | < 500ms |
| 페이지 렌더링 | < 50ms/페이지 |
| 스크롤 응답 | 60fps (16ms 프레임) |
| Canvas 풀 크기 | 최대 5~7개 |

## 참조 설계 문서

- `mydocs/plans/task_44_architecture.md` §2 (프로젝트 구조)
- `mydocs/plans/task_44_architecture.md` §5 (연속 스크롤 캔버스 뷰)
- `web/app.js` (기존 뷰어 WASM 연동 패턴)
