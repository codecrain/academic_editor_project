# 타스크 47 수행계획서

## 타스크: WASM 코어 확장 Phase 1 (기본 편집 API 7개)

## 목표

설계서 §9.2 Phase 1에 정의된 **7개 편집 보조 API**를 Rust WASM 코어(`wasm_api.rs`)에 추가한다. 기존 API의 시그니처/동작을 변경하지 않으며, 메서드 추가만 수행한다.

## 추가할 API 목록

| No | API | 시그니처 | 용도 |
|----|-----|---------|------|
| 1 | **getSectionCount** | `() → u32` | 구역 수 |
| 2 | **getParagraphCount** | `(sec) → u32` | 구역 내 문단 수 |
| 3 | **getParagraphLength** | `(sec, para) → u32` | 문단 글자 수 (커서 경계) |
| 4 | **getTextRange** | `(sec, para, offset, count) → String` | 텍스트 부분 추출 (Undo용) |
| 5 | **getCellParagraphCount** | `(sec, para, ctrl, cell) → u32` | 셀 내 문단 수 |
| 6 | **getCellParagraphLength** | `(sec, para, ctrl, cell, cellPara) → u32` | 셀 내 문단 길이 |
| 7 | **getTextInCell** | `(sec, para, ctrl, cell, cellPara, offset, count) → String` | 셀 내 텍스트 추출 |

## 구현 패턴

설계서 §9.4 API 설계 원칙을 따른다:

- **WASM + Native 양쪽 구현**: `fn get_xxx() → Result<String, JsValue>` + `fn get_xxx_native() → Result<String, HwpError>`
- **JSON 직렬화**: 반환값은 JSON 문자열
- **char index 기준**: 모든 위치 파라미터는 Rust char 인덱스
- **기존 코드 변경 없음**: `wasm_api.rs`에 메서드 추가만

## 수행 단계

### 단계 1: 문서/구역/문단 query API 4개

`wasm_api.rs`에 다음 4개 API 추가 (WASM + Native):
- `getSectionCount` / `get_section_count_native`
- `getParagraphCount` / `get_paragraph_count_native`
- `getParagraphLength` / `get_paragraph_length_native`
- `getTextRange` / `get_text_range_native`

TypeScript 타입 정의 확인 (`pkg/rhwp.d.ts` 자동 생성 여부).

### 단계 2: 셀 query API 3개

`wasm_api.rs`에 다음 3개 API 추가 (WASM + Native):
- `getCellParagraphCount` / `get_cell_paragraph_count_native`
- `getCellParagraphLength` / `get_cell_paragraph_length_native`
- `getTextInCell` / `get_text_in_cell_native`

기존 `get_cell_paragraph_ref()` 헬퍼 활용.

### 단계 3: WASM 빌드 및 테스트 검증

- Docker WASM 빌드 (`docker compose run --rm wasm`)
- Docker 테스트 실행 (`docker compose run --rm test`)
- 생성된 `pkg/rhwp.d.ts`에 7개 API 시그니처 포함 확인
- 최종 결과보고서 작성

## 산출물

| 문서 | 경로 |
|------|------|
| 수행계획서 | `mydocs/plans/task_47.md` |
| 단계별 완료보고서 | `mydocs/working/task_47_step{N}.md` |
| 최종 결과보고서 | `mydocs/working/task_47_final.md` |
