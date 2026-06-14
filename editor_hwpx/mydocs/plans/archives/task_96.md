# 타스크 96 수행계획서

## 타스크명
객체 묶음(Container/Group) 렌더링 구현

## 배경

KTX.hwp의 독도 영역은 `[묶음] children=7` 그룹 도형으로 구성되어 있다.
- 그룹 위치: 가로=115.0mm, 세로=68.0mm, 크기=17.5mm × 20.6mm
- child[0~5]: 독도 다각형 6개 (offset 음수 포함, 회전각 23~24도)
- child[6]: 사각형 테두리 (offset=0,0)

**현재 문제**: 그룹의 자식 도형 좌표를 `base_x + render_tx`로 계산하고 있어, 그룹 로컬 좌표계 → 페이지 좌표계 변환이 정확하지 않다. 독도 폴리곤이 사각형 바깥에 렌더링됨.

## hwplib 참조

- `ControlContainer.java` — 자식 컨트롤을 `ArrayList<GsoControl>`로 관리
- `ShapeComponent.java` — `offsetX/Y`: "개체가 속한 그룹 내에서의 X/Y offset"
- `ShapeComponentContainer.java` — 컨테이너 전용 속성 (childControlIdList)

hwplib 코드가 스펙 문서보다 우선 참조 대상.

## 분석 결과

### 현재 렌더링 로직 (layout.rs:4391-4418)

```rust
// 현재: 평탄화 방식
let child_x = base_x + hwpunit_to_px(child_shape_attr.render_tx as i32, self.dpi);
let child_y = base_y + hwpunit_to_px(child_shape_attr.render_ty as i32, self.dpi);
let child_w = hwpunit_to_px((original_width * render_sx.abs()) as i32, self.dpi);
let child_h = hwpunit_to_px((original_height * render_sy.abs()) as i32, self.dpi);
```

### 문제점

1. `render_tx/ty`는 아핀 변환 합성 결과이지, 그룹 내 상대 좌표가 아님
2. 그룹 자체의 좌표 원점(`base_x, base_y`)에서 자식의 상대 위치를 올바르게 계산하지 못함
3. 그룹의 `shape_attr` (스케일, 오프셋)이 자식에 전파되지 않음

### 독도 그룹 좌표 분석

```
그룹: 위치=(32607, 19274) HU, 크기=(4950, 5850) HU
  child[6] 사각형: offset=(0,0), orig=(5700,7350), curr=(4950,5850), scale=(0.868,0.796)
  child[0] 다각형: offset=(3229,-4683), orig=(236,224), scale=(5.264,5.419)
```

- 사각형은 그룹 원점(0,0)에서 시작, 그룹 크기와 동일하게 축소
- 다각형은 그룹 로컬 좌표계에서 offset=(3229,-4683) 위치
- render_tx/ty에 그룹의 변환이 이미 합성되어 있을 가능성 → 실측 필요

## 구현 계획

### 단계 1: 그룹 좌표 변환 분석 및 렌더링 수정

1. KTX.hwp 독도 그룹의 각 자식 render_tx/ty 실측 출력
2. 그룹 원점 + offset vs render_tx/ty 비교 분석
3. 올바른 좌표 변환 공식 도출
4. `layout.rs` 그룹 렌더링 로직 수정
5. SVG 내보내기로 검증

### 단계 2: 빌드 및 검증

1. 테스트 통과 확인
2. WASM 빌드
3. Vite 빌드
4. 웹 Canvas 렌더링 확인

## 수정 예상 파일

| 파일 | 수정 내용 |
|------|----------|
| `src/renderer/layout.rs` | 그룹 자식 좌표 변환 로직 수정 |
| `src/main.rs` | 디버그 출력 (필요시) |

## 브랜치

`local/task96`
