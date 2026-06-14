# 타스크 200 구현 계획서: 문단부호 공백(∨)·탭(→) 표시

## 단계 구성 (3단계)

### 1단계: SVG 렌더러 공백·탭 기호 구현

**src/renderer/svg.rs 수정:**
- TextRun 렌더링 시 `show_paragraph_marks`가 true이면:
  - 텍스트 내 공백(' ') 위치마다 ∨(U+2228) 기호를 파란색(#4A90D9)으로 오버레이
  - 텍스트 내 탭('\t') 위치에 →(U+2192) 기호를 표시
- 공백 기호 위치: 각 공백 문자의 x좌표 중앙, baseline 근처
- 글자 너비 측정을 위한 헬퍼 필요 (개별 문자 위치 계산)

**검증:** cargo test + SVG 내보내기로 시각 확인

### 2단계: HTML·Canvas 렌더러 공백·탭 기호 구현

**src/renderer/html.rs 수정:**
- SVG와 동일한 로직으로 공백·탭 기호 `<span>` 출력

**src/renderer/web_canvas.rs 수정:**
- Canvas fillText로 공백·탭 기호 그리기
- 개별 문자 x좌표 계산 후 기호 오버레이

**검증:** WASM 빌드 + 웹 에디터 확인

### 3단계: 테스트 + WASM 빌드 + 최종 검증

- 공백·탭 포함 텍스트의 SVG 내보내기 테스트
- 전체 cargo test 통과
- Docker WASM 빌드
- 웹 에디터에서 문단부호 표시 확인
