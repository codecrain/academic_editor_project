# 타스크 2 - 3단계 완료 보고서: 렌더 트리 설계 및 구현

## 수행 내용

### 생성된 모듈 구조

`src/renderer/` 하위에 8개 파일 생성:

| 파일 | 주요 구조체/트레이트 | 설명 |
|------|---------------------|------|
| `mod.rs` | Renderer(trait), RenderBackend, TextStyle, ShapeStyle, LineStyle, PathCommand | 렌더러 공통 트레이트 및 타입 |
| `render_tree.rs` | RenderNode, RenderNodeType(18종), BoundingBox, PageRenderTree | 렌더 트리 노드 모델 |
| `page_layout.rs` | PageLayoutInfo, LayoutRect | 페이지 레이아웃 계산 (HWPUNIT→px) |
| `pagination.rs` | Paginator, PaginationResult, PageContent, PageItem | 페이지 분할 엔진 |
| `layout.rs` | LayoutEngine | 레이아웃 엔진 (렌더 트리 생성) |
| `scheduler.rs` | RenderScheduler, RenderObserver(trait), RenderWorker(trait), RenderTask | Observer+Worker 패턴 스케줄러 |
| `canvas.rs` | CanvasRenderer | Canvas 2D 백엔드 (1차) |
| `svg.rs` | SvgRenderer | SVG 백엔드 (2차) |
| `html.rs` | HtmlRenderer | HTML DOM 백엔드 (3차) |

### 핵심 설계 사항

#### 1. Renderer Trait (멀티 백엔드 추상화)

```rust
pub trait Renderer {
    fn begin_page(&mut self, width: f64, height: f64);
    fn end_page(&mut self);
    fn draw_text(&mut self, text: &str, x: f64, y: f64, style: &TextStyle);
    fn draw_rect(&mut self, x: f64, y: f64, w: f64, h: f64, style: &ShapeStyle);
    fn draw_line(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, style: &LineStyle);
    fn draw_ellipse(&mut self, cx: f64, cy: f64, rx: f64, ry: f64, style: &ShapeStyle);
    fn draw_image(&mut self, data: &[u8], x: f64, y: f64, w: f64, h: f64);
    fn draw_path(&mut self, commands: &[PathCommand], style: &ShapeStyle);
}
```

- 8개 핵심 렌더링 메서드로 추상화
- Canvas, SVG, HTML 3개 백엔드가 동일 트레이트 구현

#### 2. 렌더 트리 + Observer 패턴 (Dirty Flag)

- `RenderNode`에 `dirty: bool` 필래그 내장
- `invalidate()`: 변경된 노드 마킹
- `mark_clean()` / `mark_clean_recursive()`: 렌더링 완료 후 초기화
- `has_dirty_nodes()`: 재렌더링 필요 여부 판별
- `BoundingBox`에 `intersects()`, `contains()`: 뷰포트 컬링 지원

#### 3. RenderScheduler (Observer + Worker 패턴)

- **RenderObserver 트레이트**: 뷰포트 변경, 줌 변경, 콘텐츠 변경 이벤트 감지
- **RenderWorker 트레이트**: 실제 렌더링 작업 수행 및 캐시 관리
- **RenderScheduler**: Observer와 Worker를 연결
  - 3단계 우선순위: Immediate(현재 뷰포트) → Prefetch(인접 페이지) → Background
  - 작업 큐 기반 스케줄링
  - `Viewport` 기반 보이는 페이지 계산
  - 프리페치 범위 설정 (기본 ±2페이지)
  - 작업 생명주기 관리 (Pending → InProgress → Completed/Cancelled)

#### 4. 렌더링 파이프라인

```
IR(Document Model)
    → Paginator (페이지 분할)
    → LayoutEngine (렌더 트리 생성)
    → RenderScheduler (우선순위 스케줄링)
    → Renderer 백엔드 (Canvas/SVG/HTML 출력)
```

#### 5. HWPUNIT ↔ 픽셀 변환

- `hwpunit_to_px(hwpunit, dpi)`: 1인치=7200 HWPUNIT, 기본 96 DPI
- `px_to_hwpunit(px, dpi)`: 역변환
- `LayoutRect::from_hwpunit_rect()`: 영역 일괄 변환
- `BoundingBox::from_hwpunit_rect()`: 렌더 트리 노드용 변환

### 렌더 노드 종류 (18종)

| 노드 타입 | 설명 |
|-----------|------|
| Page | 페이지 루트 |
| PageBackground | 페이지 배경/테두리 |
| Header | 머리말 영역 |
| Footer | 꼬리말 영역 |
| Body | 본문 영역 |
| Column | 단(다단) 영역 |
| FootnoteArea | 각주 영역 |
| TextLine | 텍스트 줄 |
| TextRun | 텍스트 런 (동일 글자 모양) |
| Table | 표 |
| TableCell | 표 셀 |
| Line | 직선 |
| Rectangle | 사각형 |
| Ellipse | 타원 |
| Path | 패스 (다각형/곡선/호) |
| Image | 이미지 |
| Group | 묶음 개체 |

### 빌드 검증 결과

| 빌드 대상 | 결과 |
|----------|------|
| 네이티브 (cargo build) | 성공 |
| 테스트 (cargo test) | **76개 통과** (2단계 32개 → 3단계 76개, +44개) |
| WASM (wasm-pack build) | 성공 |

### 추가된 테스트 (44개)

| 모듈 | 테스트 수 | 주요 검증 내용 |
|------|----------|--------------|
| renderer::mod | 4 | 백엔드 파싱, HWPUNIT↔px 변환, A4 크기 |
| renderer::render_tree | 5 | BoundingBox 교차/포함, dirty 플래그, HWPUNIT 변환 |
| renderer::page_layout | 3 | 단일 단/2단 레이아웃, 본문 높이 |
| renderer::pagination | 4 | 빈 문서, 단일 문단, 페이지 오버플로, DPI |
| renderer::layout | 3 | 빈 페이지, 문단 포함 페이지, bbox 변환 |
| renderer::scheduler | 8 | 우선순위, 작업 생성, 뷰포트, 스케줄링, 무효화, Observer |
| renderer::canvas | 5 | 기본 렌더링, 사각형, 패스, 색상 변환, 트리 렌더링 |
| renderer::svg | 6 | SVG 생성, 텍스트, 사각형, 패스, XML 이스케이프, 색상 |
| renderer::html | 5 | HTML 생성, 텍스트, 사각형, HTML 이스케이프, 트리 렌더링 |

## 상태

- 완료일: 2026-02-05
- 상태: 승인 완료
