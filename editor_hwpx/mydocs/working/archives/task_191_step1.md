# 타스크 191 1단계 완료 보고서: 전용 CSS 분리 + 대화상자 구조 개편

## 완료 항목

### 1. 전용 CSS 파일 생성
- `rhwp-studio/src/styles/table-cell-props.css` 신규 생성
- CSS 접두어: `tcp-` (table-cell-props)
- 주요 클래스: `tcp-tab-content`, `tcp-all-spinner`, `tcp-line-type-grid`, `tcp-border-preview-wrap`, `tcp-caption-grid`, `tcp-bg-preview`, `tcp-note`, `tcp-disabled` 등
- `style.css`에 import 추가

### 2. 인라인 스타일 CSS 클래스 전환
- 각 탭 패널의 `frag.style.padding = '12px'` → `tcp-tab-content` 클래스
- 크기 안내 문구 인라인 스타일 → `tcp-note` 클래스
- 테두리/배경 미리보기 인라인 스타일 → `tcp-bg-preview` 클래스

### 3. 문맥별 탭 분기 구현
- constructor에 `mode: 'table' | 'cell'` 파라미터 추가 (기본값: `'cell'`)
- `mode === 'table'` → 6탭 (기본/여백캡션/테두리/배경/표/셀)
- `mode === 'cell'` → 4탭 (기본/여백캡션/표/셀) — 테두리·배경 탭 제외
- 기본 활성 탭: 항상 마지막 탭(셀)으로 설정

### 4. 테두리/배경 탭 표 전용 단순화
- 셀/표 전환 라디오 제거 → 표 전용으로 고정 (`borderTarget = 'table'`, `bgTarget = 'table'`)
- cell 모드에서 테두리/배경 관련 필드 접근 시 null 방어 추가

### 5. 호출부 수정
- `table.ts`의 `table:cell-props` 커맨드에서 `isInTableObjectSelection()` 호출로 mode 판별
- 표 개체 선택 상태 → `mode = 'table'`, 셀 내 커서 → `mode = 'cell'`

## 수정 파일
| 파일 | 변경 |
|------|------|
| `rhwp-studio/src/styles/table-cell-props.css` | 신규 생성 |
| `rhwp-studio/src/style.css` | import 추가 |
| `rhwp-studio/src/ui/table-cell-props-dialog.ts` | mode 파라미터, 탭 분기, CSS 전환, null 방어 |
| `rhwp-studio/src/command/commands/table.ts` | mode 전달 |

## 검증 결과
- TypeScript 컴파일: 에러 없음
- Rust 테스트: 657개 전체 통과
