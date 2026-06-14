# Task 242 구현 계획서: 도형 기본 삽입 (직선/사각형/타원)

## 단계별 구현 계획

### 1단계: Rust 도형 생성 API 확장

- `src/document_core/commands/object_ops.rs` — `create_shape_control_native()` 수정
  - `shape_type` 파라미터 추가: `"rectangle"`, `"ellipse"`, `"line"`
  - Rectangle: 기존 코드 유지
  - Ellipse: Rectangle 구조 복사 + `ShapeObject::Ellipse` 사용
  - Line: `ShapeObject::Line` + start_x/y, end_x/y 좌표 계산 (좌상→우하 대각선)
  - Line은 TextBox 없이 생성 (내부 텍스트 불필요)
- `src/wasm_api.rs` — `createShapeControl` JSON 파라미터에 `shapeType` 필드 추가
- `cargo test` 통과 확인

### 2단계: TypeScript 도형 선택 드롭다운 UI

- `rhwp-studio/src/ui/shape-picker.ts` 신규
  - 도구상자 "도형" 버튼 클릭 시 드롭다운 패널 표시
  - 3종 아이콘 버튼: 직선(─), 사각형(□), 타원(○)
  - 클릭 시 해당 도형 타입으로 배치 모드 진입
- `rhwp-studio/src/styles/shape-picker.css` 신규
- `rhwp-studio/index.html` — 도형 버튼에 드롭다운 연결

### 3단계: 배치 모드 확장 및 커맨드 연결

- `input-handler.ts` — `enterShapePlacementMode(shapeType)` 추가
  - 기존 `enterTextboxPlacementMode` 패턴 재사용
  - `finishShapePlacement`에서 `createShapeControl({ shapeType, ... })` 호출
  - Line 타입: 오버레이를 직선으로 표시 (dashed line)
- `insert.ts` — `insert:shape` 커맨드 활성화
  - `canExecute: (ctx) => ctx.hasDocument`
  - `execute`: shape-picker 표시
- WASM 재빌드 + 동작 테스트
