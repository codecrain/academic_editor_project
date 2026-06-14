# 타스크 92 — 도형 렌더링 변환(scale/offset/rotation) 적용

## 배경

KTX.hwp (다단 노선도 문서) 테스트 중 도형 렌더링 오류 발견.
직선, 다각형 등의 내부 좌표(start/end, points)가 원본 좌표계 그대로 렌더링되어 크기/위치가 잘못됨.

## 근본 원인

### 문제 1: 도형 내부 좌표에 스케일 미적용

도형의 내부 좌표(Line의 start/end, Polygon의 points, Curve의 points)는 **원본(original) 좌표계**에 정의되어 있다. 그러나 렌더링 시 이 좌표를 그대로 `hwpunit_to_px()`로 변환하여 사용하고 있어, 실제 표시 크기(common.width/height)와 불일치가 발생한다.

**KTX.hwp 첫번째 직선 예시:**
- `common.width = 36000` (127mm) — 실제 표시 크기
- `shape_attr.original_width = 54356` — 원본 좌표계 크기
- `line.start = (0, 79)`, `line.end = (54356, 0)` — 원본 좌표계
- `shape_attr.render_sx = 0.662` (= 36000 / 54356)
- **현재**: end.x = 54356 → 192mm로 렌더링 (원본 크기)
- **정상**: end.x = 54356 × 0.662 = 36000 → 127mm로 렌더링 (표시 크기)

### 문제 2: 묶음(Group) 자식 도형의 내부 좌표 스케일

묶음 내 자식 도형의 위치(render_tx/ty)와 크기(current_width × render_sx)는 적용되지만, 자식 도형의 **내부 좌표**(다각형 꼭짓점 등)에는 스케일이 적용되지 않는다.

### 영향 범위

| 도형 종류 | 내부 좌표 | 영향 |
|-----------|----------|------|
| Line | start, end | 선 길이/방향 오류 |
| Polygon | points[] | 다각형 형태 오류 |
| Curve | points[] | 곡선 형태 오류 |
| Rectangle | (좌표 없음, BoundingBox만 사용) | 영향 없음 |
| Ellipse | (BoundingBox만 사용) | 영향 없음 |
| Arc | (BoundingBox만 사용) | 영향 없음 |

## 수정 방향

도형 내부 좌표를 렌더링할 때 원본 좌표계 → 표시 좌표계 스케일링을 적용한다:

```
scale_x = common.width / shape_attr.original_width
scale_y = common.height / shape_attr.original_height
```

묶음 자식의 경우 `common.width == 0`이므로:
```
scale_x = (current_width × render_sx) / original_width
scale_y = (current_height × render_sy) / original_height
```

## 검증 대상

- `samples/basic/KTX.hwp` — 직선 2개 (127mm, 150mm) + 다각형 다수 + 묶음 개체
- `samples/basic/treatise sample.hwp` — 기존 정상 렌더링 유지 확인
- 기존 테스트 전체 통과 확인
