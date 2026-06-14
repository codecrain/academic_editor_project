# 타스크 44 구현 계획서: 편집 엔진 아키텍처 설계

## 전략 방향

현재 rhwp 코어(파서, 문서 모델, 렌더러)를 **공유 기반**으로 유지하면서, 별도 웹 프로젝트 `rhwp-studio`에 편집 엔진을 설계한다. 설계서는 코드가 아니라 **아키텍처 문서**이며, 향후 구현의 청사진이 된다.

## 핵심 설계 과제

현재 rhwp의 뷰어 파이프라인과 워드프로세서 편집기 파이프라인의 근본적 차이:

```
[현재 뷰어 파이프라인]
HWP 파일 → 파서 → 문서 모델 → compose(전체) → paginate(전체) → layout → render(1페이지)
                                  ↑ 편집 시 전체 재실행 ↑

[목표 편집기 파이프라인]
                    ┌─ 편집 명령 (커서 위치에서)
                    ↓
문서 모델 → 변경 감지 → reflow(해당 문단) → re-paginate(해당 페이지~) → render(뷰포트)
    ↑                                                                      ↓
    └──────────────── Undo/Redo 히스토리 ←─────────────────────────────────┘
```

## 단계 구성 (4단계)

### 단계 1: 현재 아키텍처 분석 + rhwp-studio 프로젝트 설계

**작업 내용**:
- 현재 rhwp의 6개 레이아웃 모듈(Composer, HeightMeasurer, Paginator, LayoutEngine, RenderTree, WASM API)을 심층 분석
- 각 모듈의 재활용 가능 범위와 리팩터링 필요사항 식별
- rhwp-studio 프로젝트 구조, 빌드 체계, WASM 연동 방식 설계

**분석 포인트**:
- `compose_section()`: 전체 재구성 → 증분 가능 지점은?
- `paginate()`: 전체 재페이지네이션 → 특정 페이지부터 재계산 가능 지점은?
- `reflow_paragraph()` / `reflow_cell_paragraph()`: 이미 존재하는 증분 리플로우의 범위와 한계
- 문서 모델(Paragraph, LineSeg, Control)의 편집 적합성 평가

**산출물**: 설계서 Section 1 (현재 아키텍처 분석) + Section 2 (rhwp-studio 프로젝트 구조)

### 단계 2: 레이아웃 엔진 설계 (TextFlow / BlockFlow / PageFlow)

**작업 내용**:
- 워드프로세서의 3계층 플로우 엔진 설계
  - TextFlow: 문단 내 줄바꿈, 인라인 요소 배치
  - BlockFlow: 문단/표/개체의 수직 배치, 플로팅 처리
  - PageFlow: 페이지 분할, 머리말/꼬리말, 각주, 표 분할
- 증분 레이아웃 전략: dirty flag, 영향 범위 계산, 캐시 무효화
- 연속 스크롤 캔버스 뷰 설계: 가상 스크롤, 뷰포트 기반 렌더링, 페이지 간 연속 배치

**설계 핵심**:
```
편집 발생 (para[3]에 텍스트 삽입)
  → TextFlow: para[3]만 리플로우 (줄 수 변경 여부 판단)
  → BlockFlow: para[3]~para[N]의 수직 위치 재계산 (줄 수 변경 시)
  → PageFlow: 영향받는 페이지부터 재분할 (대부분 1~2페이지)
  → View: dirty 페이지만 재렌더링
```

**산출물**: 설계서 Section 3 (플로우 엔진) + Section 4 (증분 레이아웃) + Section 5 (캔버스 뷰)

### 단계 3: 커서/선택/입력 시스템 설계

**작업 내용**:
- 커서 모델 설계: 줄 단위 처리, 문단 컨트롤 판별, 커서 컨텍스트 전환
- 커서 이동: 화살표, Home/End, PageUp/Down, Ctrl+화살표 (단어 단위)
- 히트 테스팅: 마우스 클릭 좌표 → 문서 위치 변환
- 선택 모델: Shift+이동, 마우스 드래그, 셀 블록 선택
- 입력 처리: 일반 문자, IME 한글 조합, 특수키 (Tab, Enter, BS, Del)
- 캐럿 렌더링: 위치 계산, 블링크, 스크롤 추적

**커서 컨텍스트 전환 설계**:
```
CursorContext:
  ├── TextContext     { sec, para, line, offset }     ← 텍스트 줄에서 편집
  ├── ControlContext  { sec, para, ctrl_idx, ctrl_type } ← 컨트롤 선택 상태
  ├── TableContext    { ..., cell_row, cell_col, inner_cursor } ← 표 셀 내부
  ├── FieldContext    { ..., field_name, inner_cursor }  ← 필드 내부
  └── HeaderFooterContext { type, inner_cursor }         ← 머리말/꼬리말 내부
```

**산출물**: 설계서 Section 6 (커서 모델) + Section 7 (선택/입력)

### 단계 4: Undo/Redo + WASM 확장 + 리팩터링 계획 + 설계서 완성

**작업 내용**:
- 명령 히스토리 설계: Command 패턴, 역연산 기반 Undo/Redo
- WASM 코어 확장 계획: 편집기에 필요하지만 현재 없는 API 목록, Rust 코어 수정 범위
- 기존 코드 리팩터링 계획: 배치형→증분형 전환 전략, 호환성 유지 방안
- 설계서 최종 조립 및 검토

**Command 패턴 설계**:
```
trait EditCommand {
    fn execute(&mut self, doc: &mut Document) -> CommandResult;
    fn undo(&mut self, doc: &mut Document) -> CommandResult;
    fn merge_with(&self, other: &EditCommand) -> Option<Box<dyn EditCommand>>;
    // merge_with: 연속 타이핑을 하나의 Undo 단위로 묶기
}

CommandHistory {
    undo_stack: Vec<Box<dyn EditCommand>>,
    redo_stack: Vec<Box<dyn EditCommand>>,
}
```

**산출물**: 설계서 Section 8 (Undo/Redo) + Section 9 (WASM 확장) + Section 10 (리팩터링 계획)

## 최종 산출물 구조

```
mydocs/plans/task_44_architecture.md
├── 1. 현재 아키텍처 분석
│     ├── 6개 모듈별 역할/한계/재활용 범위
│     └── 편집기 관점 Gap 식별
├── 2. rhwp-studio 프로젝트 구조
│     ├── 디렉토리 레이아웃
│     ├── 빌드 체계 (WASM 연동)
│     └── 모듈 의존성 다이어그램
├── 3. 플로우 엔진 (TextFlow / BlockFlow / PageFlow)
│     ├── 3계층 구조 및 인터페이스
│     ├── HWP 문서 모델과의 매핑
│     └── 표/이미지/각주 등 특수 케이스
├── 4. 증분 레이아웃 엔진
│     ├── dirty flag 전파 전략
│     ├── 영향 범위 계산 알고리즘
│     └── 성능 목표 (60fps 편집 응답)
├── 5. 연속 스크롤 캔버스 뷰
│     ├── 가상 스크롤 아키텍처
│     ├── 뷰포트 기반 렌더링
│     └── 페이지 간 여백/구분선 처리
├── 6. 커서 모델
│     ├── CursorContext 상태 머신
│     ├── 줄 단위 처리 + 컨트롤 판별
│     ├── 커서 이동 28+ 타입 설계
│     └── 히트 테스팅 알고리즘
├── 7. 선택/입력 시스템
│     ├── 선택 모델 (범위/셀 블록)
│     ├── IME 한글 조합 처리
│     └── 캐럿 렌더링
├── 8. 명령 히스토리 (Undo/Redo)
│     ├── Command 패턴 인터페이스
│     ├── 연속 타이핑 묶기 전략
│     └── 선택적 Undo 범위
├── 9. WASM 코어 확장 계획
│     ├── 필드 시스템 API
│     ├── 커서/위치 API
│     ├── 검색/치환 API
│     └── 기타 필요 API
└── 10. 기존 코드 리팩터링 계획
      ├── 배치형→증분형 전환 전략
      ├── 뷰어(web/) 호환성 유지 방안
      └── 단계적 마이그레이션 순서
```
