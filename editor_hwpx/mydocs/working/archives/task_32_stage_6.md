# 타스크 32 - 6단계 완료 보고서

## 단계: 서식 명령 (JavaScript)

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `web/format_toolbar.js` | 이벤트 리스너 전체 구현, 콜백 기반 서식 적용, px↔pt↔HWPUNIT 변환 |
| `web/editor.js` | handleApplyCharFormat/ParaFormat, Ctrl+B/I/U 단축키, 콜백 연결 |

## 서식 명령 구현

### 글자 서식 (선택 범위 필요)

| 기능 | 트리거 | props_json |
|------|--------|------------|
| 굵게 토글 | B 버튼 / Ctrl+B | `{"bold":true/false}` |
| 기울임 토글 | I 버튼 / Ctrl+I | `{"italic":true/false}` |
| 밑줄 토글 | U 버튼 / Ctrl+U | `{"underline":true/false}` |
| 취소선 토글 | S 버튼 | `{"strikethrough":true/false}` |
| 글자 크기 증감 | ＋/－ 버튼 | `{"fontSize":N}` (HWPUNIT) |
| 글자 크기 직접 입력 | Enter키 | `{"fontSize":N}` (HWPUNIT) |
| 글자색 | color picker | `{"textColor":"#rrggbb"}` |
| 강조색 | color picker | `{"shadeColor":"#rrggbb"}` |

### 문단 서식 (캐럿 위치 기준)

| 기능 | 트리거 | props_json |
|------|--------|------------|
| 정렬 (양쪽/왼/가/우) | 정렬 버튼 | `{"alignment":"justify/left/center/right"}` |
| 줄간격 | select 변경 | `{"lineSpacing":N,"lineSpacingType":"Percent"}` |
| 들여쓰기 | ⇨ 버튼 | `{"indent":N}` (HWPUNIT, +283/step) |
| 내어쓰기 | ⇦ 버튼 | `{"indent":N}` (HWPUNIT, -283/step) |

## 아키텍처

```
FormatToolbar                           editor.js
─────────────                          ──────────
버튼 클릭 이벤트                       handleApplyCharFormat(propsJson)
  → _applyChar(propsJson)               → getSelectionDocRange()
    → onApplyCharFormat(propsJson) ────→   → doc.applyCharFormat(...)
                                           → renderCurrentPage()
정렬 버튼 클릭                              → 캐럿 복원
  → _applyPara(propsJson)
    → onApplyParaFormat(propsJson) ────→ handleApplyParaFormat(propsJson)
                                           → getDocumentPos()
Ctrl+B/I/U 단축키                          → doc.applyParaFormat(...)
  → formatToolbar.toggleBold() ────────→   → renderCurrentPage()
```

## 단위 변환

| 변환 | 공식 |
|------|------|
| px → pt | `px * 72 / 96` |
| pt → HWPUNIT | `pt * 100` |
| HWPUNIT → px | `hwpunit * 96 / 7200` |

## 테스트 결과
- WASM 빌드 성공
- **399개 테스트 모두 통과**
