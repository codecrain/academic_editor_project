# 타스크 85 최종 결과보고서: 셀 병합/나누기

## 완료일: 2026-02-15

## 구현 요약

### 1단계: WASM 브릿지 + InputHandler 메서드
- `wasm-bridge.ts`에 `mergeTableCells()`, `splitTableCell()` 브릿지 메서드 추가
- `input-handler.ts`에 `getSelectedCellRange()`, `getCellTableContext()`, `exitCellSelectionMode()` 공용 메서드 추가

### 2단계: 커맨드 execute + 단축키
- `table:cell-merge`: 셀 선택 모드에서 선택 범위 병합
- `table:cell-split`: 병합된 셀을 원래대로 나누기
- 셀 선택 모드(F5)에서 M/S 단축키 처리

### 3단계: 빌드 검증 + 웹 테스트
- Vite 빌드 성공, 웹 동작 검증 완료

## 수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `rhwp-studio/src/core/wasm-bridge.ts` | `mergeTableCells()`, `splitTableCell()` 추가 |
| `rhwp-studio/src/command/commands/table.ts` | `table:cell-merge`, `table:cell-split` 실제 구현 |
| `rhwp-studio/src/engine/input-handler.ts` | 공용 메서드 3개 + M/S 단축키 처리 |

## 동작 방식

1. **셀 병합**: F5 → 화살표로 셀 범위 선택 → M 키 (또는 컨텍스트 메뉴)
2. **셀 나누기**: 병합된 셀에 커서 → F5 → S 키 (또는 컨텍스트 메뉴)

## 제한사항

- 표 구조 변경에 대한 Undo 미지원 (별도 타스크 필요)

## 트러블슈팅 기록

- Vite 의존성 캐시(`node_modules/.vite`)가 브랜치 전환 시 갱신되지 않아 구 WASM 바이너리가 서빙되는 문제 발견
- WASM 재빌드 후 반드시 `rm -rf node_modules/.vite` 캐시 삭제 필요
