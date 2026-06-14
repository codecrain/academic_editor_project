# 타스크 86 수행계획서: 행/열 추가 및 삭제

## 목표

표에서 행/열을 추가(위/아래, 왼쪽/오른쪽)하고 삭제하는 기능 구현

## 현재 상태

- **Rust 모델**: `Table::insert_row()`, `Table::insert_column()` 구현됨. 삭제 메서드 미구현
- **WASM API**: `insertTableRow`, `insertTableColumn` 구현됨. 삭제 API 미구현
- **TypeScript 브릿지**: 행/열 관련 브릿지 메서드 없음
- **커맨드**: 6개 스텁 등록됨 (table.ts)
  - `table:insert-row-above`, `table:insert-row-below`
  - `table:insert-col-left`, `table:insert-col-right`
  - `table:delete-row`, `table:delete-col`
- **컨텍스트 메뉴**: 위 6개 커맨드 항목 이미 배치됨 (input-handler.ts)
- **단축키**: `Alt+Insert` (칸 추가), `Alt+Delete` (칸 지우기) 정의되어 있으나 shortcut-map 미등록

## 범위

1. **Rust 모델 확장**: `Table::delete_row()`, `Table::delete_column()` 메서드 추가
2. **WASM API 추가**: `deleteTableRow`, `deleteTableColumn` 바인딩 추가
3. **WASM 브릿지 추가**: 4개 메서드 (`insertTableRow`, `insertTableColumn`, `deleteTableRow`, `deleteTableColumn`)
4. **커맨드 구현**: 6개 스텁 → 실제 execute 구현
5. **단축키 등록**: shortcut-map에 `Alt+Insert`, `Alt+Delete` 등록

## 영향도

- 중간 (표 구조 변경 → 재렌더링)
- Rust 모델 변경 → WASM 재빌드 필요
- 기존 동작 변경 없음 (신규 기능만 추가)

## 의존성

- 타스크 82 (컨텍스트 메뉴) — 완료
- 타스크 85 (셀 병합/나누기) — 완료 (병합 영역 처리 참고)

## 검증 방법

1. Rust 테스트 통과 (기존 테스트 + 삭제 관련 신규 테스트)
2. WASM 빌드 성공
3. Vite 빌드 성공
4. 웹 검증: 컨텍스트 메뉴에서 행/열 추가/삭제 동작 확인
5. 웹 검증: Alt+Insert / Alt+Delete 단축키 동작 확인

## 주의사항

- 행/열 삭제 시 병합 셀 처리: rowSpan/colSpan 걸치는 셀의 span 축소 필요
- 마지막 행/열은 삭제 불가 (최소 1×1 보장)
- WASM 재빌드 후 반드시 `node_modules/.vite` 캐시 삭제 필요
