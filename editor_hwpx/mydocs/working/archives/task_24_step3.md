# 타스크 24 - 3단계 완료 보고서: 에디터 JS 연동 (히트테스트, 캐럿, 입력 디스패치)

## 변경 파일

### 1. `web/text_selection.js`

#### `getDocumentPos()` 확장
- 표 셀 내부 run에서 캐럿 위치를 가져올 때 `parentParaIdx`, `controlIdx`, `cellIdx`, `cellParaIdx` 포함
- 본문 문단 run은 기존과 동일하게 동작

#### `setCaretByDocPos()` 확장
- 4번째 인자로 `cellCtx` 옵셔널 객체 추가
- 셀 컨텍스트가 있으면 해당 셀의 run만 매칭
- 본문 문단은 셀 정보 없는 run만 매칭 (오매칭 방지)

#### `getSelectionDocRange()` 확장
- 같은 셀의 같은 문단 내 선택만 지원
- 셀 내부 선택 시 셀 식별 정보 포함

### 2. `web/editor.js`

#### 헬퍼 함수 추가 (6개)
- `_hasCellCtx(pos)` — 셀 컨텍스트 유무 확인
- `_cellCtx(pos)` — 셀 컨텍스트 객체 추출
- `_doInsertText(pos, charOffset, text)` — 본문/셀 분기 삽입
- `_doDeleteText(pos, charOffset, count)` — 본문/셀 분기 삭제
- `_restoreCaret(pos, charOffset)` — 본문/셀 분기 캐럿 복원

#### `handleTextInsert()` 수정
- 선택 삭제 → `_doDeleteText()` 사용
- 텍스트 삽입 → `_doInsertText()` 사용
- 캐럿 복원 → `_restoreCaret()` 사용

#### `handleTextDelete()` 수정
- 선택 삭제 / 단일 문자 삭제 → `_doDeleteText()` 사용
- 캐럿 복원 → `_restoreCaret()` 사용
- 셀 내부 Backspace(문단 시작) → 문단 병합 비활성화

#### `handleParagraphSplit()` 수정
- 셀 내부에서 Enter → 문단 분리 비활성화 (제외 범위)

## 동작 흐름 (셀 텍스트 입력)
1. 셀 클릭 → hitTest → 셀 내 TextRun 매칭 → 캐럿 설정
2. 키 입력 → `handleTextInsert()` → `getDocumentPos()` (셀 정보 포함)
3. `_doInsertText()` → WASM `insertTextInCell()` 호출
4. 재렌더링 → `_restoreCaret()` → 셀 run 매칭으로 캐럿 복원

## 빌드 및 테스트 결과
- 빌드: 성공
- 테스트: 338개 전체 통과
