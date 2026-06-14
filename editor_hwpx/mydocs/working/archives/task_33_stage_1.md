# 타스크 33 - 1단계 완료 보고서

## 단계: ResolvedCharStyle 확장 + 언어 판별 함수

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/style_resolver.rs` | ResolvedCharStyle에 언어별 배열 추가, detect_lang_category() 함수, resolve_single_char_style() 수정 |

## 구현 상세

### 1. ResolvedCharStyle 확장

| 필드 | 타입 | 설명 |
|------|------|------|
| `font_families` | `Vec<String>` (7개) | 언어 카테고리별 폰트 이름 |
| `letter_spacings` | `Vec<f64>` (7개) | 언어 카테고리별 자간 (px) |
| `ratios` | `Vec<f64>` (7개) | 언어 카테고리별 장평 비율 |

기존 `font_family`, `letter_spacing`, `ratio`는 한국어(0번) 기본값으로 유지 (하위 호환).

### 2. 언어별 헬퍼 메서드

| 메서드 | 설명 |
|--------|------|
| `font_family_for_lang(lang)` | 해당 언어 폰트 반환 (빈 문자열이면 한국어 폴백) |
| `letter_spacing_for_lang(lang)` | 해당 언어 자간 반환 |
| `ratio_for_lang(lang)` | 해당 언어 장평 반환 |

### 3. detect_lang_category() 함수

Unicode 코드포인트 범위로 HWP 언어 카테고리 판별:

| 반환값 | 언어 | Unicode 범위 |
|--------|------|-------------|
| 0 | 한국어 | Hangul Jamo/Syllables (0x1100-0x11FF, 0xAC00-0xD7AF 등) |
| 1 | 영어/라틴 | Basic Latin letters/digits (0x0041-0x007A), Latin Extended |
| 2 | 한자 | CJK Unified Ideographs (0x4E00-0x9FFF 등) |
| 3 | 일본어 | Hiragana/Katakana (0x3040-0x30FF) |
| 5 | 기호 | Mathematical/Technical Symbols, Dingbats 등 |
| 0 | 기본값 | 공백/구두점/미분류 → 한국어 (호출부에서 이전 문자 추적) |

### 4. resolve_single_char_style() 수정

7개 언어 카테고리에 대해 루프를 돌며:
- `lookup_font_name(doc_info, lang, cs.font_ids[lang])` 호출
- `spacings[lang]` → px 변환
- `ratios[lang]` → 비율 변환

## 추가된 테스트 (10개)

| 테스트 | 내용 |
|--------|------|
| `test_detect_lang_category_korean` | 한글 음절/자모 → 0 |
| `test_detect_lang_category_english` | ASCII 영문/숫자/라틴 확장 → 1 |
| `test_detect_lang_category_cjk` | 한자 → 2 |
| `test_detect_lang_category_japanese` | 히라가나/가타카나 → 3 |
| `test_detect_lang_category_symbol` | 화살표/도형/원숫자 → 5 |
| `test_detect_lang_category_default` | 공백/구두점 → 0 (기본값) |
| `test_resolve_char_style_font_families` | 7개 언어별 폰트 이름 해소 |
| `test_resolve_char_style_lang_ratios` | 언어별 장평 해소 |
| `test_resolve_char_style_lang_spacings` | 언어별 자간 해소 |
| `test_font_family_for_lang_fallback` | 빈 폰트 → 한국어 폴백 |

## 테스트 결과
- **409개 테스트 모두 통과** (기존 399 + 신규 10)
