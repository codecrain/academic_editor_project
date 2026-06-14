# 타스크 32 - 최종 결과 보고서

## 타스크: 서식 툴바 구현

## 구현 요약

편집 모드에 서식 툴바를 추가하여 캐럿/선택 위치의 글자·문단 속성을 실시간 반영하고, 버튼 클릭 및 단축키로 서식을 적용할 수 있도록 구현하였다.

## 변경 파일 목록

| 파일 | 작업 | 단계 |
|------|------|------|
| `src/model/paragraph.rs` | `char_shape_id_at()`, `apply_char_shape_range()` 추가 | 1, 2 |
| `src/model/style.rs` | `PartialEq` derive, `CharShapeMods`/`ParaShapeMods` 구조체 | 2 |
| `src/model/document.rs` | `find_or_create_char_shape()`, `find_or_create_para_shape()` | 2 |
| `src/renderer/render_tree.rs` | TextRunNode에 char_shape_id, para_shape_id 필드 추가 | 1 |
| `src/renderer/layout.rs` | 9개 TextRunNode 생성 사이트 갱신 | 1 |
| `src/wasm_api.rs` | 텍스트 레이아웃 JSON 확장, 속성 조회/적용 API 8개, `findOrCreateFontId` | 1, 3, 6+ |
| `web/editor.html` | `#format-toolbar` HTML 추가 (7개 그룹) | 4 |
| `web/editor.css` | 서식 툴바 CSS (~100줄) | 4 |
| `web/format_toolbar.js` | 새 파일: FormatToolbar 클래스 (속성 반영 + 서식 명령) | 5, 6 |
| `web/text_selection.js` | `onCaretChange` 콜백 추가 | 5 |
| `web/editor.js` | FormatToolbar 초기화, 캐럿 연동, 서식 적용 핸들러, Ctrl+B/I/U | 5, 6 |

## WASM API 추가 목록

| API | 설명 |
|-----|------|
| `getCharPropertiesAt(sec, para, offset)` | 글자 속성 조회 |
| `getCellCharPropertiesAt(...)` | 셀 내 글자 속성 조회 |
| `getParaPropertiesAt(sec, para)` | 문단 속성 조회 |
| `getCellParaPropertiesAt(...)` | 셀 내 문단 속성 조회 |
| `applyCharFormat(sec, para, start, end, json)` | 글자 서식 적용 |
| `applyCharFormatInCell(...)` | 셀 내 글자 서식 적용 |
| `applyParaFormat(sec, para, json)` | 문단 서식 적용 |
| `applyParaFormatInCell(...)` | 셀 내 문단 서식 적용 |
| `findOrCreateFontId(name)` | 글꼴 이름 → ID 조회/생성 |

## 서식 툴바 기능

### 속성 반영 (캐럿 이동 시 자동 갱신)
- 글꼴 이름, 글자 크기 (pt), 굵게/기울임/밑줄/취소선 토글 상태
- 글자색 color bar, 정렬 버튼 active 상태, 줄간격

### 서식 명령 (선택 범위 또는 캐럿 기준)
- 글꼴 변경 (select → findOrCreateFontId → applyCharFormat)
- B/I/U/S 토글 (버튼 클릭 + Ctrl+B/I/U 단축키)
- 글자 크기 증감 (±1pt) / 직접 입력
- 글자색 / 강조색 (color picker)
- 정렬 4종 (양쪽/왼/가운데/오른쪽)
- 줄간격 변경
- 들여쓰기 / 내어쓰기

## 추가된 테스트: 9개

| 테스트 | 내용 |
|--------|------|
| `test_char_shape_id_at` | 위치별 CharShape ID 조회 |
| `test_apply_char_shape_range_full` | 전체 범위 적용 |
| `test_apply_char_shape_range_left_partial` | 왼쪽 부분 변경 |
| `test_apply_char_shape_range_right_partial` | 오른쪽 부분 변경 |
| `test_apply_char_shape_range_middle` | 중간 부분 변경 |
| `test_apply_char_shape_range_multi_segment` | 여러 세그먼트 걸침 |
| `test_apply_char_shape_range_merge_same_id` | 동일 ID 병합 |
| `test_find_or_create_char_shape_reuse` | CharShape 중복 제거 |
| `test_find_or_create_para_shape_reuse` | ParaShape 중복 제거 |

## 테스트 결과
- **399개 테스트 모두 통과** (기존 390 + 신규 9)
- WASM 빌드 성공
- 브라우저 테스트 완료 (서식 반영, 서식 적용, 글꼴 변경 확인)
