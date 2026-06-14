# 타스크 84 완료 보고서: 표/셀 속성 다이얼로그

## 완료 요약

HWP 표준 6개 탭(기본, 여백/캡션, 테두리, 배경, 표, 셀) 구조의 표/셀 속성 대화상자를 구현했다. 표 탭(쪽 나눔, 제목줄 반복, 셀 안여백)과 셀 탭(크기, 안여백, 세로정렬, 세로쓰기, 제목셀)은 WASM API를 통해 실제 조회/수정이 가능하며, 나머지 탭(기본, 여백/캡션, 테두리, 배경)은 UI를 미리 구축하여 향후 기능 연결이 가능하도록 설계했다.

## 변경 파일

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `src/wasm_api.rs` | 수정 | `getCellProperties`, `setCellProperties`, `getTableProperties`, `setTableProperties` API 4개 추가 |
| `rhwp-studio/src/core/types.ts` | 수정 | `CellProperties`, `TableProperties` 인터페이스 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 수정 | 4개 브릿지 메서드 추가 |
| `rhwp-studio/src/ui/table-cell-props-dialog.ts` | 신규 | 6탭 표/셀 속성 다이얼로그 클래스 |
| `rhwp-studio/src/command/commands/table.ts` | 수정 | `table:cell-props` 커맨드에 다이얼로그 표시 로직 연결 |
| `rhwp-studio/src/engine/input-handler.ts` | 수정 | `getCursorPosition()` 공개 메서드 추가 |
| `rhwp-studio/src/style.css` | 수정 | 탭 UI 스타일 추가 (.dialog-tabs, .dialog-tab, .dialog-tab-panel, .dialog-btn-group, .dialog-checkbox 등) |

## 구현 상세

### 1. WASM API (Rust)

- **getCellProperties**: 셀의 width, height, padding(4방향), verticalAlign, textDirection, isHeader를 HWPUNIT으로 반환
- **setCellProperties**: JSON으로 전달된 셀 속성 업데이트 → 재렌더링
- **getTableProperties**: 표의 cellSpacing, padding(4방향), pageBreak, repeatHeader 반환
- **setTableProperties**: JSON으로 전달된 표 속성 업데이트 → 재렌더링

### 2. 다이얼로그 6탭 구성

| 탭 | 상태 | 활성 필드 |
|----|------|-----------|
| 기본 | disabled | 크기, 위치, 배치, 개체 보호 (향후 연결용) |
| 여백/캡션 | disabled | 바깥 여백, 캡션 위치/크기/간격 (향후 연결용) |
| 테두리 | 부분 활성 | 셀 간격(활성), 선 종류/굵기/색/미리보기(disabled) |
| 배경 | disabled | 채우기, 그러데이션, 그림 (향후 연결용) |
| 표 | **활성** | 쪽 경계 나눔(라디오), 제목줄 자동 반복, 모든 셀 안여백(4방향) |
| 셀 | **활성** | 너비/높이, 안여백(4방향), 세로정렬(3버튼), 세로쓰기(2버튼), 제목셀 |

### 3. 커맨드 연결

- `table:cell-props` 커맨드: 현재 커서 위치에서 표/셀 컨텍스트 추출 → TableCellPropsDialog 표시
- 컨텍스트 메뉴 "표/셀 속성" 클릭 시 다이얼로그 열림
- 확인 버튼: setCellProperties + setTableProperties 호출 → document-changed 이벤트

## 검증 결과

- Rust 테스트: 496개 통과
- WASM 빌드: 성공
- Vite 빌드: 성공 (39 modules)

## 브랜치

- `local/table-edit` → `local/task84`
