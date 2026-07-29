# Open-source notice: Image Studio

Only permissively licensed components may be shipped by Image Studio.

| Component | License | Pinned version/revision | Purpose |
| --- | --- | --- | --- |
| [miniPaint](https://github.com/viliusle/miniPaint) | MIT | `a79733eb803fc97084ef0ee4faa96b031e69e1c0` (4.14.3) | Raster editor, layer model, paint/selection/filter tools |
| [Fabric.js](https://github.com/fabricjs/fabric.js) | MIT | `7.4.0` | Vector canvas, objects, transforms, SVG/JSON serialization |

The miniPaint MIT license is retained at
`vendor/minipaint/MIT-LICENSE.txt`. Fabric.js is pinned in `package-lock.json`;
its package license is retained by `npm ci` under
`node_modules/fabric/LICENSE`.

Fabric's Node-only `canvas` and `jsdom` dependency trees are marked optional and
are not needed by the browser workbench. Local and production installation uses
`--omit=optional`, so those packages are not shipped. The lockfile still records
them for reproducibility, and the license contract test checks every locked
package (including omitted optional packages) against the permissive allowlist.

Every new runtime dependency must satisfy all of these conditions:

1. SPDX license is MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, or another
   explicitly approved permissive license.
2. The exact version is locked and its shipped transitive dependency licenses
   are reviewed.
3. Required notices are included in the distribution.
4. Copyleft, source-available, non-commercial, and hosted-only components are
   rejected.

The complete SVG-Edit application is deliberately excluded because its
repository package license expression includes LGPL-3.0-or-later. Its separately
published MIT `@svgedit/svgcanvas` core may be evaluated later, but it is not
currently bundled. Candidate future components such as `ag-psd` and Color.js
remain candidates until the same pinned dependency audit and distribution
notice checks pass.

No OCR engine, hosted image API, generative model, or background-removal model
is bundled.
