# rhwp-studio 편집 엔진 아키텍처 설계서

> 타스크 44 산출물 | 작성일: 2026-02-12

---

## 1. 현재 아키텍처 분석

### 1.1 렌더링 파이프라인 개요

현재 rhwp는 **배치형 단방향 파이프라인**으로 구성되어 있다:

```
HWP 바이너리
  → 파서 (parse_hwp)
  → Document Model (IR)
  → compose_section()     [Composer]
  → measure_section()     [HeightMeasurer]
  → paginate()            [Paginator]
  → build_render_tree()   [LayoutEngine]
  → Renderer 백엔드 (SVG / HTML / Canvas)
```

편집 시 작업 흐름:

```
텍스트 삽입/삭제
  → reflow_line_segs()            [단일 문단 리플로우]
  → compose_section() (전체)      [구역 전체 재구성]
  → paginate()       (전체)       [전체 재페이지네이션]
  → build_render_tree() (1페이지)  [요청된 페이지만 렌더링]
```

### 1.2 모듈별 심층 분석

#### 1.2.1 Composer (`src/renderer/composer.rs`, 1,067줄)

**역할**: 문단 텍스트를 줄(LineSeg) 단위로 분할하고, 각 줄 내에서 CharShapeRef 경계와 언어 경계에 따라 TextRun으로 세분화한다.

**핵심 구조**:
- `ComposedTextRun` — 동일 스타일 + 동일 언어 구간의 텍스트 조각
- `ComposedLine` — LineSeg 기반 줄 정보 (runs, line_height, baseline 등)
- `ComposedParagraph` — 줄 목록 + 인라인 컨트롤 위치

**핵심 함수**:
| 함수 | 동작 | 입출력 |
|------|------|--------|
| `compose_section()` | 구역 전체 문단을 순차 구성 | `&Section → Vec<ComposedParagraph>` |
| `compose_paragraph()` | 단일 문단 구성 | `&Paragraph → ComposedParagraph` |
| `reflow_line_segs()` | 텍스트 편집 후 줄바꿈 재계산 | `&mut Paragraph, width, styles, dpi` |

**재활용 범위**: ★★★★☆
- `compose_paragraph()`: 편집기에서 그대로 재사용 가능. 단, 증분 호출 인터페이스 필요
- `reflow_line_segs()`: 이미 단일 문단 리플로우 기능. 편집기의 TextFlow 엔진 핵심으로 활용
- `split_runs_by_lang()`: 다국어 폰트 매핑에 필수. 그대로 재사용

**리팩터링 필요사항**:
- `compose_section()` → 증분 호출 지원: `compose_paragraph_at(section, para_idx)` 추가
- `identify_inline_controls()` → 현재 모든 컨트롤을 line_index=0으로 배치. 정확한 줄 위치 계산 필요
- 인라인 컨트롤(표/도형)의 줄 내 정확한 위치가 커서 모델에 필수

#### 1.2.2 HeightMeasurer (`src/renderer/height_measurer.rs`, 486줄)

**역할**: 페이지네이션 전에 모든 콘텐츠의 렌더링 높이를 사전 측정한다.

**핵심 구조**:
- `MeasuredParagraph` — 문단 총 높이, 줄별 높이, spacing, 표/그림 포함 여부
- `MeasuredTable` — 표 총 높이, 행별 높이, 캡션 높이, 제목행 반복 여부
- `MeasuredSection` — 구역 전체 측정 결과

**핵심 함수**:
| 함수 | 동작 |
|------|------|
| `measure_section()` | 구역 전체 콘텐츠 높이 측정 |
| `measure_paragraph()` | 단일 문단 높이 (줄별 높이 합산 + spacing) |
| `measure_table()` | 표 높이 (셀 내용 기반, 3단계 계산) |
| `estimate_footnote_area_height()` | 각주 영역 높이 추정 |

**재활용 범위**: ★★★☆☆
- 페이지네이션 전 높이 측정은 편집기에서도 필요하지만, 증분 측정 인터페이스 부재
- 표 높이 측정 로직은 그대로 재사용 가능

**리팩터링 필요사항**:
- 증분 측정 API 추가: `remeasure_paragraph(para_idx)` — 변경된 문단만 재측정
- 캐싱: `MeasuredSection`을 유지하고, 변경된 문단만 갱신

#### 1.2.3 Paginator (`src/renderer/pagination.rs`, 935줄)

**역할**: 2-패스 페이지네이션. (1) 높이 측정 → (2) 페이지 분할.

**핵심 구조**:
- `PaginationResult` — 페이지별 콘텐츠 목록
- `PageContent` — 단별 항목, 머리말/꼬리말, 각주 참조
- `PageItem` — FullParagraph / PartialParagraph / Table / PartialTable / Shape

**핵심 기능**:
- 높이 초과 시 자동 페이지 넘김
- 강제 페이지/구역 나누기 (ColumnBreakType)
- 표 행 단위 분할 (PartialTable, 제목행 반복 지원)
- 다단(Column) 레이아웃 지원
- 각주 높이를 본문 사용 가능 높이에서 동적 차감

**재활용 범위**: ★★☆☆☆
- 현재 방식은 **전체 재페이지네이션** (매번 clear → 전체 재구성)
- 편집기에서는 **증분 페이지네이션** 필수 (변경 지점부터만 재계산)
- PageItem 열거형, PageContent 구조는 그대로 활용 가능

**리팩터링 필요사항**:
- 증분 페이지네이션 엔진: `repaginate_from(page_idx, para_idx)` — 특정 지점부터만 재분할
- dirty page 추적: 어떤 페이지가 영향받는지 범위 계산
- 안정 페이지(stable page) 감지: 재페이지네이션이 더 이상 영향을 미치지 않는 경계 탐지

#### 1.2.4 LayoutEngine (`src/renderer/layout.rs`, 5,017줄)

**역할**: 페이지 분할 결과를 받아 각 요소의 절대 좌표와 크기를 계산하고 PageRenderTree를 생성한다.

**핵심 메서드**:
| 메서드 | 역할 |
|--------|------|
| `build_render_tree()` | 진입점: PageContent → PageRenderTree |
| `layout_paragraph()` / `layout_partial_paragraph()` | 문단 레이아웃 (ComposedParagraph 기반) |
| `layout_composed_paragraph()` | 줄/런 기반 상세 레이아웃 (정렬, 들여쓰기, 배경) |
| `layout_table()` / `layout_partial_table()` | 전체/부분 표 레이아웃 (열 폭 3단계 추론, 행 높이 계산) |
| `layout_body_picture()` | 이미지 레이아웃 (위치 계산, 캡션) |
| `layout_shape()` / `layout_shape_object()` | 도형 레이아웃 (Rectangle, Ellipse, Path, Group) |
| `layout_footnote_area()` | 각주 영역 레이아웃 (구분선 + 각주 문단) |
| `estimate_text_width()` | 텍스트 폭 추정 (WASM: JS measureText / 네이티브: 휴리스틱) |
| `compute_char_positions()` | 글자별 X 경계값 계산 (N글자 → N+1개 경계값) |

**텍스트 폭 측정 (WASM 환경)**:
```
1000pt 기준 폰트 문자열 생성
  → js_measure_text_width() 호출 (Canvas measureText)
  → 실제 font_size로 스케일링
  → HWP 단위 양자화 (×75 → 반올림 → ÷75)
  → ratio(장평) + letter_spacing(자간) 적용
```

**재활용 범위**: ★★★☆☆
- `layout_table()`, `layout_shape()` 등 복잡한 레이아웃 로직은 재사용 가치 높음
- `estimate_text_width()`, `compute_char_positions()`: 커서 위치 계산의 핵심. 완전 재사용
- 그러나 현재 구조는 1페이지 단위 배치형이므로, 연속 스크롤 뷰에서는 좌표 체계 변환 필요

**리팩터링 필요사항**:
- 좌표 체계 이원화: 페이지 로컬 좌표 ↔ 문서 글로벌 좌표 변환 레이어
- 문단 레이아웃 캐싱: 변경되지 않은 문단의 렌더 서브트리 재사용
- `layout_composed_paragraph()`에서 dirty 문단만 재계산하는 분기 추가

#### 1.2.5 RenderTree (`src/renderer/render_tree.rs`, 405줄)

**역할**: IR에서 변환된 렌더링 전용 트리 구조. 페이지 내 위치/크기가 계산된 상태를 가진다.

**핵심 구조**:
- `RenderNode` — id, node_type, bbox, children, **dirty**, visible
- `RenderNodeType` — Page, Body, TextLine, TextRun, Table, TableCell, Line, Rectangle, Ellipse, Path, Image, Group, TextBox
- `BoundingBox` — x, y, width, height (픽셀 단위) + intersects(), contains()
- `PageRenderTree` — root RenderNode + 노드 ID 카운터

**이미 구현된 증분 메커니즘**:
```rust
// Dirty 플래그 기반 변경 추적
node.invalidate()          // dirty = true
node.mark_clean()          // dirty = false
node.mark_clean_recursive()
tree.needs_render()        // dirty 노드 존재 여부
```

**재활용 범위**: ★★★★★
- RenderNode, RenderNodeType, BoundingBox: 편집기에서 완전 재사용
- Dirty flag 메커니즘: 증분 렌더링의 기반으로 활용
- TextRunNode에 이미 편집용 메타데이터 포함 (section_index, para_index, char_start, cell 정보)

**리팩터링 필요사항**:
- 최소한: RenderNode에 `document_y` (문서 글로벌 Y좌표) 필드 추가 (연속 스크롤 뷰용)
- 히트 테스팅 헬퍼: `find_node_at(x, y)` → 좌표에서 RenderNode 역방향 탐색

#### 1.2.6 WASM API (`src/wasm_api.rs`, 16,395줄)

**역할**: JavaScript에서 호출 가능한 HWP 문서 조회/편집/렌더링 API.

**현재 편집 기능 (60+ 메서드)**:
| 카테고리 | 메서드 수 | 주요 기능 |
|---------|---------|----------|
| 문서 초기화 | 5 | new(), create_empty(), page_count() 등 |
| 렌더링 | 6 | SVG, HTML, Canvas 렌더링 |
| 텍스트 편집 | 12 | insert/delete_text (본문+셀), split/merge_paragraph |
| 표 조작 | 5 | 행/열 삽입, 셀 병합/분할 |
| 서식 조회/적용 | 11 | 글자/문단 서식 조회 및 적용 (본문+셀) |
| 클립보드 | 11 | 복사, 붙여넣기, HTML 변환 |
| 기타 | 4 | export_hwp(), convert_to_editable() 등 |

**편집 작업 흐름 (모든 편집 메서드 공통)**:
```
1. 범위 검증
2. raw_stream 무효화 (재직렬화 유도)
3. 텍스트/구조 편집
4. reflow_paragraph() — 해당 문단만 줄바꿈 재계산
5. compose_section() — 구역 전체 재구성 ★ 병목
6. paginate()        — 전체 재페이지네이션 ★ 병목
7. 캐럿 위치 갱신
8. 결과 반환 (JSON)
```

**재활용 범위**: ★★☆☆☆
- 편집 API의 비즈니스 로직(텍스트 삽입/삭제, 서식 적용, 표 조작)은 Rust 코어에서 재사용
- 그러나 WASM 바인딩 레이어는 편집기에서 다른 인터페이스가 필요 (명령 패턴 기반)
- `reflow_paragraph()` / `reflow_cell_paragraph()`: 증분 리플로우의 기초로 활용

**리팩터링 필요사항**:
- 편집 작업을 Command 패턴으로 분리 (Undo/Redo 지원)
- 5번(compose_section 전체) → 증분 compose로 전환
- 6번(paginate 전체) → 증분 paginate로 전환
- 배치 편집 API: 여러 편집을 하나의 트랜잭션으로 묶기

### 1.3 렌더링 스케줄러 및 기존 증분 메커니즘

현재 코어에는 이미 다음 메커니즘이 구현되어 있다:

| 메커니즘 | 위치 | 상태 | 편집기 활용 |
|---------|------|------|-----------|
| Dirty flag (RenderNode) | render_tree.rs | 구현됨 | 변경 노드만 재렌더링 |
| RenderScheduler | scheduler.rs | 구현됨 | 뷰포트 기반 우선순위 렌더링 |
| RenderObserver 트레이트 | scheduler.rs | 구현됨 | 이벤트 기반 렌더링 트리거 |
| Viewport 구조체 | scheduler.rs | 구현됨 | 연속 스크롤 뷰의 뷰포트 관리 |
| 페이지 Y 오프셋 | scheduler.rs | 구현됨 | 연속 스크롤 좌표 계산 |
| Prefetch 전략 | scheduler.rs | 구현됨 | 인접 페이지 선제 렌더링 |
| 단일 문단 리플로우 | composer.rs | 구현됨 | 증분 TextFlow의 기초 |

### 1.4 편집기 관점 Gap 식별

| Gap | 현재 상태 | 편집기 요구사항 | 심각도 |
|-----|---------|--------------|-------|
| **증분 Compose** | 구역 전체 재구성 | 변경 문단만 재구성 | 높음 |
| **증분 Paginate** | 전체 재페이지네이션 | 영향 페이지만 재분할 | 높음 |
| **커서 시스템** | 없음 (좌표 기반 API만) | CursorContext 상태 머신 | 최상 |
| **히트 테스팅** | 없음 | 좌표 → 문서 위치 변환 | 최상 |
| **Command 패턴** | 직접 모델 수정 | Undo/Redo 가능한 명령 | 높음 |
| **연속 스크롤 좌표** | 페이지 로컬 좌표만 | 문서 글로벌 좌표 | 높음 |
| **인라인 컨트롤 위치** | 모두 line_index=0 | 정확한 줄 내 위치 | 중간 |
| **선택 모델** | 없음 | 범위/셀 블록 선택 | 높음 |
| **IME 조합** | 없음 (즉시 삽입) | 한글 조합 중간 상태 | 높음 |

---

## 2. rhwp-studio 프로젝트 구조

### 2.1 프로젝트 위치 및 독립성

```
rhwp/
├── src/                  ← Rust 코어 (파서, 모델, 렌더러, WASM API) [공유]
├── web/                  ← 기존 뷰어 (유지, 독립 활용)
├── pkg/                  ← WASM 빌드 산출물 (코어 → .wasm + .js glue)
├── rhwp-studio/          ← 웹기안기 대체 편집기 [신규]
│   ├── src/
│   │   ├── engine/       ← 편집 엔진 (TypeScript)
│   │   ├── view/         ← 연속 스크롤 캔버스 뷰
│   │   ├── compat/       ← HwpCtrl 호환 레이어
│   │   └── ui/           ← 편집기 UI
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── docker-compose.yml    ← wasm 빌드 서비스 추가
```

### 2.2 모듈 의존성 다이어그램

```
┌──────────────────────────────────────────────────────────────┐
│                     rhwp-studio (TypeScript)                 │
│                                                              │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │
│  │ UI Layer │→ │  Command   │→ │  Engine  │→ │   View    │  │
│  │ (Toolbar,│  │  Dispatch  │  │ (Cursor, │  │ (Canvas,  │  │
│  │  Menu,   │  │ (Undo/    │  │  Select, │  │  Scroll,  │  │
│  │  Status) │  │  Redo)    │  │  Flow)   │  │  Viewport)│  │
│  └──────────┘  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│                      │             │               │         │
│            ┌─────────┴─────────────┴───────────────┘         │
│            │   WASM Bridge (pkg/ → JS glue)                  │
│            ▼                                                 │
│  ┌───────────────────────────────────────────┐               │
│  │            rhwp WASM 코어 (Rust)          │               │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐  │               │
│  │  │ Document│ │ Renderer │ │  WASM API  │  │               │
│  │  │  Model  │ │(Composer,│ │(insert,    │  │               │
│  │  │ (IR)    │ │ Layout,  │ │ delete,    │  │               │
│  │  │         │ │ Paginate)│ │ format)    │  │               │
│  │  └─────────┘ └──────────┘ └───────────┘  │               │
│  └───────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 rhwp-studio 내부 모듈 구조

```
rhwp-studio/src/
├── engine/
│   ├── index.ts              ← EditEngine 진입점
│   ├── cursor/
│   │   ├── cursor-model.ts   ← CursorContext 상태 머신
│   │   ├── cursor-movement.ts← 커서 이동 (28+ 타입)
│   │   ├── hit-test.ts       ← 좌표 → 문서 위치 변환
│   │   └── caret-renderer.ts ← 캐럿 블링크, 위치 추적
│   ├── selection/
│   │   ├── selection-model.ts← 범위 선택, 셀 블록 선택
│   │   └── selection-renderer.ts ← 선택 영역 하이라이트
│   ├── input/
│   │   ├── input-handler.ts  ← 키보드/마우스 이벤트 처리
│   │   ├── ime-handler.ts    ← IME 한글 조합
│   │   └── clipboard-handler.ts ← 시스템 클립보드 연동
│   ├── command/
│   │   ├── command.ts        ← EditCommand 인터페이스
│   │   ├── history.ts        ← Undo/Redo 히스토리
│   │   ├── text-commands.ts  ← 텍스트 삽입/삭제 명령
│   │   ├── format-commands.ts← 서식 적용 명령
│   │   └── table-commands.ts ← 표 조작 명령
│   └── flow/
│       ├── text-flow.ts      ← TextFlow (문단 내 줄바꿈)
│       ├── block-flow.ts     ← BlockFlow (문단/표 수직 배치)
│       └── page-flow.ts      ← PageFlow (페이지 분할)
│
├── view/
│   ├── index.ts              ← EditorView 진입점
│   ├── canvas-view.ts        ← 연속 스크롤 캔버스
│   ├── virtual-scroll.ts     ← 가상 스크롤 (뷰포트 기반)
│   ├── page-renderer.ts      ← 페이지별 렌더링 (WASM 호출)
│   └── viewport-manager.ts   ← 뷰포트 상태 관리
│
├── compat/
│   ├── hwp-ctrl.ts           ← HwpCtrl 호환 API
│   ├── action-table.ts       ← Action 매핑 테이블
│   └── event-bridge.ts       ← 이벤트 변환 레이어
│
├── ui/
│   ├── toolbar.ts            ← 도구모음 (서식, 삽입 등)
│   ├── status-bar.ts         ← 상태표시줄 (페이지, 캐럿 위치)
│   ├── context-menu.ts       ← 우클릭 메뉴
│   └── dialog/               ← 대화상자 (표 속성, 글자 속성 등)
│
└── core/
    ├── wasm-bridge.ts        ← WASM 모듈 로딩 및 호출 래퍼
    ├── document-state.ts     ← 문서 상태 관리 (로드, 저장, 변경 추적)
    └── event-bus.ts          ← 내부 이벤트 버스
```

### 2.4 기술 스택

| 항목 | 선택 | 사유 |
|------|------|------|
| **언어** | TypeScript | 타입 안전성, 에디터 생태계 호환 |
| **빌드** | Vite | 빠른 HMR, WASM 플러그인 지원 |
| **캔버스** | HTML Canvas 2D | 기존 rhwp web_canvas.rs 렌더러 활용 |
| **WASM** | wasm-bindgen (기존) | rhwp 코어 빌드 결과물 직접 사용 |
| **상태관리** | 자체 EventBus | 외부 라이브러리 의존 최소화 |
| **테스트** | Vitest | Vite 네이티브 테스트 러너 |

### 2.5 WASM 연동 방식

#### 2.5.1 기존 WASM API 활용

rhwp-studio는 `pkg/` 산출물을 직접 import한다:

```typescript
// wasm-bridge.ts
import init, { HwpDocument } from '../../pkg/rhwp.js';

export class WasmBridge {
    private doc: HwpDocument | null = null;

    async initialize(): Promise<void> {
        await init();  // WASM 초기화
    }

    loadDocument(data: Uint8Array): void {
        this.doc = new HwpDocument(data);
    }

    // 편집 API 래핑 (Command 패턴과 연결)
    insertText(secIdx: number, paraIdx: number, offset: number, text: string): string {
        return this.doc!.insertText(secIdx, paraIdx, offset, text);
    }

    // 렌더링 API
    renderPageToCanvas(pageNum: number, canvas: HTMLCanvasElement): void {
        this.doc!.renderPageToCanvas(pageNum, canvas);
    }
}
```

#### 2.5.2 WASM 코어 확장 전략

현재 WASM API에 없지만 편집기에 필요한 API는 **Rust 코어에 점진적으로 추가**한다:

```
[Phase 1] 기존 API 활용
  - insert_text, delete_text, split_paragraph, merge_paragraph
  - apply_char_format, apply_para_format
  - render_page_to_canvas, get_page_text_layout

[Phase 2] 증분 레이아웃 API 추가
  - recompose_paragraph(sec, para)    ← 단일 문단 재구성
  - repaginate_from(sec, para)        ← 특정 지점부터 재페이지네이션
  - get_paragraph_layout(sec, para)   ← 단일 문단의 레이아웃 캐시

[Phase 3] 커서/히트 테스팅 API 추가
  - hit_test(page, x, y)             ← 좌표 → 문서 위치
  - get_cursor_rect(sec, para, off)  ← 캐럿 사각형 좌표
  - get_line_info(sec, para, line)   ← 줄 정보 (높이, 시작 오프셋)

[Phase 4] 고급 편집 API 추가
  - search_text(query, options)       ← 텍스트 검색
  - replace_text(query, replacement)  ← 텍스트 치환
  - get_field_list()                  ← 필드(누름틀) 목록
  - set_field_value(name, value)      ← 필드 값 설정
```

### 2.6 빌드 체계

#### 2.6.1 Docker Compose 확장

```yaml
# docker-compose.yml 에 추가
services:
  studio:
    build:
      context: .
      dockerfile: Dockerfile.studio
    volumes:
      - ./rhwp-studio:/app
      - ./pkg:/wasm
    ports:
      - "5173:5173"
    command: npm run dev
```

#### 2.6.2 빌드 순서

```
1. WASM 빌드: docker compose run --rm wasm
   → src/ (Rust) → pkg/ (rhwp_bg.wasm + rhwp.js)

2. Studio 개발: docker compose run --rm studio
   → rhwp-studio/ + pkg/ → 개발 서버 (Vite HMR)

3. Studio 배포 빌드:
   → rhwp-studio/ + pkg/ → dist/ (번들 + WASM)
```

### 2.7 레이어 간 책임 분리

| 레이어 | 위치 | 책임 | 언어 |
|--------|------|------|------|
| **문서 모델** | `src/` (Rust) | HWP 파싱, IR 관리, 직렬화 | Rust → WASM |
| **레이아웃 엔진** | `src/` (Rust) | Compose, Measure, Paginate, Layout | Rust → WASM |
| **렌더링 백엔드** | `src/` (Rust) | Canvas/SVG/HTML 렌더링 | Rust → WASM |
| **편집 엔진** | `rhwp-studio/src/engine/` | 커서, 선택, 입력, 명령, 플로우 | TypeScript |
| **뷰** | `rhwp-studio/src/view/` | 캔버스 관리, 스크롤, 뷰포트 | TypeScript |
| **UI** | `rhwp-studio/src/ui/` | 도구모음, 대화상자, 메뉴 | TypeScript |
| **호환** | `rhwp-studio/src/compat/` | HwpCtrl API 호환 레이어 | TypeScript |

**핵심 원칙**:
- 문서 모델과 레이아웃은 **Rust 코어에서 처리** (성능 + 정확성)
- 대화형 편집 로직은 **TypeScript에서 처리** (반응성 + 브라우저 통합)
- 둘 사이의 통신은 **WASM Bridge** (JSON 기반 직렬화)

---

## 3. 플로우 엔진 (TextFlow / BlockFlow / PageFlow)

### 3.1 3계층 플로우 아키텍처 개요

워드프로세서의 레이아웃은 3단계 플로우로 구성된다. 각 계층은 독립적으로 동작하며, 상위 계층이 하위 계층의 결과에 의존한다:

```
편집 발생 (para[3]에 텍스트 삽입)
  ↓
[TextFlow] para[3]만 리플로우 → 줄 수 변경 여부 판단
  ↓ (줄 수 변경 시)
[BlockFlow] para[3]~para[N]의 수직 위치 재계산
  ↓ (높이 초과 시)
[PageFlow] 영향받는 페이지부터 재분할 → 안정 페이지에서 중단
  ↓
[View] dirty 페이지만 재렌더링
```

### 3.2 TextFlow — 문단 내 줄바꿈 엔진

#### 3.2.1 역할

TextFlow는 단일 문단의 텍스트를 **줄(Line)** 단위로 분할하고, 각 줄 내에서 **TextRun** 단위로 분할한다. 현재 rhwp 코어의 `reflow_line_segs()` + `compose_paragraph()`를 기반으로 한다.

#### 3.2.2 입출력

```
입력:
  - Paragraph (text, char_offsets, char_shapes, controls)
  - available_width (사용 가능 폭, 문단 여백 제외)
  - ResolvedStyleSet (글자/문단 스타일)

출력:
  - FlowResult {
      lines: Vec<FlowLine>,        // 줄별 정보
      line_count_changed: bool,     // 이전 대비 줄 수 변경 여부
      total_height: f64,            // 문단 총 높이
      previous_line_count: usize,   // 이전 줄 수 (변경 감지용)
    }
```

#### 3.2.3 FlowLine 구조

```typescript
interface FlowLine {
  // 텍스트 범위
  charStart: number;          // 줄 시작 문자 인덱스 (char 단위)
  charEnd: number;            // 줄 끝 문자 인덱스 (exclusive)

  // 레이아웃 정보
  lineHeight: number;         // 줄 높이 (px)
  baseline: number;           // 베이스라인 거리 (px)
  lineSpacing: number;        // 줄간격 (px)
  width: number;              // 실제 텍스트 폭 (px)

  // TextRun 분할 (Composer의 ComposedLine.runs에 대응)
  runs: FlowRun[];

  // 인라인 컨트롤 (이 줄에 속하는 표/도형)
  inlineControls: InlineControlRef[];
}

interface FlowRun {
  text: string;
  charStyleId: number;
  langIndex: number;
  width: number;              // 런 폭 (px)
  charPositions: number[];    // 글자별 X 경계값 (커서 위치 계산용)
}
```

#### 3.2.4 핵심 알고리즘: 줄바꿈

```
reflow(paragraph, availableWidth):
  1. 현재 줄 수 저장: prevLineCount = paragraph.lineSegs.length

  2. WASM 호출: reflow_line_segs(paragraph, availableWidth, styles, dpi)
     → paragraph.lineSegs 갱신 (Rust 코어에서 수행)

  3. WASM 호출: compose_paragraph(paragraph)
     → ComposedParagraph 반환 (줄/런/인라인 컨트롤)

  4. FlowResult 구성:
     - lines = ComposedParagraph.lines → FlowLine[] 변환
     - 각 FlowRun에 charPositions 계산 (compute_char_positions 호출)
     - line_count_changed = (prevLineCount != lines.length)
     - total_height = sum(line.lineHeight + line.lineSpacing)

  5. 반환: FlowResult
```

#### 3.2.5 HWP 특수 케이스 처리

| 케이스 | 처리 방식 |
|--------|----------|
| **제어 문자** (0x0002 등) | 텍스트 폭 0, 커서는 컨트롤 선택 모드로 전환 |
| **탭 문자** (0x0009) | 다음 탭 정지점까지 폭 계산 |
| **강제 줄바꿈** (0x000A) | 즉시 줄 분할, 남은 폭 무관 |
| **한글 조합 중** | 임시 문자열로 리플로우 수행, 조합 완료 시 확정 |
| **들여쓰기** | 첫 줄만 effective_width = availableWidth - indent |
| **내어쓰기** | 첫 줄 제외 나머지 줄에 indent 적용 (indent < 0) |

### 3.3 BlockFlow — 수직 배치 엔진

#### 3.3.1 역할

BlockFlow는 구역(Section) 내의 **블록 레벨 요소**(문단, 표, 도형)를 수직으로 배치한다. TextFlow가 줄 수 변경을 보고하면, 해당 문단 이후의 모든 블록 위치를 재계산한다.

#### 3.3.2 블록 요소 종류

```typescript
type BlockElement =
  | { type: 'paragraph'; paraIndex: number; height: number; }
  | { type: 'table'; paraIndex: number; controlIndex: number; height: number; }
  | { type: 'picture'; paraIndex: number; controlIndex: number;
      positioning: 'inline' | 'floating'; height: number; }
  | { type: 'shape'; paraIndex: number; controlIndex: number;
      positioning: 'inline' | 'floating' | 'topAndBottom'; height: number; };
```

#### 3.3.3 수직 배치 알고리즘

```
reflow_blocks(section, startParaIdx):
  // startParaIdx부터 끝까지 수직 위치 재계산

  currentY = block[startParaIdx - 1].bottom  // 이전 블록의 하단

  for para in section.paragraphs[startParaIdx..]:
    // 1. 문단 앞 간격
    currentY += para.spacingBefore

    // 2. 문단 자체 높이 (TextFlow 결과)
    block.y = currentY
    block.height = textFlowResult[para].totalHeight
    currentY += block.height

    // 3. 인라인 컨트롤 높이 추가
    for control in para.controls:
      if control.type == 'table':
        // 표 높이 (HeightMeasurer 결과)
        tableBlock.y = currentY
        tableBlock.height = measuredTable.totalHeight
        currentY += tableBlock.height
      elif control.type == 'picture' && control.positioning == 'inline':
        currentY += pictureHeight

    // 4. 문단 뒤 간격
    currentY += para.spacingAfter

    // 5. 플로팅 요소는 별도 처리 (본문 흐름에 영향 없음)
    for control in para.floatingControls:
      calculateFloatingPosition(control)

  return totalHeight = currentY
```

#### 3.3.4 플로팅 요소 처리

HWP의 도형/이미지 배치 방식:

| 속성 | 동작 |
|------|------|
| `treat_as_char` = true | 인라인 배치: 텍스트와 함께 흐름 |
| `horz_rel_to` = Column/Page | 수평 위치 기준 (단 내 / 페이지 내) |
| `vert_rel_to` = Paragraph/Page | 수직 위치 기준 (문단 기준 / 페이지 기준) |
| `text_wrapping` = TopAndBottom | 본문 흐름을 위아래로 밀어냄 |
| `text_wrapping` = Square/Tight | 본문 텍스트가 도형을 감싸며 흐름 |

BlockFlow는 **TopAndBottom** 래핑만 수직 배치에 반영하고, Square/Tight은 TextFlow 단계에서 가용 폭 조정으로 처리한다.

#### 3.3.5 BlockFlow 결과

```typescript
interface BlockFlowResult {
  blocks: BlockLayout[];           // 블록별 Y 위치 + 높이
  totalHeight: number;             // 구역 전체 높이
  dirtyRange: {                    // 영향받은 범위
    startParaIdx: number;
    endParaIdx: number;            // 이 범위 이후는 변경 없음 (또는 끝까지)
  };
}

interface BlockLayout {
  paraIndex: number;
  y: number;                       // 구역 내 Y 좌표
  height: number;                  // 블록 높이
  controlLayouts?: ControlLayout[]; // 인라인 컨트롤 위치
}
```

### 3.4 PageFlow — 페이지 분할 엔진

#### 3.4.1 역할

PageFlow는 BlockFlow의 결과(수직 배치된 블록 목록)를 **페이지 단위**로 분할한다. 현재 Paginator의 기능을 증분 방식으로 확장한다.

#### 3.4.2 HWP 문서 모델과의 매핑

```
HWP 문서 구조                    PageFlow 매핑
─────────────────────           ────────────────────
Section                    →    FlowSection (페이지 분할 단위)
  ├─ SectionDef.PageDef    →    페이지 크기/여백 결정
  ├─ Paragraph[0]          →    BlockElement (문단 or 컨트롤 포함)
  │   ├─ text + line_segs  →    TextFlow → FlowLine[]
  │   └─ controls          →    표/도형 → BlockElement 또는 Float
  ├─ Paragraph[1]          →    BlockElement
  │   └─ Control::Table    →    표 행 분할 가능 (PartialTable)
  └─ ...
```

#### 3.4.3 증분 페이지 분할 알고리즘

```
repaginate_from(sectionIdx, startParaIdx):
  // 1. startParaIdx가 속한 페이지 찾기
  affectedPageIdx = findPageContaining(sectionIdx, startParaIdx)

  // 2. 해당 페이지 이전까지는 유지
  stablePages = pages[0..affectedPageIdx]

  // 3. 해당 페이지부터 재분할 시작
  cursor = { paraIdx: firstParaOfPage(affectedPageIdx), y: 0 }
  newPages = []

  while cursor.paraIdx < section.paragraphs.length:
    page = createNewPage(sectionDef)
    availableHeight = page.bodyHeight - footnoteReserve

    while cursor.y + nextBlockHeight <= availableHeight:
      // 블록 배치 (기존 Paginator 로직과 동일)
      placeBlock(page, block[cursor.paraIdx])
      cursor.y += blockHeight
      cursor.paraIdx++

      if forcePageBreak: break

    newPages.push(page)

    // 4. 안정 페이지 감지: 새 페이지의 첫 문단이 기존과 동일하면 중단
    if isStable(newPages.last(), oldPages[affectedPageIdx + newPages.length]):
      // 나머지 기존 페이지 재사용
      remainingPages = oldPages[affectedPageIdx + newPages.length..]
      break

  // 5. 결과 조합
  pages = [...stablePages, ...newPages, ...remainingPages]

  // 6. dirty 페이지 목록 반환
  return dirtyPages = newPages.map(p => p.pageIndex)
```

#### 3.4.4 안정 페이지(Stable Page) 감지

안정 페이지 = 재페이지네이션의 전파를 차단하는 경계점.

**감지 조건**:
```
isStable(newPage, oldPage):
  // 같은 문단으로 시작하고
  newPage.firstParagraphIndex == oldPage.firstParagraphIndex
  // 같은 줄에서 시작하면 (PartialParagraph의 경우)
  && newPage.firstLineIndex == oldPage.firstLineIndex
  // → 이후 페이지는 동일하므로 재분할 불필요
```

**효과**: 100페이지 문서에서 5페이지의 문단을 편집하면, 5~7페이지만 재분할하고 나머지 93페이지는 기존 결과를 재사용한다.

#### 3.4.5 표/각주/머리말/꼬리말 처리

| 요소 | PageFlow 처리 |
|------|-------------|
| **표 분할** | 행 단위 분할 (PartialTable), 제목행 반복, 기존 Paginator 로직 재사용 |
| **각주** | 본문 가용 높이에서 각주 영역 동적 차감, 기존 로직 재사용 |
| **머리말/꼬리말** | 페이지별 고정 영역, 구역 설정에서 결정 |
| **강제 페이지 나눔** | ColumnBreakType::Page → 즉시 새 페이지 |
| **구역 나눔** | ColumnBreakType::Section → 새 페이지 + 새 PageDef 적용 |
| **다단** | ColumnDef.column_count > 1 → 단 넘침 시 다음 단, 마지막 단 넘침 시 새 페이지 |

### 3.5 3계층 플로우 인터페이스 요약

```typescript
// TextFlow: 문단 → 줄
interface TextFlowEngine {
  reflow(paraIdx: number): FlowResult;
  reflowCell(cellRef: CellRef, cellParaIdx: number): FlowResult;
}

// BlockFlow: 줄 → 블록 수직 배치
interface BlockFlowEngine {
  reflowFrom(sectionIdx: number, startParaIdx: number): BlockFlowResult;
}

// PageFlow: 블록 → 페이지
interface PageFlowEngine {
  repaginateFrom(sectionIdx: number, startParaIdx: number): PageFlowResult;
  getStablePageCount(): number;
  getDirtyPages(): number[];
}
```

---

## 4. 증분 레이아웃 엔진

### 4.1 설계 목표

| 목표 | 기준 |
|------|------|
| 편집 응답 시간 | 16ms 이내 (60fps) |
| 리플로우 범위 | 변경된 문단 + 영향받는 후속 문단만 |
| 재페이지네이션 범위 | 영향받는 페이지 ~ 안정 페이지까지만 |
| 재렌더링 범위 | dirty 페이지 중 뷰포트 내 페이지만 |

### 4.2 Dirty Flag 전파 전략

#### 4.2.1 4단계 Dirty 전파

```
[편집 발생]
  ↓
① Paragraph Dirty: 편집된 문단에 dirty 마킹
  ↓
② Block Dirty: 줄 수 변경 시 해당 문단 이후 블록에 dirty 전파
  ↓
③ Page Dirty: 블록 높이 변경으로 페이지 경계가 변한 페이지에 dirty 전파
  ↓
④ Render Dirty: dirty 페이지의 RenderNode에 invalidate() 호출
```

#### 4.2.2 Dirty 상태 관리

```typescript
interface DirtyTracker {
  // 문단 수준
  dirtyParagraphs: Set<ParagraphRef>;    // {sectionIdx, paraIdx}

  // 블록 수준 (수직 위치 재계산 필요)
  blockDirtyFrom: Map<number, number>;   // sectionIdx → 시작 paraIdx

  // 페이지 수준
  dirtyPages: Set<number>;               // 재분할 필요 페이지 인덱스

  // 렌더 수준
  renderDirtyPages: Set<number>;         // 재렌더링 필요 페이지 인덱스
}
```

#### 4.2.3 Dirty 전파 예시

```
사용자가 5페이지 3번째 문단에 글자 삽입:

① para[sec=0, idx=47] → dirty (리플로우 필요)

② reflow 결과: 줄 수 3→4로 변경
   → block dirty: para[48]~para[N] 수직 위치 재계산

③ block reflow 결과: 5페이지 높이 초과
   → page dirty: page[5], page[6] 재분할
   → page[7]에서 안정 페이지 감지 → 전파 중단

④ render dirty: page[5], page[6]의 RenderTree 재생성
   → 뷰포트에 page[5]만 보이면 page[5]만 렌더링
   → page[6]은 Prefetch 우선순위로 예약
```

### 4.3 영향 범위 계산 알고리즘

#### 4.3.1 TextFlow 영향 범위

```
TextFlow 영향 = 편집된 문단 1개 (항상 O(1))

예외:
  - 문단 분할 (Enter): 2개 문단 (분할된 두 문단)
  - 문단 병합 (Backspace at start): 2개 문단 → 1개 문단
```

#### 4.3.2 BlockFlow 영향 범위

```
줄 수 변경 없음 → 0 블록 (BlockFlow 스킵)
줄 수 변경 있음 → 해당 문단 ~ 구역 끝 (최악 O(N))

최적화: 높이 변화량이 0이 되는 지점에서 중단
  - 문단 추가/삭제가 없고 줄 수만 변했으면,
    이전과 동일한 총 높이가 되는 문단에서 중단 가능
```

#### 4.3.3 PageFlow 영향 범위

```
블록 높이 변경 없음 → 0 페이지 (PageFlow 스킵)
블록 높이 변경 있음 → 영향 페이지 ~ 안정 페이지

안정 페이지 감지 → 평균 1~3페이지에서 수렴
  (텍스트 1줄 추가 → 보통 현재 페이지만 영향)
  (표 추가/삭제 → 2~5페이지 영향 가능)
```

### 4.4 레이아웃 캐시 구조

#### 4.4.1 캐시 계층

```typescript
interface LayoutCache {
  // 문단별 TextFlow 결과 캐시
  paragraphFlows: Map<ParagraphRef, FlowResult>;

  // 구역별 BlockFlow 결과 캐시
  blockLayouts: Map<number, BlockFlowResult>;

  // 페이지별 레이아웃 캐시
  pageLayouts: Map<number, PageLayoutCache>;

  // 페이지별 RenderTree 캐시
  renderTrees: Map<number, PageRenderTree>;
}

interface PageLayoutCache {
  pageIndex: number;
  pageContent: PageContent;     // Paginator 결과
  renderTree: PageRenderTree;   // LayoutEngine 결과
  isValid: boolean;             // dirty 여부
}
```

#### 4.4.2 캐시 무효화 규칙

| 이벤트 | 무효화 범위 |
|--------|-----------|
| 문자 삽입/삭제 | 해당 문단의 paragraphFlows |
| 줄 수 변경 | blockLayouts[section], 이후 pageLayouts |
| 서식 변경 | 해당 문단의 paragraphFlows + renderTrees |
| 표 구조 변경 | 해당 표의 측정 캐시 + 이후 모든 캐시 |
| 페이지 설정 변경 | 전체 캐시 무효화 |
| 줌 변경 | renderTrees 전체 무효화 (레이아웃은 유지) |

### 4.5 편집 → 렌더링 전체 흐름 (증분)

```
[사용자 입력: 'A' 키]
  ↓
① Input Handler: 키 이벤트 → InsertTextCommand 생성
  ↓
② Command Dispatch:
   - command.execute() → WASM: insert_text(sec, para, offset, 'A')
   - dirtyTracker.markParagraphDirty(sec, para)
  ↓
③ TextFlow:
   - WASM: reflow_line_segs(para, width)
   - WASM: compose_paragraph(para) → FlowResult
   - 줄 수 변경? → BlockFlow 트리거
  ↓
④ BlockFlow (줄 수 변경 시만):
   - para 이후 블록 수직 위치 재계산
   - 페이지 경계 변경? → PageFlow 트리거
  ↓
⑤ PageFlow (페이지 경계 변경 시만):
   - WASM: paginate() 또는 증분 repaginate_from()
   - dirty 페이지 목록 확정
  ↓
⑥ Render:
   - dirty 페이지 중 뷰포트 내 페이지 → WASM: build_render_tree()
   - WASM: render_page_to_canvas()
   - 뷰포트 밖 dirty 페이지 → Prefetch 큐에 등록
  ↓
⑦ Caret Update:
   - 새 캐럿 위치 계산 (FlowResult.charPositions 활용)
   - 캐럿 렌더링 (블링크 타이머 리셋)
  ↓
⑧ UI Update:
   - 상태표시줄 갱신 (페이지 번호, 줄/칸)
```

### 4.6 성능 예산 (16ms 프레임)

| 단계 | 예상 시간 | 비고 |
|------|----------|------|
| Input → Command | < 1ms | JS 이벤트 처리 |
| WASM insert_text | < 1ms | 문자열 조작 + 메타데이터 갱신 |
| TextFlow (리플로우) | 1~3ms | 단일 문단. WASM measureText 호출 포함 |
| BlockFlow | < 1ms | 배열 순회, 덧셈 연산 |
| PageFlow (증분) | 1~2ms | 1~3 페이지 재분할 |
| RenderTree 빌드 | 2~4ms | 1 페이지 렌더 트리 생성 |
| Canvas 렌더링 | 3~5ms | 1 페이지 Canvas 2D 렌더링 |
| 캐럿 + UI | < 1ms | DOM 업데이트 |
| **합계** | **~12ms** | **16ms 예산 내** |

---

## 5. 연속 스크롤 캔버스 뷰

### 5.1 뷰 아키텍처 개요

연속 스크롤 뷰는 모든 페이지를 세로로 나열하고, 사용자가 스크롤하면 현재 보이는 페이지만 렌더링한다.

```
┌─── 뷰포트 (브라우저 창) ──────────────────┐
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │ 가상 스크롤 컨테이너               │  │ ← 총 높이 = Σ(페이지 높이 + 간격)
│  │  (총 높이가 모든 페이지 합산)      │  │
│  │                                     │  │
│  │  ┌─── Page 4 (Canvas) ───┐         │  │ ← 뷰포트 상단 근처
│  │  │                        │         │  │
│  │  │  [렌더링됨]            │         │  │
│  │  │                        │         │  │
│  │  └────────────────────────┘         │  │
│  │  ── 10px 간격 ──                    │  │
│  │  ┌─── Page 5 (Canvas) ───┐         │  │ ← 현재 페이지
│  │  │                        │         │  │
│  │  │  [렌더링됨]  ← 캐럿   │         │  │
│  │  │                        │         │  │
│  │  └────────────────────────┘         │  │
│  │  ── 10px 간격 ──                    │  │
│  │  ┌─── Page 6 (Canvas) ───┐         │  │ ← 뷰포트 하단 근처
│  │  │                        │         │  │
│  │  │  [렌더링됨]            │         │  │
│  │  └────────────────────────┘         │  │
│  │                                     │  │
│  │  Page 7~N: [프리페치 or 미렌더링]   │  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
```

### 5.2 가상 스크롤 아키텍처

#### 5.2.1 설계 원리

- **DOM 요소 최소화**: 전체 N 페이지 중 뷰포트에 보이는 3~5 페이지의 Canvas만 실제 DOM에 존재
- **Canvas 풀링**: 사용 완료된 Canvas를 재활용 (메모리 절약)
- **스크롤 컨테이너**: CSS `height`를 전체 문서 높이로 설정하여 네이티브 스크롤바 활용

#### 5.2.2 페이지 Y 오프셋 계산

기존 RenderScheduler의 `page_offsets` 메커니즘을 활용:

```typescript
class VirtualScroll {
  private pageOffsets: number[] = [];  // 각 페이지의 Y 시작 좌표
  private pageHeights: number[] = [];  // 각 페이지의 높이
  private pageGap: number = 10;        // 페이지 간 간격 (px)

  /** 페이지 높이 설정 (문서 로드/재페이지네이션 시) */
  setPageHeights(heights: number[]): void {
    this.pageHeights = heights;
    this.pageOffsets = [];
    let offset = 0;
    for (const h of heights) {
      this.pageOffsets.push(offset);
      offset += h + this.pageGap;
    }
    // 스크롤 컨테이너 총 높이 설정
    this.container.style.height = `${offset - this.pageGap}px`;
  }

  /** 뷰포트에 보이는 페이지 목록 */
  getVisiblePages(scrollY: number, viewportHeight: number): number[] {
    const vpTop = scrollY;
    const vpBottom = scrollY + viewportHeight;
    const visible: number[] = [];

    for (let i = 0; i < this.pageOffsets.length; i++) {
      const pageTop = this.pageOffsets[i];
      const pageBottom = pageTop + this.pageHeights[i];

      if (pageTop < vpBottom && pageBottom > vpTop) {
        visible.push(i);
      }
    }
    return visible;
  }
}
```

### 5.3 뷰포트 기반 렌더링

#### 5.3.1 렌더링 파이프라인

```
[스크롤 이벤트]
  ↓
① ViewportManager: 새 scrollY 감지
  ↓
② VirtualScroll: 보이는 페이지 목록 계산
   - 이전 visible: [3, 4, 5]
   - 새 visible: [4, 5, 6]
  ↓
③ Canvas 관리:
   - Page 3 Canvas → 풀에 반환 (DOM에서 제거)
   - Page 6 Canvas → 풀에서 할당 (DOM에 추가)
   - 위치: canvas.style.top = pageOffsets[6] + 'px'
  ↓
④ 렌더링 스케줄링:
   - Page 6: Immediate (보이는 페이지)
   - Page 7, 8: Prefetch (인접 페이지)
  ↓
⑤ WASM 렌더링:
   - renderPageToCanvas(6, canvas6)
```

#### 5.3.2 Canvas 풀 관리

```typescript
class CanvasPool {
  private available: HTMLCanvasElement[] = [];
  private inUse: Map<number, HTMLCanvasElement> = new Map();  // pageIdx → canvas

  /** Canvas 할당 (풀에서 꺼내거나 새로 생성) */
  acquire(pageIdx: number, width: number, height: number): HTMLCanvasElement {
    let canvas = this.available.pop();
    if (!canvas) {
      canvas = document.createElement('canvas');
    }
    canvas.width = width;
    canvas.height = height;
    this.inUse.set(pageIdx, canvas);
    return canvas;
  }

  /** Canvas 반환 (DOM에서 제거 후 풀에 반환) */
  release(pageIdx: number): void {
    const canvas = this.inUse.get(pageIdx);
    if (canvas) {
      canvas.parentElement?.removeChild(canvas);
      this.inUse.delete(pageIdx);
      this.available.push(canvas);
    }
  }
}
```

### 5.4 좌표 체계

#### 5.4.1 3단계 좌표 시스템

| 좌표계 | 기준점 | 용도 |
|--------|--------|------|
| **문서 좌표** (Document) | 문서 첫 페이지 좌상단 (0, 0) | 스크롤 위치, 페이지 간 연속 좌표 |
| **페이지 좌표** (Page) | 각 페이지 좌상단 (0, 0) | 렌더 트리 노드 위치, WASM API |
| **뷰포트 좌표** (Viewport) | 브라우저 창 좌상단 | 마우스 이벤트, 캐럿 표시 |

#### 5.4.2 좌표 변환

```typescript
class CoordinateSystem {
  /** 뷰포트 좌표 → 문서 좌표 */
  viewportToDocument(vx: number, vy: number): { x: number; y: number } {
    return { x: vx + this.scrollX, y: vy + this.scrollY };
  }

  /** 문서 좌표 → 페이지 좌표 + 페이지 인덱스 */
  documentToPage(dx: number, dy: number): { pageIdx: number; x: number; y: number } {
    for (let i = this.pageOffsets.length - 1; i >= 0; i--) {
      if (dy >= this.pageOffsets[i]) {
        return {
          pageIdx: i,
          x: dx - this.pageMarginX,  // 페이지 수평 중앙 정렬 오프셋
          y: dy - this.pageOffsets[i],
        };
      }
    }
    return { pageIdx: 0, x: dx, y: dy };
  }

  /** 페이지 좌표 → 문서 좌표 */
  pageToDocument(pageIdx: number, px: number, py: number): { x: number; y: number } {
    return {
      x: px + this.pageMarginX,
      y: py + this.pageOffsets[pageIdx],
    };
  }

  /** 페이지 좌표 → 뷰포트 좌표 */
  pageToViewport(pageIdx: number, px: number, py: number): { x: number; y: number } {
    const doc = this.pageToDocument(pageIdx, px, py);
    return {
      x: doc.x - this.scrollX,
      y: doc.y - this.scrollY,
    };
  }
}
```

### 5.5 페이지 간 여백/구분선 처리

```typescript
class PageRenderer {
  /** 페이지 간 시각적 분리 렌더링 */
  renderPageDecoration(pageIdx: number): void {
    const canvas = this.canvasPool.get(pageIdx);
    if (!canvas) return;

    // 페이지 그림자 (좌/하단)
    const ctx = canvas.getContext('2d')!;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // 페이지 테두리
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  }
}
```

### 5.6 줌(확대/축소) 처리

```typescript
class ViewportManager {
  private zoom: number = 1.0;

  setZoom(newZoom: number): void {
    // 줌 변경 시 페이지 높이 재계산
    const scaledHeights = this.basePageHeights.map(h => h * newZoom);
    this.virtualScroll.setPageHeights(scaledHeights);

    // Canvas 크기 조정
    for (const [pageIdx, canvas] of this.canvasPool.inUse) {
      canvas.width = this.basePageWidths[pageIdx] * newZoom;
      canvas.height = this.basePageHeights[pageIdx] * newZoom;
    }

    // 스크롤 위치 보정 (줌 전 보이던 페이지가 계속 보이도록)
    const focusPage = this.currentPage;
    const newScrollY = this.virtualScroll.pageOffsets[focusPage];
    this.container.scrollTop = newScrollY;

    // 전체 재렌더링 (줌 변경)
    this.renderScheduler.on_event(RenderEvent.ZoomChanged(newZoom));

    this.zoom = newZoom;
  }
}
```

### 5.7 스크롤 추적과 캐럿 자동 스크롤

```typescript
class CaretScroller {
  /** 캐럿이 뷰포트 밖으로 나가면 자동 스크롤 */
  ensureCaretVisible(caretRect: { x: number; y: number; height: number }): void {
    const docY = this.coordSystem.pageToDocument(
      this.cursor.pageIdx, caretRect.x, caretRect.y
    ).y;

    const vpTop = this.scrollY;
    const vpBottom = this.scrollY + this.viewportHeight;
    const margin = 20; // 여유 공간

    if (docY < vpTop + margin) {
      // 캐럿이 위쪽으로 벗어남 → 위로 스크롤
      this.smoothScrollTo(docY - margin);
    } else if (docY + caretRect.height > vpBottom - margin) {
      // 캐럿이 아래쪽으로 벗어남 → 아래로 스크롤
      this.smoothScrollTo(docY + caretRect.height - this.viewportHeight + margin);
    }
  }

  private smoothScrollTo(targetY: number): void {
    this.container.scrollTo({
      top: targetY,
      behavior: 'smooth',
    });
  }
}

---

## 6. 커서 모델

### 6.1 커서 위치 표현

#### 6.1.1 위치 좌표계

HWP 문서의 텍스트 위치를 표현하는 3가지 좌표계:

| 좌표계 | 단위 | 용도 | 예시 |
|--------|------|------|------|
| **char index** | Rust char 인덱스 | WASM API 호출 | `insert_text(sec, para, 3, "A")` |
| **UTF-16 code unit** | HWP 내부 | LineSeg, CharShapeRef, DocProperties | `text_start: 16` |
| **픽셀 좌표** | px | 캐럿 렌더링, 히트 테스팅 | `(245.3, 128.7)` |

현재 WASM API는 char index를 사용하고, Rust 내부에서 `char_offsets[]`를 통해 UTF-16으로 변환한다. TypeScript 편집 엔진에서는 char index를 기본 단위로 사용한다.

#### 6.1.2 DocumentPosition — 문서 내 논리적 위치

```typescript
/** 문서 내 텍스트 위치 (WASM API 호출 단위) */
interface DocumentPosition {
  sectionIndex: number;       // 구역 인덱스
  paragraphIndex: number;     // 구역 내 문단 인덱스
  charOffset: number;         // 문단 내 문자 인덱스 (char index)
}

/** DocumentPosition의 비교 연산 */
function comparePositions(a: DocumentPosition, b: DocumentPosition): number {
  if (a.sectionIndex !== b.sectionIndex) return a.sectionIndex - b.sectionIndex;
  if (a.paragraphIndex !== b.paragraphIndex) return a.paragraphIndex - b.paragraphIndex;
  return a.charOffset - b.charOffset;
}
```

#### 6.1.3 CursorLocation — 레이아웃 기반 위치 정보

```typescript
/** 레이아웃 엔진의 커서 위치 (렌더링/히트 테스팅용) */
interface CursorLocation {
  // 논리적 위치
  position: DocumentPosition;

  // 줄 단위 위치 (캐럿 렌더링용)
  lineIndex: number;            // 문단 내 줄 인덱스
  lineCharOffset: number;       // 줄 내 문자 오프셋

  // 픽셀 좌표 (페이지 좌표계)
  pageIndex: number;            // 페이지 인덱스
  x: number;                    // 캐럿 X 좌표 (px)
  y: number;                    // 줄 상단 Y 좌표 (px)
  height: number;               // 캐럿 높이 (px)
  baseline: number;             // 베이스라인 거리 (px)
}
```

### 6.2 CursorContext 상태 머신

#### 6.2.1 5가지 컨텍스트

커서가 위치한 문서 영역에 따라 5가지 컨텍스트가 존재한다. 각 컨텍스트는 입력/이동/선택 동작이 다르다:

```
CursorContext (현재 커서의 편집 환경)
  │
  ├── TextContext          → 본문 텍스트 줄에서 편집
  ├── ControlContext       → 인라인 컨트롤(표/도형/이미지) 선택 상태
  ├── TableContext         → 표 셀 내부에서 편집
  ├── FieldContext         → 필드(누름틀) 내부에서 편집
  └── HeaderFooterContext  → 머리말/꼬리말 내부에서 편집
```

#### 6.2.2 컨텍스트 정의

```typescript
/** 본문 텍스트 컨텍스트 — 일반적인 텍스트 편집 상태 */
interface TextContext {
  type: 'text';
  position: DocumentPosition;   // 커서 위치 (구역, 문단, 문자 오프셋)
  location: CursorLocation;     // 레이아웃 위치 (줄, 페이지, 좌표)
}

/** 컨트롤 선택 컨텍스트 — 표/도형/이미지가 선택된 상태 */
interface ControlContext {
  type: 'control';
  sectionIndex: number;
  paragraphIndex: number;       // 컨트롤을 소유한 문단
  controlIndex: number;         // 문단 내 컨트롤 인덱스
  controlType: ControlType;     // 'table' | 'shape' | 'picture' | 'equation'
  boundingBox: BoundingBox;     // 선택된 컨트롤의 영역 (리사이즈 핸들 표시용)
}

/** 표 셀 컨텍스트 — 표 내부에서 편집 중 */
interface TableContext {
  type: 'table';
  sectionIndex: number;
  parentParaIndex: number;      // 표 컨트롤을 소유한 문단
  controlIndex: number;         // 문단 내 테이블 컨트롤 인덱스
  cellRow: number;              // 현재 셀 행
  cellCol: number;              // 현재 셀 열
  cellIndex: number;            // 셀 배열 인덱스
  innerCursor: TextContext;     // 셀 내부의 텍스트 커서
}

/** 필드 컨텍스트 — 누름틀 내부에서 편집 중 */
interface FieldContext {
  type: 'field';
  sectionIndex: number;
  paragraphIndex: number;
  controlIndex: number;
  fieldName: string;            // 필드 이름
  innerCursor: TextContext;     // 필드 내부의 텍스트 커서
}

/** 머리말/꼬리말 컨텍스트 */
interface HeaderFooterContext {
  type: 'headerFooter';
  headerFooterType: 'header' | 'footer';
  sectionIndex: number;
  controlIndex: number;
  innerCursor: TextContext;     // 머리말/꼬리말 내부의 텍스트 커서
}

type CursorContext =
  | TextContext
  | ControlContext
  | TableContext
  | FieldContext
  | HeaderFooterContext;
```

#### 6.2.3 컨텍스트 전환 규칙

```
[TextContext]
  │
  ├─ 화살표로 컨트롤 문자 위치 도달 ──→ [ControlContext]
  ├─ 머리말/꼬리말 영역 클릭 ──→ [HeaderFooterContext]
  └─ 필드 영역 진입 ──→ [FieldContext]

[ControlContext]
  │
  ├─ Enter / 더블클릭 (표) ──→ [TableContext]  (셀 내부 진입)
  ├─ Enter / 더블클릭 (도형/글상자) ──→ [TextContext] (글상자 내부)
  ├─ Escape / 화살표 ──→ [TextContext]  (컨트롤 다음 위치로)
  └─ Delete ──→ [TextContext]  (컨트롤 삭제, 다음 위치로)

[TableContext]
  │
  ├─ Tab ──→ [TableContext]  (다음 셀로)
  ├─ Shift+Tab ──→ [TableContext]  (이전 셀로)
  ├─ Escape ──→ [ControlContext]  (표 선택 상태로)
  └─ 셀 밖 화살표 ──→ [TextContext]  (표 바깥으로)

[FieldContext]
  │
  ├─ Tab ──→ [FieldContext]  (다음 필드로) 또는 [TextContext]
  └─ Escape ──→ [TextContext]  (필드 밖으로)

[HeaderFooterContext]
  │
  └─ 본문 영역 클릭 또는 Escape ──→ [TextContext]
```

#### 6.2.4 상태 전환 구현

```typescript
class CursorManager {
  private context: CursorContext;
  private layoutCache: LayoutCache;

  /** 컨텍스트 전환 처리 */
  transition(event: CursorEvent): void {
    switch (this.context.type) {
      case 'text':
        this.handleTextTransition(event);
        break;
      case 'control':
        this.handleControlTransition(event);
        break;
      case 'table':
        this.handleTableTransition(event);
        break;
      case 'field':
        this.handleFieldTransition(event);
        break;
      case 'headerFooter':
        this.handleHeaderFooterTransition(event);
        break;
    }
  }

  /** 텍스트 컨텍스트에서 컨트롤 경계 감지 */
  private handleTextTransition(event: CursorEvent): void {
    if (event.type === 'move') {
      const newPos = this.calculateNewPosition(event.direction);

      // 컨트롤 문자 감지: 해당 위치에 인라인 컨트롤이 있는지 확인
      const controlAtPos = this.detectControlAtPosition(newPos);
      if (controlAtPos) {
        this.context = {
          type: 'control',
          sectionIndex: newPos.sectionIndex,
          paragraphIndex: newPos.paragraphIndex,
          controlIndex: controlAtPos.index,
          controlType: controlAtPos.type,
          boundingBox: controlAtPos.bbox,
        };
        return;
      }

      // 일반 텍스트 이동
      this.context = {
        type: 'text',
        position: newPos,
        location: this.resolveLocation(newPos),
      };
    }
  }
}
```

### 6.3 줄 단위 처리와 컨트롤 판별

#### 6.3.1 줄 단위 위치 결정

TextFlow 결과의 `FlowLine[]`을 기반으로, 문자 오프셋이 어느 줄에 속하는지 결정:

```typescript
/** char offset → 줄 인덱스 결정 */
function resolveLineIndex(
  flowResult: FlowResult,
  charOffset: number
): { lineIndex: number; lineCharOffset: number } {
  for (let i = 0; i < flowResult.lines.length; i++) {
    const line = flowResult.lines[i];
    if (charOffset >= line.charStart && charOffset < line.charEnd) {
      return {
        lineIndex: i,
        lineCharOffset: charOffset - line.charStart,
      };
    }
  }
  // 문단 끝 (마지막 줄의 끝)
  const lastLine = flowResult.lines[flowResult.lines.length - 1];
  return {
    lineIndex: flowResult.lines.length - 1,
    lineCharOffset: lastLine.charEnd - lastLine.charStart,
  };
}
```

#### 6.3.2 컨트롤 문자 판별

HWP의 인라인 컨트롤(표, 도형, 이미지)은 텍스트에 제어 문자(0x0002~0x001F)로 삽입된다. 파싱 후에는 `Paragraph.controls[]` 배열에 별도 저장되며, 텍스트에서는 제거된다.

컨트롤 위치를 판별하기 위해 WASM API 확장이 필요:

```typescript
/** WASM API 확장: 문단의 컨트롤 위치 정보 조회 */
interface ParagraphControlInfo {
  controls: ControlPositionInfo[];
}

interface ControlPositionInfo {
  controlIndex: number;       // controls[] 배열 인덱스
  charOffset: number;         // 텍스트 내 삽입 위치 (char index 기준)
  controlType: string;        // 'table' | 'shape' | 'picture' | ...
  isInline: boolean;          // 인라인(treat_as_char) 여부
}
```

현재 WASM API의 `identify_inline_controls()`는 모든 컨트롤을 line_index=0에 배치하는 제한이 있다. 편집기에서는 각 컨트롤의 정확한 텍스트 위치(char offset)를 알아야 하므로, 다음 WASM API를 추가한다:

```
[Phase 3 WASM 확장]
get_paragraph_control_positions(section_idx, para_idx) → ControlPositionInfo[]

반환값: [
  { controlIndex: 0, charOffset: 12, controlType: "table", isInline: true },
  { controlIndex: 1, charOffset: 45, controlType: "picture", isInline: false }
]
```

#### 6.3.3 커서가 컨트롤에 도달하는 시점

```
커서 이동 → 새 charOffset 계산 → 컨트롤 위치 목록 확인

경우 1: charOffset가 컨트롤 위치와 일치
  → ControlContext로 전환 (컨트롤 선택)

경우 2: 좌→우 이동 시 컨트롤을 건너뛸 때
  → charOffset를 컨트롤 다음 위치로 점프
  → 사용자가 ← 키로 돌아오면 ControlContext

경우 3: 표 컨트롤에서 Enter
  → TableContext로 전환 (셀 (0,0)의 첫 문단 위치)
```

### 6.4 커서 이동 설계

#### 6.4.1 이동 타입 분류 (28+ 타입)

```typescript
enum CursorMoveType {
  // === 문자 단위 (4) ===
  CharLeft,               // ← : 이전 문자
  CharRight,              // → : 다음 문자
  CharLeftWord,           // Ctrl+← : 이전 단어 경계
  CharRightWord,          // Ctrl+→ : 다음 단어 경계

  // === 줄 단위 (4) ===
  LineUp,                 // ↑ : 윗줄 (X 좌표 유지)
  LineDown,               // ↓ : 아랫줄 (X 좌표 유지)
  LineStart,              // Home : 줄 시작
  LineEnd,                // End : 줄 끝

  // === 문단 단위 (4) ===
  ParaUp,                 // Ctrl+↑ : 이전 문단 시작
  ParaDown,               // Ctrl+↓ : 다음 문단 시작
  ParaStart,              // (내부용) : 현재 문단 시작
  ParaEnd,                // (내부용) : 현재 문단 끝

  // === 페이지 단위 (4) ===
  PageUp,                 // PageUp : 뷰포트 높이만큼 위로
  PageDown,               // PageDown : 뷰포트 높이만큼 아래로
  PageStart,              // (내부용) : 현재 페이지 시작
  PageEnd,                // (내부용) : 현재 페이지 끝

  // === 문서 단위 (2) ===
  DocumentStart,          // Ctrl+Home : 문서 시작
  DocumentEnd,            // Ctrl+End : 문서 끝

  // === 표 셀 이동 (6) ===
  CellNext,               // Tab : 다음 셀 (행 끝이면 다음 행)
  CellPrev,               // Shift+Tab : 이전 셀
  CellUp,                 // ↑ (표 내에서) : 윗 행 같은 열
  CellDown,               // ↓ (표 내에서) : 아랫 행 같은 열
  CellStart,              // Home (표 내에서) : 셀의 첫 문단
  CellEnd,                // End (표 내에서) : 셀의 마지막 문단

  // === 특수 이동 (4+) ===
  FieldNext,              // Tab (필드 모드) : 다음 필드
  FieldPrev,              // Shift+Tab (필드 모드) : 이전 필드
  MatchingBracket,        // (확장) : 대응 괄호로 이동
  BookmarkGoto,           // (확장) : 북마크 위치로 이동
}
```

#### 6.4.2 문자 단위 이동 알고리즘

```typescript
/** CharRight 이동 */
function moveCharRight(ctx: TextContext): CursorContext {
  const { sectionIndex: sec, paragraphIndex: para, charOffset: off } = ctx.position;
  const paraInfo = wasmBridge.getParagraphInfo(sec, para);

  // 1. 문단 내 이동 가능
  if (off < paraInfo.charCount) {
    const newOff = off + 1;

    // 컨트롤 문자 감지
    const ctrl = detectControlAtOffset(sec, para, newOff);
    if (ctrl) {
      return { type: 'control', ...ctrl };
    }

    return {
      type: 'text',
      position: { sectionIndex: sec, paragraphIndex: para, charOffset: newOff },
      location: resolveLocation(sec, para, newOff),
    };
  }

  // 2. 문단 끝 → 다음 문단 시작
  const nextPara = findNextParagraph(sec, para);
  if (nextPara) {
    return {
      type: 'text',
      position: { sectionIndex: nextPara.sec, paragraphIndex: nextPara.para, charOffset: 0 },
      location: resolveLocation(nextPara.sec, nextPara.para, 0),
    };
  }

  // 3. 문서 끝 — 이동 불가
  return ctx;
}
```

#### 6.4.3 단어 단위 이동

```typescript
/** Ctrl+→ 단어 경계 탐색 */
function findNextWordBoundary(text: string, offset: number): number {
  // HWP 단어 경계 규칙:
  // 1. 한글 → 비한글 전환점 (공백, 숫자, 영문, 특수문자)
  // 2. 영문 → 비영문 전환점
  // 3. 공백 연속 → 비공백 전환점
  // 4. 특수문자 → 비특수문자 전환점

  const chars = [...text];
  let i = offset;

  // 현재 문자 유형 파악
  const startType = classifyChar(chars[i]);

  // 같은 유형의 문자를 건너뜀
  while (i < chars.length && classifyChar(chars[i]) === startType) {
    i++;
  }

  // 후행 공백 건너뜀
  while (i < chars.length && classifyChar(chars[i]) === CharClass.Whitespace) {
    i++;
  }

  return i;
}

enum CharClass {
  Hangul,         // 한글 (U+AC00~U+D7AF, U+1100~U+11FF, U+3130~U+318F)
  Latin,          // 영문 (A-Z, a-z)
  Digit,          // 숫자 (0-9)
  CJK,            // 한자 등 CJK (U+4E00~U+9FFF)
  Whitespace,     // 공백, 탭
  Punctuation,    // 구두점, 특수문자
  Control,        // 제어 문자 (컨트롤 마커)
}
```

#### 6.4.4 줄 단위 수직 이동 (↑/↓)

수직 이동의 핵심은 **선호 X 좌표(preferred X)**를 유지하는 것이다:

```typescript
class CursorMover {
  /** 선호 X 좌표: ↑/↓ 이동 시 원래 X 위치를 기억 */
  private preferredX: number | null = null;

  /** ↓ 키 처리 */
  moveLineDown(ctx: TextContext): CursorContext {
    const loc = ctx.location;
    const flowResult = this.getFlowResult(ctx.position);

    // preferredX 결정 (최초 수직 이동 시 현재 X 저장)
    if (this.preferredX === null) {
      this.preferredX = loc.x;
    }

    // 1. 문단 내 다음 줄이 있는 경우
    if (loc.lineIndex < flowResult.lines.length - 1) {
      const nextLine = flowResult.lines[loc.lineIndex + 1];
      const charOffset = this.hitTestLineX(nextLine, this.preferredX);
      return this.makeTextContext(
        ctx.position.sectionIndex,
        ctx.position.paragraphIndex,
        charOffset
      );
    }

    // 2. 다음 문단의 첫 줄로 이동
    const nextPara = findNextParagraph(
      ctx.position.sectionIndex,
      ctx.position.paragraphIndex
    );
    if (nextPara) {
      const nextFlow = this.getFlowResult(nextPara);
      const firstLine = nextFlow.lines[0];
      const charOffset = this.hitTestLineX(firstLine, this.preferredX);
      return this.makeTextContext(nextPara.sec, nextPara.para, charOffset);
    }

    // 3. 문서 끝
    return ctx;
  }

  /** 수평 이동 시 preferredX 초기화 */
  resetPreferredX(): void {
    this.preferredX = null;
  }

  /** 줄 내에서 X 좌표에 가장 가까운 문자 위치 계산 */
  private hitTestLineX(line: FlowLine, targetX: number): number {
    // 각 FlowRun의 charPositions를 사용하여 이진 탐색
    let currentX = line.x;

    for (const run of line.runs) {
      for (let i = 0; i < run.charPositions.length - 1; i++) {
        const charLeft = currentX + run.charPositions[i];
        const charRight = currentX + run.charPositions[i + 1];
        const charMid = (charLeft + charRight) / 2;

        if (targetX < charMid) {
          return line.charStart + i;  // 왼쪽 경계에 가까움
        }
      }
      currentX += run.width;
    }

    return line.charEnd;  // 줄 끝
  }
}
```

#### 6.4.5 페이지 단위 이동 (PageUp/PageDown)

```typescript
/** PageDown 이동 */
function movePageDown(ctx: TextContext, viewportHeight: number): CursorContext {
  const currentDocY = coordSystem.pageToDocument(
    ctx.location.pageIndex, ctx.location.x, ctx.location.y
  ).y;

  // 뷰포트 높이만큼 아래 좌표의 문서 위치 계산
  const targetDocY = currentDocY + viewportHeight;
  const targetDocX = coordSystem.pageToDocument(
    ctx.location.pageIndex, ctx.location.x, 0
  ).x;

  // 해당 좌표를 히트 테스팅
  return hitTest(targetDocX, targetDocY);
}
```

#### 6.4.6 표 내부 셀 이동

```typescript
/** Tab 키: 다음 셀로 이동 */
function moveCellNext(ctx: TableContext): CursorContext {
  const table = getTableInfo(ctx.sectionIndex, ctx.parentParaIndex, ctx.controlIndex);

  // 현재 셀에서 다음 셀 결정
  let nextCol = ctx.cellCol + 1;
  let nextRow = ctx.cellRow;

  // colSpan 고려: 병합된 셀은 건너뜀
  while (nextCol < table.colCount) {
    const cell = table.getCellAt(nextRow, nextCol);
    if (cell && cell.col === nextCol && cell.row === nextRow) {
      break;  // 유효한 셀 발견
    }
    nextCol++;
  }

  // 행 끝 → 다음 행 첫 셀
  if (nextCol >= table.colCount) {
    nextRow++;
    nextCol = 0;
  }

  // 표 마지막 셀 → 표 밖으로 (또는 새 행 추가)
  if (nextRow >= table.rowCount) {
    // 한컴 동작: 마지막 셀에서 Tab → 새 행 추가
    wasmBridge.insertTableRow(ctx.sectionIndex, ctx.parentParaIndex,
      ctx.controlIndex, table.rowCount);
    nextRow = table.rowCount;
    nextCol = 0;
  }

  const cellIndex = table.getCellIndex(nextRow, nextCol);
  return {
    type: 'table',
    sectionIndex: ctx.sectionIndex,
    parentParaIndex: ctx.parentParaIndex,
    controlIndex: ctx.controlIndex,
    cellRow: nextRow,
    cellCol: nextCol,
    cellIndex: cellIndex,
    innerCursor: {
      type: 'text',
      position: { sectionIndex: ctx.sectionIndex, paragraphIndex: 0, charOffset: 0 },
      location: resolveCellLocation(ctx, cellIndex, 0, 0),
    },
  };
}
```

### 6.5 히트 테스팅 알고리즘

#### 6.5.1 히트 테스팅 개요

마우스 클릭/터치 좌표를 문서 위치(DocumentPosition)로 변환하는 과정:

```
뷰포트 좌표 (clientX, clientY)
  → 문서 좌표 (docX, docY)                    [CoordinateSystem]
  → 페이지 좌표 + 페이지 인덱스               [CoordinateSystem]
  → 페이지 영역 판별 (본문/머리말/꼬리말)     [PageHitTest]
  → 블록 판별 (문단/표/도형)                   [BlockHitTest]
  → 줄 판별 (어느 줄인가)                      [LineHitTest]
  → 문자 판별 (어느 문자인가)                  [CharHitTest]
  → DocumentPosition + CursorContext
```

#### 6.5.2 4단계 히트 테스팅

```typescript
class HitTester {
  /** 전체 히트 테스팅 파이프라인 */
  hitTest(viewportX: number, viewportY: number): CursorContext {
    // Stage 1: 좌표 변환
    const { x: docX, y: docY } = this.coordSystem.viewportToDocument(viewportX, viewportY);
    const { pageIdx, x: pageX, y: pageY } = this.coordSystem.documentToPage(docX, docY);

    // 페이지 간 간격 영역 클릭 시 → 가까운 페이지의 가장 가까운 위치
    if (pageIdx < 0) {
      return this.snapToNearestPage(docX, docY);
    }

    // Stage 2: 페이지 영역 판별
    const pageArea = this.identifyPageArea(pageIdx, pageX, pageY);

    switch (pageArea.type) {
      case 'header':
        return this.hitTestHeaderFooter('header', pageIdx, pageX, pageY);
      case 'footer':
        return this.hitTestHeaderFooter('footer', pageIdx, pageX, pageY);
      case 'body':
        return this.hitTestBody(pageIdx, pageX, pageY);
      case 'margin':
        // 여백 클릭 → 가장 가까운 본문 위치
        return this.snapToNearestBodyPosition(pageIdx, pageX, pageY);
    }
  }

  /** Stage 3: 본문 영역 히트 테스팅 */
  private hitTestBody(pageIdx: number, pageX: number, pageY: number): CursorContext {
    const pageContent = this.layoutCache.getPageContent(pageIdx);

    // 플로팅 도형 우선 확인 (Z-order 최상위)
    for (const floatingObj of pageContent.floatingObjects.reverse()) {
      if (floatingObj.bbox.containsPoint(pageX, pageY)) {
        return {
          type: 'control',
          sectionIndex: floatingObj.sectionIndex,
          paragraphIndex: floatingObj.paraIndex,
          controlIndex: floatingObj.controlIndex,
          controlType: floatingObj.controlType,
          boundingBox: floatingObj.bbox,
        };
      }
    }

    // 블록(문단/표) 순차 확인
    for (const block of pageContent.blocks) {
      if (pageY >= block.y && pageY < block.y + block.height) {
        if (block.type === 'table') {
          return this.hitTestTable(block, pageX, pageY);
        }
        return this.hitTestParagraph(block, pageX, pageY);
      }
    }

    // 블록 사이 빈 공간 → 가장 가까운 줄의 끝
    return this.snapToNearestBlock(pageContent, pageX, pageY);
  }
}
```

#### 6.5.3 줄/문자 수준 히트 테스팅

```typescript
/** 문단 내 줄 + 문자 위치 결정 */
private hitTestParagraph(block: BlockInfo, pageX: number, pageY: number): TextContext {
  const flowResult = this.layoutCache.getFlowResult(block.sectionIndex, block.paraIndex);
  const blockLayout = this.layoutCache.getBlockLayout(block.sectionIndex, block.paraIndex);

  // 줄 결정: Y 좌표로 검색
  let targetLine: FlowLine | null = null;
  let lineY = blockLayout.y;

  for (const line of flowResult.lines) {
    const lineBottom = lineY + line.lineHeight + line.lineSpacing;
    if (pageY >= lineY && pageY < lineBottom) {
      targetLine = line;
      break;
    }
    lineY = lineBottom;
  }

  // Y가 모든 줄 아래면 마지막 줄 선택
  if (!targetLine) {
    targetLine = flowResult.lines[flowResult.lines.length - 1];
  }

  // 문자 결정: X 좌표로 charPositions 이진 탐색
  const charOffset = this.hitTestCharInLine(targetLine, pageX);

  return {
    type: 'text',
    position: {
      sectionIndex: block.sectionIndex,
      paragraphIndex: block.paraIndex,
      charOffset: charOffset,
    },
    location: this.resolveLocation(block.sectionIndex, block.paraIndex, charOffset),
  };
}

/** 줄 내 X 좌표 → 문자 오프셋 (이진 탐색) */
private hitTestCharInLine(line: FlowLine, targetX: number): number {
  // 줄의 모든 charPositions를 연결하여 단일 배열로 구성
  const allPositions: number[] = [];
  let runStartX = line.x;

  for (const run of line.runs) {
    for (let i = 0; i < run.charPositions.length; i++) {
      allPositions.push(runStartX + run.charPositions[i]);
    }
    // 마지막 경계는 다음 run의 시작과 동일하므로 중복 제거
    if (run !== line.runs[line.runs.length - 1]) {
      allPositions.pop();
    }
    runStartX += run.width;
  }

  // 이진 탐색: targetX에 가장 가까운 경계 찾기
  if (targetX <= allPositions[0]) {
    return line.charStart;
  }
  if (targetX >= allPositions[allPositions.length - 1]) {
    return line.charEnd;
  }

  // 각 문자 영역의 중간점 기준으로 좌/우 판별
  for (let i = 0; i < allPositions.length - 1; i++) {
    const mid = (allPositions[i] + allPositions[i + 1]) / 2;
    if (targetX < mid) {
      return line.charStart + i;
    }
  }

  return line.charEnd;
}
```

#### 6.5.4 표 내부 히트 테스팅

```typescript
/** 표 내부 셀 → 셀 내 문단/줄/문자 히트 테스팅 */
private hitTestTable(block: TableBlockInfo, pageX: number, pageY: number): CursorContext {
  const tableLayout = this.layoutCache.getTableLayout(
    block.sectionIndex, block.paraIndex, block.controlIndex
  );

  // 셀 결정: 표 경계 내 (x, y) → (row, col)
  for (const cellLayout of tableLayout.cells) {
    if (cellLayout.bbox.containsPoint(pageX, pageY)) {
      // 셀 내부 문단/줄/문자 히트 테스팅 (재귀)
      const innerResult = this.hitTestCellContent(cellLayout, pageX, pageY);

      return {
        type: 'table',
        sectionIndex: block.sectionIndex,
        parentParaIndex: block.paraIndex,
        controlIndex: block.controlIndex,
        cellRow: cellLayout.row,
        cellCol: cellLayout.col,
        cellIndex: cellLayout.cellIndex,
        innerCursor: innerResult,
      };
    }
  }

  // 표 테두리 위 → 셀 리사이즈 or 표 선택
  return {
    type: 'control',
    sectionIndex: block.sectionIndex,
    paragraphIndex: block.paraIndex,
    controlIndex: block.controlIndex,
    controlType: 'table',
    boundingBox: tableLayout.bbox,
  };
}
```

#### 6.5.5 WASM 히트 테스팅 API

히트 테스팅의 핵심 데이터는 WASM 레이아웃 엔진이 제공한다:

```
[기존 API 활용]
get_page_text_layout(page_idx) → JSON
  - 페이지 내 모든 TextRun의 bbox + charX[] (글자별 X 경계)
  - TextRunNode 메타데이터 (section_index, para_index, char_start)

[Phase 3 추가 API]
hit_test(page_idx, x, y) → JSON
  - 서버 사이드 히트 테스팅 (Rust에서 직접 수행)
  - 반환: { sectionIndex, paraIndex, charOffset, lineIndex, controlIndex? }

get_cursor_rect(section_idx, para_idx, char_offset) → JSON
  - 캐럿 사각형 좌표
  - 반환: { pageIndex, x, y, width, height }

get_line_info(section_idx, para_idx, line_idx) → JSON
  - 줄 정보 조회
  - 반환: { charStart, charEnd, y, height, baseline }
```

**성능 전략**: 초기에는 JavaScript 측에서 charX[] 데이터를 캐시하여 히트 테스팅을 수행하고, 성능 병목 발생 시 WASM `hit_test()` API로 전환한다.

---

## 7. 선택/입력 시스템

### 7.1 선택 모델

#### 7.1.1 선택 유형

HWP 편집기의 3가지 선택 모드:

| 모드 | 키보드 | 마우스 | 표현 |
|------|--------|--------|------|
| **범위 선택** | Shift + 이동 키 | 드래그 | 시작~끝 사이 텍스트 반전 |
| **셀 블록 선택** | (표 내부) Shift + 화살표 | 표 셀 드래그 | 사각 영역 셀 반전 |
| **개체 다중 선택** | Ctrl + 클릭 | 도형 Ctrl+드래그 | 여러 도형 선택 |

#### 7.1.2 Selection 인터페이스

```typescript
type Selection =
  | NoSelection
  | RangeSelection
  | CellBlockSelection
  | ObjectSelection;

/** 선택 없음 (캐럿만 존재) */
interface NoSelection {
  type: 'none';
  cursor: CursorContext;    // 현재 캐럿 위치
}

/** 텍스트 범위 선택 */
interface RangeSelection {
  type: 'range';
  anchor: DocumentPosition;   // 선택 시작점 (고정)
  focus: DocumentPosition;    // 선택 끝점 (이동 중)
  direction: 'forward' | 'backward';  // anchor < focus면 forward

  /** 선택 영역의 줄별 사각형 목록 (렌더링용) */
  rects: SelectionRect[];
}

/** 표 셀 블록 선택 */
interface CellBlockSelection {
  type: 'cellBlock';
  tableRef: {
    sectionIndex: number;
    parentParaIndex: number;
    controlIndex: number;
  };
  startCell: { row: number; col: number };
  endCell: { row: number; col: number };

  /** 선택된 셀 목록 (병합 셀 고려) */
  selectedCells: Array<{ row: number; col: number; cellIndex: number }>;
}

/** 개체 다중 선택 */
interface ObjectSelection {
  type: 'object';
  objects: Array<{
    sectionIndex: number;
    paragraphIndex: number;
    controlIndex: number;
    controlType: string;
    bbox: BoundingBox;
  }>;
}
```

#### 7.1.3 범위 선택 동작

```typescript
class SelectionManager {
  private selection: Selection = { type: 'none', cursor: initialCursor };

  /** Shift+화살표: 선택 확장/축소 */
  extendSelection(direction: CursorMoveType): void {
    if (this.selection.type === 'none') {
      // 선택 시작: 현재 커서를 anchor로
      const anchor = this.selection.cursor.type === 'text'
        ? this.selection.cursor.position
        : this.getPositionFromContext(this.selection.cursor);
      const focus = this.cursorManager.move(direction);

      this.selection = {
        type: 'range',
        anchor: anchor,
        focus: focus.position,
        direction: comparePositions(anchor, focus.position) <= 0 ? 'forward' : 'backward',
        rects: this.computeSelectionRects(anchor, focus.position),
      };
    } else if (this.selection.type === 'range') {
      // focus 이동 (anchor 유지)
      const newFocus = this.cursorManager.moveFrom(this.selection.focus, direction);
      this.selection = {
        ...this.selection,
        focus: newFocus.position,
        direction: comparePositions(this.selection.anchor, newFocus.position) <= 0
          ? 'forward' : 'backward',
        rects: this.computeSelectionRects(this.selection.anchor, newFocus.position),
      };

      // anchor == focus가 되면 선택 해제
      if (comparePositions(this.selection.anchor, newFocus.position) === 0) {
        this.selection = { type: 'none', cursor: newFocus };
      }
    }
  }

  /** 마우스 드래그: 선택 영역 갱신 */
  onMouseMove(viewportX: number, viewportY: number): void {
    if (!this.isDragging) return;

    const hitResult = this.hitTester.hitTest(viewportX, viewportY);
    if (hitResult.type !== 'text') return;

    this.selection = {
      type: 'range',
      anchor: this.dragAnchor!,
      focus: hitResult.position,
      direction: comparePositions(this.dragAnchor!, hitResult.position) <= 0
        ? 'forward' : 'backward',
      rects: this.computeSelectionRects(this.dragAnchor!, hitResult.position),
    };
  }
}
```

#### 7.1.4 선택 영역 사각형 계산

```typescript
/** 선택 범위를 줄별 사각형 목록으로 변환 (반전 표시용) */
function computeSelectionRects(
  start: DocumentPosition,
  end: DocumentPosition,
  layoutCache: LayoutCache
): SelectionRect[] {
  // 순서 보정 (start < end)
  const [from, to] = comparePositions(start, end) <= 0 ? [start, end] : [end, start];

  const rects: SelectionRect[] = [];

  // 같은 문단 내 선택
  if (from.sectionIndex === to.sectionIndex && from.paragraphIndex === to.paragraphIndex) {
    return computeIntraParagraphRects(from, to, layoutCache);
  }

  // 여러 문단에 걸친 선택
  // 1. 첫 문단: from.charOffset ~ 문단 끝
  rects.push(...computeIntraParagraphRects(
    from,
    { ...from, charOffset: getParagraphLength(from) },
    layoutCache
  ));

  // 2. 중간 문단: 전체 줄
  const midParagraphs = enumerateParagraphs(from, to);
  for (const para of midParagraphs) {
    rects.push(...computeFullParagraphRects(para, layoutCache));
  }

  // 3. 마지막 문단: 문단 시작 ~ to.charOffset
  rects.push(...computeIntraParagraphRects(
    { ...to, charOffset: 0 },
    to,
    layoutCache
  ));

  return rects;
}

interface SelectionRect {
  pageIndex: number;
  x: number;          // 페이지 좌표
  y: number;
  width: number;
  height: number;
}
```

#### 7.1.5 셀 블록 선택

```typescript
/** 표 내 셀 블록 선택 (드래그 or Shift+화살표) */
function updateCellBlockSelection(
  tableRef: TableRef,
  startCell: { row: number; col: number },
  endCell: { row: number; col: number }
): CellBlockSelection {
  const table = getTableInfo(tableRef);

  // 사각 영역 계산 (min/max)
  const minRow = Math.min(startCell.row, endCell.row);
  const maxRow = Math.max(startCell.row, endCell.row);
  const minCol = Math.min(startCell.col, endCell.col);
  const maxCol = Math.max(startCell.col, endCell.col);

  // 병합 셀 확장: 선택 영역에 걸치는 병합 셀이 있으면 영역을 확장
  let expanded = true;
  let [r1, r2, c1, c2] = [minRow, maxRow, minCol, maxCol];

  while (expanded) {
    expanded = false;
    for (const cell of table.cells) {
      const cellRight = cell.col + cell.colSpan - 1;
      const cellBottom = cell.row + cell.rowSpan - 1;

      // 셀이 선택 영역과 겹치는지 확인
      if (cell.col <= c2 && cellRight >= c1 && cell.row <= r2 && cellBottom >= r1) {
        if (cell.col < c1) { c1 = cell.col; expanded = true; }
        if (cellRight > c2) { c2 = cellRight; expanded = true; }
        if (cell.row < r1) { r1 = cell.row; expanded = true; }
        if (cellBottom > r2) { r2 = cellBottom; expanded = true; }
      }
    }
  }

  // 선택된 셀 목록 생성
  const selectedCells = table.cells
    .filter(c => c.col >= c1 && c.col <= c2 && c.row >= r1 && c.row <= r2)
    .map(c => ({ row: c.row, col: c.col, cellIndex: c.index }));

  return {
    type: 'cellBlock',
    tableRef,
    startCell: { row: r1, col: c1 },
    endCell: { row: r2, col: c2 },
    selectedCells,
  };
}
```

### 7.2 입력 시스템

#### 7.2.1 입력 이벤트 처리 아키텍처

```
[브라우저 이벤트]
  │
  ├─ keydown ──→ InputHandler.onKeyDown()
  │               ├─ 수정자 키 확인 (Ctrl, Shift, Alt)
  │               ├─ 특수키 매핑 (Enter, BS, Del, Tab, Arrow, ...)
  │               └─ 단축키 매핑 (Ctrl+C, Ctrl+V, Ctrl+Z, ...)
  │
  ├─ beforeinput ──→ InputHandler.onBeforeInput()
  │                   ├─ inputType 확인 (insertText, deleteContentBackward, ...)
  │                   └─ IME 조합 중이면 무시 (compositionend에서 처리)
  │
  ├─ compositionstart ──→ IMEHandler.onCompositionStart()
  ├─ compositionupdate ──→ IMEHandler.onCompositionUpdate()
  ├─ compositionend ──→ IMEHandler.onCompositionEnd()
  │
  ├─ mousedown ──→ HitTester + SelectionManager
  ├─ mousemove ──→ SelectionManager (드래그 중)
  └─ mouseup ──→ SelectionManager (드래그 완료)
```

#### 7.2.2 InputHandler 구현

```typescript
class InputHandler {
  private cursorManager: CursorManager;
  private selectionManager: SelectionManager;
  private commandDispatcher: CommandDispatcher;
  private imeHandler: IMEHandler;

  /** Hidden textarea: IME 입력을 받기 위한 숨겨진 입력 요소 */
  private hiddenInput: HTMLTextAreaElement;

  constructor() {
    this.hiddenInput = document.createElement('textarea');
    this.hiddenInput.style.cssText = `
      position: absolute; opacity: 0; pointer-events: none;
      width: 1px; height: 1px; overflow: hidden;
    `;
    // 항상 포커스를 유지하여 키보드 이벤트 수신
    document.body.appendChild(this.hiddenInput);
    this.hiddenInput.focus();

    this.bindEvents();
  }

  /** keydown 이벤트 처리 */
  onKeyDown(e: KeyboardEvent): void {
    // IME 조합 중이면 keydown 무시 (229 코드)
    if (e.isComposing || e.keyCode === 229) return;

    const ctx = this.cursorManager.getContext();

    // 단축키 매칭
    const shortcut = this.matchShortcut(e);
    if (shortcut) {
      e.preventDefault();
      this.commandDispatcher.dispatch(shortcut);
      return;
    }

    // 키별 동작
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        this.handleArrowKey(e);
        break;

      case 'Home':
      case 'End':
        e.preventDefault();
        this.handleHomeEnd(e);
        break;

      case 'PageUp':
      case 'PageDown':
        e.preventDefault();
        this.handlePageUpDown(e);
        break;

      case 'Enter':
        e.preventDefault();
        this.handleEnter(ctx);
        break;

      case 'Backspace':
        e.preventDefault();
        this.handleBackspace(ctx);
        break;

      case 'Delete':
        e.preventDefault();
        this.handleDelete(ctx);
        break;

      case 'Tab':
        e.preventDefault();
        this.handleTab(e.shiftKey, ctx);
        break;

      case 'Escape':
        e.preventDefault();
        this.handleEscape(ctx);
        break;
    }
  }

  /** 화살표 키 처리 */
  private handleArrowKey(e: KeyboardEvent): void {
    const moveType = this.arrowToMoveType(e.key, e.ctrlKey);

    if (e.shiftKey) {
      // 선택 확장
      this.selectionManager.extendSelection(moveType);
    } else {
      // 선택 해제 + 커서 이동
      this.selectionManager.clearSelection();
      this.cursorManager.move(moveType);
    }

    // 수평 이동 시 preferredX 초기화
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      this.cursorManager.resetPreferredX();
    }
  }

  /** Enter 키 처리 */
  private handleEnter(ctx: CursorContext): void {
    switch (ctx.type) {
      case 'text':
        // 선택 영역이 있으면 먼저 삭제
        this.deleteSelectionIfAny();
        // 문단 분할
        this.commandDispatcher.dispatch({
          type: 'splitParagraph',
          position: ctx.position,
        });
        break;

      case 'control':
        // 컨트롤 내부 진입 (표 → 셀 편집, 글상자 → 텍스트 편집)
        this.cursorManager.enterControl(ctx);
        break;

      case 'table':
        // 셀 내에서 문단 분할
        this.commandDispatcher.dispatch({
          type: 'splitCellParagraph',
          tableContext: ctx,
        });
        break;
    }
  }

  /** Backspace 키 처리 */
  private handleBackspace(ctx: CursorContext): void {
    // 선택 영역이 있으면 선택 삭제
    if (this.selectionManager.hasSelection()) {
      this.commandDispatcher.dispatch({
        type: 'deleteSelection',
        selection: this.selectionManager.getSelection(),
      });
      return;
    }

    if (ctx.type !== 'text') return;

    if (ctx.position.charOffset > 0) {
      // 문단 내 이전 문자 삭제
      // 컨트롤 문자인지 확인
      const prevCtrl = this.cursorManager.detectControlAtOffset(
        ctx.position.sectionIndex,
        ctx.position.paragraphIndex,
        ctx.position.charOffset - 1
      );
      if (prevCtrl) {
        // 컨트롤 삭제 확인 (표/도형 삭제 경고)
        this.confirmAndDeleteControl(ctx.position, prevCtrl);
        return;
      }

      this.commandDispatcher.dispatch({
        type: 'deleteText',
        position: { ...ctx.position, charOffset: ctx.position.charOffset - 1 },
        count: 1,
      });
    } else {
      // 문단 시작 → 이전 문단과 병합
      if (ctx.position.paragraphIndex > 0) {
        this.commandDispatcher.dispatch({
          type: 'mergeParagraph',
          position: ctx.position,
        });
      }
    }
  }

  /** Tab 키 처리 */
  private handleTab(shiftKey: boolean, ctx: CursorContext): void {
    switch (ctx.type) {
      case 'text':
        // 탭 문자 삽입 (또는 들여쓰기)
        this.commandDispatcher.dispatch({
          type: 'insertText',
          position: ctx.position,
          text: '\t',
        });
        break;

      case 'table':
        // 다음/이전 셀로 이동
        this.cursorManager.move(shiftKey ? CursorMoveType.CellPrev : CursorMoveType.CellNext);
        break;

      case 'field':
        // 다음/이전 필드로 이동
        this.cursorManager.move(shiftKey ? CursorMoveType.FieldPrev : CursorMoveType.FieldNext);
        break;
    }
  }
}
```

#### 7.2.3 단축키 매핑

```typescript
/** 주요 단축키 목록 */
const SHORTCUT_MAP: Map<string, CommandType> = new Map([
  // 편집
  ['Ctrl+Z', 'undo'],
  ['Ctrl+Y', 'redo'],
  ['Ctrl+Shift+Z', 'redo'],
  ['Ctrl+X', 'cut'],
  ['Ctrl+C', 'copy'],
  ['Ctrl+V', 'paste'],
  ['Ctrl+A', 'selectAll'],

  // 서식
  ['Ctrl+B', 'toggleBold'],
  ['Ctrl+I', 'toggleItalic'],
  ['Ctrl+U', 'toggleUnderline'],
  ['Ctrl+D', 'toggleStrikethrough'],

  // 찾기/바꾸기
  ['Ctrl+F', 'find'],
  ['Ctrl+H', 'replace'],
  ['F3', 'findNext'],
  ['Shift+F3', 'findPrev'],

  // 기타
  ['Ctrl+S', 'save'],
  ['Ctrl+P', 'print'],
]);
```

### 7.3 IME 한글 조합 처리

#### 7.3.1 한글 조합의 특수성

한글 입력은 자모 조합 과정에서 글자가 변한다:

```
키 입력:  ㅎ → 하 → 한 → 한ㄱ → 항 → 항ㄱ → 항구
조합 중:  [ㅎ] [하] [한] [한ㄱ] [항] [항ㄱ] [항구]
확정:                                           항구
```

**핵심 과제**: 조합 중인 글자는 아직 확정되지 않았으므로, 레이아웃에 임시로 반영하되 Undo 히스토리에는 조합 완료 시점에만 기록해야 한다.

#### 7.3.2 IME 처리 아키텍처

```typescript
class IMEHandler {
  private isComposing: boolean = false;
  private compositionText: string = '';
  private compositionStart: DocumentPosition | null = null;
  private preCompositionText: string = '';  // 조합 시작 전 원본 텍스트

  /** compositionstart: 조합 시작 */
  onCompositionStart(e: CompositionEvent): void {
    this.isComposing = true;
    this.compositionStart = this.cursorManager.getPosition();

    // 현재 위치의 원본 텍스트 보존 (조합 취소 시 복원용)
    this.preCompositionText = this.getTextAtPosition(this.compositionStart);
  }

  /** compositionupdate: 조합 중 (글자 변경) */
  onCompositionUpdate(e: CompositionEvent): void {
    if (!this.compositionStart) return;

    const newComposition = e.data;
    const pos = this.compositionStart;

    if (this.compositionText.length > 0) {
      // 이전 조합 문자열 제거 (WASM에 직접 요청)
      wasmBridge.deleteText(pos.sectionIndex, pos.paragraphIndex,
        pos.charOffset, this.compositionText.length);
    }

    // 새 조합 문자열 삽입 (임시)
    if (newComposition.length > 0) {
      wasmBridge.insertText(pos.sectionIndex, pos.paragraphIndex,
        pos.charOffset, newComposition);
    }

    this.compositionText = newComposition;

    // 증분 레이아웃 트리거 (조합 중에도 줄바꿈 반영)
    this.layoutEngine.reflowParagraph(pos.sectionIndex, pos.paragraphIndex);

    // 캐럿 위치 갱신 (조합 문자열 끝)
    this.cursorManager.setPosition({
      ...pos,
      charOffset: pos.charOffset + newComposition.length,
    });

    // 조합 중 문자에 밑줄 표시
    this.caretRenderer.showCompositionUnderline(
      pos, newComposition.length
    );
  }

  /** compositionend: 조합 완료 (확정) */
  onCompositionEnd(e: CompositionEvent): void {
    if (!this.compositionStart) return;

    const finalText = e.data;
    const pos = this.compositionStart;

    // 조합 중 텍스트 제거
    if (this.compositionText.length > 0) {
      wasmBridge.deleteText(pos.sectionIndex, pos.paragraphIndex,
        pos.charOffset, this.compositionText.length);
    }

    // 확정된 텍스트 삽입 (Command 패턴으로 Undo 가능)
    if (finalText.length > 0) {
      this.commandDispatcher.dispatch({
        type: 'insertText',
        position: pos,
        text: finalText,
      });
    }

    // 상태 초기화
    this.isComposing = false;
    this.compositionText = '';
    this.compositionStart = null;
    this.preCompositionText = '';
    this.caretRenderer.hideCompositionUnderline();
  }

  /** 조합 상태 조회 */
  getCompositionState(): CompositionState | null {
    if (!this.isComposing) return null;
    return {
      position: this.compositionStart!,
      text: this.compositionText,
      length: this.compositionText.length,
    };
  }
}
```

#### 7.3.3 조합 중 레이아웃 처리

```
[compositionupdate 발생]
  ↓
① 이전 조합 텍스트 제거 (1~2문자)
  ↓
② 새 조합 텍스트 삽입 (1~2문자)
  ↓
③ TextFlow: 해당 문단만 리플로우
   - 줄 수 변경 가능 (조합 중 줄바꿈 발생할 수 있음)
  ↓
④ 캐럿 갱신 + 조합 밑줄 표시
  ↓
⑤ BlockFlow/PageFlow: 줄 수 변경 시만
```

**성능 고려**: compositionupdate는 빈번하게 발생한다 (키 입력마다). 16ms 프레임 예산 내에서 처리해야 하므로:
- TextFlow만 수행 (1~3ms)
- BlockFlow/PageFlow는 줄 수 변경 시만 (~1ms)
- Canvas 재렌더링은 해당 줄만 부분 갱신 (2~3ms)
- 총 ~6ms — 충분히 60fps 달성 가능

#### 7.3.4 Hidden Input Element 전략

```typescript
/** IME 입력을 받기 위한 숨겨진 textarea 관리 */
class HiddenInputManager {
  private textarea: HTMLTextAreaElement;

  /** 캐럿 위치에 맞춰 textarea를 이동 (IME 후보창 위치 보정) */
  updatePosition(caretRect: { x: number; y: number; height: number }): void {
    const vpCoord = this.coordSystem.pageToViewport(
      this.cursor.pageIdx, caretRect.x, caretRect.y
    );
    this.textarea.style.left = `${vpCoord.x}px`;
    this.textarea.style.top = `${vpCoord.y}px`;
    this.textarea.style.fontSize = `${caretRect.height}px`;
    // IME 후보창이 캐럿 근처에 표시되도록 함
  }

  /** 포커스 관리: Canvas 클릭 시 textarea에 포커스 유지 */
  ensureFocus(): void {
    if (document.activeElement !== this.textarea) {
      this.textarea.focus({ preventScroll: true });
    }
  }
}
```

### 7.4 캐럿 렌더링

#### 7.4.1 캐럿 상태

```typescript
interface CaretState {
  visible: boolean;            // 블링크 상태 (표시/숨김)
  position: CursorLocation;    // 캐럿 위치
  style: CaretStyle;           // 캐럿 스타일
  composing: boolean;          // IME 조합 중 여부
  compositionLength: number;   // 조합 중 문자 수
}

interface CaretStyle {
  width: number;              // 캐럿 폭 (px) — 기본 1px, 삽입 모드
  overwriteWidth: number;     // 겹쳐쓰기 모드 폭 (문자 1개 폭)
  color: string;              // 캐럿 색상 — 보통 검정 또는 텍스트 색 반전
  blinkInterval: number;      // 블링크 간격 (ms) — 기본 530ms
}
```

#### 7.4.2 캐럿 위치 계산

```typescript
class CaretRenderer {
  /** 캐럿 위치를 FlowResult와 charPositions로부터 계산 */
  computeCaretRect(
    ctx: TextContext,
    flowResult: FlowResult,
    blockLayout: BlockLayout
  ): CaretRect {
    const line = flowResult.lines[ctx.location.lineIndex];

    // 줄 내 X 좌표: FlowRun.charPositions로 계산
    let caretX = line.x;
    let remainingOffset = ctx.location.lineCharOffset;

    for (const run of line.runs) {
      const runCharCount = run.charPositions.length - 1;
      if (remainingOffset <= runCharCount) {
        caretX += run.charPositions[remainingOffset];
        break;
      }
      remainingOffset -= runCharCount;
      caretX += run.width;
    }

    // 줄의 Y 좌표: 블록 Y + 줄까지의 누적 높이
    let caretY = blockLayout.y;
    for (let i = 0; i < ctx.location.lineIndex; i++) {
      caretY += flowResult.lines[i].lineHeight + flowResult.lines[i].lineSpacing;
    }

    return {
      pageIndex: ctx.location.pageIndex,
      x: caretX,
      y: caretY,
      height: line.lineHeight,
      baseline: line.baseline,
    };
  }
}
```

#### 7.4.3 캐럿 렌더링 방식

```typescript
class CaretRenderer {
  private blinkTimer: number | null = null;
  private isBlinkVisible: boolean = true;
  private caretLayer: HTMLDivElement;    // Canvas 위에 오버레이되는 캐럿 요소

  /** 캐럿 렌더링 (DOM 오버레이 방식) */
  render(caretRect: CaretRect): void {
    const vpCoord = this.coordSystem.pageToViewport(
      caretRect.pageIndex, caretRect.x, caretRect.y
    );

    this.caretLayer.style.left = `${vpCoord.x}px`;
    this.caretLayer.style.top = `${vpCoord.y}px`;
    this.caretLayer.style.height = `${caretRect.height * this.zoom}px`;
    this.caretLayer.style.width = `${this.caretStyle.width}px`;
    this.caretLayer.style.backgroundColor = this.caretStyle.color;
    this.caretLayer.style.display = this.isBlinkVisible ? 'block' : 'none';
  }

  /** 블링크 시작 (편집 동작 시 리셋) */
  startBlink(): void {
    this.stopBlink();
    this.isBlinkVisible = true;
    this.render(this.currentRect!);

    this.blinkTimer = window.setInterval(() => {
      this.isBlinkVisible = !this.isBlinkVisible;
      this.render(this.currentRect!);
    }, this.caretStyle.blinkInterval);
  }

  /** 블링크 중지 (편집 동작 중) */
  stopBlink(): void {
    if (this.blinkTimer !== null) {
      window.clearInterval(this.blinkTimer);
      this.blinkTimer = null;
    }
  }

  /** IME 조합 중 밑줄 표시 */
  showCompositionUnderline(position: DocumentPosition, length: number): void {
    // 조합 중 텍스트 영역에 밑줄 사각형 렌더링
    const startRect = this.computeCaretRect(position);
    const endPos = { ...position, charOffset: position.charOffset + length };
    const endRect = this.computeCaretRect(endPos);

    this.compositionUnderline.style.left = `${startRect.x}px`;
    this.compositionUnderline.style.top = `${startRect.y + startRect.height - 2}px`;
    this.compositionUnderline.style.width = `${endRect.x - startRect.x}px`;
    this.compositionUnderline.style.height = '2px';
    this.compositionUnderline.style.display = 'block';
  }
}
```

#### 7.4.4 선택 영역 렌더링

```typescript
class SelectionRenderer {
  private selectionLayer: HTMLDivElement;  // 선택 영역 오버레이

  /** 선택 영역 렌더링 (반투명 파란색 사각형) */
  render(rects: SelectionRect[]): void {
    // 기존 선택 사각형 제거
    this.selectionLayer.innerHTML = '';

    for (const rect of rects) {
      const vpCoord = this.coordSystem.pageToViewport(rect.pageIndex, rect.x, rect.y);

      const div = document.createElement('div');
      div.style.cssText = `
        position: absolute;
        left: ${vpCoord.x}px;
        top: ${vpCoord.y}px;
        width: ${rect.width * this.zoom}px;
        height: ${rect.height * this.zoom}px;
        background-color: rgba(51, 122, 183, 0.3);
        pointer-events: none;
      `;
      this.selectionLayer.appendChild(div);
    }
  }

  /** 셀 블록 선택 렌더링 (셀 단위 반전) */
  renderCellBlock(selection: CellBlockSelection): void {
    this.selectionLayer.innerHTML = '';

    for (const cell of selection.selectedCells) {
      const cellLayout = this.layoutCache.getCellLayout(
        selection.tableRef, cell.cellIndex
      );
      const vpCoord = this.coordSystem.pageToViewport(
        cellLayout.pageIndex, cellLayout.bbox.x, cellLayout.bbox.y
      );

      const div = document.createElement('div');
      div.style.cssText = `
        position: absolute;
        left: ${vpCoord.x}px;
        top: ${vpCoord.y}px;
        width: ${cellLayout.bbox.width * this.zoom}px;
        height: ${cellLayout.bbox.height * this.zoom}px;
        background-color: rgba(51, 122, 183, 0.3);
        pointer-events: none;
      `;
      this.selectionLayer.appendChild(div);
    }
  }
}
```

### 7.5 컨텍스트별 입력/선택 동작 요약

| 동작 | TextContext | ControlContext | TableContext |
|------|-----------|---------------|-------------|
| **문자 입력** | 커서 위치에 삽입 | 컨트롤 삭제 → 문자 삽입 | 셀 내 커서 위치에 삽입 |
| **Enter** | 문단 분할 | 컨트롤 내부 진입 | 셀 내 문단 분할 |
| **Backspace** | 이전 문자/문단 병합 | 컨트롤 삭제 | 셀 내 이전 문자/문단 병합 |
| **Delete** | 다음 문자 삭제 | 컨트롤 삭제 | 셀 내 다음 문자 삭제 |
| **Tab** | 탭 문자 삽입 | — | 다음 셀 이동 |
| **Shift+Tab** | — | — | 이전 셀 이동 |
| **Escape** | — | 컨트롤 해제 → TextContext | 표 밖 → ControlContext |
| **Ctrl+A** | 전체 선택 | 전체 선택 | 셀 전체 선택 → 표 전체 → 문서 전체 |
| **←/→** | 문자 이동 | 컨트롤 좌/우로 | 셀 내 문자 이동 |
| **↑/↓** | 줄 이동 | 컨트롤 위/아래 이동 | 셀 내/셀 간 이동 |
| **Shift+방향키** | 범위 선택 확장 | — | 셀 블록 선택 확장 |
| **마우스 클릭** | 커서 이동 | 컨트롤 선택 | 셀 내 커서 이동 |
| **마우스 드래그** | 범위 선택 | 컨트롤 이동 | 셀 블록 선택 |
| **더블 클릭** | 단어 선택 | 컨트롤 내부 진입 | 셀 내 단어 선택 |
| **트리플 클릭** | 문단 전체 선택 | — | 셀 내 문단 전체 선택 |

---

## 8. 명령 히스토리 (Undo/Redo)

### 8.1 Command 패턴 개요

모든 편집 동작을 Command 객체로 캡슐화하여, 실행(execute)과 역실행(undo)을 지원한다. 이를 통해 Undo/Redo 기능과 매크로 기록이 가능해진다.

```
[사용자 입력]
  → InputHandler
  → CommandDispatcher.dispatch(command)
  → command.execute(context)
  → UndoStack.push(command)
  → RedoStack.clear()
```

### 8.2 EditCommand 인터페이스

```typescript
/** 편집 명령의 공통 인터페이스 */
interface EditCommand {
  /** 명령 유형 식별자 */
  readonly type: string;

  /** 명령 실행 — 문서 상태를 변경하고 결과를 반환 */
  execute(ctx: EditContext): CommandResult;

  /** 역실행 — execute()의 효과를 정확히 되돌림 */
  undo(ctx: EditContext): CommandResult;

  /** 연속 명령 병합 시도 — 같은 유형의 연속 명령을 하나로 합칠 수 있으면 합친 결과 반환 */
  mergeWith(other: EditCommand): EditCommand | null;

  /** 명령 설명 (Undo 메뉴 표시용) */
  readonly description: string;

  /** 타임스탬프 (연속 타이핑 묶기 판단용) */
  readonly timestamp: number;
}

/** 명령 실행 컨텍스트 */
interface EditContext {
  wasmBridge: WasmBridge;             // WASM API 호출
  layoutEngine: IncrementalLayout;    // 증분 레이아웃
  cursorManager: CursorManager;       // 커서 갱신
  dirtyTracker: DirtyTracker;         // 변경 추적
}

/** 명령 실행 결과 */
interface CommandResult {
  success: boolean;
  /** 명령 실행 후 커서 위치 */
  cursorAfter?: DocumentPosition;
  /** 변경된 문단 목록 (증분 레이아웃 트리거용) */
  affectedParagraphs?: ParagraphRef[];
  /** 에러 메시지 */
  error?: string;
}
```

### 8.3 명령 유형별 구현

#### 8.3.1 텍스트 편집 명령

```typescript
/** 텍스트 삽입 명령 */
class InsertTextCommand implements EditCommand {
  readonly type = 'insertText';
  readonly description: string;
  readonly timestamp = Date.now();

  constructor(
    private position: DocumentPosition,
    private text: string,
  ) {
    this.description = `텍스트 입력: "${text.substring(0, 10)}..."`;
  }

  execute(ctx: EditContext): CommandResult {
    const result = ctx.wasmBridge.insertText(
      this.position.sectionIndex,
      this.position.paragraphIndex,
      this.position.charOffset,
      this.text
    );

    if (!result.ok) return { success: false, error: result.error };

    ctx.dirtyTracker.markParagraphDirty(
      this.position.sectionIndex,
      this.position.paragraphIndex
    );

    return {
      success: true,
      cursorAfter: {
        ...this.position,
        charOffset: this.position.charOffset + [...this.text].length,
      },
      affectedParagraphs: [{
        sectionIndex: this.position.sectionIndex,
        paraIndex: this.position.paragraphIndex,
      }],
    };
  }

  undo(ctx: EditContext): CommandResult {
    const charCount = [...this.text].length;
    const result = ctx.wasmBridge.deleteText(
      this.position.sectionIndex,
      this.position.paragraphIndex,
      this.position.charOffset,
      charCount
    );

    if (!result.ok) return { success: false, error: result.error };

    ctx.dirtyTracker.markParagraphDirty(
      this.position.sectionIndex,
      this.position.paragraphIndex
    );

    return {
      success: true,
      cursorAfter: this.position,
      affectedParagraphs: [{
        sectionIndex: this.position.sectionIndex,
        paraIndex: this.position.paragraphIndex,
      }],
    };
  }

  /** 연속 타이핑 병합: 같은 문단, 연속 위치, 300ms 이내 */
  mergeWith(other: EditCommand): EditCommand | null {
    if (!(other instanceof InsertTextCommand)) return null;
    if (other.position.sectionIndex !== this.position.sectionIndex) return null;
    if (other.position.paragraphIndex !== this.position.paragraphIndex) return null;

    const expectedOffset = this.position.charOffset + [...this.text].length;
    if (other.position.charOffset !== expectedOffset) return null;
    if (other.timestamp - this.timestamp > 300) return null;

    return new InsertTextCommand(
      this.position,
      this.text + other.text,
    );
  }
}
```

#### 8.3.2 텍스트 삭제 명령

```typescript
/** 텍스트 삭제 명령 */
class DeleteTextCommand implements EditCommand {
  readonly type = 'deleteText';
  readonly description: string;
  readonly timestamp = Date.now();

  /** undo용 삭제된 텍스트 보존 */
  private deletedText: string = '';

  constructor(
    private position: DocumentPosition,
    private count: number,
    private direction: 'forward' | 'backward',  // Delete vs Backspace
  ) {
    this.description = `텍스트 삭제 (${count}자)`;
  }

  execute(ctx: EditContext): CommandResult {
    // 삭제 전 텍스트 보존 (Undo용)
    this.deletedText = ctx.wasmBridge.getTextRange(
      this.position.sectionIndex,
      this.position.paragraphIndex,
      this.position.charOffset,
      this.count
    );

    const result = ctx.wasmBridge.deleteText(
      this.position.sectionIndex,
      this.position.paragraphIndex,
      this.position.charOffset,
      this.count
    );

    if (!result.ok) return { success: false, error: result.error };

    ctx.dirtyTracker.markParagraphDirty(
      this.position.sectionIndex,
      this.position.paragraphIndex
    );

    return {
      success: true,
      cursorAfter: this.position,
      affectedParagraphs: [{
        sectionIndex: this.position.sectionIndex,
        paraIndex: this.position.paragraphIndex,
      }],
    };
  }

  undo(ctx: EditContext): CommandResult {
    const result = ctx.wasmBridge.insertText(
      this.position.sectionIndex,
      this.position.paragraphIndex,
      this.position.charOffset,
      this.deletedText
    );

    if (!result.ok) return { success: false, error: result.error };

    const restoredLength = [...this.deletedText].length;
    return {
      success: true,
      cursorAfter: {
        ...this.position,
        charOffset: this.position.charOffset + restoredLength,
      },
    };
  }

  /** 연속 Backspace/Delete 병합 */
  mergeWith(other: EditCommand): EditCommand | null {
    if (!(other instanceof DeleteTextCommand)) return null;
    if (other.direction !== this.direction) return null;
    if (other.timestamp - this.timestamp > 300) return null;

    if (this.direction === 'backward') {
      // Backspace: 연속적으로 앞쪽 삭제
      if (other.position.charOffset === this.position.charOffset - other.count) {
        const merged = new DeleteTextCommand(
          other.position, this.count + other.count, 'backward'
        );
        merged.deletedText = other.deletedText + this.deletedText;
        return merged;
      }
    } else {
      // Delete: 같은 위치에서 연속 삭제
      if (other.position.charOffset === this.position.charOffset) {
        const merged = new DeleteTextCommand(
          this.position, this.count + other.count, 'forward'
        );
        merged.deletedText = this.deletedText + other.deletedText;
        return merged;
      }
    }
    return null;
  }
}
```

#### 8.3.3 문단 구조 명령

```typescript
/** 문단 분할 명령 (Enter) */
class SplitParagraphCommand implements EditCommand {
  readonly type = 'splitParagraph';
  readonly timestamp = Date.now();
  readonly description = '문단 나누기';

  constructor(private position: DocumentPosition) {}

  execute(ctx: EditContext): CommandResult {
    const result = ctx.wasmBridge.splitParagraph(
      this.position.sectionIndex,
      this.position.paragraphIndex,
      this.position.charOffset
    );

    if (!result.ok) return { success: false, error: result.error };

    // 두 문단 모두 dirty
    ctx.dirtyTracker.markParagraphDirty(
      this.position.sectionIndex, this.position.paragraphIndex
    );
    ctx.dirtyTracker.markParagraphDirty(
      this.position.sectionIndex, this.position.paragraphIndex + 1
    );

    return {
      success: true,
      cursorAfter: {
        sectionIndex: this.position.sectionIndex,
        paragraphIndex: this.position.paragraphIndex + 1,
        charOffset: 0,
      },
    };
  }

  undo(ctx: EditContext): CommandResult {
    // 분할된 두 문단을 다시 병합
    const result = ctx.wasmBridge.mergeParagraph(
      this.position.sectionIndex,
      this.position.paragraphIndex + 1
    );

    if (!result.ok) return { success: false, error: result.error };

    return {
      success: true,
      cursorAfter: this.position,
    };
  }

  mergeWith(_other: EditCommand): null { return null; }
}

/** 문단 병합 명령 (문단 시작에서 Backspace) */
class MergeParagraphCommand implements EditCommand {
  readonly type = 'mergeParagraph';
  readonly timestamp = Date.now();
  readonly description = '문단 합치기';

  private mergePointOffset: number = 0;

  constructor(private position: DocumentPosition) {}

  execute(ctx: EditContext): CommandResult {
    // 병합 전 이전 문단의 길이 기억 (Undo 시 분할 위치)
    this.mergePointOffset = ctx.wasmBridge.getParagraphLength(
      this.position.sectionIndex,
      this.position.paragraphIndex - 1
    );

    const result = ctx.wasmBridge.mergeParagraph(
      this.position.sectionIndex,
      this.position.paragraphIndex
    );

    if (!result.ok) return { success: false, error: result.error };

    return {
      success: true,
      cursorAfter: {
        sectionIndex: this.position.sectionIndex,
        paragraphIndex: this.position.paragraphIndex - 1,
        charOffset: this.mergePointOffset,
      },
    };
  }

  undo(ctx: EditContext): CommandResult {
    // 병합된 문단을 다시 분할
    const result = ctx.wasmBridge.splitParagraph(
      this.position.sectionIndex,
      this.position.paragraphIndex - 1,
      this.mergePointOffset
    );

    if (!result.ok) return { success: false, error: result.error };

    return {
      success: true,
      cursorAfter: this.position,
    };
  }

  mergeWith(_other: EditCommand): null { return null; }
}
```

#### 8.3.4 서식 변경 명령

```typescript
/** 글자 서식 변경 명령 */
class ApplyCharFormatCommand implements EditCommand {
  readonly type = 'applyCharFormat';
  readonly timestamp = Date.now();
  readonly description: string;

  /** undo용 이전 서식 보존 */
  private previousFormats: Array<{
    startOffset: number;
    endOffset: number;
    charShapeId: number;
  }> = [];

  constructor(
    private sectionIndex: number,
    private paragraphIndex: number,
    private startOffset: number,
    private endOffset: number,
    private formatProps: Record<string, unknown>,
  ) {
    this.description = `서식 변경: ${Object.keys(formatProps).join(', ')}`;
  }

  execute(ctx: EditContext): CommandResult {
    // 이전 서식 보존 (Undo용)
    this.previousFormats = ctx.wasmBridge.getCharFormatsInRange(
      this.sectionIndex, this.paragraphIndex,
      this.startOffset, this.endOffset
    );

    const result = ctx.wasmBridge.applyCharFormat(
      this.sectionIndex, this.paragraphIndex,
      this.startOffset, this.endOffset,
      JSON.stringify(this.formatProps)
    );

    if (!result.ok) return { success: false, error: result.error };

    return { success: true };
  }

  undo(ctx: EditContext): CommandResult {
    // 이전 서식 복원 (각 구간별로)
    for (const fmt of this.previousFormats) {
      ctx.wasmBridge.restoreCharFormat(
        this.sectionIndex, this.paragraphIndex,
        fmt.startOffset, fmt.endOffset, fmt.charShapeId
      );
    }
    return { success: true };
  }

  mergeWith(_other: EditCommand): null { return null; }
}
```

#### 8.3.5 복합 명령 (Compound Command)

```typescript
/** 여러 명령을 하나의 Undo 단위로 묶는 복합 명령 */
class CompoundCommand implements EditCommand {
  readonly type = 'compound';
  readonly timestamp = Date.now();

  constructor(
    private commands: EditCommand[],
    readonly description: string,
  ) {}

  execute(ctx: EditContext): CommandResult {
    for (const cmd of this.commands) {
      const result = cmd.execute(ctx);
      if (!result.success) {
        // 실패 시 이미 실행된 명령들 롤백
        this.undoPartial(ctx, this.commands.indexOf(cmd));
        return result;
      }
    }
    return { success: true, cursorAfter: this.commands[this.commands.length - 1].execute?.(ctx)?.cursorAfter };
  }

  undo(ctx: EditContext): CommandResult {
    // 역순으로 Undo
    for (let i = this.commands.length - 1; i >= 0; i--) {
      const result = this.commands[i].undo(ctx);
      if (!result.success) return result;
    }
    return { success: true };
  }

  private undoPartial(ctx: EditContext, failedIndex: number): void {
    for (let i = failedIndex - 1; i >= 0; i--) {
      this.commands[i].undo(ctx);
    }
  }

  mergeWith(_other: EditCommand): null { return null; }
}
```

**활용 예시**:
- 선택 영역 삭제 후 텍스트 삽입 → `CompoundCommand([DeleteSelection, InsertText])`
- 선택 영역 서식 변경 (다중 문단) → `CompoundCommand([ApplyCharFormat×N])`
- 표 행 삽입 + 셀 초기화 → `CompoundCommand([InsertTableRow, SetCellFormat×N])`

#### 8.3.6 전체 명령 유형 목록

| 명령 | 역연산 | 병합 가능 | 복합 가능 |
|------|--------|----------|----------|
| **InsertText** | DeleteText | ✅ 연속 타이핑 | — |
| **DeleteText** | InsertText | ✅ 연속 BS/Del | — |
| **SplitParagraph** | MergeParagraph | ❌ | — |
| **MergeParagraph** | SplitParagraph | ❌ | — |
| **ApplyCharFormat** | 이전 서식 복원 | ❌ | ✅ 다중 문단 |
| **ApplyParaFormat** | 이전 서식 복원 | ❌ | ✅ 다중 문단 |
| **InsertTableRow** | DeleteTableRow | ❌ | — |
| **InsertTableColumn** | DeleteTableColumn | ❌ | — |
| **MergeTableCells** | SplitTableCell | ❌ | — |
| **SplitTableCell** | MergeTableCells | ❌ | — |
| **PasteContent** | DeleteRange | ❌ | ✅ 분할+삽입+병합 |
| **DeleteSelection** | InsertContent | ❌ | ✅ 다중 문단 삭제 |
| **InsertControl** | DeleteControl | ❌ | — |
| **DeleteControl** | InsertControl | ❌ | — |

### 8.4 명령 히스토리 관리

```typescript
class CommandHistory {
  private undoStack: EditCommand[] = [];
  private redoStack: EditCommand[] = [];
  private maxHistorySize: number = 1000;

  /** 명령 실행 + 히스토리 기록 */
  execute(command: EditCommand, ctx: EditContext): CommandResult {
    const result = command.execute(ctx);
    if (!result.success) return result;

    // 직전 명령과 병합 시도
    if (this.undoStack.length > 0) {
      const lastCmd = this.undoStack[this.undoStack.length - 1];
      const merged = lastCmd.mergeWith(command);
      if (merged) {
        this.undoStack[this.undoStack.length - 1] = merged;
        this.redoStack = [];  // Redo 스택 초기화
        return result;
      }
    }

    this.undoStack.push(command);
    this.redoStack = [];  // 새 명령 실행 시 Redo 스택 초기화

    // 히스토리 크기 제한
    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift();
    }

    return result;
  }

  /** Undo */
  undo(ctx: EditContext): CommandResult | null {
    const command = this.undoStack.pop();
    if (!command) return null;

    const result = command.undo(ctx);
    if (result.success) {
      this.redoStack.push(command);
    } else {
      // Undo 실패 시 스택에 다시 넣기
      this.undoStack.push(command);
    }
    return result;
  }

  /** Redo */
  redo(ctx: EditContext): CommandResult | null {
    const command = this.redoStack.pop();
    if (!command) return null;

    const result = command.execute(ctx);
    if (result.success) {
      this.undoStack.push(command);
    } else {
      this.redoStack.push(command);
    }
    return result;
  }

  /** Undo/Redo 가능 여부 */
  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  /** 히스토리 초기화 (문서 저장 시점 마킹 등) */
  private savedIndex: number = 0;
  markSaved(): void { this.savedIndex = this.undoStack.length; }
  isModified(): boolean { return this.undoStack.length !== this.savedIndex; }
}
```

### 8.5 연속 타이핑 묶기 전략

#### 8.5.1 묶기 조건

연속으로 입력한 문자들을 하나의 Undo 단위로 묶는 규칙:

```
[연속 타이핑 병합 조건]
1. 같은 유형의 명령 (InsertText + InsertText)
2. 같은 구역/문단
3. 연속 위치 (이전 삽입 끝 == 새 삽입 시작)
4. 시간 간격 300ms 이내
5. 줄바꿈/탭 없음 (Enter, Tab은 항상 별도 Undo 단위)

[병합 중단 조건]
- 300ms 이상 타이핑 정지
- 커서 이동 (화살표, 클릭)
- 서식 변경
- 다른 유형의 편집 동작
- 문단 분할 (Enter)
- 선택 영역 변경
```

#### 8.5.2 동작 예시

```
사용자 입력: "안녕하세요" (5타, 각 200ms 간격)

1. "안" → InsertTextCommand("안", offset=0)     → undoStack: [Insert("안")]
2. "녕" → InsertTextCommand("녕", offset=1)     → 병합 → undoStack: [Insert("안녕")]
3. "하" → InsertTextCommand("하", offset=2)     → 병합 → undoStack: [Insert("안녕하")]
4. "세" → InsertTextCommand("세", offset=3)     → 병합 → undoStack: [Insert("안녕하세")]
5. "요" → InsertTextCommand("요", offset=4)     → 병합 → undoStack: [Insert("안녕하세요")]

→ Ctrl+Z 1회: "안녕하세요" 전체 삭제 (5글자 한번에)

사용자 입력: "AB" (2타, 200ms) → 500ms 대기 → "CD" (2타, 200ms)

1. "A" → undoStack: [Insert("A")]
2. "B" → 병합 → undoStack: [Insert("AB")]
3. (500ms 대기)
4. "C" → 300ms 초과 → 병합 불가 → undoStack: [Insert("AB"), Insert("C")]
5. "D" → 병합 → undoStack: [Insert("AB"), Insert("CD")]

→ Ctrl+Z 1회: "CD" 삭제
→ Ctrl+Z 2회: "AB" 삭제
```

### 8.6 IME 조합과 Undo 통합

```
[한글 조합 시나리오]

compositionstart: anchor 저장 (offset=5)
compositionupdate "ㅎ": WASM 직접 호출 (Undo 스택 기록 안 함)
compositionupdate "하": WASM 직접 호출 (Undo 스택 기록 안 함)
compositionupdate "한": WASM 직접 호출 (Undo 스택 기록 안 함)
compositionend "한": Command 패턴으로 InsertText("한") 실행 → Undo 스택 기록

→ Ctrl+Z: "한" 삭제

[연속 한글 입력]
compositionend "한" → InsertTextCommand("한", off=5)
compositionend "글" → InsertTextCommand("글", off=6)
  → 300ms 이내 + 연속 위치 → 병합 → InsertTextCommand("한글", off=5)

→ Ctrl+Z: "한글" 한번에 삭제
```

---

## 9. WASM 코어 확장 계획

### 9.1 현재 WASM API 현황

현재 `wasm_api.rs`에 구현된 공개 메서드 **101개** (WASM 64개 + Native 49개):

| 카테고리 | WASM | Native | 합계 |
|----------|------|--------|------|
| 문서 초기화/로드 | 2 | 1 | 3 |
| 렌더링 (SVG/HTML/Canvas) | 4 | 3 | 7 |
| 텍스트 편집 | 6 | 6 | 12 |
| 표 조작 | 4 | 4 | 8 |
| 서식 조회 | 4 | 4 | 8 |
| 서식 적용 | 5 | 5 | 10 |
| 클립보드 | 19 | 19 | 38 |
| 문서 정보/탐색 | 5 | 3 | 8 |
| 문서 설정 | 5 | 0 | 5 |
| 문서 내보내기 | 2 | 2 | 4 |
| HwpViewer (뷰포트) | 8 | 0 | 8 |

### 9.2 편집기에 필요한 신규 API

4단계(Phase)로 나누어 점진적으로 추가한다. 기존 API와의 호환성을 유지하면서, 편집기 전용 API를 추가하는 전략이다.

#### Phase 1: 기본 편집 API 보강 (기존 API 확장)

| API | 시그니처 | 용도 |
|-----|---------|------|
| **getTextRange** | `(sec, para, offset, count) → String` | 삭제 전 텍스트 보존 (Undo용) |
| **getParagraphLength** | `(sec, para) → u32` | 문단 길이 조회 (커서 이동 경계) |
| **getParagraphCount** | `(sec) → u32` | 구역 내 문단 수 (탐색용) |
| **getSectionCount** | `() → u32` | 구역 수 |
| **getTextInCell** | `(sec, para, ctrl, cell, cellPara, offset, count) → String` | 셀 내 텍스트 조회 |
| **getCellParagraphLength** | `(sec, para, ctrl, cell, cellPara) → u32` | 셀 내 문단 길이 |
| **getCellParagraphCount** | `(sec, para, ctrl, cell) → u32` | 셀 내 문단 수 |

#### Phase 2: 증분 레이아웃 API

| API | 시그니처 | 용도 |
|-----|---------|------|
| **recomposeParagraph** | `(sec, para) → JSON` | 단일 문단 재구성 (ComposedParagraph) |
| **repaginateFrom** | `(sec, para) → JSON` | 특정 지점부터 재페이지네이션 |
| **getParagraphLayout** | `(sec, para) → JSON` | 단일 문단의 레이아웃 캐시 |
| **getBlockLayout** | `(sec, para) → JSON` | 블록 수직 위치 조회 |
| **measureParagraph** | `(sec, para) → JSON` | 단일 문단 높이 측정 |
| **measureTable** | `(sec, para, ctrl) → JSON` | 표 높이 측정 |

#### Phase 3: 커서/히트 테스팅 API

| API | 시그니처 | 용도 |
|-----|---------|------|
| **hitTest** | `(page, x, y) → JSON` | 좌표 → 문서 위치 변환 |
| **getCursorRect** | `(sec, para, offset) → JSON` | 캐럿 사각형 좌표 |
| **getLineInfo** | `(sec, para, line) → JSON` | 줄 정보 (높이, 시작 오프셋) |
| **getParagraphControlPositions** | `(sec, para) → JSON` | 컨트롤 위치 목록 |
| **getCharPositions** | `(sec, para, lineIdx) → JSON` | 줄 내 글자별 X 경계 |
| **getCellCursorRect** | `(sec, para, ctrl, cell, cellPara, offset) → JSON` | 셀 내 캐럿 좌표 |

#### Phase 4: 고급 편집 API

| API | 시그니처 | 용도 |
|-----|---------|------|
| **searchText** | `(query, options) → JSON` | 텍스트 검색 (정규식 지원) |
| **replaceText** | `(query, replacement, options) → JSON` | 텍스트 치환 |
| **getFieldList** | `() → JSON` | 필드(누름틀) 목록 조회 |
| **setFieldValue** | `(name, value) → JSON` | 필드 값 설정 |
| **getBookmarkList** | `() → JSON` | 북마크 목록 조회 |
| **gotoBookmark** | `(name) → JSON` | 북마크 위치 반환 |
| **insertControl** | `(sec, para, offset, controlType, props) → JSON` | 컨트롤 삽입 (표/도형/이미지) |
| **deleteControl** | `(sec, para, ctrlIdx) → JSON` | 컨트롤 삭제 |
| **getCharFormatsInRange** | `(sec, para, start, end) → JSON` | 범위 내 서식 목록 (Undo용) |
| **restoreCharFormat** | `(sec, para, start, end, charShapeId) → JSON` | 서식 복원 (Undo) |

### 9.3 Rust 코어 수정 범위

#### 9.3.1 수정 필요 모듈

| 모듈 | 수정 내용 | 영향 범위 |
|------|----------|----------|
| **wasm_api.rs** | 신규 API 메서드 추가 (Phase 1~4) | 메서드 추가만 (기존 코드 변경 없음) |
| **composer.rs** | `compose_paragraph()` 단독 호출 지원 강화 | 기존 함수 시그니처 유지 |
| **pagination.rs** | `paginate_from()` 증분 페이지네이션 추가 | 신규 함수, 기존 `paginate()` 유지 |
| **height_measurer.rs** | `measure_paragraph()` public 전환 | 가시성 변경만 |
| **layout.rs** | `compute_char_positions()` 독립 호출 API | 기존 함수 재활용 |
| **model/paragraph.rs** | `get_text_range()` 추가 | 유틸 메서드 추가 |

#### 9.3.2 호환성 보장 전략

```
기존 뷰어(web/) 코드 ←→ 기존 WASM API (변경 없음)
편집기(rhwp-studio/) ←→ 기존 API + 신규 API (추가만)

원칙:
  1. 기존 API의 시그니처/동작을 절대 변경하지 않음
  2. 신규 API는 기존 내부 함수를 조합하여 구현
  3. 기존 web/ 프론트엔드는 수정 없이 동작
```

### 9.4 API 설계 원칙

| 원칙 | 설명 |
|------|------|
| **JSON 직렬화** | 모든 반환값은 JSON 문자열 (wasm-bindgen 제약) |
| **char index 기준** | 모든 위치 파라미터는 Rust char 인덱스 (UTF-16 변환은 내부 처리) |
| **중첩 경로** | 셀 내 API는 `(sec, parentPara, ctrl, cell, cellPara, ...)` 형태 |
| **오류 처리** | `Result<String, JsValue>` 반환, 실패 시 `{"ok":false,"error":"..."}` |
| **WASM + Native** | 모든 API는 WASM/Native 양쪽 구현 (테스트 용이성) |

---

## 10. 기존 코드 리팩터링 계획

### 10.1 리팩터링 목표

현재 rhwp 코어의 **배치형 파이프라인**을 편집기가 필요로 하는 **증분형 파이프라인**으로 확장한다. 핵심 원칙은 **기존 뷰어 코드를 깨뜨리지 않으면서** 증분 경로를 추가하는 것이다.

```
[현재 배치형]                          [확장: 증분형]
compose_section() (전체)         →     + compose_paragraph() (단일)
measure_section() (전체)         →     + measure_paragraph() (단일)
paginate() (전체)                →     + paginate_from() (부분)
build_render_tree() (전체)       →     + update_render_tree() (부분)
```

### 10.2 모듈별 리팩터링 상세

#### 10.2.1 Composer 리팩터링

**현재 상태**: `compose_section()` → 전체 문단 순차 처리, `compose_paragraph()` → 단일 문단 (이미 분리됨)

**변경 사항**:

| 항목 | 현재 | 변경 |
|------|------|------|
| `compose_paragraph()` 가시성 | pub (이미 공개) | 유지 |
| `identify_inline_controls()` | 모든 컨트롤 line_index=0 | 정확한 line_index 계산 |
| 캐시 지원 | 없음 | `CompositionCache` 타입 추가 |

**코드 변경**:
```rust
// 기존 (유지)
pub fn compose_section(section: &Section, ...) -> Vec<ComposedParagraph>

// 추가
pub fn compose_paragraph_cached(
    para: &Paragraph,
    cache: &mut CompositionCache,
    para_idx: usize,
    ...
) -> &ComposedParagraph {
    if let Some(cached) = cache.get(para_idx) {
        if !cache.is_dirty(para_idx) {
            return cached;
        }
    }
    let result = compose_paragraph(para, ...);
    cache.insert(para_idx, result);
    cache.mark_clean(para_idx);
    &cache[para_idx]
}
```

**난이도**: ★☆☆☆☆ (낮음) — 기존 함수를 감싸는 캐시 래퍼만 추가

#### 10.2.2 HeightMeasurer 리팩터링

**현재 상태**: `measure_section()` → 전체 문단/표 일괄 측정, `measure_paragraph()` → private

**변경 사항**:

| 항목 | 현재 | 변경 |
|------|------|------|
| `measure_paragraph()` 가시성 | private | pub 전환 |
| `measure_table()` 가시성 | private | pub 전환 |
| 캐시 지원 | 없음 | `MeasurementCache` 타입 추가 |
| 셀 측정 최적화 | `measure_table()` 내부에서 compose 호출 | 사전 compose 결과를 받는 오버로드 추가 |

**코드 변경**:
```rust
// 기존 (유지)
pub fn measure_section(...) -> MeasuredSection

// 변경: private → pub
pub fn measure_paragraph(para: &Paragraph, ...) -> MeasuredParagraph

// 추가: 캐시 활용 측정
pub fn measure_paragraph_cached(
    para: &Paragraph,
    cache: &mut MeasurementCache,
    para_idx: usize,
    ...
) -> &MeasuredParagraph {
    if let Some(cached) = cache.get(para_idx) {
        if !cache.is_dirty(para_idx) {
            return cached;
        }
    }
    let result = measure_paragraph(para, ...);
    cache.insert(para_idx, result);
    &cache[para_idx]
}
```

**난이도**: ★★☆☆☆ (낮음~중간) — 가시성 변경 + 캐시 래퍼

#### 10.2.3 Paginator 리팩터링 (핵심)

**현재 상태**: `paginate()` → 2-pass 전체 재페이지네이션 (가장 큰 병목)

**변경 사항**:

| 항목 | 현재 | 변경 |
|------|------|------|
| `paginate()` | 전체 재빌드 | 유지 (뷰어 모드용) |
| 증분 페이지네이션 | 없음 | `paginate_from()` 신규 추가 |
| 안정 페이지 감지 | 없음 | `is_stable_page()` 함수 추가 |
| 페이지 캐시 | 없음 | `PaginationCache` — 이전 페이지 결과 보존 |

**코드 변경**:
```rust
// 기존 (유지)
pub fn paginate(&self, ...) -> PaginationResult

// 추가: 증분 페이지네이션
pub fn paginate_from(
    &self,
    measured: &MeasuredSection,
    previous_result: &PaginationResult,
    from_para_idx: usize,
    ...
) -> PaginationResult {
    // 1. from_para_idx가 속한 페이지 찾기
    let affected_page = self.find_page_containing(previous_result, from_para_idx);

    // 2. 이전 페이지들 복사
    let mut new_pages = previous_result.pages[..affected_page].to_vec();

    // 3. affected_page부터 재분할
    let mut cursor = PaginationCursor::from_page_start(affected_page);
    while cursor.has_remaining() {
        let page = self.build_page(&mut cursor, measured, ...);
        new_pages.push(page);

        // 4. 안정 페이지 감지
        let old_page_idx = affected_page + new_pages.len() - 1;
        if old_page_idx < previous_result.pages.len()
            && self.is_stable_page(&page, &previous_result.pages[old_page_idx])
        {
            // 나머지 기존 페이지 재사용
            new_pages.extend_from_slice(&previous_result.pages[old_page_idx + 1..]);
            break;
        }
    }

    PaginationResult { pages: new_pages }
}

/// 안정 페이지 감지: 새 페이지와 기존 페이지의 시작점이 동일하면 안정
fn is_stable_page(&self, new_page: &PageContent, old_page: &PageContent) -> bool {
    new_page.first_paragraph_index() == old_page.first_paragraph_index()
        && new_page.first_line_index() == old_page.first_line_index()
}
```

**난이도**: ★★★★☆ (높음) — 기존 2-pass 로직을 증분으로 변환하면서 표 분할, 각주, 다단 등 특수 케이스 처리 필요

#### 10.2.4 LayoutEngine 리팩터링

**현재 상태**: `build_render_tree()` → 전체 페이지의 렌더 트리 생성

**변경 사항**: LayoutEngine 자체의 변경은 최소화. 증분 레이아웃은 TypeScript 측에서 제어하고, WASM API를 통해 필요한 데이터만 요청한다.

| 항목 | 현재 | 변경 |
|------|------|------|
| `build_render_tree()` | 전체 페이지 | 유지 (단일 페이지 단위로 이미 동작) |
| `compute_char_positions()` | private-like | 독립 API로 노출 |
| 레이아웃 메타데이터 | TextRunNode에 이미 포함 | 유지 |

**난이도**: ★☆☆☆☆ (낮음) — 기존 구조가 이미 페이지 단위로 동작

### 10.3 증분 렌더링 컨텍스트

리팩터링 후 증분 렌더링을 지원하기 위한 공유 상태:

```rust
/// 증분 렌더링 컨텍스트 (wasm_api.rs에 추가)
pub struct EditState {
    /// 문단별 구성 캐시 (para_index → ComposedParagraph)
    pub composed_cache: HashMap<usize, ComposedParagraph>,

    /// 문단별 측정 캐시 (para_index → MeasuredParagraph)
    pub measured_cache: HashMap<usize, MeasuredParagraph>,

    /// 마지막 페이지네이션 결과
    pub pagination_cache: Option<PaginationResult>,

    /// dirty 문단 집합
    pub dirty_paragraphs: HashSet<usize>,

    /// dirty 페이지 시작점 (이 인덱스부터 재페이지네이션 필요)
    pub dirty_pages_from: Option<usize>,
}

impl EditState {
    pub fn mark_paragraph_dirty(&mut self, para_idx: usize) {
        self.dirty_paragraphs.insert(para_idx);
        self.composed_cache.remove(&para_idx);
        self.measured_cache.remove(&para_idx);
    }

    pub fn invalidate_pages_from(&mut self, page_idx: usize) {
        self.dirty_pages_from = Some(
            self.dirty_pages_from.map_or(page_idx, |p| p.min(page_idx))
        );
    }

    pub fn is_dirty(&self) -> bool {
        !self.dirty_paragraphs.is_empty() || self.dirty_pages_from.is_some()
    }
}
```

### 10.4 뷰어(web/) 호환성 유지 방안

```
[호환성 보장 원칙]

1. 기존 API 시그니처 불변
   - renderPageSvg, renderPageHtml, renderPageCanvas 등 기존 메서드 유지
   - 파라미터/반환값 변경 없음

2. 기존 내부 로직 경로 유지
   - compose_section() → paginate() → build_render_tree() 경로 그대로 유지
   - 새 API는 별도 경로 (compose_paragraph_cached → paginate_from → ...)

3. 뷰어 코드 수정 불필요
   - web/index.html, web/js/ 등 기존 뷰어 코드는 변경 없이 동작
   - rhwp-studio는 완전히 별도 프로젝트

4. WASM 빌드 호환
   - pkg/ 산출물 구조 유지 (rhwp_bg.wasm + rhwp.js)
   - 새 API가 추가되어도 기존 import는 그대로 동작
```

### 10.5 단계적 마이그레이션 순서

```
Phase 1: 기반 구축 (1주)
┌─────────────────────────────────────────────────────┐
│ - CompositionCache, MeasurementCache 타입 정의       │
│ - EditState 구조체 추가                              │
│ - measure_paragraph() public 전환                    │
│ - Phase 1 WASM API 추가 (getTextRange 등 7개)       │
│ - 기존 테스트 통과 확인                              │
└─────────────────────────────────────────────────────┘
                    ↓
Phase 2: 증분 레이아웃 (2주)
┌─────────────────────────────────────────────────────┐
│ - compose_paragraph_cached() 구현                    │
│ - measure_paragraph_cached() 구현                    │
│ - paginate_from() 구현                               │
│ - is_stable_page() 구현                              │
│ - Phase 2 WASM API 추가 (recomposeParagraph 등 6개) │
│ - 성능 벤치마크 (16ms 예산 검증)                     │
└─────────────────────────────────────────────────────┘
                    ↓
Phase 3: 커서/히트 테스팅 (1주)
┌─────────────────────────────────────────────────────┐
│ - identify_inline_controls() 정확한 위치 계산 수정    │
│ - hit_test() WASM 구현                               │
│ - get_cursor_rect() 구현                             │
│ - Phase 3 WASM API 추가 (hitTest 등 6개)            │
└─────────────────────────────────────────────────────┘
                    ↓
Phase 4: 고급 기능 (1~2주)
┌─────────────────────────────────────────────────────┐
│ - searchText/replaceText 구현                        │
│ - 필드/북마크 API 구현                               │
│ - insertControl/deleteControl 구현                   │
│ - Phase 4 WASM API 추가 (searchText 등 10개)        │
│ - 전체 회귀 테스트                                   │
└─────────────────────────────────────────────────────┘
```

### 10.6 리팩터링 위험도 평가

| 모듈 | 변경 규모 | 호환성 위험 | 성능 위험 | 전체 위험도 |
|------|----------|-----------|----------|-----------|
| **composer.rs** | 소 (캐시 래퍼) | 없음 | 없음 | ★☆☆☆☆ |
| **height_measurer.rs** | 소 (가시성+캐시) | 없음 | 없음 | ★☆☆☆☆ |
| **pagination.rs** | 대 (증분 로직) | 없음 (신규 함수) | 중 (복잡 로직) | ★★★☆☆ |
| **layout.rs** | 소 (API 노출) | 없음 | 없음 | ★☆☆☆☆ |
| **wasm_api.rs** | 중 (API 추가) | 없음 (추가만) | 소 (메서드별) | ★★☆☆☆ |
| **model/*.rs** | 소 (유틸 추가) | 없음 | 없음 | ★☆☆☆☆ |

**전체 리팩터링 위험도**: ★★☆☆☆ (낮음) — 모든 변경이 추가 기반이며, 기존 코드 경로를 수정하지 않음

### 10.7 테스트 전략

```
[기존 테스트 유지]
- cargo test: 모든 기존 유닛 테스트 통과 확인
- WASM 빌드: wasm-pack test 통과
- 뷰어 회귀: 기존 web/ 뷰어에서 렌더링 결과 비교

[신규 테스트 추가]
- compose_paragraph_cached: 캐시 적중/미적중 테스트
- paginate_from: 증분 결과 == 전체 결과 비교 테스트
- is_stable_page: 안정 페이지 감지 정확성
- 성능 벤치마크: 1000 문단 문서에서 중간 문단 편집 → 응답 시간 측정
- IME 통합: compositionupdate 연속 발생 시 레이아웃 정확성

[성능 목표]
- 단일 문단 편집: < 16ms (60fps)
- 100페이지 문서 중간 편집: 재페이지네이션 < 50ms
- 1000문단 문서: 캐시 워밍업 후 편집 < 10ms
```
