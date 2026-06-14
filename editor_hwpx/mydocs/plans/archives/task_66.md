# 타스크 66 수행계획서: 텍스트+Table 동시 포함 문단 렌더링 수정

## 배경

타스크 65 진행 중 `img-start-001.hwp` 1페이지에서 텍스트와 Table 컨트롤이 동시에 포함된 문단의 텍스트가 렌더링되지 않는 문제를 발견하여 백로그(B1)에 등록했다.

## 현상

- `para[1]`이 텍스트(80자: "【주관부서】디지털전환추진단 오은 단장...")와 Table 컨트롤을 동시에 포함
- `layout.rs:241-252`에서 `has_table=true`이면 `continue`로 문단 텍스트 렌더링을 건너뜀
- 결과: 해당 텍스트가 SVG/Canvas 모두에서 표시되지 않음

## 원인

코드가 "Table 문단 = 텍스트 없음"으로 가정. HWP 문서 대부분은 이 가정이 맞지만, 일부 문서에서는 텍스트와 Table이 한 문단에 공존.

## 수정 범위

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/layout.rs` | `has_table` 조건에 `para.text.is_empty()` 추가 |
| `src/renderer/pagination.rs` | 텍스트 있는 Table 문단 높이 계산 포함 |
| `src/renderer/height_measurer.rs` | 동일 조건 적용 |

## 검증 방법

1. Rust 전체 테스트 통과
2. SVG 내보내기로 텍스트 렌더링 확인
3. 기존 Table 레이아웃 회귀 없음
