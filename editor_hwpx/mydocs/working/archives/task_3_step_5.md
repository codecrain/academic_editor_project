# 타스크 3 - 5단계 완료 보고서: API 연결 + CLI + 빌드 검증

## 수행 내용

### 생성/수정된 파일

| 파일 | 라인 | 설명 |
|------|------|------|
| `src/parser/mod.rs` | +110 | `parse_hwp()` 통합 파싱 함수 + `ParseError` 에러 타입 |
| `src/wasm_api.rs` | 수정 | `from_bytes()` 실제 파서 연결 (TODO 제거) |
| `src/main.rs` | 수정 | `export-svg`, `info` 명령 실제 파싱 연결 |
| `src/parser/tags.rs` | 수정 | `ctrl_id()` 바이트 순서 수정 (LE→BE) |

### 구현 상세

#### parse_hwp() - 통합 파싱 파이프라인

`src/parser/mod.rs`에 추가된 최상위 파싱 함수:

```rust
pub fn parse_hwp(data: &[u8]) -> Result<Document, ParseError>
```

파싱 순서:
1. **CFB 컨테이너 열기** → `CfbReader::open(data)`
2. **FileHeader 파싱** → `parse_file_header()` → 버전, 압축, 배포용 플래그
3. **DocInfo 파싱** → `parse_doc_info()` → 참조 테이블 (폰트, 글자모양, 문단모양, 스타일)
4. **BodyText 섹션별 파싱**:
   - 일반 문서: `read_body_text_section()` → `parse_body_text_section()`
   - 배포용 문서: `read_body_text_section()` → `decrypt_viewtext_section()` → `parse_body_text_section()`
5. **Document IR 조립** → 모든 결과를 `Document` 구조체로 조합

에러 처리:
- `ParseError` 열거형으로 모든 하위 에러 통합 (CFB, Header, DocInfo, BodyText, Crypto)
- 암호화 문서(`encrypted`)는 `ParseError::EncryptedDocument` 반환
- 개별 섹션 파싱 실패 시 빈 섹션으로 대체 (전체 문서 파싱 중단 방지)

#### ctrl_id() 바이트 순서 버그 수정

**근본 원인**: `tags.rs`의 `ctrl_id()` 함수가 little-endian 바이트 순서를 사용했으나,
HWP 파일의 ctrl_id는 big-endian 문자열 인코딩으로 저장됨.

```
수정 전: (s[0] as u32) | ((s[1] as u32) << 8) | ...     → 0x64636573 ("secd" LE)
수정 후: ((s[0] as u32) << 24) | ((s[1] as u32) << 16) | ... → 0x73656364 ("secd" BE)
```

이 버그로 인해 'secd'(구역 정의), 'cold'(단 정의), 'tbl '(표) 등 **모든 컨트롤 ID가 불일치**하여:
- SectionDef가 파싱되지 않음 → PageDef 기본값(0) → SVG viewBox="0 0 0 0"
- ColumnDef가 파싱되지 않음
- Table이 control.rs로 위임되나 ctrl_id 불일치로 Unknown 처리

**영향 범위**: `tags.rs` 1줄 수정으로 전체 컨트롤 파싱 정상화

#### wasm_api.rs - from_bytes() 연결

```
기존: 시그니처 검증 + Document::default() (TODO 스텁)
변경: crate::parser::parse_hwp(data) 호출 → 실제 파싱 결과 사용
```

- `parse_hwp()` 에러 → `HwpError::InvalidFile`로 변환
- 파싱 성공 시 자동 페이지 분할 (`paginate()`)

#### main.rs - CLI 실제 파싱 연결

##### export-svg 명령
```
기존: fs::read() → create_empty() (빈 문서)
변경: fs::read() → from_bytes(&data) → 실제 HWP 파싱 → SVG 내보내기
```

##### info 명령
```
기존: metadata() → create_empty() (더미 정보)
변경: fs::read() → from_bytes(&data) → 실제 문서 정보 출력
```

출력 정보:
- 파일경로, 크기
- HWP 버전 (major.minor.build.revision)
- 압축/암호화/배포용 여부
- 구역 수, 페이지 수
- 폰트 목록 (언어별)
- 스타일 목록
- 총 문단 수

## 전체 파싱 파이프라인

```
HWP 바이트
  │
  ├── CFB 컨테이너 열기 (cfb_reader)
  │
  ├── FileHeader 파싱 (header)
  │     └── 버전, 압축, 배포용, 암호화 플래그
  │
  ├── DocInfo 파싱 (doc_info)
  │     └── 폰트, 글자모양, 문단모양, 스타일, 테두리/배경
  │
  ├── BodyText 섹션 파싱 (body_text + control)
  │     ├── [배포용] ViewText 복호화 (crypto: AES-128 ECB)
  │     ├── 문단 파싱 (텍스트 + 스타일 참조)
  │     └── 컨트롤 파싱 (표, 도형, 그림, 머리말/꼬리말)
  │
  └── Document IR 조립
        │
        ├── WASM API (wasm_api.rs)
        │     ├── HwpDocument::new(data) → 파싱 + 페이지네이션
        │     ├── renderPageSvg() → SVG 렌더링
        │     └── getDocumentInfo() → JSON 문서 정보
        │
        └── CLI (main.rs)
              ├── rhwp info <파일.hwp>
              └── rhwp export-svg <파일.hwp>
```

## 빌드 검증

| 항목 | 결과 |
|------|------|
| 네이티브 빌드 | 성공 (경고 0개) |
| 전체 테스트 | **177개 통과** (+2개, 4단계 대비) |
| WASM 빌드 | 미확인 (네이티브 검증 완료) |

### 테스트 증가 내역

| 모듈 | 4단계 | 5단계 | 증가 |
|------|-------|-------|------|
| parser (mod.rs) | - | 2 | +2 |
| 기타 | 175 | 175 | 0 |
| **합계** | **175** | **177** | **+2** |

### 신규 테스트 목록

| 테스트 | 검증 내용 |
|--------|----------|
| test_parse_hwp_too_small | 너무 작은 데이터 에러 |
| test_parse_hwp_invalid_cfb | 유효하지 않은 CFB 에러 |

## 전체 파서 모듈 요약

| 모듈 | 파일 | 역할 |
|------|------|------|
| mod.rs | `src/parser/mod.rs` | 통합 파싱 파이프라인 `parse_hwp()` |
| cfb_reader | `src/parser/cfb_reader.rs` | CFB 컨테이너 + 압축 해제 |
| header | `src/parser/header.rs` | FileHeader 바이너리 파싱 |
| record | `src/parser/record.rs` | 레코드 헤더 파싱 |
| tags | `src/parser/tags.rs` | HWP 태그/컨트롤 상수 (ctrl_id BE 인코딩) |
| byte_reader | `src/parser/byte_reader.rs` | 바이너리 읽기 유틸리티 |
| crypto | `src/parser/crypto.rs` | 배포용 문서 복호화 (AES-128 ECB) |
| doc_info | `src/parser/doc_info.rs` | DocInfo 참조 테이블 파싱 |
| body_text | `src/parser/body_text.rs` | BodyText 섹션/문단 파싱 |
| control | `src/parser/control.rs` | 컨트롤 파싱 (표/도형/그림/머리말) |
| bin_data | `src/parser/bin_data.rs` | BinData 스토리지 추출 |

## 실제 HWP 파일 검증

### 검증 대상

예제 폴더(`/home/edward/vsworks/shwp/samples/15yers/`)의 실제 HWP 파일로 엔드투엔드 검증.
참조 데이터(`/home/edward/vsworks/shwp/outputs/15years/`)와 비교.

### info 명령

| 파일 | 버전 | 구역 | 문단 | 결과 |
|------|------|------|------|------|
| hwp_table_test.hwp | 5.1.0.1 | 1 | 28 | 폰트 5개, 스타일 63개 정상 출력 |
| 통합재정통계(2014.8월).hwp | 5.0.3.4 | 1 | 17 | 폰트 9개, 스타일 17개 정상 출력 |

### export-svg 명령

| 파일 | viewBox | 크기 | 텍스트 | 참조 대비 |
|------|---------|------|--------|-----------|
| hwp_table_test.svg | `0 0 793.69 1122.51` | A4 정상 | 11줄 | 정상 |
| 통합재정통계(2014.8월).svg | `0 0 793.71 1122.51` | A4 정상 | 8줄 | 참조 .md와 텍스트 일치 |

### SVG 품질 (수정 전후 비교)

| 항목 | 수정 전 (ctrl_id LE) | 수정 후 (ctrl_id BE) |
|------|----------------------|----------------------|
| viewBox | `0 0 0 0` | `0 0 793.71 1122.51` |
| width × height | 0 × 0 | 793.71 × 1122.51 (A4) |
| 텍스트 x좌표 | 0 (여백 없음) | 94.49 / 113.39 (좌측 여백 적용) |
| 텍스트 y좌표 | 겹침 (모두 동일 위치) | 페이지 내 분산 배치 |
| 텍스트 내용 | 정상 | 정상 (참조 데이터와 일치) |

## 다음 단계

타스크 3 완료. 최종 결과 보고서 작성.

## 상태

- 완료일: 2026-02-05
- 상태: 승인 대기
