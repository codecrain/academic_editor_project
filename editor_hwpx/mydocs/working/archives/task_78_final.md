# 타스크 78 최종 결과보고서: 20250130-hongbo.hwp 2페이지 이미지 2개 렌더링 누락

## 요약

`samples/20250130-hongbo.hwp` 2페이지에서 사각형(Rectangle) 안의 인라인 이미지 2개 중 1개만 렌더링되던 문제를 해결하였다. 근본 원인은 파서의 구버전 Group 감지 조건에서 TextBox 내 인라인 컨트롤의 깊은 레벨 SHAPE_COMPONENT가 Group 자식으로 오인식되어, Rectangle이 Group으로 잘못 파싱되던 것이었다.

## 근본 원인

1. 문단 25의 GSO 컨트롤은 **TextBox가 있는 Rectangle** (TextBox 내 인라인 Picture 2개 포함)
2. `parse_gso_control()`의 구버전 Group 감지 조건 `r.level > first_level`이 TextBox 내 인라인 Picture 컨트롤의 SHAPE_COMPONENT(level 5)를 Group 자식으로 오인식
3. `is_container = true` → `parse_container_children()` 호출 → SHAPE_COMPONENT를 자식 경계로 사용
4. 결과: Group(children=[Picture(bid=4), Rectangle(textbox=None)])로 잘못 파싱
5. Rectangle의 TextBox가 누락되어 인라인 Picture 2개 중 1개만 렌더링

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/parser/control.rs` | 구버전 Group 감지 조건 `r.level > first_level` → `r.level == first_level + 1`로 변경. 직접 자식 레벨만 Group 감지에 사용 |
| `src/parser/control.rs` | `parse_container_children()`의 SHAPE_COMPONENT 인덱스 수집에 레벨 필터링 추가. 직접 자식 레벨(child_level)만 경계로 사용 |
| `src/wasm_api.rs` | 회귀 테스트 `test_task78_rectangle_textbox_inline_images` 추가. 기존 `test_task77` 테스트의 para_index 30→29 수정 |

## 핵심 수정

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| Group 감지 조건 (333행) | `r.level > first_level` | `r.level == first_level + 1` |
| parse_container_children SHAPE_COMPONENT 필터 (738행) | 레벨 무관 전체 수집 | `record.level == child_level`만 수집 |
| para[25] 파싱 결과 | Group(children=[Picture, Rectangle(no textbox)]) | Rectangle(textbox=Some(paragraphs=[Picture×2])) |
| 2페이지 이미지 수 | 1개 | 2개 |

## 검증 결과

- 493개 Rust 테스트 통과 (기존 492 + 신규 1)
- SVG 내보내기: 20250130-hongbo.hwp 2페이지 이미지 2개 정상 렌더링
- WASM 빌드 성공
- Vite 빌드 성공
