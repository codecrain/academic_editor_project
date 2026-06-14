# 타스크 191 4단계 완료 보고서: 셀 테두리/배경 별도 대화상자 + 컨텍스트 메뉴

## 완료 항목

### 1. `cell-border-bg-dialog.ts` 신규 생성
- `ModalDialog` 상속, 3탭 구성: **테두리** / **배경** / **대각선**
- `applyMode: 'each' | 'asOne'` 파라미터로 적용 방식 분기

#### 테두리 탭
- 선 종류 시각적 격자 (SVG 아이콘 8종) — 표 대화상자와 동일 구조
- 굵기/색 선택
- 프리셋 버튼: 모두/바깥쪽/안쪽
- SVG 십자선 미리보기 + 방향 버튼(O/▲/◀/▶/▼) 그리드 배치
- "선 모양 바로 적용(I)" 체크박스
- 적용 범위: 선택된 셀(S) / 모든 셀(E) 라디오

#### 배경 탭
- 채우기 없음 / 색(Q) 라디오
- 면색(C) + 무늬색(K) + 무늬모양(L) 3개 필드
- CSS gradient 기반 미리보기
- 적용 범위: 선택된 셀(S) / 모든 셀(E) 라디오

#### 대각선 탭
- 선 종류/굵기/색 드롭다운
- \ 대각선, / 대각선, + 중심선 토글 버튼
- 적용 범위: 선택된 셀(S) / 모든 셀(E) 라디오

### 2. 커맨드 연결 (`table.ts`)
- `table:border-each` 스텁 → `CellBorderBgDialog(applyMode='each')` 연결
- `table:border-one` 스텁 → `CellBorderBgDialog(applyMode='asOne')` 연결

### 3. 컨텍스트 메뉴 연동 (`input-handler.ts`)
- 표 셀 내부 컨텍스트 메뉴에 추가:
  - "셀 테두리/배경 - 각 셀마다 적용(E)..."
  - "셀 테두리/배경 - 하나의 셀처럼 적용(Z)..."

## 수정 파일
| 파일 | 변경 |
|------|------|
| `rhwp-studio/src/ui/cell-border-bg-dialog.ts` | 신규 생성 |
| `rhwp-studio/src/command/commands/table.ts` | import 추가, 스텁 → 실제 커맨드 구현 |
| `rhwp-studio/src/engine/input-handler.ts` | 컨텍스트 메뉴에 셀 테두리/배경 항목 추가 |

## 검증 결과
- TypeScript 컴파일: 에러 없음
