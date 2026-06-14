# 타스크 87 — 2단계 완료보고서

## 표 객체 선택 모드 + Esc 키 처리 + 투명선 자동 활성화

### 완료 내용

#### 1. CursorState 표 객체 선택 상태 (`cursor.ts`)
- `_tableObjectSelected` / `selectedTableRef` 상태 필드 추가
- `enterTableObjectSelection()` — 현재 셀 위치의 표를 객체 선택
- `exitTableObjectSelection()` — 객체 선택 해제
- `isInTableObjectSelection()` — 상태 조회
- `getSelectedTableRef()` — 선택된 표 참조 반환
- `moveOutOfSelectedTable()` — 표 밖으로 커서 이동 + 선택 해제

#### 2. Esc 키 상태 전환 머신 (`input-handler.ts`)
- **셀 편집 모드** → Esc → **표 객체 선택 모드** (캐럿 숨김)
- **셀 선택 모드(F5)** → Esc → **표 객체 선택 모드** (셀 하이라이트 제거)
- **표 객체 선택** → Esc → **표 밖 커서 이동** (다음 문단 시작)
- **표 객체 선택** → Enter → **셀 편집 복귀** (캐럿 표시)
- **표 객체 선택** → Delete/Backspace → **표 삭제** + document-changed

#### 3. 표 밖 클릭 시 표 객체 선택 해제 (`input-handler.ts`)
- onClick에서 표 객체 선택 상태 확인 → 해제 + 이벤트 발행

#### 4. 투명선 자동 활성화 (`input-handler.ts` + `view.ts`)
- `wasInCell` 상태로 셀 진입/탈출 변화 감지
- 셀 밖 → 셀 진입: `setShowTransparentBorders(true)` + 버튼 active
- 셀 안 → 셀 탈출: 자동으로 켜진 경우에만 OFF
- `manualTransparentBorders` 플래그로 수동 토글과 공존
- `view:border-transparent` 커맨드에서 `transparent-borders-changed` 이벤트 발행

#### 5. EditorContext 확장 (`types.ts` + `main.ts`)
- `inTableObjectSelection: boolean` 필드 추가
- `getContext()`에서 InputHandler 상태 반영

#### 6. `table:delete` 커맨드 등록 (`table.ts`)
- 표 객체 선택 모드 또는 셀 내부에서 실행 가능
- 컨텍스트 메뉴에 "표 지우기" 항목 추가

### 수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `rhwp-studio/src/engine/cursor.ts` | 표 객체 선택 상태 + 메서드 5개 |
| `rhwp-studio/src/engine/input-handler.ts` | Esc 상태 머신 + 투명선 자동 + onClick 해제 + public 접근자 |
| `rhwp-studio/src/command/types.ts` | EditorContext에 `inTableObjectSelection` 추가 |
| `rhwp-studio/src/command/commands/view.ts` | `transparent-borders-changed` 이벤트 발행 |
| `rhwp-studio/src/command/commands/table.ts` | `table:delete` 커맨드 등록 |
| `rhwp-studio/src/main.ts` | getContext()에 `inTableObjectSelection` 추가 |

### 검증
- Vite 빌드 성공 ✓
