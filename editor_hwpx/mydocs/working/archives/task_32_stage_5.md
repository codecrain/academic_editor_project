# 타스크 32 - 5단계 완료 보고서

## 단계: 속성 반영 (JavaScript)

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `web/format_toolbar.js` | 새 파일: FormatToolbar 클래스 (DOM 캐시, WASM 속성 조회, UI 갱신) |
| `web/text_selection.js` | SelectionController에 `onCaretChange` 콜백 필드 추가 + 3곳에서 발화 |
| `web/editor.js` | FormatToolbar import + 전역 인스턴스 + 문서 로드 시 표시 + 캐럿 변경 연동 |

## FormatToolbar 클래스 설계

| 메서드 | 설명 |
|--------|------|
| `constructor(toolbarEl)` | DOM 요소 캐시 (font, size, B/I/U/S, colors, align, spacing) |
| `show()` / `hide()` | 서식 툴바 표시/숨기기 |
| `update(doc, docPos)` | WASM API 호출 → 글자/문단 속성 조회 → UI 갱신 |
| `_queryCharProps(doc, docPos)` | 본문/셀 분기 → getCharPropertiesAt / getCellCharPropertiesAt |
| `_queryParaProps(doc, docPos)` | 본문/셀 분기 → getParaPropertiesAt / getCellParaPropertiesAt |
| `_updateCharUI(props)` | 글꼴/크기/B/I/U/S/색상 반영 |
| `_updateParaUI(props)` | 정렬/줄간격 반영 |

## onCaretChange 콜백 발화 위치

| 위치 | 트리거 |
|------|--------|
| `_setCaretPos(pos)` | 캐럿 이동 (Arrow, Home, End, 문서 좌표 복원) |
| `_onMouseDown` (TextRun 히트) | 마우스 클릭으로 캐럿 배치 |

## 데이터 흐름

```
캐럿 이동/클릭
  → SelectionController.onCaretChange()
    → selectionController.getDocumentPos()
      → {secIdx, paraIdx, charOffset, [cellCtx]}
    → formatToolbar.update(doc, docPos)
      → doc.getCharPropertiesAt(sec, para, offset)
      → doc.getParaPropertiesAt(sec, para)
      → UI 갱신 (font, size, bold, italic, alignment, ...)
```

## 테스트 결과
- WASM 빌드 성공
- **399개 테스트 모두 통과**
