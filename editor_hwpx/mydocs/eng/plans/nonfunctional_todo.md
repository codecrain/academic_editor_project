# Non-Functional Work TODO — "Breaking Out of the Shell"

> If features are the skeleton, non-functional work gives that skeleton a voice.
> For rhwp to become "everyone's word processor", code alone is not enough.
> People need to discover it, understand it, trust it, and participate.

## 1. The Project's Face — First Impressions

The GitHub README is the front door of the project. Visitors decide in 3 seconds whether "this is something I need."

### 1.1 README Renewal

The current README is feature-list-centric. Brand identity doesn't come through.

| Item | Current | Improvement Direction |
|------|------|----------|
| Logo | None | Insert `assets/logo/logo-256.png` |
| Tagline | "R, Everyone's Word Processor" (simple text) | "R — Starting from the egg" + English tagline |
| Screenshots | None | Hancom vs rhwp rendering comparison (3~4 images) |
| Demo link | None | Online demo page URL |
| Badges | Basic 3 | Add VS Code Marketplace downloads, Open VSX, test pass rate |
| Structure | Technology-centric listing | Restructure around user journey (View → Create → Participate) |

### 1.2 Screenshots/Demo GIF

- Document open → rendering process (3-second GIF)
- Side-by-side capture with Hancom's official viewer showing the same document
- Rendering on mobile browser (responsive)
- HWP preview in VS Code extension

### 1.3 Demo Page

- GitHub Pages or separate hosting
- Experience page that immediately renders sample HWP files
- "Upload file → Render" one-click experience

## 2. Foundation of Trust — Quality Visibility

In open source, trust comes from transparency of code quality.

### 2.1 CI/CD Pipeline

| Stage | Tool | Trigger |
|------|------|--------|
| Build | GitHub Actions | push to devel/main |
| Test | cargo test (783+) | PR / push |
| WASM Build | Docker + wasm-pack | release tag |
| Lint | clippy + rustfmt | PR |
| Deploy | VS Code Marketplace + Open VSX | release tag |

### 2.2 Test Coverage

- Current: 783 unit tests (parsing/rendering focused)
- Goal: Expand E2E scenario tests (10+ scenarios)
- Coverage badge (codecov or tarpaulin)
- Visual regression tests (SVG comparison)

### 2.3 Performance Benchmarks

- Large document load time measurement (100+ pages)
- Pagination performance profiling
- WASM bundle size optimization
- Document and transparently publish benchmark results

## 3. The Open Door — Community Participation Foundation

For "everyone's word processor" to not remain a slogan, "everyone" needs to actually be able to participate.

### 3.1 Contribution Guide (CONTRIBUTING.md)

- Development environment setup (completable within 5 minutes)
- First contribution guide (good first issue label)
- Code style conventions
- PR process explanation
- Tone: Welcoming atmosphere, expressions that lower the technical entry barrier

### 3.2 Issue/PR Templates

- Bug Report template (reproduction steps, environment, screenshots)
- Feature Request template
- PR template (change summary, test checklist)

### 3.3 Code of Conduct (CODE_OF_CONDUCT.md)

- Based on Contributor Covenant
- Bilingual Korean + English

### 3.4 License Cleanup

- LICENSE file verification (MIT, 2025-2026)
- Third-party license listing (THIRD_PARTY_LICENSES.md)
- License specification for WASM distribution artifacts

## 4. The Power of Story — Brand Consistency

A brand is not a logo. It's the feeling users have when they think of the project.

### 4.1 Visual Consistency

| Target | Current | Improvement |
|----------|------|------|
| GitHub README | No logo | Insert from `assets/logo/` |
| VS Code Extension | icon.png exists | Reference from `assets/logo/` (done) |
| rhwp-studio | favicon added | Apply logo + brand colors |
| Demo page | Not built | Follow brand guidelines |
| npm package | Not published | Include logo + README |

### 4.2 Color Palette Application

Apply colors defined in branding strategy to actual UI:

- Navy (#1B3A6B): Primary UI color, header
- Orange (#E8731A): Accent, CTA buttons
- White (#FFFFFF): Background
- Gold (#C8A951): Accent points, icons

### 4.3 Tone and Voice

Consistent tone across all user-facing text:

- **Professional yet friendly**: Don't avoid technical terms, but accompany with explanations
- **Humble yet confident**: Instead of "we're trying", say "we solve"
- **Inclusive**: Instead of "for developers", say "for everyone"

## 5. Technical Documentation — Developer Experience

### 5.1 API Documentation

- WASM binding API reference
- hwpctl compatibility API guide (Hancom Web Editor migration guide)
- Integration examples (React, Vue, vanilla JS)

### 5.2 Architecture Documentation

- Organize technical documents currently scattered across `mydocs/tech/`
- Improve architecture diagrams (currently mermaid-based)
- Parser → Model → Renderer pipeline visualization

### 5.3 CHANGELOG

- Project-wide CHANGELOG.md (SemVer-based)
- Record major changes per milestone
- Coordinate with rhwp-vscode CHANGELOG (already exists)

## 6. Distribution System — Accessibility

### 6.1 npm Package

- Distribute WASM module as npm package
- Package name: `@rhwp/core` or `rhwp`
- Include README, type definitions, usage examples

### 6.2 VS Code Extension Auto-Deploy

- Tag-based auto-deploy from GitHub Actions
- Simultaneous deployment to VS Code Marketplace + Open VSX
- Remove publish.sh dependency (transition to CI/CD)

### 6.3 GitHub Releases

- Auto-generate release notes on tag creation
- Attach WASM build artifacts
- Binary (CLI) distribution (Linux/macOS/Windows)

---

## Milestone Proposal

### M05x (v0.5.x) — Immediately Feasible at Current Stage

**High** priority — Improve project visibility and first impressions

1. README renewal (logo, screenshots, demo link)
2. GitHub Actions CI (build + test)
3. Issue/PR templates
4. CHANGELOG.md creation

### M100 (v1.0.0) — Public Release Preparation

**Medium** priority — Build community participation foundation

5. CONTRIBUTING.md + CODE_OF_CONDUCT.md
6. Demo page (GitHub Pages)
7. npm package distribution
8. API documentation (WASM + hwpctl)
9. CI/CD completion (auto-deploy)

### M200 (v2.0.0) — Community Growth

**Low** priority — After feature maturity

10. Visual regression tests
11. Performance benchmark publication
12. Multilingual documentation (separate English README)
13. Brand guidelines documentation

---

## Principles

> Non-functional work is not "nice to have."
> No matter how excellent the code, if it's not discovered, it's as good as non-existent.
> For "R" to come out into the world, the shell must be broken — that is what non-functional work is.
