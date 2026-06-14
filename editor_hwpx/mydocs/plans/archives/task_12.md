# 타스크 12: 자동 번호 매기기 (CTRL_AUTO_NUMBER)

## 개요

HWP 문서의 자동 번호 매기기 컨트롤(`atno`)을 렌더링하여 캡션, 각주, 미주 등에 번호가 표시되도록 구현한다.

---

## 현재 상태

### 파싱 (완료)
- `src/model/control.rs`: `AutoNumber`, `AutoNumberType` 구조체 정의됨
- `src/parser/control.rs`: `parse_auto_number()` 함수로 파싱 완료

### 렌더링 (미구현)
- 현재 `AutoNumber` 컨트롤이 렌더링되지 않음
- 캡션에서 "그림 1", "표 2" 대신 "그림 ", "표 " 만 표시됨

---

## 구현 범위

### 자동 번호 종류 (AutoNumberType)
| 종류 | 설명 | 예시 |
|------|------|------|
| Picture | 그림 번호 | 그림 1, 그림 2 |
| Table | 표 번호 | 표 1, 표 2 |
| Equation | 수식 번호 | (1), (2) |
| Footnote | 각주 번호 | 1), 2) |
| Endnote | 미주 번호 | i, ii |
| Page | 쪽 번호 | 1, 2, 3 |

---

## 구현 방향

### 1. 번호 카운터 관리
- 각 `AutoNumberType`별로 카운터 유지
- 문서 렌더링 시작 시 카운터 초기화
- `AutoNumber` 컨트롤 발견 시 카운터 증가 및 번호 반환

### 2. 인라인 렌더링
- `AutoNumber`는 문단 내 인라인 컨트롤 (`ControlChar::Inline`)
- 텍스트 렌더링 시 해당 위치에 번호 문자열 삽입

### 3. 번호 형식 지원
- 아라비아 숫자 (1, 2, 3)
- 로마 숫자 (i, ii, iii)
- 영문 대/소문자 (a, b, c / A, B, C)
- 한글/한자 (가, 나, 다 / 一, 二, 三)

---

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `src/renderer/mod.rs` | AutoNumberCounter 구조체 추가 |
| `src/renderer/layout.rs` | 인라인 컨트롤 렌더링 시 번호 삽입 |
| `src/renderer/composer.rs` | 문단 조합 시 AutoNumber 처리 |

---

## 예상 결과

- 캡션: "그림 1 웹한글기안기 서버 구성", "표 2 지원 환경"
- 각주: 본문에 ¹, 각주 영역에 1)
- 수식: (1), (2), (3)

---

*작성일: 2026-02-06*
