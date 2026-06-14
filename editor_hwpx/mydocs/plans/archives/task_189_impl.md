# 타스크 189 구현 계획서: 이미지 컨트롤 속성 UI 고도화

## 참고 자료
- 한컴 스크린샷: `mydocs/feedback/imgdialog/` (8개 탭 전체)
- 도움말: `mydocs/manual/hwp/Help/extracted/insert/objectattribute/`, `format/objectattr/`
- Rust 모델: `src/model/image.rs`, `src/model/shape.rs`

## 탭 구성 (한컴 스크린샷 기준)

```
기본 | 여백/캡션 | 선 | 그림 | 그림자 | 반사 | 네온 | 열은 테두리
```

현재: `['기본', '여백/캡션', '선', '그림(stub)', '그림자']`
변경: `['기본', '여백/캡션', '선', '그림', '그림자', '반사', '네온', '열은 테두리']`

---

## 1단계: Rust API 확장 (get/set_picture_properties)

### get_picture_properties_native 추가 반환 필드 (+19개, 총 32개)

**회전/대칭 (ShapeComponentAttr)**

| JSON 키 | Rust 필드 | 타입 | 설명 |
|---------|----------|------|------|
| `rotationAngle` | `shape_attr.rotation_angle` | i16 | 회전각 (raw 값, UI에서 ÷100 → 도) |
| `horzFlip` | `shape_attr.horz_flip` | bool | 좌우 대칭 |
| `vertFlip` | `shape_attr.vert_flip` | bool | 상하 대칭 |
| `originalWidth` | `shape_attr.original_width` | u32 | 원본 너비 (HWPUNIT) |
| `originalHeight` | `shape_attr.original_height` | u32 | 원본 높이 (HWPUNIT) |

**자르기 (CropInfo)**

| JSON 키 | Rust 필드 | 타입 |
|---------|----------|------|
| `cropLeft` | `crop.left` | i32 |
| `cropTop` | `crop.top` | i32 |
| `cropRight` | `crop.right` | i32 |
| `cropBottom` | `crop.bottom` | i32 |

**안쪽 여백 (Picture.padding)**

| JSON 키 | Rust 필드 | 타입 |
|---------|----------|------|
| `paddingLeft` | `padding.left` | i16 |
| `paddingTop` | `padding.top` | i16 |
| `paddingRight` | `padding.right` | i16 |
| `paddingBottom` | `padding.bottom` | i16 |

**바깥 여백 (CommonObjAttr.margin)**

| JSON 키 | Rust 필드 | 타입 |
|---------|----------|------|
| `outerMarginLeft` | `common.margin.left` | i16 |
| `outerMarginTop` | `common.margin.top` | i16 |
| `outerMarginRight` | `common.margin.right` | i16 |
| `outerMarginBottom` | `common.margin.bottom` | i16 |

**테두리 (Picture.border_*)**

| JSON 키 | Rust 필드 | 타입 |
|---------|----------|------|
| `borderColor` | `border_color` | u32 (ColorRef) |
| `borderWidth` | `border_width` | i32 (HWPUNIT) |

### set_picture_properties_native 추가 설정

위 필드 전부 + `effect` (현재 get만 됨, set 미지원)

---

## 2단계: "그림" 탭 UI 구현 (buildPicturePanel)

스크린샷 기준 레이아웃:

### 파일 이름 (읽기 전용)

```
┌─ 파일 이름 ──────────────────────────────────────┐
│ [파일명 표시 (읽기 전용)]                    [▼] │
│     ☑ 문서에 포함 (항상 체크, disabled)           │
└──────────────────────────────────────────────────┘
```

- 파일명: bin_data_id로 참조, 읽기 전용 표시
- "문서에 포함": 항상 체크 상태, disabled

### 확대/축소 비율

```
┌─ 확대/축소 비율 ─────────────────────────────────┐
│ 가로 [26.18] % ↕                                 │
│       [🔍100%] [½] [⅔] [³⁄₂] [×2]              │
│ 세로 [26.35] % ↕                                 │
│ ☐ 가로 세로 같은 비율 유지    [원래 그림으로]     │
└──────────────────────────────────────────────────┘
```

- 가로% = `(common.width / shape_attr.original_width) × 100`
- 세로% = `(common.height / shape_attr.original_height) × 100`
- 아이콘 버튼 6개: 원래크기(100%), ½(50%), ⅔(67%), ³⁄₂(150%), ×2(200%), 돋보기(원래크기)
- "비율 유지" 체크 → 가로 변경 시 세로 자동 동기
- "원래 그림으로": crop 초기화, effect 초기화, 크기 100% 복원

### 그림 자르기

```
┌─ 그림 자르기 ────────────────────────────────────┐
│ 왼쪽  [0.00] mm ↕  위쪽  [0.00] mm ↕  모두 [↕] │
│ 오른쪽 [0.00] mm ↕  아래쪽 [0.00] mm ↕          │
└──────────────────────────────────────────────────┘
```

- crop 4방향 → mm 변환 (HWPUNIT ÷ 283.46)
- "모두" 스피너: 4방향 동기 변경

### 그림 여백

```
┌─ 그림 여백 ──────────────────────────────────────┐
│ 왼쪽  [0.00] mm ↕  위쪽  [0.00] mm ↕  모두 [↕] │
│ 오른쪽 [0.00] mm ↕  아래쪽 [0.00] mm ↕          │
└──────────────────────────────────────────────────┘
```

- padding 4방향 → mm 변환

### 그림 효과

```
┌─ 그림 효과 ──────────────────────────────────────┐
│ [🖼] 효과 없음          밝기 [0    ] % ↕         │
│ [🖼] 회색조             대비 [0    ] % ↕         │
│ [🖼] 흑백               ☐ 워터마크 효과          │
│ [🖼] 원래 그림에서       ☐ 그림 반전              │
└──────────────────────────────────────────────────┘
```

- 라디오 4개 (세로 배치, 아이콘+텍스트): 효과없음/회색조/흑백/원래그림에서
- 밝기: -100 ~ 100 (기본 0)
- 대비: -100 ~ 100 (기본 0)
- 워터마크: 클릭 시 밝기=70, 대비=-50 자동 설정
- 그림 반전: 모델 미지원 → disabled

### 투명도 설정

```
┌─ 투명도 설정 ────────────────────────────────────┐
│ 투명도 [0       ] % ↕                            │
└──────────────────────────────────────────────────┘
```

- 현재 모델에 이미지 투명도 필드 없음 → disabled (향후)

---

## 3단계: 기본 탭 활성화 + 여백/캡션 탭 바인딩 + 선 탭 바인딩

### 기본 탭 — 이미지에서 활성화

| 항목 | 현재 | 변경 | Rust 필드 |
|------|------|------|----------|
| 회전각 | disabled | **활성화** | `shape_attr.rotation_angle` (÷100→도) |
| 좌우 대칭 | disabled | **활성화** | `shape_attr.horz_flip` |
| 상하 대칭 | disabled | **활성화** | `shape_attr.vert_flip` |
| 쪽 영역 제한 | disabled | disabled 유지 | attr 비트 복잡 |
| 서로 겹침 허용 | disabled | disabled 유지 | |
| 같은 쪽 놓기 | disabled | disabled 유지 | |
| 기울이기 | disabled | disabled 유지 | 아핀 행렬 조작 필요 |
| 개체 보호 | disabled | disabled 유지 | |

### 여백/캡션 탭 — 바깥 여백 바인딩

- `populateFromProps()`: `outerMarginLeft/Right/Top/Bottom` → 4개 input에 mm 변환 표시
- `handleOk()`: 4개 input → `outerMarginLeft/Right/Top/Bottom` HWPUNIT 변환 수집

### 선 탭 — 이미지 테두리 바인딩

스크린샷 확인: 이미지에도 선 탭 존재 (테두리)
- `populateFromProps()`: `borderColor` → 색 input, `borderWidth` → 굵기 input
- `handleOk()`: 색/굵기 변경 수집
- 화살표/호 테두리: 이미지에서는 disabled (도형 전용)

---

## 4단계: handleOk/populateFromProps 확장 + 추가 탭 + 빌드

### handleOk() 이미지 속성 수집 (그림 탭)

| 속성 | JSON 키 | 변환 |
|------|---------|------|
| 확대/축소 | `width`, `height` | % → HWPUNIT (originalW × 가로% ÷ 100) |
| 자르기 | `cropLeft/Right/Top/Bottom` | mm → HWPUNIT |
| 그림 여백 | `paddingLeft/Right/Top/Bottom` | mm → HWPUNIT |
| 효과 | `effect` | 라디오 선택값 문자열 |
| 밝기 | `brightness` | 정수 -100~100 |
| 대비 | `contrast` | 정수 -100~100 |

### handleOk() 기본 탭 추가 수집

| 속성 | JSON 키 | 변환 |
|------|---------|------|
| 회전각 | `rotationAngle` | 도 × 100 → raw |
| 좌우 대칭 | `horzFlip` | bool |
| 상하 대칭 | `vertFlip` | bool |

### 추가 탭 (stub)

스크린샷 기준 레이아웃으로 stub 구현:

**그림자 탭** — 기존 구현 유지 (프리셋 비활성, 속성 비활성)

**반사 탭** (buildReflectionPanel)
```
┌─ 반사 효과 ──────────────────────────────────────┐
│ ☑ 반사 없음                                      │
│ ┌──────────────────────────────┐                 │
│ │  3×5 프리셋 그리드 (disabled) │                 │
│ └──────────────────────────────┘                 │
│ 크기  ──○───────── [    ] ↕                      │
│ 거리  ──○───────── [    ] pt ↕                   │
└──────────────────────────────────────────────────┘
```

**네온 탭** (buildGlowPanel)
```
┌─ 네온 효과 ──────────────────────────────────────┐
│ ☑ 네온 없음                                      │
│ ┌──────────────────────────────┐                 │
│ │  3×6 프리셋 그리드 (disabled) │                 │
│ └──────────────────────────────┘                 │
│ 색    [     ▼]                                   │
│ 투명도 ──○───────── [    ] ↕                     │
│ 크기  ──○───────── [    ] pt ↕                   │
└──────────────────────────────────────────────────┘
```

**열은 테두리 탭** (buildSoftEdgePanel)
```
┌─ 열은 테두리 효과 ───────────────────────────────┐
│ ☐ 열은 테두리 없음                                │
│ [🖼1] [🖼2] [🖼3] [🖼4] [🖼5] [🖼6]  (disabled) │
│ 크기  ──○───────── [3.0 ] pt ↕                   │
└──────────────────────────────────────────────────┘
```

### PictureProperties 타입 확장 (types.ts)

```typescript
export interface PictureProperties {
  // 기존 13개
  width: number; height: number; treatAsChar: boolean;
  vertRelTo: string; vertAlign: string;
  horzRelTo: string; horzAlign: string;
  vertOffset: number; horzOffset: number;
  textWrap: string; brightness: number; contrast: number;
  effect: string; description: string;
  // 추가 19개
  rotationAngle: number;
  horzFlip: boolean; vertFlip: boolean;
  originalWidth: number; originalHeight: number;
  cropLeft: number; cropTop: number;
  cropRight: number; cropBottom: number;
  paddingLeft: number; paddingTop: number;
  paddingRight: number; paddingBottom: number;
  outerMarginLeft: number; outerMarginTop: number;
  outerMarginRight: number; outerMarginBottom: number;
  borderColor: number; borderWidth: number;
}
```

### 빌드 및 검증

1. `cargo build` + `cargo test`
2. Docker WASM 빌드
3. 이미지 개체 속성 대화상자 열기 → 각 탭 표시 확인
4. 그림 탭: 확대/축소 비율, 자르기, 여백, 효과 값 변경 → 설정 → 렌더링 반영
5. 기본 탭: 회전/대칭 변경 → 설정 → 렌더링 반영
6. 여백/캡션 탭: 바깥 여백 변경 → 설정 → 레이아웃 반영

---

## 주요 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/document_core/commands/object_ops.rs` | get/set_picture_properties 확장 (+19 필드) |
| `rhwp-studio/src/ui/picture-props-dialog.ts` | buildPicturePanel, 반사/네온/열은테두리 stub, handleOk/populateFromProps 확장 |
| `rhwp-studio/src/core/types.ts` | PictureProperties 인터페이스 확장 |
| `rhwp-studio/src/styles/picture-props.css` | 그림 탭 스타일 추가 |

## 단위 변환

| 변환 | 공식 |
|------|------|
| HWPUNIT → mm | hwp / 283.46 |
| mm → HWPUNIT | mm × 283.46 |
| rotation raw → degree | raw / 100 |
| degree → rotation raw | degree × 100 |
