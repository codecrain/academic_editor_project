# 타스크 8 - 수행 계획서: HWP 에디터와 유사한 높이 처리

## 목표

HWP 에디터와 동일한 방식으로 줄간격을 계산하여 페이지 레이아웃의 정확도를 향상시킨다.

## 현재 상태 분석

### 1. 페이지 여백 ✅
- `PageDef` → `PageLayoutInfo` → `body_area` 경로로 정상 적용됨

### 2. 문단 간격 (spacing_before/after) ✅
- `ParaShape` → `ResolvedParaStyle` → `layout.rs:270-371`에서 적용됨
- 문단 첫 줄에 spacing_before, 마지막 줄에 spacing_after 추가
- HWPUNIT 단위로 파싱 후 px로 변환 (비율 아님)

### 3. 줄간격 (line_spacing) ✅ 구현 완료
- 파싱: `ParaShape.line_spacing`, `ParaShape.line_spacing_type`
- 스타일 해소: `ResolvedParaStyle.line_spacing`, `ResolvedParaStyle.line_spacing_type`
- **HWP 줄간격 타입**:
  - `Percent` (기본 160%): 글자 크기에 대한 비율
  - `Fixed`: 고정 높이 (HWPUNIT)
  - `SpaceOnly`: 기본 높이 + 추가 간격
  - `Minimum`: 최소 높이 지정
- **구현 완료**: `calculate_effective_line_height()` 함수 추가, 모든 문단 렌더링에 적용

### 4. 폰트 높이 ⚠️ 일부 적용
- 파싱: `CharShape.base_size` (HWPUNIT)
- 스타일 해소: `ResolvedCharStyle.font_size` (px)
- **문제**: 폰트 크기 변경 시 줄높이에 자동 반영되지 않음

## HWP 줄간격 타입별 계산 공식

```
LineSpacingType::Percent (기본 160%)
  effective_line_height = base_line_height * (line_spacing / 100.0)
  base_line_height = max(font_size * 1.2, LineSeg.line_height)

LineSpacingType::Fixed
  effective_line_height = line_spacing (HWPUNIT → px 변환값)

LineSpacingType::SpaceOnly
  effective_line_height = base_line_height + line_spacing

LineSpacingType::Minimum
  effective_line_height = max(base_line_height, line_spacing)
```

## 구현 완료 내역

### 1단계: 줄높이 계산 함수 추가 ✅

**파일**: `src/renderer/layout.rs`

```rust
/// 줄간격 타입에 따른 실제 줄높이 계산
pub fn calculate_effective_line_height(
    base_height: f64,
    line_spacing: f64,
    line_spacing_type: LineSpacingType,
) -> f64
```

### 2단계: layout_composed_paragraph 수정 ✅

**파일**: `src/renderer/layout.rs`

- 기존: `line_height = hwpunit_to_px(comp_line.line_height, self.dpi)`
- 변경: `line_height = calculate_effective_line_height(base, line_spacing, type)`

### 3단계: HeightMeasurer 수정 ✅

**파일**: `src/renderer/height_measurer.rs`

- `measure_paragraph()` 함수에 동일한 줄높이 계산 로직 적용
- 페이지네이션과 레이아웃 간 높이 일관성 유지

### 4단계: 표 및 각주 영역 수정 ✅

**파일**: `src/renderer/layout.rs`

- 표 셀 내 문단 높이 계산에 줄간격 적용
- 각주 영역 높이 추정에 줄간격 적용
- `layout_footnote_paragraph_with_number()` 함수에 줄간격 적용

### 5단계: 검증 ✅

- 216개 테스트 통과
- `samples/2010-01-06.hwp` SVG 출력 정상 (6페이지)
- 한글 에디터 렌더링 결과와 대조 필요

## 수정 파일 목록

| 파일 | 수정 내용 |
|------|----------|
| `src/renderer/layout.rs` | `calculate_effective_line_height()` 추가, 본문/표/각주 모두 줄간격 적용 |
| `src/renderer/height_measurer.rs` | 동일한 줄높이 계산 로직 적용 |

## 검증 방법

1. `docker compose run --rm test` — 216개 테스트 통과 ✅
2. SVG 출력 후 한글 에디터 결과와 시각적 비교
3. 다양한 줄간격 설정 문서로 테스트
