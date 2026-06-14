# 타스크 103 — 완료 보고서

## 타스크명
"글 앞으로" 배치 컨트롤의 본문 밀어내기 예외 처리

## 작업 기간
2026-02-17

## 배경
HWP 편집기는 "글 앞으로"(InFrontOfText) 설정이어도 컨트롤 영역만큼 본문(표)을 아래로 밀어냄.
기존 구현은 스펙대로 `TopAndBottom`만 높이 예약하여 InFrontOfText 글상자와 표가 겹치는 문제 발생.
재현 파일: `samples/table-ipc.hwp` 1페이지 제목 글상자 "후원품 사용내역서".

## 수정 내역

### `src/renderer/layout.rs` — `calculate_shape_reserved_height()`

- 조건문 변경: `TopAndBottom`만 처리 → `TopAndBottom | InFrontOfText` 모두 처리
- 함수 주석 업데이트: HWP 편집기 예외 동작 설명 추가

```rust
// 변경 전
if common.text_wrap != TextWrap::TopAndBottom {
    continue;
}

// 변경 후
if !matches!(common.text_wrap, TextWrap::TopAndBottom | TextWrap::InFrontOfText) {
    continue;
}
```

## 검증 결과

| 항목 | 결과 |
|------|------|
| 테스트 | 564개 통과 |
| SVG 내보내기 | 표 시작 y: 113.39 → 204.09 (글상자 하단 아래로 이동) |

## 수정 파일

| 파일 | 변경 |
|------|------|
| `src/renderer/layout.rs` | `calculate_shape_reserved_height()` 조건문 1줄 + 주석 2줄 |
