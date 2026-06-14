# 타스크 33: 최종 결과 보고서 — 언어별 폰트 분기

## 개요

HWP 파일의 `CharShape.font_ids[7]`에 저장된 7개 언어 카테고리별 폰트를 정확하게 적용하는 기능을 구현했다. 이전에는 `font_ids[0]`(한국어)만 사용하여 모든 문자를 렌더링했으나, 이제 각 문자의 Unicode 범위에 따라 해당 언어 카테고리의 폰트/자간/장평을 적용한다.

## 구현 단계 요약

### 1단계: ResolvedCharStyle 확장 + 언어 판별 함수
- `ResolvedCharStyle`에 `font_families[7]`, `letter_spacings[7]`, `ratios[7]` 벡터 추가
- `detect_lang_category()` 함수: Unicode 코드포인트 → 언어 카테고리 매핑
- `font_family_for_lang()`, `letter_spacing_for_lang()`, `ratio_for_lang()` helper 메서드
- `resolve_single_char_style()`에서 7개 언어 모두 해소

### 2단계: Composer Run 분할 + Layout 적용
- `ComposedTextRun`에 `lang_index` 필드 추가
- `split_runs_by_lang()`: 동일 CharShape 내에서 언어 전환 시 run 분할
- `is_lang_neutral()`: 공백/구두점 → 이전 언어 유지 (불필요한 분할 방지)
- `resolved_to_text_style()`에 `lang_index` 파라미터 추가, 모든 호출부 수정

### 3단계: WASM JSON + 서식 툴바 연동
- `build_char_properties_json()`: 캐럿 위치 문자의 언어 판별 → 해당 폰트 반환
- `getPageTextLayout()` JSON: 2단계에서 자동 반영 (수정 불필요)
- 서식 툴바: WASM API가 올바른 폰트를 반환하므로 자동 반영

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/style_resolver.rs` | font_families/spacings/ratios 배열, detect_lang_category(), helper 메서드 |
| `src/renderer/composer.rs` | ComposedTextRun.lang_index, split_runs_by_lang(), is_lang_neutral() |
| `src/renderer/layout.rs` | resolved_to_text_style() lang_index 파라미터, 모든 호출부 |
| `src/wasm_api.rs` | build_char_properties_json() 언어별 폰트 반환 |

## 신규 테스트 (16개)

| 파일 | 테스트 | 검증 내용 |
|------|--------|-----------|
| style_resolver.rs | test_detect_lang_category_korean | 한글 음절/자모 → 0 |
| style_resolver.rs | test_detect_lang_category_english | ASCII 영문/숫자 → 1 |
| style_resolver.rs | test_detect_lang_category_cjk | CJK 한자 → 2 |
| style_resolver.rs | test_detect_lang_category_japanese | 히라가나/가타카나 → 3 |
| style_resolver.rs | test_detect_lang_category_symbol | 기호/화살표 → 5 |
| style_resolver.rs | test_detect_lang_category_default | 공백/구두점 → 0 (기본값) |
| style_resolver.rs | test_resolve_char_style_font_families | 7개 언어별 폰트 이름 |
| style_resolver.rs | test_resolve_char_style_lang_ratios | 7개 언어별 장평 |
| style_resolver.rs | test_resolve_char_style_lang_spacings | 7개 언어별 자간 |
| style_resolver.rs | test_font_family_for_lang_fallback | 빈 문자열/범위 초과 폴백 |
| composer.rs | test_split_runs_by_lang_korean_english | 한영 혼합 → 3개 run |
| composer.rs | test_split_runs_by_lang_no_split | 단일 언어 → 분할 없음 |
| composer.rs | test_split_runs_by_lang_space_follows_prev | 공백이 이전 언어 따름 |
| composer.rs | test_split_runs_by_lang_empty | 빈 run 유지 |
| composer.rs | test_split_runs_by_lang_english_only | 영어만 → lang_index=1 |
| composer.rs | test_is_lang_neutral | 중립 문자 판별 |

## 테스트 결과

- **전체**: 414 passed / 1 failed (기존 실패: test_svg_render_with_table_after_cell_edit — 이번 변경 무관)
- **신규 16개**: 전체 통과
- **WASM 빌드**: 성공

## 효과

1. **렌더링 정확도**: "안녕 Hello 世界 あいう" → 각 구간이 올바른 폰트로 렌더링
2. **서식 툴바**: 캐럿 위치에 따라 해당 언어의 폰트 이름 정확히 표시
3. **자간/장평**: 언어별 개별 값 적용 (예: 영어 장평 80%, 한국어 100%)
4. **성능**: 공백/구두점은 이전 언어를 따라 불필요한 run 분할 최소화
