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

- Source-build orchestration for the native document editor runtime.
- Optional source-built Docker fallback for local/isolated testing.
- Public debranding patch files applied before compilation.
- Runtime start/status/stop scripts for native pm2 and Docker fallback.
- License and compliance documentation.

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

This runs the public-safety scan, runtime unit tests, and syntax checks without
starting a server. To start the editor, verify `/hosting/discovery` plus
`cool.html`, and then stop only the runtime that the check created:

```bash
npm run dev:check:runtime
```

If a runtime is already running before the check, it is treated as pre-existing
and left alone. Set `EDITOR_DEV_KEEP_RUNNING=true` only for a manual debugging
session where you intentionally want the runtime to stay up.

For browser/server source hacking on a Linux dev host, use the source loop:

```bash
npm run dev:source:doctor
npm run dev:source:prepare
npm run dev:source:build
npm run dev:source:run
```

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
and server assets. Required legal notices are preserved in this public repository
and should be linked from a small service-level open-source notice page.

## Compliance

Read `COMPLIANCE.md` before changing the build or runtime path.

Run before pushing:

```bash
npm run dev:check
```
