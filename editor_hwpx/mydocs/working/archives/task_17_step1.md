# 타스크 17 - 1단계 완료 보고서: Rust 글자별 위치 계산 API

## 변경 사항

### `src/renderer/layout.rs`
1. `is_cjk_char()` 가시성을 `fn` → `pub(crate) fn`으로 변경
2. `compute_char_positions(text, style) -> Vec<f64>` 함수 추가
   - N글자 → N+1개 경계값 반환 (0번째는 0.0)
   - CJK 문자: font_size, 라틴 문자: font_size * 0.5
   - ratio(장평), letter_spacing 반영

### `src/wasm_api.rs`
1. `get_page_text_layout(page_num)` WASM 메서드 추가 (JS name: `getPageTextLayout`)
2. `get_page_text_layout_native()` 네이티브 구현 추가
   - `build_page_tree()` 호출 후 렌더 트리 재귀 순회
   - TextRun 노드의 bbox, text, charX(글자별 위치 경계값)를 JSON으로 직렬화
   - JSON 특수문자 이스케이프 처리

### JSON 출력 형식
```json
{"runs":[{"text":"Hello","x":100.0,"y":50.0,"w":40.0,"h":16.0,"charX":[0.0,6.0,12.0,18.0,24.0,30.0]},...]}
```

## 검증 결과
- 233개 테스트 통과
- WASM 빌드 성공
