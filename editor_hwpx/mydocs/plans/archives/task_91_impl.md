# 타스크 91: 다단 레이아웃 처리 — 구현계획서

## 구현 단계 (3단계)

### 1단계: ColumnDef 추출 + 페이지네이션 연결

**목표**: 구역의 실제 ColumnDef를 페이지네이션에 전달하여 다단 레이아웃을 활성화한다.

**수정 파일**: `src/wasm_api.rs`

**작업 내용**:
1. `paginate()` 함수에서 구역의 문단들을 순회하여 첫 번째 `Control::ColumnDef`를 추출하는 헬퍼 함수 작성
   ```rust
   fn find_initial_column_def(paragraphs: &[Paragraph]) -> ColumnDef {
       for para in paragraphs {
           for ctrl in &para.controls {
               if let Control::ColumnDef(cd) = ctrl {
                   return cd.clone();
               }
           }
           // ColumnDef는 보통 첫 문단에 있으므로 몇 문단만 검색
           if para.column_type != ColumnBreakType::None {
               break;
           }
       }
       ColumnDef::default()
   }
   ```
2. `paginate()` 내 `&ColumnDef::default()` → `&find_initial_column_def(&section.paragraphs)` 교체 (2곳)

**검증**: `docker compose run --rm test` — Rust 테스트 통과, SVG 내보내기로 2단 배치 확인

---

### 2단계: Column 나누기 + MultiColumn 나누기 처리

**목표**: 단 나누기(ColumnBreakType::Column)와 다단 나누기(ColumnBreakType::MultiColumn)를 페이지네이션에서 처리한다.

**수정 파일**: `src/renderer/pagination.rs`

**작업 내용**:
1. **Column 나누기 처리** (ColumnBreakType::Column):
   - 현재 항목을 현재 단에 플러시
   - `current_column + 1 < col_count`이면 다음 단으로 이동
   - 마지막 단이면 새 페이지로 이동 (current_column = 0)

2. **MultiColumn 나누기 처리** (ColumnBreakType::MultiColumn):
   - 현재 항목을 현재 단/페이지에 플러시
   - 해당 문단의 Control::ColumnDef를 찾아 column_def 갱신
   - 새 단 수에 맞게 layout.column_areas 재계산
   - col_count, current_column 리셋

3. 페이지네이션 함수 시그니처: `column_def` 파라미터를 `&ColumnDef`에서 `ColumnDef`로 변경하여 mid-section 변경 지원 (또는 내부 mut 변수 사용)

**검증**: `docker compose run --rm test` — 테스트 통과

---

### 3단계: 단 구분선 렌더링 + HWPX 파싱 + 빌드/검증

**목표**: 다단 사이 구분선을 렌더링하고, HWPX 다단 파싱을 추가한다.

**수정 파일**: `src/renderer/layout.rs`, `src/parser/hwpx/section.rs`

**작업 내용**:

**A. 단 구분선 렌더링** (`src/renderer/layout.rs`):
1. `PageContent`에 `column_def` 참조 또는 separator 정보 전달 방법 결정
2. 다단(column_count >= 2)일 때 인접 단 사이에 수직선 RenderNode 생성
   - separator_type > 0이면 구분선 그리기
   - 좌표: 첫째 단 오른쪽 경계와 둘째 단 왼쪽 경계의 중간점
   - 스타일: separator_width, separator_color 적용

**B. HWPX 다단 파싱** (`src/parser/hwpx/section.rs`):
1. `<hp:colPr>` 또는 `<hp:multiColumn>` XML 요소 파싱
2. column_count, spacing, widths, separator 속성 매핑
3. `Control::ColumnDef(ColumnDef { ... })` 생성

**C. 빌드 + 검증**:
1. `docker compose run --rm test` — Rust 테스트 통과
2. `docker compose run --rm wasm && npm run build` — WASM/Vite 빌드
3. SVG 내보내기 — `treatise sample.hwp` 2단 렌더링 확인
4. 웹 뷰어 — 2단 렌더링 확인

## 수정 파일 요약

| 파일 | 단계 | 수정 내용 |
|------|------|----------|
| `src/wasm_api.rs` | 1 | ColumnDef 추출 + 전달 |
| `src/renderer/pagination.rs` | 2 | Column/MultiColumn 나누기 처리 |
| `src/renderer/layout.rs` | 3 | 단 구분선 렌더링 |
| `src/parser/hwpx/section.rs` | 3 | HWPX 다단 파싱 |
