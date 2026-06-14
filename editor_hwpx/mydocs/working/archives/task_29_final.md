# 타스크 29 최종 완료 보고서

## 개요
읽기전용(배포용) HWP 파일을 편집 가능한 일반 HWP 파일로 변환하는 기능 구현

## 구현 내용

### 1단계: 핵심 변환 로직 — `Document::convert_to_editable()`
- **파일**: `src/model/document.rs`
- FileHeader의 distribution 플래그(bit 2) 제거
- `raw_data = None`으로 설정하여 헤더 재생성 유도
- DocInfo에서 `HWPTAG_DISTRIBUTE_DOC_DATA` 레코드 삭제
- `raw_stream = None`으로 설정하여 DocInfo 재직렬화 유도
- 이미 일반 문서인 경우 false 반환 (no-op)

### 2단계: CLI/WASM API
- **CLI** (`src/main.rs`): `rhwp convert <입력.hwp> <출력.hwp>` 명령 추가
- **WASM** (`src/wasm_api.rs`): `convertToEditable()` 바인딩 + `convert_to_editable_native()` 네이티브 API

### 3단계: 테스트 및 검증
- 전체 386개 테스트 통과
- 신규 테스트 2개:
  - `test_convert_to_editable_clears_distribution`: 배포용 문서 변환 검증
  - `test_convert_to_editable_noop_for_normal`: 일반 문서 no-op 검증

## 기술 핵심 사항
기존 파서-직렬화 파이프라인이 이미 대부분의 변환을 처리:
- 파서: ViewText 스트림을 AES-128 ECB로 복호화하여 일반 모델로 저장
- 직렬화기: 항상 BodyText 스트림으로 출력 (ViewText 미사용)
- 따라서 추가 작업은 헤더 플래그 정리와 암호화 시드 데이터 제거뿐

## 변경 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/model/document.rs` | `convert_to_editable()` 메서드 + 테스트 2개 (+77줄) |
| `src/main.rs` | `convert` CLI 명령 + 도움말 (+68줄) |
| `src/wasm_api.rs` | WASM/네이티브 API (+14줄) |

## 테스트 결과
```
386 passed; 0 failed; 0 ignored
```
