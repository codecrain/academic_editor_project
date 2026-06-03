# Academic Editor Project

Commercial SaaS status comes first: this project must be used only through a
source-built image from this public repository, or through another image with a
documented commercial-safe license basis. Do not use `collabora/code` in local,
development, staging, or production.

This repository contains the public document-editor runtime layer. It is kept
separate from the private Tlooto service repository so service secrets, WOPI
tokens, database code, user data, and proprietary business logic do not enter
the open-source tree.

## What This Repository Owns

- Source-build orchestration for the document editor image.
- Public debranding patch files applied before compilation.
- Runtime container start/status/stop scripts.
- License and compliance documentation.

The private service repository owns the WOPI host, authentication, storage,
database, project/report UI, and deployment secrets.

## Build

```bash
npm run build:source
```

Default output image:

```text
academic-editor/document-editor:source
```

The build script fetches official upstream source-build Docker files, injects
this repository's public debranding patch, and builds the image locally. By
default `EDITOR_ENGINE_ASSETS` is empty so the engine is built from source.

Useful build environment variables:

- `EDITOR_IMAGE`: output image tag. Default: `academic-editor/document-editor:source`.
- `EDITOR_SOURCE_REPO`: upstream source repo. Default: `https://github.com/CollaboraOnline/online.git`.
- `EDITOR_SOURCE_REF`: upstream branch or tag. Default: `main`.
- `EDITOR_ENGINE_ASSETS`: optional prebuilt engine archive. Keep empty unless legal review accepts that binary source.
- `EDITOR_SOURCE_BUILD_DIR`: local temporary build directory. Default: `.build/document-editor-source-image`.
- `EDITOR_PREPARE_ONLY`: set to `true` to prepare and verify the generated Docker build context without compiling the full image.

## Run

```bash
npm run start
npm run status
npm run stop
```

Runtime environment variables:

- `EDITOR_IMAGE`: editor image to run. Default: `academic-editor/document-editor:source`.
- `EDITOR_CONTAINER_NAME`: Docker container name. Default: `academic-editor-local`.
- `EDITOR_HOST_PORT`: host port mapped to container `9980`. Default: `9980`.
- `EDITOR_PUBLIC_URL`: public service origin used by browser iframes.
- `EDITOR_INTERNAL_SERVER_URL`: internal editor origin. Default: `http://127.0.0.1:${EDITOR_HOST_PORT}`.
- `EDITOR_DISCOVERY_SERVER_URL`: discovery origin. Default: `EDITOR_INTERNAL_SERVER_URL`.
- `EDITOR_ALLOWED_DOMAIN`: WOPI host allow-list pattern. Default: `.*`.
- `EDITOR_ADMIN_USERNAME`: admin username for the editor container. Default: `admin`.
- `EDITOR_ADMIN_PASSWORD`: admin password for local runtime only. Override in private deployment secrets.
- `EDITOR_EXTRA_PARAMS`: runtime flags. Defaults disable SSL inside the container, derive proxy termination from `EDITOR_PUBLIC_URL`, and disable welcome/update popups.

## Branding

Normal end users should not see upstream product marks in the editor workflow.
The build process applies `branding/debrand-online.sh` before compiling browser
and server assets. Required legal notices are preserved in this public repository
and should be linked from a small service-level open-source notice page.

## Compliance

Read `COMPLIANCE.md` before changing the build or runtime path.

Run before pushing:

```bash
npm run verify:public
node --check scripts/start-editor.mjs
node --check scripts/build-source-editor-image.mjs
```
