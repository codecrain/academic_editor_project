# 타스크 24 - 2단계 완료 보고서: WASM API 확장 (셀 텍스트 입력/삭제/리플로우)

## 변경 파일

### `src/wasm_api.rs`

#### 새 WASM API (2개)
- `insertTextInCell(section_idx, parent_para_idx, control_idx, cell_idx, cell_para_idx, char_offset, text)` — 셀 내부 문단에 텍스트 삽입
- `deleteTextInCell(section_idx, parent_para_idx, control_idx, cell_idx, cell_para_idx, char_offset, count)` — 셀 내부 문단에서 텍스트 삭제

#### 내부 메서드 (4개)
- `insert_text_in_cell_native()` — 삽입 네이티브 구현
- `delete_text_in_cell_native()` — 삭제 네이티브 구현
- `get_cell_paragraph_mut()` — 셀 문단 가변 참조 (경로 검증 포함)
- `get_cell_paragraph_ref()` — 셀 문단 불변 참조
- `reflow_cell_paragraph()` — 셀 폭/패딩 기반 line_segs 재계산

#### getPageTextLayout 확장
- TextRun JSON에 셀 식별 정보 추가: `parentParaIdx`, `controlIdx`, `cellIdx`, `cellParaIdx`
- 셀 내부 텍스트 run에만 포함, 본문 문단 run에는 영향 없음

#### 셀 리플로우 로직
- 셀 폭에서 셀 패딩(left/right) 차감 → 문단 여백 차감 → 가용 폭 계산
- 셀 패딩이 0이면 표 기본 패딩 사용 (기존 렌더링 로직과 동일)

## 빌드 및 테스트 결과
- 빌드: 성공
- 테스트: 338개 전체 통과
