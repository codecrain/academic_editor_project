# 타스크 71 최종 완료 보고서

## 새 번호로 시작 (NewNumber) + 자동번호 체계 완성

### 작업 요약

HWP 문서의 "새 번호로 시작"(`nwno`) 컨트롤 처리를 구현하고, 자동번호(`atno`) 체계의 비트 오프셋 버그, 누락 필드 파싱, 번호 형식 미적용 문제를 수정하였다.

### 수정 파일

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `src/model/control.rs` | AutoNumber에 number/user_symbol/prefix_char/suffix_char 필드 추가, PageNumberPos에 user_symbol/prefix_char/suffix_char/dash_char 필드 추가 | +12줄 |
| `src/parser/control.rs` | AutoNumber 비트 오프셋 수정(format 8비트, superscript bit 12) + 장식문자 파싱, PageNumberPos 장식문자 파싱 | +10줄 |
| `src/serializer/control.rs` | AutoNumber/PageNumberPos 직렬화 비트 오프셋 수정 + 장식문자 출력 | +15줄 |
| `src/parser/mod.rs` | assign_auto_numbers()에 NewNumber 카운터 리셋 + DocProperties 시작번호 초기화 | +12줄 |
| `src/renderer/pagination.rs` | PageContent에 page_number 필드 + NewNumber(Page) 수집/반영 | +25줄 |
| `src/renderer/layout.rs` | apply_auto_numbers에 format/장식문자 적용, format_page_number() 리팩토링(중복 함수 제거), 쪽 번호 page_number 사용 | -20줄, +10줄 |

### 구현 내용

#### 1. AutoNumber 비트 오프셋 버그 수정

타스크 70과 동일한 패턴의 비트 필드 파싱 오류 수정:

| 필드 | 수정 전 | 수정 후 | 스펙 (표 145) |
|------|---------|---------|---------------|
| format | `(attr >> 4) & 0x0F` (4비트) | `(attr >> 4) & 0xFF` (8비트) | bit 4~11 |
| superscript | `attr & 0x100` (bit 8) | `attr & 0x1000` (bit 12) | bit 12 |

직렬화도 동일하게 수정.

#### 2. 누락 필드 파싱 (스펙 표 144, 149)

- AutoNumber: UINT16 번호 + WCHAR 사용자기호/앞장식/뒤장식 (12바이트 전체)
- PageNumberPos: WCHAR 사용자기호/앞장식/뒤장식/대시 (12바이트 전체)

#### 3. NewNumber → 자동번호 통합

- `assign_auto_numbers_in_controls()`에 `Control::NewNumber` 핸들러 추가
- `counters[idx] = nn.number - 1` → 다음 AutoNumber가 지정된 번호부터 시작
- DocProperties 시작번호(page_start_num 등 6종)로 카운터 초기화

#### 4. NewNumber(Page) → 쪽 번호 통합

- `PageContent`에 `page_number: u32` 필드 추가
- pagination.rs에서 NewNumber(Page) 컨트롤 수집 → 페이지별 실제 쪽 번호 할당
- layout.rs에서 `page_index + 1` → `page_number` 사용

#### 5. AutoNumber 번호 형식·장식 문자 적용

- `apply_auto_numbers_to_composed()`: `NumFmt::Digit` → `NumFmt::from_hwp_format(an.format)`
- 앞/뒤 장식 문자(prefix_char/suffix_char) 적용
- `format_page_number()`: 중복 함수(to_roman_upper/lower, to_circle_number) 제거 → `mod.rs`의 `format_number()` 재사용

### 검증 결과

| 항목 | 결과 |
|------|------|
| Rust 테스트 | 488개 전체 통과 |
| WASM 빌드 | 성공 |
| Vite 빌드 | 성공 |
| k-water-rfp.hwp SVG 내보내기 | 29페이지 정상 |
| hwp-multi-001.hwp SVG 내보내기 | 11페이지 정상 |
| 기존 문서 회귀 | 없음 |

### 작업 브랜치

`local/task71`
