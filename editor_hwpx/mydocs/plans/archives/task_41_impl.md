# 타스크 41: 클립보드 표 붙여넣기 후 저장 파일 손상 수정 - 구현 계획서

## 단계 1: 기존 HWP에 프로그래밍 방식으로 표 삽입 → 저장 → HWP 오픈 검증

타스크 40에서 검증한 FROM SCRATCH 표 삽입 방식을 활용하여, `paste_html_native()` 경로가 아닌 직접 Table 컨트롤을 구성하여 기존 문서에 삽입한다. 이를 통해 직렬화 코드 자체의 정상 동작을 먼저 확인한다.

### 작업 내용
- `template/empty-step2.hwp` (이미 2×2 표가 있는 문서)에 프로그래밍 방식으로 2×2 표 추가 삽입
- 참조 파일(`template/empty-step2-p.hwp`)의 표 구조 값을 사용
- 저장 후 HWP 프로그램에서 오픈 검증

### 검증
- `output/save_test_table_inject.hwp` 생성
- HWP 프로그램 오픈 확인
- cargo test 통과

---

## 단계 2: 빈 셀 공백 제거 + TABLE attr + 인스턴스 ID (DIFF-1, DIFF-5, DIFF-7)

### DIFF-1: 빈 셀에 불필요한 공백 제거 (심각도: 높음)

**현재 문제**: `parse_table_html()` 빈 셀 판단 시 `&nbsp;`가 공백으로 변환되어 빈 셀로 인식 안 됨

**수정 방법**: `html_strip_tags()` 후 `&nbsp;`, `&#160;`, `&#xA0;`를 제거한 뒤 `trim().is_empty()` 확인

### DIFF-5: TABLE 레코드 attr bit 1 설정 (심각도: 낮음~중간)

**수정 방법**: 기본값을 `0x04000006`으로 변경 (bit 1 = 셀 분리 금지 항상 설정)

### DIFF-7: 인스턴스 ID 생성 (심각도: 낮음)

**수정 방법**: 해시 기반 인스턴스 ID 생성

### 검증
- `test_step2_comparison`으로 빈 셀 PARA_TEXT 제거 확인
- cargo test 통과

---

## 단계 3: BorderFill ID + CharShape/ParaShape ID + LineSeg 메트릭 (DIFF-2, DIFF-3, DIFF-4, DIFF-6, DIFF-8)

### DIFF-4: BorderFill ID 올바른 할당 (심각도: 중간)

**수정 방법**: 테이블 테두리용 BorderFill을 `create_border_fill_from_css()`로 생성, 반환 ID 사용

### DIFF-2: CharShape ID 올바른 할당 (심각도: 중간)

**수정 방법**: 셀 문단에 적절한 CharShape ID 할당 (기본 CS 기반)

### DIFF-3: ParaShape ID 올바른 할당 (심각도: 낮음~중간)

**수정 방법**: 적절한 para_shape_id 할당 로직 개선

### DIFF-6: 셀 LineSeg 메트릭 (심각도: 낮음)

**수정 방법**: 모든 셀 문단 LineSeg에 `tag=0x00060000` 및 적절한 `segment_width` 보장

### DIFF-8: 표 컨테이너 문단 LineSeg (심각도: 낮음)

**수정 방법**: `total_height` 계산 로직 검증 및 보정

### 검증
- `test_step2_comparison`으로 전체 레코드 비교
- cargo test 통과
- 저장 파일 HWP 프로그램 오픈 검증 요청

---

## 수정 파일 목록

| 파일 | 변경 유형 |
|------|----------|
| `src/wasm_api.rs` | 단계 1: 프로그래밍 표 삽입 테스트 추가 |
| `src/wasm_api.rs` | 단계 2-3: `parse_table_html()` 내 DIFF-1~8 수정 |

## 참고

- DIFF-9 (원본 표 BF ID 재직렬화 부작용)는 구조적 문제로 이번 타스크에서 직접 수정하지 않음
- 모든 수정은 `src/wasm_api.rs` 내에서만 수행, 직렬화 코드는 변경하지 않음
