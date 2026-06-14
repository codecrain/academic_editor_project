# 타스크 23 - 4단계 완료 보고서: CFB 조립 + 압축 + WASM API + JS 통합

## 완료 항목

### 4-1. `src/serializer/cfb_writer.rs` (약 290줄)
Document IR을 HWP 5.0 CFB 바이너리로 직렬화하는 최상위 모듈.

**주요 함수:**
| 함수 | 역할 |
|------|------|
| `serialize_hwp(doc)` | Document → HWP CFB 바이트 (최상위) |
| `compress_stream(data)` | raw deflate 압축 (wbits=-15) |
| `write_hwp_cfb(...)` | CFB 컨테이너 인메모리 조립 |
| `write_cfb_stream(cfb, path, data)` | 개별 스트림 쓰기 |
| `find_bin_data_info(...)` | BinDataContent → 스토리지 경로 매핑 |

**CFB 스트림 구조:**
- `/FileHeader` — 256바이트, 항상 비압축
- `/DocInfo` — 레코드 바이트, 조건부 deflate 압축
- `/BodyText/Section{N}` — 레코드 바이트, 조건부 deflate 압축
- `/BinData/BIN{XXXX}.{ext}` — 바이너리 데이터 (원본 보존)

### 4-2. `src/serializer/mod.rs` 갱신
- `pub mod cfb_writer;` 추가
- `pub use cfb_writer::{serialize_hwp, SerializeError};` re-export

### 4-3. `src/wasm_api.rs` — `exportHwp()` API
- WASM: `#[wasm_bindgen(js_name = exportHwp)] pub fn export_hwp(&self) -> Result<Vec<u8>, JsValue>`
- 네이티브: `pub fn export_hwp_native(&self) -> Result<Vec<u8>, HwpError>`

### 4-4. `web/editor.html` — 저장 버튼
- 툴바에 `저장` 버튼 추가 (`#save-btn`)

### 4-5. `web/editor.js` — 저장/다운로드 핸들러
- `handleSave()` 함수: `doc.exportHwp()` → Blob → `<a>` 다운로드
- Ctrl+S 단축키 바인딩
- 원본 파일명 기반 `_saved.hwp` 접미사
- 저장 중 로딩 인디케이터 표시

## 테스트 결과

```
test result: ok. 327 passed; 0 failed; 0 ignored
```

| 카테고리 | 신규 테스트 수 | 설명 |
|----------|---------------|------|
| cfb_writer | 6개 | 압축 라운드트립, 빈 문서 CFB, 스트림 확인, 압축 모드, 비압축 전체 라운드트립, 압축 전체 라운드트립 |
| wasm_api | 1개 | exportHwp 빈 문서 테스트 |

기존 319개 + 신규 8개 = 327개 전부 통과.

### WASM 빌드
```
[INFO]: :-) Done in 21.03s
[INFO]: :-) Your wasm pkg is ready to publish at /app/pkg.
```

## 전체 라운드트립 검증

`test_full_roundtrip_uncompressed` 테스트에서:
1. Document IR 구성 (폰트, 글자모양, 문단모양, 스타일, 텍스트 "안녕하세요")
2. `serialize_hwp()` → HWP CFB 바이트
3. `CfbReader::open()` → 스트림 읽기
4. `parse_file_header()` → 버전/플래그 일치 확인
5. `parse_doc_info()` → 폰트명/스타일명 일치 확인
6. `parse_body_text_section()` → 텍스트 "안녕하세요" 일치 확인

`test_full_roundtrip_compressed`에서도 동일 검증 (압축 모드).

## 승인 요청

4단계 완료. 타스크 23 전체 완료 보고서 작성 및 커밋을 진행하시겠습니까?
