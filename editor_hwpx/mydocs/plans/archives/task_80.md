# 타스크 80 수행계획서: 표 셀 높이를 HWP와 동일하게 처리

## 배경

현재 우리의 테이블 셀 높이가 실제 HWP 프로그램보다 크게 렌더링되고 있다.

### 근본 원인

셀 컨텐츠 높이 계산 시 **마지막 줄의 `line_spacing`을 불필요하게 더하고 있다.**

HWP LineSeg의 `line_spacing` 필드는 "다음 줄과의 간격"을 의미한다. 따라서:
- 중간 줄: `line_height + line_spacing` (다음 줄까지의 거리)
- **마지막 줄**: `line_height`만 (다음 줄이 없으므로 spacing 불필요)

### 진단 데이터 (table-001.hwp)

```
Cell[8] row=1 col=1: declared_height=1183hu padding=141+141=282
  Line[0] line_height=900 line_spacing=540

HWP 기대값: 141 + 900 + 141 = 1182hu ≈ 1183hu  ← 정확
우리 계산값: 141 + (900+540) + 141 = 1722hu     ← 539hu 초과!
```

2줄 셀의 `vertical_pos` 검증:
```
Line[0] vpos=0    line_height=1200 line_spacing=360
Line[1] vpos=1560 line_height=1200 line_spacing=360
gap = 1560 = 1200 + 360  (line_height + line_spacing = 다음 줄 시작점)
```

### 문제 코드 위치 (layout.rs)

셀 컨텐츠 높이를 계산하는 **3곳** 모두 동일한 오류:

1. **1-b단계** (lines 1254-1258): row_span=1 셀 컨텐츠 높이
2. **2-b단계** (lines 1348-1352): 병합 셀 컨텐츠 높이
3. **렌더링 높이** (lines 1547-1553): 수직 정렬용 컨텐츠 높이

현재 코드:
```rust
let lines_total: f64 = comp.lines.iter()
    .map(|line| {
        let h = hwpunit_to_px(line.line_height, self.dpi);
        let spacing = hwpunit_to_px(line.line_spacing, self.dpi);
        h + spacing  // ← 모든 줄에 spacing 추가 (마지막 줄 포함!)
    })
    .sum();
```

## 목표

1. 셀 컨텐츠 높이 계산 시 마지막 줄의 `line_spacing`을 제외하여 HWP와 동일한 셀 높이 달성
2. 기존 표 렌더링 회귀 없음 확인

## 수행 범위

### 수정 내용

**파일**: `src/renderer/layout.rs`

3곳의 `lines_total` 계산을 수정:

```rust
// 수정 후: 마지막 줄에는 line_spacing 제외
let lines_total: f64 = comp.lines.iter()
    .enumerate()
    .map(|(i, line)| {
        let h = hwpunit_to_px(line.line_height, self.dpi);
        if i + 1 < comp.lines.len() {
            h + hwpunit_to_px(line.line_spacing, self.dpi)
        } else {
            h  // 마지막 줄: spacing 제외
        }
    })
    .sum();
```

### 수정 위치

| 위치 | 용도 | 줄 번호 |
|------|------|---------|
| 1-b단계 | row_span=1 셀 행 높이 결정 | ~1254-1258 |
| 2-b단계 | 병합 셀 행 확장 결정 | ~1348-1352 |
| 렌더링 | 수직 정렬용 컨텐츠 높이 | ~1547-1553 |

### 테스트 검증

- 기존 494개 테스트 전체 통과
- 셀 높이 검증 테스트 추가 (우리 계산 ≈ HWP 선언값)
- SVG 내보내기 비교
- WASM + Vite 빌드 검증

## 예상 효과

| 셀 유형 | 수정 전 | 수정 후 |
|---------|---------|---------|
| 1줄 1문단 셀 | height + line_spacing | height (정확) |
| N줄 1문단 셀 | N×(h+s) | (N-1)×(h+s) + h |
| 복합 셀 | 각 문단 마지막 줄 spacing 초과 | 정확 |
