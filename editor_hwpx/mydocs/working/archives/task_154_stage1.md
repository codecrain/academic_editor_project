# 타스크 154 1단계 완료 보고서

> **작업일**: 2026-02-23
> **단계**: 1/3 — HWPX 문서 로드 시 합성 LineSeg 생성

---

## 변경 내용

### 1. `reflow_line_segs()` ParaPr line_spacing 보강

**파일**: `src/renderer/composer/line_breaking.rs`

- `compute_line_spacing_hwp()` 함수 신규 추가
  - `LineSpacingType::Percent`: `line_height * (percent - 100) / 100`
  - `LineSpacingType::Fixed`: `fixed_value - line_height`
  - `LineSpacingType::SpaceOnly`: `value` (추가 간격만)
  - `LineSpacingType::Minimum`: `max(0, minimum - line_height)`
- `reflow_line_segs()` 내부에서 ParaPr의 `line_spacing_type`/`line_spacing` 값을 참조하여 합성 LineSeg의 `line_spacing` 필드를 계산하도록 변경
- 기존: `orig_line_spacing` (항상 0) → **변경 후**: `compute_line_spacing_hwp()` 로 계산

### 2. 문서 로드 시 합성 LineSeg 생성 훅

**파일**: `src/document_core/commands/document.rs`

- `from_bytes()` 내부에서 `compose_section()` 호출 **전에** `reflow_zero_height_paragraphs()` 실행
- `reflow_zero_height_paragraphs()`: 모든 구역의 본문 문단을 순회, `line_segs.len() == 1 && line_segs[0].line_height == 0` 조건에 해당하면 reflow 수행
- `needs_line_seg_reflow()`: 판단 조건 분리 (가독성)
- 페이지 정의(PageDef)에서 컬럼 너비를 계산하여 `available_width` 전달

---

## 검증 결과

| 항목 | 결과 |
|------|------|
| `cargo test` | **608 통과**, 0 실패 |
| `cargo clippy -- -D warnings` | **경고 0** |
| `service_agreement.hwpx` SVG 내보내기 | 이전: 모든 텍스트 y=153.6 겹침 → **변경 후**: 23개 고유 y좌표, 줄바꿈 정상 |
| `2024년 1분기 해외직접투자 보도자료 ff.hwpx` | 16페이지 정상 내보내기, 기존 렌더링 유지 |
| `통합재정통계(2011.10월).hwp` | HWP 파일 정상 내보내기, 영향 없음 |

---

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `src/renderer/composer/line_breaking.rs` | `compute_line_spacing_hwp()` 추가, `reflow_line_segs()` 내 line_spacing 계산 보강, `LineSpacingType` 임포트 추가 |
| `src/document_core/commands/document.rs` | `reflow_zero_height_paragraphs()`, `needs_line_seg_reflow()` 추가, `from_bytes()` 내 reflow 훅 삽입 |
