# 타스크 22 - 1단계 완료 보고서

## 완료 사항: line_segs 재계산 (리플로우 엔진)

### 변경 파일

| 파일 | 변경 |
|------|------|
| `src/renderer/composer.rs` | `reflow_line_segs()` 함수 추가 + 테스트 5개 |
| `src/renderer/layout.rs` | `estimate_text_width()` → `pub(crate)` 가시성 변경 |
| `src/wasm_api.rs` | `reflow_paragraph()` 헬퍼 추가, `insertText`/`deleteText`에 리플로우 호출 통합 |

### 구현 내용

1. **`reflow_line_segs(para, available_width_px, styles, dpi)`**
   - 문단의 텍스트를 순회하며 각 글자의 CharShape 기반 너비 누적
   - 컬럼 너비 초과 시 줄 바꿈 (새 LineSeg 생성)
   - 첫 줄 들여쓰기(indent) 반영
   - LineSeg의 line_height = font_size * 1.6 비율로 HWPUNIT 변환

2. **`reflow_paragraph(section_idx, para_idx)`** (wasm_api.rs)
   - section의 PageDef에서 컬럼 너비 계산
   - 문단 여백(margin_left, margin_right) 차감 후 사용 가능 너비 결정
   - `reflow_line_segs()` 호출

3. **파이프라인 통합**
   - `insert_text_native()`: 텍스트 삽입 → **리플로우** → compose → paginate
   - `delete_text_native()`: 텍스트 삭제 → **리플로우** → compose → paginate

### 테스트 결과

- 250개 테스트 통과 (기존 245개 + 리플로우 5개)
- 새 테스트:
  - `test_reflow_short_text_single_line`: 짧은 텍스트 → 1줄
  - `test_reflow_long_text_multi_line`: CJK 10글자 → 2줄
  - `test_reflow_empty_text`: 빈 문단 → 기본 LineSeg
  - `test_reflow_latin_text`: 라틴 문자 리플로우
  - `test_reflow_line_height`: line_height HWPUNIT 변환 검증
