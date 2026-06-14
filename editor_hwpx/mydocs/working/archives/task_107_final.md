# 타스크 107 최종 완료 보고서

## 목표

베이스라인(de21268)에 쪽 테두리/배경 + 도형 채우기 투명도 기능을 재구현한다.

## 수행 내역

### 1단계: 쪽 테두리/배경 렌더링 (cherry-pick cd2aa20 → 38c0b14)

- layout.rs: PageBorderFill → 배경 채우기 + 테두리선 노드 생성
- render_tree.rs: PageBackgroundNode 확장 (gradient, image, border)
- svg.rs: 그러데이션/테두리선 SVG 렌더링
- web_canvas.rs: Canvas 배경색/그라데이션 렌더링
- height_measurer.rs: 쪽 테두리 관련 높이 보정

### 2단계: 쪽 배경 이미지 채우기 (cherry-pick 6758772 → f6e6a71)

- layout.rs: 이미지 채우기(BinData) 지원
- svg.rs: 이미지 배경 SVG 렌더링

### 3단계: 도형 채우기 투명도 + BinData ID 매핑 (cherry-pick 667a71c → bcdecc1)

- parser/control.rs, parser/doc_info.rs: 투명도 파싱
- model/style.rs: 투명도 필드 추가
- renderer/mod.rs, style_resolver.rs: 투명도 적용
- svg.rs: SVG opacity 속성 출력
- web_canvas.rs: Canvas globalAlpha 적용
- serializer/doc_info.rs: 직렬화 대응

### 보완: Canvas 쪽 배경 이미지 렌더링 (3d92691)

- web_canvas.rs: PageBackground 이미지 채우기 draw_image() 호출 추가
- cherry-pick 시 누락된 Canvas 이미지 배경 기능 복원

## 수정 파일 (22개)

| 파일 | 변경 내용 |
|------|----------|
| src/renderer/layout.rs | PageBorderFill → 배경/테두리 노드 생성 |
| src/renderer/render_tree.rs | PageBackgroundNode 확장 |
| src/renderer/svg.rs | 그러데이션/테두리/이미지 SVG 렌더링 |
| src/renderer/web_canvas.rs | Canvas 배경색/그라데이션/이미지/투명도 |
| src/renderer/height_measurer.rs | 쪽 테두리 높이 보정 |
| src/renderer/mod.rs | 투명도 지원 |
| src/renderer/style_resolver.rs | 투명도 스타일 해석 |
| src/renderer/canvas.rs | 투명도 지원 |
| src/model/style.rs | opacity 필드 추가 |
| src/parser/control.rs | 투명도 파싱 |
| src/parser/doc_info.rs | 투명도 파싱 |
| src/parser/hwpx/header.rs | HWPX 헤더 변경 |
| src/serializer/doc_info.rs | 직렬화 대응 |
| src/wasm_api.rs | WASM API page_border_fill 전달 |

## 검증 결과

- 565개 테스트 통과
- WASM 빌드 성공
- Worldcup_FIFA2010_32.hwp 배경 이미지 정상 렌더링 확인 (SVG + Canvas)
- k-water-rfp.hwp 회귀 없음

## 커밋 이력

| 커밋 | 내용 |
|------|------|
| 38c0b14 | 1단계: 쪽 테두리/배경 렌더링 |
| f6e6a71 | 2단계: 쪽 배경 이미지 채우기 지원 |
| bcdecc1 | 3단계: 도형 채우기 투명도 + BinData ID 매핑 |
| 3d92691 | 보완: Canvas 쪽 배경 이미지 렌더링 추가 |

## 브랜치

- 작업: `local/task107` (devel에서 분기)
- 머지: `devel` ← `local/task107` (no-ff 머지)
