# 타스크 30: 캐럿 위치 정확도 개선 — 최종 보고서

## 변경 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/wasm_api.rs` | `get_page_text_layout_native()` JSON에 폰트 스타일 필드 6개 추가 |
| `web/text_selection.js` | `_remeasureCharPositions()` 메서드 추가, `loadPage()`에서 호출 |

## 변경 상세

### 1단계: WASM JSON에 폰트 스타일 정보 추가 (src/wasm_api.rs)

`collect_text_runs()` 내부에서 각 TextRunNode의 `style` 필드로부터 다음 정보를 JSON에 추가:
- `fontFamily`: 글꼴 이름
- `fontSize`: 글꼴 크기 (px)
- `bold`: 진하게 여부
- `italic`: 기울임 여부
- `ratio`: 장평 비율 (1.0 = 100%)
- `letterSpacing`: 자간 (px)

### 2단계: JS measureText 기반 charX 재계산 (web/text_selection.js)

`TextLayoutManager` 클래스에 `_remeasureCharPositions()` 메서드 추가:
1. 오프스크린 Canvas 생성 (인스턴스당 한 번)
2. 각 run에 대해 WASM에서 받은 폰트 정보로 Canvas context 설정
3. 텍스트 접두사(prefix) 단위로 `measureText()`를 호출하여 charX 배열 재구성
4. 장평(ratio)과 자간(letterSpacing)을 반영
5. `run.w`도 재계산된 charX 마지막 값으로 갱신

`loadPage()`에서 WASM 데이터 파싱 직후 `_remeasureCharPositions()` 호출.

## 원인과 해결

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| charX 계산 | 휴리스틱 (한글=font_size, 라틴=font_size×0.5) | Canvas `measureText()` 실제 폰트 메트릭 |
| 캐럿 위치 | 렌더링된 글자와 불일치 | 브라우저 렌더링과 동일한 위치 |
| hitTest 정확도 | 클릭 시 잘못된 글자 선택 | 정확한 글자 선택 |

## 테스트 결과

- `docker compose run --rm test` — 390개 테스트 전체 통과
- `docker compose run --rm wasm` — WASM 빌드 성공

## 미해결 사항

- `estimate_text_width()` (compositor 줄바꿈용)는 기존 휴리스틱 유지. 줄바꿈 정확도 향상은 WASM↔JS 측정 콜백 아키텍처가 필요하여 별도 타스크로 분리 가능.
