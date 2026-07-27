# DOCX/HWPX 에디터 완성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DOCX/HWPX 형식 런타임을 공용 서버에서 분리하고, HWPX 잔여 5개 기능·실제 질문 기반 100건 평가·브라우저 저장 재열기·현재 문서를 하나의 검증된 제품 계약으로 완성한다.

**Architecture:** `editor_server`가 REST/MCP/WOPI와 세션 안전 계약만 소유하고 DOCX/HWPX adapter를 주입받는다. HWPX는 vendored RHWP source-built WASM을 canonical runtime으로 사용하며, 평가기는 실제 attachment extractor와 `gpt-5.4-nano` planner를 거쳐 REST/MCP를 실행하고 hidden gold로 채점한다.

**Tech Stack:** Node.js ESM, node:test, TypeScript, Playwright, RHWP Rust/WASM, ZIP/XML, Docker, REST, MCP, OpenAI Responses API

## Global Constraints

- 기존 `main`과 사용자가 만든 관련 없는 변경을 보존한다.
- 모든 production behavior는 실패하는 real-behavior test를 먼저 확인한다.
- OpenAI 모델은 `gpt-5.4-nano`만 사용하고 문항당 1회, 총 100회, retry 0회로 고정한다.
- 모델 입력에 `oracle`, gold, expected target text와 command template를 포함하지 않는다.
- DOCX/HWPX는 편집 엔진·저장·렌더러를 공유하지 않고 `editor_server` 전송 계층만 공유한다.
- 테스트가 시작한 gateway, browser, container와 child process만 `finally`에서 종료한다.
- HWPX 기능은 save/reopen postcondition과 package preservation을 통과해야 `available`로 승격한다.
- 테스트 결과, 다운로드, PDF, cache와 API response 원문은 커밋하지 않는다.

---

### Task 1: 공용 MCP schema factory 완성

**Files:**
- Modify: `editor_common/editor-mcp-tool-factory.mjs`
- Modify: `editor_docx/scripts/editor-mcp.mjs`
- Modify: `editor_docx/scripts/editor-mcp.test.mjs`

**Interfaces:**
- Consumes: `createEditorMcpTools({ format, prefix, commandOps, descriptions })`
- Produces: factory가 생성한 `DOCX_MCP_TOOLS`, `HWPX_MCP_TOOLS`

- [ ] **Step 1: Write the failing schema ownership test**

`editor-mcp.test.mjs`에 DOCX/HWPX 16개 suffix와 property schema가 동일하고
양쪽 모두 factory metadata `schemaFactory=editor-common-v1`를 갖는
real tool-list assertion을 추가한다.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test editor_docx/scripts/editor-mcp.test.mjs`
Expected: DOCX tool에 `schemaFactory`가 없어 FAIL.

- [ ] **Step 3: Replace manual DOCX schema definitions**

`DOCX_MCP_TOOLS`를 `createEditorMcpTools()` 호출로 만들고 description과
DOCX command enum만 주입한다. HWPX와 공통 schema를 복제하지 않는다.

- [ ] **Step 4: Run focused and runtime tests**

Run: `node --test editor_docx/scripts/editor-mcp.test.mjs`
Run: `npm.cmd run test:runtime`
Expected: all PASS.

- [ ] **Step 5: Commit**

`git commit -m "refactor: DOCX HWPX MCP 스키마 생성 통일"`

---

### Task 2: 공용 서버를 `editor_server`로 승격

**Files:**
- Create: `editor_server/editor-gateway.mjs`
- Create: `editor_server/editor-mcp.mjs`
- Create: `editor_server/format-adapters/docx-adapter.mjs`
- Create: `editor_server/format-adapters/hwpx-adapter.mjs`
- Modify: `editor_docx/scripts/editor-gateway.mjs`
- Modify: `editor_docx/scripts/editor-mcp.mjs`
- Modify: `editor_docx/scripts/editor-gateway.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `createFormatAdapter()` objects keyed by `docx` and `hwpx`
- Compatibility: old DOCX paths re-export canonical server symbols and retain CLI main

- [ ] **Step 1: Write failing boundary tests**

Gateway test imports canonical `editor_server/editor-gateway.mjs`, starts it with
both real adapters, lists 32 MCP tools, opens both fixtures and proves cross-format
IDs return 404. A dependency test walks production imports and rejects
`editor_docx` → `editor_hwpx` and `editor_hwpx` → `editor_docx`.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test editor_docx/scripts/editor-gateway.test.mjs`
Expected: canonical server module is missing.

- [ ] **Step 3: Move implementation and add adapters**

Move gateway/MCP implementation to `editor_server`. Replace format conditionals
with adapter lookups. Keep old files as thin compatibility entrypoints.

- [ ] **Step 4: Verify entrypoints and boundaries**

Run: `node --test editor_docx/scripts/editor-gateway.test.mjs editor_docx/scripts/editor-mcp.test.mjs`
Run: `npm.cmd run test:runtime`
Expected: all PASS and direct cross-format production imports 0.

- [ ] **Step 5: Commit**

`git commit -m "refactor: 공용 에디터 서버 경계 분리"`

---

### Task 3: REST revision·inspection·quality hard gate

**Files:**
- Modify: `editor_server/editor-gateway.mjs`
- Modify: `editor_docx/scripts/editor-gateway.test.mjs`
- Modify: `evaluation/hwpx-public-sector-v1/scripts/run-api-evaluation.mjs`
- Modify: `API.md`

**Interfaces:**
- Produces: `assertMutationPreconditions(record, action, body, commands)`
- Error codes: `stale_revision`, `inspection_required`,
  `object_inventory_required`, `quality_check_required`

- [ ] **Step 1: Write failing REST parity tests**

양 형식에서 stale apply, uninspected target, missing inventory, save before
quality를 거부하고 bytes/revision이 변하지 않는 테스트를 추가한다.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test editor_docx/scripts/editor-gateway.test.mjs`
Expected: 현재 REST가 baseRevision 없이 apply/save하여 FAIL.

- [ ] **Step 3: Implement shared precondition state**

Record별 inspected target keys, inventory revision, quality revision을 저장한다.
Apply 성공 시 세 cache를 폐기한다. REST와 MCP가 같은 helper를 호출한다.

- [ ] **Step 4: Update every production caller**

평가기와 examples가 current `baseRevision`을 보내고 apply 후 다시 quality를
실행하도록 갱신한다.

- [ ] **Step 5: Verify**

Run: `npm.cmd run test:runtime`
Run: `npm.cmd run test:hwpx-evaluation -- --limit 2`
Expected: all PASS.

- [ ] **Step 6: Commit**

`git commit -m "fix: REST 문서 revision과 검수 선행조건 강제"`

---

### Task 4: source-built HWPX runtime 동기화

**Files:**
- Modify: `editor_hwpx/scripts/hwpx-runtime-readiness.mjs`
- Modify: `editor_hwpx/scripts/hwpx-runtime-readiness.test.mjs`
- Modify: `editor_hwpx/scripts/ensure-studio.mjs`
- Modify: `editor_hwpx/package.json`
- Generated but tracked runtime: `editor_hwpx/pkg/*`

**Interfaces:**
- Produces: `buildHwpxRuntime()` and artifact manifest containing wrapper/WASM hashes
- Three runtime surfaces must have identical hashes

- [ ] **Step 1: Write failing artifact parity test**

현재 repo source에 존재하는 `setDocumentMetadata`, `createHeaderFooter`,
`insertFootnote` exports가 wrapper, declaration과 WASM surface에 모두 있고
세 runtime 위치 hash가 같은지 검사한다.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test editor_hwpx/scripts/hwpx-runtime-readiness.test.mjs`
Expected: metadata export 또는 surface hash mismatch로 FAIL.

- [ ] **Step 3: Build vendored RHWP WASM**

고정된 wasm-pack 명령으로 `editor_hwpx/pkg`를 빌드하고 ensure script가
atomic staging/swap으로 node_modules와 Studio에 materialize하게 한다.

- [ ] **Step 4: Verify runtime**

Run: `npm.cmd --prefix editor_hwpx run build`
Run: `node --test editor_hwpx/scripts/hwpx-runtime-readiness.test.mjs`
Expected: all PASS with identical hashes.

- [ ] **Step 5: Commit**

`git commit -m "build: HWPX 소스 빌드 런타임 동기화"`

---

### Task 5: HWPX 잔여 5개 명령 승격

**Files:**
- Modify: `editor_hwpx/src/serializer/hwpx/*`
- Modify: `editor_hwpx/src/wasm_api.rs`
- Modify: `editor_hwpx/scripts/hwpx-command-catalog.mjs`
- Modify: `editor_hwpx/scripts/hwpx-api-utils.mjs`
- Modify: `editor_hwpx/scripts/hwpx-api-utils.test.mjs`
- Modify: `editor_hwpx/scripts/hwpx-structural-commands.test.mjs`
- Add real fixtures under: `editor_hwpx/samples/api-fixtures/structural/`

**Interfaces:**
- Promotes: `table.insertCaption`, `setRunStyle`, `setDocumentMetadata`,
  `setHeaderFooter`, `insertFootnote`

- [ ] **Step 1: Add one failing save/reopen test per command**

각 테스트는 실제 command를 trial session에 적용하고 save/reopen 후 text,
style, metadata, control ID와 package inventory literal을 검사한다.

- [ ] **Step 2: Run tests to verify five RED failures**

Run: `npm.cmd run test:hwpx-api`
Expected: 각 command가 `readiness=unavailable` 또는 postcondition loss로 FAIL.

- [ ] **Step 3: Fix serializer root causes one command at a time**

각 command마다 Rust model mutation → HWPX serializer → WASM rebuild →
save/reopen test 순서로 진행한다. Node XML command implementation은 추가하지
않는다.

- [ ] **Step 4: Promote catalog only after postconditions pass**

다섯 entry의 readiness를 `available`로 바꾸고 runtime readiness requirements에
native methods를 포함한다.

- [ ] **Step 5: Verify public-sector preservation**

Run: `npm.cmd run test:hwpx-api`
Run: `npm.cmd run test:hwpx-evaluation -- --limit 5`
Expected: all PASS, unrequested binary identity preserved.

- [ ] **Step 6: Commit**

`git commit -m "feat: HWPX 잔여 구조 명령 실제 저장 승격"`

---

### Task 6: 실제 attachment extractor와 hidden-gold runner

**Files:**
- Create: `evaluation/editor-public-sector-v2/scripts/extract-evidence.mjs`
- Create: `evaluation/editor-public-sector-v2/scripts/agent-planner.mjs`
- Create: `evaluation/editor-public-sector-v2/scripts/run-evaluation.mjs`
- Create: `evaluation/editor-public-sector-v2/scripts/extract-evidence.test.mjs`
- Create: `evaluation/editor-public-sector-v2/scripts/agent-planner.test.mjs`
- Create: `evaluation/editor-public-sector-v2/schema/agent-plan.schema.json`
- Modify: dataset generator/manifest/scenarios/gold under `evaluation/editor-public-sector-v2/`

**Interfaces:**
- `extractEvidence(attachment) -> EvidenceItem[]`
- `buildPlannerInput(scenario, evidence, documentProjection, catalog) -> object`
- `assertNoOracleLeak(plannerInput)`

- [ ] **Step 1: Write failing extractor mutation tests**

XLSX cell, CSV row, PDF text, DOCX paragraph, HWPX table, HWP text와 image OCR
fixture를 실제로 변경했을 때 extracted evidence literal이 달라지는 테스트를
추가한다.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test evaluation/editor-public-sector-v2/scripts/extract-evidence.test.mjs`
Expected: extractor module missing.

- [ ] **Step 3: Implement bounded real extractors**

각 형식 parser는 source hash, locator, value, unit/asOf와 extraction method를
반환하고 byte/signature만 확인하는 경로를 금지한다.

- [ ] **Step 4: Write and verify hidden-gold RED test**

Planner input 직렬화에 `oracle`, `gold`, `expectedTargets`,
`commandTemplates`가 하나라도 있으면 실패하게 한다.

- [ ] **Step 5: Build 100 diverse scenarios**

편집 90·생성 10, attachment 조합 25+, command 조합 15+, template family
20+, DOCX/HWPX 비교 20+를 validator가 강제한다.

- [ ] **Step 6: Verify dataset**

Run: `node evaluation/editor-public-sector-v2/scripts/validate-dataset.mjs`
Expected: 100 scenarios and every diversity lower bound PASS.

- [ ] **Step 7: Commit**

`git commit -m "test: 실제 첨부 기반 100문항 평가체계 구축"`

---

### Task 7: `gpt-5.4-nano` 100회 실제 planner 평가

**Files:**
- Modify: `evaluation/editor-public-sector-v2/scripts/agent-planner.mjs`
- Modify: `evaluation/editor-public-sector-v2/scripts/run-evaluation.mjs`
- Ignore: `evaluation/editor-public-sector-v2/results/*`

**Interfaces:**
- Exactly one Responses API request per scenario
- JSON plan conforms to `agent-plan.schema.json`

- [ ] **Step 1: Write failing call-budget tests**

99/101 scenarios, retry attempt, fallback model과 oracle leak를 각각 거부하고
100개에서 exact call budget을 반환하는 fake transport test를 추가한다.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test evaluation/editor-public-sector-v2/scripts/agent-planner.test.mjs`
Expected: budget enforcement missing.

- [ ] **Step 3: Implement Responses API planner**

Model=`gpt-5.4-nano`, structured JSON, retry=0, scenario timeout과 secret-free
request/response metadata를 구현한다.

- [ ] **Step 4: Run 3-case live pilot**

Run: `node evaluation/editor-public-sector-v2/scripts/run-evaluation.mjs --limit 3 --model gpt-5.4-nano`
Expected: three model calls and complete REST/MCP traces.

- [ ] **Step 5: Run exact 100 live cases**

Run: `node evaluation/editor-public-sector-v2/scripts/run-evaluation.mjs --all --model gpt-5.4-nano --max-calls 100`
Expected: attempted=100, modelCalls=100, retries=0.

- [ ] **Step 6: Commit code and dataset only**

`git commit -m "feat: 실제 질문 기반 에디터 에이전트 평가 연결"`

---

### Task 8: HWPX 비차단 저장 modal과 브라우저 재열기

**Files:**
- Create: `editor_hwpx/rhwp-studio/src/ui/save-integrity-dialog.ts`
- Create: `editor_hwpx/rhwp-studio/tests/save-integrity-dialog.test.ts`
- Modify: `editor_hwpx/rhwp-studio/src/command/commands/file.ts`
- Modify: `editor_hwpx/rhwp-studio/e2e/api-artifact-acceptance.test.mjs`

**Interfaces:**
- `showSaveIntegrityDialog(error): Promise<void>`
- Dialog role=`dialog`, accessible close, no `window.alert`

- [ ] **Step 1: Write failing dialog and download tests**

Complex fixture save exposes loss counts in a nonblocking dialog and produces
no download. Safe fixture save produces one `.hwpx` download that reopens.

- [ ] **Step 2: Run test to verify RED**

Run: `npm.cmd --prefix editor_hwpx/rhwp-studio test -- save-integrity-dialog`
Expected: module missing/current alert behavior.

- [ ] **Step 3: Implement modal and replace save alert**

Save integrity errors use the product dialog. Other generic file errors remain
separate. Dialog dismissal never converts blocked save into success.

- [ ] **Step 4: Run real browser acceptance**

Run: `node editor_hwpx/scripts/hwpx-studio-acceptance.mjs`
Run: project DOCX browser smoke against isolated current gateway/runtime.
Expected: DOCX save/reopen, safe HWPX download/reopen, complex HWPX block PASS.

- [ ] **Step 5: Commit**

`git commit -m "fix: HWPX 브라우저 저장 검수와 재열기 완성"`

---

### Task 9: 오래된 문서 제거와 최종 계약

**Files:**
- Delete: `docs/superpowers/plans/2026-07-27-hwpx-docx-parity.md`
- Delete: `docs/superpowers/specs/2026-07-27-hwpx-docx-parity-design.md`
- Modify: `README.md`
- Modify: `API.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: `docs/HWPX_EDITOR.md`
- Modify: `docs/HWPX_MCP_API.md`
- Create: `editor_server/documentation-contract.test.mjs`

**Interfaces:**
- Current docs derive command/tool counts from executable catalogs
- Stale phrase gate covers deleted v2/250/17-command claims

- [ ] **Step 1: Write failing documentation contract test**

Current docs의 relative links, command/tool counts와 stale phrase를 검사한다.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test editor_server/documentation-contract.test.mjs`
Expected: historical v2/250/17-command files cause FAIL.

- [ ] **Step 3: Delete stale records and rewrite current docs**

용어와 entrypoint를 승인 설계의 canonical names로 통일하고 실제 검수
경계와 남은 제한만 기록한다.

- [ ] **Step 4: Run three documentation passes**

Run: `node --test editor_server/documentation-contract.test.mjs`
Run: `npm.cmd run verify:public`
Run: `rg -n "public-sector-v2|250개|17개 명령|HWPX PDF 미지원" README.md API.md docs evaluation`
Expected: tests PASS and stale search returns no current-contract match.

- [ ] **Step 5: Commit**

`git commit -m "docs: 에디터 현재 계약과 검수 문서 통합"`

---

### Task 10: 전체 실제 환경 검증과 main push

**Files:**
- No production changes unless a failing verification receives its own RED test

- [ ] **Step 1: Run full automated verification**

Run:

```powershell
npm.cmd run test:runtime
npm.cmd run test:docx-api
npm.cmd run test:hwpx-api
npm.cmd run test:uno-renderer
npm.cmd run verify:public
npm.cmd --prefix editor_hwpx/rhwp-studio run build
```

- [ ] **Step 2: Run full 100-case result verifier**

Verify result manifest says scenarios=100, modelCalls=100, retries=0, and every
failure contains a reproducible trace.

- [ ] **Step 3: Run actual browser verification**

Use isolated ports, capture visible DOCX and HWPX postconditions, close agent
tabs, and stop only owned listener/container PIDs.

- [ ] **Step 4: Verify repository and resources**

`git status --short`, `git diff --check`, listener/container ownership and
generated artifact exclusion must be clean.

- [ ] **Step 5: Final commit and push**

Push verified `main` to `origin/main` and report the exact commit and any
honest environment-limited evidence.
