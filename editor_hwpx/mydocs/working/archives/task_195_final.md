# 타스크 195 최종 결과 보고서 — 머리말/꼬리말 필드 삽입 및 마당 기능

## 구현 완료 항목

### 1단계: 필드 마커 삽입 + 렌더링 치환 (Rust)

| 항목 | 상태 |
|------|------|
| 마커 문자 정의 (`\u{0015}`=쪽번호, `\u{0016}`=총쪽수, `\u{0017}`=파일이름) | 완료 |
| `insert_field_in_hf_native` (header_footer_ops.rs) | 완료 |
| `layout_header_footer_paragraphs`에서 마커→실제 값 치환 | 완료 |
| `substitute_hf_field_markers` (layout.rs) — ComposedParagraph 런 텍스트 치환 | 완료 |
| `LayoutEngine`에 `total_pages`, `file_name` 필드 추가 | 완료 |
| `build_page_tree`에서 총 쪽수·파일이름을 레이아웃 엔진에 전달 | 완료 |
| `_page_index` → `page_index` + `page_number` 파라미터 활성화 | 완료 |
| `insertFieldInHf` WASM 바인딩 (wasm_api.rs) | 완료 |

### 2단계: TS 브릿지 + 도구상자 UI

| 항목 | 상태 |
|------|------|
| `wasm-bridge.ts` insertFieldInHf 메서드 | 완료 |
| `wasm-bridge.ts` applyHfTemplate 메서드 | 완료 |
| `wasm-bridge.ts` getParaPropertiesInHf / applyParaFormatInHf 메서드 | 완료 |
| `page:insert-field-pagenum` 커맨드 | 완료 |
| `page:insert-field-totalpage` 커맨드 | 완료 |
| `page:insert-field-filename` 커맨드 | 완료 |
| 머리말/꼬리말 도구상자에 [쪽번호] [총쪽수] [파일명] 버튼 추가 | 완료 |
| 머리말/꼬리말 문단 모양 조회/적용 (`getParaProperties`, `applyParaFormat` HF 모드 분기) | 완료 |

### 3단계: 마당 템플릿 + 메뉴 통합

| 항목 | 상태 |
|------|------|
| `apply_hf_template_native` (Rust) — 11종 템플릿 (5배치 x 2스타일 + 빈 템플릿) | 완료 |
| `applyHfTemplate` WASM 바인딩 | 완료 |
| `page:apply-hf-template` 커맨드 (params로 isHeader/applyTo/templateId 전달) | 완료 |
| index.html: 쪽 메뉴 > 머리말/꼬리말 부모 서브메뉴 | 완료 |
| 양쪽/홀수쪽/짝수쪽 자식 서브메뉴 (3단계 중첩) | 완료 |
| 11종 템플릿 항목 (기본 5종 + 볼드 5종 + 빈 템플릿) | 완료 |
| menu-bar.ts: data-* 속성을 params로 전달 | 완료 |

## 버그 수정

### char_count 미갱신 버그 (핵심)

**문제**: `create_header_footer_native`에서 본문 문단에 머리말/꼬리말 컨트롤을 추가할 때 `char_count` 갱신이 누락되었다. HWP 컨트롤은 UTF-16에서 8 code units를 차지하므로, `char_count`가 미갱신되면 `compose_lines`에서 `utf16_end` 범위가 텍스트 실제 위치보다 작아져 렌더링이 누락되는 현상 발생.

**수정**:
- `create_header_footer_native`: 컨트롤 추가 후 `char_count += 8`
- `delete_header_footer_native`: 컨트롤 삭제 후 `char_count -= 8` (saturating_sub)
- 회귀 테스트 `test_body_text_after_hf_template` 추가

### ESC/닫기 시 afterEdit 호출 누락

**수정**: 머리말/꼬리말 종료(ESC, 닫기, 지우기) 시 `updateCaretNoScroll` 대신 `afterEdit` + `textarea.focus()` 호출로 렌더링 갱신 보장.

### 디버그 로그 정리

input-handler-text.ts에서 머리말/꼬리말 관련 `console.log` 출력 제거.

## 마당 템플릿 상세

| ID | 배치 | 스타일 | 내용 |
|----|------|--------|------|
| 0 | - | - | 빈 머리말/꼬리말 |
| 1 | 왼쪽 정렬 | 기본 | 쪽번호 |
| 2 | 가운데 정렬 | 기본 | 쪽번호 |
| 3 | 오른쪽 정렬 | 기본 | 쪽번호 |
| 4 | 왼쪽+오른쪽 탭 | 기본 | 쪽번호(왼) + 파일이름(오) |
| 5 | 왼쪽+오른쪽 탭 | 기본 | 파일이름(왼) + 쪽번호(오) |
| 6~10 | 위 1~5와 동일 | 볼드+밑줄 | 동일 배치, Bold + Underline(Bottom) |

좌+우 배치 템플릿(4, 5)은 탭 문자(`\t`) + 오른쪽 정렬 탭스톱(text_width 위치)을 사용하여 구현.

## 필드 치환 동작 방식

1. 마커 문자(`\u{0015}`, `\u{0016}`, `\u{0017}`)를 머리말/꼬리말 문단 텍스트에 삽입
2. `build_page_tree` 호출 시 총 쪽수와 파일이름을 `LayoutEngine`에 전달
3. `layout_header_footer_paragraphs`에서 `compose_paragraph` 후 `substitute_hf_field_markers` 호출
4. ComposedParagraph의 각 런에서 마커 문자를 실제 값(쪽번호, 총쪽수, 파일이름)으로 문자열 치환
5. 페이지별로 `page_number`가 다르므로 각 페이지에서 올바른 쪽번호가 렌더링됨

## 메뉴 구조

```
쪽 메뉴
├── 편집 용지
├── ─────────
├── 머리말 ▶
│   ├── 양쪽 ▶ → [빈 머리말 | 왼쪽/가운데/오른쪽 쪽번호 | 쪽번호+파일명 | 볼드 버전 5종]
│   ├── 홀수 쪽 ▶ → (동일 11종)
│   ├── 짝수 쪽 ▶ → (동일 11종)
│   └── 머리말 편집...
├── 꼬리말 ▶
│   ├── 양쪽 ▶ → (동일 11종)
│   ├── 홀수 쪽 ▶ → (동일 11종)
│   ├── 짝수 쪽 ▶ → (동일 11종)
│   └── 꼬리말 편집...
└── ...
```

## 도구상자 최종 레이아웃

```
[머리말(양쪽)] | [◀ 이전] [다음 ▶] | [✕ 닫기] [🗑 지우기] | [# 쪽번호] [## 총쪽수] [F 파일명]
```

## 수정된 파일 목록

### Rust
- `src/document_core/commands/header_footer_ops.rs` — insert_field_in_hf_native, apply_hf_template_native, get_para_properties_in_hf_native, apply_para_format_in_hf_native, char_count 갱신, 회귀 테스트
- `src/document_core/mod.rs` — `file_name` 필드 추가
- `src/document_core/commands/document.rs` — `file_name` 초기화
- `src/document_core/queries/rendering.rs` — build_page_tree에서 total_pages/file_name 전달
- `src/renderer/layout.rs` — LayoutEngine에 total_pages/file_name 필드, substitute_hf_field_markers, page_number 파라미터 추가
- `src/wasm_api.rs` — setFileName, insertFieldInHf, applyHfTemplate, getParaPropertiesInHf, applyParaFormatInHf 바인딩

### TypeScript
- `rhwp-studio/src/core/wasm-bridge.ts` — insertFieldInHf, applyHfTemplate, getParaPropertiesInHf, applyParaFormatInHf, setFileName 호출
- `rhwp-studio/src/command/commands/page.ts` — insert-field-pagenum/totalpage/filename, apply-hf-template 커맨드
- `rhwp-studio/src/ui/menu-bar.ts` — data-* 속성을 params로 전달
- `rhwp-studio/index.html` — 머리말/꼬리말 3단계 서브메뉴 + 도구상자 필드 버튼
- `rhwp-studio/src/engine/input-handler.ts` — getParaProperties/applyParaFormat HF 모드 분기
- `rhwp-studio/src/engine/input-handler-keyboard.ts` — ESC afterEdit 수정
- `rhwp-studio/src/engine/input-handler-text.ts` — 디버그 로그 정리

## 검증 결과

| 항목 | 결과 |
|------|------|
| Rust 테스트 (668개) | 모두 통과 (회귀 테스트 1개 포함) |
| TypeScript 컴파일 | 에러 없음 |
| char_count 갱신 회귀 테스트 (`test_body_text_after_hf_template`) | 통과 |
