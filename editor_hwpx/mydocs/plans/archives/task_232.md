# Task 232: 양식 개체 파싱 및 렌더링

## 개요

HWP 양식 개체(Form Object, ctrl_id=0x666f726d='form')를 파싱하고 5종 양식 개체를 시각적으로 렌더링한다.

## 배경

### 양식 개체란?

한글 워드프로세서의 양식 개체는 문서 내에 삽입되는 대화형 UI 컨트롤이다. 5종류가 있다:

| 양식 개체 | 타입 ID | 설명 |
|-----------|---------|------|
| 명령 단추 (PushButton) | `tbp+` | 스크립트 실행용 버튼 |
| 선택 상자 (CheckBox) | `tbc+` | 다중 선택 가능한 체크박스 |
| 목록 상자 (ComboBox) | `boc+` | 드롭다운 목록에서 하나 선택 |
| 라디오 단추 (RadioButton) | `tbr+` | 그룹 내 단일 선택 |
| 입력 상자 (Edit) | `tde+` | 텍스트 입력/출력 |

### 바이너리 구조 분석 결과

`samples/form-01.hwp` 바이너리 분석으로 확인한 구조:

```
CTRL_HEADER (ctrl_id = 0x666f726d)
├── ctrl_data (42 bytes): CommonObjAttr와 유사한 개체 공통 속성
│   ├── bytes 0-3: attr (u32)
│   ├── bytes 4-7: y_offset (i32, HWPUNIT)
│   ├── bytes 8-11: x_offset (i32, HWPUNIT)
│   ├── bytes 12-15: width (u32, HWPUNIT)
│   ├── bytes 16-19: height (u32, HWPUNIT)
│   ├── byte 20: form_index (순차 인덱스 0,1,2...)
│   └── bytes 21-41: 기타 속성
└── HWPTAG_FORM_OBJECT (자식 레코드)
    ├── bytes 0-7: 8-byte 타입 ID ("tbp+xxxx", "tbc+xxxx" 등)
    ├── bytes 8-11: u32 전체 길이
    ├── bytes 12-13: u16 문자열 길이 (WCHAR 단위)
    └── bytes 14~: WCHAR(UTF-16LE) 속성 문자열
```

### 속성 문자열 포맷

```
Key:type:value 반복
- type "set:N" → N개의 하위 키-값 쌍이 뒤따름
- type "wstring:N" → N 바이트의 WCHAR 문자열 값
- type "int" → 정수 값
```

예시 (PushButton):
```
CommonSet:set:218:Name:wstring:10:PushButton
ForeColor:int:0
BackColor:int:15790320
GroupName:wstring:0:
Caption:wstring:10:PushButton
...
```

### 양식 개체 속성 (한컴 도움말 참조)

| 속성 | 적용 대상 | 설명 |
|------|-----------|------|
| Name | 전체 | 개체 이름 (최대 40자) |
| Caption | PushButton, CheckBox, RadioButton | 표시 텍스트 |
| Text | ComboBox, Edit | 개체 내 텍스트 |
| ForeColor | 전체 | 글자 색 |
| BackColor | 전체 | 배경 색 |
| CharShape | 전체 | 글꼴/크기 |
| Width/Height | 전체 | 개체 크기 |
| Value | CheckBox, RadioButton | 선택 상태 (0/1) |
| GroupName | 전체 | 탭 이동 그룹 |
| RadioGroupName | RadioButton | 라디오 그룹 |
| DrawFrame | ComboBox, Edit | 틀 표시 여부 |
| Enabled | 전체 | 활성화 여부 |
| BorderType | 전체 | 테두리 설정 |

## 목표

1. **파싱**: Form 컨트롤 바이너리 데이터를 `FormObject` 모델로 파싱
2. **렌더링**: 5종 양식 개체의 시각적 모양을 SVG/Canvas로 렌더링
3. **레이아웃**: 양식 개체를 인라인 확장 컨트롤로 문단 레이아웃에 배치

## 범위

- 파싱: ctrl_data + HWPTAG_FORM_OBJECT 속성 문자열 파싱
- 렌더링: 정적 시각 표현 (편집/상호작용은 Task 233)
- SVG + Canvas 양쪽 렌더러 지원

## 검증 방법

- `samples/form-01.hwp` SVG 내보내기로 5종 양식 개체가 올바른 위치/크기에 렌더링되는지 확인
- 기존 테스트 전체 통과
- 한글 워드프로세서 실행 결과와 육안 비교

## 예상 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/model/control.rs` | `FormObject` 구조체 + `FormType` enum 추가, `Control::Form` 변형 추가 |
| `src/parser/control.rs` | `parse_form_control()` 함수 추가 |
| `src/parser/tags.rs` | `CTRL_FORM` 상수 추가 |
| `src/renderer/render_tree.rs` | `RenderNodeType::FormObject` + `FormObjectNode` 추가 |
| `src/renderer/layout/paragraph_layout.rs` | Form 컨트롤 레이아웃 배치 |
| `src/renderer/svg.rs` | Form 개체 SVG 렌더링 |
| `src/renderer/web_canvas.rs` | Form 개체 Canvas 렌더링 |
