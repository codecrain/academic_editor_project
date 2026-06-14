# 타스크 17 구현 계획서: 텍스트 선택 (B-301)

## 1단계: Rust — 글자별 위치 계산 API

**변경 파일:**
- `src/renderer/layout.rs`
- `src/wasm_api.rs`

**작업:**
1. `is_cjk_char()` 가시성을 `pub(crate)`로 변경
2. `compute_char_positions(text, style) -> Vec<f64>` 함수 추가
   - N글자 → N+1개 경계값 반환 (0번째는 0.0)
   - ratio(장평), letter_spacing 반영
3. `get_page_text_layout(page_num)` WASM 메서드 추가
   - 렌더 트리 순회 → TextRun 노드 수집 → JSON 직렬화

**완료 기준:** 기존 233개 테스트 통과, WASM 빌드 성공

---

## 2단계: JavaScript — TextLayoutManager 및 hit-test

**변경 파일:**
- `web/text_selection.js` (신규)

**작업:**
1. `TextLayoutManager` 클래스: loadPage, hitTest, getSelectionRects, getSelectedText
2. 좌표 변환: Canvas CSS 스케일 보정

**완료 기준:** hitTest 호출 시 정확한 run/char 인덱스 반환

---

## 3단계: 오버레이 캔버스 및 선택 하이라이트 렌더링

**변경 파일:**
- `web/index.html`
- `web/style.css`
- `web/text_selection.js`

**작업:**
1. `#canvas-wrapper` div + `#selection-canvas` 오버레이 캔버스 추가
2. CSS: 오버레이 캔버스 absolute 위치, pointer-events: none
3. `SelectionRenderer` 클래스: clear, drawSelection

**완료 기준:** 선택 영역이 오버레이에 정상 표시됨

---

## 4단계: 마우스 이벤트 연동 및 클립보드 복사

**변경 파일:**
- `web/text_selection.js`
- `web/app.js`

**작업:**
1. `SelectionController` 클래스: mousedown/mousemove/mouseup/dblclick/keydown 처리
2. Ctrl+C → 클립보드 복사, Ctrl+A → 전체 선택
3. `app.js` 통합: 페이지 렌더링 후 텍스트 레이아웃 로드 및 컨트롤러 초기화

**완료 기준:** 마우스 드래그 선택, 하이라이트 표시, Ctrl+C 복사 동작
