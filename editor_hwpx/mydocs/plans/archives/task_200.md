# 타스크 200: 문단부호 공백(∨)·탭(→) 표시

## 목표

문단부호 표시 시 공백과 탭 문자에 문단부호 기호를 표시한다.

## 현재 상태

### 완료된 인프라
- `show_paragraph_marks` 플래그 (HwpDocument, WASM API, 3대 렌더러)
- 하드 리턴(⤵) / 강제 줄바꿈(↓) 기호 표시 (Task 199)
- 색상 #4A90D9 (파란색)

### 미구현 항목
- 공백 문자 위치에 ∨ 기호 표시 없음
- 탭 문자 위치에 → 기호 표시 없음

## 한컴 기준

| 항목 | 기호 | 색상 | 표시 조건 |
|------|------|------|-----------|
| 공백 (Space) | ∨ (아래 꺾쇠) | 파란색 #4A90D9 | 문단부호 ON |
| 탭 (Tab) | → (오른쪽 화살표) | 파란색 #4A90D9 | 문단부호 ON |

## 구현 방식

공백·탭 기호는 **렌더러 단계**에서 처리한다.
TextRunNode의 text에 포함된 공백/탭 문자를 스캔하여, 해당 위치에 기호를 오버레이한다.

### 렌더링 위치 계산
- 공백: 각 공백 문자의 x 좌표 = run.bbox.x + (공백까지의 텍스트 너비)
  - 기호 크기는 폰트 크기의 약 40~50% 수준
  - ∨를 공백 영역 중앙 하단에 배치
- 탭: 탭 문자 시작 위치에 → 표시

### 영향 범위

| 파일 | 수정 내용 |
|------|-----------|
| `src/renderer/svg.rs` | 공백·탭 기호 SVG 출력 |
| `src/renderer/html.rs` | 공백·탭 기호 HTML 출력 |
| `src/renderer/web_canvas.rs` | 공백·탭 기호 Canvas 출력 |

## 범위 외

- 개체 부호([표], [그림] 등) → 타스크 201
- 조판부호/문단부호 독립 토글 → 후속 타스크
- 탭 리더(채움 문자) 시각화 → 후속 타스크

## 참조

- 한컴 도움말: `mydocs/manual/hwp/Help/extracted/view/control_code.htm`
- 공백 기호 이미지: `mydocs/manual/hwp/Help/extracted/images/3v_code(space).gif`
- 스크린샷: `mydocs/manual/hwp/Help/extracted/images/3v_control_code_01.gif`
