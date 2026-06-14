# 타스크 69 구현 계획서

## 1단계: PageAreas::from_page_def() 여백 계산 수정

**수정 파일**: `src/model/page.rs`

변경 전:
```rust
let content_top = page_def.margin_top;
let content_bottom = page_height - page_def.margin_bottom;
```

변경 후:
```rust
// HWP 본문 시작 = margin_top + margin_header (한컴 도움말 기준)
let content_top = page_def.margin_top + page_def.margin_header;
// HWP 본문 끝 = height - margin_bottom - margin_footer
let content_bottom = page_height - page_def.margin_bottom - page_def.margin_footer;
```

header_area / footer_area도 정합성 맞춤:
```rust
let header_area = Rect {
    left: content_left as i32,
    top: page_def.margin_header as i32,           // 머리말 시작
    right: content_right as i32,
    bottom: content_top as i32,                    // 머리말 끝 = 본문 시작
};

let footer_area = Rect {
    left: content_left as i32,
    top: content_bottom as i32,                    // 꼬리말 시작 = 본문 끝
    right: content_right as i32,
    bottom: (page_height - page_def.margin_footer) as i32,  // 꼬리말 끝
};
```

## 2단계: 기존 테스트 수정 및 검증

**수정 파일**: `src/model/page.rs` (테스트), `src/renderer/page_layout.rs` (테스트)

- 기존 테스트의 기대값을 새로운 여백 계산에 맞게 수정
- 새 테스트 추가: margin_top + margin_header = content_top 검증

## 3단계: SVG 렌더링 검증 + 전체 테스트

- `docker compose --env-file /dev/null run --rm test` — 전체 테스트 통과 확인
- `hwp-multi-001.hwp` SVG 내보내기 — 본문 시작 y좌표가 ~94.5px인지 확인
- 기존 샘플 문서 렌더링 회귀 없음 확인

## 수정 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `src/model/page.rs` | content_top/content_bottom 계산 수정 + 테스트 | ~10줄 |
