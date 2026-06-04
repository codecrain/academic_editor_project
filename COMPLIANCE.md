# Compliance Policy

Commercial use status:

The intended production path is the native runtime from this public repository,
built in a public CI/build environment, installed on the Linux service server
from the release artifact, and managed by pm2. The online server/browser is
built from public source with public source patches. The engine uses the official
public engine asset archive by default so small application servers do not need
to compile the full office engine locally. The repository is licensed under
MPL-2.0 and keeps the runtime source patches public. This is the path to use for
commercial SaaS deployment.

License boundary:

- Keep this public runtime repository, including source patches and build
  scripts that modify MPL-covered editor code, under MPL-2.0.
- Keep the private SaaS service repository separate. The WOPI host,
  authentication, storage, billing, product UI, deployment secrets, and
  proprietary service code do not become MPL-2.0 merely because they integrate
  with this runtime over WOPI.
- Do not copy private service code or secrets into this public repository.
- Publish a service-level open-source notice that links to this repository,
  `OPEN_SOURCE_NOTICE.md`, and the exact runtime source-offer evidence for the
  deployed release.

Official basis checked on 2026-06-03:

- Mozilla MPL FAQ says MPL-covered software may be used by anyone, including
  companies, for any purpose; obligations are triggered mainly by distribution.
  https://www.mozilla.org/en-US/MPL/2.0/FAQ/
- MPL 2.0 Sections 3.1 and 3.2 require source availability and recipient notice
  when Covered Software is distributed in source or executable form.
  https://www.mozilla.org/en-US/MPL/2.0/
- MPL 2.0 does not grant trademark, service mark, or logo rights except where
  needed for source notice compliance.
  https://www.mozilla.org/en-US/MPL/2.0/
- Collabora's trademark policy says modified Collabora Productivity binaries
  must remove trademark uses of the marks. This is why this repository applies
  source-level debranding before compilation.
  https://www.collaboraonline.com/trademark-policy/
- The source build scripts use Collabora's official Gerrit source repository
  (`https://gerrit.collaboraoffice.com/online`) rather than the GitHub mirror,
  because the mirror does not include the `engine/` tree required for an
  `ENGINE_ASSETS`-free source build.
- The public CODE Docker image is documented by Collabora as a development
  edition and not recommended for production. This repository must not use that
  image as a Tlooto SaaS runtime.
  https://www.collaboraonline.com/code/
- Collabora's public build guide documents the
  `engine-main-assets.tar.gz` path for building the online side without
  compiling the full engine, and says that path is enough when working only on
  the online side or when quickly getting going.
  https://collaboraonline.github.io/post/build-code/

Do not use:

- `collabora/code`
- Docker Hub CODE images
- Docker as the default production runtime when native Linux execution is available
- private or undocumented binary editor packages
- private Tlooto secrets or service configuration in this public repository

Required release practice:

1. Build the native editor runtime from this public repository, preferably with
   the `Native Editor Runtime` GitHub Actions workflow.
2. Publish a `native-*` release artifact or retain the generated artifact with
   the deployment evidence.
3. Install the artifact on the private service server with
   `npm run install:native:artifact`.
4. Record the git commit SHA used for the build.
5. Record the upstream source ref used for the build.
6. Record the engine asset URL, or record `source` when a full engine source
   build is used.
7. Run `npm run doctor:native -- --require-installed` and `npm run audit:native` on the server after starting the runtime.
8. Run `npm run source-offer` and retain the generated source-offer note with the release evidence.
9. Publish the runtime commit SHA, upstream source ref, and engine asset/source
   choice in the Tlooto open-source notice page.
10. Preserve MPL-2.0 and third-party notices.
11. Keep WOPI host secrets and service configuration only in the private service repository or deployment secret store.
12. Prefer running the native editor PM2 process as a dedicated `cool` OS user in
   hardened production. Bitnami/app-server PM2 deployments may set
   `EDITOR_DISABLE_COOL_USER_CHECKING=true` to run under the application user,
   but this is an operational security tradeoff and not a license workaround.

Branding policy:

End users should see Tlooto product UI and generic editor wording only. The
debranding patch removes user-facing upstream product marks from browser/server
assets before compilation. Legal notices may still identify upstream authorship
where required, but those notices should be placed in a minimal legal/open-source
notice page, not in the normal editor workflow.

Verification:

Run before commit:

```bash
npm run dev:check
```

Use `npm run dev:check:runtime` for a local runtime smoke test. It starts the
runtime, checks discovery and `cool.html`, and stops only the runtime that the
check created. If the runtime was already running, it is left running.
