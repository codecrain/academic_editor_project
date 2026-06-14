# 타스크 11: 캡션 처리 (표/이미지) - 구현계획서

## 개요

HWP 표(Table) 및 그림(Picture) 컨트롤의 캡션 파싱 및 렌더링을 구현한다.

---

## 구현 단계

### 1단계: 모델 수정

**목표**: Table 및 Caption 구조체 수정

**수정 파일**:
- `src/model/table.rs`
- `src/model/shape.rs`

**작업 내용**:

1. `Table` 구조체에 caption 필드 추가:
```rust
pub struct Table {
    // ... 기존 필드
    pub caption: Option<Caption>,
}
```

2. `Caption` 구조체에 include_margin 필드 추가:
```rust
pub struct Caption {
    pub direction: CaptionDirection,
    pub width: HwpUnit,
    pub spacing: HwpUnit16,
    pub max_width: HwpUnit,
    pub include_margin: bool,  // 추가
    pub paragraphs: Vec<Paragraph>,
}
```

**검증**: 빌드 성공

---

### 2단계: 파서 구현 - 캡션 파싱 함수

**목표**: 공통 캡션 파싱 함수 구현

**수정 파일**:
- `src/parser/control.rs`

**작업 내용**:

1. `parse_caption()` 함수 구현:
   - 캡션 속성 파싱 (14바이트)
     - UINT (4): 속성 (bit 0~1: 방향, bit 2: include_margin)
     - HWPUNIT (4): 캡션 폭
     - HWPUNIT16 (2): 캡션-틀 간격
     - HWPUNIT (4): 텍스트 최대 길이

2. 캡션 문단 리스트 파싱:
   - HWPTAG_LIST_HEADER 후 문단 레코드 수집
   - 기존 `parse_paragraph_list()` 활용

**HWP 스펙 참조**:
- 표 73: 캡션 리스트 (LIST_HEADER + 캡션 데이터)
- 표 74: 캡션 (14바이트)
- 표 75: 캡션 속성

---

### 3단계: 파서 구현 - 표/그림 캡션 연동

**목표**: 표/그림 컨트롤에 캡션 파싱 연동

**수정 파일**:
- `src/parser/control.rs`

**작업 내용**:

1. `parse_table_control()` 수정:
   - HWPTAG_TABLE 전에 HWPTAG_LIST_HEADER가 있으면 캡션으로 처리
   - 캡션 레코드 식별 및 파싱

2. `parse_gso_control()` 수정:
   - Picture 처리 시 캡션 레코드 식별
   - parse_picture()에 캡션 전달

**캡션 존재 여부 판단**:
- 표: HWPTAG_TABLE 전에 HWPTAG_LIST_HEADER가 있으면 캡션
- 그림: HWPTAG_SHAPE_COMPONENT_PICTURE 전에 LIST_HEADER가 있으면 캡션

---

### 4단계: 렌더러 구현

**목표**: 캡션 렌더링 구현

**수정 파일**:
- `src/renderer/layout.rs`
- `src/renderer/height_measurer.rs`

**작업 내용**:

1. `layout_caption()` 함수 구현:
   - 캡션 방향에 따른 위치 계산
     - top: 표/이미지 위
     - bottom: 표/이미지 아래
     - left/right: 표/이미지 옆 (2차 구현)
   - 캡션 문단 텍스트 렌더링

2. `layout_table()` 수정:
   - 표 렌더링 전후 캡션 렌더링 호출
   - top 캡션: 표 전에 렌더링
   - bottom 캡션: 표 후에 렌더링

3. `layout_body_picture()` 수정:
   - 이미지 렌더링 전후 캡션 렌더링 호출

4. `HeightMeasurer` 수정:
   - `measure_caption()` 함수 추가
   - 표/이미지 측정 시 캡션 높이 포함

---

### 5단계: 테스트 및 검증

**목표**: 캡션 기능 검증

**작업 내용**:

1. 단위 테스트 추가:
   - 캡션 파싱 테스트
   - 캡션 렌더링 테스트

2. 통합 테스트:
   - 캡션이 있는 HWP 파일 테스트
   - SVG 출력 시각적 확인

**검증 명령**:
```bash
docker compose run --rm test
docker compose run --rm dev cargo run -- export-svg "samples/table-ipc.hwp" --output output/
```

---

## 예상 일정

| 단계 | 내용 |
|------|------|
| 1단계 | 모델 수정 |
| 2단계 | 캡션 파싱 함수 |
| 3단계 | 표/그림 캡션 연동 |
| 4단계 | 렌더러 구현 |
| 5단계 | 테스트 및 검증 |

---

## 위험 요소 및 대응

1. **캡션 레코드 식별**:
   - child_records 순회 시 HWPTAG_LIST_HEADER가 셀인지 캡션인지 구분 필요
   - 레코드 level과 순서로 판별

2. **left/right 캡션**:
   - 복잡한 레이아웃이 필요하여 1차 구현에서는 top/bottom만 지원
   - 추후 확장 가능한 구조로 설계

3. **캡션 스타일**:
   - 캡션 내 문단도 일반 문단과 동일하게 CharShape 적용 필요

---

*작성일: 2026-02-06*
