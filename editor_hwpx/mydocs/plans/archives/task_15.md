# 타스크 15: 장평(글자 폭 비율) 렌더링 처리

## 목표

HWP 문서의 장평(ratio) 속성을 SVG, Canvas, HTML 렌더러에 반영한다.
장평은 글자의 가로 폭을 축소/확장하는 속성으로, 100%가 기본이며 50~200% 범위를 가진다.

## 현재 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| 파싱 | 완료 | `CharShape.ratios[7]` → `ResolvedCharStyle.ratio` (0.5~2.0) |
| TextStyle 전달 | 미구현 | `resolved_to_text_style()`에서 ratio 누락 |
| SVG 렌더링 | 미구현 | `draw_text()`에서 ratio 미사용 |
| Canvas 렌더링 | 미구현 | `draw_text()`에서 ratio 미사용 |
| 폭 추정 | 미구현 | `estimate_text_width()`에서 ratio 미반영 |

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/mod.rs` | `TextStyle`에 `ratio` 필드 추가 |
| `src/renderer/layout.rs` | `resolved_to_text_style()`에 ratio 전달, `estimate_text_width()`에 ratio 반영 |
| `src/renderer/svg.rs` | `draw_text()`에 `transform="scale(ratio,1)"` 적용 |
| `src/renderer/web_canvas.rs` | `draw_text()`에 Canvas `scale(ratio, 1)` 적용 |
| `src/renderer/html.rs` | `draw_text()`에 CSS `transform: scaleX(ratio)` 적용 |

## 구현 방법

### 장평 적용 원리

장평은 글자의 가로 방향만 스케일링한다:
- `ratio = 1.0` (100%): 변형 없음
- `ratio = 0.8` (80%): 가로 80%로 축소
- `ratio = 1.5` (150%): 가로 150%로 확대

### SVG 구현
```xml
<!-- ratio != 1.0일 때 -->
<text transform="translate(x,y) scale(ratio,1)" x="0" y="0" ...>텍스트</text>
```
`transform` 속성으로 x좌표 이동 후 가로 스케일링 적용. 원점 기준 스케일이므로 translate 먼저 적용.

### Canvas 구현
```javascript
ctx.save();
ctx.translate(x, y);
ctx.scale(ratio, 1);
ctx.fillText(text, 0, 0);
ctx.restore();
```

### HTML 구현
```html
<span style="transform: scaleX(ratio); transform-origin: left;">텍스트</span>
```

### 폭 추정 반영
```rust
// estimate_text_width에서
let base_width = ... ;  // 기존 로직
base_width * ratio      // ratio 적용
```

## 검증 방법

1. 기존 229개 테스트 통과
2. 장평 80% 문서 렌더링 비교 (SVG vs Canvas)
3. 장평 100% 문서에서 기존 결과와 동일 확인
