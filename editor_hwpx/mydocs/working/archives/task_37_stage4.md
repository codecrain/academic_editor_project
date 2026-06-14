# 타스크 37 - 4단계 완료 보고서: HTML 붙여넣기 파싱

## 구현 내용

### 1. WASM 측 — HTML 붙여넣기 API (2개 네이티브 + 2개 WASM 바인딩)

| 네이티브 메서드 | WASM 바인딩 | 설명 |
|----------------|------------|------|
| `paste_html_native()` | `pasteHtml` | 본문 캐럿 위치에 HTML 삽입 |
| `paste_html_in_cell_native()` | `pasteHtmlInCell` | 셀 내부 캐럿 위치에 HTML 삽입 |

### 2. HTML 파서 (`parse_html_to_paragraphs`)

외부 크레이트 없이 직접 구현한 최소 HTML 파서:

#### 지원 태그

| 태그 | 처리 방식 |
|------|-----------|
| `<p>` | 문단 생성, `style` 속성에서 ParaShape 생성 |
| `<span>` | 인라인 스타일 → CharShape 생성, 텍스트 세그먼트 분리 |
| `<b>`, `<strong>` | 볼드 상속 플래그 |
| `<i>`, `<em>` | 이탤릭 상속 플래그 |
| `<u>` | 밑줄 상속 플래그 |
| `<br>` | 문단 구분 |
| `<table>` | 행/열 파싱 → 탭 구분 텍스트 (행당 1문단) |
| `<img>` | base64 data URI → BinData + Picture Control 생성 |
| `<div>` | 내부 콘텐츠 재귀 파싱 |
| `<!--StartFragment-->` / `<!--EndFragment-->` | 클립보드 영역 추출 |

#### 파싱 전략

```
HTML 입력
  → StartFragment/EndFragment 영역 추출 (없으면 body 또는 전체)
  → 최상위 태그 순회
    → <p>: 문단 생성 + 인라인 콘텐츠 파싱
    → <table>: 행/열 추출 → 텍스트 문단
    → <img>: base64 디코딩 → BinData + Picture
    → <div>: 재귀 파싱
    → 나머지 텍스트: 줄바꿈 기준 문단 분리
  → 빈 결과 시 플레인 텍스트 fallback
```

### 3. CSS → HWP 스타일 매핑

#### CharShape 매핑 (`css_to_char_shape_id`)

| CSS 속성 | HWP CharShape 필드 | 변환 |
|----------|-------------------|------|
| `font-family` | `font_ids[0..7]` | 폰트 이름 → DocInfo.font_faces에서 ID 검색 |
| `font-size` | `base_size` | pt → HWPUNIT (1pt = 100) |
| `font-weight:bold` / `700` | `bold` | boolean |
| `font-style:italic` | `italic` | boolean |
| `color` | `text_color` | CSS hex/rgb → HWP BGR |
| `text-decoration:underline` | `underline_type` | → `UnderlineType::Bottom` |
| `text-decoration:line-through` | `strikethrough` | boolean |

- 동일 CharShape 존재 시 재사용, 없으면 신규 생성
- 기본 CharShape(ID 0)를 복제하여 수정

#### ParaShape 매핑 (`css_to_para_shape_id`)

| CSS 속성 | HWP ParaShape 필드 | 변환 |
|----------|-------------------|------|
| `text-align` | `alignment` | left/right/center/justify |
| `line-height` | `line_spacing` + `line_spacing_type` | % → Percent, px → Fixed |

### 4. JS 측 — 붙여넣기 경로 변경

#### handlePaste() 흐름 (변경됨)

```
handlePaste()
  → 선택 범위 삭제 (기존)
  → 내부 클립보드 확인 (기존)
  → 브라우저 클립보드 읽기 (변경)
    → navigator.clipboard.read()
      → text/html 포맷 확인 → pasteFromHtml(html)
      → 없으면 readText() → handleTextInsert(text)
    → clipboard.read() 미지원 시 readText() fallback
```

#### 신규 함수

| 함수 | 설명 |
|------|------|
| `pasteFromHtml(html)` | HTML → WASM `pasteHtml()`/`pasteHtmlInCell()` 호출, 재렌더링 + 캐럿 복원 |

- 셀 내부/본문 자동 감지 (`_hasCellCtx`)
- WASM 호출 실패 시 플레인 텍스트 fallback (`html.replace(/<[^>]*>/g, '')`)

### 5. 유틸리티 함수 (Rust)

| 함수 | 설명 |
|------|------|
| `find_char()` | char 배열에서 문자 검색 |
| `find_closing_tag()` | 중첩 고려 닫는 태그 위치 검색 |
| `parse_inline_style()` | HTML 태그에서 style 속성 추출 |
| `parse_css_value()` | CSS 속성값 추출 |
| `parse_pt_value()` | pt/px/em 값 파싱 |
| `css_color_to_hwp_bgr()` | CSS hex/rgb/이름 → HWP BGR |
| `decode_html_entities()` | HTML 엔티티 디코딩 |
| `html_strip_tags()` | HTML 태그 제거 |
| `html_to_plain_text()` | HTML → 플레인 텍스트 |
| `parse_html_attr_f64()` | HTML 속성에서 숫자값 추출 |

### 6. 색상 변환 지원

| 입력 형식 | 예시 | 지원 |
|----------|------|------|
| CSS hex (6자리) | `#ff0000` | O |
| CSS hex (3자리) | `#f00` | O |
| CSS rgb() | `rgb(255, 0, 0)` | O |
| 색상 이름 | `black`, `white`, `red`, `green`, `blue`, `yellow` | O |

## 테스트 결과

- 기존 테스트: 424 통과
- 신규 HTML 붙여넣기 테스트: 5 통과
- **총 429 테스트 통과**
- WASM 빌드: 성공

### 신규 테스트 항목

| 테스트 | 검증 내용 |
|--------|-----------|
| `test_paste_html_plain_text` | `<p>` 태그 HTML 붙여넣기, 기존 텍스트에 삽입 확인 |
| `test_paste_html_styled_text` | 볼드+색상 스타일 HTML, CharShape 생성 확인 |
| `test_paste_html_multi_paragraph` | 다중 `<p>` 태그 → 다중 문단 생성 확인 |
| `test_paste_html_table_as_text` | `<table>` HTML → 텍스트 변환 삽입 확인 |
| `test_html_utility_functions` | 유틸리티 함수 단위 테스트 (엔티티 디코딩, 태그 제거, CSS 파싱, 색상 변환) |

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `src/wasm_api.rs` | WASM 바인딩 2개, 네이티브 API 2개, HTML 파서, CSS→스타일 매핑, 유틸리티 함수 10개, 테스트 5개 |
| `web/editor.js` | `handlePaste()` HTML 우선 경로, `pasteFromHtml()` 함수 추가 |
