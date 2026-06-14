# 로컬 웹서버 동작 매뉴얼

---

## [rhwp-studio] Vite 개발 서버 (신규 - 권장)

### 개요

TypeScript 기반 rhwp-studio를 Vite 개발 서버로 실행한다.
`localhost`는 브라우저 Secure Context이므로 HTTP로도 Clipboard API가 정상 동작한다.

### 사전 조건

- Node.js v24+, npm v11+
- Docker (WASM 빌드용)

### 실행 순서

#### 1. WASM 빌드 (소스 변경 시마다 실행)

```bash
cd ~/vsworks/rhwp
docker compose --env-file .env.docker run --rm wasm
```

빌드 결과물: `pkg/rhwp_bg.wasm`, `pkg/rhwp.js`, `pkg/rhwp.d.ts`

#### 2. 개발 서버 시작

```bash
cd ~/vsworks/rhwp/rhwp-studio
npx vite
```

브라우저에서 접속:

```
http://localhost:7700        # 로컬
http://<PC의 IP>:7700        # 같은 네트워크의 다른 기기
```

> `npm run dev`도 동일하게 동작한다. (`package.json`의 dev 스크립트가 `vite`를 실행)

### 한 번에 실행 (WASM 빌드 + 서버 시작)

```bash
cd ~/vsworks/rhwp && \
docker compose --env-file .env.docker run --rm wasm && \
cd rhwp-studio && npx vite
```

### 포트

| 서비스 | 포트 | 설정 파일 |
|--------|------|-----------|
| Vite 개발 서버 | **7700** | `rhwp-studio/vite.config.ts` |

---

## [web/] Python HTTPS 서버 (구버전 - 레거시)

### 개요

HWP 웹 뷰어/에디터를 브라우저에서 테스트하기 위한 로컬 HTTPS 개발 서버 실행 방법.

Clipboard API (`navigator.clipboard.read()`)가 HTTPS 환경에서만 동작하므로 HTTPS 서버를 사용한다.

## 사전 준비

### 1. WASM 빌드

```bash
docker compose --env-file /dev/null run --rm wasm
```

빌드 결과물이 `pkg/` 폴더에 생성된다.

### 2. WASM 파일을 web/ 에 복사

```bash
cp pkg/rhwp_bg.wasm web/rhwp_bg.wasm
cp pkg/rhwp.js web/rhwp.js
```

### 3. SSL 인증서 확인

`web/certs/` 폴더에 다음 파일이 있어야 한다:

```
web/certs/localhost-cert.pem
web/certs/localhost-key.pem
```

인증서가 없는 경우 생성:

```bash
cd web/certs
openssl req -x509 -newkey rsa:2048 -keyout localhost-key.pem -out localhost-cert.pem \
  -days 365 -nodes -subj "/CN=localhost"
```

## 서버 실행

### 기본 실행 (포트 7700)

```bash
python3 web/https_server.py
```

### 포트 지정

```bash
python3 web/https_server.py 8443
```

서버가 시작되면 다음 메시지가 출력된다:

```
HTTPS 서버 시작: https://localhost:7700/web/editor.html
```

## 브라우저 접속

### 에디터 페이지

```
https://localhost:7700/web/editor.html
```

### 뷰어 페이지

```
https://localhost:7700/web/index.html
```

### 클립보드 테스트 페이지

```
https://localhost:7700/web/clipboard_test.html
```

### 자체 서명 인증서 경고 처리

브라우저에서 "연결이 비공개가 아닙니다" 경고가 표시되면:
- Chrome: "고급" → "localhost(안전하지 않음)으로 이동"
- Firefox: "위험을 감수하고 계속" 클릭

## 테스트 방법

### HWP 파일 열기

1. 에디터 페이지 접속
2. "파일 열기" 버튼 클릭 또는 HWP 파일을 드래그 앤 드롭

### 표 붙여넣기 테스트

1. 외부 프로그램(엑셀, 한글 등)에서 표를 복사 (Ctrl+C)
2. 에디터에서 원하는 위치에 커서 배치
3. Ctrl+V로 붙여넣기
4. 표가 삽입되었는지 확인

### HWP 저장 테스트

1. 에디터에서 문서 편집 (표 붙여넣기 등)
2. "저장" 버튼 클릭 (또는 Ctrl+S)
3. 다운로드된 HWP 파일을 한컴오피스에서 열어 정상 확인

## 전체 빌드-테스트 플로우 요약

```bash
# 1. 코드 테스트
docker compose --env-file /dev/null run --rm test cargo test

# 2. WASM 빌드
docker compose --env-file /dev/null run --rm wasm

# 3. web/ 에 복사
cp pkg/rhwp_bg.wasm web/rhwp_bg.wasm
cp pkg/rhwp.js web/rhwp.js

# 4. 로컬 서버 실행
python3 web/https_server.py

# 5. 브라우저에서 접속
# https://localhost:7700/web/editor.html
```

## 트러블슈팅

### "모듈을 찾을 수 없습니다" 오류

WASM 파일이 `web/` 폴더에 복사되지 않았을 수 있다. `cp pkg/rhwp_bg.wasm web/` 실행.

### "ERR_SSL_PROTOCOL_ERROR"

SSL 인증서 파일이 없거나 손상되었다. `web/certs/` 폴더의 인증서를 재생성.

### 클립보드 붙여넣기가 안 됨

- HTTPS로 접속했는지 확인 (HTTP에서는 Clipboard API 사용 불가)
- 브라우저에서 클립보드 권한을 허용했는지 확인
