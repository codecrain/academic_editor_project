# 타스크 135 수행계획서 — 셀 나누기 (Cell Split) 기능 구현

## 배경

한컴의 "셀 나누기" 기능: 셀 선택 후 대화상자에서 줄 수/칸 수를 지정하면 해당 셀이 N×M 서브셀로 분할된다.

### 한컴 동작 방식

- **단일 셀 선택**: 해당 셀 내에서 줄/칸 나누기
- **다중 셀 선택 (F5)**: 선택된 셀 각각에 지정한 줄/칸으로 개별 나누기
- **규칙**: 나누기/합치기는 선택된 셀에서만 적용

### 기존 인프라

| 항목 | 상태 | 파일 |
|------|------|------|
| `Table::split_cell()` | 병합 해제만 지원 | `src/model/table.rs:691` |
| `splitTableCell` WASM API | 병합 해제 전용 | `src/wasm_api.rs:533` |
| `table:cell-split` 커맨드 | 병합 셀에서만 동작 | `rhwp-studio/src/command/commands/table.ts:183` |
| `insert_row/column` | 행/열 삽입 패턴 | `src/model/table.rs:292,371` |
| `Cell::new_from_template()` | 셀 복제 헬퍼 | `src/model/table.rs:133` |

## 구현 단계 (3단계)

---

### 1단계: Rust 모델

**파일**: `src/model/table.rs`

#### A. `split_cell_into()` — 단일 셀 N×M 분할

- `extra_cols = max(0, m_cols - cs)`, `extra_rows = max(0, n_rows - rs)` (span 고려)
- 기존 셀 조정: 우측 이동, 같은 열/행 span 확장
- 서브셀 col_span/row_span 균등 분배 (grid_cols를 m_cols개에 배분)
- 테스트 6개: 1×2, 2×1, 2×2, no-op, 폭 분배, 병합 후 분할

#### B. `split_cells_in_range()` — 다중 셀 범위 분할

- 열 우선 순서(우측→좌측), 각 열 내 행(하단→상단) 처리
- 같은 열 내 분할은 col_span만 확장하므로 좌측 셀에 영향 없음
- 이전 분할로 확장된 span(cs=m_cols)은 extra_cols=0으로 처리
- 테스트 2개: 2×2 범위 1×2 분할, 단일 셀 범위

---

### 2단계: WASM API + TypeScript 브릿지

- `splitTableCellInto` — 단일 셀 분할
- `splitTableCellsInRange` — 범위 내 다중 셀 분할
- TS 래퍼 2개 추가 (`wasm-bridge.ts`)

---

### 3단계: 대화상자 UI + 커맨드 연결

#### 대화상자 (`cell-split-dialog.ts`)

```
┌───────────────────────────────────────────┐
│ 셀 나누기                            [×]  │
├─────────────────────────────┬─────────────┤
│ ─ 줄/칸 나누기 ───────────  │ [나누기(D)] │
│ ☐ 줄 수(R): [2  ▴▾]       │ [취  소]    │
│ ☑ 칸 수(C): [2  ▴▾]       │             │
│                             │             │
│ ─ 선택 사항 ──────────────  │             │
│ ☐ 줄 높이를 같게 나누기(H)  │             │
│ ☐ 셀을 합친 후 나누기(M)    │             │
└─────────────────────────────┴─────────────┘
```

#### 커맨드 (`table:cell-split`)

- F5 셀 선택 모드: `splitTableCellsInRange` (범위 분할)
- 단일 셀: `splitTableCellInto` (개별 분할)
- "셀을 합친 후 나누기" 체크박스: 다중 셀 모드에서는 disabled

---

## 변경 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `src/model/table.rs` | `split_cell_into()` + `split_cells_in_range()` + 테스트 8개 | +200줄 |
| `src/wasm_api.rs` | WASM 바인딩 2개 + 네이티브 메서드 2개 | +70줄 |
| `rhwp-studio/src/core/wasm-bridge.ts` | TS 래퍼 2개 | +20줄 |
| `rhwp-studio/src/ui/cell-split-dialog.ts` | 대화상자 (신규) | +190줄 |
| `rhwp-studio/src/command/commands/table.ts` | 커맨드 연결 (단일/다중 분기) | 수정 30줄 |
| **합계** | | **+510줄** |

## 검증 결과

1. `docker compose run --rm test` — 581개 테스트 전체 통과
2. `docker compose run --rm wasm` — WASM 빌드 성공
3. `npx tsc --noEmit` — TypeScript 컴파일 성공
4. 수동 테스트: 단일 셀 분할, 다중 셀 범위 분할, 병합 셀 분할
