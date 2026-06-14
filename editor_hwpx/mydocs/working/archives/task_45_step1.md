# 타스크 45 단계 1 완료보고서

## 단계: 프로젝트 스캐폴딩 + WASM 연동

## 수행 내용

### 1. 프로젝트 구조 생성

```
rhwp-studio/
├── src/
│   ├── main.ts              ← 앱 진입점 (WASM 초기화, 파일 로드)
│   ├── style.css            ← 전체 스타일
│   ├── core/
│   │   ├── wasm-bridge.ts   ← WASM 모듈 래퍼
│   │   ├── event-bus.ts     ← 이벤트 발행/구독
│   │   └── types.ts         ← 공통 타입 (DocumentInfo, PageInfo)
│   ├── view/                ← (단계 2~3에서 구현)
│   └── ui/                  ← (단계 4에서 구현)
├── index.html               ← 진입 HTML (toolbar + scroll-container)
├── package.json             ← Vite + TypeScript
├── tsconfig.json            ← 경로 alias (@/, @wasm/)
├── vite.config.ts           ← fs.allow, alias 설정
└── .gitignore
```

### 2. 핵심 모듈

#### WasmBridge (`core/wasm-bridge.ts`)
- `initialize()`: WASM init + 버전 로그
- `loadDocument(data)`: HwpDocument 생성, convertToEditable, DocumentInfo 반환
- `getPageInfo(pageNum)`: 페이지별 폭/높이/섹션 인덱스 (JSON 파싱)
- `renderPageToCanvas(pageNum, canvas)`: Canvas 렌더링 위임
- `dispose()`: 메모리 해제

#### EventBus (`core/event-bus.ts`)
- `on(event, handler)`: 구독 (해제 함수 반환)
- `emit(event, ...args)`: 발행
- `removeAll()`: 전체 해제

#### Types (`core/types.ts`)
- `DocumentInfo`: WASM `getDocumentInfo()` 반환 타입
- `PageInfo`: WASM `getPageInfo()` 반환 타입

### 3. WASM 연동 방식

- 경로: `../pkg/rhwp.js` → Vite alias `@wasm`으로 해석
- `vite.config.ts`의 `fs.allow: ['..']`로 상위 디렉토리 접근 허용
- `tsconfig.json`의 `paths`로 TypeScript 경로 해석 연결

### 4. UI 기본 골격

HTML에 toolbar + scroll-container 구조를 미리 마련:
- 파일 열기, 줌 컨트롤, 페이지 정보, 상태 표시

### 5. 검증 결과

- `npm install`: 14개 패키지 설치 완료
- `tsc --noEmit`: TypeScript 타입 체크 통과 (에러 0)

## 산출물

| 파일 | 역할 |
|------|------|
| `rhwp-studio/package.json` | 프로젝트 메타 + 의존성 |
| `rhwp-studio/tsconfig.json` | TypeScript 설정 + 경로 alias |
| `rhwp-studio/vite.config.ts` | Vite 빌드 설정 |
| `rhwp-studio/index.html` | 진입 HTML |
| `rhwp-studio/src/main.ts` | 앱 진입점 |
| `rhwp-studio/src/style.css` | 전체 스타일 |
| `rhwp-studio/src/core/wasm-bridge.ts` | WASM 래퍼 |
| `rhwp-studio/src/core/event-bus.ts` | 이벤트 버스 |
| `rhwp-studio/src/core/types.ts` | 공통 타입 |
| `rhwp-studio/.gitignore` | Git 제외 규칙 |

## 다음 단계

단계 2: 가상 스크롤 + Canvas 풀
- VirtualScroll: 페이지 Y 오프셋 계산, 가시 페이지 목록
- CanvasPool: Canvas 할당/반환/재활용
- ViewportManager: 스크롤 이벤트 핸들링
