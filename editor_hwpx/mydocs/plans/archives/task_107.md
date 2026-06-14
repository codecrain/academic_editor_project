# 타스크 107: 쪽 테두리/배경 + 도형 채우기 투명도 구현

## 목표

기존 타스크 105/105보완에서 구현했던 기능을 베이스라인(de21268)에 재구현한다.

1. 쪽 테두리/배경(PAGE_BORDER_FILL) 렌더링
2. 쪽 배경 이미지 채우기 지원
3. 도형 채우기 투명도 + BinData ID 매핑 수정

## 전략

기존 커밋(cd2aa20, 6758772, 667a71c)의 변경사항을 cherry-pick하되, 충돌 발생 시 수동 병합한다.
`130b1df`(KTX 2단 레이아웃)의 segment_width 필터 변경은 포함하지 않는다.

## 구현 계획

### 1단계: 쪽 테두리/배경 렌더링 (cd2aa20)

- layout.rs: PageBorderFill → 배경 채우기 + 테두리선 노드 생성
- render_tree.rs: PageBackgroundNode 확장 (gradient, image, border)
- svg.rs: 그러데이션/테두리선 SVG 렌더링
- web_canvas.rs: Canvas 렌더링 확장
- height_measurer.rs: 쪽 테두리 관련 높이 보정

### 2단계: 쪽 배경 이미지 채우기 (6758772)

- layout.rs: 이미지 채우기(BinData) 지원
- svg.rs/web_canvas.rs: 이미지 배경 렌더링

### 3단계: 도형 채우기 투명도 + BinData ID 매핑 (667a71c)

- parser/control.rs, parser/doc_info.rs: 투명도 파싱
- model/style.rs: 투명도 필드 추가
- renderer/mod.rs, style_resolver.rs: 투명도 적용
- svg.rs: SVG opacity 속성 출력
- serializer/doc_info.rs: 직렬화 대응

### 4단계: 검증

- samples/basic/Worldcup_FIFA2010_32.hwp SVG 확인
- samples/k-water-rfp.hwp 회귀 테스트
- 전체 테스트 통과 확인

## 브랜치

`local/task107` (devel에서 분기)
