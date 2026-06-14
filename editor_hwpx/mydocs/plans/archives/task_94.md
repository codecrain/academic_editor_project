# 타스크 94: 개체 위치 정렬 속성 파싱 및 렌더링 수정

## 배경

BookReview.hwp의 글상자(사각형) 개체가 "쪽의 아래 기준 19.24mm"로 설정되어 있으나, 현재 코드는 항상 위쪽 기준으로만 위치를 계산하여 개체가 페이지 최상단에 배치되는 오류 발생.

hwplib 비교 결과, CommonObjAttr의 attr 비트 필드에서 세로/가로 정렬 방식(vertRelativeArrange, horzRelativeArrange)을 파싱하지 않고 있음이 확인됨.

## hwplib GsoHeaderProperty 비트 구조 (참조)

| Bits | 필드 | 값 |
|------|------|-----|
| 0 | likeWord (글자처럼) | boolean |
| 2 | applyLineSpace | boolean |
| 3-4 | vertRelTo (세로 기준) | Paper(0), Page(1), Para(2) |
| **5-7** | **vertRelativeArrange** (세로 정렬) | 위(0), 가운데(1), **아래(2)**, 안(3), 밖(4) |
| 8-9 | horzRelTo (가로 기준) | Paper(0), Page(1), Column(2), Para(3) |
| **10-12** | **horzRelativeArrange** (가로 정렬) | 왼쪽(0), 가운데(1), **오른쪽(2)**, 안(3), 밖(4) |
| 13 | vertRelToParaLimit | boolean |
| 14 | allowOverlap | boolean |
| 15-17 | widthCriterion | Paper(0), Page(1), Column(2), Para(3), Absolute(4) |
| 18-19 | heightCriterion | Paper(0), Page(1), Absolute(2) |
| 20 | protectSize | boolean |
| 21-23 | textFlowMethod | 어울림(0), 자리차지(1), 글뒤로(2), 글앞으로(3) |
| 24-25 | textHorzArrange | 양쪽(0), 왼쪽만(1), 오른쪽만(2), 큰쪽만(3) |
| 26-28 | objectNumberSort | 없음(0), 그림(1), 표(2), 수식(3) |
| 29 | hasCaption | boolean |

## 현상

- BookReview.hwp 1페이지: 빨간 사각형이 y≈0 (페이지 최상단)에 렌더링
- 기대 위치: 페이지 하단에서 19.24mm 위

## 수정 대상 파일

| 파일 | 수정 내용 |
|------|-----------|
| `src/model/shape.rs` | CommonObjAttr에 vert_align, horz_align 필드 추가 |
| `src/parser/control.rs` | attr 비트 5-7(vert_align), 10-12(horz_align) 파싱 |
| `src/renderer/layout.rs` | compute_object_position()에서 정렬 방식에 따른 좌표 계산 |
| `src/serializer/control.rs` | 직렬화 시 새 필드 반영 (attr 비트에 이미 포함되어 있으므로 변경 최소) |

## 검증 방법

- `docker compose --env-file /dev/null run --rm test` — 기존 테스트 통과
- `export-svg samples/basic/BookReview.hwp` — 사각형이 페이지 하단에 올바르게 배치
