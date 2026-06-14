# 타스크 52 구현계획서: 서식 변경 (글꼴/크기/굵게/기울임)

## Context

타스크 51에서 Selection + 클립보드가 완성되었다. 이제 한컴 웹기안기와 유사한 서식 도구 모음을 구축하고, 선택 범위에 글자 서식을 적용한다.

**핵심 발견**: WASM 측에 CharShape API가 이미 완전히 구현되어 있다:
- `getCharPropertiesAt(secIdx, paraIdx, charOffset)` → JSON
- `getCellCharPropertiesAt(secIdx, parentParaIdx, controlIdx, cellIdx, cellParaIdx, charOffset)` → JSON
- `applyCharFormat(secIdx, paraIdx, startOffset, endOffset, propsJson)` → 본문 서식 적용
- `applyCharFormatInCell(secIdx, parentParaIdx, controlIdx, cellIdx, cellParaIdx, startOffset, endOffset, propsJson)` → 셀 내 동일
- `findOrCreateFontId(name)` → 글꼴 ID

JSON 포맷: `{"bold":true, "italic":true, "fontSize":2400, "fontId":5, "textColor":"#FF0000"}`

**현재 UI**: 단일 행 `#toolbar` (파일열기 + 줌 + 페이지정보). 서식 도구 없음.

---

## 단계별 구현 계획

### 1단계: 툴바 UI 구축 (HTML + CSS)

**목표**: 한컴 웹기안기 `style_bar`와 유사한 서식 도구 모음을 기존 `#toolbar` 아래에 추가.

**`index.html` 수정** — `#toolbar` 아래 `#style-bar` 추가:
```html
<div id="style-bar">
  <!-- 글꼴 선택 -->
  <select id="font-name" title="글꼴">
    <option value="맑은 고딕">맑은 고딕</option>
    <option value="함초롬돋움">함초롬돋움</option>
    <option value="함초롬바탕">함초롬바탕</option>
    <option value="나눔고딕">나눔고딕</option>
    <option value="바탕">바탕</option>
    <option value="돋움">돋움</option>
    <option value="궁서">궁서</option>
  </select>
  <!-- 글자 크기 -->
  <input id="font-size" type="text" title="글자 크기" value="10" />
  <button id="btn-size-up" title="크기 크게">▲</button>
  <button id="btn-size-down" title="크기 작게">▼</button>
  <span class="sep"></span>
  <!-- 글자 서식 토글 -->
  <button id="btn-bold" class="fmt-btn" title="굵게 (Ctrl+B)"><b>B</b></button>
  <button id="btn-italic" class="fmt-btn" title="기울임 (Ctrl+I)"><i>I</i></button>
  <button id="btn-underline" class="fmt-btn" title="밑줄 (Ctrl+U)"><u>U</u></button>
  <button id="btn-strike" class="fmt-btn" title="취소선"><s>S</s></button>
  <span class="sep"></span>
  <!-- 글자색 -->
  <span class="color-wrap">
    <button id="btn-text-color" title="글자 색">A<span id="color-bar"></span></button>
    <input id="text-color-picker" type="color" value="#000000" />
  </span>
  <span class="sep"></span>
  <!-- 문단 정렬 -->
  <button id="btn-align-left" class="fmt-btn" title="왼쪽 정렬">⫷</button>
  <button id="btn-align-center" class="fmt-btn" title="가운데 정렬">⫿</button>
  <button id="btn-align-right" class="fmt-btn" title="오른쪽 정렬">⫸</button>
  <button id="btn-align-justify" class="fmt-btn" title="양쪽 정렬">⫻</button>
</div>
```

**`style.css` 추가** — webhwp style_bar 패턴 차용:
```css
#style-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 16px;
  background: #fff;
  border-bottom: 1px solid #ddd;
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 13px;
}
#style-bar .sep { width:1px; height:20px; background:#ddd; margin:0 4px; }
#style-bar .fmt-btn {
  width: 28px; height: 28px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
#style-bar .fmt-btn:hover { background: #e8e8e8; }
#style-bar .fmt-btn.active { background: #d0d8e8; border-color: #a0b0c8; }
#font-name { width: 110px; height: 26px; font-size: 12px; }
#font-size { width: 40px; height: 26px; text-align: center; font-size: 12px; }
#btn-size-up, #btn-size-down { width:20px; height:13px; font-size:8px; padding:0; }
.color-wrap { position:relative; display:inline-flex; }
#text-color-picker { position:absolute; left:0; top:100%; opacity:0; width:0; height:0; }
#color-bar { display:block; width:16px; height:3px; background:#000; margin:1px auto 0; }
```

### 2단계: Toolbar TypeScript 모듈 + EventBus 연동

**목표**: `toolbar.ts` 모듈에서 DOM 이벤트 → EventBus → InputHandler 흐름 구축.

**`rhwp-studio/src/ui/toolbar.ts` 신규 파일**:
```typescript
export class Toolbar {
  private fontName: HTMLSelectElement;
  private fontSize: HTMLInputElement;
  private btnBold: HTMLButtonElement;
  private btnItalic: HTMLButtonElement;
  private btnUnderline: HTMLButtonElement;
  private btnStrike: HTMLButtonElement;
  private btnTextColor: HTMLButtonElement;
  private colorPicker: HTMLInputElement;
  private colorBar: HTMLElement;

  constructor(
    private container: HTMLElement,
    private wasm: WasmBridge,
    private eventBus: EventBus,
  ) {
    // DOM 요소 바인딩 + 이벤트 설정
    this.setupFormatButtons();   // B/I/U/S 클릭 → eventBus.emit('format-char', {...})
    this.setupFontControls();    // 글꼴/크기 변경 → eventBus.emit('format-char', {...})
    this.setupColorPicker();     // 색상 → eventBus.emit('format-char', {textColor: '#FF0000'})

    // 커서 이동 시 서식 상태 수신
    eventBus.on('cursor-format-changed', (props) => this.updateState(props));
  }

  /** 버튼 active 상태, 글꼴/크기 표시 갱신 */
  updateState(props: CharProperties): void { ... }

  /** 문서 로드 전 비활성화 / 로드 후 활성화 */
  setEnabled(enabled: boolean): void { ... }
}
```

**`main.ts` 수정** — Toolbar 초기화 추가:
```typescript
import { Toolbar } from '@/ui/toolbar';
// ...
const toolbar = new Toolbar(document.getElementById('style-bar')!, wasm, eventBus);
```

**EventBus 이벤트 흐름**:
```
[Toolbar 버튼 클릭] → eventBus.emit('format-char', props)
                    → InputHandler가 수신 → applyCharFormat 실행

[커서 이동/선택 변경] → InputHandler → eventBus.emit('cursor-format-changed', props)
                     → Toolbar가 수신 → 버튼 상태 갱신
```

### 3단계: WasmBridge 래퍼 + ApplyCharFormatCommand

**목표**: WASM 서식 API를 TypeScript에서 사용할 수 있도록 연결하고, Undo 지원 Command 추가.

**`wasm-bridge.ts` 추가** — 서식 API 래퍼 5개:
```typescript
getCharPropertiesAt(sec, para, offset): CharProperties
getCellCharPropertiesAt(sec, ppi, ci, cei, cpi, offset): CharProperties
applyCharFormat(sec, para, start, end, propsJson): string
applyCharFormatInCell(sec, ppi, ci, cei, cpi, start, end, propsJson): string
findOrCreateFontId(name): number
```

**`types.ts` 추가** — CharProperties 인터페이스:
```typescript
export interface CharProperties {
  fontFamily?: string;
  fontSize?: number;       // HWPUNIT (1pt = 200)
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textColor?: string;      // '#RRGGBB'
  charShapeId?: number;
}
```

**`command.ts` 추가** — `ApplyCharFormatCommand`:
```typescript
class ApplyCharFormatCommand implements EditCommand {
  type = 'applyCharFormat';
  // constructor: 선택 범위(start, end), 적용할 props, 이전 서식 목록(undo용)

  execute(wasm):
    // 다중 문단이면 각 문단별로 applyCharFormat 호출
    // 단일 문단이면 한 번 호출
    // 실행 전 각 문단별 이전 charShapeId를 getCharPropertiesAt으로 보존

  undo(wasm):
    // 보존된 이전 서식(charShapeId 기반)으로 각 문단별 복원

  mergeWith: 항상 null (서식 변경은 병합 불가)
}
```

### 4단계: InputHandler 연동 (단축키 + 서식 상태 조회)

**목표**: Ctrl+B/I/U 단축키, 서식 적용 실행, 커서 위치 서식 상태 조회.

**`input-handler.ts` 수정**:

`handleCtrlKey()`에 단축키 추가:
```typescript
case 'b': e.preventDefault(); this.applyToggleFormat('bold'); break;
case 'i': e.preventDefault(); this.applyToggleFormat('italic'); break;
case 'u': e.preventDefault(); this.applyToggleFormat('underline'); break;
```

서식 적용 메서드:
```typescript
private applyCharFormat(props: Partial<CharProperties>): void {
  const sel = this.cursor.getSelectionOrdered();
  if (!sel) return;
  const cmd = new ApplyCharFormatCommand(sel.start, sel.end, props, this.wasm);
  this.executeCommand(cmd);
}

private applyToggleFormat(prop: 'bold' | 'italic' | 'underline'): void {
  if (!this.cursor.hasSelection()) return;
  const current = this.getCharPropertiesAtCursor();
  this.applyCharFormat({ [prop]: !current[prop] });
}
```

커서 서식 상태 조회:
```typescript
private getCharPropertiesAtCursor(): CharProperties {
  const pos = this.cursor.getPosition();
  if (isCell(pos))
    return this.wasm.getCellCharPropertiesAt(sec, ppi, ci, cei, cpi, offset);
  return this.wasm.getCharPropertiesAt(pos.sectionIndex, pos.paragraphIndex, pos.charOffset);
}
```

`updateCaret()` 끝에 서식 상태 알림 추가:
```typescript
this.emitCursorFormatState();

private emitCursorFormatState(): void {
  if (!this.active) return;
  const props = this.getCharPropertiesAtCursor();
  this.eventBus.emit('cursor-format-changed', props);
}
```

EventBus 수신 (Toolbar에서 서식 변경 요청):
```typescript
// constructor에 추가:
this.eventBus.on('format-char', (props) => {
  if (this.cursor.hasSelection()) {
    this.applyCharFormat(props as CharProperties);
  }
});
```

`executeCommand` 시그니처에 `ApplyCharFormatCommand` 추가.

### 5단계: 글꼴 목록 + 색상 피커 + 정렬

**목표**: 글꼴 드롭다운의 동적 목록, 색상 피커 완성, 문단 정렬 연동.

**글꼴**:
- 기본 글꼴: 맑은 고딕, 함초롬돋움, 함초롬바탕, 나눔고딕, 바탕, 돋움, 궁서
- 글꼴 변경: `findOrCreateFontId(name)` → `applyCharFormat({fontId: id})`

**크기**:
- `#font-size` 입력값 변경 → pt 단위를 HWPUNIT 변환 (× 200) → `applyCharFormat({fontSize: N})`
- `#btn-size-up/down`: 현재 크기 ± 1pt

**색상**:
- `#btn-text-color` 클릭 → `#text-color-picker.click()` 호출
- 색상 선택 → `applyCharFormat({textColor: '#RRGGBB'})`
- `#color-bar` 배경색을 현재 색상으로 갱신

**정렬** (WASM `applyParaFormat` 존재 시):
- 왼쪽/가운데/오른쪽/양쪽 버튼
- WASM API 없으면 비활성화 (향후 Phase)

---

## 수정 파일 목록

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `rhwp-studio/index.html` | `#style-bar` 서식 도구 모음 HTML | +25줄 |
| `rhwp-studio/src/style.css` | style-bar 스타일 | +60줄 |
| `rhwp-studio/src/ui/toolbar.ts` | Toolbar 클래스 (신규) | +180줄 |
| `rhwp-studio/src/core/types.ts` | CharProperties 인터페이스 | +15줄 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 서식 API 래퍼 5개 | +40줄 |
| `rhwp-studio/src/engine/command.ts` | ApplyCharFormatCommand | +80줄 |
| `rhwp-studio/src/engine/input-handler.ts` | Ctrl+B/I/U, 서식 적용, 서식 상태 조회 | +60줄 |
| `rhwp-studio/src/main.ts` | Toolbar 초기화 | +5줄 |

## 검증 방법

1. Vite 빌드: `cd rhwp-studio && npm run build`
2. 런타임 테스트:
   - 문서 로드 → style-bar 표시, 커서 위치 글꼴/크기 반영
   - 텍스트 선택 → Ctrl+B → 굵게 적용 → 재렌더링 확인
   - Ctrl+I (기울임), Ctrl+U (밑줄) 동일 확인
   - 툴바 B/I/U/S 버튼 클릭으로 동일 동작
   - 글꼴 드롭다운 변경 → 선택 영역 글꼴 변경
   - 크기 입력/증감 → 선택 영역 크기 변경
   - 색상 변경 → 선택 영역 글자색 변경
   - 커서 이동 시 → 툴바 상태 자동 갱신 (B 활성, 글꼴명 표시 등)
   - Ctrl+Z로 서식 변경 Undo 확인
   - 셀 내 텍스트에 동일 동작 확인
