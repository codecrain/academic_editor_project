# 타스크 23: HWP 저장 (B-401, B-402, B-403)

## 수행계획서

### 1. 개요

타스크 17~22에서 WYSIWYG 편집 기능(선택, 캐럿, 입력, 삭제, 리플로우, 문단 분리/병합)이 완성되었다. 이제 편집된 문서를 HWP 파일로 저장하는 기능이 필요하다.

현재 파서가 HWP 5.0 CFB 파일을 `Document` IR로 변환하고 있으며, 저장은 이 과정의 역방향(직렬화)이다. 백로그 B-401(HWP 직렬화), B-402(CFB 쓰기), B-403(스트림 압축)을 통합하여 구현한다.

### 2. 목표

1. **HWP 직렬화**: Document IR → HWP 레코드 바이너리 변환
2. **CFB 쓰기**: Compound File Binary 컨테이너 생성
3. **스트림 압축**: deflate 압축 적용
4. **WASM API**: `exportHwp()` API 제공
5. **브라우저 통합**: 저장/다운로드 버튼

### 3. 현재 아키텍처 분석

#### 파싱 경로 (읽기)
```
HWP bytes → CfbReader(cfb 0.9) → 스트림 추출
  → FileHeader (256바이트, 비압축)
  → DocInfo (레코드 스트림, 조건부 deflate 압축)
  → BodyText/Section{N} (레코드 스트림, 조건부 deflate 압축)
  → BinData/BIN{XXXX}.{ext} (바이너리 파일)
  → Document IR
```

#### 직렬화 경로 (쓰기, 구현 대상)
```
Document IR
  → serialize_file_header → 256바이트
  → serialize_doc_info → 레코드 바이트
  → serialize_section → 레코드 바이트
  → (조건부 deflate 압축)
  → CFB 컨테이너 조립
  → HWP bytes
```

#### 레코드 포맷
```
헤더: 4바이트 LE
  bit 0-9:   TAG_ID (0-1023)
  bit 10-19: LEVEL  (0-1023)
  bit 20-31: SIZE   (0-4095, 0xFFF=확장)
SIZE == 0xFFF이면 다음 4바이트 = 실제 크기
데이터: SIZE 바이트
```

#### 사용 가능 인프라
- `cfb = "0.9"`: CFB 읽기/쓰기 모두 지원 (`CompoundFile::create()`)
- `flate2 = "1.0"`: deflate 압축/해제 (`DeflateEncoder`/`DeflateDecoder`)
- `byteorder = "1.5"`: LE 바이트 I/O
- 신규 의존성 불필요

### 4. 구현 단계

---

#### 1단계: ByteWriter + RecordWriter (기반 레이어)

**목표**: 바이트 수준, 레코드 수준 쓰기 프리미티브 구현

**파일**: `src/serializer/mod.rs`, `src/serializer/byte_writer.rs`, `src/serializer/record_writer.rs`

- `ByteWriter` 구조체: `ByteReader`의 역방향
  - `write_u8/u16/u32`, `write_i8/i16/i32`, `write_bytes`
  - `write_hwp_string(&str)` — u16 글자수 + UTF-16LE 바이트
  - `write_color_ref(u32)`
  - `into_bytes() -> Vec<u8>`

- `write_record(tag_id, level, data) -> Vec<u8>`: 레코드 헤더 인코딩
  - 헤더: `(tag_id & 0x3FF) | ((level & 0x3FF) << 10) | ((size & 0xFFF) << 20)`
  - size >= 4095: 확장 크기 (0xFFF + u32)

- `src/lib.rs`에 `pub mod serializer;` 추가

**테스트**:
- ByteWriter 각 메서드 단위 테스트 (~10개)
- 레코드 라운드트립: write → Record::read_all → 비교 (~5개)

---

#### 2단계: FileHeader + DocInfo 직렬화

**목표**: FileHeader(256바이트)와 DocInfo 스트림 레코드 직렬화

**파일**: `src/serializer/header.rs`, `src/serializer/doc_info.rs`

- `serialize_file_header(header) -> Vec<u8>`: 정확히 256바이트
  - 시그니처 "HWP Document File\0" + 패딩 + 버전 + 플래그

- `serialize_doc_info(doc_info, doc_props) -> Vec<u8>`: 필수 순서
  1. DOCUMENT_PROPERTIES — DocProperties (u16 × 7)
  2. ID_MAPPINGS — 각 타입별 개수 계산 (u32 × 15)
  3. BIN_DATA, FACE_NAME, BORDER_FILL, CHAR_SHAPE, TAB_DEF, NUMBERING, PARA_SHAPE, STYLE

**테스트**:
- FileHeader 라운드트립
- 개별 DocInfo 레코드 직렬화 라운드트립 (~10개)

---

#### 3단계: BodyText 직렬화 (문단, 텍스트, 컨트롤)

**목표**: Section 내 문단 트리를 레코드 스트림으로 직렬화

**파일**: `src/serializer/body_text.rs`, `src/serializer/control.rs`

- `serialize_section(section) -> Vec<u8>`: 섹션 전체 직렬화
- 문단별 레코드:
  - PARA_HEADER (L0): char_count, control_mask, para_shape_id, style_id
  - PARA_TEXT (L1): Rust String → UTF-16LE + 컨트롤 문자
  - PARA_CHAR_SHAPE (L1): (start_pos, char_shape_id) 쌍
  - PARA_LINE_SEG (L1): 36바이트/줄
  - PARA_RANGE_TAG (L1): 12바이트/태그
  - CTRL_HEADER (L1+): 컨트롤별 하위 레코드

- `serialize_control(ctrl, level) -> Vec<Record>`: 컨트롤 직렬화
  - SectionDef, ColumnDef, Table, Picture, Shape, Header/Footer, Footnote/Endnote, AutoNumber, Bookmark, HiddenComment

**핵심 난이도**: PARA_TEXT 직렬화 (UTF-16LE + 컨트롤 문자 인코딩)

**테스트**:
- 텍스트 인코딩 라운드트립 (한글, ASCII, 탭, 확장 컨트롤)
- 컨트롤 직렬화 라운드트립 (~5개)

---

#### 4단계: CFB 조립 + 압축 + WASM API + JS 통합

**목표**: 직렬화된 스트림을 CFB 컨테이너로 조립, WASM/JS 연결

**파일**: `src/serializer/cfb_writer.rs`, `src/wasm_api.rs`, `web/editor.js`, `web/editor.html`

- `write_hwp_cfb(header, doc_info, sections, bin_data, compressed) -> Vec<u8>`
  - cfb::CompoundFile::create() 인메모리 CFB
  - /FileHeader, /DocInfo, /BodyText/Section{N}, /BinData/ 스트림 작성
  - 조건부 deflate 압축 (flate2::write::DeflateEncoder)

- `exportHwp()` WASM API
- 에디터 저장/다운로드 버튼

**테스트**:
- 압축 라운드트립
- CFB 라운드트립
- 전체 라운드트립: Document → serialize_hwp → parse_hwp → 비교
- WASM 빌드 성공
- 기존 259개 + 신규 테스트 통과

### 5. 영향 범위

| 파일 | 변경 사항 |
|------|-----------|
| `src/serializer/mod.rs` | 신규: 모듈 루트, serialize_hwp() |
| `src/serializer/byte_writer.rs` | 신규: LE 바이트 쓰기 프리미티브 |
| `src/serializer/record_writer.rs` | 신규: 레코드 헤더 인코딩 |
| `src/serializer/header.rs` | 신규: FileHeader 직렬화 |
| `src/serializer/doc_info.rs` | 신규: DocInfo 레코드 직렬화 |
| `src/serializer/body_text.rs` | 신규: Section/Paragraph 직렬화 |
| `src/serializer/control.rs` | 신규: Control 직렬화 |
| `src/serializer/cfb_writer.rs` | 신규: CFB 컨테이너 조립 + 압축 |
| `src/lib.rs` | `pub mod serializer;` 추가 |
| `src/wasm_api.rs` | `exportHwp()` WASM API 추가 |
| `web/editor.js` | 저장/다운로드 핸들러 |
| `web/editor.html` | 저장 버튼 추가 |

### 6. 리스크 및 고려사항

- **컨트롤 직렬화 범위**: Table, Picture, Shape 등 주요 컨트롤의 바이너리 포맷이 복잡하다. 파싱 시 원본 바이트를 보존하는 방식과 모델에서 재구축하는 방식 중 선택이 필요하다. 가능한 모델 기반 재구축을 시도하되, 미지원 컨트롤은 원본 보존 방식을 사용한다.
- **라운드트립 정확도**: 바이트 단위 동일은 보장하기 어렵다 (패딩, 레코드 순서 등). 대신 파싱 결과(텍스트, 구조)의 동일성을 검증한다.
- **배포 문서**: ViewText (암호화된 배포 문서)의 직렬화는 이번 범위에서 제외한다. BodyText만 저장한다.
