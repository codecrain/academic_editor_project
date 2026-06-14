# 타스크 46 수행계획서

## 타스크: rhwp-studio 뷰어 런타임 검증 + 버그 수정

## 목표

타스크 45에서 구현한 rhwp-studio 뷰어 프로토타입의 런타임 동작을 검증하고, 코드 리뷰를 통해 식별된 버그를 수정한다.

## 현황 분석

### 프로젝트 현재 상태
- 15개 파일, TypeScript 712행 (9개 TS 파일)
- 빌드 검증 완료 (`tsc --noEmit` 통과, `vite build` 성공)
- 실제 런타임 동작 미검증 (브라우저 실행 테스트 미수행)

### 코드 리뷰 결과 식별된 문제

| 분류 | 문제 | 위치 | 심각도 |
|------|------|------|--------|
| 상태 동기화 | `setScrollTop()`이 내부 scrollY를 갱신하지 않음 → 줌 변경 시 잘못된 페이지 렌더링 | viewport-manager.ts:75-78 | 높음 |
| 렌더링 | `renderPage()`에서 WASM 렌더링 후 CSS 줌 적용 — WASM 캔버스 크기와 PageInfo 크기 불일치 가능성 | canvas-view.ts:103-122 | 중간 |
| 렌더링 | 줌 1.0→변경→1.0 복귀 시 기존 캔버스의 CSS zoom이 제거되지 않을 가능성 | canvas-view.ts:115-121 | 낮음 |
| 안정성 | `loadDocument()`에 try-catch 없음 → getPageInfo 실패 시 전체 로드 중단 | canvas-view.ts:44-62 | 중간 |
| 안정성 | DOM 요소 접근 시 `!` 단언만 사용 → 구조 변경 시 런타임 크래시 | main.ts 전반 | 낮음 |
| 메모리 | `releaseAll()` 호출 시 Map 순회 중 삭제 — ES6 스펙상 안전하나 의도 불명확 | canvas-pool.ts:36-39 | 낮음 |

## 수행 단계

### 단계 1: Vite 개발 서버 구동 및 빌드 검증 (기본 검증)

- TypeScript 타입 체크 (`tsc --noEmit`)
- Vite 빌드 (`vite build`)
- Vite 개발 서버 구동 테스트 (`vite` → 포트 바인딩 확인)
- WASM 모듈 로딩 경로 검증 (`@wasm` alias → `../pkg/` 해석 확인)

### 단계 2: 식별된 버그 수정

**2-1. ViewportManager `setScrollTop()` 상태 동기화 수정**
- `setScrollTop()` 호출 시 내부 `scrollY` 동기화
- 줌 변경 후 정확한 페이지 렌더링 보장

**2-2. CanvasView 렌더링 로직 개선**
- WASM 렌더링 후 캔버스 크기 기반 줌 적용 신뢰성 확인
- `loadDocument()`에 에러 핸들링 추가
- 줌 변경 흐름에서 `zoom-level-display` 이벤트 누락 시점 보완

**2-3. CanvasPool `releaseAll()` 안전성 개선**
- Map 순회 중 삭제 대신 키 배열 복사 후 순회

### 단계 3: 최종 검증 및 결과보고

- 수정 후 TypeScript 타입 체크
- Vite 빌드 성공 확인
- 변경 사항 정리 및 완료보고서 작성

## 산출물

| 문서 | 경로 |
|------|------|
| 수행계획서 | `mydocs/plans/task_46.md` |
| 단계별 완료보고서 | `mydocs/working/task_46_step{N}.md` |
| 최종 결과보고서 | `mydocs/working/task_46_final.md` |
