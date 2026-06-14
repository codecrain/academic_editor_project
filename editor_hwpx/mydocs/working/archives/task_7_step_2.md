# 타스크 7 - 2단계 완료 보고서: Paginator 2-패스 로직 구현

## 완료 일시
2026-02-06

## 구현 내용

### 1. 2-패스 페이지네이션 아키텍처

`paginate()` 함수를 2-패스 구조로 리팩토링:

```
1-패스: HeightMeasurer로 모든 콘텐츠 높이 사전 측정
        ↓
2-패스: 측정된 높이를 기반으로 정확한 페이지 분할
```

### 2. 사전 측정 높이 사용

기존에는 페이지네이션 중에 높이를 직접 계산했으나, 이제 `HeightMeasurer`가 측정한 값을 사용:

- `measured.get_paragraph_height(para_idx)` — 문단 높이
- `measured.get_table_height(para_idx, ctrl_idx)` — 표 높이
- `measured.paragraph_has_table(para_idx)` — 표 포함 여부

### 3. 각주 영역 동적 높이 추적

각주가 발견될 때마다 `current_footnote_height`에 해당 각주의 높이를 추가:

```rust
// 페이지 첫 각주면 구분선 오버헤드 추가
if is_first_footnote_on_page {
    current_footnote_height += footnote_separator_overhead;
    is_first_footnote_on_page = false;
}
current_footnote_height += fn_height;
```

### 4. 가용 높이 동적 조정

본문 영역의 가용 높이에서 각주 영역 높이를 빼서 실제 사용 가능한 높이 계산:

```rust
let available_height = base_available_height - current_footnote_height;
```

### 5. 새 페이지 시작 시 리셋

페이지가 바뀔 때마다 각주 관련 변수 초기화:

```rust
current_footnote_height = 0.0;
is_first_footnote_on_page = true;
```

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/pagination.rs` | 2-패스 구조 리팩토링, 각주 높이 동적 추적 |
| `src/renderer/height_measurer.rs` | `estimate_single_footnote_height()` 메서드 추가 |

## 테스트 결과

- 216개 단위 테스트 통과
- `samples/2010-01-06.hwp`: 기존 5페이지 → 6페이지로 올바르게 출력
- 경고 없이 빌드 완료

## 핵심 개선 사항

| 항목 | 기존 | 개선 |
|------|------|------|
| 높이 계산 | 인라인 계산 (불일치 가능) | HeightMeasurer 사전 측정 (일관성 보장) |
| 각주 영역 | 고려 안 함 (오버랩 발생) | 동적으로 추적하여 본문 영역 축소 |
| 페이지 수 | 5페이지 (부족) | 6페이지 (정확) |

## 다음 단계

3단계 (검증 및 최적화) 완료 — 타스크 7 전체 완료
