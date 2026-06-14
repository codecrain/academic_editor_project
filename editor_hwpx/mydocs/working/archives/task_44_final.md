# 타스크 44 최종 결과보고서

## 타스크: 편집 엔진 아키텍처 설계

## 개요

rhwp 뷰어를 웹 기반 편집기(rhwp-studio)로 확장하기 위한 **10개 섹션의 아키텍처 설계서**를 작성하였다. 현재 배치형 렌더링 파이프라인을 증분형 편집 파이프라인으로 전환하는 전체 청사진을 수립하였다.

## 수행 단계

| 단계 | 작업 내용 | 산출물 |
|------|----------|--------|
| **1** | 현재 아키텍처 분석 + rhwp-studio 프로젝트 설계 | Section 1, 2 |
| **2** | 레이아웃 엔진 설계 (TextFlow/BlockFlow/PageFlow) | Section 3, 4, 5 |
| **3** | 커서/선택/입력 시스템 설계 | Section 6, 7 |
| **4** | Undo/Redo + WASM 확장 + 리팩터링 계획 | Section 8, 9, 10 |

## 설계서 구조 (10개 섹션)

```
mydocs/plans/task_44_architecture.md
├── §1. 현재 아키텍처 분석
│     ├── 6개 모듈별 역할/한계/재활용 범위 (★1~5 등급)
│     └── 편집기 관점 Gap 9개 식별
├── §2. rhwp-studio 프로젝트 구조
│     ├── 5개 모듈 디렉토리 레이아웃
│     ├── WASM 4단계 점진적 연동 계획
│     └── Docker Compose 빌드 체계
├── §3. 플로우 엔진 (TextFlow / BlockFlow / PageFlow)
│     ├── 3계층 구조 및 TypeScript 인터페이스
│     ├── HWP 특수 케이스 7가지 처리 방안
│     └── 플로팅 도형/표/각주 처리
├── §4. 증분 레이아웃 엔진
│     ├── 4단계 Dirty 전파 전략
│     ├── 영향 범위 계산 알고리즘
│     ├── 4계층 레이아웃 캐시 구조
│     └── 성능 예산 ~12ms/16ms (60fps)
├── §5. 연속 스크롤 캔버스 뷰
│     ├── 가상 스크롤 + Canvas 풀링
│     ├── 3단계 좌표 체계 (문서/페이지/뷰포트)
│     └── 줌, 캐럿 자동 스크롤
├── §6. 커서 모델
│     ├── CursorContext 상태 머신 (5가지 컨텍스트)
│     ├── 커서 이동 28+ 타입 (문자/줄/문단/페이지/셀)
│     ├── preferredX 유지 패턴
│     └── 4단계 히트 테스팅 파이프라인
├── §7. 선택/입력 시스템
│     ├── 선택 모델 3종 (범위/셀 블록/개체)
│     ├── InputHandler + 단축키 매핑
│     ├── IME 한글 조합 3단계 처리
│     ├── Hidden textarea 전략
│     └── 캐럿 렌더링 (DOM 오버레이, 블링크)
├── §8. 명령 히스토리 (Undo/Redo)
│     ├── EditCommand 인터페이스 (execute/undo/mergeWith)
│     ├── 14개 명령 유형 상세 구현
│     ├── CompoundCommand (복합 명령)
│     ├── 연속 타이핑 300ms 묶기 전략
│     └── IME 조합과 Undo 통합
├── §9. WASM 코어 확장 계획
│     ├── 현재 API 현황 (101개, 12카테고리)
│     ├── 신규 29개 API (4-Phase 점진적)
│     ├── Rust 코어 수정 범위
│     └── 호환성 보장 전략
└── §10. 기존 코드 리팩터링 계획
      ├── 5개 모듈별 변경 상세
      ├── EditState 증분 렌더링 컨텍스트
      ├── 뷰어 호환성 100% 유지
      ├── 4-Phase 마이그레이션 (5~6주)
      └── 테스트 전략 + 성능 목표
```

## 핵심 설계 결정

### 1. 아키텍처
- **TypeScript 편집 엔진 + Rust WASM 코어** 이중 구조
- Rust: 문서 모델 + 레이아웃 (성능/정확성), TypeScript: 대화형 편집 (반응성/브라우저 통합)
- WASM Bridge: JSON 기반 직렬화

### 2. 성능
- **16ms 프레임 예산**: 전체 파이프라인 ~12ms로 60fps 달성
- **증분 레이아웃**: TextFlow O(1) → BlockFlow 조건부 → PageFlow 안정 페이지 중단
- **캐시 4계층**: paragraphFlows → blockLayouts → pageLayouts → renderTrees

### 3. 편집 모델
- **CursorContext 상태 머신**: 5개 컨텍스트 간 명확한 전환 규칙
- **Command 패턴**: 14개 명령 유형, 역연산 기반 Undo/Redo
- **연속 타이핑 묶기**: 300ms 기반, IME 조합은 compositionend만 기록

### 4. 호환성
- **기존 뷰어 코드 변경 없음**: 모든 리팩터링은 추가 기반
- **기존 WASM API 불변**: 101개 메서드 시그니처 100% 유지
- **점진적 확장**: 4-Phase로 29개 API 추가

## 산출물 목록

| 문서 | 경로 | 내용 |
|------|------|------|
| **아키텍처 설계서** | `mydocs/plans/task_44_architecture.md` | 10개 섹션 완전 설계서 |
| 수행 계획서 | `mydocs/plans/task_44.md` | 타스크 수행 계획 |
| 구현 계획서 | `mydocs/plans/task_44_impl.md` | 4단계 구현 계획 |
| 단계 1 완료보고 | `mydocs/working/task_44_step1.md` | 현재 아키텍처 분석 결과 |
| 단계 2 완료보고 | `mydocs/working/task_44_step2.md` | 레이아웃 엔진 설계 결과 |
| 단계 3 완료보고 | `mydocs/working/task_44_step3.md` | 커서/선택/입력 설계 결과 |
| 단계 4 완료보고 | `mydocs/working/task_44_step4.md` | Undo/Redo+WASM+리팩터링 결과 |

## 분석 대상 소스 코드

| 파일 | 줄 수 | 분석 항목 |
|------|-------|----------|
| `src/renderer/composer.rs` | 1,067 | 문단 구성, 줄바꿈, TextRun 분할 |
| `src/renderer/height_measurer.rs` | 486 | 높이 측정, 표 행 높이 |
| `src/renderer/pagination.rs` | 935 | 2-pass 페이지네이션, 표 분할 |
| `src/renderer/layout.rs` | 5,017 | 렌더 트리, 텍스트 폭 측정, 좌표 계산 |
| `src/renderer/render_tree.rs` | 405 | 렌더 노드, dirty flag, BoundingBox |
| `src/renderer/scheduler.rs` | ~300 | 렌더 스케줄링, 뷰포트 관리 |
| `src/wasm_api.rs` | 16,395 | 101개 공개 메서드, 편집 흐름 |
| `src/model/paragraph.rs` | ~600 | 문단 모델, UTF-16 매핑, 편집 메서드 |
| `src/model/control.rs` | ~200 | 컨트롤 열거형, 인라인 제어 |
| `src/model/document.rs` | ~150 | 문서 모델, DocProperties |
