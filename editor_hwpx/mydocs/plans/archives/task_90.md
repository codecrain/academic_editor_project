# 타스크 90: HWPX 파서 정확도 개선 — 수행계획서

## 배경

타스크 89에서 HWPX 파서를 구현하여 기본적인 파싱과 렌더링이 가능하게 되었으나,
python-hwpx 참조 파서 및 OWPML 스키마와 비교한 결과 다수의 파싱 누락·오류가 확인되었다.

## 참조 자료

- python-hwpx 파서: `/home/edward/vsworks/shwp/python-hwpx/src/hwpx/oxml/`
- OWPML XML 스키마: `/home/edward/vsworks/shwp/python-hwpx/DevDoc/OWPML SCHEMA/`

## 현황 분석 (갭 분석)

### header.rs 갭

| 영역 | 현재 상태 | 누락/오류 |
|------|----------|----------|
| charPr | height, bold, italic, underline, strikeout, color 등 기본 속성만 파싱 | `spacing` (자간), `relSz` (상대크기), `offset` (세로위치), `shadow`, `emboss`, `engrave`, `supscript`/`subscript`, `charSz` (7개 언어별 크기), `charSpacing` (7개 언어별 자간), `charRelSz` (7개 언어별 상대크기), `charOffset` (7개 언어별 세로위치) 미파싱 |
| paraPr | align, margin, lineSpacing, border 기본 파싱 | `heading` (번호/글머리표), `breakSetting` (문단 줄나눔 설정—widowOrphan, keepWithNext, keepLines, pageBreakBefore), `autoSpacing` (한영/한숫자 자동간격), `tabPrIDRef` (탭 참조), `condense`, `fontLineHeight`, `snapToGrid` 미파싱 |
| paraPr margin | left/right/indent/prev/next 파싱 | OWPML 스키마에서 margin 하위 요소가 **자식 요소의 텍스트 노드**에 값이 있음 — 현재 속성으로만 파싱 시 누락 가능 |
| borderFill | 4방향 선 + 배경색 파싱 | `gradation` (그라데이션), `imgBrush` (이미지 배경), `windowBrush`, `fillBrushType` 미파싱 |
| bullet | 미구현 | python-hwpx에서 `<hh:bullet>` 파싱 (char, checkedChar, useImage, paraHead 등) |

### section.rs 갭

| 영역 | 현재 상태 | 누락/오류 |
|------|----------|----------|
| 문단 속성 | paraPrIDRef, styleIDRef 파싱 | `pageBreak`, `columnBreak`, `merged` 속성 미파싱 |
| run 내 컨트롤 | tbl, pic만 처리 | `<hp:ctrl>`, `<hp:equation>`, `<hp:ole>`, 도형(rect/ellipse/line/arc/polyline 등 15종 인라인 오브젝트) 미처리 |
| 텍스트 | `<hp:t>` 텍스트만 추출 | `<hp:tab/>`, `<hp:lineBreak/>`, `<hp:columnBreak/>` 특수 요소를 탭/줄바꿈 문자로 변환 필요 |
| 표 | 기본 구조 파싱 | `<hp:cellAddr>` (rowAddr/colAddr), `<hp:cellSpan>` (rowSpan/colSpan), `<hp:tcPr>` 상세 속성 미파싱. 셀 크기(`<hp:cellSz>` width/height)도 미파싱 |
| 이미지 | pic → Control::Picture | `<hp:imgRect>/<hp:pt>` (이미지 좌표), `<hp:imgClip>` (클리핑 영역) 미파싱. 이미지 크기가 0×0으로 파싱됨 |
| secPr | pagePr/margin 파싱 | `<hp:noteSpacing>`, `<hp:notePlacement>`, `<hp:noteNumbering>` (각주 설정), `<hp:colPr>` (다단 설정), `<hp:headerFooterRef>` 미파싱 |

### 공통 유틸리티 갭

| 항목 | 현재 상태 | 필요 |
|------|----------|------|
| 유틸리티 함수 중복 | header.rs, section.rs 각각 별도의 local_name, attr_str, parse_u8..parse_u32 | 공통 모듈로 추출 |

## 목표

1. **렌더링 품질 직결 항목 우선 수정**: charPr 자간/상대크기, paraPr heading/breakSetting, 표 셀 크기/주소, 이미지 크기, 특수문자(탭/줄바꿈)
2. **python-hwpx 참조 파서와의 정합성 확보**: 동일 HWPX 파일에 대해 주요 구조가 일치하도록
3. **코드 품질 개선**: 공통 유틸리티 추출로 중복 제거

## 범위

- `src/parser/hwpx/header.rs` — charPr/paraPr/borderFill 파싱 보완
- `src/parser/hwpx/section.rs` — 표 셀/이미지/특수문자/컨트롤 파싱 보완
- `src/parser/hwpx/utils.rs` (신규) — 공통 유틸리티 추출
- 기존 테스트 529개 유지 + 신규 테스트 추가

## 범위 외

- 도형 렌더링 (인라인 오브젝트 파싱만, 렌더링은 별도 타스크)
- 머리글/바닥글/각주 파싱 (별도 타스크)
- 다단 레이아웃 (별도 타스크)
- 변경 추적(Track Change) 파싱 (별도 타스크)

## 검증 방법

1. `docker compose run --rm test` — 모든 Rust 테스트 통과
2. `docker compose run --rm wasm && npm run build` — WASM/Vite 빌드 성공
3. 5개 HWPX 샘플 SVG 내보내기 → 렌더링 품질 개선 확인
4. `rhwp info` 출력으로 파싱 정확도 비교
