# 타스크 181 — 1단계 완료 보고서: 모델 + 바이너리/HWPX 파서

## 목표
수식 스크립트 문자열을 HWP/HWPX 양쪽에서 추출하여 `Control::Equation`에 저장

## 완료 내역

### 1. 모델 정의 (`src/model/control.rs`)
- `Equation` 구조체 추가 (common, script, font_size, color, baseline, font_name, version_info, raw_ctrl_data)
- `Control::Equation(Box<Equation>)` variant 추가

### 2. 바이너리 HWP 파서 (`src/parser/control.rs`)
- `CTRL_EQUATION` (eqed) 분기 추가
- `parse_equation_control()` 구현: CommonObjAttr + HWPTAG_EQEDIT 자식 레코드 파싱
- HWPTAG_EQEDIT 레이아웃: attr(u32) → script(HWP string) → font_size(u32) → color(u32) → baseline(i16) → version_info(HWP string) → font_name(HWP string)

### 3. HWPX 파서 (`src/parser/hwpx/section.rs`)
- 기존 `parse_equation()` 함수를 `Control::Equation` 반환으로 전면 수정
- XSD 스키마(`paralist.xsd` EquationType)와 OWPML 표 207~208 참조
- 수식 전용 속성 파싱: version, baseLine, textColor, baseUnit, font
- `<hp:script>` 하위 요소에서 수식 스크립트 텍스트 추출

### 4. 직렬화 (`src/serializer/`)
- `src/serializer/control.rs`: `serialize_equation_control()` 추가 (CTRL_HEADER + HWPTAG_EQEDIT)
- `src/serializer/body_text.rs`: Equation char code 매핑 (`0x000B`, `CTRL_EQUATION`)

### 5. 기타 패턴 매치 수정
- `src/main.rs`: diag 명령 Equation 출력
- `src/parser/control/tests.rs`: 2개 match 블록
- `src/wasm_api/tests.rs`: 2개 match 블록

## 검증 결과

### 바이너리 파싱 검증 (`samples/eq-01.hwp`)
```
수식 1: script="평점=입찰가격평가~배점한도 TIMES LEFT ( {최저입찰가격} over {해당입찰가격} RIGHT )"
        font_size=1300 color=0x0 baseline=66

수식 2: script="평점=입찰가격평가`배점한도 TIMES LEFT ( {최저입찰가격} over {추정가격의80%상당가격} RIGHT )"
        font_size=1200 color=0x0 baseline=66

수식 3: script="+ LEFT [ 2 TIMES LEFT ( {추정가격의80%상당가격-해당입찰가격} over {추정가격의80%상당가격-추정가격의70%상당가격} RIGHT ) RIGHT ]"
        font_size=1200 color=0x0 baseline=66
```

3개 수식 모두 스크립트, 글자 크기, 색상, 기준선이 정상 파싱됨.

### 테스트
- cargo test: **615개 통과** (0 실패)
- cargo build: 성공
- SVG 내보내기: `samples/eq-01.hwp` → 1페이지 정상 출력

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `src/model/control.rs` | Equation 구조체 + Control::Equation variant |
| `src/parser/control.rs` | parse_equation_control() |
| `src/parser/hwpx/section.rs` | parse_equation() → Control::Equation 반환 |
| `src/serializer/control.rs` | serialize_equation_control() |
| `src/serializer/body_text.rs` | char code 매핑 |
| `src/main.rs` | diag Equation 출력 |
| `src/parser/control/tests.rs` | 패턴 매치 추가 |
| `src/wasm_api/tests.rs` | 패턴 매치 추가 |
