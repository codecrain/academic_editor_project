# Task 211 구현 계획서

## 핵심 원인

**height_measurer와 table_layout 간 비-인라인 이미지 높이 반영 불일치**

| 모듈 | 비-인라인 이미지 높이 | 결과 |
|------|----------------------|------|
| `height_measurer.rs` (L443) | **미반영** — `content_height = text_height` | 행 높이(row_height)가 작게 산정 |
| `table_layout.rs` (L1000-1009) | **반영** — `text_height += pic_h` | total_content_height는 정확하나, 셀 clip 영역이 작아서 이미지 잘림 |

셀 높이(cell_h)는 height_measurer가 산정한 row_height에서 결정되므로, height_measurer에서 비-인라인 이미지 높이를 누락하면 셀이 작게 잡혀 이미지가 clip 바깥으로 밀려남.

## 1단계: height_measurer 비-인라인 이미지 높이 반영

**파일**: `src/renderer/height_measurer.rs`

### 수정 1: measure_table_impl 셀 높이 계산 (L443 부근)

현재:
```rust
// LINE_SEG의 line_height에 이미 셀 내 중첩 표 높이가 반영되어 있으므로
// controls_height를 별도로 더하면 이중 계산됨
let content_height = text_height;
```

수정 후:
```rust
// LINE_SEG의 line_height에 이미 셀 내 중첩 표 높이가 반영되어 있으므로
// controls_height를 별도로 더하면 이중 계산됨
// 단, 비-인라인 이미지/도형은 LINE_SEG에 미포함이므로 별도 합산
let non_inline_height = self.measure_non_inline_controls_height(paragraphs);
let content_height = text_height + non_inline_height;
```

### 수정 2: 비-인라인 컨트롤 높이 측정 함수 추가

```rust
/// 문단들 내 비-인라인(treat_as_char가 아닌) 그림/도형의 높이 합계
fn measure_non_inline_controls_height(&self, paragraphs: &[Paragraph]) -> f64 {
    let mut total = 0.0;
    for para in paragraphs {
        for ctrl in &para.controls {
            match ctrl {
                Control::Picture(pic) if !pic.common.treat_as_char => {
                    total += hwpunit_to_px(pic.common.height as i32, self.dpi);
                }
                Control::Shape(shape) if !shape.common().treat_as_char => {
                    total += hwpunit_to_px(shape.common().height as i32, self.dpi);
                }
                _ => {}
            }
        }
    }
    total
}
```

## 2단계: 테스트 및 SVG 검증

- `cargo test` — 기존 테스트 PASS 확인
- SVG export로 kps-ai.hwp p61 시각적 확인 (이미지 표시 여부)
- 다른 문서들 회귀 테스트 (hwpp-001.hwp 등)

## 3단계: WASM 빌드 및 E2E 검증

- Docker WASM 빌드
- E2E 테스트로 웹 렌더링 확인
- 오늘할일 상태 갱신
