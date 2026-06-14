# rhwp 코어 엔진 CQRS 분석 및 리팩토링 제안

> **대상**: rhwp 코어 엔진 (`wasm_api.rs`) + MCP 서버 Tool API 설계  
> **관점**: CQRS (Command Query Responsibility Segregation)  
> **작성일**: 2026-02-22  
> **선행 리뷰**: [2차 코드리뷰 보고서](r-code-review-2nd.md) (종합 5.4/10)  

---

## 1. CQRS란, 왜 rhwp에 필요한가

CQRS는 **상태를 변경하는 연산(Command)**과 **상태를 조회하는 연산(Query)**의 책임을 분리하는 아키텍처 패턴이다.

rhwp에 CQRS가 필요한 이유는 **MCP 서버의 Tool 기반 API** 때문이다:

```
AI Agent가 MCP Tool을 호출하는 실제 시나리오:

1. read_hwp("template.hwp")                    ← Query
2. get_table_data(section=0, table=0)           ← Query  (1과 병렬 가능)
3. get_table_data(section=0, table=1)           ← Query  (1, 2와 병렬 가능)
4. modify_cell(table=0, row=1, col=2, "500만")  ← Command (순차 필요)
5. modify_cell(table=0, row=2, col=2, "300만")  ← Command (순차 필요)
6. modify_cell(table=1, row=0, col=3, "합계")   ← Command (순차 필요)
7. export_hwp("output.hwp")                     ← Query
```

- **Step 2~3**: 독립적인 Query → 병렬 실행 가능해야 함
- **Step 4~6**: 연속 Command → 매번 paginate할 필요 없음 (Step 7에서 한 번만)
- 현재 구조에서는 **둘 다 불가능**

---

## 2. 현재 코드베이스의 Command/Query 분포

### 정량 분석

| 유형 | 메서드 수 | `self` 시그니처 | 네이밍 패턴 |
|---|---|---|---|
| **Command** | **75개** | `&mut self` | `insert_*`, `delete_*`, `set_*`, `merge_*`, `split_*`, `paste_*`, `apply_*` |
| **Query** | **83개** | `&self` | `get_*`, `render_*`, `export_*`, `has_*`, `is_*`, `page_count` |
| **합계** | **158개** | — | — |

> **긍정적 발견**: Rust의 `&self` vs `&mut self` 덕분에 Command/Query가 **컴파일러 수준에서 이미 구분**되어 있다. CQRS 적용의 진입 장벽이 낮다.

### 핵심 문제: Command 후처리의 동기적 결합

모든 Command 메서드가 아래 패턴을 반복한다:

```rust
pub fn insert_text_native(&mut self, ...) -> Result<String, HwpError> {
    // ① 비즈니스 로직 (Command 핵심)
    paragraph.insert_text(offset, text);

    // ② 캐시 무효화 — 55회 반복
    self.sections[section_idx].raw_stream = None;

    // ③ 전체 재페이지네이션 — 45회 반복
    self.paginate();

    // ④ JSON 결과 반환
    Ok(format!("{{\"ok\":true,\"para_idx\":{},\"offset\":{}}}", para_idx, new_offset))
}
```

| 반복 패턴 | 출현 횟수 | 문제 |
|---|---|---|
| `self.sections[idx].raw_stream = None` | **55회** | 수동 캐시 무효화, 누락 시 사일런트 버그 |
| `self.paginate()` | **45회** | 전체 문서 재배치, 연속 편집 시 불필요한 반복 |
| `Ok(format!("{{\"ok\":true...}}")` | **39회** | 수동 JSON 생성, 구조적 보장 없음 |

**영향**: 위 MCP 시나리오에서 Step 4~6의 3회 연속 Command가 `paginate()`를 **3번** 호출한다. 실제로 필요한 것은 Step 7 직전의 **1번**뿐이다.

---

## 3. CQRS 적용 전략: 3단계

### Stage 1: Lazy Pagination (즉시 적용 가능) ⭐ 권장

> 난이도: ⭐ 낮음 | 기간: 1~2일 | API 변경: 없음

**핵심 아이디어**: Command에서 paginate를 호출하지 않고, Query 시점에 필요하면 재구축한다.

```rust
// ──── 변경 전 ─────────────────────────────────────
pub fn insert_text_native(&mut self, ...) {
    paragraph.insert_text(offset, text);
    self.sections[idx].raw_stream = None;   // 55회 반복
    self.paginate();                         // 45회 반복
    Ok(...)
}

// ──── 변경 후 ─────────────────────────────────────
pub fn insert_text_native(&mut self, ...) {
    paragraph.insert_text(offset, text);
    self.mark_dirty(section_idx);   // 통합 무효화 (1줄)
    Ok(...)                          // paginate 하지 않음
}

// mark_dirty: raw_stream 초기화 + dirty flag 설정
fn mark_dirty(&mut self, section_idx: usize) {
    self.sections[section_idx].raw_stream = None;
    self.needs_paginate = true;
}

// Query 시점에 지연 실행
fn ensure_paginated(&mut self) {
    if self.needs_paginate {
        self.paginate();
        self.needs_paginate = false;
    }
}

// 모든 Query 메서드의 진입점에 호출
pub fn render_page_svg(&mut self, page_num: u32) -> ... {
    self.ensure_paginated();
    // 렌더링 진행...
}
```

**효과**:

| 시나리오 | 변경 전 | 변경 후 |
|---|---|---|
| 텍스트 1회 삽입 + 렌더링 | paginate 1회 | paginate 1회 (동일) |
| 텍스트 10회 연속 삽입 + 렌더링 | paginate **10회** | paginate **1회** |
| 표 셀 50개 일괄 수정 + 저장 | paginate **50회** | paginate **1회** |
| AI Agent 일괄 편집 (MCP) | paginate **N회** | paginate **1회** |

> ⚠️ **주의**: 현재 `&self`인 Query 메서드 시그니처를 `&mut self`로 변경하거나, `Cell<bool>` / `RefCell`로 내부 가변성을 도입해야 한다. WASM 환경에서는 단일 스레드이므로 `Cell<bool>`이 적합.

### Stage 2: Command/Query 구조적 분리 (P1 리팩토링과 병행)

> 난이도: ⭐⭐ 중간 | 기간: 3~5일 | API 변경: 내부만

```rust
// 현재: 하나의 impl 블록에 Command와 Query 혼재
impl HwpDocument {
    // 75개 Command 메서드
    // 83개 Query 메서드
    // 모두 같은 struct에 접근
}

// 변경 후: 역할별 분리
// commands/text_editing.rs
impl HwpDocument {
    pub fn insert_text_native(&mut self, ...) { ... }
    pub fn delete_text_native(&mut self, ...) { ... }
}

// queries/rendering.rs
impl HwpDocument {
    pub fn render_page_svg(&self, ...) { ... }
    pub fn get_page_info(&self, ...) { ... }
}

// queries/document_info.rs
impl HwpDocument {
    pub fn get_paragraph_count(&self, ...) { ... }
    pub fn get_text_range(&self, ...) { ... }
}
```

**이것은 2차 코드리뷰에서 제안한 "wasm_api.rs 역할별 모듈 분할"(P1-4)과 정확히 일치한다.** CQRS 관점에서 분할 기준을 Command/Query로 잡으면, 자연스럽게 SRP 개선과 CQRS 적용이 동시에 달성된다.

| 모듈 | CQRS 역할 | 현재 메서드 수 |
|---|---|---|
| `commands/text_editing.rs` | Command | ~15 |
| `commands/table_editing.rs` | Command | ~20 |
| `commands/formatting.rs` | Command | ~15 |
| `commands/clipboard.rs` | Command | ~10 |
| `commands/document_setup.rs` | Command | ~15 |
| `queries/rendering.rs` | Query | ~10 |
| `queries/document_info.rs` | Query | ~30 |
| `queries/cursor.rs` | Query | ~15 |
| `queries/export.rs` | Query | ~8 |

### Stage 3: Event Sourcing + Read Model (장기, MCP 서버 최적화)

> 난이도: ⭐⭐⭐ 높음 | 기간: 2~3주 | API 변경: MCP Tool 설계에 반영

```
                    MCP Server
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   Command Tool   Command Tool   Query Tool
   (modify_cell)  (insert_text)  (render_page)
         │             │             │
         ▼             ▼             │
   ┌─────────────────────────┐      │
   │   Command Handler       │      │
   │   → Document Model 변경 │      │
   │   → Event 발행          │      │
   └───────────┬─────────────┘      │
               │ DocumentChanged     │
               ▼                     │
   ┌─────────────────────────┐      │
   │  Projection Builder      │      │
   │  (paginate + layout)     │──────┘
   │  → PagedDocument 구축    │  Query는 여기서 읽음
   └──────────────────────────┘
```

**이 단계에서 얻는 것**:
- Command 실패 시 **롤백** 가능 (Event 기반 복원)
- 증분 페이지네이션 (변경된 섹션만 재계산)
- 편집 이력 (Undo/Redo) 자연스러운 구현
- MCP Query Tool의 **완전한 병렬 실행**

---

## 4. MCP Tool API 설계에 대한 CQRS 가이드라인

MCP 서버의 Tool을 설계할 때, 다음 규칙을 적용한다:

### Rule 1: Tool을 Command와 Query로 명시 분류

```yaml
# rhwp MCP 서버 Tool 정의
tools:
  # ── Query Tools (상태 변경 없음, 병렬 호출 가능) ──
  - name: read_hwp
    type: query
    description: "HWP 파일을 파싱하여 구조 정보 반환"

  - name: get_table_data
    type: query
    description: "특정 표의 데이터를 JSON으로 반환"

  - name: render_page
    type: query
    description: "특정 페이지를 SVG/PNG로 렌더링"

  - name: export_hwp
    type: query
    description: "현재 문서를 HWP 바이너리로 내보내기"

  # ── Command Tools (상태 변경, 순차 실행) ──
  - name: modify_cell
    type: command
    description: "표 셀의 텍스트를 변경"

  - name: insert_paragraph
    type: command
    description: "문단을 삽입"

  - name: apply_template
    type: command
    description: "템플릿에 데이터를 채워넣기"

  # ── Batch Command (여러 Command를 원자적으로 실행) ──
  - name: batch_modify
    type: command
    description: "여러 수정을 하나의 트랜잭션으로 실행"
```

### Rule 2: Batch Command 지원

AI Agent의 전형적 사용 패턴은 **"여러 셀을 한 번에 채우기"**이다. 단일 Command만 제공하면 N번의 Tool 호출이 필요하고, 현재 구조에서는 N번의 paginate가 발생한다.

```
// AS-IS: AI Agent가 N번 호출
modify_cell(table=0, row=0, col=1, "500만")  → paginate
modify_cell(table=0, row=1, col=1, "300만")  → paginate
modify_cell(table=0, row=2, col=1, "200만")  → paginate

// TO-BE: 1번의 Batch 호출
batch_modify([
  {action: "modify_cell", table: 0, row: 0, col: 1, value: "500만"},
  {action: "modify_cell", table: 0, row: 1, col: 1, value: "300만"},
  {action: "modify_cell", table: 0, row: 2, col: 1, value: "200만"},
])  → paginate 1회
```

### Rule 3: Command는 Event를 반환, 부수효과는 분리

```rust
// Command Tool의 반환 값
{
  "status": "ok",
  "events": [
    {"type": "cell_modified", "table": 0, "row": 0, "col": 1},
    {"type": "cell_modified", "table": 0, "row": 1, "col": 1}
  ],
  "needs_repaginate": true  // 클라이언트가 판단 가능
}
```

---

## 5. 리팩토링 우선순위와 일정

| 단계 | 작업 | 일정 | 선행 조건 |
|---|---|---|---|
| **Stage 1** | Lazy Pagination (`mark_dirty` + `ensure_paginated`) | **1~2일** | 없음 (즉시 가능) |
| **Stage 2** | Command/Query 파일 분리 (wasm_api.rs 분할과 통합) | **3~5일** | P0 Quick Win |
| **Stage 3** | Event Sourcing + Batch Command (MCP 서버와 동시 설계) | **2~3주** | Stage 2, MCP 프로토콜 확정 |

### Stage 1의 예상 코드 변경량

| 변경 | 줄 수 |
|---|---|
| `HwpDocument`에 `needs_paginate: bool` 필드 추가 | +1 |
| `mark_dirty()` 헬퍼 함수 추가 | +5 |
| `ensure_paginated()` 헬퍼 함수 추가 | +6 |
| 45개 `self.paginate()` 호출 제거 | -45 |
| 55개 `raw_stream = None` → `self.mark_dirty()` 치환 | ±0 |
| Query 메서드 진입점에 `ensure_paginated()` 추가 | +20 |
| **순 변경** | **약 -13줄** (코드량 감소) |

---

## 6. 결론

| 관점 | 현재 상태 | 제안 |
|---|---|---|
| **구조** | Command/Query 혼재 (God Object) | Stage 2에서 파일 분리 |
| **성능** | 매 Command마다 전체 paginate | **Stage 1 즉시 적용** |
| **MCP 설계** | 미정 | Tool을 C/Q로 명시 분류 + Batch 지원 |
| **확장성** | 새 Tool 추가 시 wasm_api.rs 직접 수정 | Hexagonal + CQRS로 어댑터 분리 |

**핵심 권고**: Stage 1(Lazy Pagination)은 **코드 변경량이 최소(-13줄)이면서 성능 개선 효과가 가장 큰** 작업이다. P0 Quick Win과 함께 즉시 착수를 권고한다.

> *"AI Agent는 문서를 한 글자씩 편집하지 않는다. 50개 셀을 한 번에 채운다. 그때 paginate는 1번이면 된다."*
