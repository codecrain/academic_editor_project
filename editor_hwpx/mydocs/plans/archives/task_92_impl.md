# 타스크 92 — 구현 계획서

## 단계 구성 (3단계)

### 1단계: 최상위 도형 내부 좌표 스케일링

**대상**: `src/renderer/layout.rs` — `layout_shape_object()` 함수

**수정 내용**:
- Line 렌더링: `start/end` 좌표에 `common.width/original_width`, `common.height/original_height` 스케일 적용
- Polygon 렌더링: `points[]` 좌표에 동일한 스케일 적용
- Curve 렌더링: `curve_to_path_commands()`에 스케일 파라미터 전달

**스케일 계산**:
```rust
let (sx, sy) = compute_shape_internal_scale(common, &drawing.shape_attr);
```

**검증**:
- KTX.hwp SVG 내보내기 → 첫번째 선 127mm, 두번째 선 150mm 확인
- 기존 테스트 통과

### 2단계: 묶음(Group) 자식 도형 내부 좌표 스케일링

**대상**: `src/renderer/layout.rs` — `layout_shape_object()` Group 분기

**수정 내용**:
- Group 자식의 `layout_shape_object()` 호출 시 내부 좌표 스케일도 전파
- 자식의 effective size = `current_width × render_sx` (이미 적용됨)
- 자식의 내부 좌표 스케일 = `effective_size / original_size`

**검증**:
- KTX.hwp 묶음 개체 (노선도, 범례) 렌더링 확인
- 기존 테스트 통과

### 3단계: 빌드 검증 + SVG 비교

**수행 내용**:
- `docker compose run --rm test` — Rust 테스트 전체 통과
- `docker compose run --rm wasm && npm run build` — WASM/Vite 빌드
- KTX.hwp SVG 내보내기 → 도형 위치/크기 시각 검증
- treatise sample.hwp SVG 내보내기 → 기존 렌더링 유지 확인

## 수정 파일

| 파일 | 수정 내용 |
|------|----------|
| `src/renderer/layout.rs` | Line/Polygon/Curve 내부 좌표 스케일링, Group 자식 스케일 전파 |
