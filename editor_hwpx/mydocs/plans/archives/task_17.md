# 타스크 17 수행계획서: 텍스트 선택 (B-301) — WYSIWYG 첫 단계

## 개요

Canvas 기반 HWP 뷰어에서 텍스트 선택 기능을 구현한다. Rust 측에서 글자별 위치를 계산하여 JSON으로 내보내고, JavaScript 측에서 hit-test와 드래그 선택 및 클립보드 복사를 구현한다.

## 수행 단계

| 단계 | 내용 | 변경 파일 |
|------|------|-----------|
| 1단계 | Rust — 글자별 위치 계산 API | `src/renderer/layout.rs`, `src/wasm_api.rs` |
| 2단계 | JavaScript — 텍스트 레이아웃 관리 및 hit-test | `web/text_selection.js` (신규) |
| 3단계 | 오버레이 캔버스 및 선택 하이라이트 렌더링 | `web/index.html`, `web/style.css`, `web/text_selection.js` |
| 4단계 | 마우스 이벤트 연동 및 클립보드 복사 | `web/text_selection.js`, `web/app.js` |

## 검증 방법

- `docker compose run --rm test` — 기존 233개 테스트 통과
- `docker compose run --rm wasm` — WASM 빌드 성공
- 브라우저에서 텍스트 드래그 선택 및 Ctrl+C 복사 동작 확인
