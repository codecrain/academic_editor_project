# Task 230 최종 보고서: 필드 WASM API 및 데이터 바인딩

## 구현 결과

### 1. 필드 모델 확장 (`src/model/control.rs`)

- `Field::field_name()` — command에서 Name 또는 Direction(안내문) 추출
- `Field::field_type_str()` — FieldType → 문자열 변환
- `Field::extract_wstring_value()` — command 내 wstring 패턴 값 추출 (공통 헬퍼)

### 2. 필드 쿼리/설정 엔진 (`src/document_core/queries/field_query.rs`)

- `collect_all_fields()` — 문서 전체 필드 재귀 탐색 (본문, 표 셀, 글상자 포함)
- `get_field_list_json()` — 전체 필드 목록 JSON 반환
- `get_field_value_by_id()` — field_id로 값 조회
- `get_field_value_by_name()` — 이름으로 값 조회
- `set_field_value_by_id()` — field_id로 값 설정 + 리컴포즈
- `set_field_value_by_name()` — 이름으로 값 설정 + 리컴포즈
- `set_field_text_at()` — 필드 범위 내 텍스트 교체 + field_range 업데이트
- `get_para_mut_at_location()` — 중첩 경로 기반 문단 접근 (1단계 지원)

### 3. WASM API (`src/wasm_api.rs`)

| JS API | 설명 |
|--------|------|
| `getFieldList()` | 전체 필드 목록 (fieldId, name, guide, value, location) |
| `getFieldValue(fieldId)` | field_id로 값 조회 |
| `getFieldValueByName(name)` | 이름으로 값 조회 |
| `setFieldValue(fieldId, value)` | field_id로 값 설정 |
| `setFieldValueByName(name, value)` | 이름으로 값 설정 |

### 4. 프론트엔드 (`rhwp-studio/src/core/wasm-bridge.ts`)

WasmBridge 클래스에 필드 API 래퍼 5개 추가.

### 5. 에러 처리 (`src/error.rs`)

`HwpError::InvalidField` 변형 추가.

### 6. 테스트 (3종)

- `test_task230_get_field_list` — 필드 목록 조회, 11개 필드 확인
- `test_task230_get_field_value` — field_id/이름으로 값 조회
- `test_task230_set_field_value` — 빈 필드에 값 설정 → 리렌더링 검증

## 변경 파일

| 파일 | 변경 |
|------|------|
| `src/model/control.rs` | field_name(), field_type_str(), extract_wstring_value() 추가 |
| `src/error.rs` | InvalidField 에러 변형 추가 |
| `src/document_core/queries/mod.rs` | field_query 모듈 등록 |
| `src/document_core/queries/field_query.rs` | 필드 쿼리/설정 엔진 신규 |
| `src/wasm_api.rs` | 필드 WASM API 5개 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 필드 API 래퍼 5개 추가 |
| `src/wasm_api/tests.rs` | 테스트 3종 추가 |

## 테스트 결과

- 전체 703개 테스트 통과 (task 230 테스트 3개 포함)
