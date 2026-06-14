# 타스크 62: 편집 용지 설정 다이얼로그 UI — 구현계획서

## 1단계: WASM API — getPageDef / setPageDef (~60줄)

### src/wasm_api.rs

1. `get_page_def(section_idx: u32)` 추가 — `#[wasm_bindgen(js_name = getPageDef)]`
   - `self.document.sections[sec_idx].section_def.page_def`에서 HWPUNIT 원본값을 JSON으로 반환
   - 반환 필드: width, height, marginLeft, marginRight, marginTop, marginBottom, marginHeader, marginFooter, marginGutter, landscape(bool), binding(0/1/2)

2. `set_page_def(section_idx: u32, json: &str)` 추가 — `#[wasm_bindgen(js_name = setPageDef)]`
   - JSON 파싱 → PageDef 필드 덮어쓰기
   - `self.convert_to_editable()` 호출로 전체 재페이지네이션
   - 성공 시 `"ok"` 반환

### 빌드 확인
- `docker compose --env-file /dev/null run --rm dev` — 네이티브 빌드
- `docker compose --env-file /dev/null run --rm test` — 기존 테스트 통과 확인

---

## 2단계: 모달 다이얼로그 베이스 + CSS (~120줄)

### src/style.css — 다이얼로그 CSS 추가

WebGian 패턴 기반:
- `.modal-overlay` — 반투명 배경 (rgba(0,0,0,0.2)), z-index: 10000, 전체화면
- `.dialog-wrap` — 중앙 정렬, 흰 배경, 파란 테두리 (#748bc9)
- `.dialog-wrap .dialog-title` — 헤더 (#e7eaf4 배경, 볼드, 드래그 커서)
- `.dialog-wrap .dialog-close` — X 닫기 버튼
- `.dialog-wrap .dialog-body` — 본문 영역 (padding)
- `.dialog-wrap .dialog-section` — 그룹 박스 (border, 제목)
- `.dialog-wrap .dialog-footer` — 확인/취소 버튼 영역
- `.dialog-wrap .field-row` — 레이블 + input 한 줄
- `.dialog-wrap input[type="number"]` — 숫자 입력 스타일
- `.dialog-wrap select` — 드롭다운 스타일
- `.dialog-wrap .radio-group` — 라디오 버튼 그룹

### src/ui/dialog.ts — 모달 베이스 클래스 (~60줄)

```typescript
export class ModalDialog {
  protected overlay: HTMLDivElement;
  protected dialog: HTMLDivElement;

  constructor(title: string, width: number);
  show(): void;       // overlay + dialog append to body
  hide(): void;       // remove
  protected createBody(): HTMLElement;  // 서브클래스 오버라이드
  protected onConfirm(): void;         // 서브클래스 오버라이드
}
```
- show(): overlay + dialog를 `document.body`에 추가, Escape 키 닫기
- hide(): DOM 제거
- 드래그 이동은 미구현 (추후)

---

## 3단계: 편집 용지 다이얼로그 UI (~200줄)

### src/core/types.ts — PageDef 인터페이스 추가

```typescript
export interface PageDef {
  width: number;        // HWPUNIT
  height: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  marginHeader: number;
  marginFooter: number;
  marginGutter: number;
  landscape: boolean;
  binding: number;      // 0=한쪽, 1=맞쪽, 2=위로
}
```

### src/core/wasm-bridge.ts — getPageDef/setPageDef 추가

```typescript
getPageDef(sectionIdx: number): PageDef;
setPageDef(sectionIdx: number, pageDef: PageDef): string;
```

### src/ui/page-setup-dialog.ts — 편집 용지 다이얼로그 (~180줄)

ModalDialog를 상속하여 구현:

1. **용지 종류** 섹션
   - `<select>` 드롭다운: A4, A3, B4, B5, Letter, Legal, 사용자 정의
   - 폭/길이 `<input type="number">` (mm 단위, step=0.1)
   - 용지 선택 시 폭/길이 자동 채움, "사용자 정의" 시 편집 가능

2. **용지 방향** 섹션
   - 라디오: 세로 / 가로
   - 가로 선택 시 폭/길이 교환

3. **제본** 섹션
   - 라디오: 한쪽 / 맞쪽 / 위로

4. **용지 여백** 섹션
   - 7개 필드: 위쪽/아래쪽/왼쪽/오른쪽/머리말/꼬리말/제본 (mm, step=0.1)

5. **적용 범위**
   - `<select>`: 문서 전체 (현재는 단일 옵션)

6. **확인/취소**
   - 확인: mm→HWPUNIT 변환 후 `wasm.setPageDef()` 호출, 캔버스 재렌더
   - 취소: 다이얼로그 닫기

### 단위 변환 유틸

```typescript
const HWPUNIT_PER_MM = 7200 / 25.4;  // ≈283.46
function hwpunitToMm(hu: number): number { return hu * 25.4 / 7200; }
function mmToHwpunit(mm: number): number { return Math.round(mm * 7200 / 25.4); }
```

---

## 4단계: 커맨드 연결 + F7 단축키 (~40줄)

### src/command/commands/file.ts

`file:page-setup` 커맨드 활성화:
- `canExecute: (ctx) => ctx.hasDocument`
- `execute`: PageSetupDialog 인스턴스 생성 → show()

### src/command/commands/page.ts

`page:setup` 커맨드 활성화:
- `file:page-setup`과 동일 동작 (dispatcher로 위임 또는 동일 구현)

### src/command/shortcut-map.ts

F7 단축키 추가:
```typescript
[{ key: 'f7' }, 'file:page-setup'],
```

### src/engine/input-handler.ts

F7 키 이벤트가 shortcutMap을 통해 커맨드로 디스패치되는지 확인. 기존 matchShortcut 로직에서 function 키(F1~F12)는 ctrl 없이도 매칭되도록 처리.

---

## 5단계: 빌드 + WASM 빌드 + 통합 테스트

1. `docker compose --env-file /dev/null run --rm dev` — 네이티브 빌드
2. `docker compose --env-file /dev/null run --rm test` — Rust 테스트 전 통과
3. `docker compose --env-file /dev/null run --rm wasm` — WASM 빌드
4. 브라우저 테스트:
   - 메뉴 파일 > 편집 용지 클릭 → 다이얼로그 표시
   - F7 키 → 다이얼로그 표시
   - 현재 문서의 용지 설정값이 올바르게 표시되는지 확인
   - 여백 값 변경 후 확인 → 캔버스 재렌더 확인
   - 취소 → 변경 없음 확인
   - Escape 키 → 다이얼로그 닫힘 확인

---

## 수정/신규 파일 목록

| 파일 | 작업 | 규모 |
|------|------|------|
| `src/wasm_api.rs` | 수정 — getPageDef/setPageDef 추가 | ~60줄 |
| `rhwp-studio/src/style.css` | 수정 — 다이얼로그 CSS 추가 | ~80줄 |
| `rhwp-studio/src/ui/dialog.ts` | 신규 — 모달 베이스 클래스 | ~60줄 |
| `rhwp-studio/src/ui/page-setup-dialog.ts` | 신규 — 편집 용지 다이얼로그 | ~180줄 |
| `rhwp-studio/src/core/types.ts` | 수정 — PageDef 인터페이스 | ~15줄 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 수정 — getPageDef/setPageDef | ~15줄 |
| `rhwp-studio/src/command/commands/file.ts` | 수정 — page-setup 활성화 | ~15줄 |
| `rhwp-studio/src/command/commands/page.ts` | 수정 — setup 활성화 | ~10줄 |
| `rhwp-studio/src/command/shortcut-map.ts` | 수정 — F7 바인딩 | ~2줄 |
| **합계** | | **~437줄** |
