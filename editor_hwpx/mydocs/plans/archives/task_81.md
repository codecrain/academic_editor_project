# 타스크 81 수행계획서: 표 셀 세로쓰기 구현

## 배경

표 셀에 세로쓰기(`text_direction != 0`)가 설정된 경우 텍스트가 현재 가로로 렌더링된다. HWP 프로그램에서는 텍스트가 위→아래로 흐르고, 열은 오른쪽→왼쪽으로 배치된다.

### 현재 상태

- **파서**: `cell.text_direction` 이미 파싱됨 (control.rs:215, bits 16-18)
- **모델**: `Cell::text_direction: u8` 필드 존재 (table.rs:89)
- **렌더링**: text_direction을 **완전히 무시** — 가로 레이아웃만 수행

### table-004.hwp 진단 결과

| 셀 | 위치 | text_dir | 텍스트 | 크기(HU) |
|------|------|----------|--------|----------|
| Cell[12] | r=2,c=0 | **2** | "인프라(서버)" | 3850×8055 (좁고 높음) |
| Cell[43] | r=10,c=0 | **2** | "데이터" | 3850×7378 |
| Cell[74] | r=18,c=0 | **2** | "분석모델" | 3850×5273 |

모두 행 병합(row_span=3~7)된 좁은 좌측 카테고리 셀.

### HWP 세로쓰기 규칙 (도움말 문서)

- **text_direction 값**: 0=가로, 1=영문 눕힘(세로+영문회전), 2=영문 세움(세로+영문직립)
- **텍스트 방향**: 위→아래, 열은 오른쪽→왼쪽
- **정렬 매핑**: vertical_align의 의미가 변환됨
  - Top(위) → 가로 오른쪽
  - Center(가운데) → 가로 중앙
  - Bottom(아래) → 가로 왼쪽

## 목표

1. 세로쓰기 셀의 텍스트를 위→아래 방향으로 렌더링
2. 세로 정렬(가로 위치 매핑) 올바르게 처리
3. 기존 가로쓰기 셀 렌더링 회귀 없음

## 수행 범위

### 1단계: 렌더 파이프라인에 text_direction 전달

**파일**: `src/renderer/render_tree.rs`, `src/renderer/layout.rs`

- `TableCellNode`에 `text_direction: u8` 필드 추가
- `CellContext`에 `text_direction: u8` 필드 추가
- 셀 노드 생성 시 `cell.text_direction` 전달

### 2단계: 세로쓰기 레이아웃 함수 구현

**파일**: `src/renderer/layout.rs`

- `layout_vertical_cell_text()` 신규 함수
- 기존 `layout_composed_paragraph()`를 우회하여 글자를 수직 방향으로 직접 배치
- 정렬 매핑 적용 (vertical_align → 가로 위치)

### 3단계: 테스트 및 빌드 검증

- table-004.hwp SVG 내보내기 시각 검증
- 전체 테스트 통과 확인
- WASM/Vite 빌드 확인

## 수정 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `src/renderer/render_tree.rs` | TableCellNode에 text_direction 추가 | ~3줄 |
| `src/renderer/layout.rs` | CellContext 필드 추가, 세로 레이아웃 분기 + 함수 신규 | ~100줄 |
| `src/wasm_api.rs` | 회귀 테스트 추가 | ~40줄 |
