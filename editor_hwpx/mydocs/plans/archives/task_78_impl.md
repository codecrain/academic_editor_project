# 타스크 78 구현계획서: 20250130-hongbo.hwp 2페이지 이미지 2개 렌더링 누락

## 구현 개요

`parse_gso_control()`의 구버전 Group 감지 조건에서 레벨 비교를 정밀화하여, TextBox 내 인라인 컨트롤의 깊은 SHAPE_COMPONENT가 Group 자식으로 오인식되는 문제를 해결한다.

---

## 1단계: 구버전 Group 감지 조건 수정

**파일**: `src/parser/control.rs`

### 수정 위치: 332-333행

```rust
// 수정 전
if child_records[1..].iter().any(|r|
    r.tag_id == tags::HWPTAG_SHAPE_COMPONENT && r.level > first_level
) {

// 수정 후
if child_records[1..].iter().any(|r|
    r.tag_id == tags::HWPTAG_SHAPE_COMPONENT && r.level == first_level + 1
) {
```

이 수정으로:
- 직접 자식 레벨(first_level + 1)의 SHAPE_COMPONENT만 Group 감지에 사용
- TextBox 내 인라인 Picture의 깊은 레벨(first_level + 3) SHAPE_COMPONENT는 무시
- 기존 구버전 Group 파싱은 정상 동작 (자식 SHAPE_COMPONENT는 항상 first_level + 1)

**규모**: 1행 수정

---

## 2단계: parse_container_children() 방어적 레벨 필터링

**파일**: `src/parser/control.rs`

### 수정 위치: 735-741행

```rust
// 수정 전
let mut comp_indices: Vec<usize> = Vec::new();
for (i, record) in records.iter().enumerate() {
    if record.tag_id == tags::HWPTAG_SHAPE_COMPONENT {
        comp_indices.push(i);
    }
}

// 수정 후
let child_level = child_records.first().map(|r| r.level + 1).unwrap_or(0);
let mut comp_indices: Vec<usize> = Vec::new();
for (i, record) in records.iter().enumerate() {
    if record.tag_id == tags::HWPTAG_SHAPE_COMPONENT && record.level == child_level {
        comp_indices.push(i);
    }
}
```

이 수정으로:
- 실제 Group의 경우에도 직접 자식 레벨의 SHAPE_COMPONENT만 경계로 사용
- 자식 Rectangle의 TextBox 내 인라인 컨트롤 SHAPE_COMPONENT가 경계로 잘못 사용되는 것 방지

**규모**: ~3행 수정

---

## 3단계: 회귀 테스트 + 빌드 검증

**파일**: `src/wasm_api.rs`

### 테스트 1: 2페이지 사각형 내 이미지 2개 렌더링

```rust
#[test]
fn test_task78_rectangle_textbox_inline_images() {
    // 20250130-hongbo.hwp 2페이지에서
    // para[25]의 GSO 컨트롤이 Rectangle로 파싱되고
    // TextBox 내 인라인 Picture 2개가 렌더링되는지 검증
}
```

### 빌드 검증

1. `docker compose --env-file /dev/null run --rm test` — 전체 테스트 통과
2. SVG 내보내기: `20250130-hongbo.hwp` 2페이지 이미지 2개 확인
3. WASM 빌드 + Vite 빌드 + 웹 브라우저 검증

**규모**: 테스트 ~30줄

---

## 수정 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `src/parser/control.rs` | Group 감지 조건 레벨 비교 정밀화 (1곳) + parse_container_children 레벨 필터링 (1곳) | ~4줄 |
| `src/wasm_api.rs` | 회귀 테스트 추가 | ~30줄 |
