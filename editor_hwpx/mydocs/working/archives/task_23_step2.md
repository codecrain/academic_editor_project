# 타스크 23 - 2단계 완료 보고서

## 완료 사항: FileHeader + DocInfo 직렬화

### 변경 파일

| 파일 | 변경 |
|------|------|
| `src/serializer/header.rs` | 신규: FileHeader 256바이트 직렬화 + 테스트 5개 |
| `src/serializer/doc_info.rs` | 신규: DocInfo 레코드 스트림 직렬화 + 테스트 11개 |
| `src/serializer/mod.rs` | `pub mod header;`, `pub mod doc_info;` 추가 |

### 구현 내용

1. **FileHeader 직렬화** (`header.rs`)
   - `serialize_file_header(header) -> Vec<u8>`: 정확히 256바이트
   - 시그니처 "HWP Document File\0" + 버전 + 플래그 + 패딩

2. **DocInfo 직렬화** (`doc_info.rs`)
   - `serialize_doc_info(doc_info, doc_props) -> Vec<u8>`: 전체 레코드 스트림
   - 필수 순서대로 직렬화:
     1. DOCUMENT_PROPERTIES — DocProperties (u16 × 7)
     2. ID_MAPPINGS — 각 타입별 개수 (u32 × 15)
     3. BIN_DATA — 바이너리 데이터 참조 (Link/Embedding/Storage 분기)
     4. FACE_NAME — 7개 언어별 폰트 (attr + 이름 + 대체 이름)
     5. BORDER_FILL — 4방향 인터리브 + 대각선 + 채우기 (Solid/Gradient/Image)
     6. CHAR_SHAPE — 7언어 × 폰트ID/장평/자간/크기 + 속성 + 색상
     7. TAB_DEF — 속성 + 탭 목록
     8. NUMBERING — 7수준 머리 정보 + 형식 문자열 + 시작 번호
     9. PARA_SHAPE — attr1 + 여백 + 줄간격 + ID 참조
     10. STYLE — 이름 + 타입 + ID 참조

### 테스트 결과

- **299개 테스트 통과** (기존 283개 + 신규 16개)
- FileHeader 테스트 5개:
  - `test_serialize_file_header_size`, `test_serialize_file_header_signature`
  - `test_serialize_file_header_roundtrip`, `test_serialize_file_header_all_flags`
  - `test_serialize_file_header_padding`
- DocInfo 테스트 11개:
  - `test_serialize_document_properties`, `test_serialize_face_name_simple`
  - `test_serialize_face_name_with_alt`, `test_serialize_char_shape_roundtrip`
  - `test_serialize_para_shape_roundtrip`, `test_serialize_style_roundtrip`
  - `test_serialize_bin_data_embedding`, `test_serialize_border_fill_solid`
  - `test_serialize_tab_def`, `test_serialize_numbering_roundtrip`
  - `test_serialize_doc_info_roundtrip` (전체 DocInfo 라운드트립)
