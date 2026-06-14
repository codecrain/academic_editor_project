# 타스크 44 단계 1 완료보고서

## 단계: 현재 아키텍처 분석 + rhwp-studio 프로젝트 설계

## 수행 내용

### 1. 6개 레이아웃 모듈 심층 분석

현재 rhwp 코어의 6개 핵심 모듈을 소스 코드 수준에서 분석 완료:

| 모듈 | 파일 | 줄 수 | 분석 항목 |
|------|------|-------|----------|
| Composer | composer.rs | 1,067 | 문단→줄→TextRun 분할, 다국어 분리, reflow_line_segs |
| HeightMeasurer | height_measurer.rs | 486 | 문단/표/각주 높이 측정, 셀 내용 기반 행 높이 |
| Paginator | pagination.rs | 935 | 2-패스 페이지네이션, 표 행 분할, 다단 지원 |
| LayoutEngine | layout.rs | 5,017 | 렌더 트리 생성, 표/도형/각주 레이아웃, 텍스트 폭 측정 |
| RenderTree | render_tree.rs | 405 | 렌더 노드 구조, dirty flag, BoundingBox |
| WASM API | wasm_api.rs | 16,395 | 60+ 공개 메서드, 편집/서식/클립보드/표 조작 |

### 2. 재활용 범위 평가

| 모듈 | 재활용 등급 | 설명 |
|------|-----------|------|
| RenderTree | ★★★★★ | 완전 재사용. dirty flag 포함 |
| Composer | ★★★★☆ | compose_paragraph, reflow_line_segs 재사용. 증분 API 추가 필요 |
| HeightMeasurer | ★★★☆☆ | 높이 측정 로직 재사용. 증분 측정 API 추가 필요 |
| LayoutEngine | ★★★☆☆ | 표/도형/텍스트 측정 재사용. 좌표 체계 확장 필요 |
| Paginator | ★★☆☆☆ | PageItem 구조 재사용. 증분 페이지네이션 신규 구현 필요 |
| WASM API | ★★☆☆☆ | 편집 로직 재사용. Command 패턴으로 분리 필요 |

### 3. 편집기 관점 Gap 9개 식별

최상 심각도: 커서 시스템 부재, 히트 테스팅 부재
높음 심각도: 증분 Compose/Paginate, Command 패턴, 연속 스크롤 좌표, 선택 모델, IME 조합

### 4. rhwp-studio 프로젝트 구조 설계

- 5개 주요 모듈: engine(편집 엔진), view(캔버스 뷰), compat(HwpCtrl 호환), ui(편집기 UI), core(WASM 브릿지)
- TypeScript + Vite 기술 스택
- WASM 연동: 기존 pkg/ 산출물 직접 사용 + 4단계 점진적 확장 계획
- Docker Compose 빌드 체계 확장

## 산출물

| 문서 | 경로 | 내용 |
|------|------|------|
| 설계서 Section 1 | `mydocs/plans/task_44_architecture.md` §1 | 현재 아키텍처 분석 (6개 모듈별 역할/한계/재활용/리팩터링) |
| 설계서 Section 2 | `mydocs/plans/task_44_architecture.md` §2 | rhwp-studio 프로젝트 구조 (디렉토리, 모듈, 빌드, WASM 연동) |

## 다음 단계

단계 2: 레이아웃 엔진 설계 (TextFlow / BlockFlow / PageFlow)
- 3계층 플로우 엔진 설계
- 증분 레이아웃 전략 (dirty flag, 영향 범위 계산)
- 연속 스크롤 캔버스 뷰 설계
