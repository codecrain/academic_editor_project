# Task 229: 필드 컨트롤 파싱 및 기본 렌더링

## 현황 분석

### 이미 구현된 것
- **모델**: `Field` struct (`field_type`, `command`), `FieldType` enum (ClickHere 포함)
- **태그 상수**: `CHAR_FIELD_BEGIN(0x03)`, `CHAR_FIELD_END(0x04)` 정의
- **HWPX 파서**: `fieldBegin` 태그에서 `Field` 타입/이름 파싱 구현
- **CTRL_DATA 보존**: 각 컨트롤의 CTRL_DATA 바이너리를 `ctrl_data_records`에 라운드트립 보존

### 미구현 사항
1. **바이너리 파서**: 필드 ctrl_id(`%clk`, `%hlk` 등) → `Control::Unknown`으로 처리됨
2. **필드 데이터 파싱**: 속성(4B), 기타속성(1B), command(가변), id(4B) 미파싱
3. **필드 내 텍스트 처리**: 0x03/0x04 사이 텍스트는 일반 텍스트로 렌더링되나 필드 범위 추적 없음
4. **렌더링**: 필드 시각 표시 없음 (누름틀 안내문 스타일, 필드 경계 등)
5. **직렬화**: `Control::Field` → ctrl_id=0으로 직렬화됨 (불완전)

### 파싱 흐름 분석

```
PARA_TEXT: [일반텍스트][0x03 + ctrl_id(4B) + 추가정보(8B) + 0x03][필드내용텍스트][0x04 + 패딩(14B)]
                          ↓
CTRL_HEADER 레코드:  ctrl_id(4B) + ctrl_data(가변) → parse_control()에서 Unknown 반환
                          ↓
CTRL_DATA 레코드:    필드 고유 데이터 (command, id 등) → ctrl_data_records에 보존
```

## 구현 계획

### 1단계: 필드 컨트롤 바이너리 파싱

**목표**: `%clk`, `%hlk` 등 필드 ctrl_id를 인식하여 `Control::Field`로 파싱

**수정 파일**:
- `src/parser/tags.rs`: 필드 ctrl_id 상수 정의 (`FIELD_CLICKHERE`, `FIELD_HYPERLINK` 등)
- `src/parser/control.rs`: `parse_control()`에 필드 ctrl_id 매칭 추가 → `parse_field()` 호출
- `src/model/control.rs`: `Field` struct 확장 (속성, id, 읽기전용 여부, 메모 등)

**파싱할 필드 데이터** (표 154):
```
UINT32 ctrl_id     → FieldType 매핑
UINT32 속성         → bit 0: 읽기전용에서도 수정 가능, bit 15: 수정됨
BYTE   기타속성
WORD   command길이
WCHAR  command[len] → 필드 이름/명령 (누름틀: 안내문, 하이퍼링크: URL)
UINT32 id          → 문서 내 고유 ID
```

### 2단계: 필드 내 텍스트 범위 추적 및 렌더링

**목표**: 필드 시작/끝 사이 텍스트를 식별하고 누름틀 안내문 스타일로 렌더링

**수정 파일**:
- `src/parser/body_text.rs`: 0x03/0x04 위치를 기반으로 필드 텍스트 범위 추적
- `src/model/paragraph.rs`: 필드 범위 정보 저장 (시작/끝 char offset + 필드 인덱스)
- `src/renderer/layout/paragraph_layout.rs`: 누름틀 안내문 → 빨간 기울임체 스타일 오버라이드
- `src/renderer/svg.rs`, `web_canvas.rs`, `html.rs`: 필드 경계 시각 표시 (선택적)

### 3단계: 직렬화 및 테스트

**목표**: 필드가 포함된 문서의 저장/재로드가 정상 동작

**수정 파일**:
- `src/serializer/control.rs`: `Control::Field` 직렬화 (ctrl_id + 속성 + command)
- `src/serializer/body_text.rs`: 필드 문자 코드(0x03/0x04) + ctrl_id 정확한 직렬화
- `src/wasm_api/tests.rs`: 필드 파싱/렌더링 테스트

**테스트 항목**:
- 누름틀 포함 HWP 파일 파싱 → 필드 타입/이름 확인
- 필드 내 텍스트 렌더링 확인 (SVG 내보내기)
- 저장 후 재로드 시 필드 데이터 보존 확인
