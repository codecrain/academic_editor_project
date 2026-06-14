# 타스크 15 구현 계획서: 장평 렌더링 처리

## 1단계: TextStyle에 ratio 필드 추가 및 전달

**변경 파일:**
- `src/renderer/mod.rs` — `TextStyle`에 `pub ratio: f64` 추가
- `src/renderer/layout.rs` — `resolved_to_text_style()`에서 `ratio` 전달

**완료 기준:** 기존 테스트 통과, ratio 값이 TextStyle까지 전달됨

---

## 2단계: 폭 추정 및 SVG/Canvas/HTML 렌더러 장평 적용

**변경 파일:**
- `src/renderer/layout.rs` — `estimate_text_width()`에 ratio 반영
- `src/renderer/svg.rs` — `draw_text()`에 transform 적용
- `src/renderer/web_canvas.rs` — `draw_text()`에 scale 적용
- `src/renderer/html.rs` — `draw_text()`에 scaleX 적용

**완료 기준:** ratio != 1.0일 때 가로 스케일링 동작, 기존 테스트 통과

---

## 3단계: 테스트 추가 및 검증

**작업:**
- 장평 관련 단위 테스트 추가
- 샘플 문서 렌더링 확인
- WASM 빌드 확인

**완료 기준:** 전체 테스트 통과, WASM 빌드 성공
