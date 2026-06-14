# Task 234 - F11 키 기능 구현 (컨트롤 선택)

## 목표

한컴의 F11 키 동작을 구현한다. 현재 커서 위치에서 **이전 방향**으로 가장 가까운 컨트롤(표, 그림, 글상자, 수식 등)을 찾아 객체 선택한다.

## 현재 상태

- F11: 현재 커서 위치의 필드(누름틀) 블록만 선택 (`input-handler-keyboard.ts:494-515`)
- 표 객체 선택: `cursor.enterTableObjectSelectionDirect(sec, ppi, ci)`
- 그림/글상자 객체 선택: `cursor.enterPictureObjectSelectionDirect(sec, ppi, ci, type)`
- 컨트롤 텍스트 위치 매핑: `find_control_text_positions()` — char_offsets 갭으로 컨트롤의 문단 내 문자 위치 결정

## 구현 계획

### 1단계: 백엔드 — `findNearestControlBackward` WASM API 추가

**파일**: `src/document_core/commands/text_editing.rs`, `src/wasm_api.rs`

커서 위치(secIdx, paraIdx, charOffset)에서 이전 방향으로 가장 가까운 선택 가능 컨트롤을 찾는 함수 추가.

- `find_control_text_positions()`로 각 컨트롤의 문단 내 문자 위치 매핑
- 현재 문단에서 charOffset 이전의 컨트롤을 역순 탐색
- 없으면 이전 문단으로 이동하며 탐색 (섹션 경계까지)
- 선택 대상 컨트롤: Table, Shape, Picture, Equation
- 반환: `{"type":"table"|"shape"|"picture"|"equation","sec":N,"para":N,"ci":N}` 또는 `{"type":"none"}`

### 2단계: 프론트엔드 — F11 핸들러 수정

**파일**: `rhwp-studio/src/engine/input-handler-keyboard.ts`

- 기존 필드 선택 로직 제거 (또는 fallback으로 유지)
- `findNearestControlBackward` 호출
- 반환 타입에 따라 적절한 선택 모드 진입:
  - `table` → `cursor.enterTableObjectSelectionDirect(sec, para, ci)`
  - `shape`/`picture`/`equation` → `cursor.enterPictureObjectSelectionDirect(sec, para, ci, type)`
- 선택 후 캐럿 업데이트 및 화면 갱신

### 3단계: 테스트 및 검증

- `cargo test` — 기존 테스트 통과 확인
- WASM 빌드 후 브라우저에서 F11 동작 검증
  - 표 앞에 커서 → F11 → 표 선택됨
  - 그림 앞에 커서 → F11 → 그림 선택됨
  - 문단 경계를 넘어 이전 문단의 컨트롤 선택 확인
