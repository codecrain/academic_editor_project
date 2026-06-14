# 타스크 166 - 1단계 완료 보고서: cursor_rect.rs 칼럼 추적

## 작업 내용

히트 테스트(`hit_test_native`)에서 다단 문서의 칼럼을 인식하도록 수정

### 수정 파일

| 파일 | 수정 내용 |
|------|-----------|
| `src/document_core/queries/cursor_rect.rs` | `RunInfo.column_index` 추가, `collect_runs()` 칼럼 추적, 히트 테스트 폴백 칼럼 필터링, `find_column_at_x()` 헬퍼 |

### 상세 변경사항

#### 1. `RunInfo`에 `column_index: Option<u16>` 필드 추가
- 각 TextRun이 어떤 칼럼에 속하는지 기록

#### 2. `collect_runs()` 칼럼 추적
- `current_column: Option<u16>` 파라미터 추가
- `Column(col_idx)` 렌더 노드 진입 시 `current_column = Some(col_idx)` 전파
- 자식 노드 재귀 시 칼럼 컨텍스트 유지

#### 3. 히트 테스트 폴백 칼럼 필터링
- **"같은 Y 라인" 폴백** (단계 2): 클릭 칼럼의 run만 필터
  - `click_column.is_none() || r.column_index.is_none() || r.column_index == click_column`
- **"가장 가까운 줄" 폴백** (단계 3): 클릭 칼럼의 run을 우선 후보로 사용
  - 칼럼 내 run이 없으면 전체 run에서 폴백

#### 4. `find_column_at_x()` 헬퍼 추가
- `PageAreas.column_areas`에서 클릭 x 좌표의 소속 칼럼 결정
- 단일 단(column_areas.len() <= 1)이면 `None` 반환 → 기존 동작 유지
- 칼럼 영역 사이(간격)에 클릭 시 가장 가까운 칼럼 반환

## 테스트 결과

```
cargo test: 608 passed; 0 failed
```

## 분석

`get_cursor_rect_native()`의 `find_cursor_in_node()`는 `char_start` 범위 매칭으로 이미 올바른 칼럼의 TextRun을 찾고 있어 수정 불필요했다. 같은 문단이 두 칼럼에 걸치는 `PartialParagraph` 경우에도 각 칼럼의 TextRun은 서로 다른 char 범위를 가지므로 정확히 구분된다.

핵심 문제는 히트 테스트 폴백이었으며, 이를 칼럼 필터링으로 해결했다.
