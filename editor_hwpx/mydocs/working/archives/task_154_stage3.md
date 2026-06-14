# 타스크 154 3단계 완료 보고서

> **작업일**: 2026-02-23
> **단계**: 3/3 — HWPX 컨트롤 파싱 확장 (전체 컨트롤 구현)

---

## 변경 내용

### 1. 그리기 객체 파싱 (`<hp:rect>`, `<hp:ellipse>` 등)

**파일**: `src/parser/hwpx/section.rs`

- `parse_shape_object()` 함수 신규 추가 — 6종 그리기 객체 파싱
  - `<hp:rect>` → `Control::Shape(ShapeObject::Rectangle(...))`
  - `<hp:ellipse>` → `ShapeObject::Ellipse`
  - `<hp:line>` → `ShapeObject::Line`
  - `<hp:arc>` → `ShapeObject::Arc`
  - `<hp:polygon>` → `ShapeObject::Polygon`
  - `<hp:curve>` → `ShapeObject::Curve`
- 공통 속성 파싱: pos, sz, curSz, orgSz, offset, outMargin, lineShape
- `<hp:pt0>`~`<hp:pt3>` 꼭짓점 좌표 파싱 (Rectangle)
- `<hp:drawText>` → `DrawingObjAttr.text_box` (글상자 내 문단 파싱)

### 2. 글상자 파싱 (`<hp:drawText>`)

- `parse_draw_text()` 함수 신규 추가
- `<hp:subList>` 내 `<hp:p>` 문단 재귀 파싱 → `TextBox.paragraphs`
- `vertAlign` 속성 → `TextBox.vertical_align` (TOP/CENTER/BOTTOM)
- `<hp:textMargin>` → `TextBox.margin_left/right/top/bottom`

### 3. 묶음(그룹) 객체 파싱 (`<hp:container>`)

- `parse_container()` 함수 신규 추가
- `<hp:container>` → `Control::Shape(ShapeObject::Group(GroupShape {...}))`
- 자식 객체 재귀 파싱:
  - `<hp:pic>` → `ShapeObject::Picture`
  - `<hp:rect>` 등 → 그리기 객체
  - `<hp:container>` → 중첩 그룹
- `GroupShape.children: Vec<ShapeObject>` 으로 수집

### 4. `<hp:ctrl>` 파싱 — 전체 컨트롤 구현

**hwp2hwpx/ForChars.java** 매핑 기준으로 모든 `<hp:ctrl>` 자식 컨트롤 구현.

| 자식 요소 | 변환 대상 | 구현 내용 |
|-----------|-----------|-----------|
| `<colPr>` | `Control::ColumnDef` | 문단 중간 단 변경 (기존) |
| `<pageHiding>` | `Control::PageHide` | 머리말/꼬리말/테두리 감추기 (기존) |
| `<pageNum>` | `Control::PageNumberPos` | 쪽 번호 위치/형식 (기존) |
| **`<header>`** | `Control::Header` | **applyPageType + subList 문단 파싱** |
| **`<footer>`** | `Control::Footer` | **applyPageType + subList 문단 파싱** |
| **`<footNote>`** | `Control::Footnote` | **number + subList 문단 파싱** |
| **`<endNote>`** | `Control::Endnote` | **number + subList 문단 파싱** |
| **`<autoNum>`** | `Control::AutoNumber` | **num, numType + autoNumFormat 자식 파싱** |
| **`<newNum>`** | `Control::NewNumber` | **num, numType 속성 파싱** |
| **`<bookmark>`** | `Control::Bookmark` | **name 속성 파싱** |
| **`<hiddenComment>`** | `Control::HiddenComment` | **subList 문단 파싱** |
| **`<fieldBegin>`** | `Control::Field` | **type, name + parameters/Command 파싱** |
| **`<fieldEnd>`** | (skip) | **마커 — 스킵 처리** |

### 5. 문단 레벨 컨트롤 (ctrl 밖)

| 요소 | 변환 대상 | 구현 내용 |
|------|-----------|-----------|
| **`<compose>`** | `Control::CharOverlap` | circleType, charSz, composeType, composeText, charPr |
| **`<dutmal>`** | `Control::Ruby` | posType, subText(→ruby_text) |
| **`<equation>`** | `Control::Shape(Rectangle)` | 레이아웃 속성만 파싱 (수식 렌더링은 미지원) |

### 6. 공통 헬퍼 함수

**기존 (이전 작업)**:
- `parse_object_element_attrs()` — 개체 요소 속성 공통 파싱
- `parse_object_layout_child()` — 레이아웃 자식 요소 공통 파싱
- `parse_line_shape_attr()` — `<hp:lineShape>` → `ShapeBorderLine`

**신규 (이번 확장)**:
- `parse_sublist_paragraphs()` — header/footer/footnote/endnote/hiddenComment 공통 subList 파싱
- `parse_bool_attr()` — 불리언 속성 값 파싱 ("1" / "true")
- `parse_page_hiding_attrs()` — pageHiding 속성 추출
- `parse_page_num_attrs()` — pageNum 속성 추출
- `parse_bookmark_attrs()` — bookmark name 속성 추출
- `parse_new_num_attrs()` — newNum 속성 추출
- `parse_autonum_attrs()` — autoNum 속성 추출 (Empty 이벤트용)
- `parse_field_begin_attrs()` — fieldBegin 속성 추출 (Empty 이벤트용)
- `parse_num_type()` — numType 문자열 → AutoNumberType 변환
- `parse_field_type()` — FieldType 문자열 → FieldType 변환
- `parse_apply_page_type()` — applyPageType 문자열 → HeaderFooterApply 변환
- `parse_ctrl_header()` — header 요소 전체 파싱 (attrs + subList)
- `parse_ctrl_footer()` — footer 요소 전체 파싱
- `parse_ctrl_footnote()` — footNote 요소 전체 파싱
- `parse_ctrl_endnote()` — endNote 요소 전체 파싱
- `parse_ctrl_autonum()` — autoNum 요소 전체 파싱 (autoNumFormat 자식 포함)
- `parse_ctrl_hidden_comment()` — hiddenComment 요소 전체 파싱
- `parse_ctrl_field_begin()` — fieldBegin 요소 전체 파싱 (parameters/Command 포함)
- `parse_field_parameters()` — fieldBegin의 parameters 자식 파싱
- `parse_compose()` — compose (글자겹침) 파싱
- `read_compose_text()` — composeText 텍스트 읽기
- `parse_dutmal()` — dutmal (덧말) 파싱
- `read_dutmal_text()` — dutmal 내부 텍스트 읽기
- `parse_equation()` — equation (수식) 레이아웃 파싱

---

## 참조 자료

| 참조 | 용도 |
|------|------|
| `hwp2hwpx/ForChars.java` | HWP Control → HWPX 요소 매핑 (전수 목록) |
| `hwp2hwpx/section/object/For*.java` | 각 컨트롤별 HWPX 속성 매핑 |
| `python-hwpx/oxml/body.py` | INLINE_OBJECT_NAMES 참조 |
| OWPML 스키마 | 요소 전체 목록 확인 |

---

## 검증 결과

| 항목 | 결과 |
|------|------|
| `cargo test` | **608 통과**, 0 실패 |
| `cargo clippy -- -D warnings` | **경고 0** |
| HWPX 9개 파일 SVG 내보내기 | 31 SVG, **0 에러** |
| HWP 파일 회귀 테스트 | 영향 없음 |

---

## HWPX 컨트롤 파싱 현황 (3단계 완료 — 전체 컨트롤 구현)

| 컨트롤 | HWPX 요소 | 상태 | 비고 |
|--------|-----------|------|------|
| 표 | `<hp:tbl>` | ✅ 기존 | 완전 구현 |
| 그림 | `<hp:pic>` | ✅ 기존+보강 | 2단계에서 속성 보강 |
| 구역 정의 | `<hp:secPr>` | ✅ 기존 | 완전 구현 |
| 단 정의 | `<hp:colPr>` | ✅ 기존+보강 | ctrl 내 colPr도 파싱 |
| 사각형 | `<hp:rect>` | ✅ 3단계 | drawText 포함 |
| 타원 | `<hp:ellipse>` | ✅ 3단계 | 공통 구조 지원 |
| 직선 | `<hp:line>` | ✅ 3단계 | 공통 구조 지원 |
| 호 | `<hp:arc>` | ✅ 3단계 | 공통 구조 지원 |
| 다각형 | `<hp:polygon>` | ✅ 3단계 | 공통 구조 지원 |
| 곡선 | `<hp:curve>` | ✅ 3단계 | 공통 구조 지원 |
| 묶음 객체 | `<hp:container>` | ✅ 3단계 | 재귀 파싱 |
| 쪽 감추기 | `<hp:pageHiding>` | ✅ 3단계 | ctrl 내 |
| 쪽 번호 | `<hp:pageNum>` | ✅ 3단계 | ctrl 내 |
| **머리말** | `<hp:header>` | ✅ **3단계 확장** | **ctrl 내 + subList 문단** |
| **꼬리말** | `<hp:footer>` | ✅ **3단계 확장** | **ctrl 내 + subList 문단** |
| **각주** | `<hp:footNote>` | ✅ **3단계 확장** | **ctrl 내 + subList 문단** |
| **미주** | `<hp:endNote>` | ✅ **3단계 확장** | **ctrl 내 + subList 문단** |
| **자동번호** | `<hp:autoNum>` | ✅ **3단계 확장** | **ctrl 내 + autoNumFormat** |
| **새 번호** | `<hp:newNum>` | ✅ **3단계 확장** | **ctrl 내** |
| **책갈피** | `<hp:bookmark>` | ✅ **3단계 확장** | **ctrl 내** |
| **숨은 설명** | `<hp:hiddenComment>` | ✅ **3단계 확장** | **ctrl 내 + subList 문단** |
| **필드** | `<hp:fieldBegin>` | ✅ **3단계 확장** | **ctrl 내 + parameters 파싱** |
| **필드 끝** | `<hp:fieldEnd>` | ✅ **3단계 확장** | **스킵 처리** |
| **글자겹침** | `<hp:compose>` | ✅ **3단계 확장** | **문단 레벨** |
| **덧말** | `<hp:dutmal>` | ✅ **3단계 확장** | **문단 레벨** |
| **수식** | `<hp:equation>` | ✅ **3단계 확장** | **레이아웃만 (수식 렌더링 미지원)** |

---

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `src/parser/hwpx/section.rs` | 임포트 확장 (Header, Footer, Footnote, Endnote, AutoNumber, NewNumber, Bookmark, Field, FieldType, HiddenComment, Ruby, CharOverlap, HeaderFooterApply), 문단 파서에 compose/dutmal/equation 디스패치 추가, parse_ctrl() 전면 재구현 (13개 ctrl 자식 요소), 신규 헬퍼 함수 22개 추가 |
