# Task 232 구현 계획서: 양식 개체 파싱 및 렌더링

## 단계 구성 (4단계)

### 1단계: 모델 정의 및 파서 구현

**목표**: FormObject 모델 구조체 정의 + 바이너리 파싱

**변경 파일**:
- `src/model/control.rs` — `FormType` enum, `FormObject` 구조체, `Control::Form` 변형 추가
- `src/parser/tags.rs` — `CTRL_FORM` 상수 추가
- `src/parser/control.rs` — `parse_form_control()` 함수 구현 (ctrl_data + HWPTAG_FORM_OBJECT 파싱)

**세부 작업**:
1. `FormType` enum 정의: PushButton, CheckBox, ComboBox, RadioButton, Edit
2. `FormObject` 구조체 정의:
   - `form_type: FormType`
   - `name: String` (개체 이름)
   - `caption: String` (표시 텍스트 — PushButton/CheckBox/RadioButton)
   - `text: String` (내용 텍스트 — ComboBox/Edit)
   - `width: u32` (HWPUNIT)
   - `height: u32` (HWPUNIT)
   - `fore_color: u32` (글자 색)
   - `back_color: u32` (배경 색)
   - `value: i32` (CheckBox/RadioButton 선택 상태)
   - `enabled: bool`
   - `properties: HashMap<String, String>` (기타 속성 원본 보존)
3. 속성 문자열 파서: `parse_form_properties()` — `Key:type:value` 포맷 해석
4. `parse_form_control()`: ctrl_data에서 width/height 추출 + HWPTAG_FORM_OBJECT에서 타입ID와 속성 문자열 파싱
5. `Control::Form(Box<FormObject>)` 변형 추가 및 match arm 연결

**검증**: `cargo test` 통과 + `samples/form-01.hwp` 파싱 시 5개 FormObject가 생성되는지 eprintln으로 확인 후 제거

### 2단계: 렌더 트리 + 레이아웃 배치

**목표**: FormObject를 렌더 트리에 노드로 추가하고 문단 레이아웃에 인라인 배치

**변경 파일**:
- `src/renderer/render_tree.rs` — `RenderNodeType::FormObject(FormObjectNode)` 추가
- `src/renderer/layout/paragraph_layout.rs` — `Control::Form` 처리 (인라인 개체로 배치)
- 필요시 `shape_layout.rs`, `table_layout.rs` 등에서 `Control::Form` arm 추가

**세부 작업**:
1. `FormObjectNode` 구조체 정의 (form_type, caption/text, colors, enabled 등 렌더링에 필요한 정보)
2. `RenderNodeType::FormObject(FormObjectNode)` 변형 추가
3. paragraph_layout에서 `Control::Form` 매칭 → 개체 크기(width/height)를 px 변환하여 인라인 배치
4. 기존 `Control::Unknown` 처리 코드가 form을 무시하던 부분 수정
5. 표/글상자 내부 문단에서도 Form 개체가 배치되도록 처리

**검증**: `cargo test` 통과 + SVG 내보내기 시 FormObject 노드가 올바른 bbox에 생성되는지 확인

### 3단계: SVG 렌더링

**목표**: 5종 양식 개체의 시각적 모양을 SVG로 렌더링

**변경 파일**:
- `src/renderer/svg.rs` — `RenderNodeType::FormObject` 매칭 + 각 타입별 SVG 출력

**세부 작업**:
1. PushButton: 회색 배경 사각형 + 3D 효과(밝은/어두운 테두리) + 캡션 텍스트 중앙 배치
2. CheckBox: 체크박스 사각형(□/☑) + 캡션 텍스트 오른쪽 배치
3. ComboBox: 입력 영역 사각형 + 오른쪽 드롭다운 화살표(▼) + 텍스트
4. RadioButton: 원형(○/◉) + 캡션 텍스트 오른쪽 배치
5. Edit: 테두리 사각형 + 내부 텍스트
6. 공통: ForeColor/BackColor 적용, 비활성 시 회색 처리

**검증**: `samples/form-01.hwp` SVG 내보내기 → 한글 실행 결과와 육안 비교

### 4단계: Canvas 렌더링 + 마무리

**목표**: Canvas 렌더러에 동일한 양식 개체 렌더링 추가 + 전체 정리

**변경 파일**:
- `src/renderer/web_canvas.rs` — `RenderNodeType::FormObject` 매칭 + Canvas API로 렌더링
- `src/renderer/html.rs` — FormObject placeholder 텍스트 추가
- 기타: `Control::Form` 처리가 필요한 match exhaustiveness 대응

**세부 작업**:
1. Canvas 렌더링: SVG와 동일한 시각 표현을 Canvas 2D API로 구현
2. HTML 렌더러: `[양식:명령 단추]` 등 placeholder 텍스트
3. `Control::Form` 관련 match exhaustiveness 경고 해소 (cursor_nav, doc_tree_nav 등)
4. 기존 테스트 전체 통과 확인
5. 오늘할일 문서 상태 갱신

**검증**: WASM 빌드 후 브라우저에서 양식 개체 표시 확인, `cargo test` 전체 통과
