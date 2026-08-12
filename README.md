# Academic Editor Project

Commercial SaaS status comes first: production should use the native
source-built runtime from this public repository and run it under pm2. Docker is
kept only as a local fallback for environments where native Linux execution is
not available. Do not use `collabora/code` in local, development, staging, or
production.

This repository contains the public document-editor runtime layer. It is kept
separate from the private Tlooto service repository so service secrets, WOPI
tokens, database code, user data, and proprietary business logic do not enter
the open-source tree.

## What This Repository Owns

- Vendored DOCX editor source under `editor_docx/`.
- Vendored HWP/HWPX editor source under `editor_hwpx/`.
- Source-build orchestration for the native document editor runtime.
- Optional source-built Docker fallback for local/isolated testing.
- Public debranding patch files applied before compilation.
- Runtime start/status/stop scripts for native pm2 and Docker fallback.
- License and compliance documentation.
- Unified DOCX/HWPX/PDF REST and MCP editing contracts.
- A PDFium browser editor plus transactional PDF API for annotations, forms,
  redaction, page composition, security, attachments, and signing.
- Self-hosted raster and vector Image Studio routes with flattened and editable
  project session contracts.
- The canonical 20-case HWPX Agent stress-validation contract, with a separate
  deterministic editor replay gate.

DOCX, HWPX, and PDF are separate editor engines. `editor_docx/` owns the
Collabora/WOPI implementation and `editor_hwpx/` owns RHWP Studio and HWPX
package mutation. `editor_pdf/` owns PDF.js/Poppler verification, PDFium
source-object editing, and additive PDF operations.
Engine code shares only the format-neutral modules in
`editor_common/` and the HTTP/MCP/WOPI transport in `editor_server/`.
Repository-wide start, stop, deployment, compliance, and development checks
live under `editor_common/scripts/`; those tools orchestrate all engines but
do not merge their implementations. Compatibility scripts under each engine
are thin re-exports of the shared server, and no engine imports the other
engine's implementation.

Current documentation starts at [docs/DOCUMENTATION_INDEX.md](docs/DOCUMENTATION_INDEX.md).
The complete transport contract is [API.md](API.md). The only canonical HWPX
Agent validation inputs and completion criteria are under
[evaluation/hwpx-agent-final-20-v1](evaluation/hwpx-agent-final-20-v1); its
deterministic runner validates the editor, not the Agent.
DOCX mixed-page preservation, the current iframe bridge, and the proposed
host-owned context-action contract are specified in
[docs/DOCX_IFRAME_INTEGRATION.md](docs/DOCX_IFRAME_INTEGRATION.md).
PDF limits and its MCP contract are documented in
[docs/PDF_EDITOR.md](docs/PDF_EDITOR.md) and
[docs/PDF_MCP_API.md](docs/PDF_MCP_API.md).

The private service repository owns the WOPI host, authentication, storage,
database, project/report UI, and deployment secrets.

## License Boundary

This public runtime repository is MPL-2.0. Any source files and patches here
that modify MPL-covered editor code must stay available under MPL-2.0 with the
required notices.

The private SaaS service is a separate larger work. It does not need to become
MPL-2.0 merely because it talks to this editor runtime through WOPI, as long as
private service code, secrets, storage, and product logic stay outside this
public runtime repository. Publish release source evidence through
`OPEN_SOURCE_NOTICE.md`, `COMPLIANCE.md`, and the `npm run source-offer` output.

## Development Loop

Fast checks for ordinary script, wrapper, and compliance changes:

```bash
npm run dev:check
```

To start the local editor runtimes together for service integration:

```bash
npm ci --prefix editor_pdf
npm run dev
npm run stop
```

`npm run dev` starts the existing DOCX document editor runtime and the
self-hosted HWP/HWPX Studio runtime from `editor_hwpx/`. `npm run stop` stops
only those editor runtimes. The gateway serves the separate PDF editor once
its `editor_pdf/` dependencies are installed. Local dev defaults to these
stable subpaths:

- DOCX discovery: `http://127.0.0.1:9980/docx/hosting/discovery`
- HWP/HWPX Studio: `http://127.0.0.1:11004/hwpx/`
- PDF editor: `http://127.0.0.1:11004/pdf/`
- Raster image editor: `http://127.0.0.1:11004/image/`
- Vector image editor: `http://127.0.0.1:11004/image/vector/`

## MCP Endpoint

The editor gateway exposes a Streamable HTTP MCP endpoint at `/mcp`. Transport
requests are stateless, while each opened document is an isolated,
revision-bound server session that must be finalized or discarded.
It implements `initialize`, `ping`, `tools/list`, and `tools/call` for DOCX,
HWPX, and PDF workflows. HWPX uses the compact canonical sequence
`open` -> `inspect` -> `edit` -> `review` -> `save` for both HWP and HWPX source bytes. The nine tools expose 38 catalog-driven editing operations without one-tool-per-property duplication. Verified save preserves the source format. Inspection unifies measured styles, ordered structure, exact targets, search, fields, security evidence, mutation history, and live capabilities. Review and finalization can bind semantic expectations and security policy to the accepted revision. See
`docs/HWPX_MCP_API.md` for the nine-tool contract and Browser reload workflow.
DOCX `open` can receive the persisted `storedDocumentId` returned by
`/api/documents` instead of downloading that working copy and sending it back as
Base64. This is an authenticated application-server reference; agents should
not invent or choose stored document IDs.
Finalization returns an opaque `artifactId`; an authenticated application
server retrieves bytes with the matching format-specific `*_artifact_read`
tool. The calling application owns any user-approval
policy. The agent and browser never receive a server-local artifact path.
`artifact_read` does not delete bytes: the caller verifies the reported hash
and saved package, then calls the matching `artifact_delete`. Opportunistic TTL
pruning runs during artifact-producing operations using
`EDITOR_MCP_ARTIFACT_TTL_MS` (24 hours by default).

Agents must call the matching format-specific `*_discard`
with `documentId` and the current `baseRevision` when an edit is cancelled or cannot be
finalized. Discard closes the isolated session and clears its MCP
inspection/inventory/quality/lock state without creating an artifact; repeated
calls complete safely with `deleted=false`.

Large papers are read through bounded projections. Each format's `read_json`
defaults to one compact `summary` item and can page `blocks` or `tables` with
`nextCursor`; text and table-cell previews have hard caps.
Each format's `target_map` pages exactly one `paragraph` or `cell` stream and
returns one `targets` array (no duplicated `editableTargets`/`locations`
aliases). Cursors are integrity-protected and fixed to the current document
revision and query. After any apply, an old cursor fails with `stale_cursor` and
the caller must start a fresh stream. Normal structured pages are budgeted near
9 KiB so the complete MCP JSON-RPC response stays near or below 24 KiB at item
boundaries. See `API.md` and `tools/list` for exact limits and fields.

Document API work runs outside the gateway event loop. The gateway assigns a
document to a stable worker lane, serializes operations for that document, and
runs different document lanes concurrently. REST and MCP request and response
shapes are unchanged: callers still wait for the normal response. The worker
count defaults to the host's available CPU parallelism and can be overridden
with `EDITOR_SESSION_WORKERS`; it is not a user or document-count limit.
Worker threads start lazily. A lane that handles HWPX keeps its WASM runtime
warm for reuse, so HWPX-heavy deployments should size the worker count against
both CPU and available memory rather than treating it as a connection quota.

When the gateway binds beyond loopback, startup is fail-closed unless a Bearer
token is configured:

```bash
ACADEMIC_EDITOR_MCP_BEARER_TOKEN='<strong-random-secret>' \
npm run start
```

Consumers configure `ACADEMIC_EDITOR_API_ORIGIN`, preferably through an HTTPS
reverse proxy such as `https://editor.example.com`, and use its fixed `/mcp`
path. Both MCP and `/api/documents` use `ACADEMIC_EDITOR_MCP_BEARER_TOKEN` in
the `Authorization` header. WOPI uses a separate short-lived signed document
token; never reuse either token for the other role. Do not send a Bearer token to a public plain-HTTP
endpoint or put it in prompts, JSON-RPC arguments, or source control.

`npm run dev:check` runs the public-safety scan, runtime unit tests, and syntax
checks without starting a server. To start the editor, verify
`/hosting/discovery` plus `cool.html`, and then stop only the runtime that the
check created:

```bash
npm run dev:check:runtime
```

If a runtime is already running before the check, it is treated as pre-existing
and left alone. Set `EDITOR_DEV_KEEP_RUNNING=true` only for a manual debugging
session where you intentionally want the runtime to stay up.

Full contract and acceptance checks:

```powershell
npm.cmd run test:runtime
npm.cmd run test:docx-api
npm.cmd run test:hwpx-api
npm.cmd run test:pdf-api
npm.cmd run test:hwpx-dataset
npm.cmd run test:hwpx-evaluation
```

Real Chrome save/reopen checks are intentionally separate because they require
running editor runtimes:

```powershell
npm.cmd run test:docx-browser
npm.cmd run test:docx-page-ratio
npm.cmd run test:hwpx-browser
```

For DOCX with a Docker-based Collabora runtime, the browser-facing gateway may
use `127.0.0.1`, but `EDITOR_GATEWAY_WOPI_BASE_URL` must use
`host.docker.internal` so the container can call back to WOPI. The Collabora
alias group must allow the same WOPI origin. `test:docx-browser` defaults to
`http://127.0.0.1:11007/docx/`; override `DOCX_ACCEPTANCE_URL` for another
isolated environment. Each browser test closes the Chrome process it creates.
`test:docx-page-ratio` defaults to `http://127.0.0.1:11017/docx/` and expects an
isolated gateway serving a copy of the tracked `tdf149313.docx` fixture. It
asserts the square and custom-landscape page rectangles before editing, after
WOPI save, and after a fresh browser reopen; override
`DOCX_PAGE_RATIO_ACCEPTANCE_URL` when the isolated gateway uses another port.

DOCX automatic spelling is intentionally limited to English (US), English
(UK), Spanish (Spain), French (France), and German (Germany). These menu choices
map to the vendored LibreOffice Hunspell dictionaries and are checked by
`editor_docx/scripts/spellcheck-dictionary-contract.test.mjs`, including locale
registration, dictionary size, root-word lookup, affix-generated forms, and
negative typo samples. The Korean engine pack remains installed for the UI and
document locale, but Korean is not offered as a verified spell-check language.
A fully rendered acceptance check still requires an editable WOPI document;
the source contract test does not substitute for that runtime check.

For browser/server source hacking on a Linux dev host, use the source loop:

```bash
npm run dev:source:doctor
npm run dev:source:prepare
npm run dev:source:build
npm run dev:source:run
```

`editor_docx/` is the default DOCX editor source tree. `dev:source:prepare`
reuses that tree and reapplies the public patch through
`editor_docx/scripts/apply-docx-editor-patches.mjs`, which reads the Python patch blocks
from `branding/debrand-online.sh`. The prepare step works on Windows; the
actual Collabora build and `make run` steps remain Linux-only.

`dev:source:run` runs `make run` in the foreground with
`COOL_SERVE_FROM_FS=1`. After the first Linux build, browser-side source changes
can be checked with browser Shift+Reload instead of rebuilding a Docker image.
C++ or server behavior changes still require `make` and a runtime restart. Stop
the foreground process with Ctrl+C, or try `npm run dev:source:stop` if the
source tree started a background runtime.

For Windows local integration, use the Docker fallback after building the source
image once:

```powershell
npm.cmd run build:source
npm.cmd run start:docker
npm.cmd run smoke
npm.cmd run stop
```

Docker fallback is useful for integration smoke tests, but source or branding
patches that are compiled into the image still require rebuilding that fallback
image. Script-only changes do not.

## Production Build

Preferred production path:

1. Build the native runtime in this public repository with GitHub Actions.
2. Publish the `native-*` tag release artifact.
3. Install that artifact on the private Linux service server.
4. Run the editor with pm2.

The server-side install command is:

```bash
npm run deps:native
EDITOR_NATIVE_RELEASE_TAG=native-YYYYMMDD npm run install:native:artifact
npm run start:native
npm run doctor:native -- --require-installed
```

## Ubuntu Server Deploy Entrypoints

For the DEV server clone, deploy or restart the editor directly from this
repository:

```bash
cd /home/bitnami/academic_editor_project
./sh.start_dev
```

`sh.start_dev` syncs the current branch, uses native runtime mode, runs the
`academic-editor-native-dev` pm2 process on port `9980`, and verifies the
deployment with native doctor, runtime audit, source-offer output, and smoke
checks. On a fresh DEV server, it can resolve the latest `native-*` GitHub
release automatically. The installed release tag is recorded under the runtime
directory, so later deploys install a newer release once instead of repeatedly
downloading an unchanged artifact.

For production, pass the real service origin explicitly so DEV URLs cannot leak
into a commercial deployment:

```bash
cd /home/bitnami/academic_editor_project
EDITOR_PUBLIC_URL=https://your-service-domain.example ./sh.start
```

Production uses the `academic-editor-native` pm2 process and the pinned
`native-20260728-008` release by default. `sh.start` compares that tag with the
installed release marker: it installs a missing or newer pinned artifact once,
then only restarts and verifies it on later deploys. To test another release,
override the tag explicitly:

```bash
EDITOR_PUBLIC_URL=https://your-service-domain.example \
EDITOR_NATIVE_RELEASE_TAG=native-YYYYMMDD \
./sh.start
```

The production deploy validates the repository-owned HWPX core under
`editor_hwpx/pkg`, materializes that exact artifact into the Studio dependency
trees, and builds only the Studio static UI. Production servers therefore do
not need `wasm-pack`, Rust, or Docker. Rebuilding the HWPX WASM itself is an
explicit build-host operation (`npm --prefix editor_hwpx run build:core`), not a
normal deployment step.

Both entrypoints accept the same runtime variables documented below. `sh.start`
automatically installs only the missing Ubuntu runtime dependencies (including
Poppler), never the native source-build toolchain, and restores each isolated
PDF/HWPX npm workspace whenever its tracked
`package-lock.json` changes or `node_modules` is missing. Set
`EDITOR_NATIVE_AUTO_DEPS=false` only on a locked-down server with the native
dependencies already provisioned. Other useful overrides are
`EDITOR_HOST_PORT`, `EDITOR_NATIVE_PM2_NAME`, `EDITOR_REPO_SYNC=false`, and
`EDITOR_RECREATE=false`. The entrypoints intentionally use the native pm2
runtime and do not run a slow Docker build.

Direct server builds are still supported on larger Linux build hosts:

```bash
npm run deps:native
npm run build:native
npm run package:native
npm run install:native
```

The native build fetches official upstream source-build files, injects this
repository's public debranding patch, builds the online server/browser from
source, uses the official engine asset archive by default, and installs the
resulting runtime into the Linux server filesystem. It does not need Docker.

Small app servers should not compile the runtime directly. The source checkout
and native build can need several GB of temporary disk. Use the GitHub Actions
artifact route for development, staging, and production servers unless the host
has enough free disk and memory for a source build.

The full engine source build is still available for a larger build host by
setting `EDITOR_ENGINE_ASSETS=source`, but it needs substantially more disk and
memory than a small application server usually has.

Useful native build environment variables:

- `EDITOR_SOURCE_REPO`: upstream source repo. Default: `https://gerrit.collaboraoffice.com/online`.
- `EDITOR_SOURCE_REF`: upstream branch or tag. Default: `main`.
- `EDITOR_ENGINE_ASSETS`: engine archive URL. Default:
  `https://github.com/CollaboraOnline/online/releases/download/for-code-assets/engine-main-assets.tar.gz`.
  Set to `source`, `none`, or `false` only when the server has enough disk and
  memory for a full engine source build.
- `EDITOR_NATIVE_BUILD_DIR`: local temporary build directory. Default: `.build/native-editor`.
- `EDITOR_NATIVE_PREPARE_ONLY`: set to `true` to prepare the generated native build context without compiling.
- `EDITOR_NATIVE_ARTIFACT_URL`: direct artifact URL for `npm run install:native:artifact`.
- `EDITOR_NATIVE_RELEASE_TAG`: GitHub release tag such as `native-YYYYMMDD`.
- `EDITOR_NATIVE_RELEASE_MARKER`: installed release marker. Default:
  `/var/lib/academic-editor/native-release-tag`.
- `EDITOR_NATIVE_ARTIFACT`: local tarball path for `npm run install:native:artifact`.
- `EDITOR_NATIVE_RUNTIME_DIR`: runtime state directory. Default: `/var/lib/academic-editor`.
- `EDITOR_NATIVE_CACHE_DIR`: runtime cache directory. Default: `/var/cache/academic-editor`.
- `EDITOR_DISABLE_COOL_USER_CHECKING`: set to `false` only when the pm2
  process runs as the dedicated `cool` OS user. Default: `true` for Bitnami/app
  server pm2 deployments.

## Optional Docker Fallback

Docker fallback is useful for Windows local development or isolated testing. It
is not the preferred production path.

```bash
npm run build:source
npm run start:docker
```

Default output image: `academic-editor/document-editor:source`.

Useful Docker build environment variables:

- `EDITOR_IMAGE`: output image tag. Default: `academic-editor/document-editor:source`.
- `EDITOR_AUTO_BUILD_SOURCE_IMAGE`: set to `true` to let `npm run start` build
  the source fallback image automatically when it is missing. Keep this for
  local development only; production should use native mode.
- `EDITOR_SOURCE_REPO`: upstream source repo. Default: `https://gerrit.collaboraoffice.com/online`.
- `EDITOR_SOURCE_REF`: upstream branch or tag. Default: `main`.
- `EDITOR_ENGINE_ASSETS`: engine archive URL. Default:
  `https://github.com/CollaboraOnline/online/releases/download/for-code-assets/engine-main-assets.tar.gz`.
- `EDITOR_SOURCE_BUILD_DIR`: local temporary build directory. Default: `.build/document-editor-source-image`.
- `EDITOR_PREPARE_ONLY`: set to `true` to prepare and verify the generated Docker build context without compiling the full image.
- `EDITOR_DOCKER_NO_CACHE`: set to `true` when a clean Docker fallback rebuild is required. Default: `false`.

## Run

```bash
npm run start
npm run start:native
npm run status
npm run stop
```

`npm run start` uses `EDITOR_RUNTIME_MODE=auto`: native pm2 runtime when a Linux
native install exists, otherwise Docker fallback. Production scripts should set
`EDITOR_RUNTIME_MODE=native` so they fail fast if the native runtime was not
installed.

After the editor is started on a Linux server, run:

```bash
npm run doctor:native -- --require-installed
npm run audit:native
npm run source-offer
```

This checks that the native binaries, runtime directories, pm2 process, and
editor port are actually available. `npm run audit:native` writes a JSON audit
file under `.build/audits/` with the public repo commit, source ref, public
safety result, native doctor result, pm2 status, and discovery endpoint result.
`npm run source-offer` writes a release source-offer note under
`.build/source-offers/` so the exact public patch commit and upstream source ref
are retained with the deployment evidence.

Runtime environment variables:

- `EDITOR_RUNTIME_MODE`: `auto`, `native`, or `docker`. Default: `auto`.
- `EDITOR_NATIVE_PM2_NAME`: native pm2 process name. Default: `academic-editor-native`.
- `EDITOR_HOST_PORT`: editor port. Default: `9980`.
- `EDITOR_SERVICE_ROOT`: document editor URL prefix. `npm run dev` defaults to `/docx`.
- `EDITOR_SESSION_WORKERS`: document API worker lanes. Defaults to the host's
  available CPU parallelism; this is not a user or document-count limit.
- `EDITOR_DOCUMENT_MAX_COUNT`: optional persistent DOCX storage count cap. It
  is unset by default; configure it only when an operational quota is required.
- `EDITOR_PUBLIC_URL`: public service origin used by browser iframes.
- `EDITOR_INTERNAL_SERVER_URL`: internal editor origin. Default: `http://127.0.0.1:${EDITOR_HOST_PORT}`.
- `EDITOR_DISCOVERY_SERVER_URL`: discovery origin. Default: `EDITOR_INTERNAL_SERVER_URL`.
- `EDITOR_ALLOWED_DOMAIN`: WOPI host allow-list pattern. Default: `.*`.
- `EDITOR_ADMIN_USERNAME`: admin username for the editor runtime. Default: `admin`.
- `EDITOR_ADMIN_PASSWORD`: admin password for local runtime only. Override in private deployment secrets.
- `EDITOR_DISABLE_COOL_USER_CHECKING`: default `true` so pm2 can run under the
  application server user. Set `false` only after moving the editor PM2 process
  to the dedicated `cool` OS user.
- `EDITOR_EXTRA_PARAMS`: runtime flags. Defaults disable SSL inside the container, derive proxy termination from `EDITOR_PUBLIC_URL`, and disable welcome/update popups.
- `EDITOR_IMAGE`: Docker fallback image. Default: `academic-editor/document-editor:source`.
- `EDITOR_CONTAINER_NAME`: Docker fallback container name. Default: `academic-editor-local`.

## Branding

Normal end users should not see upstream product marks in the editor workflow.
The build process applies `branding/debrand-online.sh` before compiling browser
and server assets. The in-tree `editor_docx/` source can be patched on Windows
with `editor_docx/scripts/apply-docx-editor-patches.mjs`; Linux source/native builds still
inject the bash patch into the generated build context. Required legal notices
are preserved in this public repository and should be linked from a small
service-level open-source notice page.

## Compliance

Read `COMPLIANCE.md` before changing the build or runtime path.

Run before pushing:

```bash
npm run dev:check
```
