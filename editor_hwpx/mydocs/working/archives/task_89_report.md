# 타스크 89: HWPX 파일 처리 지원 — 최종 완료 보고서

## 완료 일자
2026-02-15

## 개요
HWPX(XML 기반 한글 문서) 파일을 파싱하여 기존 Document IR로 변환하는 파서를 구현하고,
웹 뷰어 및 CLI에서 HWP/HWPX 포맷을 자동 감지하여 처리할 수 있도록 통합하였다.

## 구현 결과

### 1단계: 의존성 추가 + ZIP 컨테이너 + 포맷 자동 감지

| 항목 | 결과 |
|------|------|
| `Cargo.toml` | `zip = "2.4"`, `quick-xml = "0.37"` 추가 |
| `src/parser/mod.rs` | `FileFormat` 열거형, `detect_format()` (매직바이트 기반) |
| `src/parser/hwpx/mod.rs` | `parse_hwpx()` 진입점, `HwpxError` 에러 타입 |
| `src/parser/hwpx/reader.rs` | `HwpxReader` — ZIP 컨테이너 읽기 |
| `src/parser/hwpx/content.rs` | content.hpf 파싱 — 섹션 파일 목록 + BinData 목록 추출 |

### 2단계: header.xml 파싱 → DocInfo 변환

| 항목 | 결과 |
|------|------|
| `src/parser/hwpx/header.rs` (~700행) | header.xml → DocInfo + DocProperties 변환 |
| 글꼴 | `<hh:fontface>` → `font_faces[lang]` (7개 언어 그룹) |
| 글자모양 | `<hh:charPr>` → `CharShape` (크기/굵기/기울임/밑줄/색상 등) |
| 문단모양 | `<hh:paraPr>` → `ParaShape` (정렬/여백/줄간격/테두리) |
| 스타일 | `<hh:style>` → `Style` (이름/문단모양ID/글자모양ID) |
| 테두리/배경 | `<hh:borderFill>` → `BorderFill` (4방향 선/배경색/그라데이션) |
| 탭 정의 | `<hh:tabPr>` → `TabDef` |
| 번호 매기기 | `<hh:numbering>` → `Numbering` |
| 색상 변환 | `#RRGGBB` → HWP `0x00BBGGRR` 포맷 |

### 3단계: section*.xml 파싱 → Section 변환

| 항목 | 결과 |
|------|------|
| `src/parser/hwpx/section.rs` (~680행) | section XML → Section 모델 변환 |
| 섹션 정의 | `<hp:secPr>/<hp:pagePr>/<hp:margin>` → SectionDef + PageDef |
| 문단 | `<hp:p>/<hp:run>/<hp:t>` → Paragraph (text + char_shapes + line_segs) |
| 표 | `<hp:tbl>/<hp:tr>/<hp:tc>` → Table + Cell (행열수/셀병합/셀여백/테두리) |
| 이미지 | `<hp:pic>/<hp:img>` → Control::Picture (BinData ID 연결) |
| BinData | ZIP BinData/ → bin_data_content (이미지 바이너리 로딩) |

**핵심 발견**: HWPX에서 `<hp:secPr>`은 최상위 요소가 아니라 첫 번째 문단의 `<hp:run>` 내부에 위치함.
이를 감안하여 `parse_paragraph`에서 secPr을 파싱하여 SectionDef를 추출하도록 구현.

### 렌더링 검증 과정에서 발견·수정한 추가 이슈

| 이슈 | 원인 | 수정 내용 |
|------|------|----------|
| 줄 겹침 (lineseg 미파싱) | `<hp:linesegarray>/<hp:lineseg>` 파싱 누락 | `parse_lineseg_array`, `parse_lineseg_element` 함수 추가 — textpos/vertpos/vertsize/textheight/baseline/spacing/horzpos/horzsize/flags 매핑 |
| 용지 방향 오류 (A4가 가로로 렌더링) | HWPX는 실제 치수를 width/height에 저장하므로 landscape 플래그로 swap 불필요. 기존 코드가 `landscape="WIDELY"` 시 swap 수행 | HWPX에서 landscape 속성 무시 (항상 false 유지). lineseg horzsize=48188 ≈ 세로 본문 폭 48190으로 검증 |
| 전체 취소선 표시 | `<hh:strikeout shape="3D">` — "3D"는 유효한 LineStyleType2 값이 아님. 기존 코드: `val != "NONE"` → 모두 취소선 처리 | 유효한 취소선 형태(SOLID/DASH/DOT 등)만 명시적 화이트리스트로 매칭 |
| 표 경계선 누락 | `<hp:tc>` 요소의 `borderFillIDRef` 속성 미파싱 (함수 파라미터 `_e`로 무시) | `_e` → `e`로 변경, `borderFillIDRef`/`header` 속성 파싱 추가 |
| 표 셀 세로 정렬 누락 | `<hp:subList vertAlign="CENTER">` 미파싱 | subList 요소에서 vertAlign 파싱 → Cell.vertical_align 매핑 |

### 4단계: WASM/프론트엔드 통합 + 빌드 + 검증

| 항목 | 결과 |
|------|------|
| `src/wasm_api.rs` | `from_bytes()`에 `detect_format()` 분기 적용 |
| `rhwp-studio/src/main.ts` | `.hwpx` 파일 업로드/드래그앤드롭 허용 |
| `rhwp-studio/index.html` | `<input accept=".hwp,.hwpx">` |
| CLI | `export-svg`, `info` 명령에서 HWPX 자동 지원 |

## 검증 결과

| 검증 항목 | 결과 |
|----------|------|
| `docker compose run --rm test` | ✅ 529개 테스트 통과 (HWPX 전용 테스트 포함) |
| `docker compose run --rm wasm` | ✅ WASM 빌드 성공 (1,215KB) |
| `npm run build` (Vite) | ✅ 프론트엔드 빌드 성공 |
| 샘플 HWPX info 출력 | ✅ 구역2개, 문단121개, 표26개, 그림5개, BinData5개 인식 |
| 샘플 HWPX SVG 내보내기 | ✅ 9페이지 정상 생성 (A4 세로 793.7×1122.5px) |
| 용지 크기 | ✅ 59528×84188 HWPUNIT 정상 파싱 |
| 여백 | ✅ 좌5669 우5669 상4251 하4251 정상 |
| 5개 HWPX 샘플 파일 | ✅ 모두 정상 로드 및 렌더링 |

## 수정 파일 목록

### 신규 파일 (5개)
- `src/parser/hwpx/mod.rs` — HWPX 파서 진입점
- `src/parser/hwpx/reader.rs` — ZIP 컨테이너 읽기
- `src/parser/hwpx/content.rs` — content.hpf 파싱
- `src/parser/hwpx/header.rs` — header.xml → DocInfo
- `src/parser/hwpx/section.rs` — section*.xml → Section

### 수정 파일 (5개)
- `Cargo.toml` — zip, quick-xml 의존성 추가
- `src/parser/mod.rs` — hwpx 모듈 선언, detect_format(), FileFormat
- `src/wasm_api.rs` — from_bytes() 포맷 감지 분기
- `rhwp-studio/src/main.ts` — .hwpx 파일 허용
- `rhwp-studio/index.html` — 파일 입력 accept 확장

## 제한 사항 (알려진 미구현 항목)
- 도형(ShapeObject) 파싱 미구현 — HWPX `<hp:drawText>` 등
- 머리글/바닥글/각주 미구현
- 다단(multi-column) 레이아웃 미구현
- 표 중첩(nested table) 파싱은 구조상 가능하나 미검증
- 이미지 크기(그림3~5)가 0×0 — pic 요소의 width/height 속성 매핑 추가 필요

## 아키텍처

```
[HWPX 파일 (ZIP)]
     │
     ▼
  HwpxReader ← zip 크레이트
     │
     ├── content.hpf → 섹션 목록
     ├── header.xml → DocInfo
     ├── section*.xml → Section
     └── BinData/* → bin_data_content
     │
     ▼
  Document IR (기존 모델 공유)
     │
     ▼
  [기존 파이프라인: compose → paginate → render → SVG/Canvas]
```
