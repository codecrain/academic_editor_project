# Task 241 수행 계획서: HWPTAG_CTRL_DATA 전체 크로스 체크

## 배경

Task 240 책갈피 구현 과정에서 CTRL_DATA의 ParameterSet에서 책갈피 이름을 추출하지 않는 버그를 발견.
hwplib(Java) 크로스 체크 결과 7종 컨트롤이 CTRL_DATA를 사용하며, 우리는 Field/Bookmark 이름만 추출하고 나머지는 raw bytes로만 보존하고 있음.

## 목표

1. hwplib 기준으로 CTRL_DATA를 사용하는 모든 컨트롤의 ParameterSet 구조를 파악
2. 현재 렌더링/편집에 영향을 주는 항목을 우선 파싱
3. FIELD_BOOKMARK(%bmk) 파싱이 0건인 문제 원인 조사 및 수정
4. 새 책갈피 생성 시 CTRL_DATA 레코드를 올바르게 생성

## 범위

### 필수 (렌더링/편집 영향)
- **Bookmark**: 새 책갈피 추가 시 CTRL_DATA ParameterSet 생성 → 한컴에서도 이름 표시
- **FIELD_BOOKMARK(%bmk)**: 파싱 0건 원인 조사 → 필드 책갈피도 목록에 포함
- **Field**: ctrl_data_name 외 추가 속성 확인 (현재 충분한지 검증)

### 조사 (당장 수정 불필요, 현황 기록)
- SectionDef, Table, Picture, Rectangle, 기타 GSO의 CTRL_DATA 내용 파악
- 어떤 데이터가 들어있는지 문서화 → 향후 필요 시 파싱 추가

## 산출물

- 수정된 파서 코드 (bookmark CTRL_DATA 생성, FIELD_BOOKMARK 파싱)
- CTRL_DATA 분석 기술 문서 (mydocs/tech/)
