# 타스크 44 단계 4 완료보고서

## 단계: Undo/Redo + WASM 확장 + 리팩터링 계획 + 설계서 완성

## 수행 내용

### 1. 명령 히스토리 설계 (Section 8)

#### Command 패턴 인터페이스
- `EditCommand` 인터페이스: `execute()`, `undo()`, `mergeWith()`, `description`, `timestamp`
- `EditContext`: WASM 브릿지 + 레이아웃 엔진 + 커서 매니저 + dirty 추적기
- `CommandResult`: 성공 여부 + 새 커서 위치 + 영향 문단 목록

#### 14개 명령 유형 상세 설계
| 카테고리 | 명령 | 역연산 |
|----------|------|--------|
| 텍스트 | InsertText, DeleteText | 상호 역연산 |
| 문단 구조 | SplitParagraph, MergeParagraph | 상호 역연산 |
| 서식 | ApplyCharFormat, ApplyParaFormat | 이전 서식 복원 |
| 표 | InsertTableRow/Column, MergeTableCells, SplitTableCell | 역연산 |
| 복합 | PasteContent, DeleteSelection, InsertControl, DeleteControl | CompoundCommand |

#### 연속 타이핑 묶기 전략
- **병합 조건**: 같은 유형 + 같은 문단 + 연속 위치 + 300ms 이내
- **중단 조건**: 타이핑 정지 300ms, 커서 이동, 서식 변경, Enter
- **IME 통합**: compositionupdate는 Undo 미기록, compositionend만 Command로 기록

#### CommandHistory 관리
- Undo/Redo 스택 (최대 1000개)
- 저장 시점 마킹 (`markSaved()` / `isModified()`)
- CompoundCommand로 다중 동작을 단일 Undo 단위로 묶기

### 2. WASM 코어 확장 계획 (Section 9)

#### 현재 API 현황 분석
- 전체 101개 공개 메서드 (WASM 64 + Native 49)
- 12개 카테고리로 분류 완료
- 편집기에 필요하지만 부재한 기능 식별

#### 4단계(Phase) 확장 계획

| Phase | API 수 | 핵심 내용 |
|-------|--------|----------|
| **Phase 1** 기본 편집 보강 | 7개 | getTextRange, getParagraphLength 등 |
| **Phase 2** 증분 레이아웃 | 6개 | recomposeParagraph, paginate_from 등 |
| **Phase 3** 커서/히트 테스팅 | 6개 | hitTest, getCursorRect 등 |
| **Phase 4** 고급 편집 | 10개 | searchText, replaceText, 필드/북마크 등 |

총 **29개 신규 API** 추가 계획 (기존 101개 → 130개)

#### Rust 코어 수정 범위
- wasm_api.rs: API 메서드 추가만 (기존 변경 없음)
- composer.rs: 캐시 지원 함수 추가
- pagination.rs: 증분 페이지네이션 `paginate_from()` 추가
- height_measurer.rs: `measure_paragraph()` public 전환
- model/paragraph.rs: 유틸 메서드 추가

### 3. 기존 코드 리팩터링 계획 (Section 10)

#### 모듈별 리팩터링 상세

| 모듈 | 변경 내용 | 난이도 | 위험도 |
|------|----------|--------|--------|
| **Composer** | 캐시 래퍼 추가 (`compose_paragraph_cached`) | ★☆☆☆☆ | ★☆☆☆☆ |
| **HeightMeasurer** | 가시성 전환 + 캐시 래퍼 | ★★☆☆☆ | ★☆☆☆☆ |
| **Paginator** | 증분 페이지네이션 `paginate_from()` 신규 | ★★★★☆ | ★★★☆☆ |
| **LayoutEngine** | API 노출만 (최소 변경) | ★☆☆☆☆ | ★☆☆☆☆ |
| **WASM API** | Phase 1~4 API 추가 | ★★☆☆☆ | ★★☆☆☆ |

#### 핵심 설계: EditState 구조체
- `composed_cache`: 문단별 ComposedParagraph 캐시
- `measured_cache`: 문단별 MeasuredParagraph 캐시
- `pagination_cache`: 마지막 페이지네이션 결과
- `dirty_paragraphs`: 변경된 문단 집합
- `dirty_pages_from`: 재페이지네이션 시작점

#### 뷰어 호환성 보장
- 기존 API 시그니처 100% 유지
- 기존 내부 로직 경로 (compose_section → paginate → build_render_tree) 유지
- 신규 API는 별도 경로로 추가
- web/ 프론트엔드 코드 수정 불필요

#### 4단계 마이그레이션 순서
1. **Phase 1** (1주): 기반 구축 — 캐시 타입, EditState, Phase 1 API
2. **Phase 2** (2주): 증분 레이아웃 — 캐시 활용 compose/measure/paginate
3. **Phase 3** (1주): 커서/히트 테스팅 — 컨트롤 위치 수정, Phase 3 API
4. **Phase 4** (1~2주): 고급 기능 — 검색/치환, 필드/북마크, 전체 회귀 테스트

#### 테스트 전략
- 기존 cargo test 통과 필수
- 증분 결과 == 전체 결과 비교 검증
- 성능 벤치마크: 1000문단 문서 편집 < 16ms 목표

## 산출물

| 문서 | 경로 | 내용 |
|------|------|------|
| 설계서 Section 8 | `mydocs/plans/task_44_architecture.md` §8 | 명령 히스토리 (Command 패턴, 14개 명령, 연속 타이핑 묶기, IME 통합) |
| 설계서 Section 9 | `mydocs/plans/task_44_architecture.md` §9 | WASM 코어 확장 (현황 101개, 29개 추가, 4-Phase 로드맵) |
| 설계서 Section 10 | `mydocs/plans/task_44_architecture.md` §10 | 리팩터링 계획 (모듈별 상세, EditState, 마이그레이션, 호환성) |

## 설계서 전체 구조 완성

```
mydocs/plans/task_44_architecture.md (10개 섹션 완성)
├── §1. 현재 아키텍처 분석 (6개 모듈 심층, Gap 9개)          ← 단계 1
├── §2. rhwp-studio 프로젝트 구조 (디렉토리/빌드/WASM)      ← 단계 1
├── §3. 플로우 엔진 (TextFlow/BlockFlow/PageFlow)           ← 단계 2
├── §4. 증분 레이아웃 엔진 (dirty flag/캐시/성능 예산)       ← 단계 2
├── §5. 연속 스크롤 캔버스 뷰 (가상 스크롤/좌표 체계)       ← 단계 2
├── §6. 커서 모델 (CursorContext/이동 28+/히트 테스팅)       ← 단계 3
├── §7. 선택/입력 시스템 (선택 모델/IME/캐럿)               ← 단계 3
├── §8. 명령 히스토리 (Command 패턴/연속 타이핑/Undo-Redo)   ← 단계 4
├── §9. WASM 코어 확장 계획 (29개 신규 API/4-Phase)         ← 단계 4
└── §10. 기존 코드 리팩터링 계획 (모듈별/마이그레이션/테스트) ← 단계 4
```

## 전체 타스크 44 요약

**총 4단계** 설계 완료. 10개 섹션의 아키텍처 설계서가 완성되었다.

**핵심 설계 결정**:
1. TypeScript 편집 엔진 + Rust WASM 코어의 **이중 구조** 유지
2. **증분 레이아웃**: TextFlow(O(1)) → BlockFlow(조건부) → PageFlow(안정 페이지 중단)
3. **16ms 프레임 예산** 내 편집 응답 (실측 ~12ms)
4. **Command 패턴**: 14개 명령 유형, 연속 타이핑 300ms 묶기
5. **기존 코어 호환성 100%**: 모든 변경은 추가 기반, 기존 API 불변
6. **4-Phase 점진적 확장**: 기반(1주) → 증분(2주) → 커서(1주) → 고급(1~2주)
