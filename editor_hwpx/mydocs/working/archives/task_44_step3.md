# 타스크 44 단계 3 완료보고서

## 단계: 커서/선택/입력 시스템 설계

## 수행 내용

### 1. 커서 모델 설계 (Section 6)

#### 1.1 위치 표현 체계

HWP 문서 내 텍스트 위치를 표현하는 3가지 좌표계를 정의하였다:

| 좌표계 | 단위 | 용도 |
|--------|------|------|
| **char index** | Rust char 인덱스 | WASM API 호출 (insertText 등) |
| **UTF-16 code unit** | HWP 내부 | LineSeg, CharShapeRef, DocProperties |
| **픽셀 좌표** | px | 캐럿 렌더링, 히트 테스팅 |

- `DocumentPosition` (sectionIndex, paragraphIndex, charOffset) — 논리적 문서 위치
- `CursorLocation` — 레이아웃 기반 위치 (줄 인덱스, 페이지, 픽셀 좌표 포함)

#### 1.2 CursorContext 상태 머신 (5가지 컨텍스트)

| 컨텍스트 | 진입 조건 | 핵심 상태 |
|----------|----------|----------|
| **TextContext** | 본문 텍스트 위치 | position, location |
| **ControlContext** | 인라인 컨트롤 선택 | controlIndex, controlType, boundingBox |
| **TableContext** | 표 셀 내부 편집 | cellRow, cellCol, innerCursor |
| **FieldContext** | 필드(누름틀) 내부 | fieldName, innerCursor |
| **HeaderFooterContext** | 머리말/꼬리말 내부 | headerFooterType, innerCursor |

**전환 규칙 설계**:
- TextContext ↔ ControlContext: 화살표로 컨트롤 위치 도달 / Escape
- ControlContext → TableContext: Enter/더블클릭으로 표 내부 진입
- TableContext → ControlContext: Escape로 표 선택 상태 복귀
- TextContext ↔ HeaderFooterContext: 영역 클릭 / Escape

#### 1.3 컨트롤 판별 메커니즘

현재 WASM의 `identify_inline_controls()`가 모든 컨트롤을 line_index=0에 배치하는 제한을 확인하고, 편집기를 위한 WASM 확장 API 설계:
- `get_paragraph_control_positions()` — 컨트롤의 정확한 char offset 반환

### 2. 커서 이동 28+ 타입 설계 (Section 6.4)

4개 카테고리로 분류된 28+ 이동 타입을 설계하였다:

| 카테고리 | 이동 타입 | 수 |
|----------|----------|---|
| 문자 단위 | CharLeft/Right, CharLeftWord/RightWord | 4 |
| 줄 단위 | LineUp/Down, LineStart/End | 4 |
| 문단 단위 | ParaUp/Down, ParaStart/End | 4 |
| 페이지 단위 | PageUp/Down, PageStart/End | 4 |
| 문서 단위 | DocumentStart/End | 2 |
| 표 셀 | CellNext/Prev/Up/Down/Start/End | 6 |
| 특수 | FieldNext/Prev, MatchingBracket, BookmarkGoto | 4+ |

**핵심 알고리즘 설계**:
- **단어 경계 탐색**: CharClass 분류 (한글/영문/숫자/CJK/공백/구두점/컨트롤) 기반
- **수직 이동 (↑/↓)**: preferredX 유지 패턴 — 수평 이동 시 초기화, 수직 이동 시 보존
- **표 셀 이동**: 병합 셀 고려, 마지막 셀 Tab → 새 행 추가 (한컴 동작 호환)

### 3. 히트 테스팅 알고리즘 (Section 6.5)

4단계 파이프라인 방식의 히트 테스팅을 설계하였다:

```
뷰포트 좌표 → 문서 좌표 → 페이지 좌표
  → Stage 2: 페이지 영역 판별 (본문/머리말/꼬리말/여백)
  → Stage 3: 블록 판별 (플로팅 도형 우선 → 문단/표 순차)
  → Stage 4: 줄 + 문자 판별 (Y → 줄, X → charPositions 이진 탐색)
```

**성능 전략**: 초기에는 JavaScript 측 `charX[]` 캐시 기반, 병목 시 WASM `hit_test()` API 전환

### 4. 선택 모델 설계 (Section 7.1)

3가지 선택 모드를 설계하였다:

| 선택 모드 | 데이터 구조 | 렌더링 |
|----------|-----------|--------|
| **RangeSelection** | anchor + focus (DocumentPosition) | 줄별 사각형 반전 |
| **CellBlockSelection** | startCell + endCell + 병합 셀 확장 | 셀별 반전 |
| **ObjectSelection** | 다중 개체 목록 | 리사이즈 핸들 |

**셀 블록 선택의 병합 셀 확장 알고리즘**: 선택 영역에 걸치는 병합 셀을 반복적으로 확장하여 정확한 블록 범위 결정

### 5. 입력 시스템 설계 (Section 7.2)

**이벤트 처리 아키텍처**:
- `keydown` → 특수키/단축키 매핑 → CommandDispatcher
- `beforeinput` → inputType 기반 일반 입력 처리
- `composition*` → IMEHandler (한글 조합 전용)
- `mouse*` → HitTester + SelectionManager

**Hidden textarea 전략**: IME 입력 수신용 숨겨진 textarea를 Canvas 위에 배치, 캐럿 위치에 동기화하여 IME 후보창 위치 보정

### 6. IME 한글 조합 처리 (Section 7.3)

**3단계 조합 처리 설계**:
1. `compositionstart`: anchor 위치 저장, 원본 보존
2. `compositionupdate`: 이전 조합 삭제 → 새 조합 삽입 → 증분 리플로우
3. `compositionend`: 최종 확정 텍스트를 Command 패턴으로 삽입 (Undo 가능)

**성능 분석**: compositionupdate마다 TextFlow만 수행 (~3ms), BlockFlow/PageFlow는 줄 수 변경 시만 → 총 ~6ms로 60fps 충족

### 7. 캐럿 렌더링 (Section 7.4)

- **DOM 오버레이 방식**: Canvas 위에 `<div>` 요소로 캐럿 표시
- **블링크**: 530ms 간격, 편집 동작 시 리셋
- **조합 중 밑줄**: IME 조합 영역에 2px 밑줄 오버레이
- **선택 영역**: 반투명 파란색 사각형 (줄별 또는 셀별)

## 산출물

| 문서 | 경로 | 내용 |
|------|------|------|
| 설계서 Section 6 | `mydocs/plans/task_44_architecture.md` §6 | 커서 모델 (위치 표현, CursorContext 상태 머신, 이동 28+ 타입, 히트 테스팅) |
| 설계서 Section 7 | `mydocs/plans/task_44_architecture.md` §7 | 선택/입력 시스템 (선택 모델, 입력 처리, IME 한글 조합, 캐럿 렌더링) |

## 설계 핵심 결정 사항

1. **char index 기본 단위**: TypeScript 편집 엔진은 WASM API와 동일한 char index를 사용, UTF-16 변환은 Rust 내부에서 처리
2. **JavaScript 히트 테스팅 우선**: WASM 왕복 없이 charX[] 캐시로 빠른 반응, 필요 시 WASM 전환
3. **Hidden textarea IME 전략**: Canvas 기반 에디터의 표준 패턴, IME 후보창 위치를 캐럿에 동기화
4. **DOM 오버레이 캐럿**: Canvas 재렌더링 없이 블링크 가능, 성능 최적

## 다음 단계

단계 4: Undo/Redo + WASM 확장 + 리팩터링 계획 + 설계서 완성
- Command 패턴 인터페이스 설계
- 연속 타이핑 묶기 전략
- WASM 코어 확장 필요 API 목록
- 기존 코드 리팩터링 계획 (배치형 → 증분형)
- 설계서 Section 8 + 9 + 10 작성
