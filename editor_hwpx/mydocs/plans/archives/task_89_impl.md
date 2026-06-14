# 타스크 89: HWPX 파일 처리 지원 — 구현계획서

## 구현 단계 (4단계)

---

### 1단계: 의존성 추가 + ZIP 컨테이너 + 포맷 자동 감지

**목표**: HWPX ZIP 파일을 열고 내부 파일 목록을 읽을 수 있는 기반 구축, HWP/HWPX 포맷 자동 감지

**수정 파일**:
- `Cargo.toml` — `zip`, `quick-xml` 의존성 추가
- `src/parser/mod.rs` — `hwpx` 서브모듈 선언, `detect_format()`, `parse_auto()` 추가
- `src/parser/hwpx/mod.rs` — HWPX 파서 진입점 (`parse_hwpx()`)
- `src/parser/hwpx/reader.rs` — ZIP 컨테이너 읽기 (`HwpxReader`)
- `src/parser/hwpx/content.rs` — `content.hpf` 파싱 (섹션 파일 목록 추출)

**구현 내용**:
```rust
// 포맷 자동 감지
pub enum FileFormat { Hwp, Hwpx, Unknown }
pub fn detect_format(data: &[u8]) -> FileFormat;

// HwpxReader: ZIP 컨테이너 래퍼
pub struct HwpxReader { archive: ZipArchive<Cursor<Vec<u8>>> }
impl HwpxReader {
    pub fn open(data: &[u8]) -> Result<Self, HwpxError>;
    pub fn read_header_xml(&mut self) -> Result<String, HwpxError>;
    pub fn read_section_xml(&mut self, index: usize) -> Result<String, HwpxError>;
    pub fn read_bin_data(&mut self, path: &str) -> Result<Vec<u8>, HwpxError>;
    pub fn section_count(&self) -> usize;  // content.hpf에서 추출
}
```

**검증**: `docker compose run --rm test` — ZIP 열기/매직바이트 감지 테스트 통과

---

### 2단계: header.xml 파싱 → DocInfo 변환

**목표**: HWPX header.xml을 파싱하여 기존 `DocInfo` 모델(글꼴, 글자모양, 문단모양, 스타일, 테두리/배경)로 변환

**수정 파일**:
- `src/parser/hwpx/header.rs` — header.xml 파싱 모듈

**구현 내용**:
```rust
pub fn parse_hwpx_header(xml: &str) -> Result<(DocInfo, DocProperties), HwpxError>;
```

주요 매핑:
| HWPX XML 요소 | → | Document 모델 |
|---------------|---|---------------|
| `<hh:fontface>/<hh:font face="...">` | → | `DocInfo.font_faces[lang][i].name` |
| `<hh:charPr id="N" height="H">` + `<hh:bold/>` 등 | → | `DocInfo.char_shapes[N]` |
| `<hh:paraPr id="N">/<hh:align>/<hh:margin>` | → | `DocInfo.para_shapes[N]` |
| `<hh:style id="N" paraPrIDRef="P" charPrIDRef="C">` | → | `DocInfo.styles[N]` |
| `<hh:borderFill>` | → | `DocInfo.border_fills[N]` |
| `<hh:numbering>/<hh:paraHead>` | → | `DocInfo.numberings[N]` |
| `<hh:tabPr>` | → | `DocInfo.tab_defs[N]` |

**참고**: openhwp 크레이트의 `header/` 모듈 + Python `header_parser.py`

**검증**: 샘플 HWPX header.xml 파싱 → DocInfo 필드 검증 테스트

---

### 3단계: section*.xml 파싱 → Section/Paragraph/Control 변환

**목표**: HWPX 섹션 XML을 파싱하여 기존 `Section` 모델(문단, 표, 이미지, 섹션정의)로 변환

**수정 파일**:
- `src/parser/hwpx/section.rs` — section XML 파싱 모듈

**구현 내용**:
```rust
pub fn parse_hwpx_section(xml: &str) -> Result<Section, HwpxError>;
```

주요 매핑:
| HWPX XML 요소 | → | Document 모델 |
|---------------|---|---------------|
| `<hs:secPr>/<hs:pagePr>/<hs:margin>` | → | `Section.section_def.page_def` |
| `<hp:p paraPrIDRef="P" styleIDRef="S">` | → | `Paragraph { para_shape_id, style_id, ... }` |
| `<hp:run charPrIDRef="C">/<hp:t>` | → | `Paragraph.text` + `Paragraph.char_shapes` |
| `<hp:tbl>/<hp:tr>/<hp:tc>` | → | `Control::Table(Table { cells, ... })` |
| `<hp:pic>/<hp:img binaryItemIDRef>` | → | `Control::Picture(...)` |
| `<hp:tab/>`, `<hp:lineBreak/>` | → | 제어 문자 (`\t`, line break) |

처리 순서:
1. 섹션 정의(`<secPr>`) → `SectionDef` + `PageDef`
2. 문단(`<p>`) 순회 → 각 문단의 런(`<run>`) 내 텍스트/컨트롤 추출
3. 표(`<tbl>`) → `Table`/`Cell` 구조 (재귀 — 중첩 표 지원)
4. 이미지(`<pic>`) → `Control::Picture` (BinData ID 연결)
5. BinData 로딩 → `bin_data_content` (ZIP의 `BinData/` 폴더)

**검증**: 샘플 HWPX 파싱 → 섹션/문단/표/이미지 구조 검증 테스트

---

### 4단계: WASM/프론트엔드 통합 + 빌드 + 검증

**목표**: 웹 뷰어에서 .hwpx 파일을 로드하여 렌더링 확인

**수정 파일**:
- `src/wasm_api.rs` — `from_bytes()`에 포맷 자동 감지 적용
- `rhwp-studio/src/main.ts` — `.hwpx` 파일 수용
- `rhwp-studio/src/core/wasm-bridge.ts` — 파일명 확장자 처리

**구현 내용**:

```rust
// wasm_api.rs — from_bytes() 수정
pub fn from_bytes(data: &[u8]) -> Result<HwpDocument, HwpError> {
    let document = match crate::parser::detect_format(data) {
        FileFormat::Hwpx => crate::parser::hwpx::parse_hwpx(data)
            .map_err(|e| HwpError::InvalidFile(format!("HWPX: {}", e)))?,
        _ => crate::parser::parse_hwp(data)
            .map_err(|e| HwpError::InvalidFile(e.to_string()))?,
    };
    // 이후 파이프라인 동일 (compose, paginate, render)
    ...
}
```

```typescript
// main.ts — 파일 확장자 검사
const ext = file.name.toLowerCase().split('.').pop();
if (!['hwp', 'hwpx'].includes(ext ?? '')) {
    alert('HWP, HWPX 파일만 지원합니다.');
    return;
}
```

**검증**:
1. `docker compose run --rm test` — 모든 Rust 테스트 통과
2. `docker compose run --rm wasm` — WASM 빌드 성공
3. `npm run build` — Vite 빌드 성공
4. 웹 뷰어에서 샘플 HWPX 파일 로드 → 렌더링 확인

---

## 수정 파일 요약

| 파일 | 단계 | 변경 내용 |
|------|------|----------|
| `Cargo.toml` | 1 | `zip`, `quick-xml` 의존성 추가 |
| `src/parser/mod.rs` | 1 | `hwpx` 모듈 선언, `detect_format()`, `FileFormat` |
| `src/parser/hwpx/mod.rs` | 1 | HWPX 파서 진입점 `parse_hwpx()` |
| `src/parser/hwpx/reader.rs` | 1 | ZIP 컨테이너 읽기 `HwpxReader` |
| `src/parser/hwpx/content.rs` | 1 | content.hpf 파싱 (섹션 목록) |
| `src/parser/hwpx/header.rs` | 2 | header.xml → DocInfo 변환 |
| `src/parser/hwpx/section.rs` | 3 | section*.xml → Section 변환 |
| `src/wasm_api.rs` | 4 | `from_bytes()` 포맷 감지 적용 |
| `rhwp-studio/src/main.ts` | 4 | `.hwpx` 파일 수용 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 4 | 파일명 처리 |

## 의존성 다이어그램

```
[HWPX 파일 (ZIP)]
     │
     ▼
  HwpxReader (reader.rs)        ← zip 크레이트
     │
     ├── content.hpf → 섹션 목록 (content.rs)
     ├── header.xml → DocInfo    (header.rs)    ← quick-xml
     ├── section*.xml → Section  (section.rs)   ← quick-xml
     └── BinData/* → bin_data_content
     │
     ▼
  Document 모델 (기존)
     │
     ▼
  [기존 파이프라인: compose → paginate → render]
```
