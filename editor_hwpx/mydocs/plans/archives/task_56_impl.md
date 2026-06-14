# 타스크 56: 메뉴 시스템 아키텍처 설계 — 구현계획서

## 핵심 설계

### 커맨드 ID 네임스페이스

`카테고리:액션` 형식. 카테고리: `file`, `edit`, `view`, `format`, `insert`, `table`, `page`. 고객 확장: `ext:`.

### 아키텍처 흐름

```
[메뉴 클릭]  ─┐
[툴바 클릭]  ─┤─→ CommandDispatcher.dispatch(cmdId) ─→ CommandDef.execute(services)
[키보드 단축키]─┘                                          ↓
                                                    eventBus.emit('command-state-changed')
                                                          ↓
                                              MenuBar.updateMenuStates()
```

### 주요 인터페이스

- **EditorContext**: hasDocument, hasSelection, inTable, isEditable, canUndo, canRedo, zoom
- **CommandDef**: id, label, shortcutLabel?, icon?, canExecute?(ctx), execute(services, params?)
- **CommandServices**: eventBus, wasm, getContext(), getInputHandler(), getViewportManager()

---

## 1단계: 커맨드 인프라 구축

### 신규 파일

| 파일 | 내용 |
|------|------|
| `src/command/types.ts` | EditorContext, CommandDef, CommandServices 인터페이스 |
| `src/command/registry.ts` | CommandRegistry (Map 래퍼: register/get/getByCategory/unregister) |
| `src/command/dispatcher.ts` | CommandDispatcher (dispatch/isEnabled + command-state-changed) |
| `src/command/shortcut-map.ts` | ShortcutDef, defaultShortcuts 매핑, matchShortcut() |

### 기존 파일 수정

| 파일 | 변경 |
|------|------|
| `src/engine/input-handler.ts` | public 메서드 추가: hasSelection(), isInTable(), canUndo(), canRedo() |
| `src/main.ts` | CommandRegistry/Dispatcher 생성, getContext(), CommandServices 조립 |

### 완료 기준
- 빌드 성공
- 기존 동작 무변경

---

## 2단계: 메뉴바 커맨드 통합 + 컨텍스트 감응

### 신규 파일

| 파일 | 내용 |
|------|------|
| `src/command/commands/file.ts` | file:new-doc, file:open, file:save 등 |
| `src/command/commands/edit.ts` | edit:undo, edit:redo, edit:cut, edit:copy, edit:paste 등 |
| `src/command/commands/view.ts` | view:zoom-* |
| `src/command/commands/format.ts` | format:bold/italic/underline, format:align-* |
| `src/command/commands/insert.ts` | insert:* (스텁) |
| `src/command/commands/table.ts` | table:* (스텁) |
| `src/command/commands/page.ts` | page:* (스텁) |

### 기존 파일 수정

| 파일 | 변경 |
|------|------|
| `index.html` | ~65개 data-cmd 값을 네임스페이스 ID로 변경 |
| `src/ui/menu-bar.ts` | dispatcher 통합, updateMenuStates() 추가 |
| `src/engine/input-handler.ts` | public 메서드: performUndo(), performRedo(), performSelectAll(), toggleFormat(), applyParaAlign() |
| `src/main.ts` | 커맨드 등록, 기존 menu-command 리스너 제거 |

### 완료 기준
- 메뉴 클릭이 커맨드 시스템 경유
- 문서 미로드 시 편집 메뉴 비활성
- 선택 없을 때 오려두기/복사 비활성
- 메뉴에서 되돌리기/다시실행/줌 동작

---

## 3단계: 키보드·툴바 통합 + 확장 API

### 기존 파일 수정

| 파일 | 변경 |
|------|------|
| `src/engine/input-handler.ts` | handleCtrlKey() → matchShortcut() + dispatcher.dispatch() |
| `src/ui/toolbar.ts` | format-toggle/char/para emit → dispatcher.dispatch() 호출 |
| `src/main.ts` | dispatcher 전달, 구 이벤트 리스너 제거 |

### 신규 파일

| 파일 | 내용 |
|------|------|
| `src/command/extension-api.ts` | StudioExtensionAPI (registerCommand, addMenuItem, addMenu) |

### 완료 기준
- 키보드 Ctrl+Z/B/I/U 등이 커맨드 시스템 경유
- 툴바 B/I/U 버튼이 커맨드 시스템 경유
- 확장 API로 커스텀 커맨드 등록 가능
- 빌드 성공, 기존 모든 기능 유지
