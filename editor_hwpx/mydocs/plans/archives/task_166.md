# 타스크 166 수행계획서: 다단 편집 설계 및 구현

## 개요

| 항목 | 내용 |
|------|------|
| 타스크 | 166 (백로그 B-006 승격) |
| 제목 | 다단 편집 설계 및 구현 |
| 우선순위 | P0 |
| 작성일 | 2026-02-26 |

## 배경

현재 다단(multi-column) 레이아웃은 **렌더링만** 지원한다.
- `ColumnDef` 모델, `PageLayoutInfo.column_areas`, `PaginationState.current_column`, `ColumnContent` 등 렌더링 인프라 완비
- 렌더 트리에 `Column(u16)` 노드 존재, 칼럼 구분선 렌더링 정상
- 그러나 편집(커서 이동, 히트 테스트, 선택)에서 칼럼을 인식하지 못함

## 현재 문제점

1. **커서 좌표 조회 오류**: `get_cursor_rect_native()`가 같은 `(sec, para)`의 TextRun이 여러 칼럼에 존재할 때 잘못된 칼럼의 TextRun을 찾을 수 있음
2. **히트 테스트 폴백 오류**: `hit_test_native()`의 "같은 Y 라인" 폴백에서 다른 칼럼의 TextRun을 매칭할 수 있음
3. **수직 이동 불가**: ArrowDown이 칼럼0 바닥에서 칼럼1 상단으로 이동하지 못함
4. **선택 영역 오류**: 칼럼 간 선택 시 렌더링 문제 가능

## 핵심 인사이트

**`DocumentPosition`에 `columnIndex` 필드 추가 불필요.** 칼럼은 렌더링 개념이며, `(sectionIndex, paragraphIndex, charOffset)` 조합과 페이지네이션 데이터(`PartialParagraph { start_line, end_line }`)로 칼럼이 결정된다.

실제 수정 필요 범위는 Rust 쪽 쿼리 함수들(커서 좌표, 히트 테스트, 수직 이동)에서 `Column(u16)` 렌더 트리 노드를 추적하도록 하는 것이다.

## 수정 대상 파일

| 파일 | 역할 |
|------|------|
| `src/document_core/queries/cursor_rect.rs` | 커서 좌표 조회 + 히트 테스트 |
| `src/document_core/queries/cursor_nav.rs` | 수직 이동 + 셀렉션 영역 |
| `src/document_core/mod.rs` | 페이지네이션 데이터 접근 헬퍼 |

## 구현 단계 (4단계)

### 1단계: 칼럼 추적 렌더 트리 탐색 (cursor_rect.rs)

커서 좌표 조회와 히트 테스트에서 `Column(u16)` 노드를 추적하여 올바른 칼럼의 TextRun만 매칭

- `find_cursor_in_node()`에 `current_column: Option<u16>` 파라미터 추가
- `collect_runs()`의 `RunInfo`에 `column_index` 필드 추가
- "같은 Y 라인" 폴백에서 클릭 X가 속한 칼럼의 TextRun만 필터

### 2단계: 칼럼 경계 인식 수직 이동 (cursor_nav.rs)

ArrowDown/Up이 칼럼 경계를 넘어 이동하도록 수정

- `collect_matching_runs()`에 칼럼 추적 추가
- `find_position_column()` 헬퍼 — `(sec, para, offset)` → `(page, column)` 결정
- `handle_body_boundary()` — 칼럼 경계에서 인접 칼럼으로 이동
- `get_adjacent_column_position()` — 인접 칼럼의 첫/마지막 콘텐츠 위치

### 3단계: 선택 영역 칼럼 인식

1단계 수정이 적용되면 선택 사각형이 자동으로 올바른 칼럼에 렌더링됨. 추가 확인 및 엣지 케이스 처리.

### 4단계: 검증 및 엣지 케이스

- 기존 608개 테스트 통과 (회귀 없음)
- 다단 샘플 파일로 Studio에서 수동 테스트
- 엣지 케이스: 불균등 칼럼 너비, 단 수 변경 경계, 표 in 다단

## 검증 방법

```bash
cargo test                              # 608개 테스트 통과
cargo run --bin rhwp -- export-svg samples/multi-column.hwp --output output/
# Studio에서 다단 문서 편집 테스트
```

## 예상 일정

4단계, 각 단계 완료 후 보고서 작성 및 승인 요청
