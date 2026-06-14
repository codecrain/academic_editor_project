# 타스크 70 구현 계획서

## 검증 대상: `samples/hwp-multi-001.hwp` (Footer 컨트롤 포함)

## 1단계: 페이지네이션 — 머리말/꼬리말 수집 및 페이지 할당

**수정 파일**: `src/renderer/pagination.rs`

### 변경 내용

`PageContent`의 `header_paragraphs`/`footer_paragraphs` 타입을 인덱스 벡터 대신
실제 Header/Footer 참조 정보로 변경:

```rust
/// 한 페이지에 배치될 콘텐츠
pub struct PageContent {
    // ... 기존 필드 유지
    /// 이 페이지에 적용할 머리말 (None이면 머리말 없음)
    pub active_header: Option<HeaderFooterRef>,
    /// 이 페이지에 적용할 꼬리말 (None이면 꼬리말 없음)
    pub active_footer: Option<HeaderFooterRef>,
}

/// 머리말/꼬리말 참조
pub struct HeaderFooterRef {
    pub para_index: usize,        // Header/Footer 컨트롤이 있는 문단 인덱스
    pub control_index: usize,     // 해당 문단 내 컨트롤 인덱스
}
```

`paginate_with_measured()` 시작 시:
1. 전체 문단에서 `Control::Header` / `Control::Footer` / `Control::PageNumberPos` / `Control::PageHide` 수집
2. 각 페이지 생성 시 현재 활성 머리말/꼬리말 결정 (Both/Even/Odd + 페이지 번호)
3. `PageContent` 생성 시 `active_header`/`active_footer` 할당

### 활성 머리말/꼬리말 결정 로직
- 문단 순서대로 순회하며 Header/Footer 컨트롤을 만나면 "활성 머리말/꼬리말" 갱신
- 각 페이지 생성 시: 페이지 번호(1-based)가 홀수/짝수인지 판단
- `apply_to == Both` → 항상 적용
- `apply_to == Odd` → 홀수 페이지만 적용
- `apply_to == Even` → 짝수 페이지만 적용
- PageHide.hide_header/hide_footer → 해당 페이지에서 비활성화

## 2단계: 레이아웃 — Header/Footer 노드에 문단 콘텐츠 배치

**수정 파일**: `src/renderer/layout.rs`

### 변경 내용

`build_render_tree()`에서:

```rust
// 기존: 빈 Header 노드
let header_node = RenderNode::new(header_id, RenderNodeType::Header, ...);

// 변경: active_header가 있으면 문단 레이아웃 수행
let mut header_node = RenderNode::new(header_id, RenderNodeType::Header, ...);
if let Some(hf_ref) = &page_content.active_header {
    if let Some(Control::Header(header)) = paragraphs[hf_ref.para_index]
        .controls.get(hf_ref.control_index)
    {
        self.layout_header_footer_paragraphs(
            &mut tree, &mut header_node,
            &header.paragraphs, styles, &layout.header_area,
            page_content.page_index,
        );
    }
}
```

꼬리말도 동일 패턴. `layout_header_footer_paragraphs()`는 기존 `layout_paragraph()`를 재사용하되,
header_area/footer_area 영역 내에서 배치.

### 쪽 번호 텍스트 생성

머리말/꼬리말 문단 텍스트에 `\x0012` (필드 시작) 문자가 포함되어 있으면,
해당 위치를 현재 페이지 번호 텍스트로 치환.

PageNumberPos 컨트롤의 position 값에 따라:
- 위치 1~3: header_area (왼쪽/가운데/오른쪽 위)
- 위치 4~6: footer_area (왼쪽/가운데/오른쪽 아래)
- format: 0=아라비아, 1=로마대문자, 2=로마소문자 등

## 3단계: 테스트 및 검증

- `docker compose --env-file /dev/null run --rm test` — 전체 테스트 통과
- `hwp-multi-001.hwp` SVG 내보내기 — 꼬리말/쪽 번호 렌더링 확인
- WASM + Vite 빌드 성공 확인
- 기존 문서 렌더링 회귀 없음

## 수정 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `src/renderer/pagination.rs` | PageContent에 active_header/footer 할당 로직 | ~50줄 |
| `src/renderer/layout.rs` | Header/Footer 노드에 문단 배치 + 쪽 번호 | ~80줄 |
