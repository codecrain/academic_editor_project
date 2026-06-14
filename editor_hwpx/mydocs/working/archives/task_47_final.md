# 타스크 47 최종 결과보고서

## 타스크: WASM 코어 확장 Phase 1 (기본 편집 API 7개)

## 개요

설계서 §9.2 Phase 1에 정의된 7개 편집 보조 API를 Rust WASM 코어(`wasm_api.rs`)에 추가하였다. 기존 API의 시그니처/동작을 변경하지 않으며, 메서드 추가만 수행하였다.

## 추가된 API 목록

| No | API | 시그니처 | 용도 |
|----|-----|---------|------|
| 1 | `getSectionCount` | `() → u32` | 구역 수 조회 |
| 2 | `getParagraphCount` | `(sec) → u32` | 구역 내 문단 수 |
| 3 | `getParagraphLength` | `(sec, para) → u32` | 문단 글자 수 (커서 경계) |
| 4 | `getTextRange` | `(sec, para, offset, count) → String` | 텍스트 부분 추출 (Undo용) |
| 5 | `getCellParagraphCount` | `(sec, para, ctrl, cell) → u32` | 셀 내 문단 수 |
| 6 | `getCellParagraphLength` | `(sec, para, ctrl, cell, cellPara) → u32` | 셀 내 문단 글자 수 |
| 7 | `getTextInCell` | `(sec, para, ctrl, cell, cellPara, offset, count) → String` | 셀 내 텍스트 추출 |

## 구현 상세

### 설계 원칙 준수 (§9.4)

| 원칙 | 적용 |
|------|------|
| JSON 직렬화 | `getTextRange`, `getTextInCell`은 문자열 직접 반환 (JSON 불필요) |
| char index 기준 | 모든 위치 파라미터는 Rust char 인덱스 |
| WASM + Native | 7개 모두 WASM/Native 양쪽 구현 |
| 오류 처리 | `Result<T, JsValue>` / `Result<T, HwpError>` |
| 기존 코드 무변경 | `wasm_api.rs`에 메서드 추가만 수행 |

### 코드 구조

```
wasm_api.rs 추가 위치:
  WASM 메서드 (7개)  → merge_paragraph 뒤, exportHwp 앞
  Native 메서드 (6개) → merge_paragraph_native 뒤, export_hwp_native 앞
```

- `getSectionCount`: 단순 조회 → `u32` 직접 반환 (오류 불가, Native 불필요)
- 나머지 6개: WASM은 Native 위임, Native는 인덱스 검증 + 오류 처리
- 셀 API 3개: 기존 `get_cell_paragraph_ref()` 헬퍼 활용
- 텍스트 추출: `para.text.chars().collect::<Vec<char>>()` → 범위 슬라이싱

## 검증 결과

| 항목 | 결과 |
|------|------|
| `cargo test` (Docker) | **474 tests 통과** (0 failed) |
| `wasm-pack build` (Docker) | **성공** (29.2s, release 최적화) |
| `pkg/rhwp.d.ts` | 7개 API 시그니처 모두 포함 |
| 기존 API 호환성 | 변경 없음 확인 |

### TypeScript 시그니처 (자동 생성)

```typescript
// pkg/rhwp.d.ts
getSectionCount(): number;
getParagraphCount(section_idx: number): number;
getParagraphLength(section_idx: number, para_idx: number): number;
getTextRange(section_idx: number, para_idx: number, char_offset: number, count: number): string;
getCellParagraphCount(section_idx: number, parent_para_idx: number, control_idx: number, cell_idx: number): number;
getCellParagraphLength(section_idx: number, parent_para_idx: number, control_idx: number, cell_idx: number, cell_para_idx: number): number;
getTextInCell(section_idx: number, parent_para_idx: number, control_idx: number, cell_idx: number, cell_para_idx: number, char_offset: number, count: number): string;
```

## 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/wasm_api.rs` | Phase 1 WASM 메서드 7개 + Native 메서드 6개 추가 |

## 산출물

| 문서 | 경로 |
|------|------|
| 수행계획서 | `mydocs/plans/task_47.md` |
| 단계 1-2 완료보고 | `mydocs/working/task_47_step1.md` |
| 최종 결과보고서 | `mydocs/working/task_47_final.md` |
