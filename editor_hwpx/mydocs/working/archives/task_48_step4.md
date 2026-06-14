# 타스크 48 단계 4 완료보고서

## 단계: 빌드 검증 + 런타임 테스트

## 수행 내용

### 빌드 검증

| 항목 | 결과 |
|------|------|
| `cargo test` (Docker) | **474 tests 통과** (0 failed) |
| `wasm-pack build` (Docker) | **성공** (release, 899KB) |
| `tsc --noEmit` | **통과** (0 errors) |
| `vite build` | **성공** (42.35KB JS) |

### 런타임 테스트 — 발견 버그 및 수정

총 **8건** 버그 발견 및 수정 완료.

#### 세션 1 버그 (5건)

| # | 증상 | 원인 | 수정 |
|---|------|------|------|
| 1 | TextStyle private 접근 에러 | `TextStyle` 필드 비공개 | `compute_char_positions()`에서 `TextStyle` 필드 접근 방식 수정 |
| 2 | 캐럿이 페이지 재렌더링 시 사라짐 | `innerHTML = ''`로 Canvas 재생성 시 캐럿 DOM 제거 | `caret-renderer.ts`에 `ensureAttached()` 추가 |
| 3 | 클릭 좌표가 페이지 오프셋 이중 계산 | `getBoundingClientRect`가 이미 스크롤 반영하는데 수동 보정 추가 | 수동 스크롤 보정 제거 |
| 4 | CSS 중앙정렬 보정 누락 | 캔버스가 `left:50%; translateX(-50%)`로 중앙 배치되나 좌표 변환에 미반영 | `pageLeft = (contentWidth - pageDisplayWidth) / 2` 보정 추가 |
| 5 | 클릭 시 포커스 이탈 | 컨테이너 클릭이 textarea 포커스를 빼앗음 | `e.preventDefault()` 추가 |

#### 세션 2 버그 (3건)

| # | 증상 | 원인 | 수정 |
|---|------|------|------|
| 6 | 테이블 셀 클릭 시 캐럿 미표시 | `collect_runs()`에서 `parent_para_index.is_none()` 필터로 셀 TextRun 제외 | 필터 제거, RunInfo에 셀 컨텍스트 필드 추가, `format_hit()` 헬퍼 도입 |
| 7 | 한글 IME 입력 비정상 | compositionstart/end 이벤트 미처리, `textarea.value` 즉시 클리어로 IME 상태 파괴 | IME 조합 이벤트 핸들러 추가, 실시간 조합 렌더링 구현 (compositionAnchor 패턴) |
| 8 | 테이블 영역 클릭 시 콘솔 오류 6회 | `find_pages_for_paragraph()`에서 `PartialTable`/`Shape` 미처리 (`_ => None`) | 모든 `PageItem` 변형 명시적 매칭 |

### 주요 확장 구현

#### A. 테이블 셀 편집 지원 (Rust + TypeScript)

**Rust (`wasm_api.rs`)**:
- `RunInfo` 구조체에 셀 컨텍스트 4필드 추가 (`parent_para_index`, `control_index`, `cell_index`, `cell_para_index`)
- `collect_runs()`: 셀 TextRun 필터 제거, 셀 컨텍스트 전파
- `format_hit()`: hitTest 결과에 셀 컨텍스트 포함 JSON 생성
- `getCursorRectInCell` WASM API 신규 추가 (6개 파라미터)
- `find_pages_for_paragraph()`: `PartialTable`, `Shape` 변형 처리

**TypeScript**:
- `types.ts`: `HitTestResult`, `DocumentPosition`에 셀 컨텍스트 옵셔널 필드 추가
- `wasm-bridge.ts`: 셀 API 래퍼 5개 추가 (`getCursorRectInCell`, `insertTextInCell`, `deleteTextInCell`, `getCellParagraphLength`, `getCellParagraphCount`)
- `cursor.ts`: `isInCell()` 판별, `moveHorizontalInCell()` 셀 내 좌우 이동, `updateRect()` 셀 분기
- `input-handler.ts`: `handleBackspace()`, `handleDelete()` 셀 분기, `insertTextAtRaw()`, `deleteTextAt()` 본문/셀 자동 분기

#### B. 한글 IME 실시간 조합 렌더링 (TypeScript)

- `compositionAnchor` 패턴: 조합 시작 위치 저장 → 매 input마다 이전 조합 텍스트 삭제 → 현재 조합 텍스트 삽입 → 재렌더링
- `compositionLength`: 문서에 삽입된 조합 텍스트 길이 추적
- Chrome/Firefox 호환: compositionend 전후 input 이벤트 순서 차이 대응
- `onKeyDown()`: `e.isComposing || e.keyCode === 229` 가드로 IME 처리 중 특수키 무시

### 런타임 검증 결과

| # | 테스트 항목 | 결과 |
|---|-----------|------|
| 1 | 본문 텍스트 클릭 시 캐럿 표시 | **통과** |
| 2 | 테이블 셀 클릭 시 캐럿 표시 | **통과** |
| 3 | 본문 텍스트 입력 (영문) | **통과** |
| 4 | 본문 텍스트 입력 (한글 IME) | **통과** |
| 5 | 테이블 셀 텍스트 입력 | **통과** |
| 6 | Backspace 삭제 (본문/셀) | **통과** |
| 7 | Delete 삭제 (본문/셀) | **통과** |
| 8 | Enter 문단 분할 | **통과** |
| 9 | 좌/우 화살표 이동 | **통과** |
| 10 | 줌 변경 시 캐럿 위치 유지 | **통과** |

## 변경 파일

| 파일 | 유형 | 내용 |
|------|------|------|
| `src/wasm_api.rs` | 수정 | 셀 hitTest, format_hit, getCursorRectInCell, PartialTable/Shape 처리 |
| `rhwp-studio/src/core/types.ts` | 수정 | 셀 컨텍스트 옵셔널 필드 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 수정 | 셀 API 래퍼 5개 + getCursorRectInCell 추가 |
| `rhwp-studio/src/engine/cursor.ts` | 수정 | 셀 내 커서 이동/좌표 갱신 분기 |
| `rhwp-studio/src/engine/caret-renderer.ts` | 수정 | ensureAttached(), CSS 중앙정렬 보정 |
| `rhwp-studio/src/engine/input-handler.ts` | 수정 | 셀 편집 라우팅, IME 조합 렌더링 |
