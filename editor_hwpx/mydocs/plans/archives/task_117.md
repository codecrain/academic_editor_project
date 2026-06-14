# 타스크 117 수행계획서

## 과제명
줄간격 계산 방식 개선: HWP 프로그램과 일치시키기

## 배경

현재 우리 렌더러의 줄간격 계산이 HWP 프로그램의 실제 동작과 불일치하여,
줄 단위 미세 오차가 페이지 전체에 누적되면서 페이지 플로우가 어긋난다 (B-003 관련).

**HWP 프로그램의 동작:**
- HWP 매뉴얼: "줄 간격은 지금 줄의 맨 위부터 다음 줄의 맨 위까지"
- 현재 줄의 폰트크기와 줄간격 설정을 이용하여 **다음 줄의 시작 위치**를 결정
- LineSeg의 `vertical_pos` 필드가 각 줄의 실제 Y 좌표를 저장 (ground truth)

**우리 렌더러의 현재 동작:**
- `layout.rs:1863`: `y += line_height + line_spacing_px` (현재 줄 높이 + 줄간격)
- `height_measurer.rs:186`: 줄당 높이 = `line_height + line_spacing`
- pagination.rs 주석(304-305행)이 이미 인정: "measured height는 렌더링보다 크게 측정되어 페이지 수가 늘어남"

**핵심 문제:**
LineSeg.line_spacing 필드는 HWP 스펙 상 "줄 간격" 즉 **현재 줄 top에서 다음 줄 top까지의 거리**를 의미한다.
우리 코드는 이를 `line_height`에 **추가로** 더하고 있어 Y advance가 실제보다 클 수 있다.

## 테스트 대상

- `samples/hancom-webgian.hwp` — 줄간격 검증용 테스트 파일

## 구현 계획 (3단계)

### 1단계: 실증 조사 — LineSeg 필드 의미 검증

`samples/hancom-webgian.hwp` 파일의 LineSeg 데이터를 분석하여 필드 간 관계를 검증한다.

**작업:**
1. 진단용 테스트 함수 작성: `hancom-webgian.hwp` 로드 → 각 문단의 LineSeg 값 출력
2. 핵심 검증: `vertical_pos[n+1] - vertical_pos[n]`이 아래 중 무엇과 일치하는지 확인
   - (A) `line_spacing[n]` → line_spacing이 top-to-top 거리
   - (B) `line_height[n] + line_spacing[n]` → line_spacing이 추가 여백

**검증 결과에 따른 분기:**
- (A)인 경우: Y advance를 `y += line_spacing_px`로 수정
- (B)인 경우: Y advance 공식은 맞지만 값 계산 로직에 문제 → 원인 추적

### 2단계: Y advance 및 높이 측정 수정

1단계 결과를 바탕으로 계산 공식을 수정한다.

**수정 대상 파일:**

| 파일 | 현재 코드 | 수정 방향 |
|------|-----------|-----------|
| `src/renderer/layout.rs:1862-1866` | `y += line_height + line_spacing_px` | 검증 결과에 따라 수정 |
| `src/renderer/height_measurer.rs:182-195` | `line_height + line_spacing` per line | 동일 공식으로 수정 |
| `src/renderer/pagination.rs:310` | `vpos_end = vertical_pos + line_height + line_spacing` | 일관성 확보 |
| `src/renderer/composer.rs:1202-1207` | `font_size_to_line_height = font_size * 1.6` | 필요 시 수정 |

### 3단계: 전체 테스트 + 시각적 검증 + 보고서

1. Docker 네이티브 빌드 + 전체 테스트 실행 (569개)
2. WASM 빌드
3. 웹 뷰어에서 `hancom-webgian.hwp` 시각적 검증
4. 최종 보고서 작성 + 오늘할일 상태 갱신

## 핵심 참조 파일

| 파일 | 참조 이유 |
|------|----------|
| `src/renderer/layout.rs:1858-1866` | Y advance 계산 (핵심 수정 지점) |
| `src/renderer/height_measurer.rs:180-203` | 줄별 높이 측정 (pagination용) |
| `src/renderer/pagination.rs:300-325` | vpos 기반 존 높이 계산 |
| `src/renderer/composer.rs:1202-1207` | `font_size_to_line_height()` |
| `src/renderer/style_resolver.rs:505-508` | ParaShape → ResolvedParaStyle 줄간격 해소 |
| `src/model/paragraph.rs:110-131` | LineSeg 구조체 정의 |
| `mydocs/manual/hwp/Help/extracted/format/paragraph/paragraph(line_spacing).htm` | HWP 줄간격 정의 |

## 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| LineSeg.line_spacing 의미가 예상과 다를 수 있음 | 1단계 실증 조사로 확인 후 수정 방향 결정 |
| Y advance 변경이 표 셀 내부 레이아웃에 영향 | 표 셀 마지막 줄 특수 처리 로직 유지 |
| 편집 시 recompose된 LineSeg 부정확 | composer.rs 재생성 로직도 함께 수정 |
| 기존 테스트 기대값 변경 필요 | HWP와 더 일치하므로 기대값 업데이트 |
