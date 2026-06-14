# 타스크 62: 편집 용지 설정 다이얼로그 UI — 완료 보고서

## 구현 결과

한컴 웹기안기(WebGian)와 동일한 편집 용지 설정 모달 다이얼로그를 구현하였다. 프로젝트 최초의 다이얼로그 UI 컴포넌트이며, 이후 다른 다이얼로그(글자 속성, 문단 속성 등)의 베이스로 재사용 가능하다.

## 수정/신규 파일

| 파일 | 작업 | 변경량 |
|------|------|--------|
| `src/wasm_api.rs` | 수정 — getPageDef/setPageDef WASM API 추가 | +75줄 |
| `rhwp-studio/src/style.css` | 수정 — 모달/다이얼로그 CSS 추가 | +85줄 |
| `rhwp-studio/src/ui/dialog.ts` | 신규 — 모달 다이얼로그 베이스 클래스 | 85줄 |
| `rhwp-studio/src/ui/page-setup-dialog.ts` | 신규 — 편집 용지 다이얼로그 | 285줄 |
| `rhwp-studio/src/core/types.ts` | 수정 — PageDef 인터페이스 추가 | +14줄 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 수정 — getPageDef/setPageDef 메서드 | +12줄 |
| `rhwp-studio/src/command/commands/file.ts` | 수정 — file:page-setup 활성화 | +5줄 |
| `rhwp-studio/src/command/commands/page.ts` | 수정 — page:setup 활성화 | +10줄 |
| `rhwp-studio/src/command/shortcut-map.ts` | 수정 — F7 바인딩 추가 | +3줄 |
| `rhwp-studio/src/engine/input-handler.ts` | 수정 — Function 키 단축키 처리 | +8줄 |

## 주요 기능

### WASM API (Rust)
- `getPageDef(sectionIdx)` — HWPUNIT 원본값으로 PageDef 반환 (width, height, 여백 9종, landscape, binding)
- `setPageDef(sectionIdx, json)` — PageDef 변경 후 재조판+재페이지네이션, 변경된 pageCount 반환

### 모달 다이얼로그 베이스 (dialog.ts)
- WebGian `dialog_wrap` 패턴 기반
- 반투명 오버레이, 타이틀 바 + X 닫기, 확인/취소 버튼
- Escape 키 닫기, 오버레이 클릭 닫기
- 서브클래스에서 `createBody()`/`onConfirm()` 오버라이드

### 편집 용지 다이얼로그 (page-setup-dialog.ts)
- **용지 종류**: A4, A3, B4, B5, Letter, Legal, 사용자 정의 드롭다운
- **용지 크기**: 폭/길이 mm 표시 (프리셋 선택 시 자동 채움, 사용자 정의 시 편집 가능)
- **용지 방향**: 세로/가로 라디오 (전환 시 폭/길이 교환)
- **제본**: 한쪽/맞쪽/위로 라디오
- **용지 여백**: 위쪽/아래쪽/왼쪽/오른쪽/머리말/꼬리말/제본 7필드 (mm, 소수 1자리)
- **적용 범위**: 문서 전체
- 확인 시 mm→HWPUNIT 변환 후 setPageDef 호출, 캔버스 자동 재렌더

### 커맨드 + 단축키
- 메뉴: 파일 > 편집 용지, 쪽 > 편집 용지 (문서 로드 시 활성)
- F7 단축키 (Ctrl 없이 단독 동작)
- input-handler에 Function 키 단축키 처리 추가 (default case)

## 검증

- 네이티브 빌드: 성공
- Rust 테스트: 481개 전 통과
- WASM 빌드: 성공
- TypeScript 타입 체크: 에러 없음
- Vite 프로덕션 빌드: 성공 (34 modules)
