# 타스크 3 - 1단계 완료 보고서: CFB 컨테이너 + 레코드 기반 구조

## 수행 내용

### 생성/수정된 파일

| 파일 | 설명 |
|------|------|
| `src/parser/tags.rs` | HWP 5.0 태그 상수 (DocInfo 17개, BodyText 30개, 인라인 코드 9개, 컨트롤 ID 18개) |
| `src/parser/record.rs` | 레코드 헤더 파싱 (태그 ID, 레벨, 크기, 확장 크기) |
| `src/parser/cfb_reader.rs` | CFB 컨테이너 읽기, 스트림 추출, 압축 해제 |
| `src/parser/header.rs` | FileHeader 바이너리 파싱 (시그니처, 버전, 플래그) |
| `src/parser/mod.rs` | 파서 모듈 구조 재설계 |

### 구현 상세

#### tags.rs - HWP 태그 상수

- `HWPTAG_BEGIN` (0x010) 기준 오프셋 정의
- DocInfo 태그: DOCUMENT_PROPERTIES ~ TRACKCHANGE (17개)
- BodyText 태그: PARA_HEADER ~ CHART_DATA (30개)
- 인라인 컨트롤 코드: CHAR_SECTION_COLUMN_DEF ~ CHAR_FIXED_WIDTH_SPACE (9개)
- 컨트롤 ID: CTRL_SECTION_DEF ~ CTRL_HIDDEN_COMMENT (18개)
- `tag_name()`, `ctrl_name()` 디버깅 헬퍼 함수
- `ctrl_id()` 컴파일 타임 4바이트 ASCII → u32 변환

#### record.rs - 레코드 파싱

- 레코드 헤더 구조: bits 0~9 (태그), 10~19 (레벨), 20~31 (크기)
- 확장 크기: 크기 필드 == 0xFFF이면 다음 4바이트가 실제 크기
- `Record::read_all()`: 바이트 스트림 → 레코드 목록 파싱
- `RecordError`: IoError, UnexpectedEof 에러 타입

#### cfb_reader.rs - CFB 컨테이너

- `cfb` 크레이트로 OLE/CFB 컨테이너 열기
- 스트림 추출: FileHeader, DocInfo, BodyText/Section{N}, ViewText/Section{N}
- 배포용 문서: ViewText 스트림 감지 (암호화 raw 데이터 반환)
- `flate2` 크레이트로 압축 해제 (raw deflate → zlib 폴백)
- BinData 스트림 목록/읽기
- 섹션 수 자동 계산

#### header.rs - FileHeader 바이너리 파싱

- 256바이트 FileHeader 완전 파싱
- 시그니처 검증 (NULL 패딩 처리)
- 버전 파싱 (revision, build, minor, major LE)
- 속성 플래그 11개 비트 필드 파싱
- 배포용 문서 플래그 (bit 2) 감지

### 배포용 문서 처리 설계

참조 소스(`/home/edward/vsworks/shwp/hwp_semantic/crypto.py`)를 분석하여 복호화 흐름을 파악:

```
DocInfo → HWPTAG_DISTRIBUTE_DOC_DATA (256바이트)
  → LCG(MSVC) + XOR 복호화 → 평문 데이터
  → AES-128 키 추출 (SHA-1 해시 기반)
  → ViewText/Section{N} → AES-128 ECB 복호화
  → zlib 압축 해제 → 레코드 데이터
```

1단계에서는 ViewText 스트림 감지 및 raw 데이터 추출까지 구현.
실제 복호화는 2단계(DocInfo의 DISTRIBUTE_DOC_DATA 파싱 후) 구현 예정.

### 빌드 검증

| 대상 | 결과 |
|------|------|
| 네이티브 (cargo build) | 성공 |
| 테스트 (cargo test) | **110개 통과** (88 → 110, +22개) |
| WASM (wasm-pack build) | 성공 |

### 추가된 테스트 (22개)

| 모듈 | 테스트 | 검증 내용 |
|------|--------|----------|
| tags | test_tag_values | 태그 ID 값 검증 |
| | test_ctrl_id | 컨트롤 ID 바이트 변환 |
| | test_tag_name | 태그 이름 변환 |
| | test_ctrl_name | 컨트롤 이름 변환 |
| record | test_read_single_record | 단일 레코드 파싱 |
| | test_read_multiple_records | 다중 레코드 파싱 |
| | test_extended_size_record | 확장 크기 레코드 |
| | test_record_display | Display 포맷 |
| | test_empty_data | 빈 데이터 |
| | test_zero_size_record | 크기 0 레코드 |
| | test_truncated_data_error | 데이터 부족 에러 |
| cfb_reader | test_decompress_empty | 빈 deflate 해제 |
| | test_decompress_invalid_data | 잘못된 데이터 에러 |
| | test_decompress_real_data | 실제 압축/해제 검증 |
| header | test_hwp_signature | 시그니처 상수 |
| | test_parse_valid_header | 정상 헤더 파싱 |
| | test_parse_distribution_document | 배포용 문서 플래그 |
| | test_parse_encrypted_document | 암호화 문서 플래그 |
| | test_parse_all_flags | 전체 플래그 검증 |
| | test_too_short_data | 크기 부족 에러 |
| | test_invalid_signature | 시그니처 불일치 에러 |
| | test_version_display | 버전 문자열 포맷 |

## 상태

- 완료일: 2026-02-05
- 상태: 승인 완료
