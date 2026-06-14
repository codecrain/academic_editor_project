# 타스크 40: HWP 저장 기초 기능 구현 - 구현 계획서

## 단계 1: 스펙 교차 검증 및 기술 문서 초안

### 작업 내용
- HWP 5.0 바이너리 스펙과 HWPML 3.0 스펙 교차 검증
- 컨트롤 타입별 필수 레코드 목록 정리
- `mydocs/tech/hwp_save_guide.md` 초안 작성

### 교차 검증 대상

| 항목 | HWP 5.0 (바이너리) | HWPML 3.0 (XML) |
|------|-------------------|-----------------|
| 문단 레코드 | PARA_HEADER, PARA_TEXT, PARA_CHAR_SHAPE, PARA_LINE_SEG | P, TEXT, CHAR 엘리먼트 |
| 구역 정의 | CTRL_HEADER(secd) + PAGE_DEF + FOOTNOTE_SHAPE + PAGE_BORDER_FILL | SECDEF + PAGEDEF + PAGEMARGIN + FOOTNOTESHAPE |
| 단 정의 | CTRL_HEADER(cold) | COLDEF + COLUMNLINE + COLUMNTABLE |
| 표 | CTRL_HEADER(tbl) + TABLE + LIST_HEADER(셀) | TABLE + SHAPEOBJECT + ROW + CELL |
| 이미지 | CTRL_HEADER(gso) + SHAPE_COMPONENT + SHAPE_COMPONENT_PICTURE | PICTURE + SHAPEOBJECT + SHAPECOMPONENT |
| DocInfo ID 매핑 | ID_MAPPINGS 레코드 (카운트) | MAPPINGTABLE 엘리먼트 |

### 주요 검증 포인트
- 제어 문자 크기: 8 WCHAR = 16 바이트 (이미 수정됨)
- PARA_LINE_SEG 36바이트 구조: text_start(u32) + vertical_pos(i32) + line_height(i32) + text_height(i32) + baseline(i32) + spacing(i32) + column_start(i32) + segment_width(i32) + tag(u32)
- TABLE 레코드의 row_sizes: UINT16[NRows] (행별 셀 수)
- 빈 셀의 PARA_TEXT 생성 규칙

### 산출물
- `mydocs/tech/hwp_save_guide.md` 초안

---

## 단계 2: 기본 저장 검증 (텍스트만)

### 작업 내용
- `template/empty.hwp` 기반 텍스트 삽입 → 저장 → 한글 오픈 검증
- 테스트 케이스: 한글, 영문, 숫자, 특수문자, 줄바꿈
- 바이트 비교 검증 (원본 vs 저장본)

### 테스트 함수
```rust
// src/wasm_api.rs
fn test_save_text_only()     // 한글 텍스트
fn test_save_multiline()     // 여러 줄 텍스트
fn test_save_mixed_text()    // 한글+영문+특수문자
```

### 검증
- `output/save_test_text.hwp` → 한글 프로그램 오픈
- 12개 레코드 바이트 비교 (PARA_HEADER, PARA_TEXT 등)

---

## 단계 3: 표(Table) 컨트롤 저장 검증

### 작업 내용
- 빈 문서 → 표 프로그래밍 방식 삽입 → 저장
- 점진적 확장: 1x1 → 2x2 → colspan/rowspan

### 레코드 구조 검증
```
PARA_HEADER (level 0)
  PARA_TEXT (level 1) — 0x000B 컨트롤 문자
  PARA_CHAR_SHAPE (level 1)
  PARA_LINE_SEG (level 1)
  CTRL_HEADER (level 1, 'tbl ')
    TABLE (level 2) — row_count, col_count, row_sizes, border_fill_id
    LIST_HEADER (level 2) — 셀별
      PARA_HEADER (level 2) — 셀 내 문단
        PARA_TEXT (level 3) — 옵셔널
        PARA_CHAR_SHAPE (level 3)
        PARA_LINE_SEG (level 3)
```

### 검증 항목
- BorderFill ID 할당 (DocInfo 참조)
- 셀 padding, width, height
- instance_id 생성
- 빈 셀 char_count=1, PARA_TEXT 없음

---

## 단계 4: 이미지(Picture) 컨트롤 저장 검증

### 작업 내용
- 빈 문서 → 이미지 삽입 → 저장
- BinData 스트림 + DocInfo BIN_DATA 레코드 매핑 검증

### 레코드 구조
```
CTRL_HEADER (level 1, 'gso ')
  SHAPE_COMPONENT (level 2)
    SHAPE_COMPONENT_PICTURE (level 3)
```

### DocInfo 연동
- BIN_DATA 레코드: bin_data_id → BinData/BIN{XXXX}.{ext}
- ID_MAPPINGS에 bin_data 카운트 반영

---

## 단계 5: 기타 컨트롤 저장 검증 및 최종 문서화

### 검증 대상 (우선순위순)
1. 머리글/바닥글 (Header/Footer)
2. 각주/미주 (Footnote/Endnote)
3. 그리기 개체 (Shape — Rectangle)
4. 책갈피 (Bookmark)

### 최종 문서화
- `mydocs/tech/hwp_save_guide.md` 완성
  - 컨트롤별 필수 레코드 매트릭스
  - 바이트 포맷 상세
  - 알려진 제약사항

---

## 수정 파일 목록

| 파일 | 변경 유형 |
|------|----------|
| `src/wasm_api.rs` | 테스트 함수 추가 |
| `mydocs/tech/hwp_save_guide.md` | 신규 생성 |
| `mydocs/tech/hwp_spec_5.0.md` | 스펙 오류 수정 |
| `src/serializer/body_text.rs` | 발견 버그 수정 |
| `src/serializer/control.rs` | 발견 버그 수정 |
| `src/serializer/doc_info.rs` | 발견 버그 수정 |
