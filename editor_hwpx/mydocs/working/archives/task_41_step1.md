# 타스크 41 단계 1 완료보고서: 기존 HWP에 프로그래밍 표 삽입 검증

## 작업 내용

기존 HWP 문서(`samples/20250130-hongbo.hwp`)에 프로그래밍 방식으로 표를 삽입하고, 저장 후 HWP 프로그램에서 정상 오픈되는지 검증했다.

## 주요 발견 사항

### 1. DocInfo 재직렬화 버그 (심각)

| 테스트 파일 | 방식 | 결과 |
|------------|------|------|
| `save_test_roundtrip.hwp` | DocInfo + Section 모두 재직렬화 | 파일 손상 |
| `save_test_docinfo_only.hwp` | DocInfo만 재직렬화 | 파일 손상 |
| `save_test_section_only.hwp` | Section만 재직렬화 | 정상 오픈 |

**결론**: DocInfo 재직렬화가 복잡한 문서에서 파일 손상을 유발한다. 현재 워크어라운드로 DocInfo `raw_stream`을 유지하고 Section만 재직렬화한다.

### 2. 표 삽입 방식 비교

| 방식 | 결과 | 비고 |
|------|------|------|
| 수동 구성 (직접 Table 생성) | 표 이후 내용 사라짐 | attr, LineSeg 등 세부 필드 불일치 |
| 기존 표 복제 삽입 | 정상 오픈 + 전체 내용 표시 | 문단[2]의 1×4 표 복제 |

**결론**: 기존 표 복제 방식으로 삽입 시 정상 동작. 수동 구성 표의 필드값 문제가 원인.

### 3. 표 제거 후 재저장 검증

`save_test_table_removed.hwp` (표 삽입 → 저장 → 재파싱 → 표 제거 → 재저장): 정상 오픈, 전체 내용 렌더링 확인. Section 직렬화 코드 자체의 정상 동작 확인.

## 기술 세부사항

- **테스트 파일**: `samples/20250130-hongbo.hwp` (32 문단, 9 컨트롤)
- **캐럿 위치**: list_id=0, para_id=8, char_pos=0 (빈 문단)
- **복제 원본**: 문단[2] (1×4 표, attr=0x082A2311, cc=9)
- **삽입 결과**: 33 문단 (원본 32 + 표 1), 10 컨트롤 (Table 6→7)
- **출력 파일 크기**: 561,664 bytes

## 테스트

- `test_inject_table_into_existing`: 통과
- 전체 테스트: 473개 통과

## 다음 단계

단계 2에서 `parse_table_html()` 내 DIFF-1(빈 셀 공백), DIFF-5(TABLE attr), DIFF-7(인스턴스 ID) 수정 진행.
