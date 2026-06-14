# 타스크 17 최종 결과 보고서: 텍스트 선택 (B-301)

## 구현 내용

Canvas 기반 HWP 뷰어에서 텍스트 선택 기능을 구현하였다.

### Rust 측 (백엔드)

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/layout.rs` | `is_cjk_char()` pub(crate) 공개, `compute_char_positions()` 함수 추가 |
| `src/wasm_api.rs` | `getPageTextLayout(pageNum)` WASM 메서드 추가 |

- `compute_char_positions(text, style)`: N글자 → N+1개 X 좌표 경계값 반환
- `get_page_text_layout(page_num)`: 렌더 트리에서 TextRun 노드를 수집하여 JSON 직렬화
- JSON 형식: `{"runs":[{"text":"...","x":..,"y":..,"w":..,"h":..,"charX":[...]}]}`

### JavaScript 측 (프론트엔드)

| 파일 | 변경 내용 |
|------|-----------|
| `web/text_selection.js` | **신규** — TextLayoutManager, SelectionRenderer, SelectionController |
| `web/index.html` | `#canvas-wrapper` div + `#selection-canvas` 오버레이 캔버스 추가 |
| `web/style.css` | 오버레이 캔버스 스타일 (absolute, pointer-events: none) |
| `web/app.js` | text_selection 모듈 연동, 페이지 렌더링 후 텍스트 레이아웃 로드 |

### 주요 기능

1. **텍스트 hit-test**: 페이지 좌표 → run/char 인덱스 변환
2. **마우스 드래그 선택**: mousedown → mousemove → mouseup
3. **선택 하이라이트**: 오버레이 캔버스에 반투명 파란색 사각형
4. **클립보드 복사**: Ctrl+C / Cmd+C
5. **전체 선택**: Ctrl+A / Cmd+A
6. **더블클릭 단어 선택**: 공백 기준 단어 범위 선택
7. **줄 바뀜 감지**: 선택 텍스트에 개행 삽입

## 검증 결과

- 233개 테스트 통과
- WASM 빌드 성공
- 브라우저 테스트 필요 (수동 검증)
