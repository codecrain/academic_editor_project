# 타스크 78 수행계획서: 20250130-hongbo.hwp 2페이지 이미지 2개 렌더링 누락

## 배경

`samples/20250130-hongbo.hwp` 2페이지에 이미지 2개가 렌더링되어야 하나 1개만 표시된다.

### 문서 구조 (2페이지 해당 부분)

문단 25에 GSO 컨트롤(사각형)이 있으며, 실제 구조는:

```
GSO Control (treat_as_char=true, w=25698, h=3736)
└─ Rectangle
   └─ TextBox
      └─ Paragraph (오른쪽 정렬)
         ├─ 인라인 Picture 1 (bin_data_id=4)
         └─ 인라인 Picture 2
```

### 현재 렌더링

| 기대 | 실제 |
|------|------|
| 사각형 안에 이미지 2개 | 이미지 1개만 렌더링 (bin_data_id=4, 66×23px) |

### 근본 원인

`parse_gso_control()` (control.rs:332-334)에서 **그룹 컨테이너 오인식** 발생:

```rust
// 구버전 Group 감지 조건
if child_records[1..].iter().any(|r|
    r.tag_id == tags::HWPTAG_SHAPE_COMPONENT && r.level > first_level
) {
    is_container = true;  // ← 잘못된 Group 감지!
}
```

**문제 메커니즘**:

1. 이 GSO 컨트롤은 **TextBox가 있는 Rectangle**
2. TextBox 문단에 인라인 Picture 컨트롤 2개가 포함됨
3. 각 인라인 Picture의 하위 레코드에 `SHAPE_COMPONENT`(level 5)가 존재
4. `r.level > first_level` 조건에 의해 이 깊은 레벨의 SHAPE_COMPONENT가 Group의 자식으로 오인식
5. `is_container = true` → `parse_container_children()` 호출
6. 인라인 Picture의 SHAPE_COMPONENT가 자식 경계로 잘못 사용됨
7. 결과: Group(children=[Picture(bid=4), Rectangle(textbox=None)]) 로 잘못 파싱됨

**레코드 구조 검증**:

```
child_records:
  SHAPE_COMPONENT (level 2)   ← 사각형 자체 (base_level)
  LIST_HEADER (level 3)       ← Rectangle TextBox (오인식으로 무시됨)
  PARA_HEADER (level 3)       ← TextBox 문단
  ...문단 내용...
  CTRL_HEADER (level 4)       ← 1번째 인라인 Picture
  SHAPE_COMPONENT (level 5)   ← ★ 이것이 Group 자식으로 오인식됨
  SHAPE_PICTURE (level 6)
  CTRL_HEADER (level 4)       ← 2번째 인라인 Picture
  SHAPE_COMPONENT (level 5)   ← ★ 이것도 Group 자식으로 오인식됨
  SHAPE_PICTURE (level 6)
  SHAPE_RECTANGLE (level 3)   ← 실제 사각형 정의
```

## 목표

`parse_gso_control()`의 구버전 Group 감지 조건을 수정하여, TextBox 내 인라인 컨트롤의 깊은 레벨 SHAPE_COMPONENT가 Group 자식으로 오인식되지 않도록 한다.

## 수행 범위

1. **파서 수정**: `is_container` 감지 조건의 레벨 비교를 `> first_level`에서 `== first_level + 1`로 변경
2. **방어적 보강**: `parse_container_children()`의 SHAPE_COMPONENT 인덱스 수집에도 레벨 필터링 추가
3. 기대 결과: GSO가 Rectangle으로 올바르게 파싱되어 TextBox 내 인라인 Picture 2개가 렌더링됨
4. 회귀 테스트 추가 및 검증
