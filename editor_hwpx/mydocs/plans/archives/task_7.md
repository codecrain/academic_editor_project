# 타스크 7: 2-패스 페이지네이션 구현

## 목표
사전 계산된 높이(LineSeg.line_height, Cell.height)와 실제 렌더링 높이의 차이로 발생하는 콘텐츠 겹침 문제를 해결한다.

## 문제 분석

### 현재 상황
- samples/2010-01-06.hwp: 5페이지 출력 (원본 6페이지)
- page 3에서 표 데이터와 설명 문단이 y=868-1034 구간에서 겹침
- 원인: 사전 계산 높이 ≠ 실제 렌더링 높이

### 겹침 발생 위치
```
page 3:
- y=916.01: "15) 순 융 자 : ..." (설명 문단)
- y=923.84: "경상지출 62,645..." (표 데이터)
→ 7.83px 간격으로 시각적 겹침 발생
```

## 해결 방안: 2-패스 페이지네이션

### 1차 패스: 높이 측정
- LayoutEngine을 활용하여 각 콘텐츠의 실제 렌더링 높이 측정
- 측정 결과를 캐시하여 재사용

### 2차 패스: 페이지 분할
- 측정된 높이를 기반으로 정확한 페이지 분할 수행
- 오버플로우 없는 페이지 생성

## 구현 단계

### 1단계: 높이 측정 인프라 구축
- `MeasuredParagraph` 구조체 정의 (문단별 실제 높이)
- `MeasuredTable` 구조체 정의 (표별 실제 높이)
- `HeightMeasurer` 구현 (LayoutEngine 기반)

### 2단계: Paginator 수정
- 1차 패스: HeightMeasurer로 전체 콘텐츠 높이 측정
- 2차 패스: 측정된 높이로 페이지 분할

### 3단계: 검증 및 최적화
- samples/2010-01-06.hwp 6페이지 출력 확인
- 콘텐츠 겹침 해결 확인
- 성능 영향 최소화

## 예상 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| src/renderer/pagination.rs | 2-패스 로직 구현 |
| src/renderer/layout.rs | 높이 측정 함수 추가 |
| src/renderer/mod.rs | 새 모듈 export |
| src/wasm_api.rs | paginate() 호출 수정 |

## 검증 방법

1. `docker compose run --rm test` - 기존 213개 테스트 통과
2. `docker compose run --rm dev cargo run -- export-svg "samples/2010-01-06.hwp" --output output/`
3. SVG 결과:
   - 6페이지 출력
   - page 3 콘텐츠 겹침 없음
   - 각 페이지 시작에 "통 합 재 정 통 계" 제목
