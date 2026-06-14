# 타스크 110 수행계획서

- **과제명**: KTX.hwp 2단 레이아웃 오른쪽 단 렌더링 (B-005)
- **브랜치**: `local/task110` (devel `2d0c804` 기준)
- **작성일**: 2026-02-18

## 1. 문제 분석

### 현상
- KTX.hwp는 2단(multi-column) 레이아웃 문서
- 현재 코드에서 오른쪽 단 텍스트가 제대로 렌더링되지 않음

### 근본 원인 (2가지)

#### A. 표 외부 여백(margin) 미구현
- `Table` 구조체에 외부 여백(`margin`) 필드 없음
- 도형(Shape)은 `CommonObjAttr.margin`으로 외부 여백을 처리하지만, 표는 이를 지원하지 않음
- 표의 외부 여백이 무시되어 다단 레이아웃에서 표 위치가 부정확함
- 셀 내부 패딩(cell padding)은 정상 동작

#### B. 다단 줄 필터링 부재
- HWP 내부 구조상 다단 문서의 문단은 **모든 단의 줄 정보**를 포함
- 각 줄의 `segment_width`(LineSeg)로 어느 단에 속하는지 구분해야 함
- `layout_composed_paragraph()`에 현재 단에 속하는 줄만 선별하는 필터링 로직이 없음

### 이전 시도 (130b1df) 실패 원인
- 다단 문서 여부를 판별하지 않고 모든 문서에 segment_width 필터 적용
- 단일 단 문서(k-water-rfp)에서 회귀 발생

## 2. 해결 방안

### 핵심 전략
1. **표 외부 여백 구현** — 표 위치 계산에 margin 반영
2. **다단 줄 필터링** — `column_areas.len() > 1`로 다단 문서만 필터 적용
3. **회귀 방지** — 단일 단 문서는 필터링 건너뜀

### 수정 대상 파일
- `src/model/table.rs` — Table 구조체에 margin 필드 추가
- `src/parser/control.rs` — 표 파싱 시 외부 여백 추출
- `src/renderer/layout.rs` — 표 위치 계산에 margin 적용 + 다단 줄 필터링

## 3. 구현 계획 (4단계)

### 1단계: 표 외부 여백 파싱 및 렌더링
- `Table` 구조체에 `margin: Padding` 필드 추가 (또는 raw_ctrl_data에서 margin 읽기)
- CTRL_HEADER의 CommonObjAttr 구조에서 margin 필드 위치 확인
- `layout.rs`의 표 위치 계산(table_x, table_y)에 margin 반영

### 2단계: 다단 줄 필터링 구현
- `layout_composed_paragraph()`에 `is_multi_column: bool` 파라미터 추가
- 다단 문서일 때 `ComposedLine.segment_width`와 현재 단 너비 비교
- 불일치 줄은 `char_offset`만 진행하고 렌더링 건너뜀
- 호출부에 `is_multi_column` 전달

### 3단계: 회귀 테스트 및 SVG 검증
- 565개 전체 테스트 통과 확인
- KTX.hwp SVG 내보내기 → 오른쪽 단 텍스트 정상 렌더링 확인
- k-water-rfp 등 단일 단 문서 회귀 없음 확인

### 4단계: WASM 빌드 및 최종 검증
- WASM 빌드 성공 확인

## 4. 검증 방법
- `docker compose --env-file .env.docker run --rm test` → 565개 테스트 통과
- `export-svg samples/basic/KTX.hwp` → 오른쪽 단 정상 렌더링
- WASM 빌드 성공
