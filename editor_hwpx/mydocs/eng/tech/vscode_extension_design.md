# rhwp VSCode Extension Design Document

## 1. Overview

A read-only viewer extension for opening HWP/HWPX files directly in VSCode.
Reuses the existing rhwp WASM rendering pipeline to deliver the same rendering quality as rhwp-studio.

## 2. Architecture

```
+--------------------------------------------------+
| Extension Host (Node.js)                         |
|                                                  |
|  extension.ts -> HwpEditorProvider               |
|    |- openCustomDocument(): store file URI        |
|    |- resolveCustomEditor(): create Webview       |
|    |    |- Webview HTML + CSP config              |
|    |    +- onDidReceiveMessage('ready')           |
|    |         |- workspace.fs.readFile(hwp)        |
|    |         |- workspace.fs.readFile(wasm)       |
|    |         +- postMessage({ fileData, wasmData })|
|    +- Message protocol management                |
+--------------------------------------------------+
| Webview (Browser Sandbox)                        |
|                                                  |
|  viewer.js (webpack bundle = viewer.ts + rhwp.js)|
|    |- initSync(wasmBuffer)                       |
|    |- new HwpDocument(hwpBytes)                  |
|    |- Virtual scroll (placeholder + on-demand render)|
|    |- renderPageToCanvas(pageNum, canvas, scale)  |
|    +- Ctrl+Wheel zoom                            |
+--------------------------------------------------+
```

## 3. Message Protocol

### Host -> Webview

| type | Fields | Description |
|------|--------|-------------|
| `load` | `fileName: string` | File name |
| | `fileData: number[]` | HWP file binary (Uint8Array -> Array) |
| | `wasmData: number[]` | WASM binary (Uint8Array -> Array) |

### Webview -> Host

| type | Fields | Description |
|------|--------|-------------|
| `ready` | -- | Webview initialization complete, requesting data |
| `loaded` | `pageCount: number` | Document load complete, total page count |

## 4. WASM Loading Strategy

### Choice: `initSync` + postMessage Binary Transfer

```
Extension Host                          Webview
     |                                     |
     |  <- postMessage({ type: 'ready' })  |
     |                                     |
     |  workspace.fs.readFile(wasm) ---->  |
     |  workspace.fs.readFile(hwp)  ---->  |
     |                                     |
     |  postMessage({ wasmData, fileData })|
     |  ---------------------------------> |
     |                                     |
     |                    initSync(wasmBuffer)
     |                    new HwpDocument(hwpBytes)
     |                    renderPageToCanvas()
```

**Rationale**:
- `asWebviewUri` does not set `application/wasm` MIME type for `.wasm` files, causing `WebAssembly.instantiateStreaming()` to fail
- `initSync` does not use `fetch`/`import.meta.url`, making it safe for webpack bundles
- VSCode 1.82+ supports efficient `Uint8Array` postMessage transfer (structured cloning)

### CSP Configuration

```
default-src 'none';
script-src 'nonce-{nonce}' {cspSource};
style-src 'nonce-{nonce}' {cspSource};
img-src {cspSource} data:;
font-src {cspSource};
connect-src {cspSource};
wasm-unsafe-eval
```

`wasm-unsafe-eval` is the key -- it allows `WebAssembly.instantiate()`.

## 5. Directory Structure

```
rhwp-vscode/
|- package.json              # Extension manifest
|- tsconfig.json             # Extension Host TypeScript
|- tsconfig.webview.json     # Webview TypeScript
|- webpack.config.js         # Dual bundle (host + webview)
|- .vscodeignore             # Distribution exclusion list
|- .gitignore
|- src/
|   |- extension.ts          # activate/deactivate entry point
|   |- hwp-editor-provider.ts # CustomReadonlyEditorProvider implementation
|   +- webview/
|       +- viewer.ts         # Webview viewer (WASM init + rendering)
+- dist/                     # Build output (git excluded)
    |- extension.js          # Extension Host bundle
    |- webview/viewer.js     # Webview bundle (includes rhwp.js)
    +- media/rhwp_bg.wasm    # WASM binary (CopyPlugin)
```

## 6. Build Pipeline

```
pkg/rhwp.js -----------+
                       +- webpack (webview) --> dist/webview/viewer.js
src/webview/*.ts ------+
                       CopyPlugin -----------> dist/media/rhwp_bg.wasm
pkg/rhwp_bg.wasm ------+

src/extension.ts ----------- webpack (host) --> dist/extension.js
src/hwp-editor-provider.ts -+
```

### Webpack Configuration Points

| Item | Configuration |
|------|---------------|
| Extension Host | `target: 'node'`, `externals: { vscode }` |
| Webview | `target: 'web'`, `alias: { '@rhwp-wasm': '../pkg' }` |
| WASM File | `null-loader` (disable webpack's automatic asset handling) |
| WASM Copy | `copy-webpack-plugin` -> `dist/media/` |

## 7. Virtual Scroll

Virtual scrolling is applied to ensure smooth scrolling even with large documents (hundreds of pages).

### Behavior

1. **Initialization**: Create empty `div` placeholders for all pages (with actual dimensions)
2. **Scroll**: Call `renderPageToCanvas()` only for pages within viewport + buffer (300px)
3. **Release**: Remove Canvas for pages outside the viewport -> save memory
4. **Zoom**: Ctrl+mouse wheel for 0.25x to 3.0x zoom. Scroll ratio preserved

### Differences from rhwp-studio

| Item | rhwp-studio | rhwp-vscode |
|------|-------------|-------------|
| Virtual Scroll | canvas-view.ts + virtual-scroll.ts | viewer.ts single file |
| Page Pooling | Yes (pool/release) | Placeholder + on-demand |
| Editing Support | InputHandler etc. | None (read-only) |
| Font Loading | font-loader.ts | WASM built-in (system fonts) |

## 8. Separation Principle from rhwp-studio

- `rhwp-vscode/` is an **independent package**. It does not import `rhwp-studio/` code.
- The only shared dependency: `pkg/` (WASM build output)
- Webview code (virtual scroll, etc.) references rhwp-studio but is independently implemented
- Each package uses different build tools: `rhwp-studio`=Vite, `rhwp-vscode`=webpack

## 9. Future Extension Roadmap

### v0.2 -- Editing Support

- `CustomReadonlyEditorProvider` -> `CustomEditorProvider` transition
- Text input, cursor, selection
- Undo/Redo

### v0.3 -- Additional Features

- Text search (Ctrl+F)
- Outline view (heading/TOC tree)
- SVG/PDF export commands
- Thumbnail sidebar

### v0.4 -- Distribution

- VSCode Marketplace publishing
- `.vsix` packaging automation (CI/CD)
- Web VSCode (vscode.dev) support
