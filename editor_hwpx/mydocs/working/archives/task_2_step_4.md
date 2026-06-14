# 타스크 2 - 4단계 완료 보고서: WASM ↔ JavaScript 인터페이스 설계

## 수행 내용

### 생성/수정된 파일

| 파일 | 설명 |
|------|------|
| `src/wasm_api.rs` | WASM 공개 API (HwpDocument, HwpViewer, HwpError) |
| `src/main.rs` | CLI 명령어 (export-svg, info) |
| `src/lib.rs` | wasm_api 모듈 등록 |
| `typescript/rhwp.d.ts` | TypeScript 타입 정의 설계 문서 |
| `CLAUDE.md` | 빌드/실행 가이드, output/ 폴더 설명 추가 |
| `.gitignore` | output/ 폴더 제외 추가 |

### WASM 공개 API 설계

#### HwpDocument (문서 객체)

| 메서드 | JS 이름 | 반환 타입 | 설명 |
|--------|---------|----------|------|
| `new(data)` | `constructor` | `HwpDocument` | HWP 바이트 로드 |
| `create_empty()` | `createEmpty` | `HwpDocument` | 빈 문서 생성 |
| `page_count()` | `pageCount` | `u32` | 페이지 수 |
| `render_page_svg(n)` | `renderPageSvg` | `String` | SVG 렌더링 |
| `render_page_html(n)` | `renderPageHtml` | `String` | HTML 렌더링 |
| `render_page_canvas(n)` | `renderPageCanvas` | `u32` | Canvas 명령 수 |
| `get_page_info(n)` | `getPageInfo` | `String(JSON)` | 페이지 정보 |
| `get_document_info()` | `getDocumentInfo` | `String(JSON)` | 문서 정보 |
| `set_dpi(dpi)` | `setDpi` | `void` | DPI 설정 |
| `get_dpi()` | `getDpi` | `f64` | DPI 조회 |
| `set_fallback_font(path)` | `setFallbackFont` | `void` | 대체 폰트 설정 |
| `get_fallback_font()` | `getFallbackFont` | `String` | 대체 폰트 경로 |

#### HwpViewer (뷰어 컨트롤러)

| 메서드 | JS 이름 | 설명 |
|--------|---------|------|
| `new(doc)` | `constructor` | 뷰어 생성 (문서 소유권 이전) |
| `update_viewport(...)` | `updateViewport` | 뷰포트 업데이트 |
| `set_zoom(zoom)` | `setZoom` | 줌 설정 |
| `visible_pages()` | `visiblePages` | 보이는 페이지 목록 |
| `pending_task_count()` | `pendingTaskCount` | 대기 렌더링 작업 수 |
| `page_count()` | `pageCount` | 페이지 수 |
| `render_page_svg(n)` | `renderPageSvg` | SVG 렌더링 |
| `render_page_html(n)` | `renderPageHtml` | HTML 렌더링 |

### 에러 처리 구조

```
HwpError (네이티브, non-WASM 안전)
  ├── InvalidFile(String)
  ├── PageOutOfRange(u32)
  └── RenderError(String)

impl From<HwpError> for JsValue  ← WASM 경계에서만 변환
```

- WASM 함수: `Result<T, JsValue>` 반환 (wasm-bindgen 요구사항)
- 네이티브 함수(`*_native`): `Result<T, HwpError>` 반환 (테스트/CLI 사용)

### 폰트 Fallback 설계

- 기본 대체 폰트: `/usr/share/fonts/truetype/nanum/NanumGothic.ttf`
- `setFallbackFont(path)` API로 런타임 변경 가능
- 문서 정보 JSON에 현재 설정된 fallback 폰트 경로 포함
- 향후 실제 폰트 렌더링 시 fallback 체인 구현 예정

### CLI 명령어

```bash
rhwp export-svg <파일.hwp> [--output <폴더>] [--page <번호>]
rhwp info <파일.hwp>
rhwp --version
rhwp --help
```

- SVG 내보내기 기본 출력 폴더: `output/`
- `.gitignore`에 `output/` 등록 완료

### TypeScript 타입 정의

- `typescript/rhwp.d.ts`: 완전한 타입 정의 설계 문서
- `HwpDocument`, `HwpViewer` 클래스 타입
- `PageInfo`, `DocumentInfo` 인터페이스 정의
- wasm-pack이 자동 생성하는 `pkg/rhwp.d.ts`를 보완

### 빌드 검증 결과

| 빌드 대상 | 결과 |
|----------|------|
| 네이티브 (cargo build) | 성공 |
| 테스트 (cargo test) | **88개 통과** (3단계 76개 → 4단계 88개, +12개) |
| WASM (wasm-pack build) | 성공 |

### 추가된 테스트 (12개)

| 테스트 | 검증 내용 |
|--------|----------|
| test_create_empty_document | 빈 문서 생성, 페이지 수 1 |
| test_empty_document_info | 문서 정보 JSON 형식 |
| test_render_empty_page_svg | 빈 페이지 SVG 출력 |
| test_render_empty_page_html | 빈 페이지 HTML 출력 |
| test_page_info | 페이지 정보 JSON |
| test_page_out_of_range | 범위 초과 에러 처리 |
| test_document_with_paragraphs | 문단 포함 문서 SVG 렌더링 |
| test_set_dpi | DPI 설정/조회 |
| test_fallback_font | 대체 폰트 설정/조회 |
| test_viewer_creation | 뷰어 생성 |
| test_viewer_viewport_update | 뷰포트 업데이트 |
| test_hwp_error_display | 에러 메시지 포맷 |

## 상태

- 완료일: 2026-02-05
- 상태: 승인 완료
