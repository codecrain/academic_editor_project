# 타스크 90 — 2단계 완료 보고서

## 단계 목표
section.rs 이미지/표/특수문자 파싱 보완

## 완료 항목

### 1. 이미지 파싱 보완 (parse_picture)
- **`<hp:pic>` 요소 자체 속성 파싱 추가**: zOrder, textWrap, instid
- **`<hp:pos>` 파싱 추가**: treatAsChar, vertRelTo, horzRelTo, vertOffset, horzOffset
  - 이미지 위치 지정에 핵심적인 속성들
- **`<hp:outMargin>` 파싱 추가**: left/right/top/bottom → common.margin
- **`<hp:inMargin>` 파싱 추가**: left/right/top/bottom → padding
- **`<hp:imgClip>` 파싱 추가**: left/right/top/bottom → crop
- **`<hp:img>` 보완**: effect 속성 파싱 (REAL_PIC, GRAY_SCALE, BLACK_WHITE)
- **`<hp:offset>` 보완**: x/y 좌표 파싱
- **이미지 크기 파싱 개선**: `imgRect`를 크기 소스에서 제거 (imgRect는 4점 좌표, width/height 없음), `curSz`/`sz` 우선, `orgSz` 폴백 유지
- 불필요한 import 정리: ImageAttr 외에 ImageEffect, CropInfo, CommonObjAttr, VertRelTo, HorzRelTo, TextWrap 추가

### 2. `<hp:columnBreak/>` 특수문자 추가
- parse_paragraph의 Empty 이벤트에 `columnBreak` → 줄바꿈 변환 추가
- read_text_content 내부에도 `columnBreak` → 줄바꿈 변환 추가

### 3. 표 셀 cellPr 파싱 보완
- 기존 `cellPr` 스킵 → 속성 파싱으로 변경
- borderFillIDRef, textDirection, vAlign 파싱 추가

## 검증 결과
- `docker compose run --rm test` — **532개 테스트 전체 통과**

## 수정 파일
| 파일 | 변경 내용 |
|------|----------|
| `src/parser/hwpx/section.rs` | parse_picture 보완, columnBreak 추가, cellPr 파싱, import 확장 |
