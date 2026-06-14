# 타스크 44 단계 2 완료보고서

## 단계: 레이아웃 엔진 설계 (TextFlow / BlockFlow / PageFlow)

## 수행 내용

### 1. 3계층 플로우 엔진 설계 (Section 3)

워드프로세서 레이아웃의 3단계 플로우 구조를 설계하였다:

| 계층 | 역할 | 입력 → 출력 |
|------|------|-----------|
| **TextFlow** | 문단 내 줄바꿈 | Paragraph → FlowLine[] |
| **BlockFlow** | 블록 수직 배치 | FlowResult[] → BlockLayout[] |
| **PageFlow** | 페이지 분할 | BlockLayout[] → PageContent[] |

**핵심 설계 결정**:
- TextFlow는 기존 `reflow_line_segs()` + `compose_paragraph()`를 WASM 호출로 재사용
- BlockFlow는 줄 수 변경 시에만 트리거 (변경 없으면 스킵)
- PageFlow는 증분 페이지네이션으로, **안정 페이지(Stable Page) 감지**로 전파 차단

**HWP 특수 케이스 7가지 처리 방안 정의**:
- 제어 문자, 탭, 강제 줄바꿈, 한글 조합, 들여쓰기/내어쓰기, 플로팅 도형

### 2. 증분 레이아웃 엔진 설계 (Section 4)

**성능 목표**: 16ms 이내 편집 응답 (60fps)

**4단계 Dirty 전파 전략 수립**:
```
Paragraph Dirty → Block Dirty → Page Dirty → Render Dirty
```

**영향 범위 최적화**:
- TextFlow: 항상 O(1) — 편집된 문단 1개만
- BlockFlow: 줄 수 변경 시만 발동, 높이 변화량 0 지점에서 중단
- PageFlow: 안정 페이지 감지로 평균 1~3 페이지에서 수렴

**레이아웃 캐시 4계층 구조 설계**:
- paragraphFlows → blockLayouts → pageLayouts → renderTrees

**성능 예산 분석**: 전체 파이프라인 ~12ms (16ms 예산 내)

### 3. 연속 스크롤 캔버스 뷰 설계 (Section 5)

**가상 스크롤 아키텍처**:
- 기존 RenderScheduler의 `page_offsets` 메커니즘 재활용
- Canvas 풀링으로 메모리 효율 확보 (뷰포트 내 3~5 Canvas만 유지)

**3단계 좌표 시스템**:
- 문서 좌표 (Document) — 스크롤 위치, 페이지 간 연속 좌표
- 페이지 좌표 (Page) — 렌더 트리, WASM API
- 뷰포트 좌표 (Viewport) — 마우스 이벤트, 캐럿

**추가 설계**: 줌 처리, 캐럿 자동 스크롤, 페이지 그림자/테두리 렌더링

## 산출물

| 문서 | 경로 | 내용 |
|------|------|------|
| 설계서 Section 3 | `mydocs/plans/task_44_architecture.md` §3 | 플로우 엔진 (TextFlow/BlockFlow/PageFlow) |
| 설계서 Section 4 | `mydocs/plans/task_44_architecture.md` §4 | 증분 레이아웃 엔진 (dirty flag, 영향 범위, 캐시) |
| 설계서 Section 5 | `mydocs/plans/task_44_architecture.md` §5 | 연속 스크롤 캔버스 뷰 (가상 스크롤, 좌표 체계) |

## 다음 단계

단계 3: 커서/선택/입력 시스템 설계
- CursorContext 상태 머신 (5가지 컨텍스트)
- 커서 이동 28+ 타입 설계
- 히트 테스팅 알고리즘
- 선택 모델 (범위/셀 블록)
- IME 한글 조합 처리
