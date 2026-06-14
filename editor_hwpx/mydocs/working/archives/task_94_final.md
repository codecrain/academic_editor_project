# 타스크 94 최종 결과 보고서

## 타스크명
개체 위치/정렬 속성 파싱 및 렌더링 수정

## 작업 기간
2026-02-16 (다수 세션에 걸쳐 진행)

## 수정 내역

### 1. TextBox vpos 기반 문단 수직 위치
- TextBox 내부 문단의 수직 정렬을 vpos(vertical position) 속성 기반으로 계산

### 2. TextBox LIST_HEADER para_count UINT16 → UINT32
- TextBox의 LIST_HEADER 레코드에서 para_count 필드를 UINT16에서 UINT32로 수정

### 3. Paper 기준 도형 body-clip 밖 렌더링
- `horz_rel_to == Paper || vert_rel_to == Paper`인 도형을 body clip 영역 바깥에 렌더링
- 기존에 body clip 내부에만 그려져 도형이 잘리는 문제(체크마크 크롭 등) 해결

### 4. 이미지 채우기 유형(fill_mode) 렌더링 구현
- **파서 수정** (`doc_info.rs`): fill_mode 매핑을 0-3 → 0-15 전체로 확장 (HWP 스펙 표 33 기반)
- **렌더 트리 확장** (`render_tree.rs`): `ImageNode`에 `fill_mode`, `original_size` 필드 추가
- **레이아웃 엔진** (`layout.rs`): ImageNode 생성 시 fill_mode와 original_size(HWPUNIT 기반) 전달
- **SVG 렌더러** (`svg.rs`):
  - `render_image_node()`: fill_mode별 분기
  - `render_positioned_image()`: 원본 크기로 지정 위치에 배치 + 클리핑
  - `render_tiled_image()`: SVG `<pattern>` 기반 타일링
- **Canvas 렌더러** (`web_canvas.rs`):
  - `draw_image_with_fill_mode()`: Canvas 클리핑 + 위치/타일링 처리
- **지원 채우기 유형 (16가지)**:
  - 크기에 맞추어 (FitToSize)
  - 배치 모드 9가지: 왼쪽위/가운데위/오른쪽위, 왼쪽가운데/가운데/오른쪽가운데, 왼쪽아래/가운데아래/오른쪽아래
  - 바둑판식 5가지: 모두/가로위/가로아래/세로왼쪽/세로오른쪽
  - None (채우기 없음)

### 5. 채우기 배경색 + 이미지 동시 적용
- **원인**: `drawing_to_shape_style()`에서 `fill_type == Image`이면 배경색을 무시
- **근본 원인**: HWP의 `fill_type_val`은 비트마스크(bit0=Solid, bit1=Image)로 둘이 동시 존재 가능
- **수정**: `fill_type`과 무관하게 `solid` 필드가 존재하면 배경색 적용

## 수정 파일 (8개, +695 -67)

| 파일 | 수정 내용 |
|------|----------|
| `src/parser/doc_info.rs` | fill_mode 0-15 전체 매핑 |
| `src/parser/control.rs` | 도형 파서 개선 |
| `src/model/shape.rs` | ShapeObject 도우미 메서드 추가 |
| `src/renderer/render_tree.rs` | ImageNode에 fill_mode, original_size 추가 |
| `src/renderer/layout.rs` | fill_mode 전달, 배경색+이미지 동시 적용, Paper 기준 렌더링 |
| `src/renderer/svg.rs` | fill_mode별 이미지 렌더링 (배치/타일링/크기맞춤) |
| `src/renderer/web_canvas.rs` | Canvas fill_mode별 이미지 렌더링 |
| `src/main.rs` | dump 채우기 정보 출력 개선 |

## 검증 결과

- Rust 테스트: 532개 통과, 0개 실패
- Native 빌드: 성공
- WASM 빌드: 성공
- Vite 빌드: 성공
- SVG 내보내기: BookReview.hwp 정상 출력 확인
- 웹 Canvas: 정상 렌더링 확인

## 브랜치
- 작업 브랜치: `local/task94`
- main 머지: 완료
