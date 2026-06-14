# 타스크 105 - 1단계 완료 보고서: 쪽 테두리/배경 기능 구현

## 구현 내용

### 배경 채우기 + 테두리선 + 렌더러 확장 (1~3단계 통합 구현)

계획서의 1~3단계를 통합하여 한 번에 구현함.

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/layout.rs` | `build_render_tree()`에 `page_border_fill` 파라미터 추가. BorderFill 조회 → 배경색/그라데이션 적용 + 4방향 테두리선 렌더링 |
| `src/renderer/render_tree.rs` | `PageBackgroundNode`에 `gradient` 필드 추가 |
| `src/renderer/svg.rs` | `PageBackground` 렌더링에 그라데이션 지원 추가 |
| `src/renderer/web_canvas.rs` | `PageBackground` 렌더링에 그라데이션 지원 추가 |
| `src/renderer/canvas.rs` | 테스트 코드에 `gradient: None` 추가 |
| `src/wasm_api.rs` | `build_render_tree` 호출부에 `page_border_fill` 전달 (2곳) |

### 구현 상세

1. **배경 채우기**: `page_border_fill.border_fill_id` → `ResolvedBorderStyle` 조회 → `fill_color` / `gradient` 적용
   - `border_fill_id == 0` (미설정)은 기본 흰색 처리
   - 채울 영역 attr bit 3-4: 0=종이 전체, 1=본문 영역
   - 그라데이션이 있으면 단색보다 우선

2. **테두리선**: `borders[4]` (좌/우/상/하) → `create_border_line_nodes()` 재활용
   - 위치 기준 attr bit 0: 0=본문, 1=종이
   - spacing (HWPUNIT16 → px) 적용하여 테두리 오프셋

3. **SVG 렌더러**: 그라데이션 → `create_gradient_def()` → `url(#gradN)` fill
4. **WebCanvas 렌더러**: 그라데이션 → `apply_gradient_fill()` → Canvas gradient

### 검증 결과

- `samples/basic/request.hwp`: border_fill_id=5, 4방향 Solid 테두리선 정상 렌더링 확인
- `samples/basic/Worldcup_FIFA2010_32.hwp`: border_fill_id=2 (빈 BorderFill), 흰색 배경만 렌더링 (정상)
- `samples/k-water-rfp.hwp`: border_fill_id=0 (미설정), 28페이지 모두 정상 렌더링
- 565개 테스트 통과
- WASM 빌드 성공
