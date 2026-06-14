# 타스크 30: 캐럿 위치 정확도 개선

## 배경

현재 캐럿 위치와 히트테스트(클릭 → 글자 매핑)가 부정확하다. 원인은 `compute_char_positions()`가 고정 휴리스틱(한글=font_size, 라틴=font_size*0.5)을 사용하는 반면, Canvas `fill_text()`는 브라우저의 실제 폰트 엔진으로 렌더링하기 때문이다. 이 불일치로 인해:
- 캐럿이 렌더링된 글자와 다른 위치에 표시됨
- 클릭 시 의도한 글자가 아닌 다른 글자가 선택됨
- 글자가 많을수록 누적 오차가 커짐

## 해결 방향

JS 측에서 Canvas `measureText()` API로 각 run의 `charX`를 재계산한다. 이를 위해:
1. WASM JSON 출력에 폰트 정보(font_family, font_size, bold, italic, ratio, letter_spacing)를 추가
2. JS에서 오프스크린 Canvas로 각 run의 charX를 실제 폰트 메트릭 기반으로 재계산
3. run.w도 재계산된 값으로 갱신하여 hitTest bbox와의 일관성 유지

**compositor(줄바꿈)의 `estimate_text_width()`는 이번 타스크에서 변경하지 않는다.**
- 줄바꿈 오차는 캐럿 오차보다 눈에 덜 띔
- 수정 시 WASM→JS 측정 콜백이 필요해 아키텍처 복잡도가 크게 증가

## 변경 파일

| 파일 | 작업 |
|------|------|
| `src/wasm_api.rs` | `get_page_text_layout_native()` JSON에 폰트 스타일 필드 추가 |
| `web/text_selection.js` | `TextLayoutManager`에 measureText 기반 charX 재계산 로직 추가 |

## 검증 방법

1. `docker compose run --rm test` — 기존 테스트 전체 통과
2. `docker compose run --rm wasm` — WASM 빌드 성공
3. 브라우저 검증:
   - 캐럿이 렌더링된 글자 경계에 정확히 위치하는지 확인
   - 클릭 시 의도한 글자가 선택되는지 확인
   - 한글/영문/혼합 텍스트에서 모두 정확한지 확인
   - 텍스트 입력 시 캐럿 위치와 실제 삽입 위치가 일치하는지 확인
