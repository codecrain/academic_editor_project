# 타스크 194 최종 결과 보고서 — 머리말/꼬리말 관리 기능

## 구현 완료 항목

### 1단계: 삭제 기능 + 도구상자 고도화

| 항목 | 상태 |
|------|------|
| `delete_header_footer_native` (Rust) | 완료 |
| `deleteHeaderFooter` WASM 바인딩 | 완료 |
| `wasm-bridge.ts` deleteHeaderFooter 메서드 | 완료 |
| `page:headerfooter-delete` 커맨드 | 완료 |
| 도구상자 확장: [라벨] [이전] [다음] [닫기] [지우기] | 완료 |

### 2단계: 이전/다음 이동 (페이지 기반)

| 항목 | 상태 |
|------|------|
| `navigate_header_footer_by_page_native` (Rust) | 완료 |
| `navigateHeaderFooterByPage` WASM 바인딩 | 완료 |
| `wasm-bridge.ts` navigateHeaderFooterByPage 메서드 | 완료 |
| `page:headerfooter-prev`, `page:headerfooter-next` 커맨드 | 완료 |
| 페이지 기반 탐색 (양쪽/홀수/짝수 구분 포함) | 완료 |

### 3단계: 감추기 기능

| 항목 | 상태 |
|------|------|
| `DocumentCore.hidden_header_footer: HashSet<(u32, bool)>` | 완료 |
| `toggle_hide_header_footer_native` (Rust) | 완료 |
| `is_header_footer_hidden` (Rust) | 완료 |
| `LayoutEngine.hidden_header_footer` RefCell 필드 | 완료 |
| `build_header`/`build_footer`에서 감추기 체크 | 완료 |
| `toggleHideHeaderFooter` WASM 바인딩 | 완료 |
| `wasm-bridge.ts` toggleHideHeaderFooter 메서드 | 완료 |
| `page:hide-headerfooter` 커맨드 | 완료 |

### UX 버그 수정 및 개선

| 항목 | 상태 |
|------|------|
| 더블클릭 시 해당 페이지에서 편집 모드 진입 (`preferred_page` 파라미터) | 완료 |
| Esc/닫기 시 현재 페이지 유지 (첫 페이지 강제 이동 방지, `updateCaretNoScroll`) | 완료 |
| Esc/닫기 시 해당 페이지 첫 번째 문단에 캐럿 배치 | 완료 |
| 이전/다음 이동이 머리말 없는 페이지로 이동하는 버그 수정 | 완료 |
| 메뉴바 > 쪽 > 머리말 진입 시 현재 페이지 기준 검색 | 완료 |
| 머리말/꼬리말 마커 paragraphIndex(0xFFFFFFFF) 가드 처리 | 완료 |
| `switchHeaderFooterTarget` 메서드 — 편집 모드 전환 시 깜빡임 방지 | 완료 |
| 서식 도구 모음(`#style-bar`) 편집 중 유지 — 글자/문단 모양 설정 지원 | 완료 |
| 구역 상속 머리말 `source_section_index` 버그 수정 | 완료 |
| 머리말/꼬리말 내부 텍스트 hitTest (`hit_test_in_header_footer_native`) | 완료 |
| 우클릭 컨텍스트 메뉴에 글자 모양/문단 모양 추가 | 완료 |

## 구역 상속 머리말 버그 수정 (핵심)

HWP에서 머리말/꼬리말은 이전 구역에서 상속될 수 있다. 예: 구역 0에서 정의된 머리말이 구역 1의 페이지에서 렌더링.

- **수정 전**: `hitTestHeaderFooter`가 `find_section_for_page()`로 페이지 소속 구역 반환 → 잘못된 구역에 빈 머리말 생성 → 기존 내용 리셋
- **수정 후**: `get_active_hf_info()`로 active_header의 `source_section_index` 반환 → 올바른 구역의 기존 머리말에 접근
- 검증: samples/p222.hwp (122페이지, 5개 구역, 홀수/짝수 머리말) 정상 동작 확인

## 수정된 파일 목록

### Rust
- `src/document_core/commands/header_footer_ops.rs` — 삭제/목록/감추기/페이지 기반 탐색 native 함수
- `src/document_core/mod.rs` — `hidden_header_footer` 필드 추가
- `src/document_core/commands/document.rs` — 초기화에 `hidden_header_footer` 추가
- `src/document_core/queries/rendering.rs` — 렌더링 시 감추기 세트 전달
- `src/document_core/queries/cursor_rect.rs` — `preferred_page`, `hit_test_in_header_footer_native`, `get_active_hf_info` 추가
- `src/renderer/layout.rs` — LayoutEngine에 감추기 필드, build_header/build_footer 체크
- `src/wasm_api.rs` — deleteHeaderFooter, toggleHideHeaderFooter, navigateHeaderFooterByPage, hitTestInHeaderFooter, getCursorRectInHeaderFooter(preferred_page) 바인딩

### TypeScript
- `rhwp-studio/src/core/wasm-bridge.ts` — 5개 메서드 추가/수정
- `rhwp-studio/src/command/commands/page.ts` — 커맨드 (delete, prev, next, hide, close, 메뉴 진입 개선)
- `rhwp-studio/src/engine/cursor.ts` — `switchHeaderFooterTarget`, `_hfPreferredPage`, exitHeaderFooterMode 개선
- `rhwp-studio/src/engine/input-handler.ts` — `updateCaretNoScroll`, 컨텍스트 메뉴에 글자/문단 모양 추가
- `rhwp-studio/src/engine/input-handler-mouse.ts` — 더블클릭 좌표 수정, 마커 가드, 내부 hitTest, 컨텍스트 메뉴 HF 모드 처리
- `rhwp-studio/src/engine/input-handler-text.ts` — 머리말/꼬리말 텍스트 삽입 에러 핸들링
- `rhwp-studio/src/engine/input-handler-keyboard.ts` — Esc 시 현재 페이지 유지 + 첫 문단 캐럿
- `rhwp-studio/src/main.ts` — 서식 도구 모음 편집 중 유지
- `rhwp-studio/index.html` — 도구상자 UI 확장
- `rhwp-studio/src/styles/toolbar.css` — `.tb-hf-label` 스타일
- `pkg/rhwp.d.ts` — WASM 타입 선언 추가

## 검증 결과

| 항목 | 결과 |
|------|------|
| Rust 테스트 (667개) | 모두 통과 |
| TypeScript 컴파일 | 에러 없음 |
| WASM 빌드 | 성공 |
| samples/p222.hwp 머리말 편집 | 정상 동작 (구역 상속, 홀수/짝수 포함) |

## 도구상자 최종 레이아웃

```
[머리말(양쪽)] | [◀ 이전] [다음 ▶] | [✕ 닫기] [🗑 지우기]
```

편집 중 서식 도구 모음(`#style-bar`)도 함께 표시되어 글자모양/문단모양 설정 가능.
우클릭 컨텍스트 메뉴에서도 글자 모양/문단 모양 대화상자 접근 가능.

## 감추기 기능 동작 방식

- `DocumentCore`에 `HashSet<(u32, bool)>` 저장 (page_index, is_header)
- `toggleHideHeaderFooter`로 토글 (같은 키가 있으면 제거, 없으면 추가)
- 렌더링 시 `LayoutEngine`에 전달 → `build_header`/`build_footer`에서 체크
- 감추기된 페이지는 영역(빈 노드)은 유지하되 내용만 렌더링하지 않음

## 페이지 기반 이전/다음 탐색

- `navigate_header_footer_by_page_native(current_page, is_header, direction)`
- 현재 페이지에서 direction 방향으로 순회하며 `active_header`/`active_footer`가 있는 페이지 탐색
- `source_section_index` 기반으로 올바른 구역의 컨트롤에서 `apply_to` 추출
- 양쪽/홀수/짝수 머리말 구분 처리
- 더 이상 이동할 페이지가 없으면 현재 위치 유지
