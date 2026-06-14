# 타스크 12: 자동 번호 매기기 - 구현 계획서

## 구현 단계

### 1단계: AutoNumberCounter 구조체 구현
**파일**: `src/renderer/mod.rs`

- `AutoNumberCounter` 구조체 추가
- 각 `AutoNumberType`별 카운터 (HashMap 또는 개별 필드)
- `increment()`: 번호 증가 및 현재 값 반환
- `format_number()`: 번호 형식에 따라 문자열 변환
- `reset()`: 카운터 초기화

```rust
pub struct AutoNumberCounter {
    picture: u16,
    table: u16,
    equation: u16,
    footnote: u16,
    endnote: u16,
    page: u16,
}
```

---

### 2단계: 번호 형식 변환 함수 구현
**파일**: `src/renderer/mod.rs`

번호 형식 지원:
- 아라비아 숫자: 1, 2, 3
- 로마 숫자 소문자: i, ii, iii
- 로마 숫자 대문자: I, II, III
- 영문 소문자: a, b, c
- 영문 대문자: A, B, C
- 한글 가나다: 가, 나, 다
- 한글 일이삼: 일, 이, 삼
- 원문자: ①, ②, ③

```rust
fn format_number(number: u16, format: u8) -> String
```

---

### 3단계: Composer에서 AutoNumber 처리
**파일**: `src/renderer/composer.rs`

- `compose_paragraph()` 호출 시 AutoNumberCounter 전달
- 인라인 컨트롤 발견 시 번호 문자열 생성
- `ComposedLine`에 번호 텍스트 포함

변경 사항:
- `compose_paragraph()` 시그니처에 `&mut AutoNumberCounter` 추가
- `ControlChar::Inline` 처리 시 AutoNumber 확인

---

### 4단계: Layout에서 카운터 관리
**파일**: `src/renderer/layout.rs`

- `LayoutEngine`에 `AutoNumberCounter` 필드 추가
- `build_render_tree()` 시작 시 카운터 초기화
- 문단 조합 시 카운터 전달

---

### 5단계: 테스트 및 검증
**작업 내용**:
- 기존 219개 테스트 통과 확인
- `samples/hwp-multi-002.hwp` SVG 출력 확인
- 캡션에 번호 표시 확인 ("그림 1", "표 2" 등)

---

## 변경 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/mod.rs` | AutoNumberCounter 구조체, format_number 함수 |
| `src/renderer/composer.rs` | compose_paragraph에 카운터 전달 |
| `src/renderer/layout.rs` | 카운터 관리, 문단 조합 호출 수정 |

---

## 검증 방법

```bash
docker compose run --rm test
docker compose run --rm dev cargo run -- export-svg "samples/hwp-multi-002.hwp" --output output/
grep "그림 1\|표 1" output/hwp-multi-002_*.svg
```

---

*작성일: 2026-02-06*
