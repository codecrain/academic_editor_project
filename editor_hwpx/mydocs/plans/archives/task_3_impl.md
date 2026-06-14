# 타스크 3 - 구현 계획서: HWP 파서 구현

## 파싱 순서 원칙

HWP 5.0은 **참조 기반 스타일 시스템**을 사용한다. DocInfo에 스타일 객체 목록(폰트, 글자모양, 문단모양 등)을 저장하고, BodyText의 각 요소가 ID(인덱스)로 이를 참조한다.

```
파싱 순서: CFB 컨테이너 → FileHeader → DocInfo(참조 테이블) → BodyText(본문)
```

DocInfo 참조 테이블이 구축되지 않으면 BodyText를 올바르게 해석할 수 없다.

## 단계 구성 (5단계)

### 1단계: CFB 컨테이너 + 레코드 기반 구조

HWP 파일의 OLE/CFB 컨테이너를 열고, 스트림을 추출하고, 레코드 헤더를 파싱하는 기반 코드를 구현한다.

- `src/parser/mod.rs` 확장 - 파서 모듈 구조 재설계
- `src/parser/cfb_reader.rs` 생성 - CFB 컨테이너 열기, 스트림 추출
  - `FileHeader`, `DocInfo`, `BodyText/Section{N}`, `BinData/` 스트림 식별
  - flate2를 사용한 압축 스트림 해제
  - 배포용 문서(`ViewText/Section{N}`) 스트림 식별 및 추출
- `src/parser/record.rs` 생성 - 레코드 헤더 파싱
  - 태그 ID (bits 0~9), 레벨 (bits 10~19), 크기 (bits 20~31)
  - 확장 크기 처리 (크기 == 4095일 때 추가 4바이트)
  - `Record { tag_id, level, size, data: Vec<u8> }` 구조체
- `src/parser/tags.rs` 생성 - HWP 태그 상수 정의
  - HWPTAG_BEGIN (0x010), DocInfo 태그들, BodyText 태그들
- `src/parser/header.rs` 확장 - FileHeader 바이너리 파싱
  - 시그니처 검증, 버전, 플래그(압축/암호화/배포) 파싱
  - 배포용 문서 플래그 감지 및 처리

**검증**: CFB에서 스트림 추출 → 레코드 목록 파싱 → FileHeader 정보 출력 테스트

### 2단계: DocInfo 파싱 (참조 테이블 구축)

BodyText에서 참조하는 스타일 객체 목록을 파싱한다.

- `src/parser/doc_info.rs` 생성 - DocInfo 스트림 파싱
  - 레코드 순회 → 태그별 분기 처리
  - ID 매핑 테이블 구축 (파싱 결과가 곧 참조 인덱스)
- 파싱 대상 태그:
  - `HWPTAG_ID_MAPPINGS` - 각 타입별 개수
  - `HWPTAG_BIN_DATA` → `Vec<BinData>`
  - `HWPTAG_FACE_NAME` → `Vec<Vec<Font>>` (7개 언어)
  - `HWPTAG_BORDER_FILL` → `Vec<BorderFill>`
  - `HWPTAG_CHAR_SHAPE` → `Vec<CharShape>`
  - `HWPTAG_TAB_DEF` → `Vec<TabDef>`
  - `HWPTAG_PARA_SHAPE` → `Vec<ParaShape>`
  - `HWPTAG_STYLE` → `Vec<Style>`
- `src/parser/byte_reader.rs` 생성 - 바이트 읽기 유틸리티
  - `read_u8`, `read_u16`, `read_u32`, `read_i16`, `read_i32`
  - `read_utf16_string(len)`, `read_hwp_string()` (2바이트 길이 접두사 + UTF-16LE)
  - `read_color_ref()` (4바이트 BGR)

**검증**: 샘플 HWP에서 DocInfo 파싱 → 폰트/글자모양/문단모양 개수 및 내용 검증 테스트

### 3단계: BodyText 파싱 - 문단 (텍스트 + 스타일 참조)

섹션과 문단을 파싱한다. 문단의 텍스트와 스타일 참조를 IR에 매핑한다.

- `src/parser/body_text.rs` 생성 - BodyText 섹션 파싱
  - 섹션별 스트림(`BodyText/Section0`, `Section1`, ...) 순회
  - 배포용 문서: `ViewText/Section{N}` 스트림에서 읽기 (레코드 구조 동일)
  - 레코드 트리 구조 파싱 (레벨 기반 부모-자식)
- 파싱 대상 태그:
  - `HWPTAG_PARA_HEADER` → Paragraph 기본 정보 (글자 수, 컨트롤마스크, para_shape_id, style_id)
  - `HWPTAG_PARA_TEXT` → 텍스트 (UTF-16LE, 인라인 컨트롤 코드 처리)
  - `HWPTAG_PARA_CHAR_SHAPE` → `Vec<CharShapeRef>` (위치별 char_shape_id 참조)
  - `HWPTAG_PARA_LINE_SEG` → `Vec<LineSeg>` (줄 세그먼트 정보)
  - `HWPTAG_PARA_RANGE_TAG` → `Vec<RangeTag>`
  - `HWPTAG_CTRL_HEADER` → 컨트롤 타입 식별 (ctrl_id 4바이트)
  - `HWPTAG_PAGE_DEF` → PageDef (용지 크기, 여백)
  - `HWPTAG_COLUMN_DEF` → ColumnDef
  - `HWPTAG_SECTION_DEF` → SectionDef
- 인라인 컨트롤 코드 처리:
  - 0x0002: 구역/단 정의
  - 0x0003: 필드 시작
  - 0x000B: 컨트롤 삽입 위치 (표, 도형, 그림 등)
  - 0x000D: 문단 나눔
  - 0x0018: 탭
  - 기타 특수 문자 → 무시 또는 공백 치환

**검증**: 샘플 HWP에서 문단 텍스트 추출, 글자모양 참조 매핑 검증 테스트

### 4단계: BodyText 파싱 - 컨트롤 (표, 도형, 그림, 머리말/꼬리말)

문단 내 삽입되는 컨트롤 객체들을 파싱한다.

- `src/parser/control.rs` 생성 - 컨트롤 파서
  - ctrl_id 기반 분기: `tbl ` (표), `gso ` (그리기), `pic ` (그림), `head` (머리말), `foot` (꼬리말) 등
- 파싱 대상:
  - **표**: `HWPTAG_TABLE` → Table 속성, `HWPTAG_LIST_HEADER` → Cell, 셀 내 문단 재귀 파싱
  - **도형**: `HWPTAG_SHAPE_COMPONENT` → CommonObjAttr, 개별 도형 속성
    - 직선(`lin `), 사각형(`rec `), 타원(`ell `), 호(`arc `), 다각형(`pol `), 곡선(`cur `), 묶음(`grp `)
  - **그림**: `HWPTAG_SHAPE_COMPONENT` + 이미지 속성 → Picture, bin_data_id 참조
  - **머리말/꼬리말**: `HWPTAG_LIST_HEADER` → 문단 목록 재귀 파싱
  - **텍스트박스**: 도형 내 텍스트 → TextBox.paragraphs 재귀 파싱
- `src/parser/bin_data.rs` 생성 - BinData 스토리지에서 이미지 추출
  - `BinData/BIN{XXXX}.{ext}` 스트림 읽기
  - BinDataContent에 바이트 데이터 저장

**검증**: 표/도형/그림 포함 HWP 파싱 → 구조 정확성 검증 테스트

### 5단계: API 연결 + CLI + 빌드 검증

파서를 WASM API와 CLI에 연결하고 통합 테스트를 수행한다.

- `src/wasm_api.rs` 수정 - `from_bytes()` 실제 파서 연결
  - `Document::default()` → 실제 파싱 결과로 교체
  - 에러 처리 (파싱 실패 시 HwpError 반환)
- `src/main.rs` 수정 - CLI에서 실제 파싱 결과 사용
  - `create_empty()` → `from_bytes(&data)` 교체
  - `info` 명령: 실제 문서 정보 출력 (버전, 섹션 수, 폰트, 스타일)
  - `export-svg` 명령: 실제 렌더링 파이프라인 연결
- 통합 테스트
  - 빈 문서, 텍스트 문서, 표 포함 문서, 도형 포함 문서
  - 파싱 → 페이지네이션 → SVG 렌더링 엔드투엔드 검증
- 빌드 검증 (네이티브, 테스트, WASM)

**검증**: `rhwp info sample.hwp`, `rhwp export-svg sample.hwp` 실제 동작 확인

## 생성/수정 파일 예상

| 파일 | 단계 | 설명 |
|------|------|------|
| `src/parser/mod.rs` | 1 | 파서 모듈 재구성 |
| `src/parser/cfb_reader.rs` | 1 | CFB 컨테이너 + 압축 해제 |
| `src/parser/record.rs` | 1 | 레코드 헤더 파싱 |
| `src/parser/tags.rs` | 1 | HWP 태그 상수 |
| `src/parser/header.rs` | 1 | FileHeader 바이너리 파싱 확장 |
| `src/parser/byte_reader.rs` | 2 | 바이트 읽기 유틸리티 |
| `src/parser/doc_info.rs` | 2 | DocInfo 참조 테이블 파싱 |
| `src/parser/body_text.rs` | 3 | 섹션/문단 파싱 |
| `src/parser/control.rs` | 4 | 컨트롤 파싱 (표/도형/그림) |
| `src/parser/bin_data.rs` | 4 | BinData 이미지 추출 |
| `src/wasm_api.rs` | 5 | 파서 연결 |
| `src/main.rs` | 5 | CLI 실제 파싱 연결 |

## 상태

- 작성일: 2026-02-05
- 상태: 승인 완료
- 비고: 배포용 문서(ViewText) 지원 범위 포함
