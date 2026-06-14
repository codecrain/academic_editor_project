# 타스크 71 구현 계획서

## 새 번호로 시작 (NewNumber) + 자동번호 체계 완성

### 검증 대상: `samples/k-water-rfp.hwp` (AutoNumber 포함), 기타 샘플

---

## 1단계: AutoNumber·PageNumberPos 모델 + 파서 + 직렬화 수정 (데이터 레이어)

**수정 파일**: `src/model/control.rs`, `src/parser/control.rs`, `src/serializer/control.rs`

### 변경 내용

#### model/control.rs — 필드 추가

AutoNumber 구조체에 HWP 스펙 표 144 기준 누락 필드 추가:
- `number: u16` — 스펙상 UINT16 번호
- `user_symbol: char` — WCHAR 사용자 기호
- `prefix_char: char` — WCHAR 앞 장식 문자
- `suffix_char: char` — WCHAR 뒤 장식 문자

PageNumberPos 구조체에 HWP 스펙 표 149 기준 누락 필드 추가:
- `user_symbol: char`, `prefix_char: char`, `suffix_char: char`, `dash_char: char`

#### parser/control.rs — 비트 오프셋 수정 + 필드 파싱

`parse_auto_number()`:
- format: `(attr >> 4) & 0x0F` → `(attr >> 4) & 0xFF` (8비트로 확장)
- superscript: `attr & 0x100` → `attr & 0x1000` (bit 12로 수정)
- UINT16 번호 + WCHAR 3개 추가 읽기

`parse_page_num_pos()`:
- WCHAR 4개 추가 읽기

#### serializer/control.rs — 파서와 대칭 수정

`serialize_auto_number()`:
- format: `& 0x0F` → `& 0xFF`, superscript: `0x100` → `0x1000`
- 번호 + 장식문자 출력 추가

`serialize_page_num_pos()`:
- `(format & 0x0F) | (position << 4)` → `(format & 0xFF) | (position << 8)` (파서와 일치)
- 장식문자 출력 추가

---

## 2단계: NewNumber → 자동번호 할당 통합 + 쪽 번호 통합

**수정 파일**: `src/parser/mod.rs`, `src/renderer/pagination.rs`

### 변경 내용

#### parser/mod.rs — assign_auto_numbers() 수정

1. `assign_auto_numbers_in_controls()`에 `Control::NewNumber` 처리 추가:
   - `counters[idx] = nn.number.saturating_sub(1)` → 다음 increment가 `nn.number` 반환

2. `assign_auto_numbers()` 카운터 초기값을 `DocProperties` 시작번호로 설정

#### pagination.rs — PageContent에 page_number 필드 추가

- `PageContent`에 `pub page_number: u32` 필드 추가
- NewNumber(Page) 컨트롤 수집 → 페이지별 실제 쪽 번호 할당

---

## 3단계: 렌더링 — AutoNumber 형식·장식 적용 + 쪽 번호 수정

**수정 파일**: `src/renderer/layout.rs`

### 변경 내용

1. `apply_auto_numbers_to_composed()`: `NumFmt::Digit` → `NumFmt::from_hwp_format(an.format)` + 장식문자 적용
2. `format_page_number()`: 중복 함수 제거, `mod.rs`의 `format_number()` 재사용
3. `build_render_tree()` 쪽 번호: `page_index + 1` → `page_number`

---

## 4단계: 빌드 검증 및 WASM 호환

1. `wasm_api.rs` 참조 확인/수정
2. `docker compose --env-file /dev/null run --rm test` — 전체 테스트 통과
3. `docker compose --env-file /dev/null run --rm wasm` — WASM 빌드
4. `cd rhwp-studio && npx vite build` — Vite 빌드
5. SVG 내보내기 시각적 확인

---

## 수정 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `src/model/control.rs` | AutoNumber·PageNumberPos 필드 추가 | ~10줄 |
| `src/parser/control.rs` | 비트 오프셋 수정 + 필드 파싱 추가 | ~20줄 |
| `src/serializer/control.rs` | 비트 오프셋 수정 + 필드 직렬화 추가 | ~20줄 |
| `src/parser/mod.rs` | NewNumber 통합 + DocProperties 초기값 | ~15줄 |
| `src/renderer/pagination.rs` | page_number 필드 + NewNumber(Page) 처리 | ~30줄 |
| `src/renderer/layout.rs` | AutoNumber 형식·장식 + 쪽 번호 리팩토링 | ~30줄 |
