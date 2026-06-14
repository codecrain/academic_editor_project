# 타스크 144 구현계획서: JSON 유틸리티 통합

## 1단계: helpers.rs 확장 — 새 함수 추가

기존 코드 변경 없이 새 함수만 추가한다.

### 추가 함수

| 함수 | 설명 |
|------|------|
| `json_u32(json, key) -> Option<u32>` | unsigned 정수 파싱 |
| `json_u8(json, key) -> Option<u8>` | json_u32 위임 |
| `json_i16(json, key) -> Option<i16>` | json_i32 위임 |
| `json_f64(json, key) -> Option<f64>` | 부동소수점 파싱 |
| `json_usize(json, key) -> Result<usize, HwpError>` | 필수 필드 파싱 (에러 반환) |
| `json_str` 업그레이드 | 이스케이프 시퀀스 디코딩 (`\"`, `\\`, `\n`, `\r`, `\t`) |
| `json_escape(s) -> String` | JSON 문자열 이스케이프 |
| `json_ok_with(fields) -> String` | `{"ok":true,...fields}` 응답 생성 |

### 검증
- `docker compose --env-file .env.docker run --rm test` — 582개 테스트 통과

## 2단계: 파싱 함수 중복 제거

5개 모듈에서 14개 로컬 함수를 삭제하고 helpers.rs 호출로 교체한다.

### 변경 대상

| 모듈 | 삭제 함수 | 교체 |
|------|----------|------|
| object_ops.rs | extract_u32, extract_i32, extract_bool, extract_str | json_u32, json_i32, json_bool, json_str |
| rendering.rs | parse_u32, parse_bool | json_u32, json_bool |
| table_ops.rs | parse_u32, parse_i16, parse_u8, parse_bool ×2 | json_u32, json_i16, json_u8, json_bool |
| cursor_nav.rs | extract_num, extract_json_int | json_f64 + unwrap_or, json_usize |
| cursor_rect.rs | extract_json_f64 | json_f64 |

### 검증
- `docker compose --env-file .env.docker run --rm test` — 582개 테스트 통과

## 3단계: JSON 이스케이프 통합

5개 모듈 11곳의 `.replace(...)` 체인을 `json_escape()` 호출로 교체한다.

### 변경 대상

| 모듈 | 위치 |
|------|------|
| clipboard.rs | 2곳 (L104-108, L185-189) |
| document.rs | 4곳 (L149, L151, L163, L177) |
| formatting.rs | 2곳 (L87-88, L103) |
| object_ops.rs | 1곳 (L69-73) |
| rendering.rs | 2곳 (L193-196, L223-224) |

### 검증
- `docker compose --env-file .env.docker run --rm test` — 582개 테스트 통과

## 4단계: JSON 응답 생성 헬퍼 적용

고빈도 `format!("{{` 패턴(≥2회 반복)을 `json_ok_with()` 호출로 교체한다.

### 변경 대상

| 패턴 | 모듈 | 횟수 |
|------|------|------|
| `{"ok":true,"charOffset":N}` | text_editing.rs | 4 |
| `{"ok":true,"paraIdx":N,"charOffset":N}` | text_editing.rs | 4 |
| `{"ok":true,"cellParaIndex":N,"charOffset":N}` | text_editing.rs | 2 |
| `{"ok":true,"rowCount":N,"colCount":N}` | table_ops.rs | 4 |
| `{"ok":true,"cellCount":N}` | table_ops.rs | 4 |
| `{"ok":true,"text":"..."}` | clipboard.rs | 3 |
| `{"ok":true,"paraIdx":N,"controlIdx":0}` | object_ops.rs | 2 |

단발 패턴(1회)은 교체하지 않음.

### 검증
- `docker compose --env-file .env.docker run --rm test` — 582개 테스트 통과
- `docker compose --env-file .env.docker run --rm wasm` — WASM 빌드
- `npx tsc --noEmit` — TypeScript 컴파일
- `docker compose --env-file .env.docker run --rm dev cargo clippy -- -D warnings`
