# 타스크 91 — 1~2단계 완료 보고서

## 단계 목표
- 1단계: ColumnDef 추출 + 페이지네이션 연결
- 2단계: Column/MultiColumn 나누기 처리 (1단계에 통합)

## 완료 항목

### 1. ColumnDef 파서 수정 (근본 원인 수정)

**문제**: `parse_column_def_ctrl()`이 HWP 스펙과 다른 방식으로 파싱
- 구 코드: `column_count`를 별도 u16로 읽음, `same_width`는 bit 3
- 스펙(표 141): `column_count`는 attr의 bit 2-9, `same_width`는 bit 12

**수정**: `src/parser/body_text.rs`
- bit 2-9 → column_count, bit 10-11 → direction, bit 12 → same_width
- 데이터 레이아웃: attr(2) → spacing(2) → widths(가변) → attr2(2) → separator(6)

### 2. ColumnDef 직렬화 수정

**수정**: `src/serializer/control.rs`
- 직렬화도 동일하게 새 비트필드 형식 적용
- 기존 테스트 2개 수정하여 통과

### 3. ColumnDef 추출 + 페이지네이션 연결

**수정**: `src/wasm_api.rs`
- `find_initial_column_def()` 헬퍼: 구역 문단에서 첫 ColumnDef 추출
- `paginate()`: `ColumnDef::default()` → 실제 ColumnDef 전달

### 4. MultiColumn 나누기 처리

**수정**: `src/renderer/pagination.rs`
- `ColumnBreakType::MultiColumn`: 새 페이지 + 새 ColumnDef로 layout 재계산
- `ColumnBreakType::Column`: 다음 단으로 이동 (마지막 단이면 새 페이지)
- `col_count`/`layout`를 `mut`로 변경하여 mid-section 변경 지원

### 5. 다단 플로우 수정

줄 분할/표 분할 연속 시 항상 새 페이지를 생성하던 것을 다음 단 우선으로 변경 (4곳):
- 문단 줄 분할 연속부
- 표 첫 행 오버플로
- 표 행 분할 연속부
- 표 MeasuredTable 없는 fallback

## 검증 결과
- `docker compose run --rm test` — **532개 테스트 전체 통과**
- SVG 내보내기: `treatise sample.hwp` **17페이지 → 9페이지** (2단 레이아웃 적용)
- 좌우 단 글리프 분포 정상 확인

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/parser/body_text.rs` | ColumnDef 파싱: 스펙(표 141) 기준 비트필드 수정 + 테스트 |
| `src/serializer/control.rs` | ColumnDef 직렬화: 동일 비트필드 형식 |
| `src/wasm_api.rs` | ColumnDef 추출 + paginate() 연결 |
| `src/renderer/pagination.rs` | MultiColumn/Column 나누기, 4곳 다단 플로우 수정 |
