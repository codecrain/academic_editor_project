# 타스크 157 수행계획서: 글상자 삽입 및 기본 편집

## 1. 개요

### 목표
사용자가 rhwp-studio 에디터에서 글상자를 생성·선택·이동·크기조절·텍스트편집·속성변경할 수 있도록 한다.

### 배경
현재 rhwp는 기존 HWP 파일의 글상자를 파싱·렌더링·텍스트편집까지 지원하지만, 새 글상자를 생성하거나 개체로서 선택·이동·크기조절하는 기능이 없다. 글상자는 HWP 문서에서 본문과 독립적으로 텍스트를 배치하는 핵심 개체로, 다단 제목, 박스형 요약글, 서식 있는 레이아웃 등에 필수적이다.

### 범위

| 포함 | 제외 (타스크 158, 159) |
|------|----------------------|
| 마우스 드래그로 글상자 생성 | 테두리 선 종류/굵기/색 변경 |
| 단축키 삽입 (D/S/A/V/C/X/Z) | 면 채우기 (색/그라데이션/그림) |
| 글상자 선택/이동/크기조절 | 세로쓰기/영문 눕힘·세움 |
| 글상자 내 텍스트 편집 | 회전 (90도 단위) |
| 개체 속성 대화상자 글상자 탭 | 도형→글상자 변환 |
| WASM API (생성/삭제/속성) | 글상자 연결 (overflow 이어짐) |
| Undo/Redo | 하이퍼링크/묶기/풀기 |

## 2. 현재 상태

| 기능 | 상태 | 비고 |
|------|------|------|
| HWP 파싱 | 완료 | Rectangle/Ellipse/Polygon/Curve + TextBox 파싱 |
| 데이터 모델 | 완료 | TextBox 구조체 (여백, 세로정렬, 문단 리스트) |
| 렌더링 | 완료 | 텍스트 레이아웃, 세로정렬, overflow 연결 |
| 커서 진입/편집 | 완료 | isTextBox 플래그, enterTextBox/exitTextBox |
| 글상자 생성 | 미구현 | insert.ts에 stub만 존재 |
| 개체 선택/이동/크기조절 | 그림만 | input-handler-picture.ts 패턴 재활용 가능 |
| 속성 대화상자 | 그림만 | picture-props-dialog.ts 패턴 재활용 가능 |
| WASM 속성 API | 그림만 | getShape/setShape API 신규 필요 |

## 3. 기술 설계

### 3.1 글상자 데이터 구조 (기존)

```
Control::Shape
  └── CommonObjAttr (위치, 크기, 배치방식)
  └── ShapeObject::Rectangle
       └── DrawingObjAttr
            ├── ShapeComponentAttr (변환)
            ├── ShapeBorderLine (테두리)
            ├── Fill (채우기)
            └── TextBox (Optional)
                 ├── vertical_align (위/가운데/아래)
                 ├── margin_left/right/top/bottom
                 ├── max_width
                 └── paragraphs: Vec<Paragraph>
```

### 3.2 생성 플로우

```
[메뉴: 입력-개체-글상자] 또는 [도구상자 글상자 버튼]
    → 마우스 커서 십자(+) 전환
    → 마우스 드래그 (시작점~끝점)
    → WASM: createShapeControl(secIdx, paraIdx, charOffset, width, height, wrapType)
    → Rust: Control::Shape + Rectangle + TextBox(빈 문단) 생성
    → 문서 모델 삽입 → 레이아웃 재계산 → 렌더링
    → 커서가 글상자 내부로 진입 → 텍스트 입력 대기
```

### 3.3 선택/이동/크기조절 패턴

기존 `input-handler-picture.ts`의 그림 선택 패턴을 확장:
- `getPageControlLayout()`에 shape 타입 추가
- hit-test에서 shape bbox 검사
- 선택 시 8방향 핸들 렌더링
- 드래그로 이동 (horzOffset/vertOffset 변경)
- 핸들 드래그로 크기조절 (width/height 변경)

### 3.4 WASM API 설계

| API | 용도 |
|-----|------|
| `createShapeControl(json)` | 글상자 생성 (위치, 크기, 배치방식) |
| `getShapeProperties(sec, ppi, ci)` | 속성 조회 (JSON) |
| `setShapeProperties(sec, ppi, ci, json)` | 속성 변경 |
| `deleteShapeControl(sec, ppi, ci)` | 삭제 |

## 4. 구현 단계

| 단계 | 내용 | 주요 파일 |
|------|------|----------|
| 1단계 | WASM API + Rust 백엔드 | wasm_api.rs, shape_ops.rs, shape.rs |
| 2단계 | 선택/이동/크기조절 UI | input-handler-picture.ts, command.ts |
| 3단계 | 생성 UI (드래그 + 단축키) | insert.ts, input-handler-mouse.ts |
| 4단계 | 속성 대화상자 글상자 탭 | picture-props-dialog.ts 또는 신규 |

## 5. 검증 계획

- 전체 테스트 통과 (docker test)
- WASM 빌드 성공 (docker wasm)
- UI 수동 테스트:
  - 글상자 생성 → 텍스트 입력 → 저장 → 재열기
  - 선택/이동/크기조절 → Undo/Redo
  - 기존 글상자 HWP 파일 렌더링 회귀 없음
  - 속성 대화상자에서 여백/정렬 변경 반영

## 6. 일정

4단계 × 각 단계별 구현-보고 사이클
