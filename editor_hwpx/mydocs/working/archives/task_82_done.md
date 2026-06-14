# 타스크 82 완료 보고서: 컨텍스트 메뉴 인프라 + 표 우클릭 메뉴

## 완료 요약

우클릭 컨텍스트 메뉴 시스템을 구축하고, 표 셀 내 우클릭 시 표 편집 메뉴를 표시하도록 구현했다.

## 변경 파일

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `rhwp-studio/src/ui/context-menu.ts` | 신규 | ContextMenu 클래스 — 메뉴 표시/닫기, ESC/외부클릭 닫기, CommandDispatcher 연동 |
| `rhwp-studio/src/engine/input-handler.ts` | 수정 | contextmenu 이벤트 핸들러 추가, 표 셀 내부/외부 판별, 메뉴 항목 목록 정의 |
| `rhwp-studio/src/command/commands/table.ts` | 수정 | canExecute를 `ctx.inTable` 조건으로 변경 (표 셀 내부에서만 활성) |
| `rhwp-studio/src/style.css` | 수정 | `.context-menu` 스타일 추가 |
| `rhwp-studio/src/main.ts` | 수정 | ContextMenu 인스턴스 생성 및 InputHandler에 주입 |

## 구현 상세

### 1. ContextMenu 클래스 (`context-menu.ts`)
- `show(x, y, items)`: clientX/Y에 메뉴 DOM 생성, viewport 경계 보정
- `hide()`: DOM 제거, 이벤트 리스너 해제
- ESC 키 / 외부 클릭(mousedown) → 자동 닫기
- 기존 `.md-item`, `.md-sep`, `.md-shortcut` CSS 클래스 재활용
- `CommandDispatcher.isEnabled()`로 비활성 항목 회색 처리

### 2. InputHandler 확장
- `contextmenu` 이벤트 → `e.preventDefault()` (브라우저 기본 메뉴 억제)
- hitTest로 표 셀 내부 판별 (`parentParaIndex !== undefined && !isTextBox`)
- 표 셀 내부: 잘라내기/복사/붙여넣기 + 셀 속성 + 행/열 추가삭제 + 병합/나누기
- 표 밖: 잘라내기/복사/붙여넣기

### 3. table 커맨드 활성화
- 기존 `canExecute: () => false` → `canExecute: (ctx) => ctx.inTable`
- `table:create`만 `ctx.hasDocument` 조건
- execute 본문은 후속 타스크에서 구현 예정

## 검증 결과

- Rust 테스트: 496개 통과
- WASM 빌드: 성공
- Vite 빌드: 성공

## 브랜치

- `main` → `local/table-edit` → `local/task82`
