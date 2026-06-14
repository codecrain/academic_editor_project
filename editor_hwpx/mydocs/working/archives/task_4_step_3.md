# 타스크 4 - 3단계 완료 보고서: 레이아웃 파이프라인 + 텍스트 렌더링

## 구현 내용

### 수정 파일

| 파일 | 변경 | 역할 |
|------|------|------|
| `src/renderer/layout.rs` | 전체 재작성 (~410줄) | LayoutEngine 확장: ComposedParagraph + ResolvedStyleSet 기반 레이아웃 |
| `src/renderer/composer.rs` | +5줄 수정 | `char_count=0` 엣지케이스 대응 (텍스트 길이 기반 추정) |
| `src/renderer/pagination.rs` | +15줄 추가 | 인라인 컨트롤(표/도형) 감지 → PageItem::Table/Shape 생성 |
| `src/wasm_api.rs` | ~30줄 수정 | 파이프라인 연결: styles/composed 필드 추가, 전체 흐름 통합 |
| `src/renderer/svg.rs` | +3줄 추가 | letter-spacing SVG 속성 출력 |

### 핵심 변경 사항

**1. LayoutEngine 확장 (layout.rs)**

시그니처 변경:
```rust
// 이전
build_render_tree(&self, page_content, paragraphs) -> PageRenderTree

// 변경 후
build_render_tree(&self, page_content, paragraphs, composed, styles) -> PageRenderTree
```

새 함수:
- `layout_composed_paragraph()` - ComposedParagraph 기반 레이아웃 (메인 경로)
- `layout_raw_paragraph()` - 원본 Paragraph 기반 레이아웃 (fallback)
- `resolved_to_text_style()` - ResolvedCharStyle → TextStyle 변환
- `estimate_text_width()` - 폰트 메트릭 없이 문자 종류 기반 텍스트 폭 추정
- `is_cjk_char()` - CJK/한글 문자 판별

레이아웃 로직:
```
ComposedParagraph.lines 순회
  ├─ 문단 스타일에서 margin_left/margin_right 적용
  ├─ 각 ComposedLine에서:
  │   ├─ TextLine 노드 생성 (line_height, baseline)
  │   └─ 각 ComposedTextRun에서:
  │       ├─ ResolvedCharStyle → TextStyle 변환
  │       ├─ 텍스트 폭 추정 (CJK: font_size, Latin: font_size*0.5)
  │       └─ TextRun 노드 생성 (x좌표 순차 배치)
  └─ y좌표 누적
```

**2. 파이프라인 통합 (wasm_api.rs)**

HwpDocument에 추가된 필드:
- `styles: ResolvedStyleSet` - 해소된 스타일 세트
- `composed: Vec<Vec<ComposedParagraph>>` - 구역별 구성된 문단

데이터 흐름:
```
from_bytes() / set_document()
  ├─ resolve_styles(doc_info, dpi) → styles
  ├─ compose_section(section) → composed (각 구역별)
  └─ paginate() → pagination

build_page_tree(page_num)
  ├─ find_page() → (page_content, paragraphs, composed)
  └─ build_render_tree(page_content, paragraphs, composed, &styles)
      └─ SvgRenderer.render_tree() → SVG String
```

**3. 인라인 컨트롤 감지 (pagination.rs)**

문단 순회 시 `controls` 배열에서 Table/Shape 감지:
- `Control::Table` → `PageItem::Table` 생성
- `Control::Shape`/`Control::Picture` → `PageItem::Shape` 생성

**4. SVG letter-spacing (svg.rs)**

TextStyle.letter_spacing 값이 0이 아닌 경우 `<text>` 요소에 `letter-spacing` 속성 추가.

### 버그 수정

**composer.rs char_count=0 문제**
- 문제: 테스트에서 `Paragraph { text: "텍스트", ..Default::default() }` 생성 시 `char_count=0`
- 원인: `compose_lines`에서 마지막 줄의 utf16_end를 `para.char_count`로 계산 → 0이면 빈 줄 생성
- 수정: `char_count=0`일 때 `text.chars().count() + 1`로 추정

## 테스트 결과

| 항목 | 결과 |
|------|------|
| 전체 테스트 | **207개 통과** (202 기존 + 5 신규) |
| 빌드 | 성공 (경고 0개) |

### 신규 테스트 (5개)

| 테스트 | 검증 내용 |
|--------|----------|
| test_layout_with_composed_styles | ComposedParagraph + ResolvedStyleSet으로 다중 TextRun 생성 및 스타일(폰트명/크기/볼드/이탤릭/색상) 검증 |
| test_layout_multi_run_x_position | TextRun x좌표 순차 배치 검증 (Latin + CJK 혼합) |
| test_resolved_to_text_style | ResolvedCharStyle → TextStyle 변환 정확성 (폰트/크기/볼드/밑줄/자간) |
| test_resolved_to_text_style_missing_id | 존재하지 않는 style_id에 대한 기본값 반환 |
| test_estimate_text_width | 텍스트 폭 추정 (Latin/CJK/혼합) |

### 기존 테스트 호환

| 테스트 | 변경 내용 |
|--------|----------|
| test_build_empty_page | `build_render_tree()` 호출에 `&[], &ResolvedStyleSet::default()` 파라미터 추가 |
| test_build_page_with_paragraph | `compose_paragraph()` 호출 추가, composed 데이터 전달 |

## 상태

- 완료일: 2026-02-06
- 상태: 승인 완료
