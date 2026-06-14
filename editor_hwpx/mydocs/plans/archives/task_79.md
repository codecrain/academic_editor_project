# 타스크 79 수행계획서: 표 투명선 보여주기

## 배경

HWP에서 표나 글상자의 선 종류를 "선 없음"으로 지정하면 편집/인쇄 시 선이 보이지 않는다. 한컴오피스는 `보기-표시/숨기기-투명 선` 기능으로 이런 투명 테두리를 **빨간색 점선**으로 표시하여 편집을 돕는다.

### 현재 동작

- `BorderLineType::None`인 테두리는 렌더링에서 완전히 생략됨
  - `merge_edge_slot()` (layout.rs:4637): None 타입 스킵
  - `create_border_line_nodes()` (layout.rs:4796): 빈 벡터 반환
- rhwp-studio에 "투명 선" 메뉴 항목이 이미 존재하나 **미구현** 상태
  - `view:border-transparent` 커맨드: `canExecute: () => false`, `execute() { /* TODO */ }`
  - index.html: `<div class="md-item disabled">투명 선</div>`

### 투명선 스펙 (HWP 도움말 참고)

| 항목 | 내용 |
|------|------|
| 대상 | 선 종류가 "선 없음"(BorderLineType::None)인 표/글상자 테두리 |
| 표시 방식 | **빨간색 점선** (고정, 사용자 변경 불가) |
| 제어 | 보기 메뉴 토글 (보기-표시/숨기기-투명 선) |
| 인쇄 | 인쇄되지 않음 (편집 화면 전용) |

### 참고 패턴: 문단 부호 토글

| 항목 | 문단 부호 | 투명선 (구현 예정) |
|------|-----------|-------------------|
| WASM 플래그 | `show_paragraph_marks: bool` | `show_transparent_borders: bool` |
| WASM 메서드 | `setShowParagraphMarks(enabled)` | `setShowTransparentBorders(enabled)` |
| 렌더러 전달 | `renderer.show_paragraph_marks` | `renderer.show_transparent_borders` |
| 커맨드 ID | `view:para-mark` | `view:border-transparent` |

## 목표

1. 투명선 토글 기능 구현 (보기 메뉴 → 전역 토글 → 렌더링 반영)
2. 토글 ON 시 페이지 내 모든 표의 `BorderLineType::None` 테두리를 빨간색 점선으로 렌더링
3. 토글 OFF 시 기존 동작 유지 (투명 테두리 비표시)

## 현재 아키텍처 (문단 부호 기준)

```
[rhwp-studio] view:para-mark 커맨드
    ↓ services.wasm.setShowParagraphMarks(true)
[WASM API] HwpDocument.show_paragraph_marks = true
    ↓ services.eventBus.emit('document-changed')
[렌더러] renderer.show_paragraph_marks = true
    ↓ renderPageToCanvas() 호출
[Canvas 렌더러] 문단 끝에 ¶ 기호 추가 렌더링
```

## 구현 전략

투명선도 동일한 경로로 구현한다:

```
[rhwp-studio] view:border-transparent 커맨드
    ↓ services.wasm.setShowTransparentBorders(true)
[WASM API] HwpDocument.show_transparent_borders = true
    ↓ services.eventBus.emit('document-changed')
[레이아웃 엔진] create_border_line_nodes()에서 None 타입 처리 변경
    ↓ show_transparent_borders = true일 때
    ↓ None 테두리 → 빨간색 점선 Line 노드 생성 (기존: 빈 벡터 반환)
[Canvas/SVG 렌더러] 빨간색 점선 Line 노드 정상 렌더링
```

### 핵심 포인트

- **레이아웃 엔진 수준**에서 처리: `create_border_line_nodes()`가 `show_transparent_borders` 플래그를 확인
- None 테두리를 빨간색(#FF0000) 점선(Dot) 0.4px Line 노드로 변환
- `merge_edge_slot()`의 None 스킵 로직도 조건부 처리 필요 (None이면 edge grid에서 빠지므로)

## 수행 범위

1. **WASM API**: `show_transparent_borders` 플래그 + `setShowTransparentBorders()` 메서드 추가
2. **레이아웃 엔진**: 투명 테두리 → 빨간색 점선 Line 노드 생성 로직 추가
3. **rhwp-studio**: `view:border-transparent` 커맨드 구현 및 메뉴 활성화
4. **web/editor.js**: 투명선 토글 버튼 추가 (문단부호 버튼과 동일 패턴)
5. 회귀 테스트 추가 및 빌드 검증

## 테스트 검증 계획

- 투명 테두리가 있는 표가 포함된 샘플 HWP 파일로 검증
- 토글 ON 시 빨간색 점선 표시, OFF 시 비표시 확인
- 기존 표 렌더링 (스타일 있는 테두리) 회귀 없음 확인
- 기존 테스트 전체 통과 확인
