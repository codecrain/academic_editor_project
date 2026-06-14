# 타스크 33 — 2단계 완료 보고서: Composer Run 분할 + Layout 적용

## 수행 내용

### 2-1. ComposedTextRun에 lang_index 추가 (`composer.rs`)

```rust
pub struct ComposedTextRun {
    pub text: String,
    pub char_style_id: u32,
    pub lang_index: usize,    // 0~6 언어 카테고리
}
```

모든 `ComposedTextRun` 생성부에 `lang_index: 0` 기본값 추가.

### 2-2. 언어별 Run 분할 함수 (`composer.rs`)

- `split_runs_by_lang()`: CharShape 기반 분할 후 각 run 내에서 언어가 바뀌는 지점에서 추가 분할
- `is_lang_neutral()`: 공백/구두점 등 언어 중립 문자 판별 — 불필요한 분할 방지
- `split_by_char_shapes()`의 모든 반환 경로와 `compose_lines()` 폴백 경로에 `split_runs_by_lang()` 호출 삽입

예시:
```
입력: [Run("안녕 Hello 세계", id=0)]
출력: [Run("안녕 ", id=0, lang=0), Run("Hello ", id=0, lang=1), Run("세계", id=0, lang=0)]
```

### 2-3. resolved_to_text_style() 수정 (`layout.rs`)

- 시그니처: `fn resolved_to_text_style(styles, char_style_id, lang_index) -> TextStyle`
- `font_family_for_lang(lang_index)`, `letter_spacing_for_lang(lang_index)`, `ratio_for_lang(lang_index)` 사용
- 8개 호출부 모두 수정: run 순회 시 `run.lang_index`, 기타(번호/빈 run)는 `0` 전달

### 2-4. ResolvedCharStyle Default 수정 (`style_resolver.rs`)

- `font_families`, `letter_spacings`, `ratios`를 빈 벡터로 초기화
- 벡터가 비어있으면 helper 메서드가 스칼라 필드(`font_family`, `letter_spacing`, `ratio`)로 폴백
- 직접 구성하는 테스트에서 스칼라 값이 정상 작동하도록 보장

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/composer.rs` | ComposedTextRun.lang_index, split_runs_by_lang(), is_lang_neutral() |
| `src/renderer/layout.rs` | resolved_to_text_style() lang_index 파라미터, 모든 호출부 수정 |
| `src/renderer/style_resolver.rs` | Default 구현의 벡터 필드를 빈 벡터로 변경 |

## 신규 테스트 (6개)

| 테스트 | 검증 내용 |
|--------|-----------|
| `test_split_runs_by_lang_korean_english` | 한영 혼합 → 3개 run 분할 |
| `test_split_runs_by_lang_no_split` | 단일 언어 → 분할 없음 |
| `test_split_runs_by_lang_space_follows_prev` | 공백이 이전 언어를 따름 |
| `test_split_runs_by_lang_empty` | 빈 run 유지 |
| `test_split_runs_by_lang_english_only` | 영어만 → lang_index=1 |
| `test_is_lang_neutral` | 중립 문자 판별 |

## 테스트 결과

- **전체**: 414 passed / 1 failed (기존 실패: `test_svg_render_with_table_after_cell_edit` — 이번 변경 무관)
- **신규 6개**: 전체 통과
- **기존 테스트**: 전체 통과 (1단계 10개 포함)
