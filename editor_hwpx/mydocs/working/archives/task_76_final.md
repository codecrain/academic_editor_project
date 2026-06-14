# 타스크 76 최종 결과보고서: 이미지 배치 로직 근본 원인 분석 및 체계화

## 요약

`layout.rs`에서 Picture와 Shape의 좌표 계산이 서로 다른 로직으로 중복 구현되어 있던 문제를 `compute_object_position()` 통합 함수로 해결하였다. VertRelTo::Page, HorzRelTo::Para, 인라인 정렬 3곳의 불일치를 수정하고, Paper 바이패스 조건을 정밀화하였다.

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/layout.rs` | `compute_object_position()` 통합 함수 추출. `layout_body_picture()`, `layout_shape()`, `calculate_shape_reserved_height()` 3개 함수의 좌표 계산을 통합 함수 호출로 교체. Paper 바이패스 조건 OR→AND 정밀화 |
| `src/wasm_api.rs` | 회귀 테스트 3개 추가 (multi_001 그룹 이미지, 배경 이미지 body clip, img-001 독립 이미지) |

## 핵심 수정

| 불일치 | 수정 전 | 수정 후 |
|--------|---------|---------|
| VertRelTo::Page (Shape) | `offset` (기준점 없음) | `body_area.y + offset` |
| HorzRelTo::Para (Shape) | `col_area.x + offset` | `container.x + offset` |
| Paper 바이패스 | OR (한 축이라도 Paper) | AND (양축 모두 Paper) |

## 검증 결과

- 491개 Rust 테스트 통과 (기존 488 + 신규 3)
- SVG 내보내기: hwp-multi-001, hwp-3.0-HWPML, hwp-img-001, img-start-001 정상
- WASM 빌드 성공
- Vite 빌드 성공
- 웹 브라우저 렌더링 정상 확인
