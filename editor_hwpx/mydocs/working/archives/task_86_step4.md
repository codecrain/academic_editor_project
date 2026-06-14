# 타스크 86 — 4단계 완료보고서

## 빌드 검증 + 웹 테스트

### 검증 결과
- Rust 테스트: 511개 전체 통과 (기존 496 + delete 14 + 라운드트립 1)
- WASM 빌드: 성공
- Vite 빌드: 성공

### 웹 테스트 결과
- 컨텍스트 메뉴에서 위/아래 줄 추가: 정상 동작
- 컨텍스트 메뉴에서 왼/오른쪽 칸 추가: 정상 동작
- 컨텍스트 메뉴에서 줄/칸 지우기: 정상 동작
- Alt+Insert (칸 추가): 정상 동작
- Alt+Delete (칸 지우기): 정상 동작

### 수정사항 (4단계 중 발견/수정)
- `input-handler.ts`: Alt 조합 단축키 처리 블록 추가 (Ctrl/Meta 처리 직후, switch 진입 전)
  - 기존: Alt+Insert/Delete가 `case 'Insert'`/`case 'Delete'`에 먼저 가로채짐
  - 수정: Alt 키 조합을 `matchShortcut`으로 우선 라우팅

### 알려진 이슈
- 표 구조 변경 후 저장 시 HWP 프로그램에서 파일 손상 오류 발생
  - 이번 타스크만의 문제가 아닌 기존 직렬화 이슈 (셀 병합 등도 동일)
  - 트러블슈팅 문서: `mydocs/troubleshootings/table_paste_file_corruption.md` 참조
  - 별도 타스크로 분리 필요
