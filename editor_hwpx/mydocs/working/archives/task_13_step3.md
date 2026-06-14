# 타스크 13 - 3단계 완료보고서: 렌더링 구현

## 작업 내용

### 번호 카운터 관리 (NumberingState)
- `NumberingState` 구조체: 수준별(1~7) 카운터 추적
- `advance()`: 같은 수준 연속 → 번호 증가, 상위 수준 전환 → 하위 수준 리셋
- 비번호 문단에서 카운터 리셋하지 않음 (개요 번호는 문서 전체에서 유지)
- `numbering_id` 변경 시에만 전체 리셋

### 번호 문자열 생성 (expand_numbering_format)
- `^N` 제어코드(N=1~7)를 실제 번호로 치환
- `numbering_format_to_number_format()`: 표 43 코드 → NumFmt 변환
  - 0→Digit, 1→CircledDigit, 2→RomanUpper, 8→HangulGaNaDa 등

### 문단 렌더링 시 번호 삽입 (apply_paragraph_numbering)
- `HeadType::Outline` (개요) 및 `HeadType::Number` (문단번호) 지원
- Outline: `numbering_id` 0-based 참조
- Number: `numbering_id` 1-based 참조 (0이면 없음)
- `ComposedParagraph`의 첫 줄 첫 런에 번호 텍스트 삽입

## 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/layout.rs` | NumberingState, expand_numbering_format, apply_paragraph_numbering 추가 |
| `src/renderer/style_resolver.rs` | head_type, para_level, numbering_id, numberings 필드 추가 |
| `src/renderer/composer.rs` | ComposedParagraph에 Clone derive 추가 |

## 검증 결과

- `samples/hwp-multi-002.hwp` (7페이지) 테스트
  - Level 0: 1., 2., 3. (Digit)
  - Level 1: 가., 나., 다. (HangulGaNaDa)
  - Level 2: 1), 2), 3) (Digit) — 상위 수준 전환 시 자동 리셋
- 전체 테스트: 229개 통과 (신규 4개 포함)
