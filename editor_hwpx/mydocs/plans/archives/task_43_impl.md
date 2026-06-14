# 타스크 43 구현 계획서: 한컴 웹기안기 대응 기능정의서

## 전략 방향: 마이그레이션 호환성

기존 한컴 웹기안기를 사용하는 공공기관이 rhwp로 전환할 때 **기존 개발된 소스코드의 변경을 최소화**하는 것이 핵심 전략이다.

이를 위한 두 가지 원칙:

1. **웹 편집기 형태 동일 구현** — 한컴 웹기안기와 동일한 편집기 UI/UX
2. **개발자 API 동일 구현** — HwpCtrl 호환 API (동일 메서드명, 파라미터, 동작)

```
[기존 공공기관 코드]                    [마이그레이션 후]
HwpCtrl.Open("doc.hwp")          →    HwpCtrl.Open("doc.hwp")        // 동일
HwpCtrl.PutFieldText("name", …)  →    HwpCtrl.PutFieldText("name", …) // 동일
HwpCtrl.SaveAs("out.hwp", "HWP") →    HwpCtrl.SaveAs("out.hwp", "HWP") // 동일

변경점: <script src="webhwpctrl.js">  →  <script src="rhwp.js">  // 로더만 교체
```

## 단계 구성 (3단계)

### 단계 1: 웹기안기 HwpCtrl API 전수 분류 + 호환 레이어 설계

**작업 내용**:
- 로컬 HwpCtrl API 문서 3종을 분석하여 전체 API를 기능 카테고리로 분류
- 각 API의 호환 구현 난이도 평가 (rhwp 내부 매핑 가능 여부)

**입력 자료**:
- `mydocs/manual/hwpctl/hwpctl_API_v2.4.md` — HwpCtrl Properties 11개, Methods 53개
- `mydocs/manual/hwpctl/hwpctl_Action_Table__v1.1.md` — Action ID 200+ 개
- `mydocs/manual/hwpctl/hwpctl_ParameterSetID_Item_v1.2.md` — ParameterSet 30+ 타입

**분류 기준**: 마이그레이션 시 필수 여부 + 기능 카테고리

| 카테고리 | HwpCtrl Methods | Action IDs | ParameterSet |
|----------|----------------|------------|-------------|
| 문서 관리 | Open, Clear, SaveAs | - | - |
| 텍스트 입출력 | GetText, GetTextBySet, GetPageText, GetTextFile, SetTextFile, Insert | InsertText | InsertText |
| 커서/위치 | GetPos, SetPos, GetPosBySet, SetPosBySet, MovePos, ShowCaret | Move* (40+) | ListParaPos |
| 선택/블록 | SelectText, GetSelectedPos, GetSelectedPosBySet | Select, SelectAll, MoveSel* (30+) | - |
| 글자 서식 | CharShape (property) | CharShape, CharShape* (20+) | CharShape |
| 문단 서식 | ParaShape (property) | ParagraphShape, ParagraphShape* (15+) | ParaShape |
| 표 조작 | GetTableCellAddr | TableCreate, TableInsert*, TableDelete*, TableMerge*, TableSplit* (30+) | TableCreation, Table, Cell 등 |
| 셀 서식 | CellShape (property) | CellBorder, CellFill, CellZone* | CellBorderFill |
| 필드 관리 | CreateField, FieldExist, GetFieldList, GetFieldText, PutFieldText, MoveToField, SetCurFieldName, GetCurFieldName, ModifyFieldProperties, RenameField | InsertFieldTemplate, ModifyFieldClickhere, DeleteField | InsertFieldTemplate |
| 이미지/객체 | InsertPicture, InsertBackgroundPicture, InsertCtrl, DeleteCtrl, CurSelectedCtrl, HeadCtrl, LastCtrl, ParentCtrl | PictureInsertDialog, ShapeObj* (20+), DrawObjCreator* | ShapeObject, DrawImageAttr 등 |
| 검색/치환 | InitScan, ReleaseScan, GetHeadingString | ForwardFind, BackwardFind, AllReplace, FindDlg, ReplaceDlg | FindReplace |
| 머리말/꼬리말 | - | HeaderFooter | HeaderFooter |
| 페이지 설정 | - | PageSetup, PageNumPos, PageHiding | SecDef, PageDef, PageNumPos |
| 배포/보안 | - | FileSetSecurity | FileSetSecurity |
| 인쇄/이미지 | PrintDocument, CreatePageImage, CreatePageImageEx | Print | - |
| UI 제어 | ShowToolBar, ShowStatusBar, ShowRibbon, FoldRibbon | - | - |
| 편집 제어 | EditMode, SelectionMode | Undo, Redo, Delete, DeleteBack, ToggleOverwrite | - |
| 메타데이터 | GetMetaTag, SetMetaTag, GetMetaTagAll | DocSummaryInfo, DocumentInfo | SummaryInfo, DocumentInfo |
| 뷰/줌 | - | ViewZoom* (3) | ViewProperties |
| 액션 시스템 | CreateAction, CreateSet, Run, ReplaceAction, LockCommand, IsCommandLock | - | - |
| 맞춤법 | IsSpellCheckCompleted | SpellingCheck | SpellingCheck |

**산출물**: 기능정의서 Section 1~2

### 단계 2: rhwp API 매핑 및 Gap 분석 (호환 레이어 관점)

**작업 내용**: rhwp의 현재 49개 WASM API를 웹기안기 API에 매핑하고, 호환 레이어 구현 관점에서 Gap 분석

**호환성 등급**:

| 등급 | 의미 | 마이그레이션 영향 |
|------|------|-----------------|
| A (직접 매핑) | rhwp에 동등 기능 존재, 래퍼만 작성 | 소스 변경 불필요 |
| B (변환 매핑) | rhwp에 유사 기능, 파라미터 변환 필요 | 소스 변경 불필요 (래퍼가 변환) |
| C (신규 구현) | rhwp에 해당 기능 없음, 내부 구현 필요 | 소스 변경 불필요 (구현 후) |
| D (아키텍처 차이) | 서버 의존 등 구조적 차이 | 소스 일부 변경 필요 |
| X (불필요) | UI 전용, 서버 전용 등 | 빈 함수/스텁으로 처리 |

**예시 매핑**:

```
[등급 A - 직접 매핑]
HwpCtrl.Open(path)           → rhwp.new(data)  + 파일 로드 래퍼
HwpCtrl.SaveAs(path, format) → rhwp.exportHwp() + 파일 저장 래퍼

[등급 B - 변환 매핑]
HwpCtrl.PutFieldText(field, text) → rhwp.insertText(sec, para, offset, text) 위치 변환
HwpCtrl.CharShape.TextColor       → rhwp.getCharPropertiesAt().color 형식 변환

[등급 C - 신규 구현]
HwpCtrl.CreateField()             → 필드 시스템 미구현 → 신규 개발 필요
HwpCtrl.Run("Undo")              → Undo/Redo 미구현 → 신규 개발 필요

[등급 X - 불필요]
HwpCtrl.ShowRibbon()             → rhwp는 자체 UI 제공 → 빈 함수
HwpCtrl.IsSpellCheckCompleted()  → 맞춤법 검사 미지원 → false 반환
```

**산출물**: 기능정의서 Section 3 — 전체 API 호환성 매핑표

### 단계 3: 우선순위 + 마이그레이션 로드맵 + 기능정의서 완성

**작업 내용**:
- 미구현 기능(등급 C)을 마이그레이션 필수도에 따라 우선순위 분류
- 공공기관 마이그레이션 시나리오별 필요 API 세트 정의
- rhwp 고유 강점 정리
- 기능정의서 최종 완성

**우선순위 기준 (마이그레이션 관점)**:

| 등급 | 기준 | 예시 |
|------|------|------|
| P0 (필수) | 공공기관 기안 시스템 핵심 | 필드 관리 (PutFieldText/GetFieldText), Undo/Redo, 검색/치환 |
| P1 (중요) | 문서 편집 고급 기능 | 이미지 삽입, 머리말/꼬리말, 페이지 번호, 배포 문서 |
| P2 (선택) | 부가 기능 | 그리기 도구, 맞춤법 검사, 문자표 |
| X (스텁) | 빈 함수로 처리 가능 | UI 제어, 서버 전용 기능 |

**마이그레이션 시나리오**:

| 시나리오 | 필요 API | 비율 |
|----------|---------|------|
| 기안문 자동 생성 | Open, PutFieldText, SaveAs, CreateField, FieldExist | 가장 빈번 |
| 문서 뷰어 | Open, CreatePageImage, PageCount | 단순 |
| 양식 편집 | 위 + CharShape, ParagraphShape, TableCreate | 중간 |
| 완전 편집기 | 전체 API | 드문 |

**산출물**: 기능정의서 Section 4~6

## 최종 산출물 구조

```
mydocs/plans/task_43_feature_def.md
├── 1. 개요 및 마이그레이션 전략
│     ├── 목표: 기존 소스 변경 최소화
│     ├── 호환 레이어 아키텍처
│     └── 편집기 UI 동일 구현 방향
├── 2. 웹기안기 HwpCtrl API 전수 분류표
│     ├── HwpCtrl Properties (11)
│     ├── HwpCtrl Methods (53)
│     ├── Action IDs (200+, 카테고리별)
│     └── ParameterSet Types (30+)
├── 3. rhwp vs 웹기안기 호환성 매핑표
│     ├── 등급 A: 직접 매핑
│     ├── 등급 B: 변환 매핑
│     ├── 등급 C: 신규 구현 필요
│     ├── 등급 D: 아키텍처 차이
│     └── 등급 X: 스텁 처리
├── 4. 미구현 기능 우선순위 (P0/P1/P2)
├── 5. 마이그레이션 시나리오별 필요 API
├── 6. rhwp 고유 강점 (웹기안기에 없는 기능)
└── 7. 호환 레이어 구현 로드맵
```
