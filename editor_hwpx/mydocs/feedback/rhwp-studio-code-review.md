# rhwp-studio 프론트엔드 코드 리뷰

> **대상**: `rhwp-studio/` (Vite + TypeScript, 17,524줄 / 70 파일)  
> **목적**: 아키텍처 건전성·코드 품질 평가 + 개선 권고  
> **작성일**: 2026-02-23  

---

## 1. 전체 요약

| 항목 | 수치 |
|---|---|
| 총 코드량 | **17,524줄** (TS 16,200줄 + CSS 1,324줄) |
| 런타임 의존성 | **0** (Vite + TS만 devDependencies) |
| 계층 수 | 6 (core / engine / view / ui / command / styles) |
| 최대 파일 | `input-handler.ts` 1,148줄 |
| TypeScript strict | ✅ 활성화 |

### 총평: ⭐⭐⭐⭐ (4/5)

**문서 편집기로서 탄탄한 아키텍처를 갖추고 있습니다.** 런타임 의존성 0으로의 순수 설계, Command 패턴 기반 Undo/Redo, 확장 API까지 — POC 수준을 넘어 제품급 설계 수준입니다. 다만 일부 거대 파일과 EventBus 남용 등 SOLID 관점에서 개선 여지가 있습니다.

---

## 2. 아키텍처 평가

### 2.1 계층 구조 — ✅ 우수

```
main.ts (진입점 + 의존성 조립)
  ├── core/          WASM 연동·타입·상수
  │     ├── wasm-bridge.ts         585줄  WASM ↔ TS 인터페이스 계층
  │     ├── types.ts               345줄  모든 타입 정의
  │     ├── event-bus.ts            24줄  Pub/Sub 통신 허브
  │     ├── font-loader.ts              폰트 로딩
  │     ├── font-substitution.ts        폰트 치환 규칙
  │     ├── hwp-constants.ts       315줄  HWP 상수
  │     ├── numbering-defaults.ts  274줄  번호매기기 기본값
  │     └── paper-defaults.ts           용지 크기 기본값
  │
  ├── engine/        입력·편집·커서·Undo/Redo
  │     ├── input-handler.ts      1148줄  ⚠️ 코디네이터 + 위임
  │     ├── cursor.ts              888줄  ⚠️ 커서 상태 머신
  │     ├── command.ts             654줄  EditCommand 구현체
  │     ├── history.ts              87줄  Undo/Redo 스택
  │     ├── input-handler-mouse.ts      마우스 이벤트 위임
  │     ├── input-handler-keyboard.ts   키보드 이벤트 위임
  │     ├── input-handler-table.ts      표 입력 위임
  │     ├── input-handler-text.ts       텍스트 입력 위임
  │     ├── input-handler-picture.ts    그림 입력 위임
  │     ├── caret-renderer.ts           캐럿 렌더링
  │     ├── selection-renderer.ts       선택 영역 렌더링
  │     ├── cell-selection-renderer.ts  셀 선택 렌더링
  │     └── table-resize-renderer.ts    표 크기 조절 렌더링
  │
  ├── view/          Canvas 기반 렌더링
  │     ├── canvas-view.ts         227줄  문서 뷰 컴포지션
  │     ├── virtual-scroll.ts      101줄  가상 스크롤링
  │     ├── canvas-pool.ts              Canvas 재사용 풀
  │     ├── page-renderer.ts            페이지 렌더링
  │     ├── viewport-manager.ts         뷰포트 관리
  │     └── coordinate-system.ts        좌표 변환
  │
  ├── command/       커맨드 시스템 (메뉴·툴바·단축키 통합)
  │     ├── dispatcher.ts           51줄  단일 실행 경로
  │     ├── registry.ts             47줄  커맨드 등록소
  │     ├── types.ts                60줄  CommandDef, EditorContext
  │     ├── shortcut-map.ts         66줄  단축키 매핑
  │     ├── extension-api.ts        74줄  고객사 확장 API
  │     └── commands/               7개 커맨드 모듈
  │           ├── file.ts  edit.ts  view.ts  format.ts
  │           ├── insert.ts  table.ts  page.ts
  │
  ├── ui/            대화상자·메뉴·도구 모음
  │     ├── char-shape-dialog.ts  1040줄  ⚠️ 글자 서식 대화상자
  │     ├── table-cell-props-dialog.ts 935줄
  │     ├── para-shape-dialog.ts   877줄
  │     ├── toolbar.ts  menu-bar.ts  context-menu.ts ...
  │
  └── styles/        CSS
        ├── dialogs.css  editor.css  toolbar.css ...
```

**긍정적 평가:**
- **core → engine → view** 단방향 의존 흐름이 명확
- `command/`가 UIReview에서 독립적으로 존재 — 향후 MCP 서버의 Tool과 동일 커맨드 공유 가능
- `view/`의 VirtualScroll + CanvasPool = 대용량 문서에 필수적인 성능 패턴

### 2.2 핵심 설계 패턴 — ✅✅ 매우 우수

#### ① Command 패턴 (Undo/Redo)
```
EditCommand (인터페이스)
  ├── execute(wasm) → DocumentPosition
  ├── undo(wasm) → DocumentPosition
  └── mergeWith(other) → EditCommand | null   ← 연속 타이핑 병합
```
- `InsertTextCommand`, `DeleteTextCommand`, `SplitParagraphCommand` 등 단단한 추상화
- `mergeWith()`로 연속 타이핑을 단일 Undo 단위로 병합 — 사용자 경험 훌륭
- `CommandHistory`(87줄)가 깔끔하게 관리. `maxSize=1000`도 적절

#### ② 이중 커맨드 시스템
```
CommandDef (UI 커맨드: 메뉴, 툴바, 단축키)
  ├── id: "카테고리:액션"  (예: "edit:copy", "format:bold")
  ├── canExecute(ctx: EditorContext)
  └── execute(services: CommandServices)

EditCommand (편집 명령: Undo/Redo 지원)
  ├── execute(wasm)
  └── undo(wasm)
```
CommandDef가 high-level 제어(UI 바인딩, 활성화 조건), EditCommand가 low-level 편집(WASM 직접 호출, 복원 가능)을 담당하는 **2-tier 구조**는 잘 설계됨.

#### ③ 가상 스크롤링
```
VirtualScroll  →  CanvasPool  →  PageRenderer
    (오프셋 계산)    (Canvas 재사용)   (WASM 렌더링)
```
100페이지 문서에서 **보이는 페이지 ±1만 렌더링** — Canvas 풀링으로 메모리 절약.

#### ④ 고객사 확장 API
```typescript
StudioExtensionAPI
  ├── registerCommand(def)      // ext: 접두사 강제
  ├── removeCommand(id)
  ├── executeCommand(id, params)
  ├── addMenuItem(menu, cmd)    // 동적 메뉴 추가
  └── removeMenuItem(cmd)
```
Phase 1의 **웹기안기 대체** 목표에 부합하는 확장 포인트. `ext:` 접두사 네임스페이스 분리가 좋음.

---

## 3. 문제점 및 개선 권고

### 3.1 ⚠️ P1: `input-handler.ts` (1,148줄) — God Object 경향

**현상**: 마우스, 키보드, 표, 그림, 텍스트 입력을 모두 코디네이터로 중재. 이미 5개 위임 모듈(`_mouse`, `_keyboard`, `_table`, `_text`, `_picture`)로 분리 시도했으나, **`InputHandler` 클래스 자체가 107개 메서드**를 보유.

**실질 문제**:
- 새 입력 모드 추가 시 `InputHandler` 수정 필수 → OCP 위반
- 메서드 간 상태 공유가 암묵적 (클래스 필드 의존)
- 테스트 시 모든 의존성을 주입해야 함

**권고**:
```
현재:  InputHandler { onClick, onKeyDown, ... }  (1148줄)

변경안: InputRouter (200줄 이내)
         ├── MouseHandler    (현재 _mouse 위임 모듈을 클래스화)
         ├── KeyboardHandler
         ├── TableInputHandler
         ├── TextInputHandler
         └── PictureInputHandler
```
각 Handler가 독자적 **상태와 생명주기**를 가지도록 분리. `InputRouter`는 이벤트 라우팅만 담당.

**예상 효과**: `InputHandler` 1,148줄 → `InputRouter` ~200줄 + 5개 핸들러 (기존 모듈 규모 유지)

---

### 3.2 ⚠️ P1: `cursor.ts` (888줄) — 네비게이션 로직 밀집

**현상**: `CursorState` 클래스가 **커서 위치 관리 + 방향 이동 + 셀 경계 탐색 + 텍스트박스 진입/탈출 + 선택 영역** 을 모두 처리.

**특히 복잡한 부분**:
- `moveHorizontalInCell()` — 59줄, 셀 간 이동 로직
- `moveVertical()` — 53줄, WASM 호출 + 결과 매핑
- `moveHorizontalInTextBox()` — 34줄, 글상자 경계 처리
- 중첩 표 경로(`cellPath`) 관련 헬퍼들

**권고**:
```
현재:  CursorState { position + navigation + selection }  (888줄)

변경안: CursorState (위치 + 선택 상태, ~200줄)
         ├── NavigationStrategy
         │     ├── BodyNavigation      본문 이동
         │     ├── CellNavigation      셀 내부/간 이동
         │     └── TextBoxNavigation   글상자 이동
```

---

### 3.3 ⚠️ P2: `EventBus`의 타입 안전성 부족

**현상**: `EventBus`가 `string` 키와 `unknown[]` 인자로 동작 — 이벤트명 오타나 잘못된 인자 타입을 컴파일 타임에 잡을 수 없음.

```typescript
// 현재 — 런타임에만 오류 발견
eventBus.emit('cursor-format-changed', props);        // ✅
eventBus.emit('cursor-fromat-changed', props);        // ❌ 오타인데 에러 없음
eventBus.on('cursor-format-changed', (props) => { ... }); // props: unknown
```

**권고**: 타입맵 기반 TypedEventBus

```typescript
interface EventMap {
  'cursor-format-changed': [CharProperties];
  'document-changed': [];
  'zoom-changed': [number];
  'current-page-changed': [number, number];
  'command-state-changed': [];
  // ...
}

class TypedEventBus {
  on<K extends keyof EventMap>(event: K, handler: (...args: EventMap[K]) => void): () => void;
  emit<K extends keyof EventMap>(event: K, ...args: EventMap[K]): void;
}
```

**효과**: 이벤트명 자동 완성 + 인자 타입 검증 + 리팩토링 안전성. **EventBus 사용이 프로젝트 전체에 걸쳐 있으므로 기대 효과가 큼.**

---

### 3.4 ⚠️ P2: UI 대화상자 코드 반복 (1,040줄, 935줄, 877줄)

**현상**: `char-shape-dialog.ts`(1,040줄), `table-cell-props-dialog.ts`(935줄), `para-shape-dialog.ts`(877줄) 세 파일이 각각 DOM 생성, 이벤트 바인딩, 값 검증을 반복.

**권고**: 선언적 Dialog Builder 패턴

```typescript
// Before — 명령적 DOM 생성 (반복적)
const label = document.createElement('label');
label.textContent = '글꼴 크기';
const input = document.createElement('input');
input.type = 'number';
input.min = '1';
container.append(label, input);

// After — 선언적 구성
DialogBuilder.create('char-shape', '글자 모양')
  .tab('기본', [
    field.select('fontFamily', '글꼴', fontOptions),
    field.number('fontSize', '크기', { min: 1, max: 4096 }),
    field.toggle('bold', '굵게'),
    field.color('textColor', '글자색'),
  ])
  .tab('테두리', [...])
  .onSubmit(applyCharShape)
  .build();
```

**효과**: 각 대화상자 코드량 50~70% 감소 예상. 새 대화상자 추가 시 선언만으로 생성.

---

### 3.5 ⚠️ P2: `WasmBridge` (585줄, 메서드 73개) — Thin Wrapper 반복

**현상**: 대부분의 메서드가 `this.doc!.xxx_native(JSON.stringify(...))` 후 JSON.parse — 단순 위임 1줄 메서드가 다수.

```typescript
insertText(sec, para, charOffset, text) {
  return JSON.parse(this.doc!.insert_text_native(sec, para, charOffset, text));
}
deleteText(sec, para, charOffset, count) {
  return JSON.parse(this.doc!.delete_text_native(sec, para, charOffset, count));
}
// ... 70개 이상 반복
```

**권고**: 제네릭 호출 래퍼 도입

```typescript
private call<T>(method: string, ...args: unknown[]): T {
  const fn = (this.doc as any)[method + '_native'];
  if (!fn) throw new Error(`WASM method not found: ${method}`);
  const raw = fn.call(this.doc, ...args);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// 사용
insertText(sec: number, para: number, offset: number, text: string) {
  return this.call<string>('insert_text', sec, para, offset, text);
}
```

**효과**: 에러 핸들링 일원화, 로깅/성능 계측 삽입 포인트 확보. 코드량 ~40% 감소.

---

### 3.6 ✅ P3: 한글 입력(IME) 단축키 대응 — 잘 처리됨

`shortcut-map.ts`에서 한/영 키보드 상태를 모두 처리:
```typescript
[{ key: 'n', alt: true }, 'file:new-doc'],
[{ key: 'ㅜ', alt: true }, 'file:new-doc'],  // 한글 모드에서도 동작
```
한글 IME 환경을 고려한 **실질적 UX 대응** — 좋은 세심함.

---

### 3.7 ✅ P3: `main.ts` 의존성 조립 — 개선 포인트 있음

**현상**: `main.ts`(290줄)에서 전역 변수로 서비스 인스턴스를 관리:

```typescript
const wasm = new WasmBridge();
const eventBus = new EventBus();
let canvasView: CanvasView | null = null;
let inputHandler: InputHandler | null = null;
```

DI 컨테이너가 아닌 수동 조립이지만, 프로젝트 규모에서는 적절. 다만 `let ... = null` 패턴은 null 체크 부담이 누적됨.

**권고**: 문서 로드 후 생성되는 객체들을 하나의 `EditorSession` 클래스로 묶기

```typescript
class EditorSession {
  readonly canvasView: CanvasView;
  readonly inputHandler: InputHandler;
  // ... 문서 로드 후에만 존재하는 객체들

  static create(wasm, eventBus, container): EditorSession { ... }
  dispose(): void { ... }
}

// main.ts
let session: EditorSession | null = null;  // null 체크 1회로 통합
```

---

## 4. 정량 평가 요약

| 영역 | 점수 | 코멘트 |
|---|---|---|
| **아키텍처** | 9/10 | 6개 계층, 단방향 의존. command/ 독립성 우수 |
| **설계 패턴** | 9/10 | Command, Observer, Pool, Virtual Scroll 적절 활용 |
| **파일 크기** | 6/10 | input-handler(1,148), cursor(888), UI 대화상자(1,040·935·877) |
| **타입 안전성** | 7/10 | TS strict ✅, 단 EventBus 미타입. WasmBridge JSON 교환도 약함 |
| **테스트 커버리지** | 3/10 | 프론트엔드 테스트 파일 미존재 |
| **의존성 관리** | 10/10 | 런타임 의존성 0 — 최고 수준 |
| **확장성** | 8/10 | Extension API 설계, CommandDef가 확장 기반 마련 |
| **총합** | **7.4/10** | 아키텍처 우수, 실행 코드 품질 개선 여지 |

---

## 5. 우선순위별 액션 아이템

| 순위 | 항목 | 예상 공수 | 영향도 |
|---|---|---|---|
| **P0** | TypedEventBus 도입 | 1일 | 전체 컴파일 타임 안전성 |
| **P1** | InputHandler → InputRouter 분리 | 2~3일 | engine/ 유지보수성 |
| **P1** | CursorState 네비게이션 분리 | 2일 | 버그 수정 용이성 |
| **P2** | UI 대화상자 선언적 방식 전환 | 3~5일 | UI 코드 50% 감소 |
| **P2** | WasmBridge 제네릭 래퍼 | 1일 | WASM 호출 일원화 |
| **P3** | EditorSession 도입 | 0.5일 | null 체크 감소 |
| **P3** | 프론트엔드 테스트 도입 | 1~2주 | 품질 보증 |

---

## 6. 결론

rhwp-studio는 **제품급 웹 에디터로서 매우 건실한 아키텍처 기반 위에 구축**되어 있습니다.

**가장 인상적인 부분:**
1. **런타임 의존성 0** — React/Vue/Angular 없이 순수 TS+DOM으로 문서 편집기를 구현. 번들 사이즈·보안·호환성 모두에서 유리
2. **이중 커맨드 시스템** — UI 커맨드(CommandDef)와 편집 명령(EditCommand)의 분리가 정확
3. **고객사 확장 API 선구축** — Phase 1 제품화에 필수적인 기능

**즉시 착수 권고:** TypedEventBus 도입(P0). 1일 투자로 전체 프로젝트의 타입 안전성을 한 단계 올릴 수 있습니다.
