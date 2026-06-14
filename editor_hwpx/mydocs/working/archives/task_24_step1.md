# 타스크 24 - 1단계 완료 보고서: TextRunNode 확장 및 셀 내 레이아웃 좌표 전달

## 변경 파일

### 1. `src/renderer/render_tree.rs`
- `TextRunNode` 구조체에 셀 식별 필드 4개 추가:
  - `parent_para_index: Option<usize>` — 표 컨트롤을 소유한 부모 문단 인덱스
  - `control_index: Option<usize>` — 부모 문단 내 컨트롤 인덱스
  - `cell_index: Option<usize>` — 테이블 내 셀 인덱스
  - `cell_para_index: Option<usize>` — 셀 내 문단 인덱스

### 2. `src/renderer/layout.rs`
- `CellContext` 구조체 신규 추가 — 셀 식별 정보를 묶어 전달하는 용도
- `layout_composed_paragraph()` 시그니처에 `cell_ctx: Option<CellContext>` 파라미터 추가
- `layout_table()` 시그니처에 `section_index: usize` 파라미터 추가
- 표 셀 루프를 `enumerate()`로 변경하여 `cell_idx` 확보
- 셀 내 문단 레이아웃 호출 시 실제 `CellContext` 전달 (section_index, para_index, control_index, cell_idx, cell_para_idx)
- 기존 호출부 6곳(본문, 캡션, 각주, 텍스트박스, 중첩표)에 `None` 전달
- 모든 TextRunNode 생성부에 새 필드 4개 추가 (본문 문단은 `cell_ctx`에서, 기타는 `None`)

## 빌드 및 테스트 결과
- 빌드: 성공
- 테스트: 338개 전체 통과
