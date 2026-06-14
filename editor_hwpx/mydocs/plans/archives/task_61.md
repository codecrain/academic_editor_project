# 타스크 61: SVG 텍스트 렌더링 개선 (장평/자간 문자별 배치) — 수행계획서

## 배경

SVG 내보내기(`svg.rs`)의 `draw_text()`는 텍스트를 하나의 `<text>` 요소로 통째 출력한다. 반면 캔버스(`web_canvas.rs`)는 `compute_char_positions()`를 이용해 문자별 개별 렌더링한다. 이 차이로 장평(scaleX), 자간(letter-spacing) 적용이 달라진다.

### 현재 차이점

| 항목 | Canvas (web_canvas.rs) | SVG (svg.rs) |
|------|----------------------|-------------|
| 장평 | 문자별 `translate + scale(ratio,1)` | 전체 텍스트 `translate + scale(ratio,1)` |
| 자간 | `compute_char_positions`로 문자별 x좌표 | SVG `letter-spacing` 속성 (브라우저 위임) |
| 문자 배치 | 문자별 개별 렌더링 | 텍스트 통째 출력 |

### 문제

1. SVG에서 장평 적용 시 `scale(ratio,1)`이 전체 텍스트에 적용되므로 `letter-spacing` 값도 축소/확대됨
2. SVG `letter-spacing`은 브라우저의 폰트 메트릭에 의존하여 HWP 양자화 결과와 다름
3. 네이티브 환경에서 `compute_char_positions`의 CJK 히우리스틱(전각=font_size, 반각=font_size×0.5)과 동일한 좌표를 SVG에 적용해야 함

## 수정 범위

- **수정 파일**: `src/renderer/svg.rs` (draw_text 메서드 1곳)
- **참조**: `src/renderer/layout.rs` (compute_char_positions — 이미 존재, 네이티브 빌드에서 사용 가능)

## 수정 방향

SVG `draw_text()`를 캔버스와 동일한 문자별 개별 렌더링으로 변경:
- 각 문자를 개별 `<text>` 요소로 출력
- `compute_char_positions()`로 계산된 x좌표에 배치
- 장평은 문자별 `transform="translate(x,y) scale(ratio,1)"` 적용
- `letter-spacing` SVG 속성 제거 (좌표 계산에 이미 포함)
- 밑줄/취소선은 전체 텍스트 폭 기반으로 `<line>` 요소로 출력
