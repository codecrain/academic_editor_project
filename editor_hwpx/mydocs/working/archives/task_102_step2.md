# 타스크 102 — 2단계 완료 보고서

## 단계명
통합 표 레이아웃 엔진

## 작업 기간
2026-02-17

## 수정 내역

### 1. layout_table() 시그니처 통합
- 기존: `paragraphs, para_index, control_index` → Table을 간접 추출
- 변경: `table: &Table` 직접 전달 + `depth`, `table_meta`, `host_alignment` 추가
- `depth`: 0=최상위 표 (캡션, 수평정렬 포함), 1+=중첩 표
- `table_meta: Option<(usize, usize)>`: 최상위 표의 (para_index, control_index) 메타데이터
- `host_alignment: Alignment`: 포함 문단의 정렬 (표 수평 배치용)

### 2. depth 기반 분기 로직
- 수평 정렬: depth==0일 때만 host_alignment 기반 배치, 중첩은 영역 좌측
- 캡션 계산/렌더링: depth==0일 때만 수행
- TableNode 메타데이터: table_meta에서 추출 (중첩: None)
- CellContext: table_meta에서 생성 (중첩: None)
- 반환값: depth==0 → y_start + total_height (절대), depth>0 → table_height (상대)

### 3. 호출부 6곳 전수 수정
- 마스터 페이지 (line ~242): `Control::Table(t)` 패턴으로 table 직접 추출
- 본문 (line ~429): `paragraphs.get()` + `para.controls.get()` 로 table 추출
- 머리글/꼬리글 (line ~870): `if let Control::Table(t) = ctrl`
- layout_table 셀 루프 중첩 표 (line ~1967): `depth + 1` 재귀
- layout_partial_table 셀 루프 중첩 표 (line ~2719): `depth = 1`

### 4. layout_vertical_cell_text 시그니처 변경
- `para_index, control_index` → `table_meta: Option<(usize, usize)>`
- TextRunNode의 parent_para_index/control_index를 table_meta에서 추출

### 5. 함수 삭제
- `layout_nested_table()`: 252줄 삭제 — layout_table(depth>0)으로 완전 대체
- `calc_nested_table_height()`: 36줄 삭제 — 호출부 없는 dead code

### 6. 중첩 표 품질 개선 (부수 효과)
통합으로 중첩 표가 자동으로 다음 기능을 획득:
- 열 폭 constraint solving (병합 셀 폭 정확성)
- 행 높이 컨텐츠 기반 조정 (내용 잘림 방지)
- 세로 정렬 (Top/Center/Bottom)
- CellContext 전달 가능 (향후 커서 추적)

## 테스트 결과
- 554개 테스트 통과 (기존 554 유지)
- WASM 빌드 성공
- Vite 빌드 성공

## 수정 파일
| 파일 | 변경 |
|------|------|
| `src/renderer/layout.rs` | +136줄, -397줄 (순삭 261줄) |

## 코드 규모 변화
- layout_table(): 640줄 → ~680줄 (depth 분기 추가)
- layout_nested_table(): 252줄 → 삭제
- calc_nested_table_height(): 36줄 → 삭제
- **전체: ~288줄 순감소**
