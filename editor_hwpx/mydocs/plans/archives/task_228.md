# Task 228: 형광펜 기능 구현

## 현황 분석

### 이미 구현된 것
- **모델**: `CharShape.shade_color: ColorRef` 필드 존재 (기본값: `0xFFFFFF` = 흰색 = 없음)
- **파서/직렬화**: HWP 파일에서 shade_color 파싱 및 직렬화 구현 완료
- **WASM API**: `getCharPropertiesAt`에서 `shadeColor` JSON 필드 전달됨
- **글자모양 대화상자**: 음영색 color picker 존재, 적용 시 `CharShapeMods.shade_color` 설정됨

### 미구현 사항
1. **렌더러**: `TextStyle`에 `shade_color` 필드 없음 → 텍스트 배경 사각형 렌더링 불가
2. **서식 도구 모음**: 형광펜 버튼 아이콘(`sb-highlight-icon`)은 CSS에 존재하나 동작 미연결

## 구현 계획

### 1단계: TextStyle에 shade_color 추가 및 렌더러 구현
- `TextStyle`에 `shade_color: ColorRef` 필드 추가 (기본값: `0xFFFFFF`)
- `resolve_styles`에서 `CharShape.shade_color` → `TextStyle.shade_color` 매핑
- SVG 렌더러: 텍스트 run 뒤에 `shade_color != 0xFFFFFF`이면 배경 `<rect>` 추가
- HTML 렌더러: `background-color` CSS 속성 추가
- Canvas 렌더러: `fillRect` 호출 추가

### 2단계: 서식 도구 모음 형광펜 버튼 구현
- 서식 도구 모음에 형광펜 버튼 + 색상 드롭다운 추가
- 선택 영역에 `shade_color` 적용하는 커맨드 연결
- 형광펜 토글 (같은 색 재클릭 시 해제 = `0xFFFFFF`)

### 3단계: WASM 빌드 및 통합 테스트
- WASM 빌드
- 형광펜이 적용된 HWP 파일로 렌더링 확인
- 편집 모드에서 형광펜 적용/해제 확인
