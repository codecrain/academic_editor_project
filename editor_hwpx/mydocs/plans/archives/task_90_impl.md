# 타스크 90: HWPX 파서 정확도 개선 — 구현계획서

## 구현 단계 (4단계)

---

### 1단계: 공통 유틸리티 추출 + header.rs charPr/paraPr 보완

**목표**: 중복 유틸리티 함수를 공통 모듈로 추출하고, charPr/paraPr의 누락 속성을 보완

**수정 파일**:
- `src/parser/hwpx/utils.rs` (신규) — 공통 유틸리티 함수 추출
- `src/parser/hwpx/mod.rs` — utils 서브모듈 선언
- `src/parser/hwpx/header.rs` — charPr/paraPr 파싱 보완, 중복 함수 제거
- `src/parser/hwpx/section.rs` — 중복 함수 제거, utils 사용

**구현 내용**:

1. **utils.rs 신규 생성** — header.rs와 section.rs에 중복되는 함수 추출:
   ```rust
   pub fn local_name(name: &[u8]) -> &[u8];
   pub fn attr_str(attr: &Attribute) -> String;
   pub fn parse_u8(attr: &Attribute) -> u8;
   pub fn parse_i8(attr: &Attribute) -> i8;
   pub fn parse_u16(attr: &Attribute) -> u16;
   pub fn parse_i16(attr: &Attribute) -> i16;
   pub fn parse_u32(attr: &Attribute) -> u32;
   pub fn parse_i32(attr: &Attribute) -> i32;
   pub fn parse_color(attr: &Attribute) -> u32;  // #RRGGBB → 0x00BBGGRR
   pub fn skip_element(reader: &mut Reader<&[u8]>, end_tag: &[u8]) -> Result<(), HwpxError>;
   ```

2. **charPr 파싱 보완** (header.rs):
   - `<hh:emboss/>` → `cs.emboss = true` (기존 CharShape에 필드 없음 → attr 비트 활용)
   - `<hh:engrave/>` → `cs.engrave = true`
   - 현재 이미 파싱되는 항목 확인:
     - ✓ fontRef (7개 언어), ratio, spacing, relSz, offset
     - ✓ bold, italic, underline, strikeout, outline, shadow, supscript, subscript
     - ✓ height(base_size), textColor, shadeColor, borderFillIDRef
   - **추가 필요**: `<hh:charSz>` (7개 언어별 실제 크기) — OWPML 스키마에서 optional

3. **paraPr 파싱 보완** (header.rs):
   - `<hh:breakSetting>` 파싱 추가:
     ```
     widowOrphan → attr2 bit 5
     keepWithNext → attr2 bit 6
     keepLines → attr2 bit 7
     pageBreakBefore → attr2 bit 8
     ```
   - `<hh:autoSpacing>` 파싱 추가:
     ```
     eAsianEng → attr1 bit 20 (한글-영어 자동간격)
     eAsianNum → attr1 bit 21 (한글-숫자 자동간격)
     ```
   - `<hh:margin>` 자식 텍스트 노드 파싱 대응:
     OWPML 스키마에서 margin 하위 요소(intent/left/right/prev/next)의 값이
     속성이 아닌 **자식 요소의 텍스트 노드**에 있을 수 있음 — 두 방식 모두 대응
   - `condense` → `ps.condense` (기존 `{}` 무시 → 값 저장)
   - `fontLineHeight` → attr 비트 저장
   - `snapToGrid` → attr 비트 저장
   - `<hh:border>` 보완: `offsetLeft/Right/Top/Bottom` → `ps.border_spacing[0..4]`

**검증**: `docker compose run --rm test` — 기존 529개 테스트 + 신규 단위 테스트 통과

---

### 2단계: section.rs 텍스트/특수문자/표 셀 파싱 보완

**목표**: 표 셀 크기, 특수문자 처리, 이미지 크기 등 렌더링 직결 항목 수정

**수정 파일**:
- `src/parser/hwpx/section.rs` — 표/이미지/텍스트 파싱 보완

**구현 내용**:

1. **이미지 크기 0×0 수정** (핵심):
   - 현재 `parse_picture`에서 `<hp:imgRect>/<hp:pt>` 미파싱
   - 수정: `<hp:sz>` 또는 `<hp:curSz>` 속성의 width/height를 `ImageAttr.width/height`에 매핑
   - python-hwpx 참조: `pic` 요소 내 `<hp:sz width="..." height="..."/>`

2. **`<hp:columnBreak/>` 특수문자 추가**:
   - 현재: `lineBreak`, `tab`만 처리
   - 추가: `columnBreak` → 열 나눔 문자 (0x000B 또는 줄바꿈으로 대체)

3. **표 셀 파싱 보완**:
   - `<hp:cellPr>` 파싱 추가 — 현재 건너뜀
     ```
     borderFillIDRef → cell.border_fill_id (cellPr에서도 제공)
     textDirection → cell.text_direction
     ```
   - `<hp:tcPr>` 보완:
     ```
     cellMargin (left/right/top/bottom) → cell margin 필드
     ```

4. **문단 속성 보완**:
   - `pageBreak` 속성 파싱 → 문단 단위 쪽나눔 처리
   - `columnBreak` 속성 파싱

**검증**: `docker compose run --rm test` — 모든 테스트 통과

---

### 3단계: borderFill 보완 + 글꼴 언어 매핑 수정

**목표**: borderFill의 그라데이션/이미지 배경 파싱 보완, 글꼴 언어 그룹 정확한 매핑

**수정 파일**:
- `src/parser/hwpx/header.rs` — borderFill, fontface 수정

**구현 내용**:

1. **글꼴 언어 그룹 매핑 수정**:
   - 현재: 모든 글꼴이 `font_faces[0]`(한글)에만 추가됨
   - 수정: `<hh:fontface lang="...">` 속성 기반 언어 그룹 매핑
     ```
     HANGUL → font_faces[0]
     LATIN → font_faces[1]
     HANJA → font_faces[2]
     JAPANESE → font_faces[3]
     OTHER → font_faces[4]
     SYMBOL → font_faces[5]
     USER → font_faces[6]
     ```

2. **borderFill 보완**:
   - `<hh:gradation>` 파싱 보완 — 현재 기본 속성만 파싱
     - `<hh:color>` 자식 요소들 → 그라데이션 색상 목록
   - `<hh:imgBrush>` 파싱 보완 — 이미지 배경 모드
   - `<hh:slash>`, `<hh:backSlash>` 대각선 나눔 파싱

3. **paraPr margin 텍스트 노드 대응**:
   - OWPML 스키마: `<hh:margin><hh:left>200</hh:left>...</hh:margin>` 형태 가능
   - 현재 속성 기반(`left="200"`)만 파싱 → 텍스트 노드 방식도 대응

**검증**: `docker compose run --rm test` — 모든 테스트 통과

---

### 4단계: 빌드 + SVG 내보내기 검증 + 최종 보고서

**목표**: WASM/Vite 빌드 확인, 5개 HWPX 샘플 SVG 렌더링 비교 검증

**수정 파일**:
- (빌드 검증만, 추가 수정 없음 예정)

**검증**:
1. `docker compose run --rm test` — 모든 Rust 테스트 통과
2. `docker compose run --rm wasm` — WASM 빌드 성공
3. `npm run build` — Vite 빌드 성공
4. 5개 HWPX 샘플 `export-svg` → 렌더링 품질 확인:
   - 이미지 크기 정상 (이전: 0×0)
   - 글꼴 언어별 정확 매핑
   - 문단 줄나눔 설정 반영
   - 표 셀 속성 정확 파싱
5. 최종 결과 보고서 작성

---

## 수정 파일 요약

| 파일 | 단계 | 변경 내용 |
|------|------|----------|
| `src/parser/hwpx/utils.rs` (신규) | 1 | 공통 유틸리티 함수 |
| `src/parser/hwpx/mod.rs` | 1 | utils 서브모듈 선언 |
| `src/parser/hwpx/header.rs` | 1,3 | charPr/paraPr/borderFill/fontface 보완 |
| `src/parser/hwpx/section.rs` | 1,2 | 이미지 크기, 표 셀, 특수문자 보완 |

## 우선순위 근거

렌더링 품질 직결 항목 우선:
1. 이미지 크기 0×0 → 가시적 결함
2. 글꼴 언어 그룹 → 한글/영어 혼합 문서에서 폰트 불일치
3. paraPr breakSetting → 페이지네이션 정확도
4. 표 셀 속성 → 표 렌더링 품질
5. borderFill 그라데이션 → 시각적 완성도
