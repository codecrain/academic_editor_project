# 타스크 82 구현계획서: 컨텍스트 메뉴 인프라 + 표 우클릭 메뉴

## 단계 1: ContextMenu 클래스 구현

**파일**: `rhwp-studio/src/ui/context-menu.ts` (신규)

### 구현 내용

```typescript
// 메뉴 항목 정의
interface ContextMenuItem {
  type: 'command' | 'separator';
  commandId?: string;   // CommandDef.id
  label?: string;       // 오버라이드 레이블 (없으면 CommandDef.label 사용)
}

class ContextMenu {
  constructor(dispatcher: CommandDispatcher, registry: CommandRegistry)

  // clientX/Y에 메뉴 표시
  show(x: number, y: number, items: ContextMenuItem[]): void

  // 메뉴 닫기
  hide(): void

  // 리소스 해제
  dispose(): void
}
```

### DOM 구조
```html
<div class="context-menu">
  <div class="md-item" data-cmd="edit:cut">잘라내기 <span class="md-shortcut">Ctrl+X</span></div>
  <div class="md-sep"></div>
  <div class="md-item disabled" data-cmd="table:cell-merge">셀 합치기</div>
</div>
```

### 동작
- show(): DOM 생성 → document.body에 추가 → 위치 지정
- 화면 밖으로 나가지 않도록 viewport 경계 보정
- ESC 키 → hide()
- 외부 클릭 → hide()
- 항목 클릭 → dispatcher.dispatch(cmdId) + hide()
- disabled 항목은 클릭 무시

---

## 단계 2: InputHandler에 contextmenu 이벤트 연결

**파일**: `rhwp-studio/src/engine/input-handler.ts` (수정)

### 구현 내용

1. 생성자에서 `contextmenu` 이벤트 리스너 등록
2. `onContextMenu(e: MouseEvent)` 핸들러:
   - `e.preventDefault()` — 브라우저 기본 메뉴 억제
   - 클릭 좌표로 hitTest 수행 (기존 onClick 로직 참고)
   - hitTest 결과에 parentParaIndex 존재 → 표 셀 내부
   - 표 셀 내부: 표 전용 메뉴 항목 목록
   - 표 밖: 일반 편집 메뉴 항목 목록
   - ContextMenu.show(e.clientX, e.clientY, items) 호출

3. ContextMenu 인스턴스를 InputHandler가 보유 (또는 main.ts에서 생성하여 주입)

### 표 셀 내 메뉴 항목
```
잘라내기       Ctrl+X
복사           Ctrl+C
붙여넣기       Ctrl+V
────────────────────
셀 속성...
────────────────────
위쪽에 줄 추가하기
아래쪽에 줄 추가하기
왼쪽에 칸 추가하기
오른쪽에 칸 추가하기
────────────────────
줄 지우기
칸 지우기
────────────────────
셀 합치기       M
셀 나누기       S
```

### 일반 메뉴 항목
```
잘라내기       Ctrl+X
복사           Ctrl+C
붙여넣기       Ctrl+V
```

---

## 단계 3: table 커맨드 canExecute 활성화 + CSS 스타일 + 통합

**파일**:
- `rhwp-studio/src/command/commands/table.ts` (수정)
- `rhwp-studio/src/style.css` (수정)
- `rhwp-studio/src/main.ts` (수정)

### table.ts 변경
- 기존 stub() 함수의 `canExecute: () => false`를 컨텍스트 기반으로 변경
- 표 셀 내부(`ctx.inTable === true`)일 때 활성화
- execute는 아직 미구현이므로 콘솔 로그만 출력

### style.css 추가
```css
/* 컨텍스트 메뉴 */
.context-menu {
  position: fixed;
  min-width: 200px;
  background: #fff;
  border: 1px solid #c8c8c8;
  box-shadow: 2px 2px 8px rgba(0,0,0,0.15);
  z-index: 20000;
  padding: 4px 0;
  font-size: 12px;
}
```

### main.ts 변경
- ContextMenu 인스턴스 생성
- InputHandler에 ContextMenu 접근 방법 제공 (생성자 파라미터 또는 setter)

---

## 완료 기준

- [ ] 표 셀 내 우클릭 → 표 편집 컨텍스트 메뉴 표시
- [ ] 표 밖 우클릭 → 일반 편집 컨텍스트 메뉴 표시
- [ ] 브라우저 기본 메뉴 억제
- [ ] ESC / 외부 클릭으로 메뉴 닫기
- [ ] 비활성 항목(canExecute=false) 회색 표시, 클릭 무시
- [ ] 기존 Rust 테스트 전체 통과
- [ ] WASM 빌드 성공
- [ ] Vite 개발 서버에서 웹 검증 완료
