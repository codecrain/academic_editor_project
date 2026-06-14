# 타스크 73 — 2단계 완료 보고서

## 작업 내용: 프론트엔드 토글 기능 구현

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `rhwp-studio/src/core/wasm-bridge.ts` | `setShowParagraphMarks(enabled)` 메서드 추가 |
| `rhwp-studio/src/command/commands/view.ts` | `view:para-mark` 커맨드 구현 (IIFE 클로저로 토글 상태 관리, `document-changed` 이벤트, `active` 클래스 토글) |
| `rhwp-studio/index.html` | 메뉴 항목 `disabled` 제거, 툴바 버튼에 `data-cmd="view:para-mark"` 추가 |
| `rhwp-studio/src/main.ts` | `.tb-btn[data-cmd]` 클릭 → 커맨드 디스패치 핸들러 추가 |

### 동작 흐름

1. 사용자가 메뉴/툴바 클릭
2. `view:para-mark` 커맨드 실행 → `showParaMarks` 토글
3. `wasm.setShowParagraphMarks(enabled)` 호출
4. `document-changed` 이벤트 → `CanvasView.refreshPages()` → 페이지 재렌더링
5. 버튼/메뉴에 `active` 클래스 토글 (시각적 피드백)
