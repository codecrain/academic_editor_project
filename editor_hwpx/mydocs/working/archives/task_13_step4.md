# 타스크 13 - 4단계 완료보고서: 테스트 및 검증

## 단위 테스트 (4개 추가)

| 테스트 | 검증 내용 |
|--------|-----------|
| `test_numbering_state_advance` | 카운터 증가, 수준 전환 시 하위 리셋, numbering_id 변경 시 전체 리셋 |
| `test_expand_numbering_format_digit` | `^1.` → "3.", `(^3)` → "(1)" 등 Digit 형식 치환 |
| `test_expand_numbering_format_hangul` | HangulGaNaDa(코드8) 형식: `^2.` → "다." |
| `test_numbering_format_to_number_format` | 표 43 코드 → NumFmt 매핑 (0→Digit, 8→HangulGaNaDa 등) |

## 통합 테스트

- `samples/hwp-multi-002.hwp` SVG 출력 시각적 검증 완료
  - 수준별 번호 올바르게 증가
  - 상위 수준 전환 시 하위 번호 리셋 확인
  - 7페이지 전체 정상 렌더링

## 기존 테스트 통과 확인

- 전체 229개 테스트 통과 (기존 225 + 신규 4)
- 경고 없음
