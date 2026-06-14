# 타스크 167 수행계획서: 캐럿 고스트 현상 수정

## 문제 설명

화살표 키로 커서를 이동할 때, 새 위치의 커서 좌표를 렌더 트리에서 찾지 못하면 캐럿이 페이지 0의 원점(0, 0)으로 점프하는 현상.

## 원인 분석

### Rust 측
1. `move_vertical_native()` (cursor_nav.rs:224)에서 `get_cursor_rect_values()` 실패 시 `.unwrap_or((0, 0.0, 0.0, 16.0))` → 페이지 0 원점 좌표 반환
2. `get_cursor_rect_values()` (cursor_nav.rs:507-510)에서 JSON 파싱 실패 시 `unwrap_or(0.0)` → 역시 원점
3. Phase 1 preferredX 결정 (cursor_nav.rs:177)에서 실패 시 `0.0` → 이후 수직 이동에 영향

### JavaScript 측
4. `moveVertical()` (cursor.ts:410-414)에서 WASM 반환값의 rect를 그대로 사용 → 폴백 좌표가 캐럿 위치가 됨
5. 수평 이동의 `updateRect()`는 실패 시 `this.rect = null` 처리(캐럿 숨김)가 있으나, 수직 이동에는 없음

## 수정 계획

### 단계 1: Rust — rectValid 플래그 추가 (cursor_nav.rs)
- `move_vertical_native()`에서 `get_cursor_rect_values()` 결과를 `match`로 처리
- 성공: 기존대로 좌표 포함
- 실패: `"rectValid":false` 플래그와 함께 좌표는 0으로 반환
- `move_vertical_by_path_native()`에도 동일 적용

### 단계 2: JavaScript — rectValid 체크 + 폴백 (cursor.ts)
- `moveVertical()`에서 `result.rectValid === false`이면:
  1. position은 갱신 (논리적 위치는 올바르므로)
  2. `this.updateRect()` 호출로 별도 커서 좌표 조회 시도
  3. 그래도 실패하면 `this.rect = null` (캐럿 숨김, 고스트 방지)

### 단계 3: 검증
- `cargo test` 608개 통과 확인
- WASM 빌드 + 웹 테스트

## 수정 파일

| 파일 | 수정 내용 |
|------|-----------|
| `src/document_core/queries/cursor_nav.rs` | `move_vertical_native()`, `move_vertical_by_path_native()` rectValid 플래그 |
| `rhwp-studio/src/engine/cursor.ts` | `moveVertical()` rectValid 체크 + updateRect 폴백 |

## 영향 범위

- 좌표 조회 성공 시: 기존과 동일 동작 (rectValid 필드만 추가)
- 좌표 조회 실패 시: 페이지 원점 점프 → 캐럿 숨김 또는 올바른 위치로 변경
- 수평 이동: 변경 없음 (이미 updateRect() 폴백 있음)
