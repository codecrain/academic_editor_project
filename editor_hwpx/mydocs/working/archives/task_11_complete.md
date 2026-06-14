# 타스크 11: 캡션 처리 (표/이미지) - 완료 보고서

## 개요

HWP 표(Table) 및 그림(Picture) 컨트롤의 캡션 파싱 및 렌더링 기능을 구현했다.

---

## 구현 내용

### 1단계: 모델 수정
- `src/model/table.rs`: Table 구조체에 `caption: Option<Caption>` 필드 추가
- `src/model/shape.rs`: Caption 구조체에 `include_margin: bool` 필드 추가

### 2단계: 캡션 파싱 함수
- `src/parser/control.rs`: `parse_caption()` 함수 구현
  - LIST_HEADER 공통 필드 (6바이트) 파싱
  - 캡션 속성 (4바이트): 방향, include_margin
  - 캡션 폭, 간격, 최대 폭 파싱
  - 캡션 내부 문단 리스트 파싱

### 3단계: 표/그림 캡션 연동
- `parse_table_control()`: HWPTAG_TABLE 이전의 LIST_HEADER를 캡션으로 처리
- `parse_gso_control()`: Picture 개체의 캡션 파싱 추가

### 4단계: 렌더러 구현
- `src/renderer/layout.rs`:
  - `calculate_caption_height()`: 캡션 높이 계산
  - `layout_caption()`: 캡션 문단 렌더링
  - `layout_table()`: 표 캡션 렌더링 (Top/Bottom 방향 지원)
- `src/renderer/height_measurer.rs`:
  - `MeasuredTable.caption_height` 필드 추가
  - `measure_caption()`: 캡션 높이 측정

---

## 테스트 결과

```
running 219 tests
...
test result: ok. 219 passed; 0 failed; 0 ignored
```

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/model/table.rs` | caption 필드 추가, Caption import |
| `src/model/shape.rs` | include_margin 필드 추가 |
| `src/parser/control.rs` | parse_caption(), 표/그림 캡션 파싱 |
| `src/renderer/layout.rs` | 캡션 렌더링 함수들 |
| `src/renderer/height_measurer.rs` | 캡션 높이 측정 |

---

## 캡션 방향 지원

| 방향 | 지원 여부 | 비고 |
|------|-----------|------|
| Top | ✅ 지원 | 표/이미지 위에 캡션 |
| Bottom | ✅ 지원 | 표/이미지 아래에 캡션 |
| Left | ⚠️ 부분 | Bottom으로 대체 처리 |
| Right | ⚠️ 부분 | Bottom으로 대체 처리 |

---

## 한계 및 향후 작업

1. **Left/Right 캡션**: 현재 Bottom으로 대체 처리됨. 완전한 지원 시 레이아웃 로직 추가 필요
2. **캡션 스타일**: 캡션 문단의 CharShape 스타일 적용은 기존 문단 렌더링과 동일하게 동작

---

*작성일: 2026-02-06*
