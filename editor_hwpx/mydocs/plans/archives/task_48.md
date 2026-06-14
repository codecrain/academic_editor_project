# 타스크 48 수행계획서

## 타스크: rhwp-studio 기본 커서 + 텍스트 입력

## 목표

rhwp-studio에 기본적인 커서 배치(클릭), 텍스트 입력, Backspace 삭제 기능을 구현한다. 설계서 §6(커서 모델), §7(입력 시스템)의 기본 구조를 따른다.

## 현황 분석

### 사용 가능한 WASM API (기존)
- `insertText(sec, para, charOffset, text)` — 텍스트 삽입
- `deleteText(sec, para, charOffset, count)` — 텍스트 삭제
- `splitParagraph(sec, para, charOffset)` — 문단 분할 (Enter)
- `mergeParagraph(sec, para)` — 문단 병합 (Backspace at start)
- `getParagraphCount(sec)` / `getParagraphLength(sec, para)` — 문단 정보
- `renderPageToCanvas(pageNum, canvas)` — 페이지 렌더링

### 추가 필요한 WASM API
- `getCursorRect(sec, para, charOffset)` — 캐럿 픽셀 좌표 (캐럿 렌더링용)
- `hitTest(page, x, y)` — 좌표 → 문서 위치 변환 (클릭 커서 배치용)

### 핵심 데이터 흐름

렌더 트리의 `TextRunNode`에 `(section_index, para_index, char_start)` + `BoundingBox(x, y, width, height)`가 이미 포함되어 있으므로, `build_page_tree()`를 활용하여 getCursorRect/hitTest를 구현할 수 있다.

## 수행 단계

### 단계 1: WASM API 추가 — getCursorRect, hitTest (Rust)

`wasm_api.rs`에 2개 API 추가:

**getCursorRect(sec, para, charOffset) → JSON**
- `build_page_tree()`로 렌더 트리 생성
- TextRunNode 순회하여 charOffset 포함 노드 찾기
- 문자 폭 보간으로 정확한 X 좌표 계산
- 반환: `{pageIndex, x, y, height}`

**hitTest(page, x, y) → JSON**
- `build_page_tree()`로 렌더 트리 생성
- (x, y) 포함하는 TextRunNode 찾기
- 문자 폭 보간으로 charOffset 계산
- 반환: `{sectionIndex, paragraphIndex, charOffset}`

Docker 빌드 + 테스트 검증.

### 단계 2: TypeScript 커서 모델 + 캐럿 렌더링

**신규 파일:**
- `engine/cursor.ts` — DocumentPosition 타입, CursorState 관리
- `engine/caret-renderer.ts` — Canvas 오버레이 캐럿 (500ms 깜박임)

**수정 파일:**
- `core/wasm-bridge.ts` — getCursorRect, hitTest 래퍼 추가
- `core/types.ts` — CursorRect, HitTestResult 타입 추가

### 단계 3: 클릭 커서 배치 + 키보드 입력

**신규 파일:**
- `engine/input-handler.ts` — Hidden textarea, keydown 처리

**구현 기능:**
- 클릭 → hitTest → 커서 이동 → 캐럿 렌더링
- 텍스트 입력 → insertText → 페이지 재렌더링 → 캐럿 갱신
- Backspace → deleteText/mergeParagraph → 재렌더링 → 캐럿 갱신
- Enter → splitParagraph → 재렌더링 → 캐럿 갱신
- 좌/우 화살표 → 커서 이동 → 캐럿 갱신

**수정 파일:**
- `view/canvas-view.ts` — 클릭 이벤트 연결, 캐럿 레이어 추가
- `main.ts` — InputHandler 초기화

### 단계 4: 빌드 검증 + 런타임 테스트

- Docker WASM 빌드 + 테스트
- TypeScript 빌드 검증
- 브라우저 런타임 테스트 (클릭, 입력, 삭제, Enter)
- 최종 결과보고서 작성

## 산출물

| 문서 | 경로 |
|------|------|
| 수행계획서 | `mydocs/plans/task_48.md` |
| 단계별 완료보고서 | `mydocs/working/task_48_step{N}.md` |
| 최종 결과보고서 | `mydocs/working/task_48_final.md` |
