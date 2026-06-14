# Web HWP Editor Architecture Comparison Report

## 1. Overview

This report compares the architecture of the commercial Hancom WebGian (web-based HWP editor for government use) with this project (rhwp). Both products pursue the same goal — editing HWP documents in a web browser — but adopt fundamentally different technical approaches.

## 2. Hancom WebGian (Commercial Product)

### 2.1 Product Overview

WebGian is a web-based HWP editing solution developed by Hancom. It is used in government electronic approval systems to create and edit HWP documents. Designed to replace the legacy ActiveX-based desktop integration, it enables direct document editing within the browser.

### 2.2 Architecture: 2-Tier Server Structure

```
+---------------+     HTTP      +-------------------+    Internal    +--------------------+
|  Web Browser  | <-----------> |    Web Server      | <-----------> |   Filter Server     |
|  (Client)     |               |  (Tomcat 7+)       |               |  (RHEL 7+)          |
|               |               |  Java-based         |               |  Hancom Office 2018+ |
+---------------+               +-------------------+               +--------------------+
    ^ HTML/JS                       ^ API Server                       ^ HWP conversion engine
    Display/Input                   Request relay                      Parsing/Rendering/Conversion
```

### 2.3 Core Components

| Component | Role | Requirements |
|-----------|------|-------------|
| Web Server | Receives client requests, relays to filter server, session management | Tomcat 7+, Java 8+, CentOS/RHEL |
| Filter Server | HWP parsing, rendering, format conversion (core engine) | RHEL 7+, Hancom Office 2018+ required |
| Client | HTML/JS-based editing UI, API communication with server | Modern browsers |

### 2.4 How It Works

1. User requests document editing in the browser
2. Web server forwards the HWP file to the filter server
3. Filter server uses the Hancom Office desktop engine for HWP parsing/rendering
4. Converted result (HTML or image format) delivered to client via web server
5. Client-side editing -> changes sent to server -> filter server regenerates HWP

### 2.5 Characteristics and Limitations

**Advantages**:
- Shares the base Hancom Office editing engine -> high compatibility
- 144 keyboard shortcut functions supported
- Integration API with existing electronic approval systems

**Limitations**:
- Hancom Office desktop installation required on the filter server (licensing costs)
- Server-dependent -> editing impossible during network disconnection
- Server load concentration (filter server scaling needed as concurrent users increase)
- Some API functionality limitations due to server-based architecture transition
- Limited to Linux server environments (RHEL 7+ required)

## 3. rhwp (This Project)

### 3.1 Architecture: Pure Client-Side

```
+--------------------------------------------+
|               Web Browser                   |
|                                             |
|  +----------+    +--------------------+     |
|  | Canvas   | <- |  WASM Module       |     |
|  | Rendering|    |  (Rust compiled)   |     |
|  +----------+    |                    |     |
|       ^          |  - HWP Parser      |     |
|  +----------+    |  - Layout Engine   |     |
|  | JS Editor| <- |  - Render Tree    |     |
|  | (editor) |    |  - Serialization  |     |
|  +----------+    +--------------------+     |
|                                             |
|  No server needed - all processing in-browser|
+--------------------------------------------+
```

### 3.2 Core Components

| Component | Role | Technology |
|-----------|------|-----------|
| HWP Parser | HWP 5.0 CFB file -> Document IR conversion | Rust |
| Layout Engine | Document IR -> PageRenderTree generation | Rust |
| Renderer | RenderTree -> Canvas 2D drawing | JS + Canvas API |
| Editor | Text input/deletion, caret, selection, state machine | JS |
| Serializer | Document IR -> HWP binary conversion | Rust |
| WASM API | Rust-JS bridge | wasm-bindgen |

### 3.3 How It Works

1. User loads an HWP file in the browser (File API)
2. WASM module parses HWP directly on the client -> generates Document IR
3. Layout engine creates per-page RenderTree
4. Canvas API rendering (text, tables, images, shapes)
5. JS editor handles user input -> modifies Document IR via WASM
6. On save, WASM module serializes Document IR -> HWP binary -> download

### 3.4 Characteristics

**Advantages**:
- No server needed -> zero infrastructure costs
- Offline operation possible
- Instant response without network latency
- No server scaling needed as users increase
- Platform-independent (only requires a browser)
- No Hancom Office license required

**Limitations**:
- Self-implementing the HWP format requires significant development effort for compatibility
- Dependent on client device performance
- Initial loading time may occur for complex documents

## 4. Architecture Comparison

| Aspect | Hancom WebGian | rhwp |
|--------|---------------|------|
| **HWP Processing Location** | Server (filter server) | Client (WASM) |
| **HWP Engine** | Reuses Hancom Office desktop engine | Self-implemented in Rust |
| **Rendering Method** | Server conversion -> HTML/image delivery | Client-side Canvas direct rendering |
| **Server Requirements** | Web server + filter server (2+ machines) | Static file serving only (or none) |
| **External Dependencies** | Hancom Office 2018+ installation required | None (pure Rust + WASM) |
| **Network Dependency** | Required (server communication) | Not required (offline capable) |
| **Concurrent User Scaling** | Filter server scaling needed | Distributed processing on clients |
| **Compatibility** | Hancom engine-based -> high compatibility | Self-implemented -> gradual compatibility |
| **Licensing** | Hancom Office server license required | Independent |
| **OS Requirements** | Server: RHEL 7+ only | Platform-agnostic |

## 5. Technical Implications

### 5.1 Paradigm Difference

Hancom WebGian follows a **server-centric paradigm**, leveraging the reliability of the existing desktop engine on the server. This enables rapid compatibility assurance but carries structural limitations of server infrastructure costs and network dependency.

rhwp follows a **client-centric paradigm**, using WebAssembly technology to achieve native-grade performance directly in the browser. While facing the high technical barrier of self-implementing the HWP format, it secures structural advantages of server independence and offline operation.

### 5.2 Potential of the WASM Approach

Client-side document processing via WebAssembly offers the following benefits:

- **Zero server cost**: Deployable with static hosting alone
- **Privacy**: Documents never pass through a server
- **Scalability**: User growth does not translate to server load
- **Responsiveness**: Instant processing without network round-trips

This is particularly significant in security-sensitive government environments, where documents do not transit through external servers.

## 6. Conclusion

Both approaches have clear pros and cons. Hancom WebGian achieved high compatibility in a short time by reusing the Hancom Office engine but remains server-dependent. rhwp completely eliminates server dependency through pure client-side processing but requires continuous development effort for self-implementing the HWP format.

With the maturation of WebAssembly technology, client-side document processing can be competitive in terms of server cost reduction, offline support, and enhanced security.

---

*Written: 2026-02-08*
