# 타스크 154: HWPX 렌더링 고도화

> **작성일**: 2026-02-23
> **우선순위**: P1
> **상태**: 수행계획서

---

## 1. 문제 정의

### 1-1. 현상

**A. lineSegArray 없는 HWPX 문서 (service_agreement.hwpx)**
- 모든 문단 텍스트가 **동일한 y좌표**에 겹쳐 렌더링
- **줄바꿈이 동작하지 않아** 텍스트가 페이지 오른쪽 경계 밖으로 넘침
- 표 내부만 정상 (표 자체 레이아웃 사용)

**B. 이미지 위치 이상 (2024년 1분기 해외직접투자 보도자료 ff.hwpx, 3페이지)**
- 이미지가 **본문 영역(y=132~) 대신 페이지 최상단(y=0~15)**에 배치
- x=-4.13 (음수 → 페이지 밖), width=715.2 (본문 폭 566px 초과)
- HWPX의 이미지 위치/크기 파싱 또는 좌표 해석에 문제

**C. HWPX 컨트롤 파싱 전체 누락**

| 컨트롤 | HWPX | HWP | 비고 |
|--------|------|-----|------|
| 그림/이미지 (`<hp:pic>`) | **O** | O | 위치/크기 파싱 완료, 좌표 변환 문제 |
| 표 (`<hp:tbl>`) | **O** | O | 완전 구현, inMargin 수정 완료 |
| 구역/단 (`<hp:secPr>`, `<hp:colPr>`) | **O** | O | 완전 구현 |
| 페이지/단 나누기 | **O** | O | 완전 구현 |
| **그리기 객체** (사각형/선/타원/다각형/곡선) | **X** | O | HWPX에서 완전 미구현 |
| **글상자** (`<hp:drawText>`) | **X** | O | HWPX에서 미구현 |
| **필드/하이퍼링크** (`<hp:ctrl>`) | **X** | O | `<hp:ctrl>` 전체 스킵 |
| **각주/미주** (`<hp:footNote>`, `<hp:endNote>`) | **X** | O | HWPX에서 미구현 |
| **머리말/꼬리말** (`<hp:headerFooter>`) | **X** | O | HWPX에서 미구현 |
| **책갈피** | **X** | O | `<hp:ctrl>` 내 스킵 |
| **자동번호/글머리표** | **X** | O | `<hp:ctrl>` 내 스킵 |
| 수식 (`<hp:eqEdit>`) | **X** | △ | 양쪽 다 미완 |
| OLE 객체 | **X** | △ | 양쪽 다 미완 |

### 1-2. 근본 원인

**A. lineSegArray 없는 문단**:
- HWPX 파일 중 `<hp:lineSegArray>`가 없는 문단이 존재 (hwpxskill 생성, Python 편집 등)
- 한컴 한글은 lineSegArray 없이도 ParaPr/CharPr로 자체 레이아웃 수행
- 현재 rhwp는 lineSegArray가 없으면 default LineSeg(모든 값 0)을 생성 → 높이·줄바꿈 정보 없음

**B. 컨트롤 파싱 범위**:
- `<hp:ctrl>` 요소가 **통째로 스킵** (section.rs:184-186) → 필드, 책갈피, 하이퍼링크 등 전부 무시
- 그리기 객체, 각주/미주, 머리말/꼬리말 파싱 모듈이 HWPX에 존재하지 않음
- HWP(바이너리) 파서는 이들을 모두 지원 (control.rs, control/shape.rs)

### 1-3. 이미 있는 인프라
| 구성요소 | 위치 | 상태 |
|----------|------|------|
| `reflow_line_segs()` | `renderer/composer/line_breaking.rs:574` | line_height=0일 때 CharPr 기반 합성 가능. **편집 시에만 호출** |
| `font_size_to_line_height()` | `renderer/composer/line_breaking.rs:667` | px → HWPUNIT 변환 |
| `ResolvedStyleSet` | `renderer/style_resolver.rs` | CharPr/ParaPr → px 해석 완료 |
| `resolve_cell_padding()` | `renderer/layout/table_layout.rs` | 표 셀 패딩 해석 |

### 1-4. 이미 수정 완료된 항목
| 항목 | 파일 | 내용 |
|------|------|------|
| VerticalAlign::Center 수식 오류 | `table_layout.rs:784` | `- last_line_descent` 제거 |
| HWPX `<inMargin>` 미파싱 | `parser/hwpx/section.rs:464` | `table.padding` 파싱 추가 |

---

## 2. 구현 계획

### 3단계 구성

#### 1단계: HWPX 문서 로드 시 합성 LineSeg 생성

**목표**: lineSegArray가 없는(또는 line_height=0인) HWPX 문단에 대해, 문서 로드 직후 `reflow_line_segs()`를 호출하여 올바른 LineSeg를 생성한다.

**변경 파일**:

| 파일 | 변경 내용 |
|------|----------|
| `document_core/commands/document.rs` | `from_bytes_native()` 또는 `convert_to_editable_native()` 이후, HWPX 문서에 대해 zero-height line_seg 문단을 검출하고 `reflow_line_segs()` 호출 |
| `renderer/composer/line_breaking.rs` | `reflow_line_segs()`가 ParaPr의 line_spacing_type/value를 반영하도록 보강 (현재 line_spacing=0 고정) |

**상세 로직**:

```
from_bytes() 완료 후:
  for each section:
    for each paragraph:
      if para.line_segs.len() == 1 && para.line_segs[0].line_height == 0:
        → reflow_line_segs(para, body_width_px, &styles, dpi)
```

**reflow_line_segs 보강**:
- 현재: `line_height`만 CharPr에서 계산, `line_spacing`은 0 고정
- 보강: ParaPr의 `line_spacing_type`과 `line_spacing` 값을 반영
  - `PERCENT`: `line_spacing = font_height * (percentage - 100) / 100`
  - `FIXED`: `line_spacing = fixed_value - line_height`
  - `SPACEONLY`: `line_spacing = value`

**검증**:
- `service_agreement.hwpx` → SVG: 문단별 고유 y좌표, 줄바꿈 정상
- `2024년 1분기 해외직접투자 보도자료 ff.hwpx` → SVG: 기존 정상 렌더링 유지
- `통합재정통계(2011.10월).hwp` → SVG: HWP 파일 렌더링 영향 없음
- `cargo test` 608+ 전량 통과

#### 2단계: HWPX 이미지 좌표 수정 + 파싱 속성 보완

**목표**: 이미지 위치/크기 렌더링 수정, 세부 속성 파싱 보완

| 항목 | 현상 | 수정 |
|------|------|------|
| **HWPX 이미지 좌표** | 이미지가 페이지 최상단(y=0)에 배치 | `<hp:pos>` 좌표 변환 로직 조사·수정 |
| **HWPX 이미지 크기** | width=715px로 본문 폭 초과 | 절대/상대 좌표 해석 확인 |
| ParaPr margins (prev/next) | 문단 전후 간격 미반영 가능성 | header.rs 파싱 확인 |
| ParaPr indent | 들여쓰기 미반영 가능성 | header.rs 파싱 확인 |
| secPr 페이지 여백 | HWPX 페이지 여백 정합성 | section.rs 파싱 확인 |

**검증**: SVG 비교 (hwpx 이미지 정상 배치) + Docker 테스트

#### 3단계: HWPX 컨트롤 파싱 확장

**목표**: HWP(바이너리)에서 지원하는 주요 컨트롤을 HWPX에서도 파싱

**우선순위별 구현 대상**:

| 우선순위 | 컨트롤 | HWPX 요소 | 참조 (HWP 바이너리) |
|----------|--------|-----------|---------------------|
| **HIGH** | 글상자/그리기 객체 | `<hp:drawText>`, `<hp:rect>`, `<hp:line>`, `<hp:ellipse>` 등 | `parser/control/shape.rs` (789줄) |
| **HIGH** | `<hp:ctrl>` 파싱 | 필드, 하이퍼링크, 책갈피, 자동번호 | `parser/control.rs` |
| **HIGH** | 머리말/꼬리말 | `<hp:headerFooter>` | `CTRL_HEADER`/`CTRL_FOOTER` |
| **MED** | 각주/미주 | `<hp:footNote>`, `<hp:endNote>` | `CTRL_FOOTNOTE`/`CTRL_ENDNOTE` |
| **LOW** | 수식 | `<hp:eqEdit>` | 양쪽 미완 |

**구현 방법**:
- HWP 바이너리 파서(`control.rs`, `control/shape.rs`)가 생성하는 동일한 모델 구조체(`Control`, `ShapeObject` 등)를 HWPX XML에서도 채워넣음
- 렌더러는 모델만 보므로 **렌더러 변경 없이** HWPX 지원 확장 가능

**참조**:
- `/home/edward/vsworks/shwp/python-hwpx` — HWPX XML 구조 참조
- `/home/edward/vsworks/hwpxskill/references/hwpx-format.md` — HWPX 포맷 레퍼런스
- `src/parser/control.rs`, `src/parser/control/shape.rs` — HWP 바이너리 파서 (변환 대상)

**검증**:
- 다양한 HWPX 샘플 SVG 내보내기로 시각적 비교
- Docker 테스트: 전량 통과, Clippy 0

---

## 3. 리스크 완화

| 리스크 | 완화 |
|--------|------|
| reflow가 HWP(바이너리) 파일에 영향 | HWP는 항상 유효한 line_segs 보유 → line_height > 0 조건으로 스킵 |
| reflow_line_segs의 available_width 계산 | section의 body_width (page_width - margin_left - margin_right) 전달 |
| 표 내부 문단 reflow | 표 셀은 자체 레이아웃으로 처리 → 표 내부 문단은 스킵 가능 |
| 성능 | reflow는 문서 로드 시 1회만 실행, 문단당 O(n) 텍스트 스캔 |

---

## 4. 예상 결과

| 지표 | 변경 전 | 변경 후 |
|------|---------|---------|
| service_agreement.hwpx 렌더링 | 모든 텍스트 y=153.6에 겹침 | 문단별 정상 배치, 줄바꿈 정상 |
| HWPX 이미지 배치 | 페이지 최상단(y=0), 크기 초과 | 본문 영역 내 정상 배치 |
| HWPX 컨트롤 지원 | 표/그림만 지원 (2/14) | 주요 컨트롤 추가 지원 |
| HWP 파일 영향 | - | 없음 (line_height > 0 스킵) |
| 기존 HWPX (lineSegArray 있음) | 정상 | 정상 유지 |
