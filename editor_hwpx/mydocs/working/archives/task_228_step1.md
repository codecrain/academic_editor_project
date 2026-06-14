# Task 228 - 1단계 완료 보고서: 형광펜 렌더링 구현

## 수행 내용

### 렌더러 파이프라인에 shade_color 추가

1. **TextStyle** (`src/renderer/mod.rs`): `shade_color: ColorRef` 필드 추가 (기본값 `0xFFFFFF`)
2. **ResolvedCharStyle** (`src/renderer/style_resolver.rs`): `shade_color: ColorRef` 필드 추가 + `resolve_single_char_style`에서 `CharShape.shade_color` 매핑
3. **text_measurement.rs**: `ResolvedCharStyle` → `TextStyle` 변환 시 `shade_color` 전달

### 렌더러별 형광펜 배경 구현

- **SVG** (`src/renderer/svg.rs`): `draw_text`에서 `shade_color != 0xFFFFFF`이면 텍스트 영역에 배경 `<rect>` 추가
- **Canvas** (`src/renderer/web_canvas.rs`): `draw_text`에서 `shade_color != 0xFFFFFF`이면 `fillRect` 호출
- **HTML** (`src/renderer/html.rs`): `draw_text`에서 `background-color` CSS 속성 추가

### 서식 도구 모음 형광펜 버튼 구현 (2단계 포함)

- **index.html**: 형광펜 버튼에 색상 팔레트 드롭다운 구조 추가 (한컴 UI 패턴)
- **style-bar.css**: 팔레트 스타일 (sb-hl-palette, sb-hl-swatch 등)
- **toolbar.ts**: `setupHighlightPicker()` — 6행×7열 색상 팔레트 + "색 없음" + "다른 색..." 버튼
  - 색상 클릭 → `format-char` 이벤트로 `shadeColor` 적용
  - 커서 이동 시 `updateState`에서 형광펜 색상 표시 갱신

## 테스트 결과

- Rust 테스트: 695개 통과, 0개 실패
- WASM 빌드: 성공
