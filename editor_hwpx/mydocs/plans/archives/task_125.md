# 타스크 125 수행계획서 — 폰트 메트릭 DB 생성 도구

## 배경

### 현재 문제
현재 rhwp의 텍스트 폭 측정은 WASM에서 JS `globalThis.measureTextWidth()`를 호출하는 방식이다:

```
Rust layout.rs → wasm_bindgen → JS measureTextWidth() → Canvas measureText()
```

이 방식의 한계:
1. **WASM↔JS 브릿지 비용**: 문자마다 JS 호출 발생 (수천 회/페이지)
2. **한글 정밀도 부족**: 모든 한글 음절을 '가' 하나의 폭으로 대표
3. **오프라인 불가**: Canvas API 없이는 측정 불가 (네이티브 빌드, 서버 사이드)

### 경쟁사 분석 결과
한컴 웹기안기는 387개 .hft 모듈에 342개 폰트의 글리프 폭을 임베디드하여 **서버 독립적**으로 텍스트 폭을 계산한다. 브라우저 measureText는 폴백으로만 사용.

### 해결 방향
TTF/woff2 폰트 파일에서 `hmtx` 테이블을 직접 파싱하여 독자적인 폰트 메트릭 DB를 생성하는 CLI 도구를 만든다. 생성된 메트릭은 Rust 소스코드로 출력되어 WASM에 임베디드된다.

### 법적 근거
- 글리프 폭(advance width)은 폰트 파일의 기능적 속성(사실적 데이터)이며 저작권 보호 대상이 아님
- 한컴의 .hft도 동일한 폰트 속성에서 추출된 것
- 알고리즘(음절분해 등)은 아이디어이므로 저작권 비보호
- 데이터 출처: 프로젝트에 이미 배포된 woff2 폰트 파일 31개

## 대상 폰트

### 1차 소스: `ttfs/windows/` (599개 TTF 파일)

TTF 파일은 woff2 디코딩 없이 직접 파싱 가능하여 도구 구현이 훨씬 간단하다.

**핵심 한글 폰트**:

| 폰트 | TTF 파일 | 비고 |
|------|---------|------|
| 함초롬바탕/돋움 | HANBatang.ttf, HANDotum.ttf 등 | HWP 기본 |
| 맑은 고딕 | malgun.ttf, malgunbd.ttf | 시스템 기본 |
| 나눔고딕 | NanumGothic.ttf (4종) | 인기 폰트 |
| 나눔명조 | NanumMyeongjo.ttf (4종) | 인기 폰트 |
| 한컴 2묵직 | H2HDRM.TTF | HWP 특수 |
| HY견명조 | HYMJRE.TTF | HY 시리즈 |
| 바탕/돋움 | HBATANG.TTF, HDOTUM.TTF | 레거시 |
| 굴림 | NGULIM.TTF | 레거시 |

**핵심 영문 폰트**:

| 폰트 | TTF 파일 | 비고 |
|------|---------|------|
| Arial | arial.ttf (4종) | 기본 산세리프 |
| Times New Roman | times.ttf (4종) | 기본 세리프 |
| Calibri | calibri.ttf (6종) | Office 기본 |
| Verdana | verdana.ttf (4종) | 웹 기본 |
| Tahoma | tahoma.ttf (2종) | UI 폰트 |
| Courier New | (확인 필요) | 고정폭 |

### 2차 소스: `rhwp-studio/public/fonts/` (31개 woff2 파일)

웹 배포용 폰트. 필요 시 woff2 디코딩하여 추가 메트릭 생성.

## 구현 단계 (4단계)

---

### 1단계: TTF 테이블 파싱 도구

**목표**: TTF 파일에서 `head`, `cmap`, `hmtx`, `maxp` 테이블을 읽어 글리프 폭 데이터를 추출한다.

**파일**: `src/tools/font_metric_gen.rs` (신규 CLI 도구)

**TTF 테이블 파싱 순서**:
1. TTF 헤더: 테이블 디렉토리 읽기 (태그/오프셋/길이)
2. `head` 테이블: `unitsPerEm` (em 크기, 오프셋 18, u16)
3. `maxp` 테이블: `numGlyphs` (글리프 수, 오프셋 4, u16)
4. `cmap` 테이블: Unicode → Glyph ID 매핑
   - Format 4: BMP (U+0000~U+FFFF) 세그먼트 매핑
   - Format 12: 전체 유니코드 (보조 평면 포함)
5. `hmtx` 테이블: Glyph ID → advance width (u16 배열)
6. `name` 테이블: 폰트 패밀리명 추출

**결과**: `HashMap<char, u16>` (문자 → em 단위 폭)

**의존성**: 순수 Rust 구현 (외부 크레이트 없이 직접 바이너리 파싱). TTF는 빅엔디안 고정 구조이므로 파싱이 간단.

---

### 2단계: 한글 음절 분해 압축 (type:2 알고리즘)

**목표**: 11,172개 한글 음절(U+AC00~U+D7A3)의 개별 폭을 초/중/종성 그룹으로 압축한다.

**알고리즘**:
1. 유니코드 한글 음절 분해: `syllable = (cho × 21 + jung) × 28 + jong`
2. 초성(19개)을 폭 유사성으로 2~4그룹으로 K-means 클러스터링
3. 중성(21개)을 2~6그룹으로 클러스터링
4. 종성(28개, 없음 포함)을 1~3그룹으로 클러스터링
5. 그룹 조합별 대표 폭 = 그룹 내 평균
6. 오차 측정: 원본 폭과 그룹 대표 폭의 최대/평균 오차

**출력**: `HangulMetric { cho_groups, jung_groups, jong_groups, cho_map, jung_map, jong_map, widths }`

---

### 3단계: Rust 소스코드 생성 및 WASM 내장

**목표**: 생성된 메트릭 DB를 Rust 소스코드로 출력하여 컴파일 타임에 WASM에 포함한다.

**파일**: `src/renderer/font_metrics.rs` (생성됨)

**생성 코드 구조**:
```rust
/// 자동 생성됨 — font_metric_gen 도구로 생성
pub struct FontMetric {
    pub name: &'static str,
    pub em_size: u16,
    pub latin_widths: &'static [(char, char, &'static [u16])],  // (start, end, widths)
    pub hangul: Option<HangulMetric>,
}

pub struct HangulMetric {
    pub cho_groups: u8,
    pub jung_groups: u8,
    pub jong_groups: u8,
    pub cho_map: &'static [u8; 19],
    pub jung_map: &'static [u8; 21],
    pub jong_map: &'static [u8; 28],
    pub widths: &'static [u16],  // cho_g × jung_g × jong_g
}

pub static FONT_METRICS: &[FontMetric] = &[ ... ];
```

**조회 함수**:
```rust
pub fn get_char_width(font_name: &str, ch: char) -> Option<u16> {
    let metric = FONT_METRICS.iter().find(|m| m.name == font_name)?;
    if ch >= '\u{AC00}' && ch <= '\u{D7A3}' {
        // 한글 음절분해 조회
        metric.hangul.as_ref().map(|h| h.lookup(ch))
    } else {
        // Latin/기타 범위 조회
        metric.latin_widths.iter()
            .find(|(s, e, _)| ch >= *s && ch <= *e)
            .map(|(s, _, w)| w[(ch as u32 - *s as u32) as usize])
    }
}
```

---

### 4단계: layout.rs 측정 파이프라인 교체

**목표**: `estimate_text_width()`와 `compute_char_positions()`에서 JS 브릿지 대신 내장 메트릭을 1차 사용하고, 메트릭 미등록 폰트만 JS 폴백.

**변경 파일**: `src/renderer/layout.rs`

**변경 내용**:
```rust
// [현재]
let raw_px = js_measure_text_width(measure_font, &c.to_string());

// [변경]
let width = if let Some(w) = font_metrics::get_char_width(font_name, c) {
    // 내장 메트릭 사용 (em 단위 → px 변환)
    w as f64 * font_size / metric.em_size as f64
} else {
    // 폴백: JS measureText
    js_measure_text_width(measure_font, &c.to_string()) * font_size / 1000.0
};
```

**기대 효과**:
- JS 브릿지 호출 90%+ 감소 (31개 등록 폰트 커버)
- 한글 프로포셔널 폰트 정밀도 향상
- 네이티브 빌드에서도 텍스트 폭 측정 가능

---

## 변경 파일 요약

| 파일 | 변경 | 신규/수정 |
|------|------|-----------|
| `src/tools/font_metric_gen.rs` | CLI 도구 (woff2 파싱, 메트릭 생성) | 신규 |
| `src/renderer/font_metrics.rs` | 생성된 메트릭 DB + 조회 함수 | 신규 (자동생성) |
| `src/renderer/layout.rs` | 측정 파이프라인에 내장 메트릭 우선 사용 | 수정 |
| `src/renderer/mod.rs` | font_metrics 모듈 등록 | 수정 |
| `Cargo.toml` | woff2/brotli 의존성 (도구 빌드 시만) | 수정 |

## 검증 방법

| 항목 | 방법 |
|------|------|
| 571개 회귀 테스트 | `docker compose run --rm test` |
| WASM 빌드 | `docker compose run --rm wasm` |
| 메트릭 정확도 | 내장 메트릭 vs JS measureText 비교 (오차 < 1%) |
| 한글 음절분해 정확도 | 11,172개 음절 원본 폭 vs 그룹 대표 폭 (최대 오차 < 3%) |
| 렌더링 비교 | 동일 문서의 줄바꿈 위치가 변경 전과 동일한지 확인 |
