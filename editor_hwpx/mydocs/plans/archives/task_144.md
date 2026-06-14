# 타스크 144 수행계획서: JSON 유틸리티 통합

## 1. 개요

`wasm_api/` 모듈 전체에 산재한 수동 JSON 파싱·생성 코드를 `helpers.rs`로 통합한다.

## 2. 현황

- 14개 로컬 JSON 파싱 함수가 5개 모듈에 중복 정의
- 11곳에서 동일한 `.replace(...)` JSON 이스케이프 체인 반복
- 36곳에서 `format!("{{` JSON 응답 개별 생성

## 3. 목표

- 중복 파싱 함수 14개 → `helpers.rs` 공통 함수로 통합
- JSON 이스케이프 11곳 → `json_escape()` 1개 함수로 통합
- 고빈도 JSON 응답 패턴 23곳 → `json_ok_with()` 헬퍼로 통합
- 기존 582개 테스트 전수 통과

## 4. 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| helpers.rs | json_u32/u8/i16/f64/usize, json_str 업그레이드, json_escape, json_ok_with 추가 |
| object_ops.rs | extract_* 4개 삭제, 이스케이프 교체 |
| rendering.rs | parse_* 2개 삭제, 이스케이프 교체 |
| table_ops.rs | parse_* 5개 삭제, 응답 생성 교체 |
| cursor_nav.rs | extract_num/extract_json_int 제거 |
| cursor_rect.rs | extract_json_f64 제거 |
| clipboard.rs | 이스케이프 + 응답 생성 교체 |
| document.rs | 이스케이프 교체 |
| formatting.rs | 이스케이프 교체 |
| text_editing.rs | 응답 생성 교체 |

## 5. 제약 사항

- serde_json 미사용 유지 (WASM 바이너리 크기)
- 기능 변경 없음 (순수 리팩토링)
- JS/TS 변경 없음

## 6. 검증

- 매 단계: `docker compose --env-file .env.docker run --rm test`
- 최종: WASM 빌드 + TypeScript 컴파일 + Clippy
