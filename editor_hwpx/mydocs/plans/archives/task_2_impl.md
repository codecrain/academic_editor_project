# 타스크 2 - 구현 계획서: 뷰어 렌더링 엔진 설계

## 단계 구성 (5단계)

### 1단계: 렌더링 백엔드 선정 및 아키텍처 설계 문서 작성

- 3개 방안(ThorVG, 순수 Rust, Canvas API) 비교 검증
- 최종 백엔드 선정 및 근거 문서화
- 전체 렌더링 파이프라인 아키텍처 설계
- 설계 문서 작성: `mydocs/tech/rendering_engine_design.md`

### 2단계: 중간 표현(IR) 데이터 모델 설계 및 구현

- HWP 문서의 중간 표현을 위한 Rust 구조체 설계
- `src/model/` 모듈 생성
  - `document.rs` - 문서 전체 구조 (Document, Section, SectionDef)
  - `paragraph.rs` - 문단 (Paragraph, CharShape, ParaShape, CharRun)
  - `table.rs` - 표 (Table, Cell, Row)
  - `shape.rs` - 그리기 개체 (Shape, Line, Rect, Ellipse, Arc, Polygon, Curve, Group, TextBox)
  - `image.rs` - 그림 개체 (Picture, ImageData, CropInfo)
  - `style.rs` - 스타일 정보 (Font, Color, Border, Fill, Gradient)
  - `page.rs` - 페이지 레이아웃 (PageDef, Margin, PageBorderFill, Column)
  - `header_footer.rs` - 머리말/꼬리말 (Header, Footer)
  - `footnote.rs` - 각주/미주 (Footnote, Endnote)
  - `control.rs` - 인라인 컨트롤 (Ruby, Caption, Hyperlink, Field, Bookmark)
  - `bin_data.rs` - 바이너리 데이터 (BinData, 이미지/OLE 참조)

### 3단계: 렌더 트리 설계 및 구현

- IR → 렌더 트리 변환 구조 설계
- `src/renderer/` 모듈 생성
  - `render_tree.rs` - 렌더 트리 노드 (RenderNode, Box Model)
  - `layout.rs` - 레이아웃 계산 (페이지 분할, 텍스트 배치, 표 레이아웃)
  - `mod.rs` - 렌더러 트레이트 정의

### 4단계: WASM ↔ JavaScript 인터페이스 설계

- `src/lib.rs`에 WASM 공개 API 정의
  - `load_document(bytes)` - HWP 파일 로드
  - `get_page_count()` - 페이지 수 조회
  - `render_page(page_num)` - 페이지 렌더링
- 렌더링 출력 포맷 정의 (렌더 커맨드 또는 픽셀 데이터)
- TypeScript 타입 정의 설계

### 5단계: 빌드 검증 및 설계 문서 최종화

- 전체 모듈 구조 컴파일 확인 (Docker 환경)
- 단위 테스트 작성 및 실행
- 설계 문서 최종 검토 및 보완

## 상태

- 작성일: 2026-02-05
- 상태: 승인 완료
