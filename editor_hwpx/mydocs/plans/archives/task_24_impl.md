# 타스크 24: 표 안의 텍스트 입력 처리 - 구현 계획서

## 현재 문제점

1. **TextRunNode**: `section_index`, `para_index`만 보유 → 셀 내부 문단 식별 불가
2. **layout_table()**: 셀 문단 렌더링 시 `section_index=0, para_index=0` 하드코딩 (layout.rs:1131)
3. **insert_text/delete_text API**: `(section_idx, para_idx, char_offset)`만 지원 → 셀 문단 접근 불가
4. **reflow_paragraph()**: 페이지 컬럼 폭 기준 → 셀 폭 기준 리플로우 미지원
5. **editor.js**: 셀 문맥 인식 없이 본문 문단으로만 디스패치

## 구현 단계 (4단계)

---

### 1단계: TextRunNode 확장 및 셀 내 레이아웃 좌표 전달

**목표**: 렌더 트리의 TextRun이 셀 위치 정보를 갖도록 확장

**변경 파일**:
- `src/renderer/render_tree.rs` — TextRunNode에 셀 식별 필드 추가
- `src/renderer/layout.rs` — `layout_composed_paragraph()`에 셀 식별 파라미터 추가, `layout_table()` 호출부 수정

**상세**:
- TextRunNode에 필드 추가:
  - `parent_para_index: Option<usize>` — 표 컨트롤을 소유한 부모 문단 인덱스
  - `control_index: Option<usize>` — 부모 문단 내 컨트롤 인덱스
  - `cell_index: Option<usize>` — 테이블 내 셀 인덱스
  - `cell_para_index: Option<usize>` — 셀 내 문단 인덱스
- `layout_composed_paragraph()` 시그니처에 선택적 셀 정보 파라미터 추가
- `layout_table()`에서 셀 문단 렌더링 시 실제 인덱스 전달

---

### 2단계: WASM API 확장 (셀 텍스트 입력/삭제/리플로우)

**목표**: 셀 내부 문단에 대한 텍스트 편집 API 제공

**변경 파일**:
- `src/wasm_api.rs` — 셀 대상 insert/delete API 추가, 셀 리플로우 구현

**상세**:
- `insert_text_in_cell(section_idx, parent_para_idx, control_idx, cell_idx, cell_para_idx, char_offset, text)` 추가
- `delete_text_in_cell(...)` 동일 패턴으로 추가
- `reflow_cell_paragraph()` — 셀 폭 기반 리플로우 함수 추가
- `getPageTextLayout()` — collect_text_runs에서 셀 식별 정보를 JSON에 포함

---

### 3단계: 에디터 JS 연동 (히트테스트, 캐럿, 입력 디스패치)

**목표**: 셀 클릭 → 캐럿 표시 → 키 입력이 셀 문맥으로 전달

**변경 파일**:
- `web/text_selection.js` — `getDocumentPos()` 셀 정보 반환, `setCaretByDocPos()` 셀 지원
- `web/editor.js` — `handleTextInsert()`/`handleTextDelete()`에서 셀 API 분기 호출

**상세**:
- TextRun JSON에 셀 정보 포함 → hitTest 결과에 자동 반영
- `getDocumentPos()` 반환값에 `parentParaIdx`, `controlIdx`, `cellIdx`, `cellParaIdx` 추가
- `handleTextInsert()`: docPos에 셀 정보가 있으면 `insertTextInCell()` 호출, 없으면 기존 `insertText()` 호출
- `handleTextDelete()`: 동일 분기 처리
- 캐럿 복원 시 셀 정보 포함하여 `setCaretByDocPos()` 호출

---

### 4단계: 테스트 및 검증

**목표**: 셀 내 텍스트 편집이 정상 동작함을 확인

**내용**:
- 기존 테스트 전체 통과 확인
- 표 포함 HWP 파일로 셀 클릭 → 캐럿 표시 확인
- 셀 내 한글/영문 입력 확인
- 셀 내 Backspace/Delete 동작 확인
- 셀 내 편집 후 저장 → 재로드 라운드트립 확인
- SVG 내보내기 확인
