# 타스크 105: 쪽 테두리/배경 기능 구현

## 목표

HWP 문서의 쪽 테두리/배경(PAGE_BORDER_FILL)을 렌더링한다.
샘플: `samples/basic/Worldcup_FIFA2010_32.hwp`

## 현재 상태

- **파싱**: 완료 (PageBorderFill → SectionDef.page_border_fill)
- **모델**: 완료 (PageBorderFill, BorderFill, Fill, BorderLine 등)
- **렌더링**: 미구현 (하드코딩 흰색 배경만 존재)

## PageBorderFill 속성 (스펙 표 138)

| 비트 | 설명 | 값 |
|------|------|----|
| bit 0 | 위치 기준 | 0=본문, 1=종이 |
| bit 1 | 머리말 포함 | 0=미포함, 1=포함 |
| bit 2 | 꼬리말 포함 | 0=미포함, 1=포함 |
| bit 3-4 | 채울 영역 | 0=종이, 1=쪽, 2=테두리 |

- `border_fill_id`: DocInfo.border_fills 인덱스 (1-indexed)
- `spacing_left/right/top/bottom`: 테두리/배경 위치 간격

## 구현 계획

### 1단계: 배경 채우기 렌더링

**layout.rs** - `render_page()` 수정:
- `page_border_fill.border_fill_id`로 `BorderFill` 조회
- `BorderFill.fill` 정보에 따라 PageBackgroundNode 생성
  - 단색(SolidFill): background_color 적용
  - 그러데이션(GradientFill): gradient 정보 전달
- `attr` bit 0(위치 기준)과 bit 3-4(채울 영역)에 따라 배경 영역 결정
  - 종이(0): 용지 전체
  - 쪽(1): 본문 영역
  - 테두리(2): spacing 적용 영역

### 2단계: 테두리선 렌더링

**layout.rs** - `render_page()` 수정:
- `BorderFill.borders[4]` (좌, 우, 상, 하) 테두리선 렌더링
- `attr` bit 0에 따라 테두리 기준 영역 결정 (본문/종이)
- spacing 값으로 테두리 위치 오프셋 적용
- 기존 `create_border_line_nodes()`, `border_width_to_px()` 재활용

### 3단계: SVG/WebCanvas 렌더러 확장

**svg.rs** / **web_canvas.rs**:
- PageBackgroundNode에 그러데이션/이미지 채우기 지원 추가
- 테두리선 렌더링 (Line 노드로 처리하면 기존 코드 활용 가능)

### 4단계: 검증 및 테스트

- Worldcup_FIFA2010_32.hwp SVG 내보내기 확인
- k-water-rfp.hwp 등 기존 파일 회귀 테스트
- 전체 테스트 통과 확인

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/layout.rs` | render_page()에서 BorderFill 조회 + 배경/테두리 노드 생성 |
| `src/renderer/render_tree.rs` | PageBackgroundNode 확장 (gradient, border 지원) |
| `src/renderer/svg.rs` | PageBackground 렌더링 확장 |
| `src/renderer/web_canvas.rs` | PageBackground 렌더링 확장 |

## 브랜치

`local/task105`
