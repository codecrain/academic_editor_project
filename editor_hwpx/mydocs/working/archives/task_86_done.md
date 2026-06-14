# 타스크 86 — 최종 결과보고서

## 행/열 추가 및 삭제

### 목표
표에 행/열 추가(위/아래, 왼/오른쪽) 및 삭제 기능 구현

### 수정 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/model/table.rs` | `delete_row()`, `delete_column()` 메서드 + 14개 테스트 추가 |
| `src/wasm_api.rs` | `deleteTableRow`, `deleteTableColumn` WASM 바인딩 + 네이티브 구현 |
| `src/serializer/cfb_writer.rs` | 표 구조 변경 라운드트립 테스트 1개 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | `insertTableRow`, `insertTableColumn`, `deleteTableRow`, `deleteTableColumn` 브릿지 메서드 추가 |
| `rhwp-studio/src/command/commands/table.ts` | 6개 커맨드 스텁 → 실제 구현 (insert-row-above/below, insert-col-left/right, delete-row, delete-col) |
| `rhwp-studio/src/command/shortcut-map.ts` | `Alt+Insert` → `table:insert-col-left`, `Alt+Delete` → `table:delete-col` 단축키 등록 |
| `rhwp-studio/src/engine/input-handler.ts` | Alt 조합 단축키 처리 블록 추가 (switch 진입 전 우선 라우팅) |

### 구현 단계

| 단계 | 내용 | 결과 |
|------|------|------|
| 1단계 | Rust 모델 delete_row/delete_column + 14개 테스트 | 510개 테스트 통과 |
| 2단계 | WASM API + 브릿지 + 단축키 등록 | WASM/Vite 빌드 성공 |
| 3단계 | 커맨드 execute 6개 구현 | Vite 빌드 성공 |
| 4단계 | 빌드 검증 + 웹 테스트 + Alt 키 버그 수정 | 511개 테스트 통과, 웹 검증 완료 |

### 검증 결과
- Rust 테스트: 511개 전체 통과 (기존 496 + delete 14 + 라운드트립 1)
- WASM 빌드: 성공
- Vite 빌드: 성공
- 컨텍스트 메뉴 행/열 추가삭제: 정상 동작
- Alt+Insert (칸 추가), Alt+Delete (칸 지우기): 정상 동작

### 4단계 중 발견/수정된 이슈
- Alt+Insert/Delete 키가 switch(e.key)의 `case 'Insert'`/`case 'Delete'`에 먼저 가로채져 단축키 미동작
  - 해결: Alt 조합을 matchShortcut으로 우선 라우팅하는 블록 추가

### 알려진 이슈
- 표 구조 변경 후 저장 시 HWP 프로그램에서 파일 손상 오류 발생
  - 이번 타스크만의 문제가 아닌 기존 직렬화 이슈
  - 트러블슈팅 문서: `mydocs/troubleshootings/table_paste_file_corruption.md`
  - 백로그로 등록하여 별도 타스크 진행 예정
