# 타스크 20 - 3단계 완료 보고서: JS 키보드 입력 및 IME 지원

## 완료 내용

### 3-1. editor.js - handleTextInsert() 함수 추가
- 캐럿의 문서 좌표를 `getDocumentPos()`로 가져옴
- `doc.insertText()` WASM API 호출로 문단 텍스트 수정
- 재렌더링 후 `setCaretByDocPos()`로 캐럿 복원
- 검색 인덱스 자동 재구축
- IME textarea 포커스 유지

### 3-2. editor.js - 키보드 핸들러 확장
- 캐럿 활성 시 printable 키(`e.key.length === 1`, Ctrl/Meta 미포함) → `handleTextInsert(e.key)` 호출
- 캐럿 활성 시 Enter 키 → `handleTextInsert('\n')` (줄바꿈)
- `e.isComposing` 체크로 IME 조합 중 간섭 방지

### 3-3. editor.js - IME 이벤트 리스너
- `compositionstart`: 조합 시작 플래그 설정
- `compositionend`: 조합 완료 시 `handleTextInsert(e.data)` 호출 후 textarea 초기화
- `input`: 비 IME 입력이 textarea에 남지 않도록 정리
- 캔버스 `mouseup` 시 캐럿이 활성이면 IME textarea에 포커스

### 3-4. 변경 파일 (3단계)
| 파일 | 변경 내용 |
|------|----------|
| `web/editor.js` | handleTextInsert(), IME 이벤트, 키보드 핸들러 확장 |

## 검증 결과 (4단계)
- 테스트: 239개 전체 통과
- WASM 빌드: 성공

## 전체 수정 파일 요약 (1~3단계)
| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/render_tree.rs` | TextRunNode에 문서 좌표 필드 추가 |
| `src/renderer/layout.rs` | 레이아웃 파이프라인에 문서 좌표 전파 |
| `src/wasm_api.rs` | JSON 확장 + insertText WASM API |
| `src/model/paragraph.rs` | insert_text_at() 메서드 + 6개 테스트 |
| `web/text_selection.js` | JSDoc 확장, getDocumentPos(), setCaretByDocPos() |
| `web/editor.html` | IME용 숨겨진 textarea 추가 |
| `web/editor.js` | handleTextInsert(), IME/키보드 핸들러 |
