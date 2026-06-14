# 타스크 166 - 2단계 완료 보고서: cursor_nav.rs 칼럼 경계 인식 수직 이동

## 작업 내용

수직 화살표 이동(ArrowUp/Down)에서 다단 칼럼 경계를 인식하도록 수정

### 수정 파일

| 파일 | 수정 내용 |
|------|-----------|
| `src/document_core/queries/cursor_nav.rs` | 칼럼 경계 헬퍼 3개 추가, CASE A/B 칼럼 전환 시 preferredX 변환 |

### 상세 변경사항

#### 1. `get_column_area_for_paragraph()` 헬퍼 추가
- `para_column_map`에서 문단의 칼럼 인덱스를 조회
- 해당 페이지의 `column_areas`에서 칼럼 영역(col_idx, x, width) 반환
- 단일 단이면 `None` 반환 → 기존 동작 유지

#### 2. `transform_preferred_x_across_columns()` 헬퍼 추가
- 칼럼 간 이동 시 preferredX를 대상 칼럼 좌표계로 변환
- 상대 좌표 보존: `(preferred_x - from_area.x) + to_area.x`
- 같은 칼럼이거나 단일 단이면 변환 없음

#### 3. `find_column_for_line()` 헬퍼 추가
- 특정 문단의 특정 줄이 속한 칼럼 판별
- 페이지네이션 결과의 `ColumnContent.items`에서 `PartialParagraph { start_line, end_line }` 검사
- `FullParagraph`는 해당 칼럼의 모든 줄
- 단일 단이면 `None` 반환

#### 4. CASE A 수정: 같은 문단 내 칼럼 경계 이동
- `move_vertical_native()`의 CASE A에서 현재 줄과 목표 줄의 칼럼이 다를 때 preferredX 변환
- `find_column_for_line()`으로 현재/목표 줄의 칼럼을 판별
- 칼럼이 다르면 `(actual_px - from_x) + to_x`로 변환 후 `find_char_at_x_on_line()` 호출
- 셀 내부(`cell_ctx.is_some()`)에서는 변환 건너뜀 (셀은 다단 아님)

#### 5. CASE B 수정: 문단 경계 칼럼 전환
- `handle_body_boundary()`에서 `enter_paragraph()` 호출 전에 `transform_preferred_x_across_columns()` 적용
- 칼럼0 마지막 문단 → 칼럼1 첫 문단, 또는 그 반대의 경우 preferredX가 올바른 칼럼 좌표로 변환됨

### 동작 시나리오

```
칼럼0             칼럼1
┌──────────┐   ┌──────────┐
│ 문단0     │   │ 문단3     │
│ 문단1     │   │ 문단4     │
│ 문단2▮    │   │           │  ← 커서가 문단2 마지막 줄에 있을 때
└──────────┘   └──────────┘

ArrowDown:
  CASE B → handle_body_boundary()
  → transform_preferred_x_across_columns(sec, para=2, to_para=3)
  → preferredX를 칼럼1 좌표계로 변환
  → enter_paragraph(sec, 3, +1, adjusted_px)
  → 문단3의 첫 줄에서 변환된 x에 가장 가까운 문자로 이동
```

```
PartialParagraph 케이스:
  하나의 문단이 칼럼0의 줄 0~3, 칼럼1의 줄 4~7에 걸쳐 있을 때
  CASE A → find_column_for_line(sec, para, 3) → 칼럼0
           find_column_for_line(sec, para, 4) → 칼럼1
  → preferredX 변환 후 find_char_at_x_on_line() 호출
```

## 테스트 결과

```
cargo test: 608 passed; 0 failed
```

## 분석

- 단일 단 문서에서는 모든 헬퍼가 `None`을 반환하여 기존 동작에 영향 없음
- `collect_matching_runs()` 수정은 불필요: `char_range` 필터링이 이미 올바른 칼럼의 TextRun만 선택 (각 줄의 char_range는 유일)
- 구역 간 이동(이전/다음 구역)에서는 `transform_preferred_x_across_columns()`가 다른 구역 문단에 대해 `None`을 반환하므로 변환 없음 (정상)
