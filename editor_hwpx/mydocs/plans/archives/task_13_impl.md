# 타스크 13: 구현 계획서 - 서식-문단-번호 모양: 시작번호/문단번호 처리

## 구현 단계 (4단계)

---

### 1단계: 모델 정의

**대상 파일**: `src/model/style.rs`, `src/model/document.rs`

**작업 내용**:

1. `Numbering` 구조체 추가
   - `heads: [NumberingHead; 7]` — 수준별(1~7) 문단 머리 정보
   - `level_formats: [String; 7]` — 수준별 번호 형식 문자열
   - `start_number: u16` — 시작 번호
   - `level_start_numbers: [u32; 7]` — 수준별 시작 번호

2. `NumberingHead` 구조체 추가
   - `alignment: u8` — 정렬 (0=왼쪽, 1=가운데, 2=오른쪽)
   - `width_adjust: i16` — 너비 보정값
   - `text_distance: i16` — 본문과의 거리
   - `char_shape_id: u32` — 글자 모양 아이디 참조

3. `ParaShape`에 필드 추가
   - `head_type: HeadType` — 문단 머리 종류 (없음/개요/번호/글머리표)
   - `para_level: u8` — 문단 수준 (0~6 → 1~7수준)

4. `DocInfo`에 필드 추가
   - `numberings: Vec<Numbering>` — 번호 정의 목록

---

### 2단계: 파서 구현

**대상 파일**: `src/parser/doc_info.rs`

**작업 내용**:

1. `parse_numbering()` 함수 구현
   - 수준별(1~7) 문단 머리 정보 파싱 (각 12바이트)
   - 수준별 번호 형식 문자열 파싱 (가변 길이)
   - 시작 번호 및 수준별 시작 번호 파싱

2. DocInfo 파싱 루프에 `HWPTAG_NUMBERING` 핸들러 추가

3. `parse_para_shape()`에서 `attr1` 비트 필드 추출
   - bit 23~24: 문단 머리 종류
   - bit 25~27: 문단 수준

---

### 3단계: 렌더링 구현

**대상 파일**: `src/renderer/layout.rs`

**작업 내용**:

1. 문단 번호 카운터 관리
   - `NumberingCounter` 구조체: 수준별(1~7) 현재 번호 추적
   - 같은 수준 연속 → 번호 증가
   - 상위 수준 전환 → 하위 수준 리셋
   - 번호 없는 문단 → 카운터 리셋

2. 번호 문자열 생성
   - 번호 형식 문자열의 `^n`, `^N` 제어코드 처리
   - `format_number()` 함수 활용하여 형식별 변환

3. 문단 렌더링 시 번호 텍스트 삽입
   - `head_type == HeadType::Number`인 문단 감지
   - `numbering_id`로 번호 정의 참조
   - 생성된 번호 문자열을 문단 첫 줄 앞에 삽입

---

### 4단계: 테스트 및 검증

**작업 내용**:

1. 단위 테스트 작성
   - `Numbering` 파싱 테스트
   - `ParaShape` 속성 추출 테스트
   - 번호 카운터 증가/리셋 테스트
   - 번호 형식 문자열 처리 테스트

2. 통합 테스트
   - 문단 번호가 포함된 샘플 HWP 파일로 SVG 출력
   - 번호가 올바르게 렌더링되는지 시각적 검증

3. 기존 테스트 통과 확인
