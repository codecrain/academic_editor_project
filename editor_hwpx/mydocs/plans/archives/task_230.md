# Task 230: 필드 WASM API 및 데이터 바인딩

## 목표

외부 JavaScript에서 필드 이름(또는 command)으로 값을 조회/설정할 수 있는 WASM API를 제공한다.
이는 웹기안기의 핵심 요구사항으로, HWP 서식 문서의 누름틀 필드에 프로그래밍 방식으로 데이터를 채울 수 있게 한다.

## 현재 상태 (Task 229 완료 후)

- 필드 15종 파싱 완료 (`Control::Field`, `FieldType` enum)
- `FieldRange`로 필드 텍스트 범위 추적
- 빈 ClickHere 안내문 렌더링 (빨간색 기울임체)
- 필드 직렬화 라운드트립 완료

## 필드 식별 방식

HWP 스펙상 필드에는 별도의 "이름" 속성이 없다.
- `command`: 필드 고유 정보 문자열 (ClickHere의 경우 `Direction:wstring:{n}:{안내문}`)
- `field_id`: 문서 내 고유 ID (숫자)
- 한컴 누름틀의 "이름"은 command 내 `Name:wstring:{n}:{name}` 형태로 저장됨

API는 다음 두 방식으로 필드 접근을 지원한다:
1. **command 문자열 매칭** (안내문/이름 기반)
2. **field_id** (숫자 기반, 정밀 접근)

## 구현 계획

### 1단계: 필드 조회 API (Rust)

Field 모델에 `field_name()` 메서드 추가 (command에서 Name 추출).
문서 전체에서 필드를 재귀 탐색하는 헬퍼 구현.

**WASM API**:
- `getFieldList()` → JSON 배열: `[{fieldId, fieldType, name, command, value, location}]`
- `getFieldValue(fieldId)` → 필드 현재 값 (텍스트)
- `getFieldValueByName(name)` → 이름으로 조회

### 2단계: 필드 값 설정 API (Rust + 렌더링)

필드 범위(start~end) 내 텍스트 교체.
안내문 ↔ 사용자 입력 전환 처리.
렌더 트리 캐시 무효화.

**WASM API**:
- `setFieldValue(fieldId, value)` → 필드 값 설정
- `setFieldValueByName(name, value)` → 이름으로 설정

### 3단계: 프론트엔드 연동 + 테스트

WasmBridge에 필드 API 래퍼 추가.
테스트: 필드 조회 → 값 설정 → re-render → SVG 검증.

## 산출물

- Rust WASM API: `getFieldList`, `getFieldValue`, `setFieldValue` 등
- TypeScript WasmBridge 래퍼
- 테스트 3종 이상
