# 타스크 85 수행계획서: 셀 병합/나누기

## 목표

F5 셀 선택 모드에서 셀 범위 병합, 단일 셀 나누기 기능 구현

## 현재 상태

- **WASM API**: `mergeTableCells`, `splitTableCell`, `getCellInfo` 존재 (wasm_api.rs)
- **TypeScript 브릿지**: 미연결
- **커맨드**: `table:cell-merge`, `table:cell-split` 스텁 등록 (table.ts)
- **F5 셀 선택**: 정상 동작 (Task 83 완료)
- **컨텍스트 메뉴**: 정상 동작 (Task 82 완료)

## 범위

1. **WASM 브릿지 메서드 추가**: `mergeTableCells()`, `splitTableCell()` TypeScript 브릿지
2. **InputHandler 공용 메서드 추가**: 셀 선택 범위/컨텍스트 조회, 셀 선택 모드 종료
3. **커맨드 execute 구현**:
   - `table:cell-merge`: 셀 선택 범위 병합 → 문서 변경 이벤트
   - `table:cell-split`: 병합된 셀 나누기 → 문서 변경 이벤트
4. **단축키 연결**: 셀 선택 모드에서 M(병합), S(나누기) 키 처리

## 영향도

- 중간 (표 구조 변경 → 재렌더링)
- 기존 동작 변경 없음 (신규 기능만 추가)

## 의존성

- 타스크 83 (F5 셀 선택 모드) — 완료
- 타스크 82 (컨텍스트 메뉴) — 완료

## 검증 방법

1. Vite 빌드 성공
2. 웹 검증: F5 → 셀 범위 선택 → M(병합) 동작 확인
3. 웹 검증: 병합된 셀에서 F5 → S(나누기) 동작 확인
4. 컨텍스트 메뉴에서 셀 합치기/나누기 동작 확인

## 주의사항

- WASM 재빌드 후 반드시 `node_modules/.vite` 캐시 삭제 필요
