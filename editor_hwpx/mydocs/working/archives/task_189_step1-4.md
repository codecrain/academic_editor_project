# 타스크 189 단계별 완료 보고서 (1~4단계)

## 1단계: Rust API 확장

### get_picture_properties_native 확장 (+19필드, 총 32개)
- 회전/대칭: `rotationAngle`, `horzFlip`, `vertFlip`
- 원본 크기: `originalWidth`, `originalHeight`
- 자르기: `cropLeft/Top/Right/Bottom`
- 안쪽 여백: `paddingLeft/Top/Right/Bottom`
- 바깥 여백: `outerMarginLeft/Top/Right/Bottom`
- 테두리: `borderColor`, `borderWidth`

### set_picture_properties_native 확장
- 위 필드 전부 설정 지원
- `effect` 설정 추가 (이전에는 get만 가능)
- flip 비트 동기화 (`shape_attr.flip` 비트 갱신)

### 수정 파일
- `src/document_core/commands/object_ops.rs`

## 2단계: 그림 탭 UI 구현

### buildPicturePanel() 신규 구현
- 파일 이름 (읽기 전용 + "문서에 포함" disabled 체크)
- 확대/축소 비율: 가로/세로 %, 비율유지 체크, 프리셋 버튼 5개(100%/½/⅔/³⁄₂/×2), "원래 그림으로" 버튼
- 그림 자르기: 4방향 mm + "모두" 동기 스피너
- 그림 여백: 4방향 mm + "모두" 동기 스피너
- 그림 효과: 라디오 4개(효과없음/회색조/흑백/원래그림에서) + 밝기(-100~100%) + 대비(-100~100%) + 워터마크 체크 + 그림반전(disabled)
- 투명도 설정: disabled (모델 미지원)

### 추가 탭 (스크린샷 기준 stub)
- 반사 탭: ☑반사없음 + 3×5 프리셋(disabled) + 크기/거리 슬라이더
- 네온 탭: ☑네온없음 + 3×6 프리셋(disabled) + 색/투명도/크기 슬라이더
- 열은 테두리 탭: ☐열은 테두리 없음 + 6프리셋(disabled) + 크기 슬라이더

### 탭 구성 변경
- 이전: `['기본', '여백/캡션', '선', '그림(stub)', '그림자']`
- 변경: `['기본', '여백/캡션', '선', '그림', '그림자', '반사', '네온', '열은 테두리']`

### 수정 파일
- `rhwp-studio/src/ui/picture-props-dialog.ts`
- `rhwp-studio/src/styles/picture-props.css`

## 3단계: 기본/여백/선 탭 바인딩

### 기본 탭 — 이미지에서 회전/대칭 활성화
- `rotationInput`: disabled → 활성화 (raw÷100→도 변환)
- `horzFlipCheck`, `vertFlipCheck`: disabled → 활성화

### 여백/캡션 탭 — 바깥 여백 바인딩
- `outerMarginLeft/Right/Top/Bottom` → UI에 mm 변환 표시

### 선 탭 — 이미지 테두리 바인딩
- `borderColor` → lineColorInput, `borderWidth` → lineWidthInput

### populateFromProps() 확장
- 그림 탭: 확대/축소 비율, 자르기, 안쪽 여백, 효과/밝기/대비/워터마크 바인딩

## 4단계: handleOk 확장 + 빌드

### handleOk() 이미지 전용 속성 수집
- 회전/대칭 (도×100→raw 변환)
- 바깥 여백 4방향
- 테두리 색/굵기
- 확대/축소 → width/height HWPUNIT 역산
- 자르기/안쪽여백 4방향 mm→HWPUNIT
- 효과/밝기/대비

### PictureProperties 타입 확장
- 19개 필드 추가 (총 32개)

### group 타입 필터링
- `insert:picture-props` 커맨드에서 group 타입 제외

### 빌드 결과
- `cargo build`: 성공
- `cargo test`: 성공
- `npx tsc --noEmit`: 성공
- Docker WASM: 성공

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `src/document_core/commands/object_ops.rs` | get/set API 확장 |
| `rhwp-studio/src/ui/picture-props-dialog.ts` | 그림 탭, 반사/네온/열은테두리 탭, 바인딩 확장 |
| `rhwp-studio/src/core/types.ts` | PictureProperties 인터페이스 확장 |
| `rhwp-studio/src/styles/picture-props.css` | 그림 탭 CSS 추가 |
| `rhwp-studio/src/command/commands/insert.ts` | group 타입 필터링 |
