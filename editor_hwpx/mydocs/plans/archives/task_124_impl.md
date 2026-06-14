# 타스크 124 구현 계획서 — 글리프 패스 렌더링 (벡터 텍스트)

## 전체 구현 단계 (4단계)

---

## 1단계: ttf-parser 의존성 추가 및 글리프 캐시 모듈 구현

### 목표
TTF 폰트 파일을 파싱하여 글리프 아웃라인을 추출하고 캐시하는 인프라를 구축한다.

### 변경 파일 및 내용

**Cargo.toml**
- `ttf-parser = "0.25"` 의존성 추가 (zero-allocation, no_std 호환)

**src/renderer/glyph_cache.rs** (신규)
- `GlyphOutline` 구조체: `Vec<PathCommand>` (기존 PathCommand 재사용)
- `FontFace` 구조체: ttf-parser Face 래퍼 + units_per_em 캐시
- `GlyphCache` 구조체:
  - `fonts: HashMap<String, FontFace>` — 폰트 이름 → 파싱된 Face
  - `glyphs: HashMap<(String, GlyphId), GlyphOutline>` — (폰트, 글리프) → 패스
- `load_font(name: &str, data: &[u8])` — ttf-parser::Face::parse() 후 등록
- `get_glyph_outline(font_name: &str, ch: char) -> Option<&GlyphOutline>` — Lazy 파싱 + 캐시
- `OutlineBuilder` 트레이트 구현: move_to/line_to/quad_to/curve_to/close → PathCommand 변환
  - TTF의 quad_to (2차 베지어) → Canvas의 bezier_curve_to (3차 베지어) 승격 변환

**src/renderer/mod.rs**
- `pub mod glyph_cache;` 추가

### 핵심 좌표 변환
- TTF 글리프: em 단위 (units_per_em 기준), Y축 위로 양수
- Canvas: px 단위, Y축 아래로 양수
- 변환: `x_px = x_em * font_size / units_per_em`, `y_px = -y_em * font_size / units_per_em`

### 검증
- `cargo build` 성공
- `cargo test` 571개 통과
- 단위 테스트: 함초롬바탕에서 '가' 글리프 아웃라인 추출 확인

---

## 2단계: WASM 폰트 로딩 API 및 draw_text 글리프 패스 렌더링

### 목표
WASM에서 폰트 파일을 받아 글리프 캐시에 등록하고, draw_text()에서 fillText 대신 글리프 패스로 렌더링한다.

### 변경 파일 및 내용

**src/wasm_api.rs**
- `load_font(name: &str, data: &[u8]) -> Result<(), JsValue>` WASM API 추가
- `HwpDocument`에 `glyph_cache: GlyphCache` 필드 추가
- `render_page_to_canvas()`에서 renderer에 glyph_cache 참조 전달

**src/renderer/web_canvas.rs**
- `WebCanvasRenderer`에 `glyph_cache: Option<&GlyphCache>` 필드 추가
- `draw_text()` 수정:
  ```
  for each cluster:
    if glyph_cache에서 글리프 아웃라인 조회 성공:
      ctx.save()
      ctx.translate(char_x, y)
      ctx.scale(font_size/upm, -font_size/upm)  // em→px + Y축 반전
      if has_ratio: ctx.scale(ratio, 1.0)
      ctx.beginPath()
      for cmd in outline.commands:
        moveTo/lineTo/bezierCurveTo
      ctx.fill()
      ctx.restore()
    else:
      기존 fillText() 폴백
  ```

### 검증
- WASM 빌드 성공
- 웹에서 함초롬바탕 TTF 로드 후 한글 텍스트 글리프 패스 렌더링 확인
- fillText 폴백 동작 확인 (미로드 폰트)

---

## 3단계: JS 폰트 로딩 및 폰트 매칭

### 목표
웹 에디터에서 TTF 폰트를 자동 로딩하고, HWP 문서의 폰트 이름과 매칭한다.

### 변경 파일 및 내용

**web/editor.js**
- `_loadDefaultFonts()` 함수 추가:
  - `fetch('/ttfs/hamchob-r.ttf')` → `doc.loadFont('함초롬바탕', arrayBuffer)`
  - `fetch('/ttfs/hamchod-r.ttf')` → `doc.loadFont('함초롬돋움', arrayBuffer)`
  - 로딩 완료 후 현재 페이지 재렌더링
- `openFile()` 흐름에서 폰트 로딩 → 렌더링 순서 보장
- 폰트 이름 매칭 (HWP 폰트 이름 → TTF 파일):
  - "함초롬바탕" → hamchob-r.ttf
  - "함초롬돋움" → hamchod-r.ttf
  - HCR Batang / HCR Dotum 등 영문 이름도 매칭

**web/index.html** (또는 웹 서버 설정)
- TTF 파일 서빙 경로 확인 (`/ttfs/` 접근 가능)

### 검증
- 폰트 로딩 후 렌더링: 글리프 패스로 텍스트 표시
- 폰트 로딩 전 렌더링: fillText 폴백으로 정상 표시
- 네트워크 탭에서 TTF 파일 로딩 및 캐시 확인

---

## 4단계: 통합 테스트 및 성능 검증

### 검증 항목

| 항목 | 방법 |
|------|------|
| 571개 회귀 테스트 | `docker compose run --rm test` |
| WASM 빌드 | `docker compose run --rm wasm` |
| 한글 텍스트 렌더링 | 줌 100%/200%/300%에서 글리프 패스 품질 확인 |
| 영문 텍스트 렌더링 | 함초롬체의 영문 글리프 또는 fillText 폴백 |
| 특수문자/기호 렌더링 | 글리프 없는 문자 → fillText 폴백 |
| 옛한글 자모 | 클러스터 단위 글리프 처리 |
| 줌 확대 300% | 한컴 대비 텍스트 품질 비교 |
| 성능 | 페이지 렌더링 시간 측정 (fillText 대비) |
| 폰트 로딩 실패 시 | fillText 폴백 정상 동작 |

---

## 영향 범위 요약

| 파일 | 단계 | 변경 내용 |
|------|------|-----------|
| Cargo.toml | 1 | ttf-parser 의존성 추가 |
| src/renderer/glyph_cache.rs | 1 | 글리프 캐시 모듈 (신규) |
| src/renderer/mod.rs | 1 | glyph_cache 모듈 선언 |
| src/wasm_api.rs | 2 | load_font API, glyph_cache 필드 |
| src/renderer/web_canvas.rs | 2 | draw_text 글리프 패스 렌더링 |
| web/editor.js | 3 | 폰트 로딩 및 매칭 |

## 기술 세부사항

### TTF 좌표계 → Canvas 좌표계

```
TTF: Y↑ (위로 양수), em 단위 (units_per_em = 2048 등)
Canvas: Y↓ (아래로 양수), px 단위

변환:
  canvas_x = glyph_x * (font_size_px / units_per_em)
  canvas_y = -glyph_y * (font_size_px / units_per_em)

기준점: (char_x, baseline_y)에 translate 후 scale 적용
```

### 2차 베지어 → 3차 베지어 승격

ttf-parser의 `quad_to(x1, y1, x, y)` (TrueType 곡선)을 Canvas의 `bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)` (3차)로 변환:

```
시작점 (x0, y0)에서:
  cp1x = x0 + 2/3 * (x1 - x0)
  cp1y = y0 + 2/3 * (y1 - y0)
  cp2x = x + 2/3 * (x1 - x)
  cp2y = y + 2/3 * (y1 - y)
```

또는 Canvas의 `quadraticCurveTo`를 직접 사용 (web-sys에서 지원 확인 필요).
