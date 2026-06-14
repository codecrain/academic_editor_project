# Development Environment Guide: Office PC vs Home PC

## 1. Environment Comparison

| Item | Office PC | Home PC |
|------|-----------|---------|
| **OS** | Linux (Ubuntu native) | Windows 11 + WSL2 |
| **WSL Hostname** | - | yarehang |
| **User** | app | app |
| **Rust** | 1.93.0 | 1.93.1 |
| **Node.js** | nvm (v24+) | nvm v24.11.0 |
| **Docker** | Native Docker | Docker Desktop (Windows) |
| **wasm-pack** | Built on 1.93.0 | 0.14.0 |
| **Git Default Branch** | `devel` / `local/taskXXX` | `home` |
| **GitLab** | gitlab.opxhome.com | gitlab.opxhome.com (same) |
| **Remote Server Access** | 192.168.2.154, 192.168.2.19 | Same (same network) |

---

## 2. Network Server Configuration

Both PCs can access the following servers.

| Server | IP | Hostname | Purpose |
|--------|-----|----------|---------|
| Remote Docker Server | 192.168.2.154 | d7910 | Rust build support, Docker |
| GPU Server | 192.168.2.19 | ollama | AI/ML (RTX 3090 x 2) |

### SSH Access

```bash
# Remote Docker Server
ssh -i ~/.ssh/gpu_key app@192.168.2.154

# GPU Server
ssh -i ~/.ssh/gpu_key app@192.168.2.19
```

SSH key location: `~/.ssh/gpu_key` (same on both PCs)

---

## 3. Git Branch Strategy

### Office PC

```
main <- devel <- local/taskXXX
```

- Task work: Create `local/taskXXX` branch from `devel`
- Task completion: Merge `local/taskXXX` into `devel`
- `main` merge: Only when requested by the task manager

### Home PC

- Operates based on the **`home` branch**
- To continue work started at the office:

```bash
# Fetch latest code from GitLab
git fetch origin
git merge origin/devel   # or origin/main
```

- To apply work completed at home to the office:

```bash
# Push home branch, then merge into devel on GitLab
git push origin home
```

---

## 4. Build Commands

Both office and home use **the same commands**.

### Native Build/Test (local cargo)

```bash
cargo build          # Build
cargo test           # Tests (615 tests)
cargo build --release
```

### WASM Build (Docker)

```bash
docker compose --env-file .env.docker run --rm wasm
# Output: pkg/rhwp_bg.wasm, pkg/rhwp.js
```

### rhwp-studio Dev Server

```bash
cd rhwp-studio
npx vite
# http://localhost:7700
```

---

## 5. Home PC Notes

### Docker Desktop Specifics

- Since Docker Desktop is used in a WSL2 environment, Docker commands only work when Docker Desktop is running on Windows.
- If Docker Desktop is not running, you will get the error `docker: Cannot connect to the Docker daemon`. Start Docker Desktop from the Windows system tray and retry.

### PATH Configuration

The following is appended to `~/.bashrc` on the home PC:

```bash
export PATH=/home/app/vips/bin:$PATH
export LD_LIBRARY_PATH=/home/app/vips/lib/x86_64-linux-gnu
export GEMINI_API_KEY="..."
export GOOGLE_API_KEY="..."
export NVM_DIR="$HOME/.nvm"
. "$HOME/.cargo/env"
```

These are applied automatically when opening a new terminal.

### Required Files (gitignored)

The following files are not tracked by git and must be prepared separately after cloning.

| File/Folder | Description | How to Prepare |
|-------------|-------------|----------------|
| `saved/blank2010.hwp` | Template for new document creation | Copy manually |
| `pkg/` | WASM build output | `docker compose ... run --rm wasm` |
| `rhwp-studio/node_modules/` | npm packages | `npm install` (or `npx vite` handles it automatically) |
| `~/.ssh/gpu_key` | SSH key for remote servers | Copy the key from `.env` and `chmod 600` |

---

## 6. Office to Home Transition Checklist

```
[ ] Office work pushed to GitLab
[ ] git fetch && git merge on home PC
[ ] Verify saved/blank2010.hwp exists
[ ] Run WASM build (if source changed)
[ ] Verify cargo test passes
[ ] Docker Desktop is running
```

## 7. Home to Office Transition Checklist

```
[ ] Commit & push work on home PC (origin/home)
[ ] git fetch on office PC
[ ] Merge home branch content into devel
```

---

*Originally written: 2026-02-28*
