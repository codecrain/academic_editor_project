# 타스크 73: 문단 부호 표시 기능 구현 — 수행 계획서

## 목표

HWP 편집기의 **문단 부호 표시** 기능을 완성한다. Enter(문단 끝) 및 Shift+Enter(강제 줄 바꿈) 위치를 파란색 ↵ 기호로 화면에 표시하여 문서 구조를 시각적으로 확인할 수 있게 한다.

## 배경

- HWP 도움말(보기→표시/숨기기→문단 부호) 기준: 파란색 ↵ 기호, 편집 화면 전용(인쇄 시 미표시)
- 백엔드(Rust): `show_paragraph_marks` 플래그와 ¶ 렌더링이 이미 구현되어 있으나, HWP 표준 기호(↵)와 불일치
- 프론트엔드(TypeScript): `view:para-mark` 커맨드가 TODO 상태, WasmBridge 메서드 미구현
- 강제 줄 바꿈(Shift+Enter) 기호 미지원
- WebGian 분석: `e_para_mark` 커맨드, `o9`/`u9` 독립 토글 플래그 사용

## 수행 범위

1. **백엔드 렌더러 수정**: 기호 ¶→↵ 변경, 강제 줄 바꿈 ↵ 기호 추가
2. **프론트엔드 토글 구현**: WasmBridge 메서드, 커맨드 실행부, 툴바/메뉴 연결
3. **빌드 검증**: 전체 테스트 + WASM + Vite 빌드 + SVG 내보내기

## 영향 범위

- Rust: `composer.rs`, `render_tree.rs`, `layout.rs`, `svg.rs`, `web_canvas.rs`, `html.rs`
- TypeScript: `wasm-bridge.ts`, `view.ts`
- HTML: `index.html`

## 리스크

- ComposedLine에 `has_line_break` 플래그 추가 시 기존 테스트 회귀 가능 → 단계별 검증
- `\n` 문자 제거 시 텍스트 오프셋 계산에 영향 → char_offset 추적 주의
