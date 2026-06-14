# Task 241 구현 계획서: HWPTAG_CTRL_DATA 전체 크로스 체크

## 단계별 구현 계획

### 1단계: FIELD_BOOKMARK 실태 조사 및 한컴 책갈피 출처 규명

- synam-001.hwp 바이너리에서 `%bmk` ctrl_id 직접 검색
- 한컴 "찾아가기 > 책갈피"에 표시되는 이름의 실제 출처 조사
  - CTRL_BOOKMARK(bokm)의 CTRL_DATA ParameterSet
  - FIELD_BOOKMARK(%bmk) 필드 컨트롤
  - Field의 command 문자열 또는 ctrl_data_name
- 여러 샘플 HWP 파일에서 필드/책갈피 컨트롤 종류별 수 집계
- 결과 문서화

### 2단계: 새 책갈피 CTRL_DATA ParameterSet 생성

- `add_bookmark_native()`에서 새 Bookmark 추가 시 CTRL_DATA 레코드 생성
  - ParameterSet 바이너리 구조: id(0x021B) + count(1) + dummy(0) + item(id=0x4000, type=String, value=이름)
- `bookmark_query.rs`에 `build_bookmark_ctrl_data(name: &str) -> Vec<u8>` 함수 추가
- 생성된 CTRL_DATA를 `para.ctrl_data_records`에 올바른 인덱스로 삽입
- 삭제/이름변경 시에도 CTRL_DATA 동기화
- cargo test 통과 확인

### 3단계: 기타 컨트롤 CTRL_DATA 현황 조사 및 문서화

- hwplib 기준 7종 컨트롤(SectionDef, Table, Picture, Rectangle, GSO 등)의 CTRL_DATA 활용 내용 파악
- 각 컨트롤에서 어떤 ParameterSet id/item이 사용되는지 정리
- 샘플 파일에서 실제 CTRL_DATA 내용 덤프 → 구조 검증
- `mydocs/tech/hwp_ctrl_data.md` 기술 문서 작성
- 당장 파싱이 필요한 항목 식별 (현재는 raw round-trip으로 충분한지 판단)
