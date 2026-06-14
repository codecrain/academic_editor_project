# Hancom webhwp vs rhwp: HWP Parsing Architecture Comparison Briefing

> Analysis target: `/webhwp/js/hwpApp.*.chunk.js` (minified 5.17MB, webpack bundle)
> Analysis date: 2026-02-09

## Key Conclusion

**Hancom webhwp does not parse HWP on the client side.**

The server parses the HWP file and converts it to a JSON document model, which is then delivered to the client. The client receives this JSON and only performs rendering and editing.

## 1. HWP Parsing Location Comparison

```
Hancom webhwp:
+----------+    documentJson    +------------------+
|  Server   | ----------------> |  Browser (JS)     |
|  HWP Parse|                   |  Rendering + Edit |
|  JSON Conv| <---------------- |  Send OT edit cmds|
+----------+    revision/OT     +------------------+

rhwp:
+------------------------------------+
|        Browser (WASM + JS)          |
|  HWP Parse + Render + Edit + Save   |
|  No server required                 |
+------------------------------------+
```

## 2. Evidence: No HWP Parser on the Client

Search results for the following keywords in the webhwp JS bundle -- **all 0 matches**:

| Keyword | Meaning | Search Result |
|---------|---------|---------------|
| `CompoundFile`, `CFB`, `CFBReader` | OLE Compound File parser | 0 matches |
| `BodyText`, `DocInfo`, `BinData` | HWP stream names | 0 matches |
| `HWPTAG`, `tagId`, `recordHeader` | HWP record tags | 0 matches |
| `WebAssembly`, `.wasm` | WASM modules | 0 matches |
| `Section0`, `Section1` | HWP body text streams | 0 matches |

## 3. Server -> Client Data Flow

### 3.1 Document Loading

```javascript
// Receive document JSON from server and deliver to app
E.loadDocument(function(t) {
    // t.documentJson.content = result of server parsing HWP
    c.loadHwpApp(t.documentJson);
});

// Deliver JSON data to engine internally
window.HwpApp.TKs(content.bi, function() {
    window.HwpApp.document.open(data, "");
    // "Hwp Document Data Load Failed (Engine)!" error message
});
```

### 3.2 Server-Dependent Features (RPC Calls)

| RPC Method | Purpose |
|-----------|---------|
| `getFontWidthFromServer(font, char, callback)` | Server query for character width of fonts not on client |
| `_getData(uniqueId, fileName, type, mime)` | Fetch conversion data (PDF, etc.) from server |
| `printDocument(id, url, options, callback)` | Server-side print conversion |
| `insertFileByFileBlob(blob, ...)` | Server processing for file insertion |
| `insertFileByUrl(url, ...)` | Server processing for URL file insertion |

### 3.3 Collaborative Editing (OT)

```javascript
// Operational Transform-based real-time collaboration
revision: n.revision + 1,
connectOtEngine()    // Connect OT engine
unloadDocument()     // Unload document
// OT error codes: OT1(100) ~ OT8(106), OT_OFFLINE(107-110)
```

## 4. Client Role Comparison

| Feature | Hancom webhwp Client | rhwp Client |
|---------|---------------------|-------------|
| **HWP Binary Parsing** | X (server performs) | O (WASM) |
| **CFB/OLE Reading** | X | O (Rust) |
| **Document Model Construction** | Receive server JSON | Direct parsing in WASM |
| **Layout/Line Breaking** | JS (client) | Rust->WASM (client) |
| **Text Measurement** | JS Canvas `measureText()` | Rust->WASM `measureText()` callback |
| **Canvas Rendering** | JS (per-character `fillText`) | JS (per-run `fillText`) |
| **Text Editing** | JS (OT commands -> server sync) | JS (direct Document IR modification) |
| **HWP Saving** | Server regenerates HWP | Direct serialization in WASM |
| **Offline Operation** | Not possible (server required) | Possible |

## 5. Tech Stack Comparison

| Item | Hancom webhwp | rhwp |
|------|-------------|------|
| **HWP Parser Language** | Server (language unknown, likely Java or C++) | Rust |
| **Client Engine** | Pure JavaScript (5.17MB) | Rust->WASM + JavaScript |
| **Bundling** | Webpack code-splitting (9 chunks) | wasm-pack + manual JS |
| **Font Metrics** | 318 font definitions embedded in JS + server fallback | System font dependent |
| **Document Model** | Server JSON based | Rust Document IR |
| **i18n** | 22 languages supported | Korean-focused |
| **UI Framework** | React (presumed) | Pure JS |

## 6. Font Handling Differences

### Hancom webhwp
- **318 font metrics embedded**: Hard-coded in JS as `{fontname, height, width, charset, iYt, nYt}` format
- **`iYt` (advance width base)**: Per-font reference value (mostly 1024, 2048)
- **Server fallback**: `getFontWidthFromServer()` RPC for fonts not in embedded metrics
- **Web font bundle**: 12+ woff2 files (19.4MB) -- Korean/English/special fonts

### rhwp
- **System font dependent**: Uses fonts installed on the OS
- **Direct `measureText()` measurement**: High-precision 1000px Canvas measurement
- **Korean monospaced assumption**: All Korean syllables = 'ga' measurement value (same strategy as Hancom)
- **Web fonts**: 7 woff2 files (7.7MB)

## 7. Architectural Implications

### Hancom's Choice: Server Parsing + Client Rendering

**Advantages:**
- Concentrate HWP parsing logic on server -> can reuse existing desktop engine
- Client code is independent of HWP format -> only needs to understand JSON
- OT-based real-time collaborative editing possible
- Server font width fallback ensures precision

**Constraints:**
- Cannot operate without server (no offline support)
- Network latency occurs (document open, save, font queries)
- Server infrastructure operating costs

### rhwp's Choice: Fully Self-Contained Client

**Advantages:**
- Completely server-free -> zero infrastructure cost
- Offline operation possible
- No network latency
- Direct HWP binary control (parsing + saving)

**Constraints:**
- Must implement HWP format from scratch (high technical barrier)
- System font dependent (uncertain fallback when fonts missing)
- Separate OT infrastructure needed for collaborative editing

## 8. Summary

| Comparison Item | Hancom webhwp | rhwp |
|-----------------|-------------|------|
| **HWP Parsing Location** | Server | Client (WASM) |
| **Client Role** | Rendering + editing UI | Parsing + rendering + editing + saving |
| **Server Role** | HWP parsing/conversion/saving/fonts | None (static hosting only) |
| **Data Format** | Server JSON <-> client | HWP binary <-> Document IR |
| **Offline** | Not possible | Possible |
| **Collaborative Editing** | OT-based supported | Not implemented |

---

*Written: 2026-02-09*
