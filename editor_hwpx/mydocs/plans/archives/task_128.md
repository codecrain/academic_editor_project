# 타스크 128 수행계획서 — Bold/Italic 폰트 폭 보정

## 배경

### 현재 상태

타스크 125에서 생성한 582개 폰트 메트릭의 Bold/Italic 커버리지:

| 분류 | 메트릭 수 | 비율 |
|------|----------|------|
| Regular (bold=false, italic=false) | 366개 | 62.9% |
| Bold only (bold=true, italic=false) | 39개 | 6.7% |
| Italic only (bold=false, italic=true) | 30개 | 5.2% |
| BoldItalic (bold=true, italic=true) | 49개 | 8.4% |
| **전체** | **582개** | |

- 4종 완비 (R/B/I/BI): 46개 폰트 (주로 영문: Arial, Times New Roman, Calibri 등)
- 1종만 보유: 283개 폰트 (대부분 Regular만)

### 문제 시나리오

`find_metric()` (font_metrics_data.rs:63)의 폴백 로직:

```
1차: 정확한 매칭 (name + bold + italic)
2차: bold만 매칭 (italic 무시)
3차: Regular 폴백 ← 여기서 폭 오차 발생
```

Regular만 보유한 폰트에서 Bold가 요청되면:
- `find_metric("Haansoft Batang", bold=true, italic=false)` → Regular 반환
- CSS `font-weight: bold`로 렌더링하면 브라우저가 Faux Bold(합성 Bold) 적용
- Faux Bold는 획 두께 증가로 글리프가 약간 넓어짐 → **레이아웃 폭 ≠ 렌더링 폭**

### 한컴 webhwp 방식

한컴은 Bold에 대해 하드코딩된 폭 보정을 적용한다:

```javascript
if (isBold) width += parseInt((emsize + 10) / 20);
```

즉, Bold일 때 **em_size/20** 만큼 폭을 가산한다 (1000em 기준 ≈ 50 em 단위).

### 실제 영향 범위

| 폰트 종류 | Bold 메트릭 존재 | 폭 보정 필요 |
|-----------|----------------|-------------|
| 주요 영문 (Arial, Calibri 등) | 예 (별도 TTF) | 아니오 — 실측값 사용 |
| 주요 한글 (함초롬, 맑은고딕, 나눔) | 예 (별도 TTF) | 아니오 — 실측값 사용 |
| 단일 웨이트 폰트 (283개) | 아니오 | **예** — Faux Bold 보정 필요 |
| 한글 폰트 Italic | TTF 없음 | 아니오 — 한글은 Italic 없음 |

## 해결 방향

`find_metric()`이 **정확한 매칭 실패 후 Regular 폴백**한 경우를 감지하여, 한컴 방식의 폭 보정을 적용한다.

## 구현 단계 (3단계)

---

### 1단계: find_metric에 폴백 정보 반환

**파일**: `src/renderer/font_metrics_data.rs`

`find_metric()`의 반환값에 **실제 반환된 variant가 요청과 일치하는지** 정보를 추가한다.

```rust
pub struct MetricMatch {
    pub metric: &'static FontMetric,
    pub bold_fallback: bool,   // bold 요청했으나 Regular로 폴백됨
}

pub fn find_metric(name: &str, bold: bool, italic: bool) -> Option<MetricMatch> {
    // 1차: 정확한 매칭
    if let Some(m) = FONT_METRICS.iter().find(|m| m.name == name && m.bold == bold && m.italic == italic) {
        return Some(MetricMatch { metric: m, bold_fallback: false });
    }
    // 2차: bold만 매칭
    if let Some(m) = FONT_METRICS.iter().find(|m| m.name == name && m.bold == bold && !m.italic) {
        return Some(MetricMatch { metric: m, bold_fallback: false });
    }
    // 3차: Regular 폴백
    FONT_METRICS.iter().find(|m| m.name == name)
        .map(|m| MetricMatch { metric: m, bold_fallback: bold })
}
```

---

### 2단계: measure_char_width_embedded에 Bold 보정 적용

**파일**: `src/renderer/layout.rs`

`measure_char_width_embedded()`에서 `bold_fallback`이 true이면 한컴 방식의 폭 보정 적용:

```rust
fn measure_char_width_embedded(font_family: &str, bold: bool, italic: bool, c: char, font_size: f64) -> Option<f64> {
    let mm = font_metrics_data::find_metric(font_family, bold, italic)?;
    let w = mm.metric.get_width(c)?;
    let mut actual_px = w as f64 * font_size / mm.metric.em_size as f64;

    // Bold 폴백 보정: Faux Bold는 획 두께 증가로 글리프가 넓어짐
    // 한컴 webhwp 방식: += (em_size + 10) / 20 (em 단위)
    if mm.bold_fallback {
        actual_px += (mm.metric.em_size as f64 + 10.0) / 20.0 * font_size / mm.metric.em_size as f64;
    }

    let hwp = (actual_px * 75.0).round() as i32;
    Some(hwp as f64 / 75.0)
}
```

---

### 3단계: 통합 테스트 및 검증

| 항목 | 방법 |
|------|------|
| 571개 회귀 테스트 | `docker compose run --rm test` |
| WASM 빌드 | `docker compose run --rm wasm` |
| Bold 메트릭 존재 폰트 | Arial Bold 등 → 기존과 동일 (bold_fallback=false) |
| Bold 메트릭 미존재 폰트 | Haansoft Batang Bold → 보정값 적용 확인 |

---

## 변경 파일 요약

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `src/renderer/font_metrics_data.rs` | `MetricMatch` 구조체, `find_metric` 반환값 변경 | ~15줄 |
| `src/renderer/layout.rs` | `measure_char_width_embedded`에 bold_fallback 보정 | ~5줄 |

## 설계 결정 근거

| 결정 | 이유 |
|------|------|
| find_metric 반환값 변경 (Option<MetricMatch>) | 폴백 여부를 호출자가 판단할 수 있도록 |
| em_size/20 보정 (한컴 방식) | 경쟁사 검증된 휴리스틱, Faux Bold의 획 두께 증가에 대응 |
| Italic 보정 미적용 | 한글 폰트에 Italic 없음, 영문 Italic은 폭 변화 미미 |

## 기대 효과

| 항목 | 현재 | 적용 후 |
|------|------|---------|
| Bold 메트릭 없는 폰트의 레이아웃 정밀도 | Regular 폭 사용 (Faux Bold 폭 불일치) | em_size/20 보정으로 근사 |
| Bold 메트릭 있는 폰트 | 영향 없음 (bold_fallback=false) | 동일 |
| WASM 바이너리 크기 | 변화 없음 | 동일 |
| 변경 규모 | — | 2개 파일, ~20줄 |
