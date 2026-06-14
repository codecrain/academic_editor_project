# 타스크 199 구현 계획서: 문단부호 한컴 수준 교정 + 강제 줄바꿈 구현

## 단계 구성 (3단계)

### 1단계: 강제 줄바꿈(Shift+Enter) 편집 기능 구현

**Rust 측:**
- `src/document_core/commands/text_editing.rs`에 `insert_line_break_native()` 함수 추가
  - 현재 커서 위치의 문단 텍스트에 `\n` 문자 삽입
  - 커서를 다음 위치로 이동
- `src/wasm_api.rs`에 `insertLineBreak(para_idx, char_idx)` WASM API 노출

**TypeScript 측:**
- `rhwp-studio/src/engine/command.ts`에 `InsertLineBreakCommand` 클래스 추가
- `rhwp-studio/src/engine/input-handler-keyboard.ts`에서 Enter 케이스에 `e.shiftKey` 분기 추가
  - Shift+Enter → `InsertLineBreakCommand` 실행
  - Enter → 기존 `SplitParagraphCommand` 유지
- `rhwp-studio/src/core/wasm-bridge.ts`에 `insertLineBreak()` 브릿지 추가

**검증:**
- cargo test 통과
- WASM 빌드 후 웹에서 Shift+Enter 입력 시 줄바꿈 동작 확인

### 2단계: is_line_break_end 플래그 정상화 + 렌더러 기호 교정

**layout.rs 수정:**
- `is_line_break_end` 설정 로직 추가: `ComposedLine.has_line_break` 기반으로 마지막 TextRunNode에 true 설정

**렌더러 기호 교정 (SVG/HTML/Canvas):**
- 하드 리턴(is_para_end): ⤵(U+21B5) → ↵(U+21B5) 유지 또는 ¶(U+00B6)로 변경
  - 한컴 이미지 참고하여 최적 유니코드 선정
- 강제 줄바꿈(is_line_break_end): 별도 기호 사용 (하드 리턴과 구분)
- 색상 #4A90D9 유지 (파란색)

**검증:**
- 기존 HWP 파일에서 줄바꿈이 포함된 문단의 렌더링 확인
- 문단부호 표시 토글 시 두 기호가 구분되어 표시되는지 확인

### 3단계: 테스트 + WASM 빌드 + 검증

**네이티브 테스트:**
- 줄바꿈 삽입 단위 테스트 추가
- 문단부호 기호 렌더링 테스트 추가
- 전체 cargo test 통과 확인

**WASM 빌드 및 통합 검증:**
- Docker WASM 빌드
- 웹 편집기에서 E2E 동작 확인:
  1. Shift+Enter 입력 → 줄바꿈 삽입 (문단 분리 없음)
  2. 문단부호 표시 시 하드 리턴과 강제 줄바꿈 기호 구분
  3. 기존 HWP 파일 열기 → 줄바꿈 포함 문서 정상 렌더링
