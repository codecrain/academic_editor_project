# Task 233 수행 계획서: 양식 개체 상호작용 및 데이터 바인딩

## 배경

Task 232에서 5종 양식 개체(명령 단추, 체크 박스, 콤보 상자, 라디오 버튼, 편집 상자)의 파싱과 시각 렌더링을 완료하였다. 현재 양식 개체는 화면에 표시만 되며, 클릭이나 입력에 반응하지 않는다.

## 목표

1. 양식 개체 클릭 감지 및 상호작용 구현
2. getFormValue/setFormValue WASM API 노출
3. 양식 개체별 동작 구현 (체크박스 토글, 라디오 버튼 선택, 콤보 상자 드롭다운 등)

## 현황 분석

### Rust (WASM) 측
- `FormObject` 모델에 form_type, name, caption, text, value, enabled 등 속성 보유
- `hitTest()` API는 paragraph/charOffset 반환하지만 양식 개체 식별 불가
- 양식 개체 값 변경/조회 API 없음

### TypeScript (프론트엔드) 측
- `InputHandler` → 마우스 클릭 시 `hitTest()` → 커서 이동 패턴 확립
- `EventBus` 기반 이벤트 전파, `CommandDispatcher` 명령 실행 체계
- 양식 개체 전용 핸들러 없음

## 구현 범위

### WASM API 추가
- `getFormObjectAt(pageNum, x, y)` — 좌표 위치의 양식 개체 정보 반환
- `getFormValue(sec, para, controlIndex)` — 양식 개체 값 조회
- `setFormValue(sec, para, controlIndex, value)` — 양식 개체 값 설정 + 리렌더링
- `getFormObjectInfo(sec, para, controlIndex)` — 양식 개체 상세 정보 반환

### 프론트엔드 상호작용
- 마우스 클릭으로 양식 개체 감지 → 타입별 동작 실행
- CheckBox: 클릭 시 value 토글 (0↔1)
- RadioButton: 클릭 시 같은 그룹 내 선택 변경
- PushButton: 클릭 시 pressed 시각 피드백
- ComboBox: 클릭 시 드롭다운 목록 표시 (HTML overlay)
- Edit: 클릭 시 텍스트 입력 모드 (HTML input overlay)

### 시각 피드백
- 포커스 상태 표시 (점선 테두리 등)
- 버튼 누름 효과
- 체크/라디오 상태 변경 즉시 반영

## 기대 결과

- 브라우저에서 양식 개체를 클릭하면 적절한 상호작용이 발생
- JavaScript에서 `getFormValue`/`setFormValue`로 프로그래밍적 제어 가능
- 체크박스, 라디오 버튼 등의 상태 변경이 Canvas에 즉시 반영

## 위험 요소

- 라디오 버튼 그룹 식별: HWP 속성 문자열에 GroupName이 있는지 확인 필요
- ComboBox 항목 목록: 속성에서 ItemCount/Items 파싱 여부 확인 필요
- Edit 양식의 텍스트 입력: IME 한글 입력 처리 복잡도

## 검증 방법

- `samples/form-01.hwp` 브라우저 로드 후 각 양식 개체 클릭 테스트
- WASM API 호출을 통한 값 조회/설정 확인
- 상태 변경 후 리렌더링 결과 확인
