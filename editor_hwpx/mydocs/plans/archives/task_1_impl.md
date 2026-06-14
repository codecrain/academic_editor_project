# 타스크 1 - 구현 계획서: Rust HWP 뷰어 개발환경 설정

## 단계 구성 (4단계)

### 1단계: Rust 프로젝트 초기화

- `cargo init`으로 프로젝트 생성
- `Cargo.toml` 기본 설정 (프로젝트명: `rhwp`)
- `src/lib.rs` 생성 (라이브러리 크레이트, WASM 빌드 대상)
- `src/main.rs` 생성 (네이티브 실행용)
- `.gitignore` 작성 (target/, *.wasm 등)

### 2단계: Docker 빌드 환경 구성

- `Dockerfile` 작성
  - 베이스 이미지: `rust:latest`
  - `wasm-pack`, `wasm32-unknown-unknown` 타겟 설치
- `docker-compose.yml` 작성
  - 소스 볼륨 마운트
  - 빌드 명령 정의
- `.dockerignore` 작성

### 3단계: 기본 의존성 및 프로젝트 구조 설정

- `Cargo.toml`에 핵심 의존성 추가
  - `wasm-bindgen` - WASM 바인딩
  - `cfb` - OLE/CFB 컨테이너 파싱 (HWP 파일 구조)
  - `flate2` - zlib 압축 해제
  - `byteorder` - 바이트 오더 처리
- `crate-type = ["cdylib", "rlib"]` 설정

### 4단계: 빌드 검증 및 테스트

- Docker 컨테이너에서 네이티브 빌드 (`cargo build`) 확인
- Docker 컨테이너에서 WASM 빌드 (`wasm-pack build`) 확인
- 기본 단위 테스트 실행 확인
- 빌드 결과물 정상 생성 확인

## 상태

- 작성일: 2026-02-05
- 상태: 승인 완료
