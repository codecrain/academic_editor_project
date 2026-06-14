# 타스크 37 최종 결과 보고서: 클립보드 복사 및 붙여넣기 기능 구현

## 개요

HWP 웹 에디터에 클립보드 복사(Ctrl+C), 잘라내기(Ctrl+X), 붙여넣기(Ctrl+V) 기능을 구현했다. 내부 서식 보존 복사/붙여넣기, 브라우저 Clipboard API를 통한 외부 앱 연동, HTML 포맷 기반 서식 텍스트 교환을 지원한다.

## 구현 단계 요약

### 1단계: 내부 클립보드 인프라 (WASM)

| 항목 | 내용 |
|------|------|
| IR 구조체 Clone 지원 | 7개 모델 파일, 19개 구조체에 `Clone` derive 추가 |
| ClipboardData 구조체 | `paragraphs: Vec<Paragraph>`, `plain_text: String` |
| 네이티브 API 8개 | has/get/clear_clipboard, copy_selection, copy_selection_in_cell, copy_control, paste_internal, paste_internal_in_cell |
| WASM 바인딩 8개 | 각 네이티브 API에 대응하는 JS 바인딩 |
| 복사 전략 | 단일 문단 부분 선택 (split_at), 다중 문단, 컨트롤 객체 복사 |
| 붙여넣기 전략 | 단일 문단 텍스트 삽입 (서식 보존), 다중 문단/컨트롤 split-merge |
| 테스트 | 신규 5개, 총 421 통과 |

### 2단계: 플레인 텍스트 붙여넣기 (JS)

| 항목 | 내용 |
|------|------|
| Ctrl+C/V/X 키 바인딩 | editor.js 키다운 핸들러 |
| handleCopyToInternal() | 객체/본문/셀 선택 → 내부 WASM 클립보드 |
| handlePaste() | 내부 클립보드 우선 → 브라우저 클립보드 fallback |
| handleCut() | 복사 + 삭제 + 재렌더링 |
| 다중 문단 선택 지원 | text_selection.js의 getSelectionDocRange() 확장 |
| 테스트 | 421 통과, WASM 빌드 성공 |

### 3단계: 서식 텍스트 복사 — HTML 생성

| 항목 | 내용 |
|------|------|
| 네이티브 API 3개 | export_selection_html, export_selection_in_cell_html, export_control_html |
| WASM 바인딩 3개 | 각 네이티브 API에 대응하는 JS 바인딩 |
| HTML 생성 헬퍼 7개 | char_style_to_css, para_style_to_css, paragraph_to_html, get_char_style_ranges, table_to_html, picture_to_html, apply_border_fill_css |
| 유틸리티 함수 4개 | utf16_pos_to_char_idx, clipboard_color_to_css, clipboard_escape_html, detect_clipboard_image_mime |
| ClipboardItem API | text/html + text/plain 동시 등록 |
| 지원 형식 | 서식 텍스트 (`<p><span>`), 표 (`<table>`), 이미지 (`<img data:base64>`) |
| 테스트 | 신규 3개, 총 424 통과 |

### 4단계: HTML 붙여넣기 파싱

| 항목 | 내용 |
|------|------|
| 네이티브 API 2개 | paste_html, paste_html_in_cell |
| WASM 바인딩 2개 | pasteHtml, pasteHtmlInCell |
| HTML 파서 | 외부 크레이트 없이 직접 구현, StartFragment/EndFragment 지원 |
| 지원 태그 | `<p>`, `<span>`, `<b>/<strong>`, `<i>/<em>`, `<u>`, `<br>`, `<table>`, `<img>`, `<div>` |
| CSS → CharShape | font-family, font-size(pt→HWPUNIT), bold, italic, color(CSS→BGR), underline, strikethrough |
| CSS → ParaShape | text-align, line-height |
| 유틸리티 함수 10개 | find_char, find_closing_tag, parse_inline_style, parse_css_value, parse_pt_value, css_color_to_hwp_bgr, decode_html_entities, html_strip_tags, html_to_plain_text, parse_html_attr_f64 |
| JS 측 | handlePaste()에 HTML 우선 경로, pasteFromHtml() 추가 |
| 테스트 | 신규 5개, 총 429 통과 |

## 수정 파일 총괄

| 파일 | 단계 | 변경 내용 |
|------|------|-----------|
| `src/model/paragraph.rs` | 1 | Clone derive 추가 |
| `src/model/control.rs` | 1 | Clone derive 추가 |
| `src/model/table.rs` | 1 | Clone derive 추가 |
| `src/model/image.rs` | 1 | Clone derive 추가 |
| `src/model/shape.rs` | 1 | Clone derive 추가 |
| `src/model/header_footer.rs` | 1 | Clone derive 추가 |
| `src/model/footnote.rs` | 1 | Clone derive 추가 |
| `src/wasm_api.rs` | 1-4 | 클립보드 버퍼, 네이티브 API 13개, WASM 바인딩 13개, HTML 생성/파싱, 스타일 매핑, 유틸리티 함수 14개, 테스트 13개 |
| `web/editor.js` | 2-4 | Ctrl+C/V/X 핸들러, 내부/외부 클립보드 처리, HTML 복사/붙여넣기 |
| `web/text_selection.js` | 2-3 | 다중 문단 선택, onCopy 콜백 지원 |

## 클립보드 데이터 흐름

### 복사 (Ctrl+C)

```
텍스트 선택 시:
  → handleCopyToInternal()     → WASM 내부 클립보드 (서식 보존)
  → handleCopyToClipboard()    → ClipboardItem(text/html + text/plain) → 브라우저 클립보드

컨트롤 선택 시:
  → handleCopyToInternal()     → WASM 내부 클립보드
  → writeControlHtmlToClipboard() → ClipboardItem(text/html + text/plain) → 브라우저 클립보드
```

### 붙여넣기 (Ctrl+V)

```
handlePaste()
  1. 선택 범위 삭제 (있으면)
  2. 내부 클립보드 확인 → pasteFromInternal() (서식 완벽 보존)
  3. 브라우저 clipboard.read()
     → text/html 있음 → pasteFromHtml() (CSS→HWP 스타일 변환)
     → text/html 없음 → readText() → handleTextInsert() (플레인 텍스트)
  4. clipboard.read() 미지원 → readText() fallback
```

### 잘라내기 (Ctrl+X)

```
handleCut()
  → 복사 (내부 + HTML 클립보드)
  → 선택 영역 삭제
  → 재렌더링
```

## 테스트 결과

| 구분 | 테스트 수 |
|------|-----------|
| 기존 테스트 | 416 |
| 1단계 신규 | 5 |
| 3단계 신규 | 3 |
| 4단계 신규 | 5 |
| **총 합계** | **429 통과** |
| WASM 빌드 | 성공 |

## 기술적 결정 사항

| 결정 | 근거 |
|------|------|
| 외부 크레이트 없이 HTML 파서 직접 구현 | no_std WASM 환경 호환, 의존성 최소화 |
| ClipboardItem API 사용 | text/html + text/plain 동시 등록 가능, 미지원 브라우저 writeText fallback |
| CSS 색상 → HWP BGR 변환 | HWP 내부 포맷이 BGR 순서 사용 |
| CharShape/ParaShape 재사용 | 기존 동일 스타일 검색 후 없을 때만 신규 생성, DocInfo 비대화 방지 |
| StartFragment/EndFragment 지원 | Windows 클립보드 HTML 포맷 표준 준수 |
| 내부 클립보드 우선 정책 | 동일 에디터 내 복사/붙여넣기 시 서식/구조 완벽 보존 |

## 브라우저 호환성

| 기능 | Chrome | Firefox | Safari | Edge |
|------|--------|---------|--------|------|
| navigator.clipboard.writeText() | O | O | O | O |
| navigator.clipboard.readText() | O | O | O | O |
| navigator.clipboard.write() (ClipboardItem) | O | 127+ | 13.1+ | O |
| navigator.clipboard.read() | O | 127+ | 13.1+ | O |

- HTTPS 또는 localhost 환경 필수 (Secure Context)
- 미지원 브라우저: writeText/readText fallback (플레인 텍스트만)
