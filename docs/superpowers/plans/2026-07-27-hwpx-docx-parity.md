# HWPX DOCX 동급화 Implementation Plan

> 역사적 실행 계획입니다. 최초의 250건/v2 제안과 테스트 우선 작업 항목을
> 보존하지만 현재 제품 계약은 아닙니다. 승인·구현된 평가 코퍼스는
> `evaluation/hwpx-public-sector-v1`의 100건(편집 90, 생성 10)입니다.
> 현재 동작은 `docs/DOCUMENTATION_INDEX.md`, `API.md`, 실행 가능한 카탈로그와
> 테스트만을 기준으로 판단합니다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HWPX 편집기의 구조 편집, REST/MCP, PDF, 문서화와 실제 한컴오피스 검수를 DOCX 제품 수준으로 승격한다.

**Architecture:** 기존 patch-safe 명령은 preserve-package 저장을 유지하고, 구조 명령은 RHWP trial document에서 실행한 candidate를 package qualification과 재열기 검증 후 원자적으로 commit한다. REST와 MCP는 하나의 canonical catalog를 사용하며, RHWP native PDF와 한컴오피스 2024 acceptance harness를 별도 경계로 둔다.

**Tech Stack:** Node.js ESM, `node:test`, RHWP Rust/WASM, ZIP/XML, Docker, PowerShell, 한컴오피스 2024 Automation, REST, MCP

## Global Constraints

- 기존 작업 트리의 관련 없는 변경을 수정·스테이징·삭제하지 않는다.
- 명령 이름만 추가하거나 일반 치환을 변경 내용 추적으로 위장하지 않는다.
- 모든 제품 코드 변경은 실패하는 테스트를 먼저 확인한다.
- 하나의 batch가 실패하면 원본 bytes, artifact와 revision을 변경하지 않는다.
- OpenAI API를 호출하지 않는다. 평가 질문과 정답은 결정론적 로컬 생성기로 만든다.
- 실행 중 시작한 gateway, Docker container, child process와 한컴 프로세스만 `finally`에서 종료한다.
- 대용량 입력, screenshot, PDF와 임시 결과는 `.qa` 아래에 두고 커밋하지 않는다.
- 지원 상태는 실제 REST/MCP, 프로젝트 편집기와 한컴오피스 검수를 통과한 뒤에만 문서화한다.
- 커밋 메시지는 `feat:`, `fix:`, `test:`, `docs:`, `chore:` 접두사와 한국어 본문을 사용한다.

---

## File Structure

### 새 파일

- `editor_hwpx/scripts/hwpx-structural-commands.mjs`: 공개 구조 명령을 RHWP 메서드로 변환하고 생성 target을 반환한다.
- `editor_hwpx/scripts/hwpx-structural-commands.test.mjs`: 구조 명령 adapter의 단위 계약을 검증한다.
- `editor_hwpx/scripts/hwpx-package-policy.mjs`: 저장 모드 분류, ZIP 보존 검사, 안전한 entry overlay를 담당한다.
- `editor_hwpx/scripts/hwpx-package-policy.test.mjs`: package qualification과 손실 거부 회귀를 검증한다.
- `editor_hwpx/scripts/hwpx-native-pdf.mjs`: 격리된 RHWP native CLI PDF 실행과 정리를 담당한다.
- `editor_hwpx/scripts/hwpx-native-pdf.test.mjs`: PDF runner의 성공, timeout, cleanup을 검증한다.
- `editor_hwpx/docker/pdf/Dockerfile`: RHWP native PDF CLI만 포함한 재현 가능한 multi-stage image를 만든다.
- `editor_hwpx/scripts/hwpx-tracked-change-probe.mjs`: 한컴 생성 HWPX의 변경 추적 package/XML 표현을 비교 분석한다.
- `editor_hwpx/scripts/hwpx-tracked-change-probe.test.mjs`: 변경 추적 판정 규칙을 fixture로 검증한다.
- `editor_hwpx/scripts/hancom/HwpxAcceptance.psm1`: 한컴오피스 열기, 재저장, PDF 출력과 프로세스 소유권 관리를 담당한다.
- `editor_hwpx/scripts/hancom/Invoke-HwpxAcceptance.ps1`: 단일/복수 사례 한컴 검수 CLI이다.
- `editor_hwpx/scripts/hancom/Invoke-HwpxTrackedChangeProbe.ps1`: 변경 추적 on/off, 수락/거절 fixture를 생성한다.
- `editor_hwpx/scripts/hancom/hwpx-acceptance.test.mjs`: PowerShell harness 계약과 dry-run을 검증한다.
- `editor_hwpx/rhwp-studio/e2e/api-artifact-acceptance.test.mjs`: API 산출물을 실제 Studio에 로드해 canvas와 화면 증거를 검증한다.
- `editor_hwpx/scripts/hwpx-studio-acceptance.mjs`: 격리된 Studio preview와 headless 검수 프로세스의 수명주기를 관리한다.
- `evaluation/hwpx-public-sector-v2/`: 250개 시나리오, manifest, gold, runner와 bounded 결과를 보관한다.

### 수정 파일

- `editor_hwpx/scripts/hwpx-command-catalog.mjs`: 승격 명령과 schema를 canonical catalog에 등록한다.
- `editor_hwpx/scripts/hwpx-command-catalog.test.mjs`: 정확한 operation 집합과 category를 검증한다.
- `editor_hwpx/scripts/hwpx-api-utils.mjs`: adapter, package policy와 atomic structural export를 session에 연결한다.
- `editor_hwpx/scripts/hwpx-api-utils.test.mjs`: trial/commit, 재열기와 저장 손실 거부를 검증한다.
- `editor_hwpx/src/main.rs`: HWPX 입력을 명시적으로 지원하는 native PDF CLI 결과 계약을 제공한다.
- `editor_hwpx/src/wasm_api.rs`: JS에 없는 metadata 또는 변경 추적 엔진 API가 필요한 경우 추가한다.
- `editor_hwpx/src/parser/hwpx/`: 실제 한컴 fixture로 확인된 변경 추적 요소를 파싱한다.
- `editor_hwpx/src/serializer/hwpx/`: 변경 추적과 package roundtrip 손실을 직렬화한다.
- `editor_docx/scripts/editor-gateway.mjs`: HWPX PDF와 구조 명령 REST 경로를 연결한다.
- `editor_docx/scripts/editor-gateway.test.mjs`: HWPX REST 통합과 artifact를 검증한다.
- `editor_docx/scripts/editor-mcp.mjs`: canonical catalog 기반 HWPX MCP schema와 PDF 도구를 노출한다.
- `editor_docx/scripts/editor-mcp.test.mjs`: REST/MCP 의미 동등성을 검증한다.
- `package.json`: 새 단위·통합·평가 명령을 등록한다.
- `API.md`, `README.md`, `docs/DOCUMENTATION_INDEX.md`, `docs/HWPX_EDITOR.md`, `docs/HWPX_MCP_API.md`: 검수된 최종 기능과 제한을 반영한다.

---

### Task 1: Canonical HWPX 명령 계약 승격

**Files:**
- Modify: `editor_hwpx/scripts/hwpx-command-catalog.mjs`
- Modify: `editor_hwpx/scripts/hwpx-command-catalog.test.mjs`

**Interfaces:**
- Produces: `HWPX_COMMAND_OPS`, `getHwpxCommandCatalog()`, `validateHwpxCommands(commands)`
- Contract: 기존 17개와 신규 15개 operation을 한 catalog에서 설명하고 검증한다.

- [ ] **Step 1: 신규 operation 집합을 요구하는 실패 테스트 작성**

```js
const promoted = [
  'text.replaceTracked', 'insertText', 'deleteRange', 'appendParagraph',
  'table.create', 'table.insertCaption', 'applyStyle', 'setRunStyle',
  'setParagraphStyle', 'image.insertAfterParagraph', 'setDocumentMetadata',
  'defineStyle', 'setPageSetup', 'setHeaderFooter', 'insertFootnote',
];
for (const op of promoted) {
  assert.ok(HWPX_COMMAND_OPS.includes(op), `${op} must be public`);
  assert.equal(getHwpxCommandCatalog({ op }).commandCount, 1);
}
```

- [ ] **Step 2: catalog 테스트를 실행해 신규 operation 누락 실패 확인**

Run: `node --test editor_hwpx/scripts/hwpx-command-catalog.test.mjs`

Expected: FAIL with `text.replaceTracked must be public` 또는 첫 누락 operation.

- [ ] **Step 3: 15개 operation의 category, required, optional과 enum을 실제 payload로 등록**

```js
{
  op: 'table.create',
  category: 'table',
  description: '문단 뒤에 새 표를 생성합니다.',
  required: ['target', 'rows', 'columns'],
  optional: ['width', 'height', 'cellTexts', 'caption'],
}
```

`text.replaceTracked`에는 `capability: 'engine-required'`를 넣고 실행 adapter가
없는 동안 validation 성공과 execution unsupported를 구분한다.

- [ ] **Step 4: catalog 테스트와 기존 HWPX API 테스트 통과 확인**

Run: `node --test editor_hwpx/scripts/hwpx-command-catalog.test.mjs editor_hwpx/scripts/hwpx-api-utils.test.mjs`

Expected: PASS.

- [ ] **Step 5: catalog 변경만 커밋**

```powershell
git add -- editor_hwpx/scripts/hwpx-command-catalog.mjs editor_hwpx/scripts/hwpx-command-catalog.test.mjs
git commit -m "feat: HWPX 구조 편집 명령 계약 승격"
```

---

### Task 2: 텍스트·문단 구조 명령 adapter

**Files:**
- Create: `editor_hwpx/scripts/hwpx-structural-commands.mjs`
- Create: `editor_hwpx/scripts/hwpx-structural-commands.test.mjs`

**Interfaces:**
- Consumes: RHWP document methods `insertText`, `deleteRange`, `insertParagraph`
- Produces: `applyHwpxStructuralCommand(doc, command, context)`
- Result: `{ op, changed, target, createdTargets, native }`

- [ ] **Step 1: insert, delete, append의 정확한 엔진 호출을 요구하는 실패 테스트 작성**

```js
test('insertText resolves a paragraph target and returns a stable target', () => {
  const calls = [];
  const doc = { insertText: (...args) => calls.push(args) || '{"inserted":3}' };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'insertText',
    target: { sectionIndex: 0, paragraphIndex: 2, offset: 4 },
    text: '확정',
  }, { before: fakeInspection() });
  assert.deepEqual(calls, [[0, 2, 4, '확정']]);
  assert.equal(result.changed, 1);
  assert.equal(result.target.sectionIndex, 0);
  assert.equal(result.target.paragraphIndex, 2);
});
```

`deleteRange`는 start/end가 역전되거나 다른 paragraph를 가리킬 때 변경 전에
`HWPX_INVALID_RANGE`를 던지는 테스트를 함께 작성한다.

- [ ] **Step 2: 신규 단위 테스트가 module-not-found로 실패하는지 확인**

Run: `node --test editor_hwpx/scripts/hwpx-structural-commands.test.mjs`

Expected: FAIL with missing `hwpx-structural-commands.mjs`.

- [ ] **Step 3: 명령 dispatcher와 target/range 검증을 최소 구현**

```js
export function applyHwpxStructuralCommand(doc, command, context) {
  switch (command.op) {
    case 'insertText':
      return applyInsertText(doc, command, context);
    case 'deleteRange':
      return applyDeleteRange(doc, command, context);
    case 'appendParagraph':
      return applyAppendParagraph(doc, command, context);
    default:
      throw hwpxCommandError('HWPX_STRUCTURAL_OP_UNSUPPORTED', command.op);
  }
}
```

`appendParagraph`는 target paragraph 뒤에 `insertParagraph`를 호출한 뒤 새
paragraph에 `insertText`를 호출하고 실제 section/paragraph index를 반환한다.

- [ ] **Step 4: adapter 단위 테스트 통과 확인**

Run: `node --test editor_hwpx/scripts/hwpx-structural-commands.test.mjs`

Expected: PASS.

- [ ] **Step 5: 텍스트 adapter 커밋**

```powershell
git add -- editor_hwpx/scripts/hwpx-structural-commands.mjs editor_hwpx/scripts/hwpx-structural-commands.test.mjs
git commit -m "feat: HWPX 텍스트 구조 편집 어댑터 추가"
```

---

### Task 3: 표·그림·쪽·머리말·꼬리말·각주 adapter

**Files:**
- Modify: `editor_hwpx/scripts/hwpx-structural-commands.mjs`
- Modify: `editor_hwpx/scripts/hwpx-structural-commands.test.mjs`

**Interfaces:**
- Consumes: `createTableEx`, `insertPicture`, `setPageDef`, `createHeaderFooter`, `insertFootnote`
- Produces: Task 2의 `applyHwpxStructuralCommand()`에 6개 operation 추가

- [ ] **Step 1: 생성 객체와 native id 재반환을 요구하는 실패 테스트 작성**

```js
test('table.create returns a rediscoverable table target', () => {
  const doc = {
    createTableEx: json => {
      assert.deepEqual(JSON.parse(json), {
        sectionIndex: 0, paragraphIndex: 1, rows: 3, columns: 4,
      });
      return '{"tableId":42,"paragraphIndex":2}';
    },
  };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'table.create',
    target: { sectionIndex: 0, paragraphIndex: 1 },
    rows: 3,
    columns: 4,
  }, { before: fakeInspection() });
  assert.equal(result.native.tableId, 42);
  assert.deepEqual(result.target, { kind: 'table', tableId: 42 });
});
```

같은 파일에 그림 binary ref 누락, 존재하지 않는 section, 잘못된 footer type,
0행 표, 각주 본문 공백의 명시적 error code 테스트를 추가한다.

- [ ] **Step 2: 6개 operation의 unsupported 실패 확인**

Run: `node --test --test-name-pattern="table.create|image.insertAfterParagraph|setPageSetup|setHeaderFooter|insertFootnote|table.insertCaption" editor_hwpx/scripts/hwpx-structural-commands.test.mjs`

Expected: FAIL with `HWPX_STRUCTURAL_OP_UNSUPPORTED`.

- [ ] **Step 3: 엔진 payload 변환과 생성 target 반환 구현**

```js
case 'setHeaderFooter': {
  const native = parseNativeResult(doc.createHeaderFooter(
    command.target.sectionIndex,
    command.type,
    command.applyTo ?? 'both',
  ));
  return structuralResult(command, native, {
    kind: 'headerFooter',
    sectionIndex: command.target.sectionIndex,
    controlId: native.controlId,
  });
}
```

`table.insertCaption`은 표 target을 확인한 뒤 표 앞/뒤 caption paragraph를 생성하고,
`image.insertAfterParagraph`는 attachment bytes를 data URI로 바꾸지 말고 RHWP
binary item 등록 경로를 사용한다.

- [ ] **Step 4: 전체 structural adapter 테스트 통과 확인**

Run: `node --test editor_hwpx/scripts/hwpx-structural-commands.test.mjs`

Expected: PASS.

- [ ] **Step 5: 객체·레이아웃 adapter 커밋**

```powershell
git add -- editor_hwpx/scripts/hwpx-structural-commands.mjs editor_hwpx/scripts/hwpx-structural-commands.test.mjs
git commit -m "feat: HWPX 표와 문서 구조 편집 추가"
```

---

### Task 4: 스타일과 문서 메타데이터 adapter

**Files:**
- Modify: `editor_hwpx/scripts/hwpx-structural-commands.mjs`
- Modify: `editor_hwpx/scripts/hwpx-structural-commands.test.mjs`
- Modify only if required by failing integration test: `editor_hwpx/src/wasm_api.rs`
- Modify only if required by failing roundtrip test: `editor_hwpx/src/serializer/hwpx/header.rs`

**Interfaces:**
- Consumes: `createStyle`, `applyStyle`, `applyCharFormat`, `applyParaFormat`
- Produces: `defineStyle`, `applyStyle`, `setRunStyle`, `setParagraphStyle`, `setDocumentMetadata`

- [ ] **Step 1: style id와 metadata roundtrip 실패 테스트 작성**

```js
test('defineStyle returns the style id used by applyStyle', () => {
  const doc = {
    createStyle: json => JSON.parse(json).name === '공공기관_강조' ? 12 : -1,
    applyStyle: (s, p, id) => JSON.stringify({ sectionIndex: s, paragraphIndex: p, styleId: id }),
  };
  const defined = applyHwpxStructuralCommand(doc, {
    op: 'defineStyle', name: '공공기관_강조', kind: 'paragraph',
    properties: { fontSizePt: 12, bold: true },
  }, { before: fakeInspection() });
  assert.equal(defined.native.styleId, 12);
});
```

실제 fixture를 열고 `setDocumentMetadata` 후 export/reopen하여 title, subject,
author, keywords가 동일한지 검사하는 통합 테스트를
`hwpx-api-utils.test.mjs`에 추가한다.

- [ ] **Step 2: adapter 또는 metadata 엔진 API 누락 실패 확인**

Run: `node --test --test-name-pattern="defineStyle|setDocumentMetadata" editor_hwpx/scripts/hwpx-structural-commands.test.mjs editor_hwpx/scripts/hwpx-api-utils.test.mjs`

Expected: FAIL with unsupported operation 또는 missing metadata method.

- [ ] **Step 3: 기존 RHWP API를 연결하고 metadata만 필요한 최소 Rust API 추가**

```rust
#[wasm_bindgen(js_name = setDocumentMetadata)]
pub fn set_document_metadata(&mut self, json: &str) -> Result<String, JsValue> {
    let patch: MetadataPatch = serde_json::from_str(json).map_err(js_error)?;
    self.document.apply_metadata_patch(patch).map_err(js_error)?;
    Ok(r#"{"changed":1}"#.to_string())
}
```

Rust를 변경한 경우 Docker 기반 WASM build로 `pkg/rhwp.js`,
`pkg/rhwp_bg.wasm`, `pkg/rhwp.d.ts`를 함께 재생성하고 직접 생성된 cache는
커밋하지 않는다.

- [ ] **Step 4: JS 테스트와 관련 Rust roundtrip 테스트 통과 확인**

Run: `node --test editor_hwpx/scripts/hwpx-structural-commands.test.mjs editor_hwpx/scripts/hwpx-api-utils.test.mjs`

Run when Rust changed:

```powershell
docker build -t academic-rhwp-dev:test -f editor_hwpx/Dockerfile editor_hwpx
docker run --rm -v "${PWD}/editor_hwpx:/app" academic-rhwp-dev:test cargo test --lib
```

Expected: both PASS.

- [ ] **Step 5: 스타일·metadata 변경 커밋**

```powershell
git add -- editor_hwpx/scripts/hwpx-structural-commands.mjs editor_hwpx/scripts/hwpx-structural-commands.test.mjs editor_hwpx/scripts/hwpx-api-utils.test.mjs editor_hwpx/src/wasm_api.rs editor_hwpx/src/serializer/hwpx/header.rs editor_hwpx/pkg
git commit -m "feat: HWPX 스타일과 문서 메타데이터 편집 추가"
```

---

### Task 5: 저장 모드 분류와 package qualification

**Files:**
- Create: `editor_hwpx/scripts/hwpx-package-policy.mjs`
- Create: `editor_hwpx/scripts/hwpx-package-policy.test.mjs`

**Interfaces:**
- Consumes: `readZip(buffer)`, `createZip(entries)` from `hwpx-api-utils.mjs`
- Produces:
  - `classifyHwpxCommands(commands): { mode, reasons }`
  - `inspectHwpxPackage(bytes): PackageInventory`
  - `qualifyHwpxCandidate(sourceBytes, candidateBytes, expectedDelta): Qualification`
  - `overlayPreservedEntries(sourceBytes, candidateBytes, qualification): Uint8Array`

- [ ] **Step 1: 손실 candidate를 거부하는 실패 테스트 작성**

```js
test('qualification rejects a missing embedded object', () => {
  const source = fixtureZip({
    'Contents/section0.xml': '<hs:sec/>',
    'BinData/ole1.bin': Buffer.from('opaque-attachment'),
  });
  const candidate = fixtureZip({ 'Contents/section0.xml': '<hs:sec/>' });
  assert.throws(
    () => qualifyHwpxCandidate(source, candidate, { deletedEntries: [] }),
    error => error.code === 'HWPX_PACKAGE_ENTRY_LOSS'
      && error.details.entries.includes('BinData/ole1.bin'),
  );
});
```

필수 entry 누락, media type 변화, 관계 단절, 허용된 그림 삭제, 비충돌
unknown entry overlay와 충돌 entry 거부 테스트를 추가한다.

- [ ] **Step 2: package policy module 누락 실패 확인**

Run: `node --test editor_hwpx/scripts/hwpx-package-policy.test.mjs`

Expected: FAIL with missing module.

- [ ] **Step 3: inventory, classification, qualification과 allowlisted overlay 구현**

```js
export const STRUCTURAL_EXPORT_OPS = new Set([
  'appendParagraph', 'table.create', 'table.insertCaption',
  'image.insertAfterParagraph', 'defineStyle', 'setPageSetup',
  'setHeaderFooter', 'insertFootnote',
]);

export function classifyHwpxCommands(commands) {
  const reasons = commands.filter(c => STRUCTURAL_EXPORT_OPS.has(c.op)).map(c => c.op);
  return { mode: reasons.length ? 'structural-export' : 'patch-safe', reasons };
}
```

overlay는 source-only entry 중 manifest/relationship/section/header와 충돌하지 않는
opaque entry만 복사하고, copied entry와 hash를 qualification result에 기록한다.

- [ ] **Step 4: package policy 테스트와 `git diff --check` 통과 확인**

Run: `node --test editor_hwpx/scripts/hwpx-package-policy.test.mjs`

Run: `git diff --check -- editor_hwpx/scripts/hwpx-package-policy.mjs editor_hwpx/scripts/hwpx-package-policy.test.mjs`

Expected: PASS and no whitespace errors.

- [ ] **Step 5: package policy 커밋**

```powershell
git add -- editor_hwpx/scripts/hwpx-package-policy.mjs editor_hwpx/scripts/hwpx-package-policy.test.mjs
git commit -m "feat: HWPX 무손실 패키지 검증 정책 추가"
```

---

### Task 6: HWPX session의 원자적 structural export

**Files:**
- Modify: `editor_hwpx/scripts/hwpx-api-utils.mjs`
- Modify: `editor_hwpx/scripts/hwpx-api-utils.test.mjs`

**Interfaces:**
- Consumes: `applyHwpxStructuralCommand`, `classifyHwpxCommands`, `qualifyHwpxCandidate`, `overlayPreservedEntries`
- Produces: `HwpxApiSession.commandsBatch(ops)`의 patch-safe/structural-export 원자적 구현

- [ ] **Step 1: batch rollback과 revision 1회 증가 실패 테스트 작성**

```js
test('structural batch commits once only after reopen succeeds', () => {
  const session = new HwpxApiSession(fixtureBytes, { saveMode: 'preserve-package' });
  const beforeHash = sha256(session.save().bytes);
  assert.throws(() => session.commandsBatch([
    validCreateTable,
    { op: 'insertFootnote', target: missingTarget, text: '근거' },
  ]), error => error.code === 'HWPX_TARGET_NOT_FOUND');
  assert.equal(session.revision, 0);
  assert.equal(sha256(session.save().bytes), beforeHash);

  const result = session.commandsBatch([validCreateTable]);
  assert.equal(result.revision, 1);
  assert.equal(result.results[0].target.kind, 'table');
});
```

candidate package 손실, export 후 재열기 실패, 빈 SVG, 생성 target 미발견 시
같은 rollback 계약을 검사한다.

- [ ] **Step 2: 현재 preserve-package 경로에서 구조 명령이 실패하는지 확인**

Run: `node --test --test-name-pattern="structural batch" editor_hwpx/scripts/hwpx-api-utils.test.mjs`

Expected: FAIL because structural adapter/policy is not connected.

- [ ] **Step 3: trial session에서 구조 명령 전체 적용 후 candidate 검증 구현**

```js
const classification = classifyHwpxCommands(ops);
if (classification.mode === 'structural-export') {
  const trial = this.cloneForTrial({ saveMode: 'rhwp-export' });
  const results = ops.map(op => trial.applyCommandUnsafe(op));
  const exported = trial.doc.exportHwpx();
  const qualified = qualifyHwpxCandidate(this.inputBytes, exported, expectedDelta(results));
  const committedBytes = overlayPreservedEntries(this.inputBytes, exported, qualified);
  const reopened = new HwpxApiSession(committedBytes, { saveMode: 'preserve-package' });
  verifyCreatedTargets(reopened.inspect(), results);
  verifyNonBlankSvg(reopened);
  return this.commitCandidate(reopened, results, qualified);
}
```

실제 구현에서는 기존 session private state 갱신 지점을 하나로 모아
`commitCandidate()` 이전에는 `this`를 변경하지 않는다.

- [ ] **Step 4: HWPX 전체 단위 테스트 통과 확인**

Run: `npm.cmd run test:hwpx-api`

Expected: PASS.

- [ ] **Step 5: atomic session 통합 커밋**

```powershell
git add -- editor_hwpx/scripts/hwpx-api-utils.mjs editor_hwpx/scripts/hwpx-api-utils.test.mjs
git commit -m "feat: HWPX 구조 편집 원자적 저장 연결"
```

---

### Task 7: 변경 내용 추적의 실제 HWPX 표현 판정과 구현

**Files:**
- Create: `editor_hwpx/scripts/hancom/Invoke-HwpxTrackedChangeProbe.ps1`
- Create: `editor_hwpx/scripts/hwpx-tracked-change-probe.mjs`
- Create: `editor_hwpx/scripts/hwpx-tracked-change-probe.test.mjs`
- Modify when standard representation is observed: `editor_hwpx/src/parser/hwpx/`
- Modify when standard representation is observed: `editor_hwpx/src/serializer/hwpx/`
- Modify when standard representation is observed: `editor_hwpx/src/wasm_api.rs`
- Modify: `editor_hwpx/scripts/hwpx-structural-commands.mjs`
- Modify: `editor_hwpx/scripts/hwpx-structural-commands.test.mjs`

**Interfaces:**
- Produces: `.qa/hwpx-tracked-change/capability.json`
- Capability result:
  - `{ representation: "hwpx-xml", supported: true, evidence: [...] }`, or
  - `{ representation: "external-or-unsupported", supported: false, evidence: [...] }`
- Produces when supported: RHWP `replaceTracked(...)` and public `text.replaceTracked`

- [ ] **Step 1: package diff 판정 규칙의 실패 테스트 작성**

```js
test('probe reports hwpx-xml only when revision markup survives reopen', () => {
  const result = analyzeTrackedChangeProbe({
    baseline: packageFixture('baseline'),
    tracked: packageFixture('tracked-with-revision-elements'),
    reopened: packageFixture('tracked-with-revision-elements'),
    accepted: packageFixture('accepted-without-revision-elements'),
    rejected: packageFixture('rejected-without-revision-elements'),
  });
  assert.equal(result.representation, 'hwpx-xml');
  assert.equal(result.supported, true);
  assert.ok(result.evidence.every(item => item.sha256));
});
```

단순 본문 차이만 있고 revision markup이 없는 경우는
`external-or-unsupported`로 판정하는 테스트를 함께 작성한다.

- [ ] **Step 2: probe 테스트의 module-not-found 실패 확인**

Run: `node --test editor_hwpx/scripts/hwpx-tracked-change-probe.test.mjs`

Expected: FAIL with missing probe module.

- [ ] **Step 3: 한컴 fixture 생성과 결정론적 package/XML diff 구현**

PowerShell script는 입력 HWPX를 복사해 baseline, tracking-on replacement,
reopened, accepted, rejected 5개 artifact를 만들고 자신이 시작한 `Hwp.exe`
PID만 종료한다. Node probe는 ZIP entry별 SHA-256과 XML expanded-name 차이를
`capability.json`에 기록한다.

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File editor_hwpx/scripts/hancom/Invoke-HwpxTrackedChangeProbe.ps1 -InputPath .qa/fixtures/tracked-change-source.hwpx -OutputDirectory .qa/hwpx-tracked-change
node editor_hwpx/scripts/hwpx-tracked-change-probe.mjs --directory .qa/hwpx-tracked-change
```

Expected: five HWPX artifacts and one capability JSON, or explicit
`human_gate` with captured dialog evidence.

- [ ] **Step 4: 관찰된 표현에 따라 정확히 하나의 제품 계약 구현**

If `representation === "hwpx-xml"`:

```rust
#[wasm_bindgen(js_name = replaceTracked)]
pub fn replace_tracked(
    &mut self,
    section_idx: u32,
    para_idx: u32,
    start: u32,
    end: u32,
    replacement: &str,
    author: &str,
) -> Result<String, JsValue> {
    self.document
        .replace_tracked(section_idx, para_idx, start, end, replacement, author)
        .map(to_json)
        .map_err(js_error)
}
```

parser와 serializer에 fixture에서 관찰한 element/attribute만 추가하고,
tracked → export → reopen → accept/reject roundtrip Rust test를 먼저 실패시킨
뒤 구현한다.

If `representation === "external-or-unsupported"`:

```js
case 'text.replaceTracked':
  throw hwpxCommandError(
    'HWPX_TRACKED_CHANGES_UNAVAILABLE',
    '한컴오피스 2024에서 생성한 HWPX에 보존 가능한 변경 추적 표현이 없습니다.',
    { capabilityEvidence: 'hwpx-tracked-change/capability.json' },
  );
```

두 경로 모두 일반 replace를 실행하지 않는다.

- [ ] **Step 5: probe와 공개 command 계약 통과 후 커밋**

Run: `node --test editor_hwpx/scripts/hwpx-tracked-change-probe.test.mjs editor_hwpx/scripts/hwpx-structural-commands.test.mjs`

Expected: PASS and `text.replaceTracked` either roundtrips or returns the exact
unsupported error with evidence.

```powershell
git add -- editor_hwpx/scripts/hancom/Invoke-HwpxTrackedChangeProbe.ps1 editor_hwpx/scripts/hwpx-tracked-change-probe.mjs editor_hwpx/scripts/hwpx-tracked-change-probe.test.mjs editor_hwpx/scripts/hwpx-structural-commands.mjs editor_hwpx/scripts/hwpx-structural-commands.test.mjs editor_hwpx/src/parser/hwpx editor_hwpx/src/serializer/hwpx editor_hwpx/src/wasm_api.rs
git commit -m "feat: HWPX 변경 추적 실제 형식 판정과 계약 추가"
```

---

### Task 8: RHWP native PDF runner

**Files:**
- Modify: `editor_hwpx/src/main.rs`
- Create: `editor_hwpx/docker/pdf/Dockerfile`
- Create: `editor_hwpx/scripts/hwpx-native-pdf.mjs`
- Create: `editor_hwpx/scripts/hwpx-native-pdf.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `renderHwpxPdf(bytes, { pages, timeoutMs, dockerImage, tempRoot, runProcess })`
- Result: `{ bytes, sha256, byteLength, pageCount, renderer: "rhwp-native" }`

- [ ] **Step 1: 성공·timeout·cleanup 실패 테스트 작성**

```js
test('renderHwpxPdf validates output and removes its temp directory', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'hwpx-pdf-test-'));
  const result = await renderHwpxPdf(fixtureBytes, {
    dockerImage: 'academic-rhwp-pdf:test',
    timeoutMs: 5000,
    tempRoot,
    runProcess: fakeSuccessfulDockerRun,
  });
  assert.equal(result.renderer, 'rhwp-native');
  assert.equal(result.bytes.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await readdir(tempRoot)).length, 0);
});
```

timeout child가 종료되고 partial PDF가 반환되지 않는 테스트도 작성한다.

- [ ] **Step 2: runner module 누락 실패 확인**

Run: `node --test editor_hwpx/scripts/hwpx-native-pdf.test.mjs`

Expected: FAIL with missing module.

- [ ] **Step 3: native CLI JSON 결과와 Node runner 구현**

multi-stage image는 builder에서 `cargo build --release`를 실행하고 runtime에는
`/usr/local/bin/rhwp`만 복사한다. CLI 성공 stdout 마지막 줄:

```json
{"ok":true,"renderer":"rhwp-native","pageCount":3,"output":"C:\\work\\out.pdf"}
```

Node runner는 request별 예측 불가능한 container name을 만들고
`docker run --rm --name <owned-name> -v <request-temp>:/work <image>
/usr/local/bin/rhwp export-pdf /work/input.hwpx --output /work/output.pdf --json`
형태로 실행한다. container name과 child PID 소유권을 저장하며 `finally`에서
해당 container와 request temp만 정리한다.

- [ ] **Step 4: Docker build와 실제 fixture PDF smoke 통과 확인**

Run: `docker build -t academic-rhwp-pdf:test -f editor_hwpx/docker/pdf/Dockerfile editor_hwpx`

Run: `node --test editor_hwpx/scripts/hwpx-native-pdf.test.mjs`

Expected: PASS, PDF magic bytes present, pageCount >= 1.

- [ ] **Step 5: PDF runner 커밋**

```powershell
git add -- editor_hwpx/src/main.rs editor_hwpx/docker/pdf/Dockerfile editor_hwpx/scripts/hwpx-native-pdf.mjs editor_hwpx/scripts/hwpx-native-pdf.test.mjs package.json
git commit -m "feat: HWPX 네이티브 PDF 렌더러 연결"
```

---

### Task 9: REST와 MCP 완전 동등화

**Files:**
- Modify: `editor_docx/scripts/editor-gateway.mjs`
- Modify: `editor_docx/scripts/editor-gateway.test.mjs`
- Modify: `editor_docx/scripts/editor-mcp.mjs`
- Modify: `editor_docx/scripts/editor-mcp.test.mjs`

**Interfaces:**
- Consumes: canonical HWPX catalog, `renderHwpxPdf`
- Produces: HWPX REST apply/batch/render/save/PDF and matching MCP tools

- [ ] **Step 1: REST/MCP 결과 동등성 실패 테스트 작성**

```js
test('HWPX REST and MCP expose the same structural operations', async () => {
  const opened = await post('/v1/hwpx/documents/open', { bytesBase64: fixtureBase64 });
  const restCatalog = await post(
    `/v1/hwpx/documents/${opened.documentId}/commands/catalog`,
    {},
  );
  const mcpCatalog = await callTool('editor_hwpx_command_catalog', {});
  assert.deepEqual(
    restCatalog.commands.map(c => c.op).sort(),
    mcpCatalog.commands.map(c => c.op).sort(),
  );
  assert.ok(restCatalog.commands.some(c => c.op === 'insertFootnote'));
});
```

HWPX `documents/export-pdf`가 200, `application/pdf` artifact metadata,
`renderer: "rhwp-native"`를 반환하고 MCP `editor_hwpx_save`의 PDF 결과가 같은
hash/pageCount인지 검사한다.

- [ ] **Step 2: 현재 HWPX PDF 501과 catalog 차이 실패 확인**

Run: `node --test --test-name-pattern="HWPX REST and MCP|HWPX PDF" editor_docx/scripts/editor-gateway.test.mjs editor_docx/scripts/editor-mcp.test.mjs`

Expected: FAIL with 501 or missing operations.

- [ ] **Step 3: gateway 의존성 주입과 MCP schema 연결**

```js
if (fmt === 'hwpx' && actionPath === 'documents/export-pdf') {
  const rendered = await config.hwpxPdfRenderer(session.save().bytes, {
    pages: body.pages ?? 'all',
    timeoutMs: config.hwpxPdfTimeoutMs,
  });
  return persistOrInlinePdf(res, rendered, body.outputPath);
}
```

테스트에서는 fake renderer를 주입하고, production config에서만
`renderHwpxPdf`를 사용한다. MCP의 operation enum은 수기 복제하지 않고
`HWPX_COMMAND_OPS`에서 생성한다.

- [ ] **Step 4: gateway/MCP와 전체 runtime 테스트 통과 확인**

Run: `node --test editor_docx/scripts/editor-gateway.test.mjs editor_docx/scripts/editor-mcp.test.mjs`

Run: `npm.cmd run test:runtime`

Expected: PASS with zero skipped HWPX parity tests.

- [ ] **Step 5: REST/MCP parity 커밋**

```powershell
git add -- editor_docx/scripts/editor-gateway.mjs editor_docx/scripts/editor-gateway.test.mjs editor_docx/scripts/editor-mcp.mjs editor_docx/scripts/editor-mcp.test.mjs
git commit -m "feat: HWPX REST MCP와 PDF 기능 동등화"
```

---

### Task 10: 공공기관 고난도 평가 v2 250건

**Files:**
- Create: `evaluation/hwpx-public-sector-v2/manifest.json`
- Create: `evaluation/hwpx-public-sector-v2/scenarios.jsonl`
- Create: `evaluation/hwpx-public-sector-v2/attachments.json`
- Create: `evaluation/hwpx-public-sector-v2/gold/*.json`
- Create: `evaluation/hwpx-public-sector-v2/schema/scenario.schema.json`
- Create: `evaluation/hwpx-public-sector-v2/schema/attachment.schema.json`
- Create: `evaluation/hwpx-public-sector-v2/scripts/generate-dataset.mjs`
- Create: `evaluation/hwpx-public-sector-v2/scripts/fetch-public-fixtures.mjs`
- Create: `evaluation/hwpx-public-sector-v2/scripts/validate-dataset.mjs`
- Create: `evaluation/hwpx-public-sector-v2/scripts/run-api-evaluation.mjs`
- Create: `evaluation/hwpx-public-sector-v2/scripts/verify-results.mjs`
- Create: `evaluation/hwpx-public-sector-v2/fixtures/acceptance-smoke.hwpx`
- Create: `evaluation/hwpx-public-sector-v2/README.md`
- Create: `evaluation/hwpx-public-sector-v2/METHODOLOGY.md`
- Create: `evaluation/hwpx-public-sector-v2/PROVENANCE.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: v1 100 scenarios, actual public/repository fixtures and promoted command catalog
- Produces: exactly 250 scenarios, 25 generation cases, obligation ledger and bounded results

- [ ] **Step 1: 정확한 수량·난이도·복합 첨부를 요구하는 validator 실패 테스트 작성**

Validator hard gates:

```js
assert.equal(scenarios.length, 250);
assert.equal(scenarios.filter(s => s.mode === 'generation').length, 25);
assert.ok(scenarios.every(s => s.question.length >= 100 && s.question.length <= 1000));
assert.ok(scenarios.every(s => s.attachments.length >= 2));
assert.ok(new Set(attachments.map(a => a.format)).size >= 8);
assert.ok(promotedOps.every(op => scenarios.filter(s => s.requiredOps.includes(op)).length >= 10));
assert.ok(scenarios.every(s => s.obligations.length >= 5));
```

- [ ] **Step 2: v1 데이터에 v2 validator를 실행해 수량 실패 확인**

Run: `node evaluation/hwpx-public-sector-v2/scripts/validate-dataset.mjs`

Expected: FAIL with `expected 250 scenarios`.

- [ ] **Step 3: 결정론적 생성기와 gold obligation 작성**

`fetch-public-fixtures.mjs`는 공공기관 공식 URL allowlist만 사용하고
`sourceUrl`, `fetchedAt`, `license`, `sha256`, `byteLength`를 attachments
manifest에 기록한다. 다운로드가 재현되지 않는 fixture는 저장소에 이미 있는
실제 문서를 사용하고 `sourceType: "repository-fixture"`와 원본 경로를 기록한다.

생성기는 seed `hwpx-public-sector-v2-2026-07-27`을 고정한다. 각 신규 문항은
기관 역할, 서로 다른 2~5개 attachment 근거, 2~6개 구조 편집, 보존 의무,
산출물 검수 조건을 조합한다. 문항 원문과 gold는 OpenAI API 없이 템플릿과
검증된 attachment metadata에서 생성한다.

각 gold:

```json
{
  "scenarioId": "HWPX-PS2-101",
  "hardGates": [
    {"type":"textAnchor","value":"2026년 상반기 집행률"},
    {"type":"tableCountDelta","value":1},
    {"type":"headerFooter","sectionIndex":0,"kind":"footer"},
    {"type":"attachmentHashPreserved","attachmentId":"ATT-PDF-07"},
    {"type":"hancomReopen","repairDialog":false}
  ]
}
```

- [ ] **Step 4: 데이터 validator와 API dry-run 통과 확인**

Run: `node evaluation/hwpx-public-sector-v2/scripts/validate-dataset.mjs`

Run: `node evaluation/hwpx-public-sector-v2/scripts/run-api-evaluation.mjs --limit 5 --render full`

Run: `node evaluation/hwpx-public-sector-v2/scripts/verify-results.mjs --summary evaluation/hwpx-public-sector-v2/results/latest-summary.json --expected-cases 5`

Expected: validator PASS; five-case dry-run writes bounded JSON results.

- [ ] **Step 5: v2 corpus 코드와 manifest 커밋**

```powershell
git add -- evaluation/hwpx-public-sector-v2/manifest.json evaluation/hwpx-public-sector-v2/scenarios.jsonl evaluation/hwpx-public-sector-v2/attachments.json evaluation/hwpx-public-sector-v2/gold evaluation/hwpx-public-sector-v2/schema evaluation/hwpx-public-sector-v2/scripts evaluation/hwpx-public-sector-v2/fixtures/acceptance-smoke.hwpx evaluation/hwpx-public-sector-v2/README.md evaluation/hwpx-public-sector-v2/METHODOLOGY.md evaluation/hwpx-public-sector-v2/PROVENANCE.md package.json
git commit -m "test: HWPX 공공기관 고난도 평가 250건 추가"
```

---

### Task 11: 프로젝트 HWPX Studio 실제 브라우저 검수

**Files:**
- Create: `editor_hwpx/rhwp-studio/e2e/api-artifact-acceptance.test.mjs`
- Create: `editor_hwpx/scripts/hwpx-studio-acceptance.mjs`
- Modify: `evaluation/hwpx-public-sector-v2/scripts/run-api-evaluation.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: REST/MCP가 저장한 실제 HWPX artifact path
- Produces: `{ loaded, pageCount, nonBlankRatio, screenshotPath, consoleErrors }`

- [ ] **Step 1: API artifact를 Studio canvas로 여는 실패 e2e 작성**

```js
import {
  launchBrowser, closeBrowser, closePage, createPage, loadApp, waitForCanvas,
} from './helpers.mjs';

const browser = await launchBrowser('headless');
const page = await createPage(browser);
try {
  await loadApp(page);
  const input = await page.$('#file-input');
  await input.uploadFile(process.env.HWPX_ACCEPTANCE_INPUT);
  await waitForCanvas(page);
  const rendered = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('#scroll-content canvas')];
    return {
      pageCount: canvases.length,
      sizes: canvases.map(c => ({ width: c.width, height: c.height })),
    };
  });
  assert(rendered.pageCount > 0, 'Studio must render at least one page');
  assert(rendered.sizes.every(s => s.width > 0 && s.height > 0), 'canvas must be non-empty');
} finally {
  await closePage(page);
  await closeBrowser(browser);
}
```

- [ ] **Step 2: 지정한 API artifact 없이 명시적으로 실패하는지 확인**

Run: `node editor_hwpx/rhwp-studio/e2e/api-artifact-acceptance.test.mjs`

Expected: FAIL with `HWPX_ACCEPTANCE_INPUT is required`.

- [ ] **Step 3: canvas 비공백·console error·screenshot evidence 구현**

`hwpx-studio-acceptance.mjs`는 사용 가능한 loopback port를 확보해
`npm.cmd run preview -- --host 127.0.0.1 --port <port>`를 시작하고 health 확인 후
`VITE_URL`, `HWPX_ACCEPTANCE_INPUT`, `HWPX_ACCEPTANCE_EVIDENCE`, `MODE=headless`를
e2e child에 전달한다. `finally`에서 자신이 시작한 preview와 e2e child만
종료한다.

첫 canvas에서 alpha가 0이 아니고 흰색이 아닌 pixel 표본 비율을 계산해
`nonBlankRatio > 0.001`을 요구한다. `pageerror`와 console error를 수집하고
허용 목록 밖 오류가 있으면 실패한다. screenshot은 실행별 `.qa` output root에
저장하며 저장소의 기존 e2e screenshot 디렉터리를 오염시키지 않는다.

- [ ] **Step 4: 실제 REST 산출물로 headless Studio 검수 통과 확인**

Run:

```powershell
node editor_hwpx/scripts/hwpx-studio-acceptance.mjs --input .qa/hwpx-api-smoke/output.hwpx --evidence .qa/hwpx-api-smoke
```

Expected: loaded true, pageCount >= 1, nonBlankRatio > 0.001, no unexpected
console errors, screenshot present; started browser and preview process absent
after completion.

- [ ] **Step 5: v2 runner의 projectEditor gate에 연결하고 커밋**

```powershell
git add -- editor_hwpx/rhwp-studio/e2e/api-artifact-acceptance.test.mjs editor_hwpx/scripts/hwpx-studio-acceptance.mjs evaluation/hwpx-public-sector-v2/scripts/run-api-evaluation.mjs package.json
git commit -m "test: HWPX Studio 실제 산출물 브라우저 검수 추가"
```

---

### Task 12: 한컴오피스 2024 실제 acceptance harness

**Files:**
- Create: `editor_hwpx/scripts/hancom/HwpxAcceptance.psm1`
- Create: `editor_hwpx/scripts/hancom/Invoke-HwpxAcceptance.ps1`
- Create: `editor_hwpx/scripts/hancom/hwpx-acceptance.test.mjs`
- Modify: `evaluation/hwpx-public-sector-v2/scripts/run-api-evaluation.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `Invoke-HwpxAcceptance -InputPath -ResavedPath -PdfPath -EvidencePath`
  - JSON `{ status, opened, repairDialog, resaved, pdfExported, ownedPids, pageCount }`

- [ ] **Step 1: dry-run과 소유 PID 정리를 요구하는 실패 테스트 작성**

```js
test('Hancom harness records and cleans only owned PIDs', async () => {
  const before = await listHwpPids();
  const result = await runHancomAcceptance({
    inputPath: fixture,
    dryRun: true,
    evidencePath,
  });
  assert.deepEqual(await listHwpPids(), before);
  assert.ok(Array.isArray(result.ownedPids));
  assert.equal(result.status, 'dry-run');
});
```

실제 환경 test에는 opened, resaved, PDF magic bytes, repairDialog false와
source/resaved SHA-256 기록을 요구한다.

- [ ] **Step 2: PowerShell module 누락 실패 확인**

Run: `node --test editor_hwpx/scripts/hancom/hwpx-acceptance.test.mjs`

Expected: FAIL with missing `Invoke-HwpxAcceptance.ps1`.

- [ ] **Step 3: COM/UI automation과 evidence JSON 구현**

PowerShell은 실행 전 `Hwp.exe` PID 목록을 저장하고, automation 시작 후 새 PID만
`ownedPids`에 넣는다. `try/finally`에서 COM object를 release하고 새 PID만
정상 종료 후 제한된 강제 종료를 시도한다. 열린 문서 원본에는 저장하지 않고
항상 `.qa`의 `ResavedPath`를 사용한다.

```powershell
try {
    $result = Invoke-HwpxOpenResavePdf `
        -InputPath $InputPath `
        -ResavedPath $ResavedPath `
        -PdfPath $PdfPath
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
}
finally {
    Close-OwnedHwpProcesses -ProcessIds $ownedPids
}
```

- [ ] **Step 4: 단일 실제 HWPX open-resave-PDF 검수**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File editor_hwpx/scripts/hancom/Invoke-HwpxAcceptance.ps1 -InputPath evaluation/hwpx-public-sector-v2/fixtures/acceptance-smoke.hwpx -ResavedPath .qa/hancom/smoke-resaved.hwpx -PdfPath .qa/hancom/smoke.pdf -EvidencePath .qa/hancom/smoke.json
```

Expected: `status=passed`, `repairDialog=false`, resaved HWPX and nonblank PDF;
after command, pre-existing Hwp PIDs unchanged and owned PIDs absent.

- [ ] **Step 5: harness와 runner 연결 커밋**

```powershell
git add -- editor_hwpx/scripts/hancom/HwpxAcceptance.psm1 editor_hwpx/scripts/hancom/Invoke-HwpxAcceptance.ps1 editor_hwpx/scripts/hancom/hwpx-acceptance.test.mjs evaluation/hwpx-public-sector-v2/scripts/run-api-evaluation.mjs package.json
git commit -m "test: 한컴오피스 HWPX 실제 검수 자동화 추가"
```

---

### Task 13: 250건 실제 실행, 결함 수정, 문서 개편

**Files:**
- Modify as failures require: files owned by Tasks 1-11
- Create: `evaluation/hwpx-public-sector-v2/results/latest-summary.json`
- Create: `evaluation/hwpx-public-sector-v2/results/latest-results.jsonl`
- Modify: `API.md`
- Modify: `README.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: `docs/HWPX_EDITOR.md`
- Modify: `docs/HWPX_MCP_API.md`
- Delete only after link audit: superseded HWPX planning/report documents

**Interfaces:**
- Consumes: Tasks 1-12의 unit/integration tests, isolated gateway, MCP, project editor, Hancom harness
- Produces: evidence-backed scorecard and canonical documentation

- [ ] **Step 1: 실행 전 process ownership과 isolated paths 기록**

```powershell
$beforeHwp = @(Get-Process Hwp -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$beforeNode = @(Get-Process node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$runRoot = Join-Path (Resolve-Path .qa) ('hwpx-v2-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runRoot | Out-Null
```

gateway runner가 시작 PID와 port를 result manifest에 기록하게 하고, 현재
127.0.0.1:11005에서 실행 중인 기존 gateway는 종료 대상으로 등록하지 않는다.

- [ ] **Step 2: 단위·통합·dataset gate 전체 실행**

Run:

```powershell
npm.cmd run test:hwpx-api
npm.cmd run test:runtime
npm.cmd run test:hwpx-dataset
node evaluation/hwpx-public-sector-v2/scripts/validate-dataset.mjs
```

Expected: all PASS, zero unexpected skips.

- [ ] **Step 3: 250건 REST/MCP/editor/Hancom 실제 평가 실행**

Run:

```powershell
node evaluation/hwpx-public-sector-v2/scripts/run-api-evaluation.mjs --transport both --render full --hancom required --output-root $runRoot
```

Expected per case:

```json
{
  "rest": "passed",
  "mcp": "passed",
  "projectEditor": "passed",
  "hancom": "passed",
  "repairDialog": false,
  "atomic": true,
  "packagePreserved": true
}
```

실패 사례는 operation/error code별로 묶고, 각 결함마다 해당 계층의 최소
재현 테스트를 먼저 추가해 실패를 확인한 뒤 근본 원인을 수정한다. 수정 후
실패 묶음과 전체 회귀를 다시 실행한다.

- [ ] **Step 4: 시작한 process와 임시 자원 정리 검증**

```powershell
$afterHwp = @(Get-Process Hwp -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$leakedHwp = @($afterHwp | Where-Object { $_ -notin $beforeHwp })
if ($leakedHwp.Count -gt 0) { throw "Owned Hwp processes leaked: $($leakedHwp -join ',')" }
```

gateway PID, native PDF child와 run-owned Docker container도 같은 방식으로
manifest의 owned id만 검사하고 종료한다. pre-existing PID/container는
그대로 남겨 둔다.

- [ ] **Step 5: 결과에 맞춰 canonical 문서와 오래된 문서 정리**

문서마다 다음 표를 실제 catalog와 `latest-summary.json`에서 생성한다.

```markdown
| Operation | REST | MCP | Project editor | Hancom 2024 | Status |
|---|---:|---:|---:|---:|---|
| table.create | pass | pass | pass | pass | supported |
```

`rg -n "HWPX_API_EDITOR_IMPROVEMENT_PLAN|HWPX_API_IMPLEMENTATION_LESSONS|HWPX_API_ONLY_IMPROVEMENT_REPORT|hwp-hwpx-editor-research" .`
로 링크를 조사한 뒤 superseded 파일만 삭제하고 canonical 문서로 링크를
교체한다.

- [ ] **Step 6: 최종 verification과 bounded 결과 커밋**

Run:

```powershell
npm.cmd run test:runtime
node evaluation/hwpx-public-sector-v2/scripts/validate-dataset.mjs
node evaluation/hwpx-public-sector-v2/scripts/verify-results.mjs --summary evaluation/hwpx-public-sector-v2/results/latest-summary.json
git diff --check
git status --short
```

Expected: all gates PASS, 250 result rows, no leaked owned process, no cache or
large artifact staged.

```powershell
git add -- API.md README.md docs evaluation/hwpx-public-sector-v2/results/latest-summary.json evaluation/hwpx-public-sector-v2/results/latest-results.jsonl
git commit -m "docs: HWPX 실제 검수 결과와 문서 전면 개편"
```
