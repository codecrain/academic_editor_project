# 타스크 57: Dynamic Reflow 피드백 수용 전략 수립

## 1. 개요

외부 피드백(`mydocs/feedback/dynamic_reflow.md`)에서 제안된 4가지 고급 아키텍처를 현재 기술스택 기준으로 분석하고, 수용/워크어라운드/보류 전략을 수립한다.

## 2. 현재 기술스택 요약

| 영역 | 현재 구현 | 핵심 특성 |
|------|-----------|-----------|
| **문서 모델** | Rust `Document` 구조체 (mutable tree) | `Vec<Section>` → `Vec<Paragraph>` → `String text` + `Vec<LineSeg>` + `Vec<CharShapeRef>` |
| **텍스트 레이아웃** | HWP 파일의 `LineSeg` 사전 계산값 사용 | 동적 줄바꿈 미구현. 편집 후 LineSeg 갱신 없음 |
| **상태 관리** | Rust: 현재 상태만 보관 (직접 변이) / TS: CommandHistory (Undo/Redo) | 불변 구조 아님. 히스토리는 TypeScript 측에서 관리 |
| **IME 처리** | Hidden textarea + compositionstart/end 이벤트 | WASM 직접 호출로 조합 텍스트 삽입/삭제. 실시간 렌더링 구현됨 |
| **렌더링 파이프라인** | Composer → Pagination (2-pass) → Layout → Canvas/SVG | 3단계 파이프라인. layout.rs 5017줄이 핵심 |
| **WASM API** | 편집/커서/선택/이동 등 ~30개 API | 편집 시 자동 recompose + repaginate 트리거 |

## 3. 피드백 제안별 분석

### 제안 1: Knuth-Plass 알고리즘 (텍스트 레이아웃)

**피드백 핵심:** DAG 기반 최적 줄바꿈, SIMD 병렬 계산, CJK 금칙 처리

**현재 상태:**
- `LineSeg`(HWP 파일에서 파싱)에 의존하여 줄바꿈 위치 결정
- 편집 후 `LineSeg` 재계산 없음 → **편집 시 텍스트 넘침/부족 발생** (핵심 문제)
- `composer.rs`가 줄 단위 TextRun 생성, `layout.rs`가 위치 계산

**수용 판단: 부분 수용 (워크어라운드)**

| 항목 | 판단 | 근거 |
|------|------|------|
| Knuth-Plass 풀 구현 | **보류** | 문단 전체 DAG 최적화는 과도. HWP 호환성이 우선이며, HWP 자체가 Greedy 알고리즘 사용 |
| Greedy 줄바꿈 엔진 | **수용** | HWP와 동일한 Greedy 방식으로 `LineSeg` 동적 재계산 필수. 이것이 편집 기능의 핵심 |
| CJK 금칙 처리 | **수용** | 한글/한자 줄바꿈 규칙(Kinsoku) 필수. 기존 HWP 금칙 테이블 활용 |
| SIMD 병렬 계산 | **보류** | WASM SIMD는 브라우저 지원 불안정. 단일 문단 계산은 충분히 빠름 |

**워크어라운드 전략:**
- Knuth-Plass 대신 **Greedy Line-Break 엔진** 구현 (HWP 호환)
- `LineSeg`를 파일 읽기 전용으로 유지하되, 편집 시 **동적 `LineSeg` 재생성** 함수 추가
- `composer.rs`에 `reflow_paragraph()` 함수 신규 구현
- 글자 폭 측정은 기존 `measureTextWidth` WASM 콜백 활용

### 제안 2: 영속적 데이터 구조 (Persistent Data Structures)

**피드백 핵심:** 불변 트리 + 구조적 공유, Arc 기반 동시성, 무한 Undo

**현재 상태:**
- Rust `Document`는 **직접 변이** (`&mut self` 패턴)
- Undo/Redo는 TypeScript `CommandHistory`에서 역연산 기반으로 처리
- 문단 텍스트는 `String` (복사 비용 低), 스타일은 글로벌 테이블 참조 ID

**수용 판단: 보류 (현재 아키텍처 유지)**

| 항목 | 판단 | 근거 |
|------|------|------|
| 불변 문서 트리 | **보류** | 기존 HWP 파싱/직렬화 전체 재설계 필요. ROI 낮음 |
| 구조적 공유 (B-Tree/RRB-Tree) | **보류** | 현재 `Vec<Paragraph>` 구조가 HWP 포맷과 1:1 대응. 변환 비용 과대 |
| Arc 기반 동시성 | **보류** | WASM은 단일 스레드. Web Worker 분리 시에도 SharedArrayBuffer 제한 |
| 무한 Undo | **워크어라운드** | 현재 CommandHistory 방식으로 충분. 메모리 상한만 추가 |

**워크어라운드 전략:**
- 현재 **역연산 기반 Undo** 유지 (InsertText ↔ DeleteText 쌍)
- CommandHistory에 **메모리 상한** (예: 100개) 및 **스냅샷 체크포인트** 추가
- 향후 협업 편집(OT/CRDT) 필요 시 재검토

### 제안 3: 가상 입력 & IME 레이어

**피드백 핵심:** OS IME 이벤트 가로채기, 조합 문자열 임시 엔티티, 실시간 가변 플로우

**현재 상태:**
- Hidden textarea로 IME 이벤트 수신 (**이미 구현**)
- `compositionstart` → 앵커 저장, `input` → WASM 직접 삽입/삭제, `compositionend` → 히스토리 기록
- 조합 중 텍스트가 **문서에 직접 삽입됨** (임시 엔티티 아님)
- 조합 중 **reflow 미발생** (줄 넘김 처리 없음)

**수용 판단: 부분 수용**

| 항목 | 판단 | 근거 |
|------|------|------|
| Hidden textarea IME | **이미 구현** | compositionstart/end/input 이벤트 체인 완성 |
| 조합 문자열 임시 엔티티 | **보류** | 현재 직접 삽입 방식이 실용적. 임시 엔티티는 오버엔지니어링 |
| 실시간 가변 플로우 | **수용** | 제안 1의 Greedy 줄바꿈과 연동. 조합 중에도 reflow 트리거 필요 |
| 글리프 너비 피드백 | **이미 구현** | `measureTextWidth` WASM 콜백으로 Canvas 기반 측정 |

**워크어라운드 전략:**
- 조합 중 텍스트는 현재처럼 **문서에 직접 삽입** 유지
- 제안 1의 Greedy 줄바꿈이 구현되면, IME `input` 이벤트마다 **해당 문단만 reflow** 트리거
- 페이지 경계 넘침 시 pagination 재계산 (기존 2-pass 파이프라인 활용)

### 제안 4: ECS 아키텍처

**피드백 핵심:** 게임 엔진식 Entity-Component-System, 4레이어 분리

**현재 상태:**
- **Data Layer**: `model/` 모듈 (Document, Paragraph, Style 등)
- **Logic Layer**: `renderer/` 모듈 (composer, pagination, layout)
- **Render Layer**: `renderer/canvas.rs`, `web_canvas.rs`, `svg.rs`
- **Platform Layer**: `wasm_api.rs` + TypeScript 브라우저 코드

**수용 판단: 보류 (현재 레이어 구조 유지)**

| 항목 | 판단 | 근거 |
|------|------|------|
| ECS 패턴 도입 | **보류** | 워드프로세서는 게임과 다름. 문서 트리 구조가 자연스러움 |
| Rayon 병렬화 | **보류** | WASM은 단일 스레드. `wasm32-unknown-unknown` 타겟에서 Rayon 불가 |
| ThorVG + rustybuzz | **보류** | 현재 Canvas 2D API가 충분. 벡터 라이브러리 추가는 WASM 크기 증가 |
| 4레이어 분리 | **이미 유사 구현** | model/renderer/serializer/wasm_api 구조가 사실상 4레이어 |

**워크어라운드 전략:**
- 현재 모듈 구조 유지 (`model/` → `renderer/` → `wasm_api.rs`)
- 향후 네이티브 앱 확장 시 SDL2/Vulkan 백엔드 레이어만 추가

## 4. 긴급 발견: 콘텐츠 페이지 경계 분할 미구현

### 현상

문단이 페이지 경계를 넘으면 **문단 전체가 다음 페이지로 이동**한다. 페이지 하단에 빈 공간이 발생하고, 워드프로세서의 기본 기대인 "편집영역 끝까지 채운 후 다음 페이지로 부드럽게 이어지는" 동작이 되지 않는다.

### HWP 원본 동작 원칙

- 문단이든 표든 **편집영역(본문 영역) 끝까지 채운 후** 나머지가 다음 페이지로 이어짐
- 문단: **줄 단위**로 페이지 경계에서 분할
- 표: **행 단위**로 페이지 경계에서 분할
- 페이지를 강제로 넘기는 것은 **오직 `ColumnBreakType::Page` 쪽 나누기 컨트롤**이 있을 때만

### 원인 분석 (`pagination.rs`)

1. **`PageItem::PartialParagraph`가 정의만 되어 있고 사용되지 않음**
   - `PartialParagraph { para_index, start_line, end_line }` — 줄 단위 분할 구조체는 존재
   - 하지만 pagination 루프에서 **한 번도 생성되지 않음**

2. **문단을 원자 단위로 취급**
   ```rust
   // line 243: 문단이 남은 높이 초과 시 → 통째로 다음 페이지
   if current_height + para_height > available_height && !current_items.is_empty() {
       // 새 페이지 시작 (문단 분할 없음!)
   }
   // line 311-316: 항상 FullParagraph
   current_items.push(PageItem::FullParagraph { para_index: para_idx });
   ```

3. **표는 행 단위 분할 구현됨** (`PartialTable`, line 374-539) — 문단만 누락

### 필요한 수정

표의 `PartialTable` 행 분할과 동일한 패턴으로 **문단의 줄 단위 분할** 구현:

1. **pagination.rs**: 문단이 페이지를 초과할 때, `LineSeg` 배열을 순회하며 줄 높이를 누적
   - 현재 페이지에 들어가는 줄까지 → `PartialParagraph { start_line: 0, end_line: N }`
   - 나머지 줄 → 다음 페이지의 `PartialParagraph { start_line: N, end_line: total }`
   - 다음 페이지에서도 넘치면 3페이지 이상 분할 (while 루프)

2. **layout.rs**: `PartialParagraph`의 `start_line..end_line` 범위만 렌더링하도록 처리

3. **height_measurer.rs**: 줄별 높이 정보를 `MeasuredSection`에 포함

이것은 Greedy 줄바꿈 엔진과 **독립적으로 먼저 구현 가능**하며, 기존 `LineSeg` 기반으로도 동작한다.

## 5. 종합 수용 전략 매트릭스

| 제안 | 판단 | 우선순위 | 핵심 액션 |
|------|------|----------|-----------|
| **문단 페이지 분할** | **즉시 수용** | **긴급** | `PartialParagraph` 줄 단위 분할 구현 (기존 LineSeg 기반) |
| **1. Knuth-Plass** | Greedy 줄바꿈으로 대체 수용 | **최우선** | `reflow_paragraph()` 동적 줄바꿈 엔진 구현 |
| **2. 영속적 DS** | 보류 (현행 유지) | 낮음 | CommandHistory 메모리 상한 추가만 |
| **3. IME 레이어** | 부분 수용 (reflow 연동) | 높음 | 조합 중 reflow 트리거 추가 |
| **4. ECS** | 보류 (현행 유사) | 없음 | 현재 구조 유지 |

**결론:** 가장 시급한 것은 **문단 줄 단위 페이지 분할**(PartialParagraph 활성화)이다. 현재 문단이 안 맞으면 통째로 다음 페이지로 넘기는 동작은 HWP 원본과 다르다. HWP에서는 편집영역 끝까지 채운 후 나머지만 다음 페이지로 이어지며, 강제 페이지 넘김은 쪽 나누기 컨트롤(`ColumnBreakType::Page`)이 있을 때만 발생한다. 이후 Greedy 줄바꿈 엔진을 구현하면 편집 시 동적 reflow까지 완성된다. 제안 2와 4는 현재 아키텍처가 이미 실용적 수준이므로 보류한다.

## 5. 수행 방법

이 타스크는 **전략 수립 문서** 산출물이며, 코드 구현은 포함하지 않는다.

1. 피드백 문서 분석 + 현재 기술스택 대조
2. 제안별 수용/보류/워크어라운드 판단
3. 전략 문서 작성 (`mydocs/plans/task_57.md` — 본 문서)
4. 승인 후 오늘할일 갱신 + 커밋

## 7. 후속 타스크 제언 (우선순위 순)

| 후속 타스크 | 내용 | 우선순위 |
|-------------|------|----------|
| **문단 페이지 분할** | `pagination.rs`에 `PartialParagraph` 줄 단위 분할 로직 구현 + `layout.rs` 렌더링 대응 | **긴급** |
| **Greedy 줄바꿈 엔진** | `composer.rs`에 `reflow_paragraph()` 구현. `LineSeg` 동적 재생성 | 최우선 |
| **편집 시 Reflow 통합** | insertText/deleteText 후 자동 reflow + repaginate 파이프라인 | 최우선 |
| **IME 조합 중 Reflow** | composition input 시 해당 문단 reflow 트리거 | 높음 |
| **CommandHistory 메모리 상한** | Undo 스택 100개 제한 + 스냅샷 체크포인트 | 낮음 |
