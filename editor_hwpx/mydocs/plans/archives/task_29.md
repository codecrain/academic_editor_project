# 타스크 29 수행계획서: 읽기전용 HWP를 저장가능한 HWP로 변환

## 배경

HWP 5.0 배포용 문서는 원본 편집을 제한하기 위해 설계된 형식이다.
- 본문이 `BodyText/Section*` 대신 `ViewText/Section*`에 AES-128 ECB 암호화되어 저장
- 파일 헤더 속성의 bit 2가 `1`로 설정 (배포용 문서)
- 각 ViewText 스트림 앞에 `HWPTAG_DISTRIBUTE_DOC_DATA` (256바이트) 포함
- 복사/인쇄 제한 플래그 포함

현재 파서(`src/parser/crypto.rs`)는 **배포용 문서 복호화를 완벽하게 지원**하고 있다.
파싱 시 ViewText를 복호화하여 일반 문서와 동일한 내부 모델로 변환한다.

**목표**: 배포용(읽기전용) HWP를 일반(저장가능) HWP로 변환하여 내보내기

## 현재 코드 분석

### 파싱 경로 (이미 구현됨)
1. `src/parser/header.rs`: `distribution` 플래그 파싱 (bit 2)
2. `src/parser/mod.rs`: distribution이면 ViewText 경로로 분기
3. `src/parser/crypto.rs`: AES-128 복호화 + zlib 압축 해제
4. 결과: 일반 문서와 동일한 `HwpDocument` 모델

### 직렬화 경로 (수정 필요)
1. `src/serializer/header.rs`: `flags` 필드를 그대로 직렬화 (raw_data 우선)
2. `src/serializer/cfb_writer.rs`: 스트림 생성 시 distribution 미고려
3. `src/serializer/body_text.rs`: 섹션 데이터 직렬화

### 핵심 차이점

| 항목 | 배포용 문서 | 일반 문서 |
|------|------------|----------|
| 파일 헤더 bit 2 | 1 | 0 |
| 본문 스트림 경로 | ViewText/Section* | BodyText/Section* |
| 암호화 | AES-128 ECB | 없음 |
| DISTRIBUTE_DOC_DATA | 포함 | 없음 |

## 구현 계획

### 1단계: FileHeader 변환 로직
- `FileHeader`에서 `distribution` 플래그를 `false`로 설정
- `flags` 필드에서 bit 2 (0x04) 제거
- `raw_data`를 `None`으로 설정 (플래그 변경 반영을 위해)

### 2단계: Serializer에서 배포용→일반 변환 적용
- `cfb_writer.rs`: distribution 상태와 무관하게 항상 `BodyText/Section*`으로 저장
- 기존 `serialize_body_text`가 복호화된 데이터를 이미 갖고 있으므로 추가 암호화 불필요
- ViewText 스트림 생성 코드가 없으므로 자연스럽게 일반 문서로 저장됨

### 3단계: WASM/CLI API 추가
- `convert_to_editable()` 또는 기존 `exportHwp`에서 자동 변환
- CLI: `rhwp convert input.hwp output.hwp` 명령어 추가

### 4단계: 테스트 및 검증
- 배포용 샘플 HWP로 변환 테스트
- 변환 후 한컴오피스에서 열림 확인
- 라운드트립: 배포용 파싱 → 일반 저장 → 재파싱 → 내용 비교

## 변경 파일

| 파일 | 작업 |
|------|------|
| `src/model/document.rs` | FileHeader 변환 메서드 추가 |
| `src/serializer/header.rs` | distribution 플래그 제거 직렬화 |
| `src/serializer/cfb_writer.rs` | BodyText 스트림 강제 사용 확인 |
| `src/wasm_api.rs` | convertToEditable WASM API |
| `src/main.rs` | CLI convert 명령어 |
| `src/serializer/mod.rs` | 변환 시 헤더 플래그 조정 |

## 검증 방법

1. `docker compose run --rm test` — 기존 테스트 + 신규 테스트 통과
2. 배포용 HWP 파일을 변환 후 한컴오피스에서 편집 가능 확인
3. 변환 전후 문서 내용 동일성 확인
