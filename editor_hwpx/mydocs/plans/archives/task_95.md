# 타스크 95 수행계획서

## 타스크명
바탕쪽(Master Page) 기능 구현

## 목표
HWP 문서의 바탕쪽 데이터를 파싱하여 구조화된 모델로 변환하고, 페이지 배경에 렌더링한다.

## 배경
- 바탕쪽은 구역 단위 페이지 템플릿으로, 양쪽/홀수쪽/짝수쪽 3종류 설정 가능
- 현재: `SectionDef.extra_child_records`에 RawRecord로 보존 (라운드트립 가능, 렌더링 불가)
- 기존 머리말/꼬리말 패턴을 재사용하여 구현

## 범위
- 파싱: SectionDef 자식 레코드의 LIST_HEADER에서 바탕쪽 데이터 추출
- 페이지네이션: 페이지별 활성 바탕쪽 선택 (양쪽/홀수/짝수)
- 렌더링: SVG 및 Canvas 렌더러에서 바탕쪽 콘텐츠 표시
- 직렬화: 기존 extra_child_records 기반 라운드트립 유지

## 기술 참조
- HWP 스펙 5.0: 표 139 (바탕쪽 정보 10바이트)
- HWP 도움말: `mydocs/manual/hwp/Help/extracted/format/masterpages/master_pages(compose).htm`

## 예상 수정 파일
9개 파일 (모델 2, 파서 1, 렌더러 5, API 1)

## 브랜치
`local/task95`
