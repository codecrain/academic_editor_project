# 타스크 52 수행계획서: 서식 변경 (글꼴/크기/굵게/기울임)

## 개요

- **타스크**: B-307. 서식 변경 (글꼴/크기/굵게/기울임)
- **브랜치**: `local/task52`
- **선행 타스크**: 타스크 51 (복사/붙여넣기) 완료

## 목표

한컴 웹기안기(webhwp)와 동일한 인터페이스의 편집 도구 모음(style_bar)을 구축하고, 선택 범위에 글자 서식(글꼴/크기/굵게/기울임/밑줄/취소선/글자색)을 적용하는 기능을 구현한다.

## 범위

### 포함
- 서식 도구 모음 UI (`#style-bar`) — 한컴 웹기안기 style_bar와 유사한 레이아웃
  - 글꼴 선택 드롭다운
  - 글자 크기 입력 + 증감 버튼
  - 굵게(B)/기울임(I)/밑줄(U)/취소선(S) 토글 버튼
  - 글자색 선택 (color picker)
  - 문단 정렬 버튼 (왼쪽/가운데/오른쪽/양쪽)
  - 구분선(vertical separator)으로 그룹 구분
- 단축키: Ctrl+B (굵게), Ctrl+I (기울임), Ctrl+U (밑줄)
- 선택 범위에 CharShape 적용 (본문 + 셀 내부)
- 커서 위치 서식 상태 자동 조회 → 도구 모음 상태 동기화
- ApplyCharFormatCommand + Undo/Redo 통합

### 제외
- 문단 서식 상세 (줄 간격, 들여쓰기 등)
- 글머리 기호/번호 매기기
- 스타일(문단 스타일) 기능
- 그리기 도형 서식

## 기존 자산

Rust WASM 측에 CharShape API가 이미 완전히 구현되어 있음:
- `getCharPropertiesAt(sec, para, offset)` → JSON `{fontFamily, fontSize, bold, italic, underline, strikethrough, textColor, charShapeId}`
- `getCellCharPropertiesAt(...)` — 셀 내 동일
- `applyCharFormat(sec, para, start, end, propsJson)` — 범위에 서식 적용
- `applyCharFormatInCell(...)` — 셀 내 동일
- `findOrCreateFontId(name)` — 글꼴 ID 조회/생성
- JSON 포맷: `{"bold":true, "italic":true, "fontSize":2400, "fontId":5, "textColor":"#FF0000"}`

참고 리소스:
- `mydocs/tech/webhwp_examples/` — 한컴 웹기안기 UI 리소스 (HTML, CSS, SVG 아이콘)

## 구현 단계

| 단계 | 내용 | 주요 파일 |
|------|------|-----------|
| 1단계 | 툴바 UI 구축 (HTML + CSS) | index.html, style.css |
| 2단계 | Toolbar TypeScript 모듈 + EventBus 연동 | ui/toolbar.ts (신규), main.ts |
| 3단계 | WasmBridge 래퍼 + ApplyCharFormatCommand | wasm-bridge.ts, types.ts, command.ts |
| 4단계 | InputHandler 연동 (단축키 + 서식 상태 조회) | input-handler.ts |
| 5단계 | 글꼴 목록 + 색상 피커 + 정렬 | toolbar.ts, wasm-bridge.ts |

## 산출물

- 수정 파일 7개 (index.html, style.css, types.ts, wasm-bridge.ts, command.ts, input-handler.ts, main.ts)
- 신규 파일 1개 (ui/toolbar.ts)
- 추가 줄 수 예상: +500줄 내외
