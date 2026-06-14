# 타스크 91 — 3단계 완료 보고서

## 단계 목표
- 단 구분선 렌더링
- HWPX 다단 파싱
- WASM/Vite 빌드 + 검증

## 완료 항목

### 1. 단 구분선 렌더링 (layout.rs)

**수정**: `src/renderer/page_layout.rs`, `src/renderer/layout.rs`

- `PageLayoutInfo`에 `separator_type`, `separator_width`, `separator_color` 필드 추가
- `from_page_def()`에서 ColumnDef의 separator 정보를 PageLayoutInfo에 복사
- `build_render_tree()`에서 2단 이상 + separator_type > 0일 때 단 사이에 수직선 렌더링
  - 위치: 인접 단의 오른쪽 경계와 왼쪽 경계의 중간점
  - 높이: 단 영역의 전체 높이
  - 스타일: separator_type에 따라 Solid/Dash/Dot/DashDot/DashDotDot
  - 굵기: `border_width_to_px()` 변환
  - 색상: separator_color 직접 적용

### 2. HWPX 다단 파싱 (section.rs)

**수정**: `src/parser/hwpx/section.rs`

- `<hp:colPr>` 요소 파싱 함수 `parse_col_pr()` 추가
  - `type`: NEWSPAPER→Normal, BalancedNewspaper→Distribute, Parallel→Parallel
  - `layout`: LEFT→LeftToRight, RIGHT→RightToLeft
  - `colCount`, `sameSz`, `sameGap` 속성 매핑
- `parse_sec_pr_children()`에서 colPr 파싱 후 ColumnDef 반환
- 파싱된 ColumnDef를 첫 문단의 `Control::ColumnDef`로 추가
- 문단 `columnBreak`/`pageBreak` 속성 → `ColumnBreakType::Column`/`Page` 매핑
- import 추가: `ColumnDef`, `ColumnType`, `ColumnDirection`

### 3. KTX.hwp 분석 결과

- **1단 모드**: 3페이지 (기존 상태)
- **2단 모드**: 2페이지 (다단 처리 개선으로 3→2 감소)
- **HWP 원본**: 1페이지
- **원인**: 높이 측정 정확도 문제 (빈 문단 + 표 높이 과대 측정). 다단 로직과 무관한 기존 이슈.
  - 총 측정 높이: 2110px (문단 1287 + 표 823)
  - 2단 가용 높이: 1436px (718 × 2)

## 검증 결과
- `docker compose run --rm test` — **532개 테스트 전체 통과**
- `docker compose run --rm wasm` — **WASM 빌드 성공**
- `npm run build` — **Vite 빌드 성공**
- SVG 내보내기: `treatise sample.hwp` 9페이지 정상
- HWPX 5개 샘플 전체 정상 렌더링

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/page_layout.rs` | separator 필드 3개 추가, from_page_def() 복사 |
| `src/renderer/layout.rs` | 단 구분선 렌더링 코드 추가 |
| `src/parser/hwpx/section.rs` | colPr 파싱, columnBreak/pageBreak 파싱 |
