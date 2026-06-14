# Task 393: prepare-github.sh Script + Exclusion List

## Goal

Write a script to selectively copy from `/home/edward/vsworks/rhwp/` → `/home/edward/mygithub/rhwp/`.

## Implementation Plan (3 Steps)

### Step 1: Create github-exclude.txt Exclusion List
- Sensitive information files
- Hancom/commercial license resources
- Sensitive sample files
- Build artifacts (target/, pkg/, output/, dist/)
- Internal-only files (hwp_webctl/, mydocs/convers/)

### Step 2: Write scripts/prepare-github.sh Script
- rsync-based copy with exclusion list
- Replace CLAUDE.md with public version (Task 394 to create, placeholder here)
- Copy .env.docker.example
- Print result tree after execution

### Step 3: Verification
- Run script → confirm /home/edward/mygithub/rhwp/ created
- Verify no sensitive files included
- Verify cargo build is possible
