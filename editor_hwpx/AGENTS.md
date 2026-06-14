# Repository Guidelines

This package vendors the upstream `edwardkim/rhwp` source directly at this package root and provides local scripts for running RHWP Studio as a separate HWP/HWPX editor runtime.

- Keep DOCX/Collabora runtime work in `C:\CC\academic_editor_project`; do not mix it into this package.
- Keep SaaS host integration in `client/serviceV2`; this package only owns RHWP source, install, build, and runtime startup.
- Upstream source changes should stay in this package root. Local orchestration scripts belong under this package's `scripts/` directory.
- Do not commit `node_modules`, `dist`, temporary downloads, or generated runtime caches.
