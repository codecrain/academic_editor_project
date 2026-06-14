# 타스크 37 - 3단계 완료 보고서: 서식 텍스트 복사 — HTML 생성

## 구현 내용

### 1. WASM 측 — HTML 생성 API (3개 네이티브 + 3개 WASM 바인딩)

| 네이티브 메서드 | WASM 바인딩 | 설명 |
|----------------|------------|------|
| `export_selection_html_native()` | `exportSelectionHtml` | 본문 선택 영역 → HTML |
| `export_selection_in_cell_html_native()` | `exportSelectionInCellHtml` | 셀 내부 선택 영역 → HTML |
| `export_control_html_native()` | `exportControlHtml` | 컨트롤 객체(표/이미지) → HTML |

### 2. HTML 생성 구조

생성되는 HTML 형식:

```html
<html><body>
<!--StartFragment-->
<p style="margin:0;text-align:justify;line-height:160%;">
<span style="font-family:'함초롬돋움','Arial';font-size:10.0pt;color:#000000;">텍스트</span>
<span style="font-family:'함초롬돋움','Arial';font-size:10.0pt;font-weight:bold;color:#ff0000;">볼드 텍스트</span>
</p>
<!--EndFragment-->
</body></html>
```

### 3. 스타일 변환 헬퍼 메서드

| 메서드 | 동작 |
|--------|------|
| `char_style_to_css()` | `ResolvedCharStyle` → CSS (font-family, font-size(pt), bold, italic, color, underline, strikethrough, letter-spacing) |
| `para_style_to_css()` | `ResolvedParaStyle` → CSS (text-align, margin-left/right, text-indent, line-height) |
| `paragraph_to_html()` | 문단 → `<p><span>...</span></p>`, CharShapeRef 경계에서 `<span>` 분할 |
| `get_char_style_ranges()` | CharShapeRef의 UTF-16 위치를 char 인덱스로 변환, 범위 목록 반환 |
| `table_to_html()` | Table → `<table>` 구조 (행/열/병합/셀 배경/테두리/내부 문단) |
| `picture_to_html()` | Picture → `<img src="data:...;base64,...">` (base64 인코딩 이미지) |
| `apply_border_fill_css()` | BorderFill → CSS 테두리/배경색 |

### 4. JS 측 — 클립보드 이벤트 흐름 변경

#### Ctrl+C 흐름 (변경됨)

```
[텍스트 선택 시]
editor.js keydown → handleCopyToInternal() [내부 클립보드]
text_selection.js keydown → onCopy 콜백 → handleCopyToClipboard()
  └→ doc.exportSelectionHtml() → ClipboardItem(text/html + text/plain)

[컨트롤 객체 선택 시]
editor.js keydown → handleCopyToInternal() + writeControlHtmlToClipboard()
  └→ doc.exportControlHtml() → ClipboardItem(text/html + text/plain)
```

#### text_selection.js 변경

- `_onKeyDown()` Ctrl+C: `onCopy` 콜백 설정 시 위임 (editor.js가 HTML+텍스트 처리)
- 콜백 미설정 시 기존 동작 유지 (플레인 텍스트만)

#### editor.js 신규 함수

| 함수 | 설명 |
|------|------|
| `handleCopyToClipboard(e)` | 텍스트 선택 시 HTML+텍스트 동시 등록 (ClipboardItem API) |
| `writeControlHtmlToClipboard()` | 컨트롤 객체 HTML 클립보드 등록 |

#### handleCut() 변경

- 기존: `navigator.clipboard.writeText(text)` (플레인 텍스트만)
- 변경: `doc.exportSelectionHtml()` → `ClipboardItem(text/html + text/plain)` (HTML+텍스트)

### 5. ClipboardItem API 사용

```javascript
const item = new ClipboardItem({
    'text/html': new Blob([htmlStr], { type: 'text/html' }),
    'text/plain': new Blob([plainText], { type: 'text/plain' }),
});
await navigator.clipboard.write([item]);
```

- `ClipboardItem` 미지원 브라우저: `navigator.clipboard.writeText()` fallback
- HTTPS 환경 필수 (Clipboard API 보안 요구사항)

### 6. 유틸리티 함수 (wasm_api.rs)

| 함수 | 설명 |
|------|------|
| `utf16_pos_to_char_idx()` | UTF-16 코드 유닛 위치 → char 인덱스 변환 |
| `clipboard_color_to_css()` | COLORREF (BGR) → CSS `#rrggbb` |
| `clipboard_escape_html()` | HTML 특수문자 이스케이프 |
| `detect_clipboard_image_mime()` | 이미지 바이너리 → MIME 타입 감지 |

## 테스트 결과

- 기존 테스트: 421 통과
- 신규 HTML 생성 테스트: 3 통과
- **총 424 테스트 통과**
- WASM 빌드: 성공

### 신규 테스트 항목

| 테스트 | 검증 내용 |
|--------|-----------|
| `test_export_selection_html_basic` | 단일 문단 HTML 생성, 문단 스타일 CSS (text-align:center), 기본 구조 (StartFragment/EndFragment) |
| `test_export_selection_html_partial` | 부분 선택 HTML 생성, 선택 범위만 포함 확인 |
| `test_export_control_html_table` | 표 컨트롤 HTML 생성 (`<table>`, `<tr>`, `<td>` 구조) |

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `src/wasm_api.rs` | HTML 생성 네이티브 API 3개, WASM 바인딩 3개, 헬퍼 메서드 7개, 유틸리티 함수 4개, 테스트 3개 |
| `web/editor.js` | `handleCopyToClipboard()`, `writeControlHtmlToClipboard()` 추가, `handleCut()` HTML 지원, `onCopy` 콜백 설정 |
| `web/text_selection.js` | Ctrl+C `onCopy` 콜백 지원 추가 |
