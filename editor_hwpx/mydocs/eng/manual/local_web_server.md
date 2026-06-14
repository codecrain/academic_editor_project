# Local Web Server Manual

---

## [rhwp-studio] Vite Dev Server (New - Recommended)

### Overview

Run the TypeScript-based rhwp-studio with the Vite dev server.
Since `localhost` is a browser Secure Context, the Clipboard API works correctly even over HTTP.

### Prerequisites

- Node.js v24+, npm v11+
- Docker (for WASM builds)

### Execution Steps

#### 1. WASM Build (run after each source change)

```bash
cd ~/vsworks/rhwp
docker compose --env-file .env.docker run --rm wasm
```

Build output: `pkg/rhwp_bg.wasm`, `pkg/rhwp.js`, `pkg/rhwp.d.ts`

#### 2. Start Dev Server

```bash
cd ~/vsworks/rhwp/rhwp-studio
npx vite
```

Access in browser:

```
http://localhost:7700        # Local
http://<PC-IP>:7700          # Other devices on the same network
```

> `npm run dev` works the same way. (The `dev` script in `package.json` runs `vite`)

### One-Shot Execution (WASM Build + Server Start)

```bash
cd ~/vsworks/rhwp && \
docker compose --env-file .env.docker run --rm wasm && \
cd rhwp-studio && npx vite
```

### Ports

| Service | Port | Config File |
|---------|------|-------------|
| Vite Dev Server | **7700** | `rhwp-studio/vite.config.ts` |

---

## [web/] Python HTTPS Server (Legacy)

### Overview

A local HTTPS development server for testing the HWP web viewer/editor in the browser.

The Clipboard API (`navigator.clipboard.read()`) only works in HTTPS environments, hence the HTTPS server.

## Prerequisites

### 1. WASM Build

```bash
docker compose --env-file /dev/null run --rm wasm
```

Build output is generated in the `pkg/` folder.

### 2. Copy WASM Files to web/

```bash
cp pkg/rhwp_bg.wasm web/rhwp_bg.wasm
cp pkg/rhwp.js web/rhwp.js
```

### 3. Verify SSL Certificate

The following files must exist in the `web/certs/` folder:

```
web/certs/localhost-cert.pem
web/certs/localhost-key.pem
```

If certificates are missing, generate them:

```bash
cd web/certs
openssl req -x509 -newkey rsa:2048 -keyout localhost-key.pem -out localhost-cert.pem \
  -days 365 -nodes -subj "/CN=localhost"
```

## Running the Server

### Default Execution (Port 7700)

```bash
python3 web/https_server.py
```

### Specify Port

```bash
python3 web/https_server.py 8443
```

When the server starts, the following message is displayed:

```
HTTPS server started: https://localhost:7700/web/editor.html
```

## Browser Access

### Editor Page

```
https://localhost:7700/web/editor.html
```

### Viewer Page

```
https://localhost:7700/web/index.html
```

### Clipboard Test Page

```
https://localhost:7700/web/clipboard_test.html
```

### Self-Signed Certificate Warning

When the browser shows "Your connection is not private":
- Chrome: Click "Advanced" then "Proceed to localhost (unsafe)"
- Firefox: Click "Accept the Risk and Continue"

## Testing

### Opening HWP Files

1. Navigate to the editor page
2. Click "Open File" button or drag and drop an HWP file

### Table Paste Test

1. Copy a table from an external application (Excel, Hancom Office, etc.) with Ctrl+C
2. Place the cursor at the desired position in the editor
3. Paste with Ctrl+V
4. Verify the table was inserted

### HWP Save Test

1. Edit a document in the editor (e.g., paste a table)
2. Click the "Save" button (or Ctrl+S)
3. Open the downloaded HWP file in Hancom Office to verify

## Full Build-Test Flow Summary

```bash
# 1. Run tests
docker compose --env-file /dev/null run --rm test cargo test

# 2. WASM build
docker compose --env-file /dev/null run --rm wasm

# 3. Copy to web/
cp pkg/rhwp_bg.wasm web/rhwp_bg.wasm
cp pkg/rhwp.js web/rhwp.js

# 4. Start local server
python3 web/https_server.py

# 5. Access in browser
# https://localhost:7700/web/editor.html
```

## Troubleshooting

### "Module not found" Error

WASM files may not have been copied to the `web/` folder. Run `cp pkg/rhwp_bg.wasm web/`.

### "ERR_SSL_PROTOCOL_ERROR"

SSL certificate files are missing or corrupted. Regenerate the certificates in `web/certs/`.

### Clipboard Paste Not Working

- Verify you are accessing via HTTPS (Clipboard API is unavailable over HTTP)
- Verify clipboard permissions are allowed in the browser
