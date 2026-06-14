# 타스크 157 — 1단계 완료보고서

## 단계 목표

글상자(Shape) 생성/삭제/속성 조회·변경 WASM API 및 Rust 백엔드 구현

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/model/shape.rs` | `ShapeObject`에 `common_mut()`, `drawing()`, `drawing_mut()` 메서드 추가 |
| `src/renderer/render_tree.rs` | `RectangleNode`에 `section_index`, `para_index`, `control_index` 필드 추가 |
| `src/renderer/layout/shape_layout.rs` | Shape용 RectangleNode 생성 시 실제 문서 좌표 설정 |
| `src/renderer/layout/table_layout.rs` | 배경 RectangleNode에 None 좌표 설정 |
| `src/renderer/layout/paragraph_layout.rs` | 글자/문단 배경 RectangleNode에 None 좌표 설정 (2곳) |
| `src/renderer/layout/table_cell_content.rs` | 셀 배경 RectangleNode에 None 좌표 설정 |
| `src/wasm_api/queries/rendering.rs` | `getPageControlLayout()`에 shape 타입 컬렉션 추가 |
| `src/wasm_api/commands/object_ops.rs` | 6개 네이티브 함수 추가 |
| `src/wasm_api.rs` | 4개 WASM 바인딩 함수 추가 |

## 추가된 API

### WASM 바인딩 (JavaScript에서 호출 가능)

| API | JS 이름 | 설명 |
|-----|---------|------|
| `create_shape_control(json)` | `createShapeControl` | 커서 위치에 글상자 삽입 |
| `get_shape_properties(sec, para, ctrl)` | `getShapeProperties` | 글상자 속성 조회 |
| `set_shape_properties(sec, para, ctrl, json)` | `setShapeProperties` | 글상자 속성 변경 |
| `delete_shape_control(sec, para, ctrl)` | `deleteShapeControl` | 글상자 삭제 |

### 네이티브 함수 (object_ops.rs)

| 함수 | 용도 |
|------|------|
| `common_obj_attr_to_json()` | CommonObjAttr → JSON 직렬화 (그림/글상자 공용) |
| `apply_common_obj_attr_from_json()` | JSON → CommonObjAttr 역직렬화 (그림/글상자 공용) |
| `get_shape_properties_native()` | 공통 속성 + TextBox 여백/정렬 + 테두리 조회 |
| `set_shape_properties_native()` | 속성 변경 + ShapeComponentAttr 크기 동기화 + Rectangle 좌표 동기화 |
| `delete_shape_control_native()` | char_offsets 조정 + 컨트롤 제거 + 리플로우 |
| `create_shape_control_native()` | Rectangle + TextBox 구조 생성 + 문단 삽입 + 리플로우 |

### ShapeObject 메서드 (shape.rs)

| 메서드 | 반환 타입 | 설명 |
|--------|----------|------|
| `common_mut()` | `&mut CommonObjAttr` | 공통 속성 가변 참조 |
| `drawing()` | `Option<&DrawingObjAttr>` | 그리기 속성 참조 (Group/Picture는 None) |
| `drawing_mut()` | `Option<&mut DrawingObjAttr>` | 그리기 속성 가변 참조 (Group/Picture는 None) |

### getPageControlLayout 확장

기존 `picture`/`table` 타입에 `shape` 타입 추가:
```json
{"type":"shape","x":100.0,"y":200.0,"w":300.0,"h":150.0,"secIdx":0,"paraIdx":5,"controlIdx":0}
```

## 글상자 기본 속성 (한컴 기본값 참조)

| 속성 | 기본값 |
|------|--------|
| 테두리 | 검정(0x000000), 0.4mm (283 HWPUNIT) |
| TextBox 여백 | 좌/우 510, 상/하 141 HWPUNIT |
| 세로 정렬 | 위 (Top) |
| 외부 여백 (margin) | 상하좌우 283 HWPUNIT (~1mm) |
| 위치 기준 | 세로=문단, 가로=단 |

## 검증 결과

| 항목 | 결과 |
|------|------|
| `docker compose --env-file .env.docker run --rm test` | **608 passed, 0 failed** |
| `docker compose --env-file .env.docker run --rm wasm` | **빌드 성공** (pkg/ 생성) |
| 기존 기능 회귀 | 없음 (모든 기존 테스트 통과) |

## 기술 결정 사항

1. **RectangleNode 문서 좌표**: Shape용 Rectangle과 배경용 Rectangle을 구별하기 위해 `Option<usize>` 필드 사용 — 배경은 None, Shape은 Some(인덱스)
2. **공용 헬퍼 함수**: `common_obj_attr_to_json()`과 `apply_common_obj_attr_from_json()`을 그림/글상자 공용으로 분리하여 코드 중복 방지
3. **createShapeControl JSON 파라미터**: 파라미터 수가 많으므로 JSON 단일 파라미터로 전달 (기존 createTable과 달리)
