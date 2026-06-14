# 타스크 61: SVG 텍스트 렌더링 개선 — 구현계획서

## 1단계: svg.rs draw_text() 문자별 렌더링 변환 (~40줄)

### svg.rs

1. `draw_text()` 메서드에서 `compute_char_positions()` 호출 추가
2. 기존 단일 `<text>` 출력을 문자별 반복으로 변경:
   - 공백 문자는 건너뜀 (캔버스와 동일)
   - 각 문자의 x좌표 = base_x + char_positions[i]
   - 장평(ratio != 1.0): `transform="translate(char_x,y) scale(ratio,1)"`
   - 장평 없음(ratio ≈ 1.0): `x="char_x" y="y"`
3. `letter-spacing` SVG 속성 제거 (좌표에 이미 반영)
4. 밑줄/취소선: `<line>` SVG 요소로 출력 (전체 텍스트 폭 사용)
5. `use super::layout::compute_char_positions;` import 추가

## 2단계: 기존 테스트 수정 + 새 테스트 추가 (~20줄)

### svg.rs tests

1. `test_svg_text_ratio` — 문자별 출력 확인으로 assertion 변경
2. `test_svg_text_ratio_default` — 문자별 x좌표 확인
3. 새 테스트: `test_svg_text_letter_spacing` — 자간 적용 시 문자별 x좌표 간격 확인
4. 새 테스트: `test_svg_text_char_positions` — compute_char_positions 결과와 SVG x좌표 일치 확인

## 3단계: 빌드 + 테스트 + 시각 검증

1. `docker compose --env-file /dev/null run --rm dev` — 네이티브 빌드
2. `docker compose --env-file /dev/null run --rm test` — 전체 테스트 (480개 통과)
3. `docker compose --env-file /dev/null run --rm wasm` — WASM 빌드
4. k-water-rfp.hwp SVG 내보내기 — 장평/자간이 적용된 텍스트 렌더링 확인
