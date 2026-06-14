# 타스크 43 - 단계 1 완료보고서

## 단계 정보

| 항목 | 내용 |
|------|------|
| 타스크 | #43 한컴 웹기안기 대응 기능정의서 작성 |
| 단계 | 1/3 - 웹기안기 HwpCtrl API 전수 분류 + 호환 레이어 설계 |
| 완료일 | 2026-02-12 |

## 수행 내용

### 분석 자료

로컬 HwpCtrl API 문서 3종을 전수 분석하였다:

| 문서 | 경로 | 분석 내용 |
|------|------|----------|
| HwpCtrl API v2.4 | `mydocs/manual/hwpctl/hwpctl_API_v2.4.md` | Properties 18개, Methods 67개 전수 분류 |
| Action Table v1.1 | `mydocs/manual/hwpctl/hwpctl_Action_Table__v1.1.md` | Action ID 314개 15개 카테고리 분류 |
| ParameterSet v1.2 | `mydocs/manual/hwpctl/hwpctl_ParameterSetID_Item_v1.2.md` | ParameterSet 50개 타입 전수 분류 |

### 분류 결과 요약

| 구성요소 | 수량 | 상세 |
|----------|------|------|
| HwpCtrl Properties | 18개 | 서식(3), 개체(4), 문서정보(3), 편집제어(2), 뷰(2), 필드(1), 선택(1), 시스템(1), 환경설정(1) |
| HwpCtrl Methods | 67개 | 문서관리(8), 텍스트I/O(8), 커서위치(9), 선택블록(4), 필드(10), 이미지/객체(4), 표조회(2), 페이지이미지(2), 액션시스템(5), 편집제어(2), UI제어(7), 유틸리티(6) |
| Action IDs | 314개 | 커서이동(51), 선택확장(36), 텍스트편집(29), 글자서식(33), 문단서식(27), 표조작(50), 셀서식(6), 검색치환(8), 개체조작(53), 문서관리(4), 페이지설정(3), 머리말꼬리말(1), 뷰설정(3), 편집제어(10) |
| ParameterSet Types | 50개 | 핵심서식(7), 표/셀(5), 그리기개체(9), 페이지/구역(6), 검색치환(1), 머리말꼬리말(3), 필드(1), 문서정보(3), 보안/삽입(4), 위치/단(2), 기타(9) |
| Supporting Objects | 4종 | Action(2P+5M), CtrlCode(6P+1M), ParameterSet(3P+11M), ParameterArray(2P+4M) |

### 호환 레이어 아키텍처 설계

마이그레이션 호환성 등급 체계를 수립하였다:

- **등급 A**: rhwp에 동등 기능 존재, 래퍼만 작성 (소스 변경 불필요)
- **등급 B**: 파라미터 변환 필요하나 래퍼가 처리 (소스 변경 불필요)
- **등급 C**: rhwp에 미구현, 신규 개발 필요 (구현 후 소스 변경 불필요)
- **등급 D**: 서버 의존 등 구조적 차이 (소스 일부 변경)
- **등급 X**: UI 전용/서버 전용, 빈 함수로 처리

## 산출물

| 문서 | 경로 | 작성 내용 |
|------|------|----------|
| 기능정의서 Section 1 | `mydocs/plans/task_43_feature_def.md` | 개요 및 마이그레이션 전략 |
| 기능정의서 Section 2 | `mydocs/plans/task_43_feature_def.md` | HwpCtrl API 전수 분류표 (Properties, Methods, Actions, ParameterSets, Supporting Objects, Events) |

## 다음 단계

- **단계 2**: rhwp의 현재 50개 WASM API를 웹기안기 API에 매핑하고, 호환성 등급 A~X를 부여하는 Gap 분석 수행
- 산출물: 기능정의서 Section 3 (호환성 매핑표)
