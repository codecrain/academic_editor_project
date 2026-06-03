# Compliance Policy

Commercial use status:

The intended production path is a source-built image from this public repository.
The repository is licensed under MPL-2.0 and keeps the runtime source patches
public. This is the path to use for commercial SaaS deployment.

Do not use:

- `collabora/code`
- Docker Hub CODE images
- prebuilt engine archives unless separately reviewed
- private Tlooto secrets or service configuration in this public repository

Required release practice:

1. Build the editor image from this repository.
2. Record the git commit SHA used for the build.
3. Record the upstream source ref used for the build.
4. Publish the image tag and commit SHA in the Tlooto open-source notice page.
5. Preserve MPL-2.0 and third-party notices.
6. Keep WOPI host secrets and service configuration only in the private service repository or deployment secret store.

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
node --check scripts/build-source-editor-image.mjs
```
