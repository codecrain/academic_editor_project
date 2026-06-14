# 타스크 88 구현계획서: 표 구조 변경 후 저장 시 HWP 파일 손상 수정

## 구현 단계 (3단계)

### 단계 1: Cell::new_from_template() 수정

**파일**: `src/model/table.rs`

- `has_para_text: false` 설정 (빈 셀은 PARA_TEXT 불필요)
- `char_count: 1` 명시적 설정 (HWP 끝 마커 포함)

**변경 전**:
```rust
char_count: tpl_para.char_count.min(1),
has_para_text: tpl_para.has_para_text,
```

**변경 후**:
```rust
char_count: 1,
has_para_text: false,
```

### 단계 2: Paragraph::new_empty() 수정

**파일**: `src/model/paragraph.rs`

- `char_count: 1` (끝 마커 포함)
- 기본 `LineSeg` 추가 (`tag: 0x00060000` HWP 기본 플래그)

**변경 전**:
```rust
pub fn new_empty() -> Self {
    Paragraph {
        char_count: 0,
        ..Default::default()
    }
}
```

**변경 후**:
```rust
pub fn new_empty() -> Self {
    Paragraph {
        char_count: 1,
        line_segs: vec![LineSeg {
            text_start: 0,
            tag: 0x00060000,
            ..Default::default()
        }],
        ..Default::default()
    }
}
```

### 단계 3: 검증 테스트 작성 및 빌드

**파일**: `src/wasm_api.rs`

- 테스트 `test_table_modification_empty_cell_serialization` 추가
- 행 추가 후 저장 → 재파싱 → 빈 셀 문단 검증:
  - cc=0 위반 없음
  - PARA_TEXT 불필요 생성 없음
  - PARA_LINE_SEG 존재 확인
- 기존 테스트 `test_cell_new_empty` 기대값 수정 (cc=0 → cc=1)
- 전체 Rust 테스트 통과 확인
- WASM 빌드 + Vite 빌드 확인
