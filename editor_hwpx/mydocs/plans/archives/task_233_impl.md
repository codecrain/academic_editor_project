# Task 233 구현 계획서: 양식 개체 상호작용 및 데이터 바인딩

## 단계 구성 (4단계)

### 1단계: WASM API 구현

**목표**: 양식 개체 감지, 값 조회/설정 API를 WASM으로 노출

**변경 파일**:
- `src/wasm_api.rs` — 4개 API 메서드 추가
- `src/document_core/queries/` — 양식 개체 조회 네이티브 구현 (신규 파일 또는 기존 파일 확장)

**세부 작업**:
1. `getFormObjectAt(pageNum, x, y)` — 렌더 트리에서 FormObject 노드의 bbox와 좌표 충돌 검사
   - 반환: `{"found":true, "sec":N, "para":N, "ci":N, "formType":"CheckBox", "name":"...", "value":N, "caption":"...", "text":"...", "bbox":{"x":N,"y":N,"w":N,"h":N}}` 또는 `{"found":false}`
2. `getFormValue(sec, para, ci)` — 문서 트리에서 Control::Form 접근 → 값 반환
   - 반환: `{"ok":true, "formType":"...", "value":N, "text":"...", "caption":"..."}`
3. `setFormValue(sec, para, ci, valueJson)` — FormObject의 value/text 수정 + recompose_section + 캐시 무효화
   - valueJson: `{"value":1}` (CheckBox/RadioButton) 또는 `{"text":"입력값"}` (ComboBox/Edit)
   - 반환: `{"ok":true}`
4. `getFormObjectInfo(sec, para, ci)` — 상세 속성 반환 (properties HashMap 포함, ComboBox 항목 목록 등)

**검증**: `cargo test` 통과 + eprintln으로 API 동작 확인

### 2단계: 프론트엔드 양식 개체 클릭 감지 및 기본 상호작용

**목표**: 마우스 클릭으로 양식 개체 감지 + CheckBox 토글, RadioButton 선택, PushButton 피드백

**변경 파일**:
- `rhwp-studio/src/core/wasm-bridge.ts` — getFormObjectAt, getFormValue, setFormValue 래퍼 추가
- `rhwp-studio/src/core/types.ts` — FormObjectInfo 인터페이스 추가
- `rhwp-studio/src/engine/input-handler-mouse.ts` — onClick에서 양식 개체 감지 분기 추가
- `rhwp-studio/src/engine/input-handler.ts` — handleFormClick 메서드 추가

**세부 작업**:
1. `wasm-bridge.ts`에 `getFormObjectAt()`, `setFormValue()` 래퍼 추가
2. `types.ts`에 `FormObjectHitResult` 인터페이스 정의
3. `onClick` 핸들러에서 hitTest 전 `getFormObjectAt` 호출 → 양식 개체이면 별도 처리
4. CheckBox: 클릭 시 `setFormValue(sec, para, ci, {value: toggledValue})` → 페이지 리렌더링
5. RadioButton: 클릭 시 value 설정 → 같은 그룹(GroupName) 내 다른 라디오 버튼 해제
6. PushButton: 클릭 시 시각 피드백만 (pressed 효과 후 복원)

**검증**: 브라우저에서 체크박스 클릭 → 체크 표시 토글 확인, 라디오 버튼 클릭 → 선택 변경 확인

### 3단계: ComboBox 드롭다운 및 Edit 입력 오버레이

**목표**: ComboBox 클릭 시 HTML select 오버레이, Edit 클릭 시 HTML input 오버레이

**변경 파일**:
- `rhwp-studio/src/engine/input-handler.ts` — 오버레이 생성/제거 로직
- `rhwp-studio/src/styles/` — 오버레이 스타일 (필요시)

**세부 작업**:
1. ComboBox 클릭 시:
   - `getFormObjectInfo`로 항목 목록 조회
   - 양식 개체 bbox 위치에 HTML `<select>` 요소 오버레이
   - 선택 변경 시 `setFormValue(sec, para, ci, {text: selectedItem})` → 리렌더링
   - 포커스 이탈 시 오버레이 제거
2. Edit 클릭 시:
   - bbox 위치에 HTML `<input>` 요소 오버레이
   - 입력 완료(Enter/blur) 시 `setFormValue(sec, para, ci, {text: inputValue})` → 리렌더링
   - 오버레이 제거
3. 공통: 캔버스 좌표 → 화면 좌표 변환, 줌 레벨 반영

**검증**: ComboBox 클릭 → 드롭다운 표시 → 항목 선택 → 값 반영, Edit 클릭 → 입력 → 값 반영

### 4단계: WASM 빌드 + 통합 테스트 + 마무리

**목표**: 전체 빌드 검증 및 정리

**변경 파일**:
- 컴파일 오류 수정 (있을 경우)
- `mydocs/orders/20260316.md` — 상태 갱신

**세부 작업**:
1. `cargo test` 전체 통과 확인
2. WASM 빌드 (`docker compose --env-file .env.docker run --rm wasm`)
3. `samples/form-01.hwp` 브라우저 로드 → 5종 양식 개체 상호작용 통합 테스트
4. 오늘할일 상태 갱신

**검증**: WASM 빌드 성공 + 브라우저에서 모든 양식 개체 상호작용 정상 동작
