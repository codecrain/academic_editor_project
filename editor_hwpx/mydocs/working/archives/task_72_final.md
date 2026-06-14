# 타스크 72 최종 완료 보고서

## 표 페이지 넘김 시 경계선·콘텐츠 중복 렌더링 수정

### 작업 요약

페이지 경계를 넘는 표(Table)의 경계선·콘텐츠가 클리핑 없이 그대로 렌더링되던 문제를 수정하였다. SVG·Canvas 렌더러에 본문 영역 클리핑을 추가하고, 페이지네이션에 최소 분할 임계값을 적용하여 미세 부분 행 생성을 방지하였다.

### 수정 파일

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `src/renderer/render_tree.rs` | `Body` 노드를 구조체 변형으로 변경, `clip_rect: Option<BoundingBox>` 필드 추가 | +3줄 |
| `src/renderer/svg.rs` | Body 노드에 SVG `<clipPath>` + `<g clip-path>` 적용 | +12줄 |
| `src/renderer/web_canvas.rs` | Body 노드에 Canvas `save()`/`rect()`/`clip()`/`restore()` 적용 | +8줄 |
| `src/renderer/layout.rs` | Body 노드 생성 시 `body_area`를 `clip_rect`으로 전달, `matches!` 패턴 업데이트 | +3줄 |
| `src/renderer/html.rs` | Body 매칭 패턴 `Body { .. }` 업데이트 | 1줄 |
| `src/renderer/pagination.rs` | 인트라-로우 분할 최소 콘텐츠 임계값 `MIN_SPLIT_CONTENT_PX = 10.0` 적용 | +5줄 |

### 구현 내용

#### 1. 본문 영역 클리핑 (SVG·Canvas)

- `RenderNodeType::Body`에 `clip_rect: Option<BoundingBox>` 필드 추가
- SVG: `<clipPath id="body-clip-{id}"><rect .../></clipPath>` + `<g clip-path="url(#...)">` 래핑
- Canvas: `ctx.save()` → `ctx.rect()` → `ctx.clip()` → 자식 렌더링 → `ctx.restore()`
- layout.rs에서 `body_area` 좌표를 `clip_rect`으로 자동 전달

#### 2. 인트라-로우 분할 최소 임계값

- `MIN_SPLIT_CONTENT_PX = 10.0` 상수 정의
- `avail_content > 0.0` → `avail_content >= MIN_SPLIT_CONTENT_PX` 변경 (2곳)
- 효과: 4.55px 같은 미세 부분 행 생성 방지 → 해당 행은 다음 페이지로 넘김

### 검증 결과

| 항목 | 결과 |
|------|------|
| Rust 테스트 | 488개 전체 통과 |
| WASM 빌드 | 성공 |
| Vite 빌드 | 성공 |
| hancom-webgian.hwp SVG 내보내기 | 6페이지 정상, 페이지 3 미세 부분 행 제거, clipPath 적용 |
| k-water-rfp.hwp SVG 내보내기 | 29페이지 정상, clipPath 적용 |
| 기존 문서 회귀 | 없음 |

### 작업 브랜치

`local/task72`
