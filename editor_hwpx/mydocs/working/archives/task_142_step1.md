# 타스크 142 — 1단계 완료 보고서

## 목표

`src/wasm_api.rs` (24,585줄) → 도메인별 서브모듈 분리 (각 모듈 ≤1,200줄)

## 수행 결과

### 분리된 모듈 (13개 파일)

| 파일 | 줄 수 | 역할 |
|------|-------|------|
| `wasm_api.rs` | 1,839 | 구조체 정의 + `#[wasm_bindgen]` shim (87개) + HwpViewer + mod 선언 |
| `wasm_api/helpers.rs` | 850 | 공통 헬퍼 함수 46개 |
| `wasm_api/document.rs` | 181 | 문서 생성/로딩/저장/설정 |
| `wasm_api/rendering.rs` | 766 | 렌더링/페이지네이션/페이지 트리 |
| `wasm_api/text_editing.rs` | 955 | 텍스트 삽입/삭제/문단 분리·병합 |
| `wasm_api/table_ops.rs` | 954 | 표/셀 CRUD + 속성 |
| `wasm_api/object_ops.rs` | 900 | 그림 속성/삽입/삭제 + 표 생성 |
| `wasm_api/cursor_nav.rs` | 999 | 커서 이동/줄 정보/선택 영역 |
| `wasm_api/cursor_rect.rs` | 1,021 | 히트테스트/커서 좌표/경로 기반 조작 |
| `wasm_api/formatting.rs` | 607 | 글자모양/문단모양 조회·적용 |
| `wasm_api/clipboard.rs` | 929 | 내부 클립보드 + HTML 내보내기 |
| `wasm_api/html_import.rs` | 807 | HTML 붙여넣기 + 파싱 |
| `wasm_api/html_table_import.rs` | 834 | HTML 표 파싱 + BorderFill + 이미지 |
| `wasm_api/tests.rs` | 13,071 | 테스트 모듈 (2단계에서 분할 예정) |

### 모듈 크기 제한 준수 상태

- **1,200줄 이하**: 11/11 native 메서드 모듈 + helpers ✅
- **wasm_api.rs (1,839줄)**: `#[wasm_bindgen]` shim 블록(~1,630줄)이 구조체 정의와 결합되어 있어 추가 분리 불가. 87개 shim 메서드는 모두 1-3줄 thin wrapper로 실질적 로직 없음
- **tests.rs (13,071줄)**: 테스트 파일이므로 2단계에서 도메인별 분할 예정

### 설계 패턴

- **분산 impl 패턴**: `HwpDocument` 구조체는 `wasm_api.rs`에 한 번만 정의, `impl` 블록은 각 서브모듈에 분산
- **가시성**: native 메서드는 `pub(crate) fn`, 헬퍼 함수는 `pub(super)` / `pub(crate)` 적절히 사용
- **re-export**: `pub(crate) use helpers::*;` 로 테스트 모듈에서 헬퍼 접근 가능

## 검증 결과

| 항목 | 결과 |
|------|------|
| `cargo check` | ✅ 0 errors, 0 warnings |
| `cargo clippy` | ✅ 0 warnings |
| `cargo test` | ✅ 582 passed, 0 failed |

## 비고

- 원본 대비 총 줄 수 증가: 24,585 → 24,713 (+128줄, 모듈 헤더/import 오버헤드)
- `wasm_api.rs.bak` 백업 파일 제거 완료
