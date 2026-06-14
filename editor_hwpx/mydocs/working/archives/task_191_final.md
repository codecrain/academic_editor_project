# 타스크 191 최종 결과 보고서: 표 설정창 UI 고도화

## 개요

한글 워드프로세서의 표/셀 속성 대화상자를 참고하여 `TableCellPropsDialog`의 UI를 전면 고도화하고, 셀 테두리/배경 별도 대화상자를 신규 생성하였다. 추가로 캡션 렌더링 전 방향(상/하/좌/우) 지원, 한국어 IME 조합 중 커서 이동, Top 캡션 시 표 위치 보정 등을 구현하였다.

## 완료 단계

### 1단계: 전용 CSS 분리 + 대화상자 구조 개편
- `table-cell-props.css` 신규 생성 — 인라인 스타일 전량 CSS 클래스로 이전 (접두어 `tcp-`)
- 문맥별 탭 분기: 표 선택 → 6탭, 셀 선택 → 4탭 (테두리/배경 제외)

### 2단계: 표·셀·여백캡션 탭 고도화
- **표 탭**: 페이지 분할 3종 드롭다운, 자동 경계선 설정, "모두(A)" 일괄 여백 스피너
- **셀 탭**: "모두(A)" 일괄 여백, "한 줄로 입력(S)" 활성화, 세로쓰기 눕힘/세움 옵션
- **여백/캡션 탭**: "모두(A)" 바깥 여백, 캡션 위치 8종 SVG 아이콘 그리드, 캡션 크기/여백확대 옵션

### 3단계: 표 테두리·배경 탭 고도화
- **테두리 탭**: SVG 아이콘 기반 선 종류 시각적 격자 (8종), SVG 십자선 미리보기, 방향 버튼 3×3 그리드 배치, "선 모양 바로 적용" 체크박스, 자동 경계선 설정, 안내 문구
- **배경 탭**: 면색(C)/무늬색(K)/무늬모양(L) 3개 필드, CSS gradient 기반 무늬 프리뷰 (7종)

### 4단계: 셀 테두리/배경 별도 대화상자 + 컨텍스트 메뉴
- `CellBorderBgDialog` 신규 생성 (3탭: 테두리/배경/대각선)
- `applyMode: 'each' | 'asOne'` 적용 방식 분기
- 컨텍스트 메뉴에 "셀 테두리/배경" 2종 항목 추가

### 5단계: 캡션 렌더링 완성 + IME 수정 + 통합 검증
- **캡션 전 방향 렌더링**: Top/Bottom/Left/Right 캡션 위치 지원
- **Top 캡션 표 위치 보정**: `compute_table_y_position`의 자리차지(text_wrap=1) 분기에서 Top 캡션 시 `caption_height + caption_spacing`만큼 표 하향 이동
- **한국어 IME 커서 이동**: `e.code` 기반 네비게이션 키 감지 + `_pendingNavAfterIME` 패턴으로 조합 종료 후 이동 처리
- **캡션 커서 수정**: `cell_index: 65534` 센티널로 캡션 식별, `isTextBox` 플래그 제거로 올바른 이동 경로 사용
- `cargo test`: 657개 테스트 전체 통과
- `docker compose run --rm wasm`: WASM 빌드 성공

## 수정/생성 파일 목록

| 파일 | 변경 |
|------|------|
| `rhwp-studio/src/styles/table-cell-props.css` | 신규 생성 — 전용 CSS (1단계) |
| `rhwp-studio/src/ui/table-cell-props-dialog.ts` | 전면 개편 — 6탭/4탭 분기, 모든 탭 고도화 (1~3단계) |
| `rhwp-studio/src/ui/cell-border-bg-dialog.ts` | 신규 생성 — 셀 테두리/배경 대화상자 (4단계) |
| `rhwp-studio/src/command/commands/table.ts` | 커맨드 연결 + 캡션 cell_idx 수정 (4~5단계) |
| `rhwp-studio/src/core/types.ts` | 타입 확장 |
| `rhwp-studio/src/engine/input-handler.ts` | 컨텍스트 메뉴 + 캡션 isTextBox 제거 (4~5단계) |
| `rhwp-studio/src/engine/input-handler-keyboard.ts` | IME 조합 중 네비게이션 키 처리 (5단계) |
| `rhwp-studio/src/engine/input-handler-text.ts` | compositionEnd 후 pending nav 처리 (5단계) |
| `rhwp-studio/src/style.css` | CSS import 추가 |
| `src/document_core/commands/table_ops.rs` | 캡션 속성 변경 로직 (5단계) |
| `src/document_core/commands/text_editing.rs` | 캡션 텍스트 편집 지원 |
| `src/document_core/queries/cursor_rect.rs` | 캡션 커서 rect 계산 |
| `src/renderer/height_measurer.rs` | 캡션 높이 측정 개선 |
| `src/renderer/layout/table_layout.rs` | Top 캡션 표 위치 보정 (5단계 핵심 수정) |
| `src/renderer/layout/table_partial.rs` | 분할 표의 Top 캡션 처리 |

## 핵심 버그 수정 사항

### Top 캡션 시 표가 이동하지 않는 문제
- **원인**: 기본 표 `attr=0x082A2210` → `treat_as_char=false, text_wrap=1(자리차지)`
- `compute_table_y_position`의 첫 번째 분기(절대 위치 계산)에 Top 캡션 오프셋 처리 누락
- **수정**: 첫 번째 분기 반환값에 `caption_top_offset` 추가

### 한국어 IME 조합 중 화살표 이동 불가
- **원인**: `e.isComposing=true`일 때 `e.key`가 항상 `'Process'`로 보고되어 네비게이션 키 감지 실패
- **수정**: `e.code` 기반 감지 + pending nav 패턴 (synthetic event 방식은 문자 중복 발생하여 폐기)

### 캡션 내 커서 이동 불가
- **원인**: `isTextBox: true` 플래그로 인해 body text 경로(`navigateNextEditable`)를 사용
- **수정**: `isTextBox` 제거 → cell 경로(`moveHorizontalInCell`) 사용
