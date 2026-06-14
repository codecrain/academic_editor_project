# 타스크 91: 다단(Multi-Column) 레이아웃 처리 — 수행계획서

## 목표
다단 레이아웃이 포함된 HWP 문서를 정상적으로 렌더링한다.
예제: `samples/basic/treatise sample.hwp` (2단)

## 현황 분석

### 이미 구현된 부분
| 영역 | 상태 | 설명 |
|------|------|------|
| 모델 (ColumnDef) | ✅ 완료 | column_type, column_count, spacing, widths, separator 등 |
| HWP 바이너리 파서 | ✅ 완료 | `parse_column_def_ctrl()` — Control::ColumnDef로 저장 |
| 레이아웃 영역 계산 | ✅ 완료 | `calculate_column_areas()` — 다단 영역 분할 |
| 페이지네이션 | ✅ 부분 | 단 인덱스/이동 코드 존재하나 항상 1단으로 호출됨 |
| 렌더 트리 | ✅ 완료 | `RenderNodeType::Column(index)` 노드 지원 |

### 핵심 문제점

**1. `paginate()` 함수가 항상 `ColumnDef::default()` (1단)을 전달**
- `src/wasm_api.rs:1706` — 구역의 실제 ColumnDef를 무시하고 기본값 사용
- 결과: 모든 콘텐츠가 1단으로 배치됨

**2. 단 나누기(ColumnBreakType::Column) 미처리**
- `pagination.rs:251` — Page/Section 나누기만 처리, Column 나누기 무시
- 결과: 2단 문서에서 강제 단 넘김이 동작하지 않음

**3. 다단 나누기(ColumnBreakType::MultiColumn) 미처리**
- 문서 중간에서 단 수가 변경되는 경우 처리 없음
- 예: 제목은 1단 → 본문은 2단

**4. HWPX 파서에 다단 파싱 없음**
- `src/parser/hwpx/section.rs` — 컬럼 관련 XML 요소 파싱 없음
- HWPX 파일의 다단 정보 손실

## ColumnDef 흐름 분석

HWP에서 ColumnDef는 문단의 컨트롤로 저장된다:
```
Section → Paragraph[0] → controls[0] = Control::SectionDef(...)
Section → Paragraph[0] → controls[1] = Control::ColumnDef(...)  ← 초기 다단 정의
...
Section → Paragraph[N] → column_type = MultiColumn  ← 다단 변경
Section → Paragraph[N] → controls[0] = Control::ColumnDef(...)  ← 새 다단 정의
```

## 수행 범위

### 범위 내 (In Scope)
1. 구역의 ColumnDef를 추출하여 페이지네이션에 전달
2. 다단 레이아웃 영역 분할 (동일 너비 + 가변 너비)
3. 단 나누기 (ColumnBreakType::Column) 처리
4. 다단 나누기 (ColumnBreakType::MultiColumn) — 문서 중간 단 수 변경
5. 단 구분선 렌더링 (separator_type, separator_width, separator_color)
6. HWPX 다단 파싱

### 범위 외 (Out of Scope)
- 단 균형 맞춤 (마지막 페이지에서 좌우 단 높이 균등화)
- 다단 편집 (캐럿/입력 관련)
- 다단 방향 RTL (RightToLeft)

## 예상 수정 파일

| 파일 | 수정 내용 |
|------|----------|
| `src/wasm_api.rs` | `paginate()`: 구역에서 ColumnDef 추출 후 전달 |
| `src/renderer/pagination.rs` | Column 나누기 처리, MultiColumn 나누기 처리 |
| `src/renderer/layout.rs` | 단 구분선 렌더링 |
| `src/renderer/svg.rs` | 단 구분선 SVG 출력 |
| `src/parser/hwpx/section.rs` | HWPX 다단 XML 파싱 |

## 검증 방법
- `samples/basic/treatise sample.hwp` SVG 내보내기 — 2단 배치 확인
- Rust 테스트 통과
- WASM/Vite 빌드 성공
- 웹 뷰어에서 2단 렌더링 확인
