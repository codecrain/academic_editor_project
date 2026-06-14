# 타스크 1 - 수행계획서: Rust HWP 뷰어 개발환경 설정

## 목표

Rust 기반 HWP 뷰어 프로젝트의 개발환경을 구성한다.
최종 빌드 타겟은 WebAssembly(WASM)이며, 네이티브 빌드도 지원한다.

## 범위

- Docker 기반 빌드 환경 구성 (Rust + WASM 툴체인)
- Rust 프로젝트 초기화 (Cargo)
- WASM 빌드 환경 구성 (wasm-pack, wasm-bindgen)
- 기본 의존성 설정 (HWP 파싱에 필요한 크레이트)
- 프로젝트 디렉토리 구조 설계
- Docker 컨테이너에서 빌드 및 테스트 확인

## 예상 산출물

- `Dockerfile` - Rust + WASM 빌드 환경 이미지
- `docker-compose.yml` - 개발 환경 컨테이너 구성
- `Cargo.toml` - 프로젝트 설정 파일
- `src/` - Rust 소스 디렉토리
- `.gitignore` - Git 무시 파일
- `.dockerignore` - Docker 무시 파일

## 상태

- 작성일: 2026-02-05
- 상태: 승인 완료
