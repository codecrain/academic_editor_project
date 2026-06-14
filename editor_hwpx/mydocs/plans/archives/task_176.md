# 타스크 176: 글꼴 크기 변경 시 줄간격·캐럿 높이 미반영 수정

## 현상

서식바(style-bar)에서 글꼴 크기를 `^` 버튼으로 점진 증가시키면:
- 텍스트 크기는 증가하지만
- 줄간격(line_height)이 그대로 유지되어 줄이 겹침
- 캐럿 높이도 변경된 글꼴 크기에 맞지 않음

## 원인 분석

### 근본 원인

`apply_char_format_native()` (formatting.rs)에서 fontSize(base_size) 변경 후 `reflow_line_segs()`를 호출하지 않아 `LineSeg.line_height`가 갱신되지 않음.

| 함수 | 줄간격 재계산 | 결과 |
|------|--------------|------|
| `apply_para_format_native()` | `reflow_line_segs()` 호출 O | 정상 |
| `apply_char_format_native()` | `reflow_line_segs()` 호출 X | **버그** |

### 추가 원인

`reflow_line_segs()` 내부에서 원본 LineSeg가 존재하면(`has_valid_orig = true`) `line_height`를 보존하는 로직이 있어, 단순히 reflow를 호출해도 원본 값을 재사용함. 글꼴 크기 변경 시에는 `line_segs.clear()`로 원본을 무효화해야 새 max_font_size 기반 계산이 수행됨.

### 영향 범위

- 본문 문단: `apply_char_format_native()`
- 셀 내 문단: `apply_char_format_in_cell_native()`

## 수정 방안

`mods.base_size.is_some()` 조건으로 글꼴 크기 변경 감지 시:
1. `para.line_segs.clear()` — 원본 LineSeg 무효화
2. `reflow_line_segs()` — max_font_size 기반 line_height 재계산
3. 셀 내 문단: 추가로 `table.dirty = true` 마킹

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/document_core/commands/formatting.rs` | 본문 + 셀 내 apply_char_format에 reflow 추가 |

## 검증 방법

1. `cargo test` — 615개 테스트 통과
2. WASM 빌드 후 웹 에디터에서 글꼴 크기 증감 동작 확인
