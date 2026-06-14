# 타스크 44 수행계획서: 편집 엔진 아키텍처 설계

## 배경

타스크 43(웹기안기 대응 기능정의서)의 분석 결과, rhwp가 웹기안기를 대체하려면 현재의 뷰어 아키텍처에 **편집 엔진 레이어**를 추가해야 한다는 결론에 도달하였다.

현재 rhwp의 근본적 한계:
- **배치형 파이프라인**: 글자 하나 편집 시 구역 전체 재구성 + 전체 재페이지네이션
- **커서/선택 시스템 부재**: 좌표 기반 API만 존재, 대화형 편집 불가
- **텍스트/페이지 플로우 엔진 부재**: 증분 리플로우, 표 분할, 홀/과부 제어 등 미구현
- **단일 페이지 뷰**: 한 페이지씩 렌더링하는 방식. 한컴 웹기안기처럼 연속 스크롤 뷰(모든 페이지를 세로로 나열하고 스크롤) 미지원

## 프로젝트 분리 방침

편집기는 기존 뷰어(`web/`)와 별도의 서브 프로젝트로 진행한다.

| 프로젝트 | 디렉토리 | 용도 |
|----------|---------|------|
| rhwp 코어 | `src/` | Rust/WASM 파서, 문서 모델, 레이아웃 엔진 (공유) |
| rhwp 뷰어 | `web/` | 기존 뷰어/간이 편집기 (유지, 다른 용도 활용 가능) |
| **rhwp-studio** | `rhwp-studio/` | 웹기안기 대체 편집기 (신규) |

rhwp-studio는 rhwp 코어의 WASM 바이너리를 사용하되, 자체 편집 엔진과 UI를 가진다.

```
rhwp/
├── src/              ← Rust 코어 (파서, 모델, 렌더러, WASM API)
├── web/              ← 기존 뷰어 (유지)
├── rhwp-studio/      ← 웹기안기 대체 편집기 (신규)
│   ├── src/
│   │   ├── engine/   ← 편집 엔진 (TextFlow, PageFlow, 커서, Undo)
│   │   ├── view/     ← 연속 스크롤 캔버스 뷰
│   │   ├── compat/   ← HwpCtrl 호환 레이어
│   │   └── ui/       ← 편집기 UI (도구모음, 상태표시줄)
│   ├── index.html
│   └── package.json
└── pkg/              ← WASM 빌드 산출물 (공유)
```

## 목표

rhwp를 뷰어에서 편집기로 전환하기 위한 **편집 엔진 아키텍처 설계서**를 작성한다. 이 설계서는 rhwp-studio 구현의 청사진이 되며, 다음을 포함한다:

1. 현재 아키텍처 분석 및 재활용 가능 범위 식별
2. rhwp-studio 프로젝트 구조 설계
3. 편집 엔진 계층 구조 설계 (TextFlow, BlockFlow, PageFlow)
4. 증분 레이아웃 엔진 설계
5. 연속 스크롤 캔버스 뷰 설계 (가상 스크롤, 뷰포트 기반 렌더링)
6. 커서 모델 설계 (줄 단위 처리, 문단 컨트롤 판별)
7. 선택/입력 시스템 설계
8. 명령 히스토리(Undo/Redo) 설계
9. WASM 코어 확장 계획 (편집기에 필요한 신규 API)
10. 기존 코드 리팩터링 계획

## 분석 대상

### 현재 rhwp 레이아웃 파이프라인

| 모듈 | 파일 | 역할 |
|------|------|------|
| Composer | `src/renderer/composer.rs` | 문단→줄 분할, TextRun 생성 |
| HeightMeasurer | `src/renderer/height_measurer.rs` | 콘텐츠 높이 측정 |
| Paginator | `src/renderer/pagination.rs` | 페이지 분할 |
| LayoutEngine | `src/renderer/layout.rs` | 좌표 계산, RenderTree 생성 |
| RenderTree | `src/renderer/render_tree.rs` | 렌더링 트리 |
| WASM API | `src/wasm_api.rs` | 편집 API + 리플로우/재페이지네이션 |

### HWP 문서 모델의 커서 관련 핵심 구조

커서는 줄(LineSeg) 단위로 동작하며, 줄의 내용이 텍스트인지 컨트롤인지에 따라 동작이 완전히 달라진다:

| 제어문자 | Control 종류 | 커서 동작 |
|---------|-------------|----------|
| DrawTableObject (`\u{0002}`) | Table, Picture, Shape | 컨트롤 선택/내부 진입 |
| SectionColumnDef | SectionDef, ColumnDef | 투명 통과 |
| FieldBegin/End | Field (누름틀) | 필드 내부 진입/편집 |
| FootnoteEndnote | Footnote, Endnote | 각주 영역 진입 |
| HeaderFooter | Header, Footer | 머리말/꼬리말 영역 진입 |
| 일반 문자 | - | 텍스트 편집 (삽입/삭제/이동) |

### 참조 아키텍처

- 한컴 웹기안기 HwpCtrl 커서 기반 편집 모델
- 타스크 43 기능정의서 (`mydocs/plans/task_43_feature_def.md`)

## 워크플로우

1. 수행계획서 작성 → 승인
2. 구현 계획서 작성 (단계 구성) → 승인
3. 단계별 설계서 작성 + 완료보고서 → 승인
4. 최종 결과보고서

## 산출물

| 문서 | 경로 |
|------|------|
| 수행계획서 | `mydocs/plans/task_44.md` |
| 구현 계획서 | `mydocs/plans/task_44_impl.md` |
| 편집 엔진 아키텍처 설계서 | `mydocs/plans/task_44_architecture.md` |
| 단계별 완료보고서 | `mydocs/working/task_44_step{N}.md` |
| 최종 결과보고서 | `mydocs/report/task_44_final.md` |
