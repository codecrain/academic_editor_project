# 타스크 199: 문단부호 한컴 수준 교정 + 강제 줄바꿈(Shift+Enter) 구현

## 목표

1. 강제 줄바꿈(Shift+Enter) 편집 기능 구현
2. 문단부호 기호를 한컴 한/글과 동일하게 교정 (하드 리턴 / 강제 줄바꿈 구분)

## 현재 상태

### 완료된 인프라
- 파일 파싱: 0x000A → `\n` 변환 (body_text.rs)
- 직렬화: `\n` → 0x000A 역변환 (serializer/body_text.rs)
- `ComposedLine.has_line_break` 플래그 설정 (composer.rs)
- `TextRunNode.is_line_break_end` 필드 정의 (render_tree.rs)

### 미구현 항목
- 키보드 Shift+Enter 감지 → Enter와 구분 없음
- WASM API `insertLineBreak()` 없음
- 줄바꿈 삽입 커맨드 없음
- `is_line_break_end` 항상 false (layout.rs에서 미설정)
- 렌더러 기호: 하드 리턴과 강제 줄바꿈 모두 ⤵(U+21B5)로 동일

## 한컴 기준

| 항목 | 기호 | 색상 | 설명 |
|------|------|------|------|
| 하드 리턴 (Enter) | ↵ 형태 꺾은 화살표 | 파란색 | 문단 분리 |
| 강제 줄바꿈 (Shift+Enter) | 세로선 형태 (별도 기호) | 파란색 | 문단 유지, 줄만 바꿈 |

## 수행 범위

### A. 강제 줄바꿈 편집 기능
1. `InsertLineBreakCommand` 커맨드 클래스 생성 (TypeScript + Rust)
2. WASM API에 `insertLineBreak()` 함수 추가
3. 키보드 핸들러에서 Shift+Enter → `insertLineBreak()` 호출
4. 일반 Enter → 기존 `splitParagraph()` 유지

### B. 렌더러 기호 교정
1. `layout.rs`에서 `has_line_break` 기반으로 `is_line_break_end` 올바르게 설정
2. 하드 리턴 기호: ⤵ → 적절한 유니코드 문자로 교정
3. 강제 줄바꿈 기호: 하드 리턴과 구분되는 별도 기호
4. SVG/HTML/Canvas 렌더러 모두 적용

## 영향 범위

### Rust
- `src/wasm_api.rs` — insertLineBreak API 추가
- `src/document_core/commands/text_editing.rs` — 줄바꿈 삽입 로직
- `src/renderer/layout.rs` — is_line_break_end 설정 (현재 항상 false)
- `src/renderer/svg.rs` — 기호 교정
- `src/renderer/html.rs` — 기호 교정
- `src/renderer/web_canvas.rs` — 기호 교정

### TypeScript (rhwp-studio)
- `src/engine/input-handler-keyboard.ts` — Shift+Enter 감지
- `src/engine/command.ts` — InsertLineBreakCommand 추가
- `src/core/wasm-bridge.ts` — WASM 브릿지 확장

## 범위 외 (후속 타스크)
- 공백·탭 시각화 → 타스크 200
- 개체 부호([표], [그림] 등) → 타스크 201

## 참조
- 한컴 도움말: `mydocs/manual/hwp/Help/extracted/view/displaying_hard_return.htm`
- 기호 이미지: `mydocs/manual/hwp/Help/extracted/images/3v02_001.gif` (하드 리턴)
- 기호 이미지: `mydocs/manual/hwp/Help/extracted/images/3v_code(shift+enter).gif` (강제 줄바꿈)
