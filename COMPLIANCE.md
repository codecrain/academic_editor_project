# Compliance Policy

Commercial use status:

The intended production path is the native source-built runtime from this public
repository, installed on the Linux server and managed by pm2. The repository is
licensed under MPL-2.0 and keeps the runtime source patches public. This is the
path to use for commercial SaaS deployment.

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
- The public CODE Docker image is documented by Collabora as a development
  edition and not recommended for production. This repository must not use that
  image as a Tlooto SaaS runtime.
  https://www.collaboraonline.com/code/

Do not use:

- `collabora/code`
- Docker Hub CODE images
- Docker as the default production runtime when native Linux execution is available
- prebuilt engine archives unless separately reviewed
- private Tlooto secrets or service configuration in this public repository

Required release practice:

1. Build the native editor runtime from this repository.
2. Record the git commit SHA used for the build.
3. Record the upstream source ref used for the build.
4. Run `npm run doctor:native -- --require-installed` and `npm run audit:native` on the server after starting the runtime.
5. Run `npm run source-offer` and retain the generated source-offer note with the release evidence.
6. Publish the runtime commit SHA and upstream source ref in the Tlooto open-source notice page.
7. Preserve MPL-2.0 and third-party notices.
8. Keep WOPI host secrets and service configuration only in the private service repository or deployment secret store.

Branding policy:

End users should see Tlooto product UI and generic editor wording only. The
debranding patch removes user-facing upstream product marks from browser/server
assets before compilation. Legal notices may still identify upstream authorship
where required, but those notices should be placed in a minimal legal/open-source
notice page, not in the normal editor workflow.

Verification:

Run before commit:

```bash
npm run verify:public
node --check scripts/start-editor.mjs
node --check scripts/doctor-native-editor.mjs
node --check scripts/audit-native-editor-runtime.mjs
node --check scripts/export-source-offer.mjs
node --check scripts/build-native-editor.mjs
node --check scripts/install-native-editor.mjs
node --check scripts/run-native-editor.mjs
node --check scripts/build-source-editor-image.mjs
```
