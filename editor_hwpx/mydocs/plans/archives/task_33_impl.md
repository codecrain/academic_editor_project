# 타스크 33: 구현 계획서 — 언어별 폰트 분기

## 현재 데이터 흐름

```
CharShape.font_ids[7]
  → resolve_single_char_style()   [style_resolver.rs]
    → font_ids[0] (한국어만 사용)
      → ResolvedCharStyle { font_family: "함초롬돋움" }
        → composer: ComposedTextRun { text, char_style_id }
          → layout: resolved_to_text_style(char_style_id) → TextStyle { font_family }
            → TextRunNode → Canvas fillText
```

**문제**: `font_ids[0]`만 사용 → 영문이 한글 폰트로 렌더링

## 목표 데이터 흐름

```
CharShape.font_ids[7]
  → resolve_single_char_style()
    → ResolvedCharStyle { font_families: [7개], spacings: [7개], ratios: [7개] }
      → composer: 텍스트를 언어별로 sub-split
        → ComposedTextRun { text, char_style_id, lang_index }
          → layout: resolved_to_text_style(char_style_id, lang_index)
            → TextStyle { font_family: font_families[lang_index] }
```

---

## 1단계: ResolvedCharStyle 확장 + 언어 판별 함수

### 변경 파일: `src/renderer/style_resolver.rs`

#### 1-1. ResolvedCharStyle에 언어별 배열 추가

```rust
pub struct ResolvedCharStyle {
    pub font_family: String,           // 기존 유지 (한국어 = 기본값)
    pub font_families: Vec<String>,    // 추가: 7개 언어별 폰트 이름
    pub font_size: f64,
    pub bold: bool,
    pub italic: bool,
    pub text_color: ColorRef,
    pub underline: UnderlineType,
    pub underline_color: ColorRef,
    pub strike_color: ColorRef,
    pub strikethrough: bool,
    pub letter_spacing: f64,           // 기존 유지 (한국어 기본값)
    pub letter_spacings: Vec<f64>,     // 추가: 7개 언어별 자간
    pub ratio: f64,                    // 기존 유지 (한국어 기본값)
    pub ratios: Vec<f64>,              // 추가: 7개 언어별 장평
}
```

#### 1-2. resolve_single_char_style() 수정

- 7개 언어 카테고리에 대해 `lookup_font_name(doc_info, lang, cs.font_ids[lang])` 호출
- `font_families`, `letter_spacings`, `ratios` 벡터 생성

#### 1-3. 언어 판별 함수 추가

```rust
/// Unicode 코드포인트로 HWP 언어 카테고리를 판별한다.
/// 0=한국어, 1=영어, 2=한자, 3=일본어, 4=기타, 5=기호, 6=사용자
pub fn detect_lang_category(ch: char) -> usize
```

| 언어 | Unicode 범위 |
|------|-------------|
| 한국어 (0) | Hangul Jamo (0x1100-0x11FF), Hangul Compatibility Jamo (0x3130-0x318F), Hangul Syllables (0xAC00-0xD7AF) |
| 영어 (1) | Basic Latin (0x0020-0x007F), Latin Extended (0x0080-0x024F) |
| 한자 (2) | CJK Unified Ideographs (0x4E00-0x9FFF), CJK Extension A/B |
| 일본어 (3) | Hiragana (0x3040-0x309F), Katakana (0x30A0-0x30FF) |
| 기호 (5) | General Punctuation, Mathematical Symbols 등 |
| 기본값 | 0 (한국어) — 미분류 문자는 한국어로 처리 |

#### 1-4. 테스트

- `test_detect_lang_category_korean` — 한글 음절/자모
- `test_detect_lang_category_english` — ASCII 영문자/숫자
- `test_detect_lang_category_cjk` — 한자
- `test_detect_lang_category_japanese` — 히라가나/가타카나
- `test_resolve_char_style_font_families` — 7개 언어별 폰트 이름 해소

---

## 2단계: Composer Run 분할 + Layout 적용

### 변경 파일: `src/renderer/composer.rs`, `src/renderer/layout.rs`

#### 2-1. ComposedTextRun에 lang_index 추가

```rust
pub struct ComposedTextRun {
    pub text: String,
    pub char_style_id: u32,
    pub lang_index: usize,    // 추가: 0~6 언어 카테고리
}
```

#### 2-2. compose_line_runs()에서 언어별 sub-split

기존 CharShapeRef 기반 분할 이후, 각 run에 대해:
1. 텍스트의 각 문자에 `detect_lang_category()` 적용
2. 언어가 바뀌는 지점에서 run을 분할
3. 공백/제어문자는 이전 문자의 언어를 따름 (run 분열 방지)

예시: `"안녕 Hello 세계"` (CharShape 동일)
```
Before: [Run("안녕 Hello 세계", id=0)]
After:  [Run("안녕 ", id=0, lang=0), Run("Hello ", id=0, lang=1), Run("세계", id=0, lang=0)]
```

#### 2-3. resolved_to_text_style() 수정

```rust
fn resolved_to_text_style(styles: &ResolvedStyleSet, char_style_id: u32, lang_index: usize) -> TextStyle
```

- `font_families[lang_index]` 사용 (빈 문자열이면 `font_families[0]` 폴백)
- `letter_spacings[lang_index]`, `ratios[lang_index]` 사용

#### 2-4. layout.rs의 모든 resolved_to_text_style() 호출부 수정

- `compose_line.runs` 순회 시 `run.lang_index` 전달
- 기타 TextRunNode 생성부 (번호, 빈 run 등)에는 `lang_index = 0` 사용

#### 2-5. 테스트

- `test_compose_line_runs_lang_split` — 한영 혼합 텍스트 분할
- `test_compose_line_runs_lang_no_split` — 단일 언어 분할 없음
- `test_compose_line_runs_space_follows_prev_lang` — 공백은 이전 언어 유지
- `test_resolved_to_text_style_lang_index` — 언어별 폰트 이름 사용

---

## 3단계: WASM JSON 반영 + 서식 툴바 연동 + 브라우저 테스트

### 변경 파일: `src/wasm_api.rs`, `web/format_toolbar.js`

#### 3-1. getPageTextLayout() JSON에 정확한 fontFamily 반영

현재 `getPageTextLayout()`이 TextRunNode의 style.font_family를 JSON으로 내보내므로, 2단계에서 TextStyle에 올바른 폰트가 들어가면 자동으로 반영된다. 별도 수정 불필요할 수 있으나, 확인 및 필요시 수정.

#### 3-2. getCharPropertiesAt() 언어별 폰트 반영

캐럿 위치의 문자에 대해 해당 언어 카테고리의 폰트를 반환하도록 수정:
- 현재: `font_family` = `font_faces[0][font_id]` (한국어만)
- 수정: 캐럿 위치 문자의 언어를 판별하여 해당 카테고리 폰트 반환

#### 3-3. 서식 툴바 폰트 표시

`format_toolbar.js`의 `_updateCharUI(props)`는 `props.fontFamily`를 표시하므로, WASM API가 정확한 폰트를 반환하면 자동 반영.

#### 3-4. 브라우저 테스트

- 한영 혼합 HWP 파일 로드 → 영문이 올바른 폰트로 렌더링되는지 확인
- 캐럿을 한글/영문 위치에 놓았을 때 서식 툴바에 올바른 폰트 표시

---

## 변경 파일 요약

| 파일 | 단계 | 변경 내용 |
|------|------|----------|
| `src/renderer/style_resolver.rs` | 1 | font_families/spacings/ratios 배열 + detect_lang_category() |
| `src/renderer/composer.rs` | 2 | ComposedTextRun.lang_index + 언어별 sub-split |
| `src/renderer/layout.rs` | 2 | resolved_to_text_style() lang_index 파라미터 |
| `src/wasm_api.rs` | 3 | getCharPropertiesAt() 언어별 폰트 반영 |
| `web/format_toolbar.js` | 3 | (필요시) 폰트 표시 로직 확인 |

## 예상 신규 테스트: 9개 이상
