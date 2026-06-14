# 타스크 22: 텍스트 리플로우 및 문단 분리 (B-308) - 최종 완료 보고서

## 완료 사항

### 1단계: line_segs 재계산 (리플로우 엔진)

| 파일 | 변경 |
|------|------|
| `src/renderer/composer.rs` | `reflow_line_segs()` 함수 + 헬퍼 함수 2개 + 테스트 5개 |
| `src/renderer/layout.rs` | `estimate_text_width()` → `pub(crate)` 가시성 변경 |
| `src/wasm_api.rs` | `reflow_paragraph()` 헬퍼, `insertText`/`deleteText`에 리플로우 통합 |

- 텍스트를 순회하며 CharShape 기반 글자 너비를 누적
- 컬럼 너비 초과 시 줄 바꿈 (새 LineSeg 생성)
- 첫 줄 들여쓰기(indent) 반영
- `insert_text` / `delete_text` 호출 시 자동으로 리플로우 실행

### 2단계: 문단 분리 (Enter → splitParagraph)

| 파일 | 변경 |
|------|------|
| `src/model/paragraph.rs` | `split_at()` 메서드 + 테스트 5개 |
| `src/wasm_api.rs` | `splitParagraph` / `split_paragraph_native` API |
| `web/editor.js` | Enter 키 → `handleParagraphSplit()` 함수 |

- 캐럿 위치에서 텍스트/char_offsets/char_shapes/range_tags 분할
- 새 문단을 section.paragraphs에 삽입 후 양쪽 리플로우
- 선택 범위가 있으면 먼저 삭제 후 분리

### 3단계: 문단 병합 (Backspace@시작 → mergeParagraph)

| 파일 | 변경 |
|------|------|
| `src/model/paragraph.rs` | `merge_from()` 메서드 + 테스트 4개 |
| `src/wasm_api.rs` | `mergeParagraph` / `merge_paragraph_native` API |
| `web/editor.js` | Backspace(charOffset===0) → `handleParagraphMerge()` 함수 |

- 현재 문단의 텍스트/메타데이터를 이전 문단 끝에 결합
- 현재 문단 삭제 후 병합된 문단 리플로우
- 캐럿은 병합 지점(원래 이전 문단 끝)으로 이동

### 4단계: 테스트 결과

- **259개 테스트 통과** (기존 245개 + 새 14개)
  - 리플로우 테스트 5개 (composer.rs)
  - 문단 분리 테스트 5개 (paragraph.rs)
  - 문단 병합 테스트 4개 (paragraph.rs)
- **WASM 빌드 성공**

## 변경 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/model/paragraph.rs` | `split_at()`, `merge_from()` 메서드 + 테스트 9개 |
| `src/renderer/composer.rs` | `reflow_line_segs()` + 헬퍼 + 테스트 5개 |
| `src/renderer/layout.rs` | `estimate_text_width` 가시성 변경 |
| `src/wasm_api.rs` | `splitParagraph`, `mergeParagraph`, `reflow_paragraph` API |
| `web/editor.js` | `handleParagraphSplit()`, `handleParagraphMerge()`, Enter/Backspace 핸들러 수정 |
