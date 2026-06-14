# 타스크 74: 개체 묶기(Group Shape) 파싱 및 렌더링 구현

## 배경

HWP의 "개체 묶기"(그리기 개체 > 묶음)는 여러 개체(그림, 도형 등)를 하나의 그룹으로 묶어 함께 이동/크기 조절하는 기능이다. 현재 코드에서는 그룹 내 자식이 도형(Line, Rectangle 등)인 경우만 파싱하고, **그림(Picture)이 자식인 경우를 처리하지 않아** 그림이 누락되거나 잘못된 사각형으로 렌더링된다.

### 문제 분석

| 위치 | 문제 |
|------|------|
| `model/shape.rs:266` | `GroupShape.children: Vec<ShapeObject>` — Picture를 포함할 수 없음 |
| `parser/control.rs:724-736` | `parse_container_children()`에서 PICTURE 태그 미처리 → 기본 빈 Rectangle 생성 |
| `renderer/layout.rs:3741-3749` | Group 자식 렌더링 시 ShapeObject 타입만 매칭, Picture 없음 |

### 검증 대상

- `samples/hwp-multi-001.hwp` 2페이지 하단: 3개 이미지 그룹 (bin_data 3,4,5)

---

## 구현 계획

### 1단계: 모델 확장 — ShapeObject에 Picture 변형 추가

**수정 파일**: `src/model/shape.rs`

`ShapeObject` enum에 `Picture` 변형 추가:
```rust
pub enum ShapeObject {
    Line(LineShape),
    Rectangle(RectangleShape),
    Ellipse(EllipseShape),
    Arc(ArcShape),
    Polygon(PolygonShape),
    Curve(CurveShape),
    Group(GroupShape),
    Picture(Box<crate::model::image::Picture>),  // 추가
}
```

이렇게 하면 `GroupShape.children: Vec<ShapeObject>`에 Picture를 자연스럽게 포함할 수 있다.

**영향 범위**: `ShapeObject`를 match하는 모든 코드에 `Picture` 분기 추가 필요. 컴파일러가 non-exhaustive match 경고로 모든 위치를 알려줌.

### 2단계: 파서 수정 — 그룹 자식으로 Picture 파싱

**수정 파일**: `src/parser/control.rs`

`parse_container_children()` 함수 수정:

1. **도형 태그 매칭에 PICTURE 추가** (724-736줄):
```rust
tags::HWPTAG_SHAPE_COMPONENT_PICTURE => {
    shape_tag_id = Some(record.tag_id);
    shape_tag_data = &record.data;
}
```

2. **도형 생성 매칭에 Picture 분기 추가** (762-805줄):
```rust
Some(tags::HWPTAG_SHAPE_COMPONENT_PICTURE) => {
    let picture = parse_picture(
        CommonObjAttr::default(),  // 그룹 자식은 common이 비어있음
        attr,                       // shape_attr에서 크기/위치 정보
        shape_tag_data,
    );
    ShapeObject::Picture(Box::new(picture))
}
```

### 3단계: 렌더러 수정 — Group 내 Picture 렌더링

**수정 파일**: `src/renderer/layout.rs`

1. **`layout_shape_object()`에서 ShapeObject::Picture 처리** (3617-3777):
   - Picture 변형에 대한 새로운 분기 추가
   - 기존 `layout_picture()` 함수 재사용하여 이미지 렌더링

2. **Group 자식 매칭에 Picture 추가** (3741-3749):
```rust
ShapeObject::Picture(pic) => (&pic.common, None),
```
   - Picture의 shape_attr에서 offset_x, offset_y로 좌표 결정

3. **기타 ShapeObject 매칭 코드**: 컴파일러가 지적하는 모든 `match ShapeObject` 블록에 Picture 분기 추가 (info 커맨드의 main.rs 포함)

### 4단계: 빌드 및 검증

1. `docker compose --env-file /dev/null run --rm test` — 전체 테스트 통과
2. `samples/hwp-multi-001.hwp` SVG 내보내기 → 2페이지에 3개 이미지 렌더링 확인
3. 기존 `samples/hwp-img-001.hwp` SVG 내보내기 → 기존 그림 렌더링 정상 확인 (회귀 없음)

---

## 수정 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `src/model/shape.rs` | ShapeObject에 Picture 변형 추가 | ~3줄 |
| `src/parser/control.rs` | parse_container_children()에 PICTURE 파싱 추가 | ~15줄 |
| `src/renderer/layout.rs` | Group 내 Picture 렌더링 + 전체 ShapeObject match 보완 | ~30줄 |
| `src/main.rs` | info 커맨드 ShapeObject match에 Picture 추가 | ~5줄 |
| 기타 (serializer 등) | ShapeObject match exhaustive 처리 | ~10줄 |
