# 타스크 79 최종 결과보고서: 표 투명선 보여주기

## 수행 결과 요약

표의 `BorderLineType::None`(선 없음) 테두리를 **빨간색 점선**으로 표시하는 투명선 토글 기능을 구현하였다. 문단 부호(`show_paragraph_marks`) 토글과 동일한 아키텍처 패턴을 따른다.

## 구현 내용

### 1단계: WASM API 플래그 및 메서드 추가

| 항목 | 내용 |
|------|------|
| 파일 | `src/wasm_api.rs` |
| 변경 | `HwpDocument`에 `show_transparent_borders: bool` 필드 추가 |
| 변경 | `setShowTransparentBorders(enabled)` WASM 메서드 추가 |
| 변경 | `build_page_tree()` 호출 시 LayoutEngine에 플래그 전달 |

### 2단계: 레이아웃 엔진 - 투명 테두리 렌더링

| 항목 | 내용 |
|------|------|
| 파일 | `src/renderer/layout.rs` |
| 변경 | `LayoutEngine`에 `show_transparent_borders: Cell<bool>` 필드 추가 |
| 변경 | `render_transparent_borders()` 함수 신규 추가 (~60줄) |
| 동작 | Edge Grid에서 `None` 슬롯을 찾아 빨간색(0x0000FF BGR) 점선(Dot) 0.4px Line 노드 생성 |
| 적용 | 4개 `render_edge_borders()` 호출 후 조건부 호출 |

### 3단계: 프론트엔드 - 메뉴/버튼 연결

| 항목 | 내용 |
|------|------|
| rhwp-studio | `view:border-transparent` 커맨드 구현 (disabled → active 토글) |
| rhwp-studio | `wasm-bridge.ts`에 `setShowTransparentBorders()` 메서드 추가 |
| rhwp-studio | `index.html` 메뉴 항목 `disabled` 클래스 제거 |
| web/editor | 투명선 토글 버튼 + 이벤트 핸들러 추가 |

### 4단계: 회귀 테스트 + 빌드 검증

| 항목 | 결과 |
|------|------|
| 테스트 | `test_task79_transparent_border_lines` 추가, 5개 샘플 파일 검증 |
| 전체 테스트 | 494개 전체 통과 |
| WASM 빌드 | 성공 |
| Vite 빌드 | 성공 |

## 테스트 결과

```
samples/table-001.hwp:                  OFF=16 ON=32 (+16) has_none_border=true
samples/hwp_table_test.hwp:             OFF=31 ON=32 (+1)  has_none_border=true
samples/table-complex.hwp:              OFF=29 ON=56 (+27) has_none_border=true
samples/hwpers_test4_complex_table.hwp: OFF=0  ON=0  (+0)  has_none_border=true
samples/table-ipc.hwp:                  OFF=27 ON=32 (+5)  has_none_border=true
```

- `table-001.hwp`: 투명 테두리만 있는 표 → 16개 투명선 추가 (정상)
- `table-complex.hwp`: 복합 표 → 27개 투명선 추가 (정상)
- `hwpers_test4_complex_table.hwp`: 첫 페이지에 표 없음 → 0 (정상)

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/wasm_api.rs` | 플래그, 메서드, 전달 로직, 테스트 추가 |
| `src/renderer/layout.rs` | Cell<bool> 플래그, `render_transparent_borders()` 함수, 4개 호출점 |
| `rhwp-studio/src/command/commands/view.ts` | `view:border-transparent` 커맨드 구현 |
| `rhwp-studio/src/core/wasm-bridge.ts` | `setShowTransparentBorders()` 메서드 |
| `rhwp-studio/index.html` | 메뉴 항목 활성화 |
| `web/editor.html` | 투명선 토글 버튼 UI |
| `web/editor.js` | 투명선 토글 로직 |

## 동작 흐름

```
[사용자] 보기 → 투명 선 클릭
    ↓
[rhwp-studio] view:border-transparent 커맨드 실행
    ↓ services.wasm.setShowTransparentBorders(true)
[WASM API] HwpDocument.show_transparent_borders = true
    ↓ services.eventBus.emit('document-changed')
[build_page_tree()] layout_engine.show_transparent_borders ← doc.show_transparent_borders
    ↓
[레이아웃 엔진] render_transparent_borders() 호출
    ↓ Edge Grid의 None 슬롯 → 빨간색 점선 Line 노드 생성
[Canvas 렌더러] 빨간색 점선 렌더링
```

## 완료일

2026-02-15
