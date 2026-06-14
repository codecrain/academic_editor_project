# 타스크 193 구현 계획서 — 머리말/꼬리말 생성·편집 기본 기능

## 단계 개요

| 단계 | 내용 | 주요 산출물 |
|------|------|------------|
| 1 | WASM API 및 Rust 편집 함수 구현 | 머리말/꼬리말 CRUD API, 텍스트 삽입/삭제 API |
| 2 | 프론트엔드 편집 모드 상태 관리 | CursorState 확장, 편집 모드 진입/탈출 로직 |
| 3 | 문맥 도구상자 및 시각적 표시 | 전용 도구상자, 본문 dimming, 영역 레이블 |
| 4 | 텍스트 편집 파이프라인 통합 및 메뉴 커맨드 | 입력/삭제/IME 동작, 메뉴 연결, 쪽번호 삽입 |

---

## 1단계: WASM API 및 Rust 편집 함수 구현

### 목표
머리말/꼬리말을 생성·조회하고, 내부 텍스트를 편집할 수 있는 WASM API를 제공한다.

### 작업 내용

#### 1-1. Rust: 머리말/꼬리말 CRUD 함수 (`src/document_core/`)

새 모듈 `header_footer_ops.rs` 생성:

```rust
// 머리말/꼬리말 존재 여부 확인
pub fn get_header_footer(doc: &Document, section_idx: usize, is_header: bool, apply_to: u8) -> Option<&[Paragraph]>

// 빈 머리말/꼬리말 생성 (기본 빈 문단 1개 포함)
pub fn create_header_footer(doc: &mut Document, section_idx: usize, is_header: bool, apply_to: u8) -> Result<(), String>

// 머리말/꼬리말 내 텍스트 삽입
pub fn insert_text_in_header_footer(doc: &mut Document, section_idx: usize, is_header: bool, apply_to: u8, para_idx: usize, char_offset: usize, text: &str) -> Result<(), String>

// 머리말/꼬리말 내 텍스트 삭제
pub fn delete_text_in_header_footer(doc: &mut Document, section_idx: usize, is_header: bool, apply_to: u8, para_idx: usize, char_offset: usize, count: usize) -> Result<(), String>
```

- 머리말/꼬리말 문단 접근: `section.paragraphs[para_idx].controls` → Header/Footer 컨트롤 탐색
- 텍스트 삽입/삭제: 기존 `insert_text`, `delete_text` 로직을 header/footer의 `paragraphs`에 적용

#### 1-2. WASM 바인딩 (`src/wasm/`)

기존 WASM API 패턴에 맞춰 다음 함수 노출:

- `getHeaderFooter(sectionIdx, isHeader, applyTo)` → JSON
- `createHeaderFooter(sectionIdx, isHeader, applyTo)` → void
- `insertTextInHeaderFooter(sectionIdx, isHeader, applyTo, paraIdx, charOffset, text)` → void
- `deleteTextInHeaderFooter(sectionIdx, isHeader, applyTo, paraIdx, charOffset, count)` → void
- `getCursorRectInHeaderFooter(sectionIdx, isHeader, applyTo, paraIdx, charOffset, pageIdx)` → JSON {x, y, height}

#### 1-3. 커서 좌표 계산

- 머리말/꼬리말 영역의 커서 좌표를 계산하는 로직 구현
- 기존 `get_cursor_rect` 로직을 확장하여 header/footer 영역 내 문단의 좌표 반환
- 페이지별 header/footer 렌더 노드에서 문단 위치 추출

### 검증
- `cargo test` 통과
- WASM 빌드 성공

---

## 2단계: 프론트엔드 편집 모드 상태 관리

### 목표
머리말/꼬리말 편집 모드 진입·탈출 로직을 구현하고, 커서를 해당 영역으로 이동시킨다.

### 작업 내용

#### 2-1. CursorState 확장 (`rhwp-studio/src/engine/cursor.ts`)

```typescript
// 새 필드 추가
headerFooterMode: 'none' | 'header' | 'footer' = 'none';
headerFooterApplyTo: number = 0; // 0=Both, 1=Even, 2=Odd
headerFooterSectionIdx: number = 0;
headerFooterParaIdx: number = 0;
headerFooterCharOffset: number = 0;
```

커서 이동 메서드 확장:
- `enterHeaderFooterMode(isHeader, sectionIdx, applyTo)`: 편집 모드 진입
- `exitHeaderFooterMode()`: 편집 모드 탈출, 본문 커서 복원
- `updateRect()`: headerFooterMode일 때 `getCursorRectInHeaderFooter` WASM 호출
- `moveHorizontal(delta)`: headerFooterMode일 때 header/footer 문단 내 이동

#### 2-2. 편집 모드 진입 트리거

- **메뉴**: `page:header-create` 커맨드 실행 시 → 머리말이 없으면 생성 후 편집 모드 진입
- **더블클릭**: 머리말/꼬리말 영역 더블클릭 → 해당 영역 편집 모드 진입
  - 클릭 좌표가 header/footer 렌더 노드 영역에 해당하는지 hit-test

#### 2-3. 편집 모드 탈출 트리거

- **Shift+Esc**: 편집 모드 탈출 (한컴 방식)
- **닫기 버튼**: 도구상자의 [닫기] 버튼 클릭
- **본문 영역 클릭**: 본문 영역 클릭 시 편집 모드 자동 탈출

#### 2-4. EventBus 이벤트

- `headerFooterModeChanged` 이벤트 발행: mode 변경 시 도구상자·렌더러에 알림
- 기존 `cursorMoved` 이벤트와 연동

### 검증
- 편집 모드 진입/탈출 시 콘솔에서 상태 변경 확인
- 커서가 header/footer 영역에 올바르게 위치하는지 시각적 확인

---

## 3단계: 문맥 도구상자 및 시각적 표시

### 목표
편집 모드 진입 시 한컴 방식의 전용 도구상자를 표시하고, 본문을 dimming 처리한다.

### 작업 내용

#### 3-1. 머리말/꼬리말 전용 도구상자 (`rhwp-studio/index.html`)

기존 `.tb-rotate-group` 패턴 활용:

```html
<div class="tb-group tb-headerfooter-group" style="display:none">
  <span class="tb-label">머리말</span>
  <div class="tb-sep"></div>
  <button class="tb-btn" data-cmd="page:headerfooter-close" title="닫기">
    <span class="tb-icon">✕</span><span class="tb-text">닫기</span>
  </button>
  <div class="tb-sep"></div>
  <button class="tb-btn" data-cmd="insert:page-number" title="쪽 번호">
    <span class="tb-icon">#</span><span class="tb-text">쪽 번호</span>
  </button>
</div>
```

#### 3-2. 도구상자 전환 로직 (`rhwp-studio/src/ui/toolbar.ts` 또는 관련 파일)

```typescript
eventBus.on('headerFooterModeChanged', (mode) => {
  const hfGroup = document.querySelector('.tb-headerfooter-group');
  const defaultGroups = document.querySelectorAll('.tb-group:not(.tb-headerfooter-group):not(.tb-rotate-group)');

  if (mode !== 'none') {
    // 기본 그룹 숨기고 머리말/꼬리말 그룹 표시
    defaultGroups.forEach(g => g.style.display = 'none');
    hfGroup.style.display = '';
    // 레이블 업데이트
    hfGroup.querySelector('.tb-label').textContent = mode === 'header' ? '머리말' : '꼬리말';
  } else {
    // 복원
    defaultGroups.forEach(g => g.style.display = '');
    hfGroup.style.display = 'none';
  }
});
```

#### 3-3. 본문 Dimming 처리

CSS 오버레이 방식:
- 편집 모드 진입 시 `#scroll-container`에 `hf-editing` 클래스 추가
- 본문 영역에 반투명 오버레이 (opacity 조절 또는 ::after pseudo-element)
- 머리말/꼬리말 영역만 정상 밝기 유지

```css
.hf-editing .page-body-overlay {
  position: absolute;
  background: rgba(255, 255, 255, 0.6);
  pointer-events: none;
}
```

#### 3-4. 영역 레이블 표시

편집 모드 시 머리말/꼬리말 영역 상단에 레이블 표시:
- `<<머리말(양 쪽)>>`, `<<꼬리말(양 쪽)>>` 등
- 점선 테두리로 영역 구분
- Canvas 또는 DOM 오버레이로 구현

### 검증
- 편집 모드 진입 시 도구상자 전환 확인
- 본문 dimming + 영역 레이블 시각적 확인
- 편집 모드 탈출 시 원래 도구상자 복원 확인

---

## 4단계: 텍스트 편집 파이프라인 통합 및 메뉴 커맨드

### 목표
머리말/꼬리말 내에서 실제 텍스트 편집(입력/삭제/IME)이 동작하도록 하고, 메뉴를 연결한다.

### 작업 내용

#### 4-1. 텍스트 입력 파이프라인 확장 (`rhwp-studio/src/engine/input-handler-text.ts`)

기존 `insertTextAtRaw` / `deleteTextAt` 분기에 headerFooter 모드 추가:

```typescript
if (cursor.headerFooterMode !== 'none') {
  wasm.insertTextInHeaderFooter(
    cursor.headerFooterSectionIdx,
    cursor.headerFooterMode === 'header',
    cursor.headerFooterApplyTo,
    cursor.headerFooterParaIdx,
    cursor.headerFooterCharOffset,
    text
  );
} else if (pos.parentParaIndex !== undefined) {
  // 기존 셀 내 편집
} else {
  // 기존 본문 편집
}
```

- IME 조합(onCompositionStart/Update/End) 동일하게 확장
- Backspace/Delete 처리 확장

#### 4-2. 메뉴 커맨드 활성화 (`rhwp-studio/src/command/commands/page.ts`)

stub을 실제 구현으로 교체:

```typescript
{
  id: 'page:header-create',
  label: '머리말',
  canExecute: (ctx) => ctx.hasDocument,
  execute(services) {
    const cursor = services.cursor;
    const sectionIdx = cursor.position.sectionIndex;
    // 머리말이 없으면 생성
    const existing = services.wasm.getHeaderFooter(sectionIdx, true, 0);
    if (!existing) {
      services.wasm.createHeaderFooter(sectionIdx, true, 0); // Both
    }
    cursor.enterHeaderFooterMode(true, sectionIdx, 0);
    services.eventBus.emit('headerFooterModeChanged', 'header');
  },
}
```

- `page:footer-create`: 꼬리말 생성 + 편집 모드 진입
- `page:headerfooter-close`: 편집 모드 탈출
- `page:header-none/left/center/right`: 쪽번호 위치 설정 (각 위치에 쪽번호 필드 삽입)

#### 4-3. 쪽번호 필드 삽입

- WASM API: `insertPageNumberInHeaderFooter(sectionIdx, isHeader, applyTo, paraIdx, charOffset)`
- 기존 PageNumberPos 컨트롤 삽입 로직 활용
- 도구상자의 [쪽 번호] 버튼으로 현재 커서 위치에 삽입

#### 4-4. 글자/문단 서식 적용

- 편집 모드에서 서식 도구 모음(#style-bar) 동작 확장
- 머리말/꼬리말 문단에 대한 charShape/paraShape 변경 API
- 기존 `setCharShape` / `setParaShape` WASM 호출을 headerFooter 모드로 분기

#### 4-5. 키보드 단축키

- `Shift+Esc`: 편집 모드 탈출
- 기존 화살표 키 네비게이션이 headerFooter 문단 내에서 동작하도록 처리

### 검증
- 머리말/꼬리말 영역에서 텍스트 입력·삭제·IME 조합 동작 확인
- 쪽번호 삽입 후 렌더링 확인
- 메뉴에서 머리말/꼬리말 생성 커맨드 동작 확인
- `cargo test` 및 WASM 빌드 통과
- 전체 흐름 E2E 검증: 메뉴 → 생성 → 편집 모드 진입 → 텍스트 입력 → 쪽번호 삽입 → 닫기

---

## 파일 변경 예상

| 파일 | 변경 내용 |
|------|-----------|
| `src/document_core/header_footer_ops.rs` | **신규** - 머리말/꼬리말 CRUD 및 텍스트 편집 함수 |
| `src/document_core/mod.rs` | header_footer_ops 모듈 등록 |
| `src/wasm/api.rs` (또는 해당 파일) | WASM API 바인딩 추가 |
| `rhwp-studio/src/engine/cursor.ts` | headerFooterMode 상태 및 관련 메서드 추가 |
| `rhwp-studio/src/engine/input-handler-text.ts` | 텍스트 입력/삭제 headerFooter 분기 추가 |
| `rhwp-studio/index.html` | `.tb-headerfooter-group` 도구상자 HTML 추가 |
| `rhwp-studio/src/ui/toolbar.ts` | 도구상자 전환 로직 |
| `rhwp-studio/src/command/commands/page.ts` | stub → 실제 커맨드 구현 |
| `rhwp-studio/css/studio.css` | dimming 오버레이, 영역 레이블 스타일 |
