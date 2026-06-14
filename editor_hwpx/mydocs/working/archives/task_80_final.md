# 타스크 80 최종 결과보고서: 표 셀 높이를 HWP와 동일하게 처리

## 수행 결과 요약

표 셀 높이가 실제 HWP보다 크게 렌더링되는 문제를 수정하였다. 추가로 셀 렌더링 시 trailing line_spacing 처리도 일관성 있게 수정하여 셀 텍스트 오버플로우 문제를 해결하였다.

## 근본 원인

셀 컨텐츠 높이 계산 시 **마지막 줄의 `line_spacing`을 불필요하게 더하고 있었다.**

HWP LineSeg의 `line_spacing`은 "다음 줄과의 간격"을 의미한다:
- 중간 줄: `line_height + line_spacing` (다음 줄 시작점까지의 거리)
- 마지막 줄: `line_height`만 (다음 줄이 없으므로 spacing 불필요)

### 진단 데이터 (table-001.hwp Cell[8] 기준)

| 항목 | 수정 전 | 수정 후 | HWP 선언값 |
|------|---------|---------|-----------|
| content | 900+540=1440hu | 900hu | ~901hu |
| required | 1440+282=1722hu | 900+282=1182hu | 1183hu |
| 오차 | +539hu (46%!) | -1hu (0%) | - |

## 수정 내용

### 1. 행 높이 계산 (3곳)

**파일**: `src/renderer/layout.rs`

3곳의 `lines_total` 계산에서 마지막 줄의 `line_spacing` 제외:

```rust
// 수정 후: 마지막 줄에는 line_spacing 제외
let line_count = comp.lines.len();
let lines_total: f64 = comp.lines.iter()
    .enumerate()
    .map(|(i, line)| {
        let h = hwpunit_to_px(line.line_height, self.dpi);
        if i + 1 < line_count {
            h + hwpunit_to_px(line.line_spacing, self.dpi)
        } else {
            h  // 마지막 줄: spacing 제외
        }
    }).sum();
```

| 위치 | 용도 |
|------|------|
| 1-b단계 (~1254행) | row_span=1 셀 행 높이 결정 |
| 2-b단계 (~1354행) | 병합 셀 행 확장 결정 |
| 렌더링 (~1560행) | 수직 정렬용 컨텐츠 높이 |

### 2. 셀 렌더링 trailing spacing 제거

셀 내에서 마지막 줄 렌더링 시에도 trailing line_spacing을 제외하여 행 높이 계산과 일관성 유지:

```rust
// 줄간격 적용: 셀 내부에서는 마지막 줄의 trailing spacing 제외
// (본문 텍스트에서는 문단 간 간격으로 활용되므로 유지)
if line_idx + 1 < end || cell_ctx.is_none() {
    y += line_height + line_spacing_px;
} else {
    y += line_height;
}
```

`cell_ctx` 파라미터를 활용하여 셀 내부에서만 조건부 적용. 본문 텍스트의 문단 간 간격은 영향 없음.

## 미해결 사항

셀 세로 중간 정렬 시 미묘한 비대칭 존재. `baseline_distance`가 `line_height`의 ~85%에 위치하여, 라인 박스 기준 중간 정렬이 시각적으로 약간 아래쪽으로 치우침. 다음 타스크에서 처리 예정.

## 테스트 결과

| 항목 | 결과 |
|------|------|
| `test_task80_cell_height_matches_hwp` | 125개 셀 높이 검증 통과 |
| 전체 테스트 | 495개 전체 통과 |
| WASM 빌드 | 성공 |
| Vite 빌드 | 성공 |

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/layout.rs` | 3곳 lines_total 수정 + 셀 렌더링 trailing spacing 조건부 제외 |
| `src/wasm_api.rs` | 셀 높이 검증 테스트 추가 |

## 완료일

2026-02-15
