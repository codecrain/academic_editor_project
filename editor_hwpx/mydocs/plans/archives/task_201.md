# 타스크 201: 조판부호 개체 — [표]/[그림]/[글상자] 등 표시

## 목표

조판부호 표시 시 개체(표, 그림, 글상자, 수식 등) 위치에 붉은색 대괄호 레이블을 표시한다.

## 한컴 기준

| 개체 | 조판부호 | 색상 | 위치 |
|------|----------|------|------|
| 표 | [표] | 붉은색 | 개체 좌상단 |
| 그림 | [그림] | 붉은색 | 개체 좌상단 |
| 글상자 | [글상자] | 붉은색 | 개체 좌상단 |
| 수식 | [수식] | 붉은색 | 개체 좌상단 |
| 머리말 | [머리말] | 붉은색 | 머리말 영역 |
| 꼬리말 | [꼬리말] | 붉은색 | 꼬리말 영역 |
| 각주 | [각주] | 붉은색 | 각주 영역 |

- 붉은색: 본문 글자 모양과 같은 크기
- 조판부호 ON 시 표시, OFF 시 숨김

## 구현 방식

### 플래그
- 기존 `show_paragraph_marks` 활용 (한컴: 조판부호 ON → 문단부호 포함)
- 향후 별도 `show_control_codes` 분리 가능

### 렌더러 수정 (SVG/HTML/Canvas)
각 개체 RenderNodeType 렌더링 시 좌상단에 붉은색 레이블 오버레이:
- `RenderNodeType::Table` → [표]
- `RenderNodeType::Image` → [그림]
- `RenderNodeType::Shape` (TextBox) → [글상자]
- `RenderNodeType::Shape` (기타) → [그리기]
- `RenderNodeType::Equation` → [수식]

### 영향 범위

| 파일 | 수정 내용 |
|------|-----------|
| `src/renderer/svg.rs` | 개체 조판부호 SVG 출력 |
| `src/renderer/html.rs` | 개체 조판부호 HTML 출력 |
| `src/renderer/web_canvas.rs` | 개체 조판부호 Canvas 출력 |

## 참조
- 한컴 도움말: `mydocs/manual/hwp/Help/extracted/view/control_code.htm`
- 스크린샷: `mydocs/manual/hwp/Help/extracted/images/3v_control_code_01.gif`
