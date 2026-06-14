# Task 210 수행계획서

## 제목
kps-ai.hwp p61 중첩 표(treat_as_char) 문단 가운데 정렬 미반영

## 현상
- **파일**: kps-ai.hwp, 61페이지 ("개인정보 수집·이용·제공 동의 양식")
- **구조**: 표 > 셀 > 표(글자처럼, treat_as_char)
- **문제**: 셀 내 문단 정렬이 "가운데"로 설정되어 있으나, 중첩된 treat_as_char 표가 왼쪽 정렬로 렌더링됨
- **한컴 동작**: 가운데 정렬 적용됨 (정상)

## 원인 분석

셀 내 문단의 컨트롤(중첩 표)을 렌더링할 때, `layout_table()` 호출에 `Alignment::Left`가 하드코딩되어 있음.

### 버그 위치 (3곳)

1. **`src/renderer/layout/table_layout.rs`** (~line 1298)
   - `layout_cell_content()`에서 중첩 표를 `layout_table()`로 전달 시 `Alignment::Left` 하드코딩

2. **`src/renderer/layout/table_partial.rs`** (~line 771, ~line 822)
   - 분할 표의 셀 콘텐츠 렌더링에서도 동일하게 `Alignment::Left` 하드코딩

### 수정 방안
`Alignment::Left` → 문단의 실제 정렬값(`para_alignment`)으로 교체

`para_alignment`은 이미 해당 스코프에서 계산되어 있음:
```rust
let para_alignment = styles.para_styles
    .get(para.para_shape_id as usize)
    .map(|s| s.alignment)
    .unwrap_or(Alignment::Left);
```

## 영향 범위
- 셀 내부에 treat_as_char 표가 있고 문단 정렬이 Left가 아닌 모든 경우
- 기존 Left 정렬 표는 영향 없음 (기본값이 Left이므로)

## 검증 방법
1. `cargo test` — 기존 684개 테스트 PASS 확인
2. SVG export로 kps-ai.hwp p61 시각적 확인
3. E2E 테스트(호스트 Chrome CDP)로 웹 렌더링 확인
