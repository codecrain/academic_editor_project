# 타스크 235: TAC 표 공백 인라인 배치 및 페이지 오버플로우 수정

## 현상

1. **TAC 표 수평 위치 오류**: 편집자가 TAC 표 앞뒤에 공백 문자를 사용하여 수평 위치를 조정하는데 (`·[표]··`), 현재 이 공백을 무시하고 표를 독립적으로 배치하여 위치가 틀림
2. **페이지 오버플로우**: kps-ai.hwp 78페이지 중 11페이지에서 LAYOUT_OVERFLOW 발생 (최대 28.1px). pagination과 layout 간 TAC 표 높이 계산 불일치가 원인

## 원인 분석

### TAC 표 분류 문제
- `is_tac_table_inline()`: 표 너비가 seg 너비의 90% 이상이면 인라인이 아닌 **블록**으로 분류
- 실제 예: para=106 — 표 너비 48227 / seg 50752 = 95% → 블록 처리
- 블록 TAC는 `PageItem::Table`로 독립 렌더링되어 공백 위치가 무시됨

### 높이 불일치 구조
pagination과 layout이 TAC 표 높이를 다르게 계산:
- **pagination**: `effective_height + host_spacing` 또는 `seg.line_height + ls/2` (보정 cap 적용)
- **layout**: `max(table_height, line_end_snap) + ls/2` — vpos 스냅 보정이 추가적으로 적용

para=106 예시:
- pagination delta: 80.2px
- layout delta: 86.2px (차이 6.0px)
- 3개 표에서 누적되어 28.1px 오버플로우

## 수행 계획

### 1단계: TAC 표 인라인 분류 기준 개선
- `is_tac_table_inline()` 함수에서 공백+표 구조의 TAC를 인라인으로 분류하도록 수정
- 또는 별도 경로 없이, 텍스트(공백)가 있는 TAC 표는 항상 composer의 인라인 배치로 처리

### 2단계: TAC 표 인라인 렌더링에서 공백 반영
- 공백 문자의 폭만큼 표 x 위치를 오른쪽으로 이동
- `layout_inline_table_paragraph`에서 텍스트 run과 표를 같은 줄에 배치

### 3단계: pagination/layout 높이 동기화
- TAC 표 문단의 높이 계산을 pagination과 layout에서 동일한 로직으로 통일
- line_seg의 vpos+line_height 기준으로 일관되게 계산
- 비-TAC 표의 host_line_spacing 폴백 (line_spacing==0 → line_height) 반영

### 4단계: 검증 및 회귀 테스트
- cargo test 전체 통과 확인
- kps-ai.hwp LAYOUT_OVERFLOW 감소/제거 확인
- WASM 빌드 + 브라우저 테스트
- 기존 samples (KTX, field-02, f11-01 등) 렌더링 정상 확인
