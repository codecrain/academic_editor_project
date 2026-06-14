# 필드/양식개체 구현 로드맵

## 배경

웹기안기를 목표로 하므로, 단순 렌더링뿐 아니라 외부 API를 통한 데이터 바인딩이 핵심이다.
한컴에서 지원하는 필드 관련 컨트롤은 크게 3가지 범주로 나뉜다:

| 범주 | 컨트롤 | ctrlId | 용도 |
|------|--------|--------|------|
| **필드** | 누름틀 | `%clk` | 서식 문서에서 입력 위치 안내 + 데이터 바인딩 |
| | 책갈피 | `%bmk` | 위치 참조 + 데이터 바인딩 |
| | 날짜/경로/요약 등 | `%dte`, `%pat`, `%smr` 등 | 자동 생성 필드 |
| | 하이퍼링크 | `%hlk` | URL 링크 |
| **양식 개체** | 입력 상자(Edit) | FORM_OBJECT | 텍스트 입/출력 |
| | 선택 상자(CheckBox) | FORM_OBJECT | 다중 선택 옵션 |
| | 라디오 단추(RadioButton) | FORM_OBJECT | 단일 선택 옵션 |
| | 목록 상자(ComboBox) | FORM_OBJECT | 드롭다운 선택 |
| | 명령 단추(PushButton) | FORM_OBJECT | 스크립트 실행 |

## 현재 구현 상태

- 모델: `Field` struct + `FieldType` enum 정의됨 (command 필드만 있음, 상세 속성 미비)
- 파서: 필드 컨트롤(`%clk` 등) → `Unknown`으로 처리됨
- 렌더러/직렬화/WASM API: 미구현
- 양식 개체(HWPTAG_FORM_OBJECT): 태그 상수만 정의, 파싱 미구현

## 단계별 타스크 계획

---

### Task 229: 필드 컨트롤 파싱 및 기본 렌더링

**목표**: HWP 파일의 필드 컨트롤(%clk, %hlk 등)을 파싱하고 필드 내용을 렌더링한다.

**범위**:
1. 파서에서 필드 컨트롤 ID(%clk, %hlk, %bmk, %dte 등) 매칭 → `Control::Field` 생성
2. 필드 바이너리 데이터 파싱 (표 154: ctrl_id + 속성 + command + id)
3. `Field` 모델 확장 (속성, id, 읽기전용 여부 등)
4. CHAR_FIELD_BEGIN(0x03) / CHAR_FIELD_END(0x04) 사이 텍스트 정상 렌더링
5. 누름틀 안내문 스타일 렌더링 (빨간색 기울임체)
6. SVG/Canvas에서 필드 내용 확인

**산출물**: 필드가 포함된 HWP 문서의 텍스트가 정상 렌더링됨

---

### Task 230: 필드 WASM API 및 데이터 바인딩

**목표**: 외부에서 필드 이름으로 값을 조회/설정할 수 있는 API를 제공한다.

**범위**:
1. WASM API: `getFieldNames()` — 문서 내 모든 필드 이름 목록 반환
2. WASM API: `getFieldValue(name)` — 필드 이름으로 현재 값 조회
3. WASM API: `setFieldValue(name, value)` — 필드 이름으로 값 설정 (텍스트 교체)
4. 누름틀 필드의 안내문 ↔ 사용자 입력 전환 처리
5. 필드 직렬화 (저장 시 변경된 필드 값 반영)
6. 프론트엔드: `window.rhwpApi.setFieldValue()` 형태의 외부 호출 인터페이스

**산출물**: 외부 JavaScript에서 필드 데이터 바인딩 가능

---

### Task 231: 누름틀 편집 UI

**목표**: 웹 편집기에서 누름틀을 클릭하여 내용을 입력/수정할 수 있다.

**범위**:
1. 누름틀 클릭 시 안내문 사라지고 낫표(「」) 영역 표시
2. 누름틀 영역 내 텍스트 입력/삭제
3. F11 키: 누름틀 내용 블록 선택
4. 편집-고치기: 누름틀 안내문/메모/이름 수정 대화상자
5. 상태 표시줄에 필드 이름/메모 표시

**산출물**: 웹 편집기에서 누름틀 대화형 편집 가능

---

### Task 232: 양식 개체 파싱 및 렌더링

**목표**: HWPTAG_FORM_OBJECT를 파싱하고 양식 개체를 화면에 렌더링한다.

**범위**:
1. HWPTAG_FORM_OBJECT 바이너리 파싱 (실제 파일에서 구조 분석)
2. 양식 개체 모델: FormObject struct (타입, caption, 속성 등)
3. 5종 양식 개체 렌더링:
   - 입력 상자(Edit): 텍스트 입력란
   - 선택 상자(CheckBox): 체크박스
   - 라디오 단추(RadioButton): 라디오 버튼
   - 목록 상자(ComboBox): 드롭다운
   - 명령 단추(PushButton): 버튼
4. Canvas/SVG에서 양식 개체 외형 렌더링

**산출물**: 양식 개체가 포함된 HWP 문서의 시각적 렌더링

---

### Task 233: 양식 개체 상호작용 및 데이터 바인딩

**목표**: 양식 개체의 사용자 상호작용과 외부 데이터 바인딩을 구현한다.

**범위**:
1. 양식 개체 클릭/입력 이벤트 처리
   - CheckBox: 클릭 시 선택/해제 토글
   - RadioButton: 그룹 내 단일 선택
   - ComboBox: 드롭다운 펼치기/선택
   - Edit: 텍스트 입력
   - PushButton: 클릭 이벤트 발생
2. WASM API: `getFormValue(name)` / `setFormValue(name, value)`
3. 양식 개체 값 직렬화 (저장 시 반영)
4. 양식 편집 상태/해제 모드 전환

**산출물**: 양식 개체의 대화형 동작 + 외부 API 데이터 바인딩

---

## 우선순위

| 순서 | 타스크 | 중요도 | 이유 |
|------|--------|--------|------|
| 1 | **229** (필드 파싱/렌더링) | 최우선 | 모든 필드 기능의 기반 |
| 2 | **230** (필드 데이터 바인딩 API) | 핵심 | 웹기안기의 핵심 요구사항 |
| 3 | **231** (누름틀 편집 UI) | 높음 | 사용자 입력 처리 |
| 4 | **232** (양식 개체 파싱/렌더링) | 중간 | 고급 서식 지원 |
| 5 | **233** (양식 개체 상호작용) | 중간 | 양식 완전 지원 |

---

## 참고 자료

- HWP 스펙: `mydocs/tech/hwp_spec_5.0.md` — 표 130(필드 ID), 표 154(필드 구조), 표 155(필드 속성)
- 한컴 도움말:
  - 누름틀: `mydocs/manual/hwp/Help/extracted/insert/madanginfo/madanginfo(press).htm`
  - 양식 개체: `mydocs/manual/hwp/Help/extracted/view/toolbar/toolbar(form_object).htm`
  - 양식 속성: `mydocs/manual/hwp/Help/extracted/view/workwindow/workwindow(attribute).htm`
  - 스크립트: `mydocs/manual/hwp/Help/extracted/view/workwindow/workwindow(script).htm`
