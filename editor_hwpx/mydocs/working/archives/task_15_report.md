# 타스크 15 완료 보고서: 장평(글자 폭 비율) 렌더링 처리

## 완료 상태

| 단계 | 내용 | 상태 |
|------|------|------|
| 1 | TextStyle에 ratio 필드 추가 및 전달 | 완료 |
| 2 | 폭 추정 및 SVG/Canvas/HTML 렌더러 장평 적용 | 완료 |
| 3 | 테스트 추가 및 검증 | 완료 |

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/mod.rs` | `TextStyle`에 `ratio: f64` 필드 추가, 수동 Default 구현 (기본값 1.0) |
| `src/renderer/layout.rs` | `resolved_to_text_style()`에 ratio 전달, `estimate_text_width()`에 ratio 반영 |
| `src/renderer/svg.rs` | ratio != 1.0일 때 `transform="translate(x,y) scale(ratio,1)"` 적용 |
| `src/renderer/web_canvas.rs` | ratio != 1.0일 때 `ctx.save/translate/scale/restore` 패턴 적용 |
| `src/renderer/html.rs` | ratio != 1.0일 때 CSS `transform:scaleX(ratio)` 적용 |

## 테스트 결과

- 기존 229개 + 신규 4개 = **233개 테스트 통과**
- WASM 빌드 성공
- 샘플 문서 렌더링 정상

## 신규 테스트

| 테스트 | 내용 |
|--------|------|
| `test_svg_text_ratio` | SVG에서 ratio 80% 시 transform 속성 생성 확인 |
| `test_svg_text_ratio_default` | SVG에서 ratio 100% 시 transform 미생성 확인 |
| `test_resolved_to_text_style_with_ratio` | ResolvedCharStyle → TextStyle ratio 전달 확인 |
| `test_estimate_text_width_with_ratio` | 장평 80%, 150%, 100% 시 폭 추정 정확도 확인 |
