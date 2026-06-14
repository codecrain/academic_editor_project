# 타스크 72 구현 계획서

## 표 페이지 넘김 시 경계선·콘텐츠 중복 렌더링 수정

### 검증 대상: `samples/hancom-webgian.hwp` (표 페이지 넘김), `samples/k-water-rfp.hwp` (기존 회귀)

---

## 1단계: SVG·Canvas 렌더러에 콘텐츠 영역 클리핑 추가

**수정 파일**: `src/renderer/render_tree.rs`, `src/renderer/svg.rs`, `src/renderer/web_canvas.rs`

### 변경 내용

#### render_tree.rs — Body 노드에 clip_rect 필드 추가

`RenderNodeType::Body`에 `clip_rect: Option<BoundingBox>` 필드 추가. 콘텐츠 영역 경계로 클리핑.

#### svg.rs — SVG clipPath 적용

`render_node()`에서 Body 노드 처리 시 `<clipPath>` + `<g clip-path>` 래핑.

#### web_canvas.rs — Canvas clip() 적용

`render_node()`에서 Body 노드 처리 시 `ctx.save()` → `ctx.rect()` → `ctx.clip()` → 자식 렌더링 → `ctx.restore()`.

---

## 2단계: layout.rs에서 Body 노드에 클리핑 정보 전달

**수정 파일**: `src/renderer/layout.rs`

### 변경 내용

`build_render_tree()`에서 Body 노드 생성 시 `col_area` 좌표를 `clip_rect`으로 설정.

---

## 3단계: 페이지네이션 최소 임계값 추가 + 빌드 검증

**수정 파일**: `src/renderer/pagination.rs`

### 변경 내용

인트라-로우 분할 시 `avail_content > 0.0` → `avail_content >= MIN_SPLIT_CONTENT_PX (10.0)` 최소 임계값 적용.

### 빌드 검증

1. `docker compose --env-file /dev/null run --rm test` — 전체 테스트 통과
2. `docker compose --env-file /dev/null run --rm wasm` — WASM 빌드
3. `cd rhwp-studio && npx vite build` — Vite 빌드
4. SVG 내보내기 시각적 확인

---

## 수정 파일 요약

| 파일 | 변경 | 규모 |
|------|------|------|
| `src/renderer/render_tree.rs` | Body 노드에 clip_rect 필드 추가 | ~5줄 |
| `src/renderer/svg.rs` | Body 노드 클리핑 (clipPath) | ~15줄 |
| `src/renderer/web_canvas.rs` | Body 노드 클리핑 (ctx.clip()) | ~10줄 |
| `src/renderer/layout.rs` | Body 노드 생성 시 clip_rect 전달 | ~5줄 |
| `src/renderer/pagination.rs` | 인트라-로우 분할 최소 임계값 | ~3줄 |
