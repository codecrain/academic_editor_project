# 타스크 3 - 2단계 완료 보고서: DocInfo 파싱 + 배포용 복호화

## 수행 내용

### 생성/수정된 파일

| 파일 | 라인 | 설명 |
|------|------|------|
| `src/parser/byte_reader.rs` | 250 | 바이너리 데이터 읽기 유틸리티 (LE 정수, UTF-16LE 문자열, 색상) |
| `src/parser/crypto.rs` | 503 | 배포용 문서 복호화 (MSVC LCG + XOR, AES-128 ECB, ViewText 파이프라인) |
| `src/parser/doc_info.rs` | 773 | DocInfo 스트림 파싱 → 참조 테이블 구축 (9개 태그 처리) |
| `src/parser/mod.rs` | +3 | 신규 모듈 등록 (byte_reader, crypto, doc_info) |
| `src/parser/cfb_reader.rs` | fix | 미사용 import 정리 |
| `src/parser/record.rs` | fix | 미사용 import 정리 |

### 구현 상세

#### byte_reader.rs - 바이너리 읽기 유틸리티

- `ByteReader<'a>` - 커서 기반 바이트 스트림 리더
- Little-Endian 정수 읽기: `read_u8/u16/u32/i8/i16/i32/i64`
- `read_hwp_string()` - 2바이트 길이 접두사 + UTF-16LE 문자열 읽기
- `read_utf16_string(char_count)` - 지정 길이 UTF-16LE 문자열 읽기
- `read_color_ref()` - 4바이트 BGR 색상값 읽기
- `read_bytes(len)`, `skip(n)`, `read_remaining()` - 범용 바이트 조작
- 13개 테스트

#### crypto.rs - 배포용 문서 복호화

ViewText/Section{N} 복호화 파이프라인:

```
ViewText/Section{N} 구조:
├── DISTRIBUTE_DOC_DATA 레코드 (256바이트)
│   → 첫 4바이트 = LCG 시드
│   → LCG(MSVC) + XOR로 나머지 252바이트 복호화
│   → offset = (seed & 0xF) + 4
│   → AES 키 = decrypted_data[offset..offset+16]
└── 암호화된 본문 (AES-128 ECB)
    → AES 키로 복호화
    → zlib/deflate 압축 해제
    → 일반 레코드 데이터
```

- `MsvcLcg` - MSVC 호환 LCG (a=214013, c=2531011, m=2^32)
- `decrypt_distribute_doc_data()` - LCG+XOR 256바이트 복호화
- `extract_aes_key()` - offset 계산 후 16바이트 AES 키 추출
- Pure Rust AES-128 ECB 구현 (외부 크립토 크레이트 없음, WASM 호환)
  - S-Box, Inverse S-Box, RCON 테이블
  - KeyExpansion, InvSubBytes, InvShiftRows, InvMixColumns
  - NIST AES-128 테스트 벡터 검증
- `decrypt_viewtext_section()` - 전체 ViewText 복호화 파이프라인
- 10개 테스트

#### doc_info.rs - DocInfo 참조 테이블 파싱

- `parse_doc_info(data) → (DocInfo, DocProperties)` - 메인 진입점
- 처리하는 레코드 태그 (9개):
  - `DOCUMENT_PROPERTIES` → 섹션 수, 시작 페이지/각주/미주 번호
  - `ID_MAPPINGS` → 각 타입별 개수 (폰트 7언어, 외곽선, 글자모양, 탭, 문단모양, 스타일 등)
  - `BIN_DATA` → 바이너리 데이터 항목 (타입, 확장자, 압축 방식, 상태)
  - `FACE_NAME` → 글꼴 이름 + 대체 글꼴 (7개 언어 카테고리 분배)
  - `BORDER_FILL` → 테두리 4변 + 대각선 + 채우기 (단색/그라데이션/이미지)
  - `CHAR_SHAPE` → 글자 크기, 7언어 폰트ID, 색상, 밑줄, 진하게, 기울임
  - `TAB_DEF` → 탭 항목 목록 (위치, 타입, 리더)
  - `PARA_SHAPE` → 정렬, 들여쓰기, 줄간격, 여백
  - `STYLE` → 스타일 이름 + CharShape/ParaShape 참조 ID
- FACE_NAME 언어 카테고리 분배 로직: ID_MAPPINGS의 font_counts 기반으로 7개 언어 순서대로 할당
- 8개 테스트

### 설계 결정사항

1. **Pure Rust AES 구현**: 외부 크립토 크레이트(ring, aes 등)는 WASM 빌드 시 C 컴파일 의존성이나 호환성 문제를 유발할 수 있어 순수 Rust로 구현
2. **참조 소스 기반 구현**: 한컴 공식 스펙(`distribution_spec.md`)과 Python 참조 구현(`reader.py`, `crypto.py`)을 교차 검증하여 정확도 확보
3. **에러 관용 파싱**: 일부 필드 읽기 실패 시 기본값 사용 (`unwrap_or(default)`) → 불완전한 파일도 최대한 파싱 가능

## 빌드 검증

| 항목 | 결과 |
|------|------|
| 네이티브 빌드 | 성공 (경고 0개) |
| 전체 테스트 | **143개 통과** (+33개, 1단계 대비) |
| WASM 빌드 | 성공 |

### 테스트 증가 내역

| 모듈 | 1단계 | 2단계 | 증가 |
|------|-------|-------|------|
| parser::byte_reader | - | 13 | +13 |
| parser::crypto | - | 10 | +10 |
| parser::doc_info | - | 8 | +8 |
| parser (기존) | 22 | 24 | +2 (import 정리) |
| 기타 (model, renderer, wasm_api) | 88 | 88 | 0 |
| **합계** | **110** | **143** | **+33** |

## 다음 단계

3단계: BodyText 문단 파싱 (텍스트 + 스타일 참조)

## 상태

- 완료일: 2026-02-05
- 상태: 승인 완료
