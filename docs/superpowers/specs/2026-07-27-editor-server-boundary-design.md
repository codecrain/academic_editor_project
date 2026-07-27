# DOCX/HWPX 공용 서버 경계와 안전 계약 설계

- 작성일: 2026-07-27
- 상태: 승인됨
- 범위: 공용 REST/MCP 서버, 형식별 어댑터, revision·검수 선행조건

## 1. 목적

DOCX와 HWPX의 편집 엔진, 패키지 처리, 렌더러와 브라우저 편집기는 서로
의존하지 않는다. 두 형식이 공유하는 코드는 HTTP/MCP 전송, 세션 수명주기,
bounded 응답, artifact handoff와 공통 요청 검증으로 제한한다.

현재 공용 gateway와 MCP broker가 `editor_docx/scripts` 아래에 있어 HWPX
모듈을 직접 import하는 소유권 혼동을 제거한다. 기존 실행 명령과 import
경로는 얇은 호환 wrapper로 유지하되, 실제 구현의 source of truth는
`editor_server/` 하나로 만든다.

## 2. 채택한 접근법

### 비교한 접근법

1. 기존 위치 유지 후 문서로만 공용 서버라고 설명
   - 변경량은 작지만 구조적 분리와 중복 문제가 남으므로 채택하지 않는다.
2. DOCX/HWPX별 gateway를 각각 복제
   - 형식 격리는 강하지만 전송·보안·artifact 코드가 중복되고 drift 위험이
     커지므로 채택하지 않는다.
3. 공용 서버를 독립 패키지로 승격하고 형식 어댑터를 주입
   - 서버만 공유한다는 제품 경계를 코드 구조로 강제할 수 있어 채택한다.

## 3. 목표 구조

```text
editor_server/
  document-api-core.mjs
  editor-mcp-tool-factory.mjs
  editor-mcp.mjs
  editor-gateway.mjs
  format-adapters/
    docx-adapter.mjs
    hwpx-adapter.mjs

editor_docx/
  scripts/
    docx-api-utils.mjs
    editor-gateway.mjs       # 호환 re-export/entrypoint
    editor-mcp.mjs           # 호환 re-export

editor_hwpx/
  scripts/
    hwpx-api-utils.mjs
    hwpx-mcp-tools.mjs       # 형식 카탈로그와 설명만 소유
```

`editor_server`는 DOCX나 HWPX 내부 구현을 조건문으로 직접 선택하지 않는다.
각 adapter가 다음 인터페이스를 제공한다.

```js
{
  format,
  extension,
  createSession(bytes, options),
  commandCatalog(query),
  renderPages(session, pages, options),
  exportPdf(bytes, options),
  visibleText(bytes),
}
```

## 4. MCP 스키마 단일화

DOCX와 HWPX 모두 `createEditorMcpTools()`를 사용한다. 공통 필드와 lifecycle
도구 16개는 factory에서 생성하고, 각 형식은 prefix, description,
command enum과 형식별 제약만 전달한다.

검수 기준:

- DOCX 16개, HWPX 16개 tool suffix 집합이 동일하다.
- 모든 공통 도구의 top-level property 집합이 동일하다.
- HWPX schema에 DOCX 설명이, DOCX schema에 HWPX 설명이 포함되지 않는다.
- gateway는 tool name prefix가 아니라 등록된 adapter map으로 형식을 찾는다.

## 5. REST/MCP 동시성 및 선행조건

REST와 MCP에 같은 상태 전이를 적용한다.

```text
open revision=1
  -> inspect/current inventory
  -> apply(baseRevision=1)
  -> revision=2, 이전 검수 상태 폐기
  -> quality(baseRevision=2)
  -> save/export(baseRevision=2)
  -> artifact read/delete 또는 discard
```

필수 규칙:

- `apply`, `save-source`, `save-checkpoint`, `export-pdf`, `discard`는
  `baseRevision`을 받는다. discard는 이미 닫힌 ID에도 멱등이다.
- stale revision은 어떤 mutation도 하기 전에 `stale_revision`으로 거부한다.
- 명령이 요구하는 모든 target/style source는 현재 revision에서 inspect되어야
  한다.
- image/object 명령은 현재 revision의 object inventory를 요구한다.
- save/PDF는 현재 revision의 clean quality check를 요구한다.
- apply 성공 시 inspection, inventory와 quality cache를 모두 폐기한다.
- REST와 MCP는 동일한 precondition helper와 오류 코드를 사용한다.

## 6. 호환성과 마이그레이션

기존 `editor_docx/scripts/editor-gateway.mjs` 실행은 유지한다. wrapper는
`editor_server/editor-gateway.mjs`의 `main()`을 호출하고 공개 export를
재노출한다. 내부 import와 문서는 새 경로만 사용한다.

revision이 없는 기존 REST mutation 요청은 400으로 거부한다. 이는 조용한
stale write보다 안전한 의도적 breaking change이며 `API.md`의 v1 계약을
동시에 갱신한다.

## 7. 완료 기준

- 형식 런타임의 반대 형식 direct import가 0건이다.
- 공용 서버 구현 파일이 `editor_docx` 또는 `editor_hwpx` 아래에 남지 않는다.
- cross-format document ID 요청은 404이고 각 세션 revision은 독립적이다.
- REST/MCP stale·inspect·inventory·quality hard gate 테스트가 양 형식에서
  동일하게 통과한다.
- 기존 `npm run dev`, `npm run test:runtime` entrypoint는 유지된다.
