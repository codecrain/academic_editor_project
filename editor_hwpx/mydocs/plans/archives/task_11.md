# 타스크 11: 캡션 처리 (표/이미지)

## 개요

HWP 표(Table) 및 그림(Picture) 컨트롤의 캡션 파싱 및 렌더링 기능을 구현한다.

---

## 현재 상태

### 표 (Table)
| 항목 | 상태 | 비고 |
|------|------|------|
| Table.caption 필드 | ❌ 없음 | 추가 필요 |
| 캡션 파싱 | ❌ 미구현 | control.rs에서 구현 필요 |
| 캡션 렌더링 | ❌ 미구현 | layout.rs에서 구현 필요 |

### 그림 (Picture)
| 항목 | 상태 | 비고 |
|------|------|------|
| Picture.caption 필드 | ✅ 존재 | `src/model/image.rs` |
| 캡션 파싱 | ❌ 미구현 | parse_picture()에서 구현 필요 |
| 캡션 렌더링 | ❌ 미구현 | layout.rs에서 구현 필요 |

### 공통
| 항목 | 상태 | 비고 |
|------|------|------|
| Caption 구조체 | ✅ 존재 | `src/model/shape.rs` |

---

## HWP 스펙 참조

### 표 70: 개체 공통 속성
- 개체 공통 속성 다음에 캡션 리스트 정보가 포함됨
- **표와 그림 모두 동일한 캡션 구조 사용**

### 표 73: 캡션 리스트
| 자료형 | 길이 | 설명 |
|--------|------|------|
| BYTE stream | n | 문단 리스트 헤더 (표 65) |
| BYTE stream | 14 | 캡션 (표 74) |

### 표 74: 캡션 데이터 (14바이트)
| 자료형 | 길이 | 설명 |
|--------|------|------|
| UINT | 4 | 속성 (표 75) |
| HWPUNIT | 4 | 캡션 폭 (세로 방향일 때) |
| HWPUNIT16 | 2 | 캡션-틀 간격 |
| HWPUNIT | 4 | 텍스트 최대 길이 |

### 표 75: 캡션 속성
| 범위 | 구분 | 값 | 설명 |
|------|------|-----|------|
| bit 0~1 | 방향 | 0=left, 1=right, 2=top, 3=bottom |
| bit 2 | 폭에 마진 포함 | 가로 방향일 때만 사용 |

---

## 구현 단계

### 1단계: 모델 수정
- `src/model/table.rs`: Table 구조체에 `caption: Option<Caption>` 필드 추가
- `src/model/shape.rs`: Caption 구조체에 `include_margin: bool` 필드 추가

### 2단계: 파서 구현
- `src/parser/control.rs`:
  - 공통 캡션 파싱 함수 `parse_caption()` 구현
  - `parse_table_control()`: 캡션 파싱 추가
  - `parse_gso_control()` → `parse_picture()`: 캡션 파싱 추가

### 3단계: 렌더러 구현
- `src/renderer/layout.rs`:
  - 공통 캡션 렌더링 함수 구현
  - `layout_table()`: 캡션 렌더링 추가
  - `layout_body_picture()`: 캡션 렌더링 추가
- `src/renderer/height_measurer.rs`: 캡션 높이 계산 추가

### 4단계: 테스트 및 검증
- 캡션이 있는 HWP 파일 테스트 (표, 이미지)
- SVG 출력 검증
- 캡션 위치/스타일 확인

---

## 예상 수정 파일

| 파일 | 작업 |
|------|------|
| `src/model/table.rs` | caption 필드 추가 |
| `src/model/shape.rs` | include_margin 필드 추가 |
| `src/parser/control.rs` | parse_caption(), 표/그림 캡션 파싱 |
| `src/renderer/layout.rs` | 캡션 렌더링 로직 |
| `src/renderer/height_measurer.rs` | 캡션 높이 계산 |

---

## 검증 방법

```bash
docker compose run --rm dev cargo run -- export-svg "samples/table-caption.hwp" --output output/
docker compose run --rm dev cargo run -- export-svg "samples/image-caption.hwp" --output output/
```

- 캡션 텍스트가 표/이미지 위/아래에 올바르게 표시되는지 확인
- 캡션 스타일(폰트, 정렬)이 올바른지 확인

---

## 위험 요소

1. **캡션 존재 여부 판단**: 공통 속성의 어느 비트가 캡션 유무를 나타내는지 확인 필요
2. **캡션 방향별 레이아웃**: left/right 방향은 개체 옆에 배치되어 레이아웃 복잡도 증가
3. **캡션 내 복잡한 문단**: 캡션에도 스타일, 인라인 이미지 등이 포함될 수 있음

---

*작성일: 2026-02-06*
