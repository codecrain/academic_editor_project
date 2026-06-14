# 타스크 87 — 1단계 완료보고서

## WASM API (getTableBBox, deleteTableControl) + Rust 모델

### 수정 내용

**`src/wasm_api.rs`**:
- `getTableBBox(sec, ppi, ci)` WASM 바인딩 + 네이티브 구현
  - 렌더 트리에서 Table 노드를 찾아 `{pageIndex, x, y, width, height}` JSON 반환
- `deleteTableControl(sec, ppi, ci)` WASM 바인딩 + 네이티브 구현
  - 컨트롤 배열에서 제거 + ctrl_data_records 제거
  - char_offsets 갭 조정 (직렬화와 동일 로직으로 컨트롤 위치 파악 → 후속 offset 8 감소)
  - char_count 8 감소
  - raw_stream=None → compose → paginate
- 테스트 2개 추가: `test_get_table_bbox`, `test_delete_table_control`

**`rhwp-studio/src/core/wasm-bridge.ts`**:
- `getTableBBox()` 브릿지 메서드 추가
- `deleteTableControl()` 브릿지 메서드 추가

**`src/serializer/cfb_writer.rs`**:
- `test_delete_table_control_roundtrip` 라운드트립 테스트 추가

### 검증
- Rust 테스트: 514개 전체 통과 (기존 511 + bbox 1 + delete 1 + roundtrip 1)
- WASM 빌드: 성공
- Vite 빌드: 성공
